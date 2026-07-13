import { readFileIfExists, toProjectPath } from "./fsops.js";
import { hashContents } from "./hash.js";
import type { Lockfile } from "./lockfile.js";
import { previousLockHash, type RenderedOutput } from "./provision.js";

/**
 * the decision for a single provisioned file, derived purely from three hashes.
 *
 * - `skip`   nothing changed; leave the file and lock as they are.
 * - `update` clean upstream change, file untouched in project; write new bytes.
 * - `keep`   user edited in project, no upstream change; leave their edit.
 * - `drift`  both the project file and the source changed; needs resolution.
 * - `create` file is missing on disk; (re-)provision it.
 */
export type SyncDecision = "skip" | "update" | "keep" | "drift" | "create";

/** strategy used to resolve a drifted file without prompting. */
export type DriftStrategy = "overwrite" | "cancel" | "merge";

/** the three hashes (plus disk presence) needed to decide one file's fate. */
export interface FileSyncInput {
  /** hash recorded in the lockfile (what we last wrote), or undefined if untracked. */
  lockHash: string | undefined;
  /** hash of the file currently on disk, or null if the file is missing. */
  diskHash: string | null;
  /** hash of the freshly re-rendered output from current canonical. */
  newHash: string;
}

/** apply the three-way decision table to one file. */
export function decideFile(input: FileSyncInput): SyncDecision {
  const { lockHash, diskHash, newHash } = input;

  // file missing on disk: provisioned file was deleted; re-provision it.
  if (diskHash === null) {
    return "create";
  }

  // untracked file present on disk: if it already matches the new render there is
  // nothing to do; otherwise treat it as a conflict to resolve.
  if (lockHash === undefined) {
    return diskHash === newHash ? "skip" : "drift";
  }

  const diskMatchesLock: boolean = diskHash === lockHash;
  const newMatchesLock: boolean = newHash === lockHash;

  if (diskMatchesLock && newMatchesLock) {
    return "skip";
  }
  if (diskMatchesLock && !newMatchesLock) {
    return "update";
  }
  if (!diskMatchesLock && newMatchesLock) {
    return "keep";
  }
  return "drift";
}

/** result of {@link decideOutputFile}: the decision plus the hashes it was derived from. */
export interface FileDecisionResult {
  decision: SyncDecision;
  lockHash: string | undefined;
  diskContents: Buffer | null;
}

/**
 * gather the three hashes needed for one rendered output file (lock, disk,
 * freshly-rendered) and apply the three-way decision table to it.
 */
export async function decideOutputFile(
  output: RenderedOutput,
  file: { path: string; contents: string | Uint8Array; hash: string },
  lockfile: Lockfile,
  projectRoot: string,
): Promise<FileDecisionResult> {
  const lockHash: string | undefined = previousLockHash(lockfile, output, file.path);
  const diskContents: Buffer | null = await readFileIfExists(
    await toProjectPath(projectRoot, file.path),
  );
  const diskHash: string | null = diskContents === null ? null : hashContents(diskContents);
  const decision: SyncDecision = decideFile({ lockHash, diskHash, newHash: file.hash });
  return { decision, lockHash, diskContents };
}

/** default conflict markers, git-style, distinguishing project from source. */
export const CONFLICT_MARKERS = {
  start: "<<<<<<< project",
  middle: "=======",
  end: ">>>>>>> source",
} as const;

/**
 * produce conflict-marked contents for a drifted file (git-style): project
 * bytes on top, freshly-rendered source bytes below.
 */
export function buildConflictMarkers(projectContents: string, sourceContents: string): string {
  const project: string = ensureTrailingNewline(projectContents);
  const source: string = ensureTrailingNewline(sourceContents);
  return (
    `${CONFLICT_MARKERS.start}\n` +
    `${project}` +
    `${CONFLICT_MARKERS.middle}\n` +
    `${source}` +
    `${CONFLICT_MARKERS.end}\n`
  );
}

/** ensure a string ends with exactly one trailing newline. */
function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

/**
 * resolve a drifted file given a chosen strategy. the lock is only advanced
 * when the file is brought back into a known-good state (`overwrite`).
 *
 * `projectContents`/`sourceContents` accept raw bytes as well as text so a
 * binary bundled skill resource can still be overwritten or cancelled without
 * being forced through a lossy UTF-8 decode.
 *
 * @throws {Error} if `strategy` is `"merge"` and either side is not text —
 *   git-style conflict markers are a text-only concept.
 */
export function resolveDrift(
  strategy: DriftStrategy,
  projectContents: string | Uint8Array,
  sourceContents: string | Uint8Array,
): { write: string | Uint8Array | null; updateLock: boolean } {
  switch (strategy) {
    case "overwrite":
      return { write: sourceContents, updateLock: true };
    case "cancel":
      // leave the disk file; lock stays flagged until user resolves.
      return { write: null, updateLock: false };
    case "merge":
      if (typeof projectContents !== "string" || typeof sourceContents !== "string") {
        throw new Error(
          "cannot merge binary content with conflict markers; choose overwrite or cancel instead.",
        );
      }
      // write conflict markers; lock advances after the user resolves them manually.
      return { write: buildConflictMarkers(projectContents, sourceContents), updateLock: false };
  }
}
