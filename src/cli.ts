import { Command } from "commander";

import { runForge } from "./commands/forge.js";
import { runInventory } from "./commands/inventory.js";
import { runBind } from "./commands/bind.js";
import { runQuench } from "./commands/quench.js";
import { runTemper } from "./commands/temper.js";
import { ENGINE_VERSION } from "./core/version.js";
import type { DriftStrategy } from "./core/sync.js";
import { bold, dim, theme } from "./ui/theme.js";

/** Valid drift strategies accepted by `--strategy`. */
const DRIFT_STRATEGIES: readonly DriftStrategy[] = ["overwrite", "cancel", "merge"];

/** Parse and validate a `--strategy` value. */
function parseStrategy(value: string): DriftStrategy {
  if (!DRIFT_STRATEGIES.includes(value as DriftStrategy)) {
    throw new Error(`invalid --strategy "${value}". use one of: ${DRIFT_STRATEGIES.join(", ")}.`);
  }
  return value as DriftStrategy;
}

/** Print a themed, actionable error line for an unknown thrown value. */
function printError(error: unknown): void {
  const message: string = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n${theme.danger("✖")} ${message}\n`);
}

/** Run an async command, printing a clean error and exiting non-zero on failure. */
async function guard(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    printError(error);
    process.exitCode = 1;
  }
}

/** Build and configure the commander CLI program. */
function buildProgram(): Command {
  const program = new Command();

  const helpBanner = [
    "",
    `  ${theme.fire("󰈸")}  ${bold(theme.accent("hephaestus"))}  ${dim("·")}  ${dim(ENGINE_VERSION)}`,
    "",
  ].join("\n");

  program.addHelpText("before", helpBanner);

  program.configureHelp({
    styleTitle: (str: string): string => bold(theme.accent(str)),
    styleUsage: (str: string): string => bold(theme.text(str)),
    styleCommandDescription: (str: string): string => theme.muted(str),
    styleOptionTerm: (str: string): string => theme.text(str),
    styleOptionDescription: (str: string): string => theme.muted(str),
    styleSubcommandTerm: (str: string): string => theme.accent(str),
    styleSubcommandDescription: (str: string): string => theme.muted(str),
  });

  program
    .name("hephaestus")
    .description("write ai agents once in markdown, forge them for your coding harness.")
    .version(ENGINE_VERSION, "-v, --version");

  program
    .command("bind [path]")
    .description("bind the workshop to a canonical content directory.")
    .action((path?: string) => guard(() => runBind({ path })));

  program
    .command("forge")
    .description("provision agents and skills into a project (interactive).")
    .option("-d, --dir <dir>", "target project directory", ".")
    .option("-f, --force", "re-initialise even if a lockfile already exists", false)
    .action((options: { dir: string; force: boolean }) =>
      guard(() => runForge({ dir: options.dir, force: options.force })),
    );

  program
    .command("temper")
    .description("re-render from canonical and reconcile with the project.")
    .option("-d, --dir <dir>", "target project directory", ".")
    .option("--dry-run", "compute and report changes without writing", false)
    .option(
      "--strategy <strategy>",
      "non-interactive drift strategy: overwrite | cancel | merge",
      parseStrategy,
    )
    .action((options: { dir: string; dryRun: boolean; strategy?: DriftStrategy }) =>
      guard(() =>
        runTemper({ dir: options.dir, dryRun: options.dryRun, strategy: options.strategy }),
      ),
    );

  program
    .command("inventory")
    .description("show provisioned agents/skills and any pending drift.")
    .option("-d, --dir <dir>", "target project directory", ".")
    .action((options: { dir: string }) => guard(() => runInventory({ dir: options.dir })));

  program
    .command("quench")
    .description("remove all provisioned agents, skills and the lockfile from a project.")
    .option("-d, --dir <dir>", "target project directory", ".")
    .action((options: { dir: string }) => guard(() => runQuench({ dir: options.dir })));

  return program;
}

/**
 * Parse `argv` and dispatch to the matched command, catching any error thrown
 * synchronously during commander's own parse phase (e.g. a custom option parser
 * rejecting an invalid `--strategy` value) — those otherwise escape `guard()`
 * entirely and print a raw Node stack trace instead of the themed error line.
 */
async function main(): Promise<void> {
  try {
    await buildProgram().parseAsync(process.argv);
  } catch (error: unknown) {
    printError(error);
    process.exitCode = 1;
  }
}

await main();
