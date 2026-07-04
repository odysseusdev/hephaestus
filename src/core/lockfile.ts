import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { readFileIfExists, toProjectPath, writeFileAtomic } from "./fsops.js";
import { harnessIdSchema, tierSchema } from "./schema.js";

/** File name of the per-project lockfile written into the target project root. */
export const LOCKFILE_NAME = "hephaestus.lock.yaml";

/** Current lockfile schema version. Bump on breaking shape changes. */
export const LOCKFILE_VERSION = 1;

/** A single provisioned output file (or skill folder) and its content hash(es). */
export const lockOutputSchema = z
  .object({
    /** Project-root-relative POSIX path of the primary output file. */
    path: z.string().min(1),
    /** Roll-up hash over the output (single file, or all skill files combined). */
    hash: z.string().min(1),
    /** Per-file hashes for multi-file outputs (skills), keyed by relative path. */
    files: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type LockOutput = z.infer<typeof lockOutputSchema>;

/** Per-harness output map; not every harness is necessarily present. */
const outputsSchema = z.partialRecord(harnessIdSchema, lockOutputSchema);

/** Lock entry for one provisioned agent. */
export const agentLockSchema = z
  .object({
    tier: tierSchema,
    skills: z.array(z.string()),
    outputs: outputsSchema,
  })
  .strict();
export type AgentLock = z.infer<typeof agentLockSchema>;

/** Lock entry for one provisioned skill. */
export const skillLockSchema = z
  .object({
    outputs: outputsSchema,
  })
  .strict();
export type SkillLock = z.infer<typeof skillLockSchema>;

/** The full lockfile shape written to `hephaestus.lock.yaml`. */
export const lockfileSchema = z
  .object({
    version: z.literal(LOCKFILE_VERSION),
    engineVersion: z.string(),
    handoffDir: z.string().min(1),
    harnesses: z.array(harnessIdSchema),
    agents: z.record(z.string(), agentLockSchema),
    skills: z.record(z.string(), skillLockSchema),
  })
  .strict();
export type Lockfile = z.infer<typeof lockfileSchema>;

/** Error raised when an existing lockfile cannot be parsed or validated. */
export class LockfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockfileError";
  }
}

/**
 * Read and validate the lockfile from a project directory.
 *
 * @throws {LockfileError} If the file exists but is invalid YAML or shape.
 */
export async function readLockfile(projectRoot: string): Promise<Lockfile | null> {
  const lockPath: string = toProjectPath(projectRoot, LOCKFILE_NAME);
  const rawBytes: Buffer | null = await readFileIfExists(lockPath);
  if (rawBytes === null) {
    return null;
  }
  const raw: string = rawBytes.toString("utf8");

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error: unknown) {
    throw new LockfileError(
      `${LOCKFILE_NAME} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = lockfileSchema.safeParse(parsed);
  if (!result.success) {
    const detail: string = result.error.issues
      .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
      .join("; ");
    throw new LockfileError(`${LOCKFILE_NAME} failed validation: ${detail}`);
  }

  return result.data;
}

/** Write the lockfile into a project directory (pretty-printed, trailing newline). */
export async function writeLockfile(projectRoot: string, lockfile: Lockfile): Promise<void> {
  const lockPath: string = toProjectPath(projectRoot, LOCKFILE_NAME);
  const validated: Lockfile = lockfileSchema.parse(lockfile);
  await writeFileAtomic(lockPath, stringifyYaml(validated));
}

