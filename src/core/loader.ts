import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import matter from "gray-matter";
import { glob } from "tinyglobby";
import type { ZodError } from "zod";

import {
  agentFrontmatterSchema,
  type BundledFile,
  type CanonicalAgent,
  type CanonicalSkill,
  type CanonicalSkillFile,
  type EngineConfig,
} from "./schema.js";

/** validated canonical content: agents and skills keyed by id/name. */
export interface CanonicalContent {
  agents: Map<string, CanonicalAgent>;
  skills: Map<string, CanonicalSkill>;
}

/**
 * error raised when canonical content fails validation. aggregates every problem
 * so the user can fix them in one pass rather than one error at a time.
 */
export class CanonicalLoadError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      `Canonical content failed validation:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
    );
    this.name = "CanonicalLoadError";
    this.problems = problems;
  }
}

/** turn a Zod error into readable, path-prefixed lines for a given file. */
function formatZodError(label: string, error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path: string = issue.path.join(".");
    return path ? `${label}: ${path} — ${issue.message}` : `${label}: ${issue.message}`;
  });
}

/** convert an OS path to forward-slash form for portable storage/comparison. */
function toPosix(value: string): string {
  return value.split(sep).join("/");
}

/**
 * a short, human-friendly form of `contentDir` for diagnostics: relative to the
 * cwd when possible, falling back to the absolute path as-is.
 *
 * `path.relative` falls back to returning its (still-absolute) `to` argument
 * when the two paths have no common root — notably on Windows when `cwd` and
 * `contentDir` are on different drive letters. displaying that fallback as if
 * it were a relative path (e.g. prefixed into `<path>/agents`) reads as
 * confusing, so detect it and show the absolute path plainly instead.
 */
function displayContentDir(contentDir: string): string {
  const relativePath: string = relative(process.cwd(), contentDir);
  return isAbsolute(relativePath) ? contentDir : toPosix(relativePath);
}

/**
 * load and validate canonical skills under `<contentDir>/skills`. each skill is
 * a directory with one or more `*.md` files. directories without `.md` files
 * are silently skipped — no marker file required.
 */
async function loadSkills(
  config: EngineConfig,
  problems: string[],
): Promise<Map<string, CanonicalSkill>> {
  const skills: Map<string, CanonicalSkill> = new Map();

  // one glob for all skill .md files; group by parent dir to avoid a second per-dir pass.
  const allMdFiles: string[] = (
    await glob("skills/*/*.md", { cwd: config.contentDir, absolute: true })
  ).sort();

  const mdByDir = new Map<string, string[]>();
  for (const file of allMdFiles) {
    const dir: string = dirname(file);
    const filenames: string[] = mdByDir.get(dir) ?? [];
    filenames.push(basename(file));
    mdByDir.set(dir, filenames);
  }

  const skillDirs: string[] = [...mdByDir.keys()].sort();

  for (const dir of skillDirs) {
    const folderName: string = basename(dir);
    const label: string = `skill ${folderName}`;

    const mdFilenames: string[] = (mdByDir.get(dir) ?? []).sort();

    const contentFiles: CanonicalSkillFile[] = [];
    let hasContentProblem = false;

    for (const filename of mdFilenames) {
      const contents: string = await readFile(join(dir, filename), "utf8");
      const parsed = matter(contents);
      if (parsed.content.trim().length === 0) {
        problems.push(`${label}/${filename}: content file has no body`);
        hasContentProblem = true;
        continue;
      }
      contentFiles.push({ filename, contents });
    }

    if (hasContentProblem) continue;

    // bundled non-.md resources (scripts, references, etc.).
    const allFiles: string[] = await glob("**/*", {
      cwd: dir,
      absolute: false,
      dot: false,
      onlyFiles: true,
    });
    const bundledPaths: string[] = allFiles
      .map(toPosix)
      .filter((file) => !file.endsWith(".md"))
      .sort();

    const bundledFiles: BundledFile[] = [];
    for (const bundledPath of bundledPaths) {
      // read as raw bytes (no encoding) so binary bundled resources (images,
      // archives, etc.) round-trip losslessly instead of being forced through a
      // lossy UTF-8 decode/encode.
      const contents: Buffer = await readFile(join(dir, bundledPath));
      bundledFiles.push({ path: bundledPath, contents });
    }

    if (skills.has(folderName)) {
      problems.push(`${label}: duplicate skill name "${folderName}"`);
      continue;
    }

    skills.set(folderName, { name: folderName, dir, contentFiles, bundledFiles });
  }

  return skills;
}

/**
 * load and validate canonical agents under `<contentDir>/agents`,
 * cross-checking that every referenced skill is known. unknown `{{token}}`
 * placeholders in the body are permitted — they are left untouched at render
 * time (see {@link "./render"}) so agent bodies can legitimately contain
 * placeholders that are not hephaestus's own known tokens.
 */
async function loadAgents(
  config: EngineConfig,
  skills: Map<string, CanonicalSkill>,
  problems: string[],
): Promise<Map<string, CanonicalAgent>> {
  const agents: Map<string, CanonicalAgent> = new Map();

  const agentFiles: string[] = (
    await glob("agents/*.md", { cwd: config.contentDir, absolute: true })
  ).sort();

  for (const agentFile of agentFiles) {
    const fileId: string = basename(agentFile, ".md");
    const label: string = `agent ${fileId}`;

    const raw: string = await readFile(agentFile, "utf8");
    const parsed = matter(raw);
    const result = agentFrontmatterSchema.safeParse(parsed.data);

    if (!result.success) {
      problems.push(...formatZodError(label, result.error));
      continue;
    }

    const frontmatter = result.data;

    if (frontmatter.id !== fileId) {
      problems.push(
        `${label}: file name "${fileId}.md" does not match frontmatter id "${frontmatter.id}"`,
      );
      continue;
    }

    if (parsed.content.trim().length === 0) {
      problems.push(`${label}: agent body is empty`);
      continue;
    }

    for (const skillId of frontmatter.skills) {
      if (!skills.has(skillId)) {
        problems.push(`${label}: references unknown skill "${skillId}"`);
      }
    }

    if (agents.has(frontmatter.id)) {
      problems.push(`${label}: duplicate agent id "${frontmatter.id}"`);
      continue;
    }

    agents.set(frontmatter.id, {
      ...frontmatter,
      body: parsed.content,
      sourcePath: agentFile,
    });
  }

  return agents;
}

/**
 * load and validate all canonical content from disk. aggregates every problem
 * into a single error so the user can fix them in one pass.
 *
 * @throws {CanonicalLoadError} if any agent or skill is invalid.
 */
export async function loadCanonical(config: EngineConfig): Promise<CanonicalContent> {
  const problems: string[] = [];

  const skills: Map<string, CanonicalSkill> = await loadSkills(config, problems);
  const agents: Map<string, CanonicalAgent> = await loadAgents(config, skills, problems);

  if (agents.size === 0) {
    problems.push(`no agents found under ${displayContentDir(config.contentDir)}/agents`);
  }

  if (problems.length > 0) {
    throw new CanonicalLoadError(problems);
  }

  return { agents, skills };
}
