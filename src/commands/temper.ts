import { resolve } from "node:path";

import { loadConfig } from "../core/config.js";
import { toProjectPath, writeFileAtomic } from "../core/fsops.js";
import { loadCanonical, type CanonicalContent } from "../core/loader.js";
import { LOCKFILE_NAME, readLockfile, writeLockfile, type Lockfile } from "../core/lockfile.js";
import {
  buildLockfile,
  renderAll,
  selectionFromLock,
  type ProvisionSelection,
  type RenderedOutput,
} from "../core/provision.js";
import {
  decideOutputFile,
  resolveDrift,
  type DriftStrategy,
  type SyncDecision,
} from "../core/sync.js";
import { ENGINE_VERSION } from "../core/version.js";
import { assertInteractive, intro, note, outro, select } from "../ui/prompts.js";
import { decisionLine, syncSummary, tallySyncDecision, type SyncCounts } from "../ui/report.js";
import { theme } from "../ui/theme.js";

/** options accepted by the `temper` command. */
export interface TemperOptions {
  dir: string;
  strategy?: DriftStrategy;
}

/** the recorded (new) hash to store in the lock for a single output file. */
interface FileOutcome {
  path: string;
  decision: SyncDecision;
  /** bytes to write, or null to leave the disk file untouched. */
  write: string | Uint8Array | null;
  /** hash to record in the new lockfile, or undefined to drop the entry. */
  recordHash: string | undefined;
  /** true when drift was left unresolved (cancel, or merge before markers are removed). */
  unresolved: boolean;
}

/** prompt the user to choose a drift resolution strategy for a single file. */
async function promptStrategy(path: string): Promise<DriftStrategy> {
  assertInteractive(
    "resolve drift non-interactively with `hephaestus temper --strategy <overwrite|cancel|merge>`.",
  );
  return select<DriftStrategy>(
    `drift on ${theme.conflict(path)} — both the project file and the source changed. resolve how?`,
    [
      { value: "overwrite", label: "overwrite", hint: "replace with the source version" },
      { value: "cancel", label: "cancel", hint: "keep your version, stay flagged next temper" },
      { value: "merge", label: "merge", hint: "write git-style conflict markers" },
    ],
    "cancel",
  );
}

/** decide and apply the sync outcome for one output file. */
async function processFile(
  output: RenderedOutput,
  file: { path: string; contents: string | Uint8Array; hash: string },
  lockfile: Lockfile,
  projectRoot: string,
  options: TemperOptions,
): Promise<FileOutcome> {
  const { decision, lockHash, diskContents } = await decideOutputFile(
    output,
    file,
    lockfile,
    projectRoot,
  );

  if (decision === "create" || decision === "update") {
    return {
      path: file.path,
      decision,
      write: file.contents,
      recordHash: file.hash,
      unresolved: false,
    };
  }
  if (decision === "skip") {
    return { path: file.path, decision, write: null, recordHash: file.hash, unresolved: false };
  }
  if (decision === "keep") {
    // upstream unchanged — preserve the user's edit and existing lock hash.
    return { path: file.path, decision, write: null, recordHash: lockHash, unresolved: false };
  }

  // decision === "drift"
  const strategy: DriftStrategy = options.strategy ?? (await promptStrategy(file.path));
  const resolution = resolveDrift(strategy, diskContents ?? "", file.contents);
  return {
    path: file.path,
    decision,
    write: resolution.write,
    recordHash: resolution.updateLock ? file.hash : lockHash,
    unresolved: !resolution.updateLock,
  };
}

/**
 * run the `temper` command: re-render canonical and reconcile with the project
 * per the three-way decision table, honouring `--strategy`.
 *
 * @param contentOverride - pre-loaded canonical content. when provided,
 *   `loadCanonical` is skipped entirely (useful for testing).
 */
export async function runTemper(
  options: TemperOptions,
  contentOverride?: CanonicalContent,
): Promise<void> {
  const projectRoot: string = resolve(options.dir);

  intro("temper", "heat, then cool - rework what was forged.");

  const lockfile = await readLockfile(
    projectRoot,
    (fromVersion, toVersion) => {
      note(
        `${theme.accent(LOCKFILE_NAME)} is v${fromVersion}, hephaestus expects v${toVersion}.\nbacking up to ${theme.accent(`${LOCKFILE_NAME}.bak`)}, then migrating...`,
        "migrating lockfile",
      );
    },
    (_fromVersion, toVersion) => {
      note(
        `${theme.accent(LOCKFILE_NAME)} migrated to v${toVersion}.\nbackup saved: ${theme.accent(`${LOCKFILE_NAME}.bak`)}`,
        "migration complete",
      );
    },
  );
  if (!lockfile) {
    note(
      `no ${theme.accent(LOCKFILE_NAME)} found. run ${theme.accent("hephaestus forge")} first.`,
      "not provisioned",
    );
    outro("nothing to sync.");
    return;
  }

  const content: CanonicalContent = contentOverride ?? (await loadCanonical(loadConfig()));
  const selection: ProvisionSelection = selectionFromLock(lockfile, content);
  const outputs: RenderedOutput[] = renderAll(content, selection);

  const counts: SyncCounts = { created: 0, updated: 0, skipped: 0, kept: 0, drifted: 0 };
  const lines: string[] = [];
  const recorded: Map<RenderedOutput, Map<string, string>> = new Map();
  let unresolvedCount = 0;

  for (const output of outputs) {
    const fileHashes: Map<string, string> = new Map();
    recorded.set(output, fileHashes);

    for (const file of output.files) {
      const outcome: FileOutcome = await processFile(output, file, lockfile, projectRoot, options);

      tallySyncDecision(counts, outcome.decision);
      if (outcome.unresolved) {
        unresolvedCount += 1;
      }
      if (outcome.decision !== "skip") {
        lines.push(decisionLine(outcome.decision, outcome.path));
      }

      if (outcome.write !== null) {
        await writeFileAtomic(toProjectPath(projectRoot, outcome.path), outcome.write);
      }
      if (outcome.recordHash !== undefined) {
        fileHashes.set(outcome.path, outcome.recordHash);
      }
    }
  }

  if (lines.length > 0) {
    note(lines.join("\n"), "changes");
  }

  const nextLockfile: Lockfile = buildLockfile(
    content,
    outputs,
    selection,
    ENGINE_VERSION,
    recorded,
  );
  await writeLockfile(projectRoot, nextLockfile);

  note(syncSummary(counts), "summary");
  // unresolved drift (cancel, or merge before markers are removed) means the
  // project is still out of sync — fail the run so ci can gate on it. drift
  // resolved via overwrite advances the lock and isn't "unresolved".
  if (unresolvedCount > 0) {
    process.exitCode = 1;
  }
  outro(
    unresolvedCount > 0
      ? "temper complete. resolve any remaining drift and re-run temper."
      : "temper complete.",
  );
}
