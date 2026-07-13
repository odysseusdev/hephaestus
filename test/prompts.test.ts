import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every input-gathering primitive in prompts.ts calls the real `@clack/prompts`
// under the hood; mock it so tests can drive exact return values (including
// clack's cancel sentinel) without a real TTY.
const clackMocks = vi.hoisted(() => ({
  text: vi.fn(),
  confirm: vi.fn(),
  multiselect: vi.fn(),
  groupMultiselect: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn((_value: unknown) => false),
  cancel: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  log: { message: vi.fn() },
}));

vi.mock("@clack/prompts", () => clackMocks);

const {
  assertInteractive,
  confirm,
  groupMultiselect,
  intro,
  isInteractive,
  multiselect,
  note,
  outro,
  select,
  text,
} = await import("../src/ui/prompts.js");

/** force `process.stdin.isTTY` for the duration of one test. */
function setTty(value: boolean | undefined): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

const ORIGINAL_IS_TTY: boolean | undefined = process.stdin.isTTY;

beforeEach(() => {
  for (const mock of Object.values(clackMocks)) {
    if (typeof mock === "function") {
      mock.mockReset();
    }
  }
  clackMocks.isCancel.mockReturnValue(false);
});

afterEach(() => {
  setTty(ORIGINAL_IS_TTY);
});

describe("isInteractive", () => {
  it("is true when stdin is a TTY", () => {
    setTty(true);
    expect(isInteractive()).toBe(true);
  });

  it("is false when stdin is not a TTY", () => {
    setTty(false);
    expect(isInteractive()).toBe(false);
  });

  it("is false when isTTY is undefined (e.g. piped stdin)", () => {
    setTty(undefined);
    expect(isInteractive()).toBe(false);
  });
});

describe("assertInteractive", () => {
  it("does not throw when stdin is a TTY", () => {
    setTty(true);
    expect(() => assertInteractive()).not.toThrow();
  });

  it("throws a generic, actionable message by default when stdin is not a TTY", () => {
    setTty(false);
    expect(() => assertInteractive()).toThrow(
      /stdin is not a TTY\. re-run this command in an interactive terminal\./,
    );
  });

  it("appends the caller's custom hint instead of the generic one", () => {
    setTty(false);
    expect(() => assertInteractive("use --force instead.")).toThrow(/use --force instead\./);
  });
});

describe("text", () => {
  beforeEach(() => setTty(true));

  it("requires an interactive terminal", async () => {
    setTty(false);
    await expect(text("path?", "~/default")).rejects.toThrow(/interactive terminal/);
    expect(clackMocks.text).not.toHaveBeenCalled();
  });

  it("returns the trimmed value when the user enters non-blank text", async () => {
    clackMocks.text.mockResolvedValue("  ~/my-agents  ");
    expect(await text("path?", "~/default")).toBe("~/my-agents");
  });

  it("falls back to the default value when the trimmed input is empty", async () => {
    clackMocks.text.mockResolvedValue("   ");
    expect(await text("path?", "~/default")).toBe("~/default");
  });

  it("falls back to the default value when the user submits an empty string", async () => {
    clackMocks.text.mockResolvedValue("");
    expect(await text("path?", "~/default")).toBe("~/default");
  });
});

describe("confirm", () => {
  beforeEach(() => setTty(true));

  it("requires an interactive terminal", async () => {
    setTty(false);
    await expect(confirm("proceed?")).rejects.toThrow(/interactive terminal/);
  });

  it("returns the boolean result from clack", async () => {
    clackMocks.confirm.mockResolvedValue(true);
    expect(await confirm("proceed?", false)).toBe(true);
    expect(clackMocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: false }),
    );
  });
});

describe("multiselect / groupMultiselect / select", () => {
  beforeEach(() => setTty(true));

  it("multiselect requires an interactive terminal", async () => {
    setTty(false);
    await expect(multiselect("pick", [{ value: "a", label: "A" }])).rejects.toThrow(
      /interactive terminal/,
    );
  });

  it("multiselect returns the chosen values", async () => {
    clackMocks.multiselect.mockResolvedValue(["a", "b"]);
    const result = await multiselect("pick", [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]);
    expect(result).toEqual(["a", "b"]);
  });

  it("groupMultiselect flattens choices across groups", async () => {
    clackMocks.groupMultiselect.mockResolvedValue(["a"]);
    const result = await groupMultiselect("pick", { group1: [{ value: "a", label: "A" }] });
    expect(result).toEqual(["a"]);
  });

  it("select returns the single chosen value", async () => {
    clackMocks.select.mockResolvedValue("overwrite");
    const result = await select("strategy?", [{ value: "overwrite", label: "Overwrite" }]);
    expect(result).toBe("overwrite");
  });
});

describe("cancellation (unwrap)", () => {
  beforeEach(() => setTty(true));

  it("prints a cancel message and exits 130 instead of returning a value", async () => {
    const CANCEL_SYMBOL = Symbol("clack:cancel");
    clackMocks.text.mockResolvedValue(CANCEL_SYMBOL);
    clackMocks.isCancel.mockImplementation((value: unknown) => value === CANCEL_SYMBOL);
    // A real `process.exit` halts execution immediately; the mock must do the
    // same (by throwing) so the test doesn't fall through into code that
    // assumes cancellation already ended the process.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(130)");
    });

    await expect(text("path?", "~/default")).rejects.toThrow("process.exit(130)");

    expect(clackMocks.cancel).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
    expect(exitSpy).toHaveBeenCalledWith(130);
    exitSpy.mockRestore();
  });
});

describe("note / intro / outro", () => {
  it("print output without requiring an interactive terminal", () => {
    setTty(false);

    expect(() => note("hello", "title")).not.toThrow();
    expect(() => intro("forge", "subtitle")).not.toThrow();
    expect(() => outro("done")).not.toThrow();

    expect(clackMocks.note).toHaveBeenCalledWith("hello", expect.stringContaining("title"));
    expect(clackMocks.intro).toHaveBeenCalled();
    expect(clackMocks.outro).toHaveBeenCalledWith(expect.stringContaining("done"));
  });
});
