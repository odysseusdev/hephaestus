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
    return { contentDir: dir, defaultOutputDir: "docs" };
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
      `---\nid: planner\nname: Planner\nsummary: s\ndescription: d\ntier: fast\nskills: [ghost]\n---\n\nbody {{skills}}\n`,
    );
    await expect(loadCanonical(config())).rejects.toBeInstanceOf(CanonicalLoadError);
    await expect(loadCanonical(config())).rejects.toThrow(/unknown skill "ghost"/);
  });

  it("loads an agent body containing an unknown template token unchanged", async () => {
    await writeAgent(
      "planner",
      `---\nid: planner\nname: Planner\nsummary: s\ndescription: d\ntier: fast\n---\n\nbody {{handoff.inputs}}\n`,
    );
    const content = await loadCanonical(config());
    const agent = content.agents.get("planner");
    expect(agent).toBeDefined();
    expect(agent?.body).toContain("{{handoff.inputs}}");
  });

  it("rejects a file name that does not match the frontmatter id", async () => {
    await writeAgent(
      "planner",
      `---\nid: not-planner\nname: Planner\nsummary: s\ndescription: d\ntier: fast\n---\n\nbody\n`,
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

  it("loads an agent with no category frontmatter", async () => {
    await writeAgent(
      "planner",
      `---\nid: planner\nname: Planner\nsummary: s\ndescription: d\ntier: fast\n---\n\nbody\n`,
    );
    const content = await loadCanonical(config());
    const agent = content.agents.get("planner");
    expect(agent).toBeDefined();
    expect(agent?.category).toBeUndefined();
    expect(agent?.summary).toBe("s");
  });

  it("rejects an agent with no summary frontmatter", async () => {
    await writeAgent(
      "planner",
      `---\nid: planner\nname: Planner\ndescription: d\ntier: fast\n---\n\nbody\n`,
    );
    await expect(loadCanonical(config())).rejects.toThrow(/summary/);
  });

  it("rejects a summary over 80 characters", async () => {
    const overlongSummary = "s".repeat(81);
    await writeAgent(
      "planner",
      `---\nid: planner\nname: Planner\ndescription: d\ntier: fast\nsummary: "${overlongSummary}"\n---\n\nbody\n`,
    );
    await expect(loadCanonical(config())).rejects.toThrow();
  });

  it("loads a binary bundled skill resource without corrupting its bytes", async () => {
    await writeAgent(
      "planner",
      `---\nid: planner\nname: Planner\nsummary: s\ndescription: d\ntier: fast\nskills: [typescript]\n---\n\nbody {{skills}}\n`,
    );
    await writeSkill("typescript");

    // Bytes that are not valid UTF-8 on their own (a lone continuation byte,
    // 0x00, and 0xff) — a UTF-8 decode/encode round-trip would corrupt these.
    const binaryBytes = Buffer.from([0x00, 0x80, 0xff, 0x10, 0xfe]);
    await writeFile(join(dir, "skills", "typescript", "logo.png"), binaryBytes);

    const content = await loadCanonical(config());
    const skill = content.skills.get("typescript");

    expect(skill?.bundledFiles).toHaveLength(1);
    expect(skill?.bundledFiles[0]?.path).toBe("logo.png");
    expect(Buffer.from(skill?.bundledFiles[0]?.contents ?? [])).toEqual(binaryBytes);
  });
});
