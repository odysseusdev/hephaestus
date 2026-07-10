import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runQuench } from "../src/commands/quench.js";
import { writeLockfile } from "../src/core/lockfile.js";
import { buildLockfile, renderAll, type ProvisionSelection } from "../src/core/provision.js";
import type { CanonicalAgent, CanonicalSkill } from "../src/core/schema.js";
import { ENGINE_VERSION } from "../src/core/version.js";
import { ensureOutputDir, writeOutputs } from "../src/core/writer.js";
import type { CanonicalContent } from "../src/core/loader.js";

// Drive `confirm()` programmatically instead of needing a real TTY.
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("../src/ui/prompts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/prompts.js")>();
  return { ...actual, confirm: confirmMock, note: vi.fn(), outro: vi.fn(), intro: vi.fn() };
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
    await runQuench({ dir: projectRoot });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("removes nothing when the user declines the initial confirmation", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(false);

    await runQuench({ dir: projectRoot });

    expect(await exists(AGENT_FILE)).toBe(true);
    expect(await exists(LOCKFILE_PATH)).toBe(true);
  });

  it("removes provisioned files and the lockfile, keeping the output dir by default", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runQuench({ dir: projectRoot });

    expect(await exists(AGENT_FILE)).toBe(false);
    expect(await exists(SKILL_FILE)).toBe(false);
    expect(await exists(LOCKFILE_PATH)).toBe(false);
    expect(await exists("docs")).toBe(true);
  });

  it("also removes the output directory when confirmed", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await runQuench({ dir: projectRoot });

    expect(await exists("docs")).toBe(false);
  });

  it("prunes the now-empty skill directory after removing its files", async () => {
    await provision();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runQuench({ dir: projectRoot });

    await expect(readdir(join(projectRoot, ".claude/skills/typescript"))).rejects.toThrow();
  });
});
