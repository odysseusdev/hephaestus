import type { HarnessId, Tier } from "../core/schema.js";

/**
 * tier to concrete model string, per harness. this is the single editable source
 * for model mapping. these strings are volatile defaults: every harness's model
 * roster rotates on its own release schedule (documented as changing roughly
 * month to month), so re-verify each row against that harness's live models
 * doc at every hephaestus release rather than trusting this file to stay
 * current on its own:
 *   - Claude Code: https://code.claude.com/docs/en/model-config
 *   - GitHub Copilot: https://docs.github.com/en/copilot/reference/ai-models/supported-models
 *   - OpenAI Codex: https://learn.chatgpt.com/docs/models
 *
 * - claude: verified June 2026. Claude Code accepts only short aliases in the agent
 *   frontmatter `model` field: sonnet, opus, haiku, inherit.
 * - copilot: verified July 2026 against the supported-models doc above. Copilot has
 *   no single canonical slug format the way Anthropic/OpenAI's own APIs do — its
 *   `model` frontmatter field takes whatever display string the calling
 *   environment's model picker resolves, so these are display-string picks, one
 *   reasonable model per tier, not a guaranteed-stable identifier.
 * - codex: PLACEHOLDERS. Codex is not implemented yet and not wired into the
 *   registry, so these are unreachable today.
 */
export const MODEL_MAP: Record<HarnessId, Record<Tier, string>> = {
  claude: {
    fast: "haiku",
    balanced: "sonnet",
    flagship: "opus",
  },
  copilot: {
    fast: "Claude Haiku 4.5",
    balanced: "Claude Sonnet 4.6",
    flagship: "Claude Opus 4.6",
  },
  // TODO: implement Codex harness and verify these model strings before shipping.
  codex: {
    fast: "TODO-verify-codex-fast",
    balanced: "TODO-verify-codex-balanced",
    flagship: "TODO-verify-codex-flagship",
  },
};

/**
 * resolve the concrete model string for a harness. a per-harness override
 * (from a canonical agent's `modelOverrides`) wins over the tier map.
 */
export function resolveModelFor(harnessId: HarnessId, tier: Tier, override?: string): string {
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  return MODEL_MAP[harnessId][tier];
}
