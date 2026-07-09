/**
 * Forward-only migration chain for `hephaestus.lock.yaml`'s integer `version`
 * field. Kept as a sibling module to `lockfile.ts` (rather than folded into it)
 * because migrations operate on `unknown` shapes that the current zod schemas
 * deliberately cannot describe — a v1 lockfile is not a valid `Lockfile`.
 *
 * Policy (see .hephaestus/decisions/2026-07-08-decision-lockfile-schema-version-mismatch.md):
 * `LOCKFILE_VERSION` must never be bumped without also adding the paired
 * `LOCKFILE_MIGRATIONS[n]` entry here, plus a dedicated test for it. Skipping
 * that strands every older lockfile already on disk. The chain is append-only
 * and order-sensitive — once shipped, a migration function is immutable
 * history and must never be renumbered or deleted.
 */

/** Transforms a version-`n` lockfile shape into the version-`n+1` shape. */
export type LockfileMigration = (old: unknown) => unknown;

/**
 * Migration functions keyed by the FROM version. `LOCKFILE_MIGRATIONS[n]`
 * upgrades a version-`n` object to version `n + 1`. Empty today because
 * `LOCKFILE_VERSION` is still `1` — there is no v0 to migrate from. The next
 * version bump adds exactly one entry here (and one migration test).
 */
export const LOCKFILE_MIGRATIONS: Record<number, LockfileMigration> = {};

/**
 * Apply the migration chain sequentially, walking `data` from `fromVersion` up
 * to `toVersion` one step at a time. Accepts an injectable `migrations` map
 * (defaulting to {@link LOCKFILE_MIGRATIONS}) so tests can exercise the chain
 * mechanism itself without waiting for a real v2 schema to exist.
 *
 * @throws {Error} If no migration is registered for a version encountered
 *   along the way (a broken/missing link in the chain). Callers (namely
 *   `readLockfile`) are expected to catch this and rewrap it as a
 *   `LockfileError` with lockfile-specific context.
 */
export function applyMigrations(
  data: unknown,
  fromVersion: number,
  toVersion: number,
  migrations: Record<number, LockfileMigration> = LOCKFILE_MIGRATIONS,
): unknown {
  let current: unknown = data;

  for (let version: number = fromVersion; version < toVersion; version++) {
    const migrate: LockfileMigration | undefined = migrations[version];
    if (!migrate) {
      throw new Error(
        `no migration registered to upgrade from lockfile version ${version} to ${version + 1}.`,
      );
    }
    current = migrate(current);
  }

  return current;
}
