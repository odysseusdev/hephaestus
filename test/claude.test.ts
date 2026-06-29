import matter from "gray-matter";
import { describe, expect, it } from "vitest";

import type { CanonicalAgent, CanonicalSkill } from "../src/core/schema.js";
import { ClaudeHarness } from "../src/harnesses/claude.js";
import type { RenderContext } from "../src/harnesses/types.js";

const harness = new ClaudeHarness();

const ctx = (tier: RenderContext["tier"]): RenderContext => ({
  harnessId: "claude",
  handoffDir: "docs",
  tier,
});

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

const skills: Map<string, CanonicalSkill> = new Map([["typescript", SKILL]]);

describe("ClaudeHarness — agent transpile", () => {
  it("writes to .claude/agents/<id>.md with correct frontmatter", () => {
    const rendered = harness.renderAgent(AGENT, ctx("fast"), skills);

    expect(rendered.path).toBe(".claude/agents/planner.md");

    const parsed = matter(rendered.contents);
    expect(parsed.data.name).toBe("planner");
    expect(parsed.data.model).toBe("haiku");
    expect(parsed.data.tools).toBe("Read");
  });

  it("maps tiers to concrete models (flagship -> opus)", () => {
    const flagship: CanonicalAgent = { ...AGENT, tier: "flagship" };
    const rendered = harness.renderAgent(flagship, ctx("flagship"), skills);
    expect(matter(rendered.contents).data.model).toBe("opus");
  });

  it("lets a per-harness modelOverride win over the tier map", () => {
    const overridden: CanonicalAgent = { ...AGENT, modelOverrides: { claude: "claude-custom-9" } };
    const rendered = harness.renderAgent(overridden, ctx("fast"), skills);
    expect(matter(rendered.contents).data.model).toBe("claude-custom-9");
  });

  it("expands handoff tokens and leaves no raw tokens", () => {
    const body = matter(harness.renderAgent(AGENT, ctx("fast"), skills).contents).content;
    expect(body).toContain("docs/plan.md");
    expect(body).not.toMatch(/\{\{/);
  });

  it("renders skill links as a markdown table relative to the agent file", () => {
    const body = matter(harness.renderAgent(AGENT, ctx("fast"), skills).contents).content;
    expect(body).toContain("| Skill | Reference |");
    expect(body).toContain("| typescript |");
    expect(body).toContain("[conventions](../skills/typescript/conventions.md)");
  });
});

describe("ClaudeHarness — skill transpile", () => {
  it("writes content files to .claude/skills/<name>/ passing frontmatter through unchanged", () => {
    const files = harness.renderSkill(SKILL);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe(".claude/skills/typescript/conventions.md");

    const parsed = matter(files[0]!.contents);
    expect(parsed.data.description).toBe("TypeScript conventions");
    expect(parsed.content).toContain("# typescript");
  });
});
