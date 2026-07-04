import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runInventory } from "../src/commands/inventory.js";
import { loadConfig } from "../src/core/config.js";
import { loadCanonical, type CanonicalContent } from "../src/core/loader.js";
import { writeLockfile } from "../src/core/lockfile.js";
import { buildLockfile, renderAll, type ProvisionSelection } from "../src/core/provision.js";
import { ENGINE_VERSION } from "../src/core/version.js";
import { ensureHandoffDir, writeOutputs } from "../src/core/writer.js";

// `inventory` is read-only and purely informational via `note`/`outro`; capture
// what it reports instead of asserting on raw ANSI-coloured stdout.
const noteMock = vi.hoisted(() => vi.fn());
const outroMock = vi.hoisted(() => vi.fn());

vi.mock("../src/ui/prompts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/prompts.js")>();
  return { ...actual, note: noteMock, outro: outroMock, intro: vi.fn() };
});

// Uses the real bundled `examples/` canon (HEPHAESTUS_CANON_DIR, set in vitest.config.ts)
// so the selection below matches what `loadCanonical` actually resolves.
const SELECTION: ProvisionSelection = {
  agentIds: ["agent-creator"],
  harnesses: ["claude"],
  handoffDir: "docs",
};

let content: CanonicalContent;
let projectRoot: string;

beforeAll(async () => {
  content = await loadCanonical(loadConfig());
});

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "heph-inventory-"));
  noteMock.mockClear();
  outroMock.mockClear();
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

/** Provision `agent-creator` into `projectRoot` exactly as `forge` would. */
async function provision(): Promise<void> {
  const outputs = renderAll(content, SELECTION);
  await writeOutputs(projectRoot, outputs);
  await ensureHandoffDir(projectRoot, SELECTION.handoffDir);
  await writeLockfile(projectRoot, buildLockfile(content, outputs, SELECTION, ENGINE_VERSION));
}

describe("runInventory", () => {
  it("reports not-yet-provisioned when there is no lockfile, without throwing", async () => {
    await runInventory({ dir: projectRoot });
    expect(outroMock).toHaveBeenCalledWith(expect.stringContaining("not yet provisioned"));
    expect(noteMock).not.toHaveBeenCalled();
  });

  it("lists the provisioned agent, its tier, and skills from the lockfile", async () => {
    await provision();

    await runInventory({ dir: projectRoot });

    const noteMessages: string[] = noteMock.mock.calls.map(([message]) => String(message));
    expect(noteMessages.some((message) => message.includes("agent-creator"))).toBe(true);
    expect(noteMessages.some((message) => message.includes("balanced"))).toBe(true);
  });

  it("reports the configured harnesses and handoff directory", async () => {
    await provision();

    await runInventory({ dir: projectRoot });

    const provisionedCall = noteMock.mock.calls.find(([, title]) => title === "provisioned");
    expect(provisionedCall?.[0]).toContain("claude");
    expect(provisionedCall?.[0]).toContain("docs/");
  });

  it("reports zero drift immediately after a fresh provision", async () => {
    await provision();

    await runInventory({ dir: projectRoot });

    const statusCall = noteMock.mock.calls.find(([, title]) => title === "status");
    expect(statusCall?.[0]).toContain("0 drifted");
  });
});
