import { describe, expect, it } from "vitest";

import {
  applyMigrations,
  LOCKFILE_MIGRATIONS,
  type LockfileMigration,
} from "../src/core/lockfile-migrations.js";

describe("LOCKFILE_MIGRATIONS", () => {
  it("is empty today because LOCKFILE_VERSION is still 1 — there is no v0 to migrate from", () => {
    expect(LOCKFILE_MIGRATIONS).toEqual({});
  });
});

describe("applyMigrations", () => {
  it("returns the data unchanged when fromVersion === toVersion", () => {
    const data = { version: 1, hello: "world" };
    expect(applyMigrations(data, 1, 1)).toBe(data);
  });

  it("applies a single injected migration step", () => {
    const fakeMigrations: Record<number, LockfileMigration> = {
      1: (old) => ({ ...(old as Record<string, unknown>), version: 2, addedField: "new" }),
    };

    const result = applyMigrations({ version: 1, keep: "me" }, 1, 2, fakeMigrations);

    expect(result).toEqual({ version: 2, keep: "me", addedField: "new" });
  });

  it("chains multiple injected migration steps in sequence, oldest to newest", () => {
    const fakeMigrations: Record<number, LockfileMigration> = {
      1: (old) => ({ ...(old as Record<string, unknown>), version: 2, step: 1 }),
      2: (old) => ({ ...(old as Record<string, unknown>), version: 3, step: 2 }),
    };

    const result = applyMigrations({ version: 1 }, 1, 3, fakeMigrations);

    expect(result).toEqual({ version: 3, step: 2 });
  });

  it("throws when a migration step is missing from the chain", () => {
    const fakeMigrations: Record<number, LockfileMigration> = {
      1: (old) => ({ ...(old as Record<string, unknown>), version: 2 }),
      // no entry for version 2 -> 3
    };

    expect(() => applyMigrations({ version: 1 }, 1, 3, fakeMigrations)).toThrow(
      /no migration registered to upgrade from lockfile version 2 to 3/,
    );
  });

  it("defaults to the real LOCKFILE_MIGRATIONS map when none is injected", () => {
    // With an empty real map, requesting any actual step throws — proving the
    // default parameter wires up to the module-level export, not a stub.
    expect(() => applyMigrations({ version: 1 }, 1, 2)).toThrow(/no migration registered/);
  });
});
