import { posix } from "node:path";

import { getHarness } from "../harnesses/index.js";
import type { RenderContext, RenderedFile } from "../harnesses/types.js";
import { hashContents, rollupHash } from "./hash.js";
import type { CanonicalContent } from "./loader.js";
import {
  LOCKFILE_VERSION,
  type AgentLock,
  type Lockfile,
  type LockOutput,
  type SkillLock,
} from "./lockfile.js";
import type { HarnessId } from "./schema.js";

/**
 * Re-derive the provisioning selection from a lockfile. Agents that no longer
 * exist in canonical content are silently dropped.
 */
export function selectionFromLock(lockfile: Lockfile, content: CanonicalContent): ProvisionSelection {
  const agentIds: string[] = Object.keys(lockfile.agents).filter((id) => content.agents.has(id));

  return {
    agentIds,
    harnesses: [...lockfile.harnesses] as HarnessId[],
    handoffDir: lockfile.handoffDir,
  };
}

/** What the user (or a lockfile) selected to provision. */
export interface ProvisionSelection {
  /** In display order. */
  agentIds: string[];
  harnesses: HarnessId[];
  /** e.g. `docs` */
  handoffDir: string;
}

/** Derive the ordered, deduplicated skill id list for the given agent ids. */
function deriveSkillIds(agentIds: string[], content: CanonicalContent): string[] {
  const skillSet = new Set<string>(
    agentIds.flatMap((id) => content.agents.get(id)?.skills ?? []),
  );
  return [...content.skills.keys()].filter((id) => skillSet.has(id));
}

/** A rendered file with its content hash. */
export interface HashedFile extends RenderedFile {
  hash: string;
}

/** A rendered output (one agent file, or a skill's set of files) for one harness. */
export interface RenderedOutput {
  kind: "agent" | "skill";
  /** Agent or skill id. */
  ownerId: string;
  harnessId: HarnessId;
  /** Agent file path, or skill's primary file — its parent dir is the base for relative hash keys. */
  primaryPath: string;
  files: HashedFile[];
}

/** Attach content hashes to a list of rendered files. */
function withHashes(files: RenderedFile[]): HashedFile[] {
  return files.map((file) => ({ ...file, hash: hashContents(file.contents) }));
}

/**
 * Render every selected agent and skill into every selected harness, in memory.
 * Pure — no IO. The result is the basis for both writing (forge) and drift
 * computation (temper).
 *
 * @throws If a selected agent or skill id is not present in canonical content.
 */
export function renderAll(
  content: CanonicalContent,
  selection: ProvisionSelection,
): RenderedOutput[] {
  const outputs: RenderedOutput[] = [];
  const skillIds: string[] = deriveSkillIds(selection.agentIds, content);

  for (const harnessId of selection.harnesses) {
    const harness = getHarness(harnessId);

    for (const agentId of selection.agentIds) {
      const agent = content.agents.get(agentId);
      if (!agent) {
        throw new Error(`Selected agent "${agentId}" was not found in canonical content.`);
      }
      const ctx: RenderContext = {
        harnessId,
        handoffDir: selection.handoffDir,
        tier: agent.tier,
      };
      const file: RenderedFile = harness.renderAgent(agent, ctx, content.skills);
      outputs.push({
        kind: "agent",
        ownerId: agentId,
        harnessId,
        primaryPath: file.path,
        files: withHashes([file]),
      });
    }

    for (const skillId of skillIds) {
      const skill = content.skills.get(skillId);
      if (!skill) {
        throw new Error(`Selected skill "${skillId}" was not found in canonical content.`);
      }
      const files: RenderedFile[] = harness.renderSkill(skill);
      if (files.length === 0) {
        throw new Error(`Skill "${skillId}" rendered no output files for harness "${harnessId}".`);
      }
      const primaryPath: string = files[0]!.path;
      outputs.push({
        kind: "skill",
        ownerId: skillId,
        harnessId,
        primaryPath,
        files: withHashes(files),
      });
    }
  }

  return outputs;
}

/**
 * Look up the lock hash previously recorded for a specific output file,
 * or undefined if the file is not tracked in the lockfile.
 */
export function previousLockHash(
  lockfile: Lockfile,
  output: RenderedOutput,
  filePath: string,
): string | undefined {
  if (output.kind === "agent") {
    return lockfile.agents[output.ownerId]?.outputs[output.harnessId]?.hash;
  }
  const lockOutput: LockOutput | undefined =
    lockfile.skills[output.ownerId]?.outputs[output.harnessId];
  if (!lockOutput) {
    return undefined;
  }
  const key: string = posix.relative(posix.dirname(output.primaryPath), filePath);
  if (lockOutput.files) {
    return lockOutput.files[key];
  }
  return filePath === output.primaryPath ? lockOutput.hash : undefined;
}

/**
 * Build a {@link LockOutput} for one rendered output. When `fileHashes` is
 * provided (the temper path), hashes come from the recorded sync outcomes so
 * keep/cancel decisions preserve the old hash. When omitted (the forge path),
 * hashes come directly from the rendered files.
 *
 * Returns null when `fileHashes` is provided but empty (all files in the
 * output were untracked-drift + cancel/merge, so no lock entry is warranted).
 */
function buildLockOutputFor(
  output: RenderedOutput,
  fileHashes?: Map<string, string>,
): LockOutput | null {
  if (fileHashes !== undefined && fileHashes.size === 0) {
    return null;
  }

  if (output.kind === "agent") {
    const hash: string | undefined = fileHashes
      ? fileHashes.get(output.primaryPath)
      : output.files[0]!.hash;
    if (!hash) return null;
    return { path: output.primaryPath, hash };
  }

  const baseDir: string = posix.dirname(output.primaryPath);
  const relHashes: Record<string, string> = {};

  if (fileHashes) {
    for (const [filePath, hash] of fileHashes) {
      relHashes[posix.relative(baseDir, filePath)] = hash;
    }
  } else {
    for (const file of output.files) {
      relHashes[posix.relative(baseDir, file.path)] = file.hash;
    }
  }

  if (Object.keys(relHashes).length === 0) return null;

  return {
    path: output.primaryPath,
    hash: rollupHash(relHashes),
    files: relHashes,
  };
}

/** Build the {@link LockOutput} for a single rendered output. */
export function toLockOutput(output: RenderedOutput): LockOutput {
  return buildLockOutputFor(output) as LockOutput;
}

/**
 * Build a lockfile from rendered outputs.
 *
 * When `recordedHashes` is omitted (forge path), hashes come directly from
 * the rendered output. When provided (temper path), hashes come from the sync
 * outcomes so keep/cancel decisions preserve old hashes.
 */
export function buildLockfile(
  content: CanonicalContent,
  outputs: RenderedOutput[],
  selection: ProvisionSelection,
  engineVersion: string,
  recordedHashes?: Map<RenderedOutput, Map<string, string>>,
): Lockfile {
  const agents: Record<string, AgentLock> = {};
  const skills: Record<string, SkillLock> = {};

  for (const agentId of selection.agentIds) {
    const agent = content.agents.get(agentId);
    if (!agent) {
      throw new Error(`Selected agent "${agentId}" was not found in canonical content.`);
    }
    agents[agentId] = {
      tier: agent.tier,
      skills: [...agent.skills],
      outputs: {},
    };
  }
  for (const skillId of deriveSkillIds(selection.agentIds, content)) {
    skills[skillId] = { outputs: {} };
  }

  for (const output of outputs) {
    const fileHashes: Map<string, string> | undefined = recordedHashes?.get(output);
    const lockOutput: LockOutput | null = buildLockOutputFor(output, fileHashes);
    if (!lockOutput) continue;

    if (output.kind === "agent") {
      agents[output.ownerId]!.outputs[output.harnessId] = lockOutput;
    } else {
      skills[output.ownerId]!.outputs[output.harnessId] = lockOutput;
    }
  }

  return {
    version: LOCKFILE_VERSION,
    engineVersion,
    handoffDir: selection.handoffDir,
    harnesses: [...selection.harnesses],
    agents,
    skills,
  };
}
