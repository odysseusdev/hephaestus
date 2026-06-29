import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/core/config.js";
import { CanonicalLoadError, loadCanonical } from "../src/core/loader.js";
import type { EngineConfig } from "../src/core/schema.js";

describe("loadCanonical — real fixtures", () => {
  it("loads agents and skills from the examples directory", async () => {
    const content = await loadCanonical(loadConfig());

    expect(content.agents.size).toBeGreaterThan(0);
    expect(content.skills.size).toBeGreaterThan(0);

    // Spot-check that a loaded agent has the required shape.
    const [, firstAgent] = [...content.agents.entries()][0]!;
    expect(firstAgent.id).toBeTruthy();
    expect(["fast", "balanced", "flagship"]).toContain(firstAgent.tier);
  });
});

describe("loadCanonical — validation failures", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "heph-loader-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function config(): EngineConfig {
    return { contentDir: dir, defaultHandoffDir: "docs" };
  }

  async function writeAgent(id: string, body: string): Promise<void> {
    await mkdir(join(dir, "agents"), { recursive: true });
    await writeFile(join(dir, "agents", `${id}.md`), body, "utf8");
  }

  async function writeSkill(
    folder: string,
    contentFiles: Array<{ name: string; body: string }> = [
      { name: "conventions.md", body: "---\ndescription: d\n---\n\nbody\n" },
    ],
  ): Promise<void> {
    await mkdir(join(dir, "skills", folder), { recursive: true });
    for (const file of contentFiles) {
      await writeFile(join(dir, "skills", folder, file.name), file.body, "utf8");
    }
  }

  it("rejects an agent referencing an unknown skill", async () => {
    await writeAgent(
      "planner",
      `---\nid: planner\nname: Planner\ndescription: d\ntier: fast\nskills: [ghost]\n---\n\nbody {{skills}}\n`,
    );
    await expect(loadCanonical(config())).rejects.toBeInstanceOf(CanonicalLoadError);
    await expect(loadCanonical(config())).rejects.toThrow(/unknown skill "ghost"/);
  });

  it("rejects an unknown template token", async () => {
    await writeAgent(
      "planner",
      `---\nid: planner\nname: Planner\ndescription: d\ntier: fast\n---\n\nbody {{handoff.inputs}}\n`,
    );
    await expect(loadCanonical(config())).rejects.toThrow(/unknown template token/);
  });

  it("rejects a file name that does not match the frontmatter id", async () => {
    await writeAgent(
      "planner",
      `---\nid: not-planner\nname: Planner\ndescription: d\ntier: fast\n---\n\nbody\n`,
    );
    await expect(loadCanonical(config())).rejects.toThrow(/does not match frontmatter id/);
  });

  it("rejects missing required frontmatter", async () => {
    await writeAgent("planner", `---\nid: planner\nname: Planner\n---\n\nbody\n`);
    await expect(loadCanonical(config())).rejects.toThrow(/tier/);
  });

  it("rejects content with no agents", async () => {
    await writeSkill("typescript");
    await expect(loadCanonical(config())).rejects.toThrow(/no agents found/);
  });
});
