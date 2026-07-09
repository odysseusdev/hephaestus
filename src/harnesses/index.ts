import type { HarnessId } from "../core/schema.js";
import { ClaudeHarness } from "./claude.js";
import type { Harness } from "./types.js";

/**
 * registry of implemented harnesses. Claude is wired in for the first milestone;
 * Copilot and Codex are added here during the fan-out phase, at which point they
 * automatically appear in the `init` harness picker and `list` output.
 */
const REGISTRY: ReadonlyMap<HarnessId, Harness> = new Map<HarnessId, Harness>([
  ["claude", new ClaudeHarness()],
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
