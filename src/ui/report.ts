import type { RenderedOutput } from "../core/provision.js";
import type { CanonicalAgent, HarnessId } from "../core/schema.js";
import type { SyncDecision } from "../core/sync.js";
import { bold, dim, theme } from "./theme.js";

/** Category key agents fall under when they declare no explicit `category`. */
const GENERAL_CATEGORY = "general";

/** Tally of sync decisions, for the closing summary line. */
export interface SyncCounts {
  created: number;
  updated: number;
  skipped: number;
  kept: number;
  drifted: number;
}

/** A glyph + colour per sync decision, for per-file reporting. */
const DECISION_STYLE: Record<SyncDecision, { glyph: string; paint: (s: string) => string }> = {
  create: { glyph: "+", paint: theme.success },
  update: { glyph: "↑", paint: theme.success },
  skip: { glyph: "·", paint: theme.muted },
  keep: { glyph: "=", paint: theme.info },
  drift: { glyph: "!", paint: theme.conflict },
};

/** A short, coloured label describing a per-file decision. */
export function decisionLine(decision: SyncDecision, path: string): string {
  const style = DECISION_STYLE[decision];
  return `${style.paint(style.glyph)} ${style.paint(decision.padEnd(6))} ${theme.text(path)}`;
}

/**
 * Group canonical agents into named categories for the forge select prompt, falling back
 * to "general" when an agent declares none. Category keys are sorted alphabetically, with
 * "general" always last.
 */
export function groupAgentsByCategory(agents: CanonicalAgent[]): Map<string, CanonicalAgent[]> {
  const byCategory: Map<string, CanonicalAgent[]> = new Map();

  for (const agent of agents) {
    const category: string = agent.category ?? GENERAL_CATEGORY;
    const bucket: CanonicalAgent[] = byCategory.get(category) ?? [];
    bucket.push(agent);
    byCategory.set(category, bucket);
  }

  const sortedKeys: string[] = [...byCategory.keys()].sort((a, b) => {
    if (a === GENERAL_CATEGORY) return 1;
    if (b === GENERAL_CATEGORY) return -1;
    return a.localeCompare(b);
  });

  const sorted: Map<string, CanonicalAgent[]> = new Map();
  for (const key of sortedKeys) {
    sorted.set(key, byCategory.get(key) as CanonicalAgent[]);
  }
  return sorted;
}

/**
 * Reference block listing every agent's name and short (<=80 char) `summary`,
 * one per line, for display via `note()` before the select prompt. Uses
 * `summary` rather than the unbounded `description` so lines never wrap or
 * overflow the terminal width in the forge preview box.
 */
export function agentDescriptionsBlock(agents: CanonicalAgent[]): string {
  const grouped: Map<string, CanonicalAgent[]> = groupAgentsByCategory(agents);
  const lines: string[] = [];
  for (const bucket of grouped.values()) {
    for (const agent of bucket) {
      lines.push(`${theme.text(agent.name)} — ${agent.summary}`);
    }
  }
  return lines.join("\n");
}

/** Render the per-harness file summary for the forge preview. */
export function provisionSummary(outputs: RenderedOutput[]): string {
  const byHarness: Map<HarnessId, string[]> = new Map();

  for (const output of outputs) {
    const lines: string[] = byHarness.get(output.harnessId) ?? [];
    for (const file of output.files) {
      lines.push(`${theme.success("+")} ${theme.text(file.path)}`);
    }
    byHarness.set(output.harnessId, lines);
  }

  const sections: string[] = [];
  for (const [harness, lines] of byHarness) {
    sections.push(`${bold(theme.accent(harness))}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

export function tallySyncDecision(counts: SyncCounts, decision: SyncDecision): void {
  switch (decision) {
    case "create":
      counts.created += 1;
      break;
    case "update":
      counts.updated += 1;
      break;
    case "skip":
      counts.skipped += 1;
      break;
    case "keep":
      counts.kept += 1;
      break;
    case "drift":
      counts.drifted += 1;
      break;
  }
}

/** Render the closing summary tally after a temper run. */
export function syncSummary(counts: SyncCounts): string {
  const parts: string[] = [
    theme.success(`${counts.created} created`),
    theme.success(`${counts.updated} updated`),
    theme.muted(`${counts.skipped} skipped`),
    theme.info(`${counts.kept} kept`),
    counts.drifted > 0
      ? theme.conflict(`${counts.drifted} drifted`)
      : theme.muted(`${counts.drifted} drifted`),
  ];
  return parts.join(dim(" · "));
}
