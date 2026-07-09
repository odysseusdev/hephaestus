import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// Mock only `applyMigrations` so migration tests can inject a fake v0 -> v1
// transform without a real second lockfile schema existing yet, while every
// other test in this file defaults to the *real* implementation (wired up in
// the mock factory below) so the empty-map baseline is exercised for real.
const applyMigrationsMock = vi.hoisted(() => vi.fn());

vi.mock("../src/core/lockfile-migrations.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/lockfile-migrations.js")>();
  applyMigrationsMock.mockImplementation(actual.applyMigrations);
  return { ...actual, applyMigrations: applyMigrationsMock };
});

const { readLockfile, LockfileError, LockfileTooNewError, LOCKFILE_VERSION, LOCKFILE_NAME } =
  await import("../src/core/lockfile.js");
const { applyMigrations: realApplyMigrations } =
  await vi.importActual<typeof import("../src/core/lockfile-migrations.js")>(
    "../src/core/lockfile-migrations.js",
  );
const { ENGINE_VERSION } = await import("../src/core/version.js");

/** A minimal, schema-valid v1 lockfile object. */
function validLockfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: LOCKFILE_VERSION,
    engineVersion: "1.0.0",
    outputDir: "docs",
    harnesses: ["claude"],
    agents: {},
    skills: {},
    ...overrides,
  };
}

let projectRoot: string;
let lockPath: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "heph-lockfile-"));
  lockPath = join(projectRoot, LOCKFILE_NAME);
  applyMigrationsMock.mockReset();
  applyMigrationsMock.mockImplementation(realApplyMigrations);
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

async function writeRawLockfile(data: Record<string, unknown>): Promise<void> {
  await writeFile(lockPath, stringifyYaml(data), "utf8");
}

describe("readLockfile — no file", () => {
  it("returns null when no lockfile exists", async () => {
    expect(await readLockfile(projectRoot)).toBeNull();
  });
});

describe("readLockfile — equal version (no regression)", () => {
  it("validates and returns the lockfile unchanged when versions match", async () => {
    await writeRawLockfile(validLockfile());

    const result = await readLockfile(projectRoot);

    expect(result).toEqual(validLockfile());
  });

  it("does not invoke the migration machinery or an onMigrate callback", async () => {
    await writeRawLockfile(validLockfile());
    const onMigrate = vi.fn();

    await readLockfile(projectRoot, onMigrate);

    expect(applyMigrationsMock).not.toHaveBeenCalled();
    expect(onMigrate).not.toHaveBeenCalled();
  });

  it("still throws LockfileError with issue detail for an equal-version file with a bad shape", async () => {
    await writeRawLockfile({ version: LOCKFILE_VERSION, engineVersion: "1.0.0" }); // missing required fields

    await expect(readLockfile(projectRoot)).rejects.toThrow(LockfileError);
    await expect(readLockfile(projectRoot)).rejects.toThrow(/failed validation/);
  });
});

describe("readLockfile — on-disk version newer than LOCKFILE_VERSION", () => {
  it("throws LockfileTooNewError naming the writer's engineVersion and the current CLI version", async () => {
    await writeRawLockfile({
      version: LOCKFILE_VERSION + 1,
      engineVersion: "9.9.9",
      outputDir: "docs",
    });

    await expect(readLockfile(projectRoot)).rejects.toThrow(LockfileTooNewError);
    await expect(readLockfile(projectRoot)).rejects.toThrow(
      new RegExp(`written by hephaestus 9\\.9\\.9.*running ${ENGINE_VERSION.replace(/\./g, "\\.")}`),
    );
  });

  it("degrades gracefully to 'an unknown version' when engineVersion is absent", async () => {
    await writeRawLockfile({ version: LOCKFILE_VERSION + 1 });

    await expect(readLockfile(projectRoot)).rejects.toThrow(/written by hephaestus an unknown version/);
  });

  it("is NOT an instanceof LockfileError — a sibling type, not a subclass", async () => {
    await writeRawLockfile({ version: LOCKFILE_VERSION + 1, engineVersion: "9.9.9" });

    try {
      await readLockfile(projectRoot);
      expect.unreachable("expected readLockfile to throw");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LockfileTooNewError);
      expect(error).not.toBeInstanceOf(LockfileError);
    }
  });

  it("does not call the migration machinery or onMigrate", async () => {
    await writeRawLockfile({ version: LOCKFILE_VERSION + 1, engineVersion: "9.9.9" });
    const onMigrate = vi.fn();

    await expect(readLockfile(projectRoot, onMigrate)).rejects.toThrow(LockfileTooNewError);
    expect(applyMigrationsMock).not.toHaveBeenCalled();
    expect(onMigrate).not.toHaveBeenCalled();
  });
});

describe("readLockfile — on-disk version older than LOCKFILE_VERSION", () => {
  it("throws LockfileError when no migration is registered for the gap (real, unmocked empty map)", async () => {
    await writeRawLockfile({ version: 0, engineVersion: "0.9.0" });

    await expect(readLockfile(projectRoot)).rejects.toThrow(LockfileError);
    await expect(readLockfile(projectRoot)).rejects.toThrow(/could not be migrated/);
  });

  it("migrates, fires onMigrate with the correct from/to versions, writes back, and returns valid data", async () => {
    const onDiskV0 = { version: 0, engineVersion: "0.9.0", legacyField: "old-shape" };
    await writeRawLockfile(onDiskV0);

    const migratedShape = validLockfile({ engineVersion: "0.9.0" });
    applyMigrationsMock.mockReturnValueOnce(migratedShape);

    const onMigrate = vi.fn();
    const result = await readLockfile(projectRoot, onMigrate);

    expect(onMigrate).toHaveBeenCalledExactlyOnceWith(0, LOCKFILE_VERSION);
    expect(applyMigrationsMock).toHaveBeenCalledWith(onDiskV0, 0, LOCKFILE_VERSION);
    expect(result).toEqual(migratedShape);

    // write-back: re-reading raw bytes off disk shows the upgraded version, not v0.
    const { readFile } = await import("node:fs/promises");
    const onDisk: unknown = parseYaml(await readFile(lockPath, "utf8"));
    expect((onDisk as { version: number }).version).toBe(LOCKFILE_VERSION);
    expect((onDisk as { legacyField?: string }).legacyField).toBeUndefined();
  });

  it("fires onMigrate even when the migrated shape ultimately fails strict validation", async () => {
    await writeRawLockfile({ version: 0, engineVersion: "0.9.0" });
    applyMigrationsMock.mockReturnValueOnce({ version: LOCKFILE_VERSION }); // missing required fields

    const onMigrate = vi.fn();

    await expect(readLockfile(projectRoot, onMigrate)).rejects.toThrow(LockfileError);
    expect(onMigrate).toHaveBeenCalledExactlyOnceWith(0, LOCKFILE_VERSION);
  });

  it("works with no onMigrate callback passed at all", async () => {
    await writeRawLockfile({ version: 0, engineVersion: "0.9.0" });
    applyMigrationsMock.mockReturnValueOnce(validLockfile());

    await expect(readLockfile(projectRoot)).resolves.toEqual(validLockfile());
  });
});

describe("readLockfile — version field undeterminable", () => {
  it("falls through to strict validation (and its own clear error) when version is missing", async () => {
    await writeRawLockfile({ engineVersion: "1.0.0", outputDir: "docs" });

    await expect(readLockfile(projectRoot)).rejects.toThrow(LockfileError);
  });

  it("falls through to strict validation when version is not a number", async () => {
    await writeRawLockfile({ version: "not-a-number", engineVersion: "1.0.0" });

    await expect(readLockfile(projectRoot)).rejects.toThrow(LockfileError);
  });
});
