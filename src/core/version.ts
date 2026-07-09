import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * read the engine version from the nearest package.json, walking up from this
 * module. returns `0.0.0` if no version can be determined.
 */
function readEngineVersion(): string {
  let current: string = dirname(fileURLToPath(import.meta.url));

  for (;;) {
    const packageJsonPath: string = resolve(current, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "version" in parsed &&
          typeof (parsed as { version: unknown }).version === "string"
        ) {
          return (parsed as { version: string }).version;
        }
      } catch {
        // fall through to the default if package.json is unreadable.
      }
      return "0.0.0";
    }

    const parent: string = dirname(current);
    if (parent === current) {
      return "0.0.0";
    }
    current = parent;
  }
}

/** the resolved engine (package) version. */
export const ENGINE_VERSION: string = readEngineVersion();
