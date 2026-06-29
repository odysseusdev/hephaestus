import { resolve } from "node:path";

import { EngineConfigNotFoundError, loadConfig } from "../core/config.js";
import { expandHome, validateCanonDir, writeGlobalConfig } from "../core/globalconfig.js";
import { loadCanonical, type CanonicalContent } from "../core/loader.js";
import { readLockfile, writeLockfile, LOCKFILE_NAME } from "../core/lockfile.js";
import {
  buildLockfile,
  renderAll,
  type ProvisionSelection,
  type RenderedOutput,
} from "../core/provision.js";
import type { EngineConfig } from "../core/schema.js";
import type { HarnessId } from "../core/schema.js";
import { ENGINE_VERSION } from "../core/version.js";
import { ensureHandoffDir, writeOutputs } from "../core/writer.js";
import { availableHarnesses } from "../harnesses/index.js";
import {
  confirm,
  intro,
  multiselect,
  note,
  outro,
  text,
  type PromptOption,
} from "../ui/prompts.js";
import { provisionSummary } from "../ui/report.js";
import { theme } from "../ui/theme.js";

/** Options accepted by the `forge` command. */
export interface ForgeOptions {
  dir: string;
  /** Re-initialise even if a lockfile already exists. */
  force: boolean;
}

/**
 * Run the interactive `forge` command: select agents/harnesses/handoff dir,
 * preview, then write provisioned files and lockfile. Handles the first-run
 * case by prompting for a canon directory when none is configured.
 */
export async function runForge(options: ForgeOptions): Promise<void> {
  const projectRoot: string = resolve(options.dir);

  intro("forge", "strike the anvil — shape canonical source into provisioned harness files.");

  // Resolve config, running the first-time setup flow if no canon dir is configured.
  let config: EngineConfig;
  try {
    config = loadConfig();
  } catch (error: unknown) {
    if (!(error instanceof EngineConfigNotFoundError)) throw error;

    note(
      [
        "no canon directory configured.",
        `enter the path now, or run ${theme.accent("hephaestus bind")} separately.`,
      ].join("\n"),
      "first run",
    );
    const raw: string = await text("path to your canonical content directory?", "~/my-agents");
    const canonDir: string = resolve(expandHome(raw));
    const validationError: string | null = validateCanonDir(canonDir);
    if (validationError) {
      note(theme.danger(validationError), "invalid path");
      outro("cancelled. run hephaestus bind to configure your canon directory.");
      return;
    }
    await writeGlobalConfig({ canonDir });
    note(`tethered to ${theme.accent(canonDir)}`, "canon dir saved");
    config = loadConfig();
  }

  const content: CanonicalContent = await loadCanonical(config);

  const existing = await readLockfile(projectRoot);
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

  const agentOptions: PromptOption<string>[] = [...content.agents.values()].map((agent) => ({
    value: agent.id,
    label: agent.name,
    hint: `${agent.tier} · ${agent.description}`,
  }));
  const agentIds: string[] = await multiselect(
    "which agents do you want to provision?",
    agentOptions,
    agentOptions.map((option) => option.value),
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

  const handoffDir: string = await text(
    "handoff directory (agents read/write handoff files here)?",
    config.defaultHandoffDir,
  );

  const selection: ProvisionSelection = {
    agentIds,
    harnesses,
    handoffDir,
  };

  const outputs: RenderedOutput[] = renderAll(content, selection);
  const fileCount: number = outputs.reduce((total, output) => total + output.files.length, 0);

  note(provisionSummary(outputs), "files to write");

  const proceed: boolean = await confirm(
    `write ${theme.accent(String(fileCount))} file(s) and create ${theme.accent(`${handoffDir}/`)}?`,
  );
  if (!proceed) {
    outro("cancelled. nothing was written.");
    return;
  }

  await writeOutputs(projectRoot, outputs);
  await ensureHandoffDir(projectRoot, handoffDir);

  const lockfile = buildLockfile(content, outputs, selection, ENGINE_VERSION);
  await writeLockfile(projectRoot, lockfile);

  note(
    `${theme.success(`${fileCount} file(s) written`)} across ${harnesses.map((id) => theme.accent(id)).join(", ")}.\nhandoff directory ${theme.accent(`${handoffDir}/`)} created (empty — agents create handoff files at runtime).\nlockfile ${theme.accent(LOCKFILE_NAME)} written.`,
    "done",
  );
  outro("provisioned. run hephaestus temper after editing canonical sources.");
}
