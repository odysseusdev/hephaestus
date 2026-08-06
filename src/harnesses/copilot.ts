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

/** project-relative directory Copilot reads project agents from. */
const COPILOT_AGENTS_DIR = ".github/agents";

/** project-relative directory Copilot reads project skills from. */
const COPILOT_SKILLS_DIR = ".github/skills";

/**
 * abstract tool to concrete Copilot tool names. verified against GitHub Copilot's
 * custom-agents configuration reference (July 2026): Copilot's primary tool
 * aliases are `execute`, `read`, `edit`, `search`, `agent`, `web`, `todo`. there
 * is no separate `write` alias — write operations fall under `edit` (whose
 * documented compatible names include `Edit`, `MultiEdit`, `Write`,
 * `NotebookEdit`). `web` covers both web search and web fetch (documented
 * compatible names `WebSearch`, `WebFetch`); `search` covers both content and
 * path search (documented compatible names `Grep`, `Glob`); `agent` covers
 * subagent delegation.
 */
const COPILOT_TOOL_MAP: Record<AbstractTool, string[]> = {
  read: ["read"],
  write: ["edit"],
  edit: ["edit"],
  search: ["search"],
  execute: ["execute"],
  websearch: ["web"],
  webfetch: ["web"],
  delegate: ["agent"],
};

/**
 * map abstract tools to Copilot's concrete tool names, de-duplicated in order.
 * unknown tool strings are silently skipped (no error, no thrown exception) but
 * logged via a stderr warning so typos or unmapped abstract tools aren't lost
 * silently — the schema no longer validates against the closed enum so canon
 * files may carry unrecognised values.
 */
function mapTools(tools: string[]): string[] {
  const result: string[] = [];
  for (const tool of tools) {
    const concrete = COPILOT_TOOL_MAP[tool as AbstractTool];
    if (!concrete) {
      process.stderr.write(
        `${theme.warn("⚠")} Unrecognised tool "${tool}" for Copilot harness — no output tool granted.\n`,
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
 * GitHub Copilot harness. emits:
 *   - agents to `.github/agents/<id>.agent.md` (markdown + YAML frontmatter)
 *   - skills to `.github/skills/<name>/SKILL.md` (+ bundled files)
 *
 * frontmatter is deliberately limited to the portable intersection shared by
 * VS Code, Copilot CLI, and the Copilot cloud agent (`name`, `description`,
 * `tools`, `model`). `model` is always emitted as a scalar string, never an
 * array — Copilot CLI rejects the array fallback-list form VS Code accepts
 * (confirmed cross-surface bug, `github/copilot-cli#2133`). VS Code-only
 * fields (`argument-hint`, `handoffs`, `agents`, `hooks`) are never emitted.
 */
export class CopilotHarness implements Harness {
  readonly id: HarnessId = "copilot";

  resolveModel(tier: Tier, override?: string): string {
    return resolveModelFor(this.id, tier, override);
  }

  agentOutputPath(agentId: string): string {
    return posix.join(COPILOT_AGENTS_DIR, `${agentId}.agent.md`);
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
        const filePath: string = posix.join(COPILOT_SKILLS_DIR, skillId, file.filename);
        const link: string = posix.relative(fromDir, filePath);
        const label: string = file.filename.replace(/\.md$/, "");
        return `[${label}](${link})`;
      });
      const reference: string = links.length === 1 ? (links[0] ?? "") : links.join(", ");
      return `| ${skillId} | ${reference} |`;
    });

    return ["| Skill | Reference |", "|-------|-----------|", ...rows].join("\n");
  }

  renderAgent(
    agent: CanonicalAgent,
    ctx: RenderContext,
    skills: Map<string, CanonicalSkill>,
  ): RenderedFile {
    const model: string = this.resolveModel(ctx.tier, agent.modelOverrides?.copilot);
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
    // always a scalar string — never an array (see class doc comment).
    frontmatter.model = model;

    return {
      path: this.agentOutputPath(agent.id),
      contents: buildMarkdownDocument(frontmatter, body),
    };
  }

  renderSkill(skill: CanonicalSkill): RenderedFile[] {
    const files: RenderedFile[] = [];

    // content files are passed through as-is; their frontmatter is the author's responsibility.
    for (const contentFile of skill.contentFiles) {
      files.push({
        path: posix.join(COPILOT_SKILLS_DIR, skill.name, contentFile.filename),
        contents: contentFile.contents,
      });
    }

    for (const bundled of skill.bundledFiles) {
      files.push({
        path: posix.join(COPILOT_SKILLS_DIR, skill.name, bundled.path),
        contents: bundled.contents,
      });
    }

    return files;
  }
}
