import { ensureDir, toProjectPath, writeFileAtomic } from "./fsops.js";
import type { RenderedOutput } from "./provision.js";

/** write rendered outputs to disk under a project root, atomically and creating parent dirs. */
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
 * create the (empty) output directory. agents create their own files at
 * runtime; the CLI only ensures the directory exists.
 */
export async function ensureOutputDir(projectRoot: string, outputDir: string): Promise<void> {
  await ensureDir(toProjectPath(projectRoot, outputDir));
}
