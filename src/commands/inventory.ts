import { resolve } from "node:path";

import { loadConfig } from "../core/config.js";
import { readFileIfExists, toProjectPath } from "../core/fsops.js";
import { hashContents } from "../core/hash.js";
import { loadCanonical, type CanonicalContent } from "../core/loader.js";
import { readLockfile, type Lockfile } from "../core/lockfile.js";
import {
  previousLockHash,
  renderAll,
  selectionFromLock,
  type ProvisionSelection,
  type RenderedOutput,
} from "../core/provision.js";
import { decideFile, type SyncDecision } from "../core/sync.js";
import { intro, note, outro } from "../ui/prompts.js";
import { decisionLine, syncSummary, tallySyncDecision, type SyncCounts } from "../ui/report.js";
import { bold, theme } from "../ui/theme.js";

/** Options accepted by the `inventory` command. */
export interface InventoryOptions {
  dir: string;
}

/**
 * Run the read-only `inventory` command: show provisioned agents (tier + skills)
 * and any pending drift.
 */
export async function runInventory(options: InventoryOptions): Promise<void> {
  const projectRoot: string = resolve(options.dir);

  intro("inventory", "survey the workshop — catalogue what has been provisioned.");

  const lockfile: Lockfile | null = await readLockfile(projectRoot);
  if (!lockfile) {
    outro("not yet provisioned in this directory. run hephaestus forge.");
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
    `harnesses: ${lockfile.harnesses.map((id) => theme.accent(id)).join(", ")}\nhandoff dir: ${theme.accent(`${lockfile.handoffDir}/`)}`,
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
      const lockHash: string | undefined = previousLockHash(lockfile, output, file.path);
      const diskContents: string | null = await readFileIfExists(
        toProjectPath(projectRoot, file.path),
      );
      const diskHash: string | null = diskContents === null ? null : hashContents(diskContents);
      const decision: SyncDecision = decideFile({ lockHash, diskHash, newHash: file.hash });

      tallySyncDecision(counts, decision);
      if (decision !== "skip") {
        changeLines.push(decisionLine(decision, file.path));
      }
    }
  }

  if (changeLines.length > 0) {
    note(changeLines.join("\n"), "pending (run temper)");
  }
  note(syncSummary(counts), "status");
  outro("read-only. run hephaestus temper to apply pending changes.");
}
