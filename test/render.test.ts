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
    expect(
      findUnknownTokens("{{output}} {{skills}}"),
    ).toEqual([]);
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
    output: "docs",
    skills: "- [typescript](../skills/typescript/SKILL.md)",
  };

  it("expands all known tokens and leaves no raw braces", () => {
    const body = "write to {{output}}/YYYY-MM-DD-build-feature.md.\n{{skills}}";
    const out = expandTokens(body, values);
    expect(out).toBe(
      "write to docs/YYYY-MM-DD-build-feature.md.\n- [typescript](../skills/typescript/SKILL.md)",
    );
    expect(out).not.toMatch(/\{\{/);
  });

  it("leaves an unknown token unchanged rather than throwing", () => {
    const body = "known: {{output}}. unknown: {{bogus}}.";
    expect(expandTokens(body, values)).toBe("known: docs. unknown: {{bogus}}.");
  });
});
