import { describe, expect, it } from "vitest";

import type { CanonicalAgent } from "../src/core/schema.js";
import { agentDescriptionsBlock, groupAgentsByCategory } from "../src/ui/report.js";

/** Build a minimal `CanonicalAgent` for tests, overriding only the fields under test. */
function makeAgent(overrides: Partial<CanonicalAgent> = {}): CanonicalAgent {
  return {
    id: "planner",
    name: "Planner",
    summary: "plans things",
    description: "plans things in great detail across many sentences of explanation.",
    tier: "balanced",
    tools: [],
    skills: [],
    body: "",
    sourcePath: "/canon/agents/planner.md",
    ...overrides,
  };
}

describe("groupAgentsByCategory", () => {
  it("returns an empty map for empty input", () => {
    expect(groupAgentsByCategory([]).size).toBe(0);
  });

  it("buckets agents without a category under 'general'", () => {
    const agent = makeAgent({ category: undefined });
    const grouped = groupAgentsByCategory([agent]);
    expect(grouped.get("general")).toEqual([agent]);
  });

  it("groups agents by their explicit category", () => {
    const planner = makeAgent({ id: "planner", category: "planning" });
    const builder = makeAgent({ id: "builder", category: "build" });
    const grouped = groupAgentsByCategory([planner, builder]);
    expect(grouped.get("planning")).toEqual([planner]);
    expect(grouped.get("build")).toEqual([builder]);
  });

  it("sorts categories alphabetically, with 'general' always last", () => {
    const generalAgent = makeAgent({ id: "general-agent", category: undefined });
    const zCategoryAgent = makeAgent({ id: "z-agent", category: "zeta" });
    const aCategoryAgent = makeAgent({ id: "a-agent", category: "alpha" });
    const grouped = groupAgentsByCategory([generalAgent, zCategoryAgent, aCategoryAgent]);
    expect([...grouped.keys()]).toEqual(["alpha", "zeta", "general"]);
  });
});

describe("agentDescriptionsBlock", () => {
  it("uses the short summary rather than the unbounded description", () => {
    const longDescription = "y".repeat(200);
    const agent = makeAgent({ name: "Planner", summary: "plans things", description: longDescription });
    const block = agentDescriptionsBlock([agent]);
    expect(block).not.toContain(longDescription);
    expect(block).toContain("plans things");
  });

  it("includes one line per agent", () => {
    const planner = makeAgent({ id: "planner", name: "Planner", summary: "plans." });
    const builder = makeAgent({ id: "builder", name: "Builder", summary: "builds." });
    const block = agentDescriptionsBlock([planner, builder]);
    expect(block.split("\n")).toHaveLength(2);
    expect(block).toContain("Planner");
    expect(block).toContain("plans.");
    expect(block).toContain("Builder");
    expect(block).toContain("builds.");
  });
});
