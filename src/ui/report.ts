import type { RenderedOutput } from "../core/provision.js";
import type { HarnessId } from "../core/schema.js";
import type { SyncDecision } from "../core/sync.js";
import { bold, dim, theme } from "./theme.js";

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
