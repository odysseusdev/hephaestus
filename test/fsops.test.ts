import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  describeError,
  ensureDir,
  readFileIfExists,
  removeDir,
  removeFile,
  toProjectPath,
  tryRemoveEmptyDir,
  writeFileAtomic,
} from "../src/core/fsops.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "heph-fsops-"));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("toProjectPath", () => {
  it("resolves a simple relative POSIX path under the project root", () => {
    expect(toProjectPath(projectRoot, "docs/plan.md")).toBe(join(projectRoot, "docs", "plan.md"));
  });

  it("converts forward slashes to the OS-native separator", () => {
    expect(toProjectPath(projectRoot, "a/b/c.md")).toBe(join(projectRoot, "a", "b", "c.md"));
  });

  it("allows the project root itself", () => {
    expect(toProjectPath(projectRoot, ".")).toBe(projectRoot);
  });

  it("rejects a `../` escape above the project root", () => {
    expect(() => toProjectPath(projectRoot, "../../etc/evil")).toThrow(/outside the project root/);
  });

  it("rejects a `../` escape that lands exactly one level above the root", () => {
    expect(() => toProjectPath(projectRoot, "..")).toThrow(/outside the project root/);
  });

  it("rejects an absolute path passed as the relative path", () => {
    expect(() => toProjectPath(projectRoot, "/etc/evil")).toThrow(/outside the project root/);
  });

  it("rejects a relative escape to a sibling directory sharing a name prefix", () => {
    // A naive `startsWith(root)` check (without appending the path separator)
    // would wrongly treat "<root>-evil" as being inside "<root>" since the
    // string itself is a prefix match.
    const escapePath = `../${basename(projectRoot)}-evil`;
    expect(() => toProjectPath(projectRoot, escapePath)).toThrow(/outside the project root/);
  });
});

describe("readFileIfExists / writeFileAtomic", () => {
  it("returns null when the file does not exist", async () => {
    expect(await readFileIfExists(join(projectRoot, "missing.txt"))).toBeNull();
  });

  it("round-trips UTF-8 text losslessly", async () => {
    const filePath = join(projectRoot, "note.md");
    await writeFileAtomic(filePath, "hello — café\n");
    const contents = await readFileIfExists(filePath);
    expect(contents?.toString("utf8")).toBe("hello — café\n");
  });

  it("round-trips binary bytes losslessly", async () => {
    const filePath = join(projectRoot, "asset.bin");
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0xfe, 0x7f, 0x80]);
    await writeFileAtomic(filePath, bytes);
    const contents = await readFileIfExists(filePath);
    expect(contents).toEqual(bytes);
  });

  it("creates parent directories as needed", async () => {
    const filePath = join(projectRoot, "a", "b", "c.md");
    await writeFileAtomic(filePath, "nested");
    expect((await stat(filePath)).isFile()).toBe(true);
  });

  it("rejects a non-absolute path", async () => {
    await expect(writeFileAtomic("relative/path.md", "x")).rejects.toThrow(/absolute path/);
  });

  it("leaves no temp file behind after a successful write", async () => {
    const filePath = join(projectRoot, "clean.md");
    await writeFileAtomic(filePath, "content");
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(projectRoot);
    expect(entries).toEqual(["clean.md"]);
  });
});

describe("removeFile", () => {
  it("returns true and deletes an existing file", async () => {
    const filePath = join(projectRoot, "gone.md");
    await writeFileAtomic(filePath, "x");
    expect(await removeFile(filePath)).toBe(true);
    expect(await readFileIfExists(filePath)).toBeNull();
  });

  it("returns false for a file that does not exist", async () => {
    expect(await removeFile(join(projectRoot, "never-existed.md"))).toBe(false);
  });
});

describe("tryRemoveEmptyDir", () => {
  it("removes an empty directory", async () => {
    const dirPath = join(projectRoot, "empty");
    await ensureDir(dirPath);
    await tryRemoveEmptyDir(dirPath);
    await expect(stat(dirPath)).rejects.toThrow();
  });

  it("silently ignores a non-empty directory", async () => {
    const dirPath = join(projectRoot, "full");
    await mkdir(dirPath, { recursive: true });
    await writeFileAtomic(join(dirPath, "file.md"), "x");
    await tryRemoveEmptyDir(dirPath);
    expect((await stat(dirPath)).isDirectory()).toBe(true);
  });

  it("silently ignores a directory that does not exist", async () => {
    await expect(tryRemoveEmptyDir(join(projectRoot, "missing"))).resolves.toBeUndefined();
  });
});

describe("removeDir", () => {
  it("removes a directory and everything inside it", async () => {
    const dirPath = join(projectRoot, "tree");
    await writeFileAtomic(join(dirPath, "nested", "file.md"), "x");
    await removeDir(dirPath);
    await expect(stat(dirPath)).rejects.toThrow();
  });

  it("does not throw when the directory does not exist", async () => {
    await expect(removeDir(join(projectRoot, "missing"))).resolves.toBeUndefined();
  });
});

describe("describeError", () => {
  it("returns the message of an Error instance", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("stringifies a non-Error thrown value", () => {
    expect(describeError("plain string")).toBe("plain string");
    expect(describeError(42)).toBe("42");
  });
});
