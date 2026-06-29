import { describe, expect, it } from "vitest";

import {
  EMPTY_HANDOFF_PHRASE,
  expandTokens,
  extractTokenNames,
  findUnknownTokens,
  formatHandoffList,
  type TokenValues,
} from "../src/core/render.js";

describe("extractTokenNames", () => {
  it("returns distinct tokens in first-seen order, tolerating inner whitespace", () => {
    const body = "a {{ skills }} b {{handoff.writes}} c {{skills}}";
    expect(extractTokenNames(body)).toEqual(["skills", "handoff.writes"]);
  });
});

describe("findUnknownTokens", () => {
  it("accepts the known token set", () => {
    expect(findUnknownTokens("{{handoff.dir}} {{skills}}")).toEqual([]);
  });

  it("reports unknown tokens", () => {
    expect(findUnknownTokens("hello {{handoff.inputs}} {{bogus}}")).toEqual([
      "handoff.inputs",
      "bogus",
    ]);
  });
});

describe("formatHandoffList", () => {
  it("joins files to the handoff dir with forward slashes", () => {
    expect(formatHandoffList(["plan.md", "build.md"], "docs")).toBe("docs/plan.md, docs/build.md");
  });

  it("normalises a handoff dir with trailing slashes or backslashes", () => {
    expect(formatHandoffList(["plan.md"], "docs\\")).toBe("docs/plan.md");
    expect(formatHandoffList(["plan.md"], "docs/")).toBe("docs/plan.md");
  });

  it("renders the empty phrase when there are no files", () => {
    expect(formatHandoffList([], "docs")).toBe(EMPTY_HANDOFF_PHRASE);
  });
});

describe("expandTokens", () => {
  const values: TokenValues = {
    "handoff.dir": "docs",
    skills: "- [typescript](../skills/typescript/SKILL.md)",
  };

  it("expands all known tokens and leaves no raw braces", () => {
    const body = "write to {{handoff.dir}}/YYYY-MM-DD-build-feature.md.\n{{skills}}";
    const out = expandTokens(body, values);
    expect(out).toBe(
      "write to docs/YYYY-MM-DD-build-feature.md.\n- [typescript](../skills/typescript/SKILL.md)",
    );
    expect(out).not.toMatch(/\{\{/);
  });

  it("throws on an unexpected token (defensive; should be caught at load time)", () => {
    expect(() => expandTokens("{{unexpected}}", values)).toThrow(/unexpected/);
  });
});
