import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runQuench } from "../src/commands/quench.js";
import { LOCKFILE_NAME, writeLockfile } from "../src/core/lockfile.js";
import { buildLockfile, renderAll, type ProvisionSelection } from "../src/core/provision.js";
import type { CanonicalAgent, CanonicalSkill } from "../src/core/schema.js";
import { ENGINE_VERSION } from "../src/core/version.js";
import { ensureOutputDir, writeOutputs } from "../src/core/writer.js";
import type { CanonicalContent } from "../src/core/loader.js";

// Drive `confirm()` programmatically instead of needing a real TTY.
const confirmMock = vi.hoisted(() => vi.fn());
const noteMock = vi.hoisted(() => vi.fn());

vi.mock("../src/ui/prompts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/prompts.js")>();
  return { ...actual, confirm: confirmMock, note: noteMock, outro: vi.fn(), intro: vi.fn() };
});

// Capture the `onMigrateStart`/`onMigrateComplete` callbacks `runQuench`
// passes to `readLockfile`, while still delegating to the real implementation
// — proves the wiring without needing a real registered migration to exist
// yet.
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

/** Minimal skill with one content file, matching the integration test fixtures. */
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

const AGENT_FILE = ".claude/agents/planner.md";
const SKILL_FILE = ".claude/skills/typescript/conventions.md";
const LOCKFILE_PATH = "hephaestus.lock.yaml";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "heph-quench-"));
  confirmMock.mockReset();
  noteMock.mockClear();
  readLockfileArgsSpy.mockClear();
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

/** Provision the fixture agent + skill into `projectRoot`, exactly as `forge` would. */
async function provision(): Promise<void> {
  const outputs = renderAll(CONTENT, SELECTION);
  await writeOutputs(projectRoot, outputs);
  await ensureOutputDir(projectRoot, SELECTION.outputDir);
  await writeLockfile(projectRoot, buildLockfile(CONTENT, outputs, SELECTION, ENGINE_VERSION));
}

async function exists(relativePath: string): Promise<boolean> {
  try {
    await stat(join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("runQuench", () => {
  it("does nothing and never prompts when there is no lockfile", async () => {
    await runQuench({ dir: projectRoot, force: false });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("removes nothing when the user declines the initial confirmation", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(false);

    await runQuench({ dir: projectRoot, force: false });

    expect(await exists(AGENT_FILE)).toBe(true);
    expect(await exists(LOCKFILE_PATH)).toBe(true);
  });

  it("removes provisioned files and the lockfile, keeping the output dir by default", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runQuench({ dir: projectRoot, force: false });

    expect(await exists(AGENT_FILE)).toBe(false);
    expect(await exists(SKILL_FILE)).toBe(false);
    expect(await exists(LOCKFILE_PATH)).toBe(false);
    expect(await exists("docs")).toBe(true);
  });

  it("also removes the output directory when confirmed", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await runQuench({ dir: projectRoot, force: false });

    expect(await exists("docs")).toBe(false);
  });

  it("prunes the now-empty skill directory after removing its files", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runQuench({ dir: projectRoot, force: false });

    await expect(readdir(join(projectRoot, ".claude/skills/typescript"))).rejects.toThrow();
  });

  it("--force skips both confirmations: deletes files without prompting, and leaves the output dir untouched", async () => {
    await provision();

    await runQuench({ dir: projectRoot, force: true });

    expect(confirmMock).not.toHaveBeenCalled();
    expect(await exists(AGENT_FILE)).toBe(false);
    expect(await exists(SKILL_FILE)).toBe(false);
    expect(await exists(LOCKFILE_PATH)).toBe(false);
    expect(await exists("docs")).toBe(true);
  });

  it("prints the irreversible warning note on every run, force or not", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runQuench({ dir: projectRoot, force: false });

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining("this cannot be undone"),
      "irreversible",
    );

    noteMock.mockClear();
    await provision();
    await runQuench({ dir: projectRoot, force: true });

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining("this cannot be undone"),
      "irreversible",
    );
  });

  it("wires onMigrateStart/onMigrateComplete callbacks to readLockfile that print themed migration notes", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runQuench({ dir: projectRoot, force: false });

    expect(readLockfileArgsSpy).toHaveBeenCalledTimes(1);
    const [, onMigrateStart, onMigrateComplete] = readLockfileArgsSpy.mock.calls[0]!;
    expect(typeof onMigrateStart).toBe("function");
    expect(typeof onMigrateComplete).toBe("function");

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
