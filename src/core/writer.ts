import { ensureDir, toProjectPath, writeFileAtomic } from "./fsops.js";
import type { RenderedOutput } from "./provision.js";

/** Write rendered outputs to disk under a project root, atomically and creating parent dirs. */
export async function writeOutputs(
  projectRoot: string,
  outputs: RenderedOutput[],
): Promise<number> {
  let written = 0;
  for (const output of outputs) {
    for (const file of output.files) {
      await writeFileAtomic(toProjectPath(projectRoot, file.path), file.contents);
      written += 1;
    }
  }
  return written;
}

/**
 * Create the (empty) handoff directory. Agents create their own files at
 * runtime; the CLI only ensures the directory exists.
 */
export async function ensureHandoffDir(projectRoot: string, handoffDir: string): Promise<void> {
  await ensureDir(toProjectPath(projectRoot, handoffDir));
}
