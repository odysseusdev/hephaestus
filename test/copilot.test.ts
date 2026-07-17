import matter, { type GrayMatterFile } from "gray-matter";
import { describe, expect, it, vi } from "vitest";

import type { CanonicalAgent, CanonicalSkill } from "../src/core/schema.js";
import { CopilotHarness } from "../src/harnesses/copilot.js";
import type { RenderContext, RenderedFile } from "../src/harnesses/types.js";

const harness = new CopilotHarness();

/**
 * Parse a rendered file's frontmatter. Agent and skill content files rendered
 * by the Copilot harness are always UTF-8 text (only binary bundled skill
 * resources are raw bytes), so this narrows the union for test convenience.
 */
function parseMatter(file: RenderedFile): GrayMatterFile<string> {
  if (typeof file.contents !== "string") {
    throw new Error(`expected text contents for ${file.path}, got binary`);
  }
  return matter(file.contents);
}

const ctx = (tier: RenderContext["tier"]): RenderContext => ({
  harnessId: "copilot",
  outputDir: "docs",
  tier,
});

/** Minimal skill with one content file. */
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

/** Minimal agent that references the skill above. */
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

const skills: Map<string, CanonicalSkill> = new Map([["typescript", SKILL]]);

describe("CopilotHarness — agent transpile", () => {
  it("writes to .github/agents/<id>.agent.md with correct frontmatter", () => {
    const rendered = harness.renderAgent(AGENT, ctx("fast"), skills);

    expect(rendered.path).toBe(".github/agents/planner.agent.md");

    const parsed = parseMatter(rendered);
    expect(parsed.data.name).toBe("planner");
    expect(parsed.data.description).toBe("plans work for a given feature");
    expect(parsed.data.model).toBe("Claude Haiku 4.5");
    expect(parsed.data.tools).toBe("read");
  });

  it("maps tiers to concrete models (flagship -> Claude Opus 4.6)", () => {
    const flagship: CanonicalAgent = { ...AGENT, tier: "flagship" };
    const rendered = harness.renderAgent(flagship, ctx("flagship"), skills);
    expect(parseMatter(rendered).data.model).toBe("Claude Opus 4.6");
  });

  it("lets a per-harness modelOverride win over the tier map", () => {
    const overridden: CanonicalAgent = {
      ...AGENT,
      modelOverrides: { copilot: "GPT-5.6 Sol" },
    };
    const rendered = harness.renderAgent(overridden, ctx("fast"), skills);
    expect(parseMatter(rendered).data.model).toBe("GPT-5.6 Sol");
  });

  it("never emits model as an array, even when only one tool/model is set", () => {
    const rendered = harness.renderAgent(AGENT, ctx("fast"), skills);
    const model: unknown = parseMatter(rendered).data.model;
    expect(typeof model).toBe("string");
    expect(Array.isArray(model)).toBe(false);
  });

  it("never emits VS Code-only fields", () => {
    const rendered = harness.renderAgent(AGENT, ctx("fast"), skills);
    const data = parseMatter(rendered).data;
    expect(data).not.toHaveProperty("argument-hint");
    expect(data).not.toHaveProperty("handoffs");
    expect(data).not.toHaveProperty("agents");
    expect(data).not.toHaveProperty("hooks");
  });

  it("expands output tokens and leaves no raw tokens", () => {
    const body = parseMatter(harness.renderAgent(AGENT, ctx("fast"), skills)).content;
    expect(body).toContain("docs/plan.md");
    expect(body).not.toMatch(/\{\{/);
  });

  it("renders skill links as a markdown table relative to the agent file", () => {
    const body = parseMatter(harness.renderAgent(AGENT, ctx("fast"), skills)).content;
    expect(body).toContain("| Skill | Reference |");
    expect(body).toContain("| typescript |");
    expect(body).toContain("[conventions](../skills/typescript/conventions.md)");
  });

  it("renders a placeholder when an agent has no skills", () => {
    const noSkillsAgent: CanonicalAgent = { ...AGENT, skills: [] };
    const body = parseMatter(harness.renderAgent(noSkillsAgent, ctx("fast"), skills)).content;
    expect(body).toContain("_No skills are configured for this agent._");
  });
});

describe("CopilotHarness — tool mapping", () => {
  it("maps write and edit to the single edit alias, de-duplicated", () => {
    const agent: CanonicalAgent = { ...AGENT, tools: ["write", "edit"] };
    const rendered = harness.renderAgent(agent, ctx("fast"), skills);
    expect(parseMatter(rendered).data.tools).toBe("edit");
  });

  it("maps websearch and webfetch to the single web alias, de-duplicated", () => {
    const agent: CanonicalAgent = { ...AGENT, tools: ["websearch", "webfetch"] };
    const rendered = harness.renderAgent(agent, ctx("fast"), skills);
    expect(parseMatter(rendered).data.tools).toBe("web");
  });

  it("maps search and execute to search and execute", () => {
    const agent: CanonicalAgent = { ...AGENT, tools: ["search", "execute"] };
    const rendered = harness.renderAgent(agent, ctx("fast"), skills);
    expect(parseMatter(rendered).data.tools).toBe("search, execute");
  });

  it("warns to stderr and does not throw on an unrecognised tool", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const agent: CanonicalAgent = { ...AGENT, tools: ["not-a-real-tool"] };

    expect(() => harness.renderAgent(agent, ctx("fast"), skills)).not.toThrow();
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Unrecognised tool "not-a-real-tool" for Copilot harness — no output tool granted.',
      ),
    );

    writeSpy.mockRestore();
  });

  it("omits the tools field entirely when no tools resolve", () => {
    const agent: CanonicalAgent = { ...AGENT, tools: [] };
    const rendered = harness.renderAgent(agent, ctx("fast"), skills);
    expect(parseMatter(rendered).data).not.toHaveProperty("tools");
  });
});

describe("CopilotHarness — skill transpile", () => {
  it("writes content files to .github/skills/<name>/ passing frontmatter through unchanged", () => {
    const files = harness.renderSkill(SKILL);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe(".github/skills/typescript/conventions.md");

    const parsed = parseMatter(files[0]!);
    expect(parsed.data.description).toBe("TypeScript conventions");
    expect(parsed.content).toContain("# typescript");
  });

  it("passes a binary bundled resource through byte-for-byte, unmodified", () => {
    const binaryBytes = Uint8Array.from([0x00, 0x80, 0xff, 0x10, 0xfe]);
    const skillWithBundle: CanonicalSkill = {
      ...SKILL,
      bundledFiles: [{ path: "assets/logo.png", contents: binaryBytes }],
    };

    const files = harness.renderSkill(skillWithBundle);
    const bundled = files.find((file) => file.path.endsWith("assets/logo.png"));

    expect(bundled?.path).toBe(".github/skills/typescript/assets/logo.png");
    expect(bundled?.contents).toEqual(binaryBytes);
  });
});

describe("CopilotHarness — skill links", () => {
  it("renders relative links from the .github/agents directory", () => {
    const links = harness.renderSkillLinks("planner", ["typescript"], skills);
    expect(links).toContain("[conventions](../skills/typescript/conventions.md)");
  });

  it("returns a placeholder string when no skill ids are given", () => {
    expect(harness.renderSkillLinks("planner", [], skills)).toBe(
      "_No skills are configured for this agent._",
    );
  });
});
