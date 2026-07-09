import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the arguments `runTemper` passes to `readLockfile` (in particular the
// `onMigrate` callback) while still delegating to the real implementation, so
// these tests can prove the command *wires up* the migration notice correctly
// without needing a real registered migration to exist yet.
const readLockfileArgsSpy = vi.hoisted(() => vi.fn());

vi.mock("../src/core/lockfile.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/lockfile.js")>();
  return {
    ...actual,
    readLockfile: (async (
      projectRoot: string,
      onMigrate?: (fromVersion: number, toVersion: number) => void,
    ) => {
      readLockfileArgsSpy(projectRoot, onMigrate);
      return actual.readLockfile(projectRoot, onMigrate);
    }) as typeof actual.readLockfile,
  };
});

const noteMock = vi.hoisted(() => vi.fn());

vi.mock("../src/ui/prompts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/prompts.js")>();
  return { ...actual, note: noteMock, intro: vi.fn(), outro: vi.fn() };
});

const { runTemper } = await import("../src/commands/temper.js");
const { LOCKFILE_NAME } = await import("../src/core/lockfile.js");

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "heph-temper-"));
  noteMock.mockClear();
  readLockfileArgsSpy.mockClear();
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("runTemper — lockfile migration notice wiring", () => {
  it("passes an onMigrate callback to readLockfile", async () => {
    await runTemper({ dir: projectRoot, dryRun: true });

    expect(readLockfileArgsSpy).toHaveBeenCalledTimes(1);
    const [, onMigrate] = readLockfileArgsSpy.mock.calls[0]!;
    expect(typeof onMigrate).toBe("function");
  });

  it("the wired callback prints a themed migration note naming the from/to versions", async () => {
    await runTemper({ dir: projectRoot, dryRun: true });

    const [, onMigrate] = readLockfileArgsSpy.mock.calls[0]!;
    noteMock.mockClear();

    (onMigrate as (from: number, to: number) => void)(1, 2);

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining(LOCKFILE_NAME),
      "migrating lockfile",
    );
    const [message] = noteMock.mock.calls[0]!;
    expect(String(message)).toContain("v1");
    expect(String(message)).toContain("v2");
  });
});
