import { describe, expect, it } from "vitest";

import {
  buildConflictMarkers,
  CONFLICT_MARKERS,
  decideFile,
  resolveDrift,
  type SyncDecision,
} from "../src/core/sync.js";

const A = "sha256:aaa";
const B = "sha256:bbb";
const C = "sha256:ccc";

describe("decideFile — three-way decision table", () => {
  it("skips when disk == lock and new == lock", () => {
    expect(decideFile({ lockHash: A, diskHash: A, newHash: A })).toBe<SyncDecision>("skip");
  });

  it("updates on a clean upstream change (disk == lock, new != lock)", () => {
    expect(decideFile({ lockHash: A, diskHash: A, newHash: B })).toBe<SyncDecision>("update");
  });

  it("keeps a user edit when upstream is unchanged (disk != lock, new == lock)", () => {
    expect(decideFile({ lockHash: A, diskHash: B, newHash: A })).toBe<SyncDecision>("keep");
  });

  it("flags drift when both changed to different values", () => {
    expect(decideFile({ lockHash: A, diskHash: B, newHash: C })).toBe<SyncDecision>("drift");
  });

  it("flags drift when both disk and new diverged from lock, even if equal to each other", () => {
    expect(decideFile({ lockHash: A, diskHash: B, newHash: B })).toBe<SyncDecision>("drift");
  });

  it("creates when the file is missing on disk (tracked)", () => {
    expect(decideFile({ lockHash: A, diskHash: null, newHash: A })).toBe<SyncDecision>("create");
  });

  it("creates when the file is missing on disk (untracked)", () => {
    expect(decideFile({ lockHash: undefined, diskHash: null, newHash: A })).toBe<SyncDecision>(
      "create",
    );
  });

  it("skips an untracked file already matching the new render", () => {
    expect(decideFile({ lockHash: undefined, diskHash: A, newHash: A })).toBe<SyncDecision>("skip");
  });

  it("flags drift for an untracked file that differs from the new render", () => {
    expect(decideFile({ lockHash: undefined, diskHash: B, newHash: A })).toBe<SyncDecision>(
      "drift",
    );
  });
});

describe("resolveDrift", () => {
  const project = "project version\n";
  const source = "source version\n";

  it("overwrite writes the source and advances the lock", () => {
    expect(resolveDrift("overwrite", project, source)).toEqual({
      write: source,
      updateLock: true,
    });
  });

  it("cancel writes nothing and does not advance the lock", () => {
    expect(resolveDrift("cancel", project, source)).toEqual({ write: null, updateLock: false });
  });

  it("merge writes conflict markers and does not advance the lock", () => {
    const result = resolveDrift("merge", project, source);
    expect(result.updateLock).toBe(false);
    expect(result.write).toContain(CONFLICT_MARKERS.start);
    expect(result.write).toContain(CONFLICT_MARKERS.middle);
    expect(result.write).toContain(CONFLICT_MARKERS.end);
    expect(result.write).toContain("project version");
    expect(result.write).toContain("source version");
  });
});

describe("buildConflictMarkers", () => {
  it("places project on top and source below, with markers and trailing newlines", () => {
    const merged = buildConflictMarkers("mine", "theirs");
    expect(merged).toBe(
      `${CONFLICT_MARKERS.start}\nmine\n${CONFLICT_MARKERS.middle}\ntheirs\n${CONFLICT_MARKERS.end}\n`,
    );
  });

  it("does not double trailing newlines when inputs already end with one", () => {
    const merged = buildConflictMarkers("mine\n", "theirs\n");
    expect(merged).toBe(
      `${CONFLICT_MARKERS.start}\nmine\n${CONFLICT_MARKERS.middle}\ntheirs\n${CONFLICT_MARKERS.end}\n`,
    );
  });
});
