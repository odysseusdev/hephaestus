import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readLockfile, writeLockfile, type Lockfile } from "../src/core/lockfile.js";
import { buildLockfile, renderAll, type ProvisionSelection } from "../src/core/provision.js";
import type { CanonicalAgent, CanonicalSkill } from "../src/core/schema.js";
import { ENGINE_VERSION } from "../src/core/version.js";
import { ensureHandoffDir, writeOutputs } from "../src/core/writer.js";
import { runTemper } from "../src/commands/temper.js";
import type { CanonicalContent } from "../src/core/loader.js";

/** Minimal skill with one content file. */
const SKILL: CanonicalSkill = {
  name: "typescript",
  dir: "/fake/skills/typescript",
  contentFiles: [
    {
      filename: "conventions.md",
      contents: "---\ndescription: TypeScript conventions\n---\n\n# typescript\n\nuse strict mode.\n",
    },
  ],
  bundledFiles: [],
};

/** Minimal agent that references the skill above. */
const AGENT: CanonicalAgent = {
  id: "planner",
  name: "planner",
  description: "plans work for a given feature",
  tier: "fast",
  tools: ["read"],
  skills: ["typescript"],
  body: "## role\n\nyou plan work. write output to {{handoff.dir}}/plan.md.\n\n## your skills\n\n{{skills}}\n",
  sourcePath: "/fake/agents/planner.md",
};

const CONTENT: CanonicalContent = {
  agents: new Map([["planner", AGENT]]),
  skills: new Map([["typescript", SKILL]]),
};

const SELECTION: ProvisionSelection = {
  agentIds: ["planner"],
  harnesses: ["claude"],
  handoffDir: "docs",
};

const SKILL_FILE = ".claude/skills/typescript/conventions.md";

let projectRoot: string;

/** Simulate a non-interactive `init`: render, write files, create docs, lock. */
async function provision(): Promise<void> {
  const outputs = renderAll(CONTENT, SELECTION);
  await writeOutputs(projectRoot, outputs);
  await ensureHandoffDir(projectRoot, SELECTION.handoffDir);
  await writeLockfile(projectRoot, buildLockfile(CONTENT, outputs, SELECTION, ENGINE_VERSION));
}

/** Tamper the recorded lock hash for typescript/conventions.md (simulate upstream change). */
async function staleLockForSkill(): Promise<void> {
  const lockfile: Lockfile = (await readLockfile(projectRoot))!;
  lockfile.skills.typescript!.outputs.claude!.files!["conventions.md"] = "sha256:stale";
  await writeLockfile(projectRoot, lockfile);
}

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "heph-int-"));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("provision (init write path)", () => {
  it("writes valid agent + skill files with no raw tokens and correct links", async () => {
    await provision();

    const agent = await readFile(join(projectRoot, ".claude/agents/planner.md"), "utf8");
    expect(agent).not.toMatch(/\{\{/);
    expect(agent).toContain("docs/");
    expect(agent).toContain("| typescript |");
    expect(agent).toContain("[conventions](../skills/typescript/conventions.md)");

    const skill = await readFile(join(projectRoot, SKILL_FILE), "utf8");
    expect(skill).toContain("# typescript");
  });

  it("creates an empty handoff dir and no handoff files at provision time", async () => {
    await provision();

    const docsStat = await stat(join(projectRoot, "docs"));
    expect(docsStat.isDirectory()).toBe(true);
    expect(await readdir(join(projectRoot, "docs"))).toEqual([]);
  });

  it("writes a lockfile that round-trips and records the handoff dir", async () => {
    await provision();
    const lockfile = await readLockfile(projectRoot);
    expect(lockfile?.handoffDir).toBe("docs");
    expect(lockfile?.harnesses).toEqual(["claude"]);
    expect(Object.keys(lockfile?.agents ?? {})).toContain("planner");
  });
});

describe("sync", () => {
  it("a clean sync leaves files and lockfile untouched", async () => {
    await provision();
    const before = await readFile(join(projectRoot, SKILL_FILE), "utf8");
    const lockBefore = JSON.stringify(await readLockfile(projectRoot));

    await runTemper({ dir: projectRoot, dryRun: false }, CONTENT);

    expect(await readFile(join(projectRoot, SKILL_FILE), "utf8")).toBe(before);
    expect(JSON.stringify(await readLockfile(projectRoot))).toBe(lockBefore);
  });

  it("preserves a user edit when upstream is unchanged (keep)", async () => {
    await provision();
    const edited = "EDITED BY USER\n";
    await writeFile(join(projectRoot, SKILL_FILE), edited, "utf8");

    await runTemper({ dir: projectRoot, dryRun: false }, CONTENT);

    expect(await readFile(join(projectRoot, SKILL_FILE), "utf8")).toBe(edited);
  });

  it("re-provisions a deleted file (create)", async () => {
    await provision();
    await rm(join(projectRoot, SKILL_FILE), { force: true });

    await runTemper({ dir: projectRoot, dryRun: false }, CONTENT);

    expect(await readFile(join(projectRoot, SKILL_FILE), "utf8")).toContain("# typescript");
  });

  it("drift + --strategy overwrite restores the source and advances the lock", async () => {
    await provision();
    await writeFile(join(projectRoot, SKILL_FILE), "DRIFTED\n", "utf8");
    await staleLockForSkill();

    await runTemper({ dir: projectRoot, dryRun: false, strategy: "overwrite" }, CONTENT);

    const after = await readFile(join(projectRoot, SKILL_FILE), "utf8");
    expect(after).toContain("# typescript");
    const lockfile = await readLockfile(projectRoot);
    expect(lockfile?.skills.typescript?.outputs.claude?.files?.["conventions.md"]).not.toBe(
      "sha256:stale",
    );
  });

  it("drift + --dry-run reports but writes nothing and does not advance the lock", async () => {
    await provision();
    await writeFile(join(projectRoot, SKILL_FILE), "DRIFTED\n", "utf8");
    await staleLockForSkill();

    await runTemper({ dir: projectRoot, dryRun: true, strategy: "overwrite" }, CONTENT);

    expect(await readFile(join(projectRoot, SKILL_FILE), "utf8")).toBe("DRIFTED\n");
    const lockfile = await readLockfile(projectRoot);
    expect(lockfile?.skills.typescript?.outputs.claude?.files?.["conventions.md"]).toBe(
      "sha256:stale",
    );
  });

  it("drift + --strategy cancel keeps the user version and stays flagged", async () => {
    await provision();
    await writeFile(join(projectRoot, SKILL_FILE), "DRIFTED\n", "utf8");
    await staleLockForSkill();

    await runTemper({ dir: projectRoot, dryRun: false, strategy: "cancel" }, CONTENT);

    expect(await readFile(join(projectRoot, SKILL_FILE), "utf8")).toBe("DRIFTED\n");
    const lockfile = await readLockfile(projectRoot);
    expect(lockfile?.skills.typescript?.outputs.claude?.files?.["conventions.md"]).toBe(
      "sha256:stale",
    );
  });
});
