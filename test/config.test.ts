import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `loadConfig` falls back to `readGlobalConfig()`, which by default reads the
// developer's *real* `~/.config/hephaestus/config.json`. Mock it so tests never
// depend on (or touch) that real file, while keeping every other export
// (`validateCanonDir`, `expandHome`) real.
const readGlobalConfigMock = vi.hoisted(() => vi.fn(() => null as { canonDir: string } | null));

vi.mock("../src/core/globalconfig.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/globalconfig.js")>();
  return { ...actual, readGlobalConfig: readGlobalConfigMock };
});

const { CONTENT_DIR_ENV, DEFAULT_OUTPUT_DIR, EngineConfigNotFoundError, loadConfig } =
  await import("../src/core/config.js");

// vitest.config.ts sets this for the whole suite; save/restore it around each
// test here so this file's manipulation doesn't leak into other test files.
const ORIGINAL_ENV: string | undefined = process.env[CONTENT_DIR_ENV];

let canonDir: string;

beforeEach(async () => {
  canonDir = await mkdtemp(join(tmpdir(), "heph-config-"));
  await mkdir(join(canonDir, "agents"), { recursive: true });
  await mkdir(join(canonDir, "skills"), { recursive: true });
  readGlobalConfigMock.mockReset().mockReturnValue(null);
});

afterEach(async () => {
  await rm(canonDir, { recursive: true, force: true });
  if (ORIGINAL_ENV === undefined) {
    delete process.env[CONTENT_DIR_ENV];
  } else {
    process.env[CONTENT_DIR_ENV] = ORIGINAL_ENV;
  }
});

describe("loadConfig", () => {
  it("resolves contentDir from HEPHAESTUS_CANON_DIR when set, ignoring the global config", () => {
    process.env[CONTENT_DIR_ENV] = canonDir;
    readGlobalConfigMock.mockReturnValue({ canonDir: "/should/not/be/used" });

    const config = loadConfig();

    expect(config.contentDir).toBe(canonDir);
    expect(config.defaultOutputDir).toBe(DEFAULT_OUTPUT_DIR);
    expect(readGlobalConfigMock).not.toHaveBeenCalled();
  });

  it("treats an empty-string env var as unset, falling through to the global config", () => {
    process.env[CONTENT_DIR_ENV] = "";
    readGlobalConfigMock.mockReturnValue({ canonDir });

    expect(loadConfig().contentDir).toBe(canonDir);
  });

  it("falls back to the global config when the env var is unset", () => {
    delete process.env[CONTENT_DIR_ENV];
    readGlobalConfigMock.mockReturnValue({ canonDir });

    expect(loadConfig().contentDir).toBe(canonDir);
  });

  it("throws EngineConfigNotFoundError naming both remediation paths when neither source is set", () => {
    delete process.env[CONTENT_DIR_ENV];
    readGlobalConfigMock.mockReturnValue(null);

    expect(() => loadConfig()).toThrow(EngineConfigNotFoundError);
    expect(() => loadConfig()).toThrow(/hephaestus bind/);
    expect(() => loadConfig()).toThrow(new RegExp(CONTENT_DIR_ENV));
  });

  it("throws when the resolved directory does not exist on disk", () => {
    process.env[CONTENT_DIR_ENV] = join(canonDir, "does-not-exist");

    expect(() => loadConfig()).toThrow(/does not exist/);
  });

  it("throws when the resolved directory is missing agents/ (same shape check as bind)", async () => {
    const bareDir = await mkdtemp(join(tmpdir(), "heph-config-bare-"));
    try {
      await mkdir(join(bareDir, "skills"), { recursive: true });
      process.env[CONTENT_DIR_ENV] = bareDir;

      expect(() => loadConfig()).toThrow(/agents/);
    } finally {
      await rm(bareDir, { recursive: true, force: true });
    }
  });

  it("throws when the resolved directory is missing skills/ (same shape check as bind)", async () => {
    const noSkillsDir = await mkdtemp(join(tmpdir(), "heph-config-noskills-"));
    try {
      await mkdir(join(noSkillsDir, "agents"), { recursive: true });
      process.env[CONTENT_DIR_ENV] = noSkillsDir;

      expect(() => loadConfig()).toThrow(/skills/);
    } finally {
      await rm(noSkillsDir, { recursive: true, force: true });
    }
  });
});
