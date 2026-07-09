import type { HarnessId, Tier } from "../core/schema.js";

/**
 * tier to concrete model string, per harness. this is the single editable source
 * for model mapping. model names change often — re-verify against each harness's
 * live documentation when they shift (handoff §13).
 *
 * - claude: verified June 2026. Claude Code accepts only short aliases in the agent
 *   frontmatter `model` field: sonnet, opus, haiku, inherit.
 * - copilot / codex: PLACEHOLDERS. these MUST be re-verified against current
 *   official docs in the fan-out phase before those harnesses ship. they are not
 *   wired into the registry yet, so they are unreachable today.
 */
export const MODEL_MAP: Record<HarnessId, Record<Tier, string>> = {
  claude: {
    fast: "haiku",
    balanced: "sonnet",
    flagship: "opus",
  },
  // TODO(fan-out §13): verify GitHub Copilot model strings against live docs.
  copilot: {
    fast: "TODO-verify-copilot-fast",
    balanced: "TODO-verify-copilot-balanced",
    flagship: "TODO-verify-copilot-flagship",
  },
  // TODO(fan-out §13): verify OpenAI Codex model strings against live docs.
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
