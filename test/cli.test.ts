import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const rootDir: string = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH: string = resolve(rootDir, "dist/cli.js");

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run the *built* CLI binary as a real subprocess, capturing stdout/stderr/exit code. */
async function runCli(args: string[], env: Record<string, string> = {}): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.code ?? 1,
    };
  }
}

describe("dist/cli.js smoke test", () => {
  beforeAll(async () => {
    if (!existsSync(CLI_PATH)) {
      // Building here (rather than assuming CI already ran `npm run build`) keeps
      // this test runnable standalone, at the cost of a slower first run.
      await execFileAsync("npm", ["run", "build"], { cwd: rootDir });
    }
  }, 60_000);

  it("--version exits 0 and prints the package version", async () => {
    const packageJson: { version: string } = JSON.parse(
      await readFile(resolve(rootDir, "package.json"), "utf8"),
    );

    const { stdout, exitCode } = await runCli(["--version"]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(packageJson.version);
  });

  it("--help exits 0 and lists every top-level command", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("hephaestus");
    for (const command of ["bind", "forge", "temper", "inventory", "quench"]) {
      expect(stdout).toContain(command);
    }
  });

  it("an unknown command exits non-zero without a raw Node stack trace", async () => {
    const { stderr, exitCode } = await runCli(["not-a-real-command"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });

  it("an invalid --strategy value fails cleanly through the themed error path, not a raw stack trace", async () => {
    const { stderr, exitCode } = await runCli(["temper", "--strategy", "bogus"]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("invalid --strategy");
    expect(stderr).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });

  describe("non-TTY interactive commands", () => {
    let projectDir: string;

    beforeAll(async () => {
      projectDir = await mkdtemp(join(tmpdir(), "heph-cli-smoke-"));
    });

    afterAll(async () => {
      await rm(projectDir, { recursive: true, force: true });
    });

    it("`forge` fails fast with a clear message instead of hanging on closed stdin", async () => {
      const { stderr, exitCode } = await runCli(["forge", "--dir", projectDir]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("interactive terminal");
      expect(stderr).not.toMatch(/at .*\(.*:\d+:\d+\)/);
    });

    it("`bind` with no path argument fails fast with a clear message on closed stdin", async () => {
      const { stderr, exitCode } = await runCli(["bind"]);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("interactive terminal");
    });
  });
});
