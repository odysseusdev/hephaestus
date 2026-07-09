import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { readGlobalConfig } from "./globalconfig.js";
import { engineConfigSchema, type EngineConfig } from "./schema.js";

/** Environment variable that overrides the canonical content directory. */
export const CONTENT_DIR_ENV = "HEPHAESTUS_CANON_DIR";

/** Default output directory when the user does not override it at `forge` time. */
export const DEFAULT_OUTPUT_DIR = ".hephaestus";

/**
 * Thrown when no canonical content directory can be located. Commands that can
 * recover from this (e.g. `forge`) catch it and run the first-run setup flow.
 */
export class EngineConfigNotFoundError extends Error {
  constructor() {
    super(
      `no canon directory configured. run \`hephaestus bind\` to set one up, ` +
        `or set the ${CONTENT_DIR_ENV} environment variable.`,
    );
    this.name = "EngineConfigNotFoundError";
  }
}

/**
 * Resolve the engine configuration. Content dir resolution order:
 *   1. `HEPHAESTUS_CANON_DIR` env var, if set;
 *   2. Global user config at `~/.config/hephaestus/config.json`.
 *
 * @throws {EngineConfigNotFoundError} If no canonical content directory can be found.
 * @throws {Error} If the resolved directory does not exist on disk.
 */
export function loadConfig(): EngineConfig {
  const envOverride: string | undefined = process.env[CONTENT_DIR_ENV];
  const contentDir: string | null = envOverride
    ? resolve(envOverride)
    : (readGlobalConfig()?.canonDir ?? null);

  if (!contentDir) {
    throw new EngineConfigNotFoundError();
  }

  if (!existsSync(contentDir)) {
    throw new Error(`canonical content directory does not exist: ${contentDir}`);
  }

  return engineConfigSchema.parse({
    contentDir,
    defaultOutputDir: DEFAULT_OUTPUT_DIR,
  });
}
