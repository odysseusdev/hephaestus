import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CanonicalContent } from "../src/core/loader.js";
import type { ProvisionSelection } from "../src/core/provision.js";
import type { CanonicalAgent, CanonicalSkill } from "../src/core/schema.js";

// Capture the arguments `runTemper` passes to `readLockfile` (in particular
// the `onMigrateStart`/`onMigrateComplete` callbacks) while still delegating
// to the real implementation, so these tests can prove the command *wires up*
// the migration notice correctly without needing a real registered migration
// to exist yet.
const readLockfileArgsSpy = vi.hoisted(() => vi.fn());

vi.mock("../src/core/lockfile.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/lockfile.js")>();
  return {
    ...actual,
    readLockfile: (async (
      projectRoot: string,
      onMigrateStart?: (fromVersion: number, toVersion: number) => void,
      onMigrateComplete?: (fromVersion: number, toVersion: number) => void,
    ) => {
      readLockfileArgsSpy(projectRoot, onMigrateStart, onMigrateComplete);
      return actual.readLockfile(projectRoot, onMigrateStart, onMigrateComplete);
    }) as typeof actual.readLockfile,
  };
});

const noteMock = vi.hoisted(() => vi.fn());

vi.mock("../src/ui/prompts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/prompts.js")>();
  return { ...actual, note: noteMock, intro: vi.fn(), outro: vi.fn() };
});

const { runTemper } = await import("../src/commands/temper.js");
const { LOCKFILE_NAME, writeLockfile, readLockfile } = await import("../src/core/lockfile.js");
const { buildLockfile, renderAll } = await import("../src/core/provision.js");
const { ensureOutputDir, writeOutputs } = await import("../src/core/writer.js");
const { ENGINE_VERSION } = await import("../src/core/version.js");

/** minimal skill with one content file, used to exercise drift. */
const SKILL: CanonicalSkill = {
  name: "typescript",
  dir: "/fake/skills/typescript",
  contentFiles: [
    {
      filename: "conventions.md",
      contents:
        "---\ndescription: TypeScript conventions\n---\n\n# typescript\n\nuse strict mode.\n",
    },
  ],
  bundledFiles: [],
};

/** minimal agent that references the skill above. */
const AGENT: CanonicalAgent = {
  id: "planner",
  name: "planner",
  summary: "plans work",
  description: "plans work for a given feature",
  tier: "fast",
  tools: ["read"],
  skills: ["typescript"],
  body: "## role\n\nyou plan work. write output to {{output}}/plan.md.\n\n## your skills\n\n{{skills}}\n",
  sourcePath: "/fake/agents/planner.md",
};

const CONTENT: CanonicalContent = {
  agents: new Map([["planner", AGENT]]),
  skills: new Map([["typescript", SKILL]]),
};

const SELECTION: ProvisionSelection = {
  agentIds: ["planner"],
  harnesses: ["claude"],
  outputDir: "docs",
};

const SKILL_FILE = ".claude/skills/typescript/conventions.md";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "heph-temper-"));
  noteMock.mockClear();
  readLockfileArgsSpy.mockClear();
  process.exitCode = undefined;
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
  process.exitCode = undefined;
});

/** provision `planner` into `projectRoot` exactly as `forge` would. */
async function provision(): Promise<void> {
  const outputs = renderAll(CONTENT, SELECTION);
  await writeOutputs(projectRoot, outputs);
  await ensureOutputDir(projectRoot, SELECTION.outputDir);
  await writeLockfile(projectRoot, buildLockfile(CONTENT, outputs, SELECTION, ENGINE_VERSION));
}

/** tamper the recorded lock hash for typescript/conventions.md (simulate upstream change). */
async function staleLockForSkill(): Promise<void> {
  const lockfile = (await readLockfile(projectRoot))!;
  lockfile.skills.typescript!.outputs.claude!.files!["conventions.md"] = "sha256:stale";
  await writeLockfile(projectRoot, lockfile);
}

describe("runTemper — lockfile migration notice wiring", () => {
  it("passes onMigrateStart and onMigrateComplete callbacks to readLockfile", async () => {
    await runTemper({ dir: projectRoot });

    expect(readLockfileArgsSpy).toHaveBeenCalledTimes(1);
    const [, onMigrateStart, onMigrateComplete] = readLockfileArgsSpy.mock.calls[0]!;
    expect(typeof onMigrateStart).toBe("function");
    expect(typeof onMigrateComplete).toBe("function");
  });

  it("the wired callbacks print themed migration notes naming the from/to versions", async () => {
    await runTemper({ dir: projectRoot });

    const [, onMigrateStart, onMigrateComplete] = readLockfileArgsSpy.mock.calls[0]!;
    noteMock.mockClear();

    (onMigrateStart as (from: number, to: number) => void)(1, 2);

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining(LOCKFILE_NAME),
      "migrating lockfile",
    );
    const [startMessage] = noteMock.mock.calls[0]!;
    expect(String(startMessage)).toContain("v1");
    expect(String(startMessage)).toContain("v2");

    noteMock.mockClear();

    (onMigrateComplete as (from: number, to: number) => void)(1, 2);

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining(LOCKFILE_NAME),
      "migration complete",
    );
    const [completeMessage] = noteMock.mock.calls[0]!;
    expect(String(completeMessage)).toContain("v2");
  });
});

describe("runTemper — exit code on drift", () => {
  it("sets process.exitCode to 1 when drift is left unresolved (strategy: cancel)", async () => {
    await provision();
    await writeFile(join(projectRoot, SKILL_FILE), "DRIFTED\n", "utf8");
    await staleLockForSkill();

    await runTemper({ dir: projectRoot, strategy: "cancel" }, CONTENT);

    expect(process.exitCode).toBe(1);
  });

  it("leaves process.exitCode unset for a clean run with no drift", async () => {
    await provision();

    await runTemper({ dir: projectRoot }, CONTENT);

    expect(process.exitCode).toBeUndefined();
  });

  it("leaves process.exitCode unset when drift is fully resolved (strategy: overwrite)", async () => {
    await provision();
    await writeFile(join(projectRoot, SKILL_FILE), "DRIFTED\n", "utf8");
    await staleLockForSkill();

    await runTemper({ dir: projectRoot, strategy: "overwrite" }, CONTENT);

    expect(process.exitCode).toBeUndefined();
  });
});
