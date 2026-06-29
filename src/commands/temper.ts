import { resolve } from "node:path";

import { loadConfig } from "../core/config.js";
import { readFileIfExists, toProjectPath, writeFileAtomic } from "../core/fsops.js";
import { hashContents } from "../core/hash.js";
import { loadCanonical, type CanonicalContent } from "../core/loader.js";
import { LOCKFILE_NAME, readLockfile, writeLockfile, type Lockfile } from "../core/lockfile.js";
import {
  buildLockfile,
  previousLockHash,
  renderAll,
  selectionFromLock,
  type ProvisionSelection,
  type RenderedOutput,
} from "../core/provision.js";
import { decideFile, resolveDrift, type DriftStrategy, type SyncDecision } from "../core/sync.js";
import { ENGINE_VERSION } from "../core/version.js";
import { intro, note, outro, select } from "../ui/prompts.js";
import { decisionLine, syncSummary, tallySyncDecision, type SyncCounts } from "../ui/report.js";
import { dim, theme } from "../ui/theme.js";

/** Options accepted by the `temper` command. */
export interface TemperOptions {
  dir: string;
  dryRun: boolean;
  strategy?: DriftStrategy;
}

/** The recorded (new) hash to store in the lock for a single output file. */
interface FileOutcome {
  path: string;
  decision: SyncDecision;
  /** Bytes to write, or null to leave the disk file untouched. */
  write: string | null;
  /** Hash to record in the new lockfile, or undefined to drop the entry. */
  recordHash: string | undefined;
}

/** Prompt the user to choose a drift resolution strategy for a single file. */
async function promptStrategy(path: string): Promise<DriftStrategy> {
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

/** Decide and (unless dry-run) apply the sync outcome for one output file. */
async function processFile(
  output: RenderedOutput,
  file: { path: string; contents: string; hash: string },
  lockfile: Lockfile,
  projectRoot: string,
  options: TemperOptions,
): Promise<FileOutcome> {
  const lockHash: string | undefined = previousLockHash(lockfile, output, file.path);
  const diskContents: string | null = await readFileIfExists(toProjectPath(projectRoot, file.path));
  const diskHash: string | null = diskContents === null ? null : hashContents(diskContents);

  const decision: SyncDecision = decideFile({ lockHash, diskHash, newHash: file.hash });

  if (decision === "create" || decision === "update") {
    return { path: file.path, decision, write: file.contents, recordHash: file.hash };
  }
  if (decision === "skip") {
    return { path: file.path, decision, write: null, recordHash: file.hash };
  }
  if (decision === "keep") {
    // Upstream unchanged — preserve the user's edit and existing lock hash.
    return { path: file.path, decision, write: null, recordHash: lockHash };
  }

  // decision === "drift"
  if (options.dryRun) {
    return { path: file.path, decision, write: null, recordHash: lockHash };
  }

  const strategy: DriftStrategy = options.strategy ?? (await promptStrategy(file.path));
  const resolution = resolveDrift(strategy, diskContents ?? "", file.contents);
  return {
    path: file.path,
    decision,
    write: resolution.write,
    recordHash: resolution.updateLock ? file.hash : lockHash,
  };
}

/**
 * Run the `temper` command: re-render canonical and reconcile with the project
 * per the three-way decision table, honouring `--dry-run` and `--strategy`.
 *
 * @param contentOverride - Pre-loaded canonical content. When provided,
 *   `loadCanonical` is skipped entirely (useful for testing).
 */
export async function runTemper(
  options: TemperOptions,
  contentOverride?: CanonicalContent,
): Promise<void> {
  const projectRoot: string = resolve(options.dir);

  intro(
    `temper${options.dryRun ? dim("  dry run") : ""}`,
    "heat, then cool — rework what was forged.",
  );

  const lockfile = await readLockfile(projectRoot);
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

  for (const output of outputs) {
    const fileHashes: Map<string, string> = new Map();
    recorded.set(output, fileHashes);

    for (const file of output.files) {
      const outcome: FileOutcome = await processFile(output, file, lockfile, projectRoot, options);

      tallySyncDecision(counts, outcome.decision);
      if (outcome.decision !== "skip") {
        lines.push(decisionLine(outcome.decision, outcome.path));
      }

      if (outcome.write !== null && !options.dryRun) {
        await writeFileAtomic(toProjectPath(projectRoot, outcome.path), outcome.write);
      }
      if (outcome.recordHash !== undefined) {
        fileHashes.set(outcome.path, outcome.recordHash);
      }
    }
  }

  if (lines.length > 0) {
    note(lines.join("\n"), options.dryRun ? "planned changes" : "changes");
  }

  if (!options.dryRun) {
    const nextLockfile: Lockfile = buildLockfile(
      content,
      outputs,
      selection,
      ENGINE_VERSION,
      recorded,
    );
    await writeLockfile(projectRoot, nextLockfile);
  }

  note(syncSummary(counts), "summary");
  outro(
    options.dryRun
      ? "dry run complete. no files were written."
      : counts.drifted > 0
        ? "temper complete. resolve any remaining drift and re-run temper."
        : "temper complete.",
  );
}
