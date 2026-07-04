import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir: string = dirname(fileURLToPath(import.meta.url));

/**
 * Test configuration. Tests live under /test and exercise the pure core modules
 * (loader, render, sync three-way table) plus per-harness transpile output.
 * HEPHAESTUS_CANON_DIR points at the bundled examples/ directory so tests do
 * not depend on a global user config file.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: false,
    env: {
      HEPHAESTUS_CANON_DIR: resolve(rootDir, "examples"),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
