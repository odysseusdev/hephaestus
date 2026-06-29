import { defineConfig } from "tsup";

/**
 * Build configuration. Two separate configs keep the shebang scoped to the CLI
 * entry only — applying it globally would break bundlers that parse dist/index.js
 * as a library.
 */
export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    target: "node18",
    platform: "node",
    clean: true,
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node18",
    platform: "node",
    dts: true,
    sourcemap: true,
  },
]);
