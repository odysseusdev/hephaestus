import type { CanonicalAgent, CanonicalSkill, HarnessId, Tier } from "../core/schema.js";

/** A single file ready to be written, with its project-root-relative path. */
export interface RenderedFile {
  /** Path relative to the project root, always in POSIX (forward-slash) form. */
  path: string;
  contents: string;
}

/** Per-render context passed to harness methods. */
export interface RenderContext {
  harnessId: HarnessId;
  handoffDir: string;
  tier: Tier;
}

/**
 * Per-harness abstraction. Implementations are pure — no IO — so transpilers
 * stay unit-testable. The fsops layer does the actual writing.
 */
export interface Harness {
  readonly id: HarnessId;

  /** Map an abstract tier (plus an optional per-harness override) to a concrete model string. */
  resolveModel(tier: Tier, override?: string): string;

  /** Project-relative POSIX path this harness writes the given agent to. */
  agentOutputPath(agentId: string): string;

  /**
   * Render one canonical agent into this harness's agent file. The skills map
   * is required to expand the `{{skills}}` block with correctly-relative links.
   */
  renderAgent(
    agent: CanonicalAgent,
    ctx: RenderContext,
    skills: Map<string, CanonicalSkill>,
  ): RenderedFile;

  /** Render one canonical skill into this harness's skill files. */
  renderSkill(skill: CanonicalSkill): RenderedFile[];

  /**
   * Render the `{{skills}}` link block for an agent. Paths are relative to the
   * agent file's location so links resolve correctly in this harness's layout.
   */
  renderSkillLinks(
    agentId: string,
    skillIds: string[],
    skills: Map<string, CanonicalSkill>,
  ): string;
}
