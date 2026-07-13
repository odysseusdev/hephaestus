import { posix, resolve } from "node:path";

import { removeDir, removeFile, toProjectPath, tryRemoveEmptyDir } from "../core/fsops.js";
import { LOCKFILE_NAME, readLockfile, type LockOutput, type Lockfile } from "../core/lockfile.js";
import { confirm, intro, note, outro } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";

/** options accepted by the `quench` command. */
export interface QuenchOptions {
  dir: string;
  force: boolean;
}

/** all paths collected from the lockfile that quench will remove. */
interface TrackedPaths {
  /** project-root-relative POSIX paths of every provisioned file. */
  filePaths: string[];
  /** base directories of multi-file skill outputs, candidates for rmdir. */
  skillDirs: Set<string>;
}

/**
 * walk the lockfile and collect every tracked file path, plus skill output
 * base dirs so empty dirs can be pruned afterward.
 */
function collectTrackedPaths(lockfile: Lockfile): TrackedPaths {
  const filePaths: string[] = [];
  const skillDirs = new Set<string>();

  for (const agentLock of Object.values(lockfile.agents)) {
    for (const output of Object.values(agentLock.outputs)) {
      if (output) {
        filePaths.push(output.path);
      }
    }
  }

  for (const skillLock of Object.values(lockfile.skills)) {
    for (const lockOutput of Object.values(skillLock.outputs) as (LockOutput | undefined)[]) {
      if (!lockOutput) continue;
      const baseDir = posix.dirname(lockOutput.path);
      skillDirs.add(baseDir);
      if (lockOutput.files) {
        for (const relPath of Object.keys(lockOutput.files)) {
          filePaths.push(posix.join(baseDir, relPath));
        }
      } else {
        filePaths.push(lockOutput.path);
      }
    }
  }

  return { filePaths, skillDirs };
}

/**
 * run the `quench` command: remove all provisioned files, clean up empty skill
 * dirs, delete the lockfile, and optionally remove the output directory.
 */
export async function runQuench(options: QuenchOptions): Promise<void> {
  const projectRoot = resolve(options.dir);

  intro("quench", "put out the forge - dissolve the provisioning entirely.");

  const lockfile: Lockfile | null = await readLockfile(
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
      `no ${theme.accent(LOCKFILE_NAME)} found.\nrun ${theme.accent("hephaestus forge")} first, or check the target directory.`,
      "not provisioned",
    );
    outro("nothing to do.");
    return;
  }

  const { filePaths, skillDirs } = collectTrackedPaths(lockfile);

  note(
    "this cannot be undone. the only way back is re-forging from the canonical source, which will not recover any edits you made to these files.",
    "irreversible",
  );

  const deleteLines: string[] = [
    ...filePaths.map((path) => `${theme.danger("−")} ${theme.text(path)}`),
    `${theme.danger("−")} ${theme.text(LOCKFILE_NAME)}`,
  ];
  note(deleteLines.join("\n"), "files to remove");

  const totalFiles = filePaths.length + 1; // +1 for the lockfile
  const proceed = options.force
    ? true
    : await confirm(
        `permanently delete ${theme.accent(String(totalFiles))} file(s) from ${theme.accent(options.dir)}?`,
        false,
      );
  if (!proceed) {
    outro("cancelled. nothing was removed.");
    return;
  }

  let removed = 0;
  let alreadyGone = 0;
  for (const relativePath of filePaths) {
    const deleted = await removeFile(toProjectPath(projectRoot, relativePath));
    if (deleted) {
      removed += 1;
    } else {
      alreadyGone += 1;
    }
  }

  // try to remove empty skill directories (non-recursive, best-effort).
  for (const relDir of skillDirs) {
    await tryRemoveEmptyDir(toProjectPath(projectRoot, relDir));
  }

  // lockfile last — deleting it is the point of no return.
  await removeFile(toProjectPath(projectRoot, LOCKFILE_NAME));

  const outputDir = lockfile.outputDir;
  const removeOutput = options.force
    ? false
    : await confirm(
        `also remove output directory ${theme.accent(`${outputDir}/`)}? (may contain agent runtime files)`,
        false,
      );
  if (removeOutput) {
    await removeDir(toProjectPath(projectRoot, outputDir));
    note(`${theme.danger(`${outputDir}/`)} removed.`, "output");
  }

  const summary: string[] = [
    theme.danger(`${removed} file(s) removed`),
    `lockfile ${theme.accent(LOCKFILE_NAME)} deleted`,
    ...(alreadyGone > 0 ? [theme.muted(`${alreadyGone} already absent`)] : []),
  ];
  note(summary.join("\n"), "done");
  outro("quenched. run hephaestus forge to provision again.");
}
