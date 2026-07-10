import matter, { type GrayMatterFile } from "gray-matter";
import { describe, expect, it, vi } from "vitest";

import type { CanonicalAgent, CanonicalSkill } from "../src/core/schema.js";
import { ClaudeHarness } from "../src/harnesses/claude.js";
import type { RenderContext, RenderedFile } from "../src/harnesses/types.js";

const harness = new ClaudeHarness();

/**
 * Parse a rendered file's frontmatter. Agent and skill content files rendered
 * by the Claude harness are always UTF-8 text (only binary bundled skill
 * resources are raw bytes), so this narrows the union for test convenience.
 */
function parseMatter(file: RenderedFile): GrayMatterFile<string> {
  if (typeof file.contents !== "string") {
    throw new Error(`expected text contents for ${file.path}, got binary`);
  }
  return matter(file.contents);
}

const ctx = (tier: RenderContext["tier"]): RenderContext => ({
  harnessId: "claude",
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

describe("ClaudeHarness — agent transpile", () => {
  it("writes to .claude/agents/<id>.md with correct frontmatter", () => {
    const rendered = harness.renderAgent(AGENT, ctx("fast"), skills);

    expect(rendered.path).toBe(".claude/agents/planner.md");

    const parsed = parseMatter(rendered);
    expect(parsed.data.name).toBe("planner");
    expect(parsed.data.model).toBe("haiku");
    expect(parsed.data.tools).toBe("Read");
  });

  it("maps tiers to concrete models (flagship -> opus)", () => {
    const flagship: CanonicalAgent = { ...AGENT, tier: "flagship" };
    const rendered = harness.renderAgent(flagship, ctx("flagship"), skills);
    expect(parseMatter(rendered).data.model).toBe("opus");
  });

  it("lets a per-harness modelOverride win over the tier map", () => {
    const overridden: CanonicalAgent = { ...AGENT, modelOverrides: { claude: "claude-custom-9" } };
    const rendered = harness.renderAgent(overridden, ctx("fast"), skills);
    expect(parseMatter(rendered).data.model).toBe("claude-custom-9");
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
});

describe("ClaudeHarness — tool mapping", () => {
  it("maps websearch and webfetch to WebSearch and WebFetch", () => {
    const agent: CanonicalAgent = { ...AGENT, tools: ["websearch", "webfetch"] };
    const rendered = harness.renderAgent(agent, ctx("fast"), skills);
    expect(parseMatter(rendered).data.tools).toBe("WebSearch, WebFetch");
  });

  it("warns to stderr and does not throw on an unrecognised tool", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const agent: CanonicalAgent = { ...AGENT, tools: ["not-a-real-tool"] };

    expect(() => harness.renderAgent(agent, ctx("fast"), skills)).not.toThrow();
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Unrecognised tool "not-a-real-tool" for Claude harness — no output tool granted.',
      ),
    );

    writeSpy.mockRestore();
  });
});

describe("ClaudeHarness — skill transpile", () => {
  it("writes content files to .claude/skills/<name>/ passing frontmatter through unchanged", () => {
    const files = harness.renderSkill(SKILL);

    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe(".claude/skills/typescript/conventions.md");

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

    expect(bundled?.path).toBe(".claude/skills/typescript/assets/logo.png");
    expect(bundled?.contents).toEqual(binaryBytes);
  });
});
