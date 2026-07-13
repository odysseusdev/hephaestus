import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `forge` is fully interactive; drive every prompt programmatically instead of
// needing a real TTY. `assertInteractive` is mocked too so the happy-path
// tests don't bail out early on vitest's own non-TTY stdin.
const assertInteractiveMock = vi.hoisted(() => vi.fn());
const textMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const multiselectMock = vi.hoisted(() => vi.fn());
const groupMultiselectMock = vi.hoisted(() => vi.fn());
const noteMock = vi.hoisted(() => vi.fn());
const outroMock = vi.hoisted(() => vi.fn());
const introMock = vi.hoisted(() => vi.fn());

vi.mock("../src/ui/prompts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/prompts.js")>();
  return {
    ...actual,
    assertInteractive: assertInteractiveMock,
    text: textMock,
    confirm: confirmMock,
    multiselect: multiselectMock,
    groupMultiselect: groupMultiselectMock,
    note: noteMock,
    outro: outroMock,
    intro: introMock,
  };
});

// Capture the `onMigrateStart`/`onMigrateComplete` callbacks `runForge` passes
// to `readLockfile`, while still delegating to the real implementation —
// proves the wiring without needing a real registered migration to exist yet.
const readLockfileArgsSpy = vi.hoisted(() => vi.fn());

vi.mock("../src/core/lockfile.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/lockfile.js")>();
  return {
    ...actual,
    readLockfile: (async (
      projectRoot: string,
      onMigrateStart?: (fromVersion: number, toVersion: number) => void,
      onMigrateComplete?: (fromVersion: number, toVersion: number) => void,
    ) => {
      readLockfileArgsSpy(projectRoot, onMigrateStart, onMigrateComplete);
      return actual.readLockfile(projectRoot, onMigrateStart, onMigrateComplete);
    }) as typeof actual.readLockfile,
  };
});

// `loadConfig` normally succeeds immediately in this suite because
// vitest.config.ts sets HEPHAESTUS_CANON_DIR to the bundled examples/ dir.
// Mock it so an `EngineConfigNotFoundError` (or any other loadConfig error)
// can still be exercised on demand via `mockImplementationOnce`.
const loadConfigMock = vi.hoisted(() => vi.fn());

vi.mock("../src/core/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/config.js")>();
  return { ...actual, loadConfig: loadConfigMock };
});

const { runForge } = await import("../src/commands/forge.js");
// Import the *real* implementation directly (bypassing the mock above) so the
// default mock behaviour in `beforeEach` is "act like the real thing".
const { EngineConfigNotFoundError, loadConfig: realLoadConfig } =
  await vi.importActual<typeof import("../src/core/config.js")>("../src/core/config.js");
const { LOCKFILE_VERSION } = await import("../src/core/lockfile.js");
const { ENGINE_VERSION } = await import("../src/core/version.js");

const AGENT_FILE = ".claude/agents/agent-creator.md";
const LOCKFILE_PATH = "hephaestus.lock.yaml";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "heph-forge-"));

  for (const mock of [
    assertInteractiveMock,
    textMock,
    confirmMock,
    multiselectMock,
    groupMultiselectMock,
    noteMock,
    outroMock,
    introMock,
    readLockfileArgsSpy,
  ]) {
    mock.mockReset();
  }
  assertInteractiveMock.mockImplementation(() => undefined);
  loadConfigMock.mockImplementation(realLoadConfig);
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

async function exists(relativePath: string): Promise<boolean> {
  try {
    await stat(join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

/** Wire up the mocks for a standard "select agent-creator/claude/docs, then confirm" run. */
function mockStandardSelection(outputDir = "docs"): void {
  groupMultiselectMock.mockResolvedValueOnce(["agent-creator"]);
  multiselectMock.mockResolvedValueOnce(["claude"]);
  textMock.mockResolvedValueOnce(outputDir);
}

describe("runForge", () => {
  it("throws a clear error instead of hanging when stdin is not a TTY", async () => {
    assertInteractiveMock.mockImplementationOnce(() => {
      throw new Error(
        "this command needs an interactive terminal to prompt for input, but stdin is not a TTY.",
      );
    });

    await expect(runForge({ dir: projectRoot, force: false })).rejects.toThrow(
      /interactive terminal/,
    );
    expect(groupMultiselectMock).not.toHaveBeenCalled();
  });

  it("rethrows an unrelated loadConfig error", async () => {
    loadConfigMock.mockImplementationOnce(() => {
      throw new Error("canonical content directory does not exist: /nope");
    });

    await expect(runForge({ dir: projectRoot, force: false })).rejects.toThrow(
      /canonical content directory does not exist/,
    );
    expect(textMock).not.toHaveBeenCalled();
  });

  it("lets EngineConfigNotFoundError propagate directly instead of prompting for a canon dir", async () => {
    loadConfigMock.mockImplementationOnce(() => {
      throw new EngineConfigNotFoundError();
    });

    await expect(runForge({ dir: projectRoot, force: false })).rejects.toThrow(
      /run `hephaestus bind` to set one up/,
    );
    expect(textMock).not.toHaveBeenCalled();
    expect(groupMultiselectMock).not.toHaveBeenCalled();
  });

  it("prompts to re-forge when a lockfile already exists and does nothing on decline", async () => {
    mockStandardSelection();
    confirmMock.mockResolvedValueOnce(true);
    await runForge({ dir: projectRoot, force: false });
    expect(await exists(AGENT_FILE)).toBe(true);

    noteMock.mockClear();
    outroMock.mockClear();
    confirmMock.mockReset();
    confirmMock.mockResolvedValueOnce(false); // decline the re-forge prompt

    await runForge({ dir: projectRoot, force: false });

    expect(outroMock).toHaveBeenCalledWith(expect.stringContaining("nothing to do"));
    expect(groupMultiselectMock).toHaveBeenCalledTimes(1); // not called again on the second run
  });

  it("re-forges when the user confirms the overwrite prompt", async () => {
    mockStandardSelection();
    confirmMock.mockResolvedValueOnce(true);
    await runForge({ dir: projectRoot, force: false });

    confirmMock.mockReset();
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true); // reforge, then write
    mockStandardSelection("other-output");

    await runForge({ dir: projectRoot, force: false });

    expect(await exists(AGENT_FILE)).toBe(true);
    expect(await exists("other-output")).toBe(true);
  });

  it("skips the reforge prompt entirely when --force is passed", async () => {
    mockStandardSelection();
    confirmMock.mockResolvedValueOnce(true);
    await runForge({ dir: projectRoot, force: false });

    noteMock.mockClear();
    confirmMock.mockReset();
    confirmMock.mockResolvedValueOnce(true); // only the final write confirmation
    mockStandardSelection();

    await runForge({ dir: projectRoot, force: true });

    const titles: (string | undefined)[] = noteMock.mock.calls.map(([, title]) => title);
    expect(titles).not.toContain("already provisioned");
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it("treats a corrupt lockfile as unprovisioned when --force is passed", async () => {
    await writeFile(join(projectRoot, LOCKFILE_PATH), "not: [valid, yaml", "utf8");
    mockStandardSelection();
    confirmMock.mockResolvedValueOnce(true);

    await runForge({ dir: projectRoot, force: true });

    const titles: (string | undefined)[] = noteMock.mock.calls.map(([, title]) => title);
    expect(titles).toContain("corrupt lockfile");
    expect(await exists(AGENT_FILE)).toBe(true);
  });

  it("wires onMigrateStart/onMigrateComplete callbacks to readLockfile that print themed migration notes", async () => {
    mockStandardSelection();
    confirmMock.mockResolvedValueOnce(true);

    await runForge({ dir: projectRoot, force: false });

    expect(readLockfileArgsSpy).toHaveBeenCalledTimes(1);
    const [, onMigrateStart, onMigrateComplete] = readLockfileArgsSpy.mock.calls[0]!;
    expect(typeof onMigrateStart).toBe("function");
    expect(typeof onMigrateComplete).toBe("function");

    noteMock.mockClear();
    (onMigrateStart as (from: number, to: number) => void)(1, 2);

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining(LOCKFILE_PATH),
      "migrating lockfile",
    );
    const [startMessage] = noteMock.mock.calls[0]!;
    expect(String(startMessage)).toContain("v1");
    expect(String(startMessage)).toContain("v2");

    noteMock.mockClear();
    (onMigrateComplete as (from: number, to: number) => void)(1, 2);

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining(LOCKFILE_PATH),
      "migration complete",
    );
    const [completeMessage] = noteMock.mock.calls[0]!;
    expect(String(completeMessage)).toContain("v2");
  });

  it("rethrows a corrupt lockfile error with a --force recovery hint when --force is not passed", async () => {
    await writeFile(join(projectRoot, LOCKFILE_PATH), "not: [valid, yaml", "utf8");

    await expect(runForge({ dir: projectRoot, force: false })).rejects.toThrow(
      /not valid YAML[\s\S]*re-run with --force to re-initialise from scratch\./,
    );
    expect(groupMultiselectMock).not.toHaveBeenCalled();
  });

  it("rethrows a too-new lockfile error even when --force is passed (not swallowed like corrupt lockfiles)", async () => {
    await writeFile(
      join(projectRoot, LOCKFILE_PATH),
      `version: ${LOCKFILE_VERSION + 1}\nengineVersion: 9.9.9\n`,
      "utf8",
    );

    await expect(runForge({ dir: projectRoot, force: true })).rejects.toThrow(
      new RegExp(
        `written by hephaestus 9\\.9\\.9.*running ${ENGINE_VERSION.replace(/\./g, "\\.")}`,
      ),
    );
    expect(groupMultiselectMock).not.toHaveBeenCalled();
    // Must not be reported as "corrupt lockfile" like a genuine LockfileError would be.
    const titles: (string | undefined)[] = noteMock.mock.calls.map(([, title]) => title);
    expect(titles).not.toContain("corrupt lockfile");
  });

  it("cancels without writing anything when the user declines the final write confirmation", async () => {
    mockStandardSelection();
    confirmMock.mockResolvedValueOnce(false);

    await runForge({ dir: projectRoot, force: false });

    expect(outroMock).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
    expect(await exists(AGENT_FILE)).toBe(false);
    expect(await exists(LOCKFILE_PATH)).toBe(false);
    // the final write confirmation must default to false, like every other
    // impactful confirmation prompt in the codebase.
    const [, defaultValue] = confirmMock.mock.calls.at(-1)!;
    expect(defaultValue).toBe(false);
  });

  it("writes provisioned files, the output dir, and the lockfile on a full happy path", async () => {
    mockStandardSelection();
    confirmMock.mockResolvedValueOnce(true);

    await runForge({ dir: projectRoot, force: false });

    expect(await exists(AGENT_FILE)).toBe(true);
    expect(await exists("docs")).toBe(true);
    expect(await exists(LOCKFILE_PATH)).toBe(true);

    const doneCall = noteMock.mock.calls.find(([, title]) => title === "done");
    expect(doneCall?.[0]).toContain("file(s) written");
    expect(doneCall?.[0]).toContain("claude");
  });
});
