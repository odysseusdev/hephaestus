import { resolve } from "node:path";

import { loadConfig } from "../core/config.js";
import { loadCanonical, type CanonicalContent } from "../core/loader.js";
import { LockfileError, readLockfile, writeLockfile, LOCKFILE_NAME } from "../core/lockfile.js";
import {
  buildLockfile,
  renderAll,
  type ProvisionSelection,
  type RenderedOutput,
} from "../core/provision.js";
import type { CanonicalAgent, EngineConfig, HarnessId } from "../core/schema.js";
import { ENGINE_VERSION } from "../core/version.js";
import { ensureOutputDir, writeOutputs } from "../core/writer.js";
import { availableHarnesses } from "../harnesses/index.js";
import {
  assertInteractive,
  confirm,
  groupMultiselect,
  intro,
  multiselect,
  note,
  outro,
  text,
  type PromptOption,
} from "../ui/prompts.js";
import { agentDescriptionsBlock, groupAgentsByCategory, provisionSummary } from "../ui/report.js";
import { theme } from "../ui/theme.js";

/** options accepted by the `forge` command. */
export interface ForgeOptions {
  dir: string;
  /** re-initialise even if a lockfile already exists. */
  force: boolean;
}

/**
 * run the interactive `forge` command: select agents/harnesses/output dir,
 * preview, then write provisioned files and lockfile.
 */
export async function runForge(options: ForgeOptions): Promise<void> {
  const projectRoot: string = resolve(options.dir);

  intro("forge", "strike the anvil - shape the source into provisioned files.");

  // forge is fully interactive (agent select, harness select, output dir prompt) with no
  // non-interactive equivalent yet, so fail fast with a clear message rather than hanging.
  assertInteractive(
    "forge has no non-interactive mode yet; if this project is already provisioned, run `hephaestus temper --strategy <overwrite|cancel|merge>` instead.",
  );

  const config: EngineConfig = loadConfig();

  const content: CanonicalContent = await loadCanonical(config);

  let existing;
  try {
    existing = await readLockfile(
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
  } catch (error: unknown) {
    if (!(error instanceof LockfileError)) {
      throw error;
    }
    if (!options.force) {
      error.message += "\nre-run with --force to re-initialise from scratch.";
      throw error;
    }
    // a corrupt/unparseable lockfile is not a reason to block `--force`, whose
    // whole point is to re-initialise from scratch — treat it as unprovisioned.
    note(
      `${theme.warn("existing hephaestus.lock.yaml could not be read")} (${error.message}).\nproceeding anyway because --force was passed.`,
      "corrupt lockfile",
    );
    existing = null;
  }

  if (existing && !options.force) {
    note(
      `a ${theme.accent(LOCKFILE_NAME)} already exists in this project.\nre-forging will overwrite the current provisioning. run ${theme.accent("hephaestus temper")} instead to propagate changes only.`,
      "already provisioned",
    );
    const reforge = await confirm("re-forge this project from scratch?", false);
    if (!reforge) {
      outro("nothing to do.");
      return;
    }
  }

  const allAgents: CanonicalAgent[] = [...content.agents.values()];
  const agentGroups: Record<string, PromptOption<string>[]> = {};
  for (const [category, agents] of groupAgentsByCategory(allAgents)) {
    agentGroups[category] = agents.map((agent) => ({
      value: agent.id,
      label: agent.name,
      hint: `${agent.tier} · ${agent.summary}`,
    }));
  }
  note(agentDescriptionsBlock(allAgents), "agent descriptions");
  const agentIds: string[] = await groupMultiselect(
    "which agents do you want to provision?",
    agentGroups,
    [],
  );

  const harnessOptions: PromptOption<HarnessId>[] = availableHarnesses().map((harness) => ({
    value: harness.id,
    label: harness.id,
  }));
  const harnesses: HarnessId[] = await multiselect(
    "which harnesses do you want to target?",
    harnessOptions,
    harnessOptions.map((option) => option.value),
  );

  const outputDir: string = await text(
    "output directory (agents read/write output files here)?",
    config.defaultOutputDir,
  );

  const selection: ProvisionSelection = {
    agentIds,
    harnesses,
    outputDir,
  };

  const outputs: RenderedOutput[] = renderAll(content, selection);
  const fileCount: number = outputs.reduce((total, output) => total + output.files.length, 0);

  note(provisionSummary(outputs), "files to write");

  const proceed: boolean = await confirm(
    `write ${theme.accent(String(fileCount))} file(s) and create ${theme.accent(`${outputDir}/`)}?`,
    false,
  );
  if (!proceed) {
    outro("cancelled. nothing was written.");
    return;
  }

  await writeOutputs(projectRoot, outputs);
  await ensureOutputDir(projectRoot, outputDir);

  const lockfile = buildLockfile(content, outputs, selection, ENGINE_VERSION);
  await writeLockfile(projectRoot, lockfile);

  note(
    `${theme.success(`${fileCount} file(s) written`)} across ${harnesses.map((id) => theme.accent(id)).join(", ")}.\noutput directory ${theme.accent(`${outputDir}/`)} created (agents can define subdirectories at runtime).\nlockfile ${theme.accent(LOCKFILE_NAME)} written.`,
    "done",
  );
  outro("provisioned. run hephaestus temper after editing canonical sources.");
}
