import { posix } from "node:path";

import { expandTokens, type TokenValues } from "../core/render.js";
import type {
  AbstractTool,
  CanonicalAgent,
  CanonicalSkill,
  HarnessId,
  Tier,
} from "../core/schema.js";
import { theme } from "../ui/theme.js";
import { resolveModelFor } from "./models.js";
import type { Harness, RenderContext, RenderedFile } from "./types.js";
import { buildMarkdownDocument } from "./util.js";

/** Project-relative directory Claude Code reads project agents from. */
const CLAUDE_AGENTS_DIR = ".claude/agents";

/** Project-relative directory Claude Code reads project skills from. */
const CLAUDE_SKILLS_DIR = ".claude/skills";

/**
 * Abstract tool to concrete Claude tool names. Verified against Claude Code's
 * subagent tool list (July 2026). `search` covers both content and path search.
 */
const CLAUDE_TOOL_MAP: Record<AbstractTool, string[]> = {
  read: ["Read"],
  write: ["Write"],
  edit: ["Edit"],
  search: ["Grep", "Glob"],
  execute: ["Bash"],
  websearch: ["WebSearch"],
  webfetch: ["WebFetch"],
};

/**
 * Map abstract tools to Claude's concrete tool names, de-duplicated in order.
 * Unknown tool strings are silently skipped (no error, no thrown exception) but
 * logged via `console.warn` so typos or unmapped abstract tools aren't lost
 * silently — the schema no longer validates against the closed enum so canon
 * files may carry unrecognised values.
 */
function mapTools(tools: string[]): string[] {
  const result: string[] = [];
  for (const tool of tools) {
    const concrete = CLAUDE_TOOL_MAP[tool as AbstractTool];
    if (!concrete) {
      process.stderr.write(
        `${theme.warn("⚠")} Unrecognised tool "${tool}" for Claude harness — no output tool granted.\n`,
      );
      continue;
    }
    for (const c of concrete) {
      if (!result.includes(c)) result.push(c);
    }
  }
  return result;
}

/**
 * Claude Code harness. Emits:
 *   - agents to `.claude/agents/<id>.md`   (markdown + YAML frontmatter)
 *   - skills to `.claude/skills/<name>/SKILL.md` (+ bundled files)
 */
export class ClaudeHarness implements Harness {
  readonly id: HarnessId = "claude";

  resolveModel(tier: Tier, override?: string): string {
    return resolveModelFor(this.id, tier, override);
  }

  agentOutputPath(agentId: string): string {
    return posix.join(CLAUDE_AGENTS_DIR, `${agentId}.md`);
  }

  renderSkillLinks(
    agentId: string,
    skillIds: string[],
    skills: Map<string, CanonicalSkill>,
  ): string {
    if (skillIds.length === 0) {
      return "_No skills are configured for this agent._";
    }

    const fromDir: string = posix.dirname(this.agentOutputPath(agentId));
    const rows: string[] = skillIds.map((skillId) => {
      const skill = skills.get(skillId);
      const links: string[] = (skill?.contentFiles ?? []).map((file) => {
        const filePath: string = posix.join(CLAUDE_SKILLS_DIR, skillId, file.filename);
        const link: string = posix.relative(fromDir, filePath);
        const label: string = file.filename.replace(/\.md$/, "");
        return `[${label}](${link})`;
      });
      const reference: string = links.length === 1 ? (links[0] ?? "") : links.join(", ");
      return `| ${skillId} | ${reference} |`;
    });

    return [
      "| Skill | Reference |",
      "|-------|-----------|",
      ...rows,
    ].join("\n");
  }

  renderAgent(
    agent: CanonicalAgent,
    ctx: RenderContext,
    skills: Map<string, CanonicalSkill>,
  ): RenderedFile {
    const model: string = this.resolveModel(ctx.tier, agent.modelOverrides?.claude);
    const tools: string[] = mapTools(agent.tools);

    const tokenValues: TokenValues = {
      output: ctx.outputDir,
      skills: this.renderSkillLinks(agent.id, agent.skills, skills),
    };

    const body: string = expandTokens(agent.body, tokenValues);

    const frontmatter: Record<string, string> = {
      name: agent.id,
      description: agent.description,
    };
    if (tools.length > 0) {
      frontmatter.tools = tools.join(", ");
    }
    frontmatter.model = model;

    return {
      path: this.agentOutputPath(agent.id),
      contents: buildMarkdownDocument(frontmatter, body),
    };
  }

  renderSkill(skill: CanonicalSkill): RenderedFile[] {
    const files: RenderedFile[] = [];

    // Content files are passed through as-is; their frontmatter is the author's responsibility.
    for (const contentFile of skill.contentFiles) {
      files.push({
        path: posix.join(CLAUDE_SKILLS_DIR, skill.name, contentFile.filename),
        contents: contentFile.contents,
      });
    }

    for (const bundled of skill.bundledFiles) {
      files.push({
        path: posix.join(CLAUDE_SKILLS_DIR, skill.name, bundled.path),
        contents: bundled.contents,
      });
    }

    return files;
  }
}
