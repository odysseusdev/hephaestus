import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ENGINE_VERSION } from "../src/core/version.js";

const rootDir: string = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("ENGINE_VERSION", () => {
  it("matches the version declared in package.json", () => {
    const packageJson: { version: string } = JSON.parse(
      readFileSync(resolve(rootDir, "package.json"), "utf8"),
    );
    expect(ENGINE_VERSION).toBe(packageJson.version);
  });

  it("is a well-formed semantic version", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
