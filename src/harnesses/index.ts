import type { HarnessId } from "../core/schema.js";
import { ClaudeHarness } from "./claude.js";
import { CopilotHarness } from "./copilot.js";
import type { Harness } from "./types.js";

/**
 * registry of implemented harnesses. Claude and Copilot are wired in; Codex is
 * not yet implemented. a harness only needs one line here to automatically
 * appear in the `forge` harness picker and `inventory` output.
 */
const REGISTRY: ReadonlyMap<HarnessId, Harness> = new Map<HarnessId, Harness>([
  ["claude", new ClaudeHarness()],
  ["copilot", new CopilotHarness()],
]);

/** all currently implemented harnesses, in registration order. */
export function availableHarnesses(): Harness[] {
  return [...REGISTRY.values()];
}

/** whether a harness id is implemented and available. */
export function isHarnessAvailable(id: HarnessId): boolean {
  return REGISTRY.has(id);
}

/** @throws if the harness is not implemented. */
export function getHarness(id: HarnessId): Harness {
  const harness: Harness | undefined = REGISTRY.get(id);
  if (!harness) {
    throw new Error(
      `Harness "${id}" is not implemented yet. Available: ${[...REGISTRY.keys()].join(", ")}.`,
    );
  }
  return harness;
}

export type { Harness, RenderContext, RenderedFile } from "./types.js";
