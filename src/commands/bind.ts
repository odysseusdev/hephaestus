import { resolve } from "node:path";

import {
  expandHome,
  GLOBAL_CONFIG_PATH,
  validateCanonDir,
  writeGlobalConfig,
} from "../core/globalconfig.js";
import { assertInteractive, intro, note, outro, text } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";

/** Options accepted by the `bind` command. */
export interface BindOptions {
  /** Optional path provided as a positional argument. Prompts interactively if absent. */
  path?: string;
}

/**
 * Resolve a raw (possibly `~`-prefixed) path to an absolute canon directory and
 * validate it. Prints the themed error and cancellation outro on failure so
 * both the `--path` and interactive branches of `runBind` behave identically.
 *
 * @returns The resolved absolute path, or `null` if validation failed (the
 *   caller should return immediately in that case).
 */
function resolveAndValidate(raw: string): string | null {
  const canonDir: string = resolve(expandHome(raw));
  const validationError: string | null = validateCanonDir(canonDir);
  if (validationError) {
    note(theme.danger(validationError), "invalid path");
    outro("bind cancelled.");
    process.exitCode = 1;
    return null;
  }
  return canonDir;
}

/**
 * Run the `bind` command: set or update the global canonical content directory.
 * When a path is provided it is validated immediately; otherwise the user is
 * prompted interactively.
 */
export async function runBind(options: BindOptions): Promise<void> {
  intro("bind", "anchor the workshop - bind to a canonical source.");

  if (!options.path) {
    assertInteractive("pass the path directly instead: `hephaestus bind <path>`.");
  }

  const raw: string =
    options.path ??
    (await text("path to your canonical agents and skills directory?", "~/my-agents"));

  const canonDir: string | null = resolveAndValidate(raw);
  if (canonDir === null) {
    return;
  }

  await writeGlobalConfig({ canonDir });

  note(
    [
      `${theme.success("canon directory:")} ${theme.accent(canonDir)}`,
      `${theme.muted("config:")} ${theme.muted(GLOBAL_CONFIG_PATH)}`,
    ].join("\n"),
    "bound",
  );
  outro("run hephaestus forge to provision agents into a project.");
}
