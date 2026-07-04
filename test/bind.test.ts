import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runBind } from "../src/commands/bind.js";

// `runBind` writes to the *real* global config path (`~/.config/hephaestus/config.json`)
// by default. Mock `writeGlobalConfig` so unit tests never touch the developer's
// actual global config, while keeping every other export (validation, `~`
// expansion) real.
const writeGlobalConfigMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../src/core/globalconfig.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/globalconfig.js")>();
  return { ...actual, writeGlobalConfig: writeGlobalConfigMock };
});

let canonDir: string;

beforeEach(async () => {
  canonDir = await mkdtemp(join(tmpdir(), "heph-bind-"));
  await mkdir(join(canonDir, "agents"), { recursive: true });
  await mkdir(join(canonDir, "skills"), { recursive: true });
  writeGlobalConfigMock.mockClear();
});

afterEach(async () => {
  await rm(canonDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe("runBind", () => {
  it("writes the global config when given a valid path", async () => {
    await runBind({ path: canonDir });
    expect(writeGlobalConfigMock).toHaveBeenCalledWith({ canonDir });
  });

  it("does not write the config and sets a non-zero exit code for a path missing agents/skills", async () => {
    const invalid = await mkdtemp(join(tmpdir(), "heph-bind-invalid-"));
    try {
      await runBind({ path: invalid });
      expect(writeGlobalConfigMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    } finally {
      await rm(invalid, { recursive: true, force: true });
    }
  });

  it("does not write the config for a path that does not exist", async () => {
    await runBind({ path: join(canonDir, "does-not-exist") });
    expect(writeGlobalConfigMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("throws a clear error instead of hanging when no path is given and stdin is not a TTY", async () => {
    await expect(runBind({})).rejects.toThrow(/interactive terminal/);
    expect(writeGlobalConfigMock).not.toHaveBeenCalled();
  });
});
