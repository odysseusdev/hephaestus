import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Unit-level tests below import `src/cli.ts` directly to exercise command
// dispatch, `guard`, and `printError` for coverage of the real TypeScript
// source — something the subprocess smoke tests above can't do, since a
// spawned child process isn't instrumented by the parent's coverage collector.
// The five command modules are mocked so dispatch can be asserted without any
// of their real side effects (prompts, filesystem writes, TTY requirements).
const runBindMock = vi.hoisted(() => vi.fn(async () => undefined));
const runForgeMock = vi.hoisted(() => vi.fn(async () => undefined));
const runTemperMock = vi.hoisted(() => vi.fn(async () => undefined));
const runInventoryMock = vi.hoisted(() => vi.fn(async () => undefined));
const runQuenchMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../src/commands/bind.js", () => ({ runBind: runBindMock }));
vi.mock("../src/commands/forge.js", () => ({ runForge: runForgeMock }));
vi.mock("../src/commands/temper.js", () => ({ runTemper: runTemperMock }));
vi.mock("../src/commands/inventory.js", () => ({ runInventory: runInventoryMock }));
vi.mock("../src/commands/quench.js", () => ({ runQuench: runQuenchMock }));

// Importing `src/cli.ts` directly is safe: its top-level `main()` call is
// guarded to only auto-run when the module is the process entry point, which
// it isn't when merely `import`-ed by a test.
const { buildProgram, guard, main, parseStrategy, printError } = await import("../src/cli.js");

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

describe("buildProgram (direct import, mocked command modules)", () => {
  beforeEach(() => {
    for (const mock of [
      runBindMock,
      runForgeMock,
      runTemperMock,
      runInventoryMock,
      runQuenchMock,
    ]) {
      mock.mockClear();
    }
  });

  it("registers every top-level command with a description", () => {
    const program = buildProgram();
    const names: string[] = program.commands.map((command) => command.name());

    expect(names).toEqual(["bind", "forge", "temper", "inventory", "quench"]);
    for (const command of program.commands) {
      expect(command.description().length).toBeGreaterThan(0);
    }
  });

  it("dispatches `bind <path>` to runBind with the given path", async () => {
    await buildProgram().parseAsync(["node", "hephaestus", "bind", "/tmp/my-canon"]);
    expect(runBindMock).toHaveBeenCalledWith({ path: "/tmp/my-canon" });
  });

  it("dispatches `bind` with no path as undefined", async () => {
    await buildProgram().parseAsync(["node", "hephaestus", "bind"]);
    expect(runBindMock).toHaveBeenCalledWith({ path: undefined });
  });

  it("dispatches `forge` with defaulted --dir/--force when omitted", async () => {
    await buildProgram().parseAsync(["node", "hephaestus", "forge"]);
    expect(runForgeMock).toHaveBeenCalledWith({ dir: ".", force: false });
  });

  it("dispatches `forge --dir <dir> --force` with parsed option values", async () => {
    await buildProgram().parseAsync(["node", "hephaestus", "forge", "--dir", "proj", "--force"]);
    expect(runForgeMock).toHaveBeenCalledWith({ dir: "proj", force: true });
  });

  it("dispatches `temper` with a parsed --strategy value", async () => {
    await buildProgram().parseAsync([
      "node",
      "hephaestus",
      "temper",
      "--dir",
      "proj",
      "--dry-run",
      "--strategy",
      "overwrite",
    ]);
    expect(runTemperMock).toHaveBeenCalledWith({
      dir: "proj",
      dryRun: true,
      strategy: "overwrite",
    });
  });

  it("dispatches `temper` with strategy undefined when not passed", async () => {
    await buildProgram().parseAsync(["node", "hephaestus", "temper"]);
    expect(runTemperMock).toHaveBeenCalledWith({ dir: ".", dryRun: false, strategy: undefined });
  });

  it("dispatches `inventory --dir <dir>` to runInventory", async () => {
    await buildProgram().parseAsync(["node", "hephaestus", "inventory", "--dir", "proj"]);
    expect(runInventoryMock).toHaveBeenCalledWith({ dir: "proj" });
  });

  it("dispatches `quench` with the default directory", async () => {
    await buildProgram().parseAsync(["node", "hephaestus", "quench"]);
    expect(runQuenchMock).toHaveBeenCalledWith({ dir: "." });
  });

  it("renders help text through every configured (Catppuccin-themed) style formatter", () => {
    const helpText: string = buildProgram().helpInformation();

    expect(helpText).toContain("hephaestus");
    expect(helpText).toContain("Usage:");
    expect(helpText).toContain("Commands:");
  });
});

describe("parseStrategy", () => {
  it("returns the value unchanged for a valid strategy", () => {
    expect(parseStrategy("overwrite")).toBe("overwrite");
    expect(parseStrategy("cancel")).toBe("cancel");
    expect(parseStrategy("merge")).toBe("merge");
  });

  it("throws a clear, actionable error for an invalid strategy", () => {
    expect(() => parseStrategy("bogus")).toThrow(
      /invalid --strategy "bogus"\. use one of: overwrite, cancel, merge\./,
    );
  });
});

describe("main", () => {
  const originalArgv: string[] = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = undefined;
  });

  it("parses process.argv and dispatches to the matched command", async () => {
    process.argv = ["node", "hephaestus", "quench", "--dir", "proj"];

    await main();

    expect(runQuenchMock).toHaveBeenCalledWith({ dir: "proj" });
    expect(process.exitCode).toBeUndefined();
  });
});

describe("guard", () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it("leaves the exit code untouched when the action resolves", async () => {
    await guard(async () => undefined);
    expect(process.exitCode).toBeUndefined();
  });

  it("prints a themed error and sets a non-zero exit code when the action rejects", async () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await guard(async () => {
      throw new Error("boom");
    });

    expect(process.exitCode).toBe(1);
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("boom"));
    writeSpy.mockRestore();
  });
});

describe("printError", () => {
  it("prints an Error's message", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    printError(new Error("something broke"));

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("something broke"));
    writeSpy.mockRestore();
  });

  it("stringifies a non-Error thrown value", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    printError("a raw string failure");

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("a raw string failure"));
    writeSpy.mockRestore();
  });
});
