import { resolve } from "node:path";

import {
  expandHome,
  GLOBAL_CONFIG_PATH,
  validateCanonDir,
  writeGlobalConfig,
} from "../core/globalconfig.js";
import { intro, note, outro, text } from "../ui/prompts.js";
import { theme } from "../ui/theme.js";

/** Options accepted by the `bind` command. */
export interface BindOptions {
  /** Optional path provided as a positional argument. Prompts interactively if absent. */
  path?: string;
}

/**
 * Run the `bind` command: set or update the global canonical content directory.
 * When a path is provided it is validated immediately; otherwise the user is
 * prompted interactively.
 */
export async function runBind(options: BindOptions): Promise<void> {
  intro("bind", "anchor the workshop - bind to a canonical source.");

  let canonDir: string;

  if (options.path) {
    canonDir = resolve(expandHome(options.path));
    const validationError: string | null = validateCanonDir(canonDir);
    if (validationError) {
      note(theme.danger(validationError), "invalid path");
      outro("bind cancelled.");
      process.exitCode = 1;
      return;
    }
  } else {
    const raw: string = await text(
      "path to your canonical agents and skills directory?",
      "~/my-agents",
    );
    canonDir = resolve(expandHome(raw));
    const validationError: string | null = validateCanonDir(canonDir);
    if (validationError) {
      note(theme.danger(validationError), "invalid path");
      outro("bind cancelled.");
      process.exitCode = 1;
      return;
    }
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
