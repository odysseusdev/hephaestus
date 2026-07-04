import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  expandHome,
  readGlobalConfig,
  validateCanonDir,
  writeGlobalConfig,
} from "../src/core/globalconfig.js";

let tempDir: string;
let configPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "heph-globalcfg-"));
  configPath = join(tempDir, "config.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("readGlobalConfig", () => {
  it("returns null when the file does not exist", () => {
    expect(readGlobalConfig(configPath)).toBeNull();
  });

  it("returns the config when the file is valid", async () => {
    await writeGlobalConfig({ canonDir: tempDir }, configPath);
    const config = readGlobalConfig(configPath);
    expect(config?.canonDir).toBe(tempDir);
  });

  it("throws when the file is not valid JSON", async () => {
    await writeFile(configPath, "not json", "utf8");
    expect(() => readGlobalConfig(configPath)).toThrow(/not valid JSON/);
  });

  it("throws when the file has the wrong shape", async () => {
    await writeFile(configPath, JSON.stringify({ wrongField: "x" }), "utf8");
    expect(() => readGlobalConfig(configPath)).toThrow(/failed validation/);
  });

  it("throws when canonDir is an empty string", async () => {
    await writeFile(configPath, JSON.stringify({ canonDir: "" }), "utf8");
    expect(() => readGlobalConfig(configPath)).toThrow(/failed validation/);
  });

  it("throws when canonDir is a relative path", async () => {
    await writeFile(configPath, JSON.stringify({ canonDir: "relative/path" }), "utf8");
    expect(() => readGlobalConfig(configPath)).toThrow(/absolute/);
  });

  it("wraps an IO error (e.g. permission denied) with a friendly 'failed to read' message", async () => {
    // Root bypasses file permission bits on most systems, making this
    // unreliable when the test process itself runs as root (e.g. some CI/container setups).
    if (process.getuid?.() === 0) {
      return;
    }
    await writeFile(configPath, JSON.stringify({ canonDir: tempDir }), "utf8");
    await chmod(configPath, 0o000);
    try {
      expect(() => readGlobalConfig(configPath)).toThrow(/Failed to read/);
    } finally {
      await chmod(configPath, 0o644);
    }
  });
});

describe("writeGlobalConfig", () => {
  it("round-trips the config", async () => {
    const cfg = { canonDir: "/some/absolute/path" };
    await writeGlobalConfig(cfg, configPath);
    expect(readGlobalConfig(configPath)).toEqual(cfg);
  });

  it("rejects a relative canonDir", async () => {
    await expect(writeGlobalConfig({ canonDir: "relative/path" }, configPath)).rejects.toThrow(
      /absolute/,
    );
  });

  it("creates parent directories", async () => {
    const nestedPath: string = join(tempDir, "a", "b", "config.json");
    await writeGlobalConfig({ canonDir: "/x" }, nestedPath);
    expect(readGlobalConfig(nestedPath)?.canonDir).toBe("/x");
  });

  it("overwrites an existing config", async () => {
    await writeGlobalConfig({ canonDir: "/old" }, configPath);
    await writeGlobalConfig({ canonDir: "/new" }, configPath);
    expect(readGlobalConfig(configPath)?.canonDir).toBe("/new");
  });
});

describe("validateCanonDir", () => {
  it("returns null for a valid canon directory", async () => {
    await mkdir(join(tempDir, "agents"), { recursive: true });
    await mkdir(join(tempDir, "skills"), { recursive: true });
    expect(validateCanonDir(tempDir)).toBeNull();
  });

  it("returns an error when the directory does not exist", () => {
    expect(validateCanonDir("/definitely/does/not/exist/heph-test")).not.toBeNull();
    expect(validateCanonDir("/definitely/does/not/exist/heph-test")).toMatch(/does not exist/);
  });

  it("returns an error when agents/ is missing", async () => {
    await mkdir(join(tempDir, "skills"), { recursive: true });
    expect(validateCanonDir(tempDir)).toMatch(/agents/);
  });

  it("returns an error when skills/ is missing", async () => {
    await mkdir(join(tempDir, "agents"), { recursive: true });
    expect(validateCanonDir(tempDir)).toMatch(/skills/);
  });
});

describe("expandHome", () => {
  it("expands a leading ~/ to the home directory", () => {
    const home: string = process.env["HOME"] ?? "";
    expect(expandHome("~/foo/bar")).toBe(join(home, "foo/bar"));
  });

  it("expands a bare ~ to the home directory", () => {
    const home: string = process.env["HOME"] ?? "";
    expect(expandHome("~")).toBe(join(home, ""));
  });

  it("leaves paths without a leading ~ unchanged", () => {
    expect(expandHome("/absolute/path")).toBe("/absolute/path");
    expect(expandHome("relative/path")).toBe("relative/path");
  });
});
