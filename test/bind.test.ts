import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runBind } from "../src/commands/bind.js";

// `runBind` writes to the *real* global config path (`~/.config/hephaestus/config.json`)
// by default. Mock `writeGlobalConfig`/`readGlobalConfig` so unit tests never touch the
// developer's actual global config, while keeping every other export (validation, `~`
// expansion) real.
const writeGlobalConfigMock = vi.hoisted(() => vi.fn(async () => undefined));
const readGlobalConfigMock = vi.hoisted(() => vi.fn(() => null as { canonDir: string } | null));

vi.mock("../src/core/globalconfig.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/globalconfig.js")>();
  return {
    ...actual,
    writeGlobalConfig: writeGlobalConfigMock,
    readGlobalConfig: readGlobalConfigMock,
  };
});

// `confirm` drives the "already bound" prompt. Mock it separately from the rest of
// `../ui/prompts.js` so cases that never reach the prompt keep using the real
// `assertInteractive`/`note`/`outro`/`text` implementations.
const confirmMock = vi.hoisted(() => vi.fn(async () => false));

vi.mock("../src/ui/prompts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/prompts.js")>();
  return { ...actual, confirm: confirmMock };
});

let canonDir: string;

beforeEach(async () => {
  canonDir = await mkdtemp(join(tmpdir(), "heph-bind-"));
  await mkdir(join(canonDir, "agents"), { recursive: true });
  await mkdir(join(canonDir, "skills"), { recursive: true });
  writeGlobalConfigMock.mockClear();
  readGlobalConfigMock.mockReset().mockReturnValue(null);
  confirmMock.mockReset().mockResolvedValue(false);
});

afterEach(async () => {
  await rm(canonDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe("runBind", () => {
  it("writes the global config when given a valid path", async () => {
    await runBind({ path: canonDir, force: false });
    expect(writeGlobalConfigMock).toHaveBeenCalledWith({ canonDir });
  });

  it("does not write the config and sets a non-zero exit code for a path missing agents/skills", async () => {
    const invalid = await mkdtemp(join(tmpdir(), "heph-bind-invalid-"));
    try {
      await runBind({ path: invalid, force: false });
      expect(writeGlobalConfigMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    } finally {
      await rm(invalid, { recursive: true, force: true });
    }
  });

  it("does not write the config for a path that does not exist", async () => {
    await runBind({ path: join(canonDir, "does-not-exist"), force: false });
    expect(writeGlobalConfigMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("throws a clear error instead of hanging when no path is given and stdin is not a TTY", async () => {
    await expect(runBind({ force: false })).rejects.toThrow(/interactive terminal/);
    expect(writeGlobalConfigMock).not.toHaveBeenCalled();
  });

  describe("rebinding over an existing config", () => {
    it("binds without prompting when no global config exists yet", async () => {
      readGlobalConfigMock.mockReturnValue(null);

      await runBind({ path: canonDir, force: false });

      expect(confirmMock).not.toHaveBeenCalled();
      expect(writeGlobalConfigMock).toHaveBeenCalledWith({ canonDir });
    });

    it("binds without prompting when the existing canonDir is unchanged", async () => {
      readGlobalConfigMock.mockReturnValue({ canonDir });

      await runBind({ path: canonDir, force: false });

      expect(confirmMock).not.toHaveBeenCalled();
      expect(writeGlobalConfigMock).toHaveBeenCalledWith({ canonDir });
    });

    it("prompts and rebinds when a different canonDir is already bound and the user confirms", async () => {
      const otherDir = await mkdtemp(join(tmpdir(), "heph-bind-other-"));
      try {
        readGlobalConfigMock.mockReturnValue({ canonDir: otherDir });
        confirmMock.mockResolvedValue(true);

        await runBind({ path: canonDir, force: false });

        expect(confirmMock).toHaveBeenCalledWith("rebind to the new directory?", false);
        expect(writeGlobalConfigMock).toHaveBeenCalledWith({ canonDir });
      } finally {
        await rm(otherDir, { recursive: true, force: true });
      }
    });

    it("does not write the config and prints a cancellation outro when the user declines to rebind", async () => {
      const otherDir = await mkdtemp(join(tmpdir(), "heph-bind-other-"));
      try {
        readGlobalConfigMock.mockReturnValue({ canonDir: otherDir });
        confirmMock.mockResolvedValue(false);

        await runBind({ path: canonDir, force: false });

        expect(confirmMock).toHaveBeenCalled();
        expect(writeGlobalConfigMock).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
      } finally {
        await rm(otherDir, { recursive: true, force: true });
      }
    });

    it("binds without prompting when --force is passed, regardless of the existing canonDir", async () => {
      const otherDir = await mkdtemp(join(tmpdir(), "heph-bind-other-"));
      try {
        readGlobalConfigMock.mockReturnValue({ canonDir: otherDir });

        await runBind({ path: canonDir, force: true });

        expect(confirmMock).not.toHaveBeenCalled();
        expect(writeGlobalConfigMock).toHaveBeenCalledWith({ canonDir });
      } finally {
        await rm(otherDir, { recursive: true, force: true });
      }
    });
  });
});
