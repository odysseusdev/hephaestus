import { resolve } from "node:path";

import { readGlobalConfig, validateCanonDir } from "./globalconfig.js";
import { engineConfigSchema, type EngineConfig } from "./schema.js";

/** environment variable that overrides the canonical source. */
export const CONTENT_DIR_ENV = "HEPHAESTUS_CANON_DIR";

/** default output directory when the user does not override it at `forge` time. */
export const DEFAULT_OUTPUT_DIR = ".hephaestus";

/**
 * thrown when no canonical source can be located. commands that can
 * recover from this (e.g. `forge`) catch it and run the first-run setup flow.
 */
export class EngineConfigNotFoundError extends Error {
  constructor() {
    super(
      `no canonical source configured. run \`hephaestus bind\` to set one up, ` +
        `or set the ${CONTENT_DIR_ENV} environment variable.`,
    );
    this.name = "EngineConfigNotFoundError";
  }
}

/**
 * resolve the engine configuration. content dir resolution order:
 *   1. `HEPHAESTUS_CANON_DIR` env var, if set;
 *   2. global user config at `~/.config/hephaestus/config.json`.
 *
 * the resolved directory is validated the same way `bind` validates it (must
 * exist and contain both `agents/` and `skills/`), so both entry points to
 * setting a canonical source enforce the same shape.
 *
 * @throws {EngineConfigNotFoundError} if no canonical source can be found.
 * @throws {Error} if the resolved directory fails {@link validateCanonDir}.
 */
export function loadConfig(): EngineConfig {
  const envOverride: string | undefined = process.env[CONTENT_DIR_ENV];
  const contentDir: string | null = envOverride
    ? resolve(envOverride)
    : (readGlobalConfig()?.canonDir ?? null);

  if (!contentDir) {
    throw new EngineConfigNotFoundError();
  }

  const validationError: string | null = validateCanonDir(contentDir);
  if (validationError) {
    throw new Error(validationError);
  }

  return engineConfigSchema.parse({
    contentDir,
    defaultOutputDir: DEFAULT_OUTPUT_DIR,
  });
}
