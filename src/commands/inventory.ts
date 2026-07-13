import { resolve } from "node:path";

import { loadConfig } from "../core/config.js";
import { loadCanonical, type CanonicalContent } from "../core/loader.js";
import { LOCKFILE_NAME, readLockfile, type Lockfile } from "../core/lockfile.js";
import {
  renderAll,
  selectionFromLock,
  type ProvisionSelection,
  type RenderedOutput,
} from "../core/provision.js";
import { decideOutputFile } from "../core/sync.js";
import { intro, note, outro } from "../ui/prompts.js";
import { decisionLine, syncSummary, tallySyncDecision, type SyncCounts } from "../ui/report.js";
import { bold, theme } from "../ui/theme.js";

/** options accepted by the `inventory` command. */
export interface InventoryOptions {
  dir: string;
}

/**
 * run the read-only `inventory` command: show provisioned agents (tier + skills)
 * and any pending drift.
 */
export async function runInventory(options: InventoryOptions): Promise<void> {
  const projectRoot: string = resolve(options.dir);

  intro("inventory", "survey the work - catalogue what has been provisioned.");

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
      `no ${theme.accent(LOCKFILE_NAME)} found. run ${theme.accent("hephaestus forge")} first.`,
      "not provisioned",
    );
    outro("nothing to show.");
    return;
  }

  const agentLines: string[] = Object.entries(lockfile.agents).map(([agentId, agentLock]) => {
    const skills: string =
      agentLock.skills.length > 0
        ? agentLock.skills.map((id) => theme.accentAlt(id)).join(", ")
        : theme.muted("none");
    return `${bold(theme.text(agentId))}  ${theme.accent(agentLock.tier)}\n  ${theme.muted("skills:")} ${skills}`;
  });
  note(agentLines.join("\n"), "agents");

  note(
    `harnesses: ${lockfile.harnesses.map((id) => theme.accent(id)).join(", ")}\noutput dir: ${theme.accent(`${lockfile.outputDir}/`)}`,
    "provisioned",
  );

  const config = loadConfig();
  const content: CanonicalContent = await loadCanonical(config);
  const selection: ProvisionSelection = selectionFromLock(lockfile, content);

  const outputs: RenderedOutput[] = renderAll(content, selection);
  const counts: SyncCounts = { created: 0, updated: 0, skipped: 0, kept: 0, drifted: 0 };
  const changeLines: string[] = [];

  for (const output of outputs) {
    for (const file of output.files) {
      const { decision } = await decideOutputFile(output, file, lockfile, projectRoot);

      tallySyncDecision(counts, decision);
      if (decision !== "skip") {
        changeLines.push(decisionLine(decision, file.path));
      }
    }
  }

  if (changeLines.length > 0) {
    note(changeLines.join("\n"), "pending (run temper)");
    // read-only: any pending change means the project is out of sync with
    // canonical — fail the run so ci can gate on it.
    process.exitCode = 1;
  }
  note(syncSummary(counts), "status");
  outro("read-only. run hephaestus temper to apply pending changes.");
}
