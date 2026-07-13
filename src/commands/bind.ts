import { resolve } from "node:path";

import {
  expandHome,
  GLOBAL_CONFIG_PATH,
  readGlobalConfig,
  validateCanonDir,
  writeGlobalConfig,
} from "../core/globalconfig.js";
import { assertInteractive, confirm, intro, note, outro, text } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";

/** options accepted by the `bind` command. */
export interface BindOptions {
  /** optional path provided as a positional argument. prompts interactively if absent. */
  path?: string;
  /** rebind even if a different canonical source is already bound. */
  force: boolean;
}

/**
 * resolve a raw (possibly `~`-prefixed) path to an absolute canonical source and
 * validate it. prints the themed error and cancellation outro on failure so
 * both the `--path` and interactive branches of `runBind` behave identically.
 *
 * @returns the resolved absolute path, or `null` if validation failed (the
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
 * run the `bind` command: set or update the global canonical source.
 * when a path is provided it is validated immediately; otherwise the user is
 * prompted interactively.
 */
export async function runBind(options: BindOptions): Promise<void> {
  intro("bind", "anchor the workshop - bind to a canonical source.");

  if (!options.path) {
    assertInteractive("pass the path directly instead: `hephaestus bind <path>`.");
  }

  const raw: string = options.path ?? (await text("path to your canonical source?", "~/my-agents"));

  const canonDir: string | null = resolveAndValidate(raw);
  if (canonDir === null) {
    return;
  }

  const existing = readGlobalConfig();
  if (existing && existing.canonDir !== canonDir && !options.force) {
    note(
      `currently bound to ${theme.accent(existing.canonDir)}.\nrebinding will replace it with ${theme.accent(canonDir)}.`,
      "already bound",
    );
    const rebind = await confirm("rebind to the new directory?", false);
    if (!rebind) {
      outro("bind cancelled.");
      return;
    }
  }

  await writeGlobalConfig({ canonDir });

  note(
    [
      `${theme.success("canonical source:")} ${theme.accent(canonDir)}`,
      `${theme.muted("config:")} ${theme.muted(GLOBAL_CONFIG_PATH)}`,
    ].join("\n"),
    "bound",
  );
  outro("run hephaestus forge to provision agents into a project.");
}
