import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { z } from "zod";

import { describeError, writeFileAtomic } from "./fsops.js";

/** Directory where hephaestus stores its global user config. */
const GLOBAL_CONFIG_DIR: string = join(homedir(), ".config", "hephaestus");

/** Absolute path to the global config file. */
export const GLOBAL_CONFIG_PATH: string = join(GLOBAL_CONFIG_DIR, "config.json");

const globalConfigSchema = z
  .object({
    /** Absolute path to the user's canonical content directory. */
    canonDir: z
      .string()
      .min(1)
      .refine(isAbsolute, { message: "canonDir must be an absolute path" }),
  })
  .strict();

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

/**
 * Expand a leading `~` to the current user's home directory.
 * Relative paths are returned as-is for the caller to resolve.
 */
export function expandHome(rawPath: string): string {
  if (rawPath === "~" || rawPath.startsWith("~/")) {
    return join(homedir(), rawPath.slice(1));
  }
  return rawPath;
}

/**
 * Validate a candidate canonical content directory. It must exist and contain
 * both an `agents/` and a `skills/` subdirectory.
 *
 * @returns An error message string, or `null` if valid.
 */
export function validateCanonDir(dirPath: string): string | null {
  if (!existsSync(dirPath)) {
    return `directory does not exist: ${dirPath}`;
  }
  if (!existsSync(join(dirPath, "agents"))) {
    return `missing agents/ subdirectory in: ${dirPath}`;
  }
  if (!existsSync(join(dirPath, "skills"))) {
    return `missing skills/ subdirectory in: ${dirPath}`;
  }
  return null;
}

/**
 * Read and validate the global config file. Returns `null` if the file does
 * not exist. Throws if the file exists but is invalid JSON or shape.
 *
 * @param configPath Override path — used in tests. Defaults to {@link GLOBAL_CONFIG_PATH}.
 */
export function readGlobalConfig(configPath: string = GLOBAL_CONFIG_PATH): GlobalConfig | null {
  if (!existsSync(configPath)) {
    return null;
  }

  // Read and parse are wrapped separately so an IO failure (e.g. EACCES) is
  // reported with a friendly "failed to read" message — the same pattern
  // `readFileIfExists` in fsops.ts uses — rather than being misreported as
  // invalid JSON.
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error: unknown) {
    throw new Error(`Failed to read ${configPath}: ${describeError(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw new Error(`${configPath} is not valid JSON: ${describeError(error)}`);
  }

  const result = globalConfigSchema.safeParse(parsed);
  if (!result.success) {
    const detail: string = result.error.issues
      .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
      .join("; ");
    throw new Error(`${configPath} failed validation: ${detail}`);
  }

  return result.data;
}

/**
 * Write the global config to disk. Creates the parent directory if needed.
 *
 * @param config The config to save.
 * @param configPath Override path — used in tests. Defaults to {@link GLOBAL_CONFIG_PATH}.
 */
export async function writeGlobalConfig(
  config: GlobalConfig,
  configPath: string = GLOBAL_CONFIG_PATH,
): Promise<void> {
  const validated: GlobalConfig = globalConfigSchema.parse(config);
  await writeFileAtomic(configPath, JSON.stringify(validated, null, 2) + "\n");
}
