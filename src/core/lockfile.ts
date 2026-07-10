import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { describeError, readFileIfExists, toProjectPath, writeFileAtomic } from "./fsops.js";
import { applyMigrations } from "./lockfile-migrations.js";
import { harnessIdSchema, tierSchema } from "./schema.js";
import { ENGINE_VERSION } from "./version.js";

/** file name of the per-project lockfile written into the target project root. */
export const LOCKFILE_NAME = "hephaestus.lock.yaml";

/** current lockfile schema version. bump on breaking shape changes. */
export const LOCKFILE_VERSION = 1;

/** a single provisioned output file (or skill folder) and its content hash(es). */
export const lockOutputSchema = z
  .object({
    /** project-root-relative POSIX path of the primary output file. */
    path: z.string().min(1),
    /** roll-up hash over the output (single file, or all skill files combined). */
    hash: z.string().min(1),
    /** per-file hashes for multi-file outputs (skills), keyed by relative path. */
    files: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type LockOutput = z.infer<typeof lockOutputSchema>;

/** per-harness output map; not every harness is necessarily present. */
const outputsSchema = z.partialRecord(harnessIdSchema, lockOutputSchema);

/** lock entry for one provisioned agent. */
export const agentLockSchema = z
  .object({
    tier: tierSchema,
    skills: z.array(z.string()),
    outputs: outputsSchema,
  })
  .strict();
export type AgentLock = z.infer<typeof agentLockSchema>;

/** lock entry for one provisioned skill. */
export const skillLockSchema = z
  .object({
    outputs: outputsSchema,
  })
  .strict();
export type SkillLock = z.infer<typeof skillLockSchema>;

/** the full lockfile shape written to `hephaestus.lock.yaml`. */
export const lockfileSchema = z
  .object({
    version: z.literal(LOCKFILE_VERSION),
    engineVersion: z.string(),
    outputDir: z.string().min(1),
    harnesses: z.array(harnessIdSchema),
    agents: z.record(z.string(), agentLockSchema),
    skills: z.record(z.string(), skillLockSchema),
  })
  .strict();
export type Lockfile = z.infer<typeof lockfileSchema>;

/** error raised when an existing lockfile cannot be parsed or validated. */
export class LockfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockfileError";
  }
}

/**
 * error raised when the on-disk lockfile's `version` is newer than this CLI's
 * `LOCKFILE_VERSION` can read. deliberately a *sibling* of {@link LockfileError},
 * not a subclass — `forge --force`'s corrupt-lockfile handling checks
 * `error instanceof LockfileError` and must never swallow this case. silently
 * wiping a newer lockfile a future CLI release could still read would be
 * unrecoverable data loss; upgrading the CLI (or manually deleting the
 * lockfile) is the only sanctioned way past this error.
 */
export class LockfileTooNewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockfileTooNewError";
  }
}

/** notified when `readLockfile` migrates an older on-disk lockfile forward. */
export type LockfileMigrationNotice = (fromVersion: number, toVersion: number) => void;

/** loosely-parsed version fields read from a lockfile before strict validation runs. */
interface VersionProbe {
  /** the on-disk `version`, or undefined if absent/not a number. */
  version: number | undefined;
  /** the on-disk `engineVersion`, degrading gracefully when absent. */
  engineVersion: string;
}

/**
 * read only `version` and `engineVersion` out of a freshly-parsed YAML value,
 * tolerating unknown/extra/missing fields. used ahead of strict schema
 * validation because an off-version file cannot satisfy `lockfileSchema`
 * (whose `version` is pinned via `z.literal`), yet the version itself needs to
 * be known before deciding whether strict validation should even run.
 */
function probeVersion(parsed: unknown): VersionProbe {
  const record: Record<string, unknown> =
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const version: number | undefined =
    typeof record.version === "number" ? record.version : undefined;
  const engineVersion: string =
    typeof record.engineVersion === "string" ? record.engineVersion : "an unknown version";
  return { version, engineVersion };
}

/** run strict schema validation, throwing a {@link LockfileError} with issue detail on failure. */
function validateLockfileShape(data: unknown): Lockfile {
  const result = lockfileSchema.safeParse(data);
  if (!result.success) {
    const detail: string = result.error.issues
      .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
      .join("; ");
    throw new LockfileError(`${LOCKFILE_NAME} failed validation: ${detail}`);
  }
  return result.data;
}

/**
 * read and validate the lockfile from a project directory.
 *
 * performs a three-way comparison of the on-disk `version` against the
 * current {@link LOCKFILE_VERSION} before running strict schema validation:
 *
 * - **equal** — validated as-is, unchanged behaviour.
 * - **newer than this CLI** — hard-fails with {@link LockfileTooNewError}
 *   (never best-effort-read; upgrade the CLI or delete the lockfile).
 * - **older than this CLI** — auto-migrated forward via
 *   `LOCKFILE_MIGRATIONS`/`applyMigrations` (see `lockfile-migrations.ts`),
 *   then **written back to disk** before being returned. this write-back is a
 *   deliberate side effect on the migration path, including for read-only
 *   callers (`inventory`, `temper --dry-run`) — it is only acceptable because
 *   `onMigrate` fires first, making it a notified change rather than a silent
 *   one. callers must wire `onMigrate` to user-facing UI.
 *
 * @param onMigrate - called with `(fromVersion, toVersion)` before the
 *   migrated lockfile is written back to disk, whenever migration occurs.
 *   required by policy for the write-back to be non-silent; core stays
 *   UI-agnostic by taking a plain callback instead of importing `ui/`.
 * @throws {LockfileError} if the file exists but is invalid YAML, invalid
 *   shape, or cannot be migrated (no registered migration path).
 * @throws {LockfileTooNewError} if the on-disk `version` is newer than this
 *   CLI's `LOCKFILE_VERSION`.
 */
export async function readLockfile(
  projectRoot: string,
  onMigrate?: LockfileMigrationNotice,
): Promise<Lockfile | null> {
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

  const { version: onDiskVersion, engineVersion } = probeVersion(parsed);

  // version undeterminable (missing/non-number) — fall through to strict
  // validation directly, which will raise a clear LockfileError on its own.
  if (onDiskVersion === undefined) {
    return validateLockfileShape(parsed);
  }

  if (onDiskVersion > LOCKFILE_VERSION) {
    throw new LockfileTooNewError(
      `${LOCKFILE_NAME} was written by hephaestus ${engineVersion}, but you're running ${ENGINE_VERSION}. ` +
        `this lockfile uses a newer format this version can't read. upgrade hephaestus to ${engineVersion} or newer to continue.`,
    );
  }

  if (onDiskVersion < LOCKFILE_VERSION) {
    onMigrate?.(onDiskVersion, LOCKFILE_VERSION);

    let migrated: unknown;
    try {
      migrated = applyMigrations(parsed, onDiskVersion, LOCKFILE_VERSION);
    } catch (error: unknown) {
      throw new LockfileError(
        `${LOCKFILE_NAME} could not be migrated from version ${onDiskVersion} to ${LOCKFILE_VERSION}: ${describeError(error)}`,
      );
    }

    const validated: Lockfile = validateLockfileShape(migrated);
    await writeLockfile(projectRoot, validated);
    return validated;
  }

  // onDiskVersion === LOCKFILE_VERSION
  return validateLockfileShape(parsed);
}

/** write the lockfile into a project directory (pretty-printed, trailing newline). */
export async function writeLockfile(projectRoot: string, lockfile: Lockfile): Promise<void> {
  const lockPath: string = toProjectPath(projectRoot, LOCKFILE_NAME);
  const validated: Lockfile = lockfileSchema.parse(lockfile);
  await writeFileAtomic(lockPath, stringifyYaml(validated));
}
