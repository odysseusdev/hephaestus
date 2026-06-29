/**
 * The decision for a single provisioned file, derived purely from three hashes.
 *
 * - `skip`   nothing changed; leave the file and lock as they are.
 * - `update` clean upstream change, file untouched in project; write new bytes.
 * - `keep`   user edited in project, no upstream change; leave their edit.
 * - `drift`  both the project file and the source changed; needs resolution.
 * - `create` file is missing on disk; (re-)provision it.
 */
export type SyncDecision = "skip" | "update" | "keep" | "drift" | "create";

/** Strategy used to resolve a drifted file without prompting. */
export type DriftStrategy = "overwrite" | "cancel" | "merge";

/** The three hashes (plus disk presence) needed to decide one file's fate. */
export interface FileSyncInput {
  /** Hash recorded in the lockfile (what we last wrote), or undefined if untracked. */
  lockHash: string | undefined;
  /** Hash of the file currently on disk, or null if the file is missing. */
  diskHash: string | null;
  /** Hash of the freshly re-rendered output from current canonical. */
  newHash: string;
}

/** Apply the three-way decision table to one file. */
export function decideFile(input: FileSyncInput): SyncDecision {
  const { lockHash, diskHash, newHash } = input;

  // File missing on disk: provisioned file was deleted; re-provision it.
  if (diskHash === null) {
    return "create";
  }

  // Untracked file present on disk: if it already matches the new render there is
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

/** Default conflict markers, git-style, distinguishing project from source. */
export const CONFLICT_MARKERS = {
  start: "<<<<<<< project",
  middle: "=======",
  end: ">>>>>>> source",
} as const;

/**
 * Produce conflict-marked contents for a drifted file (git-style): project
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

/** Ensure a string ends with exactly one trailing newline. */
function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

/**
 * Resolve a drifted file given a chosen strategy. The lock is only advanced
 * when the file is brought back into a known-good state (`overwrite`).
 */
export function resolveDrift(
  strategy: DriftStrategy,
  projectContents: string,
  sourceContents: string,
): { write: string | null; updateLock: boolean } {
  switch (strategy) {
    case "overwrite":
      return { write: sourceContents, updateLock: true };
    case "cancel":
      // Leave the disk file; lock stays flagged until user resolves.
      return { write: null, updateLock: false };
    case "merge":
      // Write conflict markers; lock advances after the user resolves them manually.
      return { write: buildConflictMarkers(projectContents, sourceContents), updateLock: false };
  }
}
