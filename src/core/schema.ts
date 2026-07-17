import { z } from "zod";

/**
 * abstract model tier declared by a canonical agent. each harness maps a tier to
 * its own concrete model string (see {@link "../harnesses/models"}).
 */
export const TIERS = ["fast", "balanced", "flagship"] as const;
export type Tier = (typeof TIERS)[number];
export const tierSchema = z.enum(TIERS);

/**
 * supported harness identifiers. only `claude` is wired into the registry today;
 * `copilot` and `codex` are reserved and added in the fan-out phase.
 */
export const HARNESS_IDS = ["claude", "copilot", "codex"] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];
export const harnessIdSchema = z.enum(HARNESS_IDS);

/**
 * harness-agnostic abstract tool names. each harness maps these to its own
 * concrete tool identifiers. keeping the set closed lets validation fail fast on
 * typos in canonical agent frontmatter.
 */
export const ABSTRACT_TOOLS = [
  "read",
  "write",
  "edit",
  "search",
  "execute",
  "websearch",
  "webfetch",
  "delegate",
] as const;
export type AbstractTool = (typeof ABSTRACT_TOOLS)[number];

/**
 * template tokens the agent-body renderer understands. any other `{{token}}` in a
 * canonical agent body is left untouched at render time — agent bodies may
 * legitimately contain placeholders that belong to a different templating
 * system or are literal doc examples.
 */
export const KNOWN_TOKENS = ["output", "skills"] as const;
export type KnownToken = (typeof KNOWN_TOKENS)[number];

/** lowercase, hyphen-separated identifier (e.g. `shadcn-ux`). */
const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "must be lowercase letters, numbers and single hyphens (e.g. `my-agent`)",
  );

/**
 * per-harness concrete model overrides that bypass the tier map for one harness.
 * unknown harness keys are silently ignored so independently-maintained canon
 * files can add overrides before hephaestus supports a new harness.
 */
export const modelOverridesSchema = z.object({
  claude: z.string().min(1).optional(),
  copilot: z.string().min(1).optional(),
  codex: z.string().min(1).optional(),
});
export type ModelOverrides = z.infer<typeof modelOverridesSchema>;

/**
 * YAML frontmatter shape for a canonical agent (`canon/agents/<id>.md`).
 *
 * validation fails fast only for missing required fields (`id`, `name`,
 * `summary`, `description`, `tier`). unknown frontmatter fields are silently
 * ignored so independently-maintained canon files can carry custom metadata
 * without breaking the loader.
 */
export const agentFrontmatterSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  /** groups this agent under a named section in the forge agent-select prompt. ungrouped agents fall under "general". */
  category: slugSchema.optional(),
  /** short (<=80 char) display text for CLI select prompts. distinct purpose from `description`: this is for a human scanning a list, not for harness routing — write it even when `description` would fit in 80 chars. */
  summary: z.string().min(1).max(80),
  description: z.string().min(1),
  tier: tierSchema,
  modelOverrides: modelOverridesSchema.optional(),
  /** abstract tool names. unknown values are silently ignored by each harness. */
  tools: z.array(z.string()).default([]),
  skills: z.array(slugSchema).default([]),
});
export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;

/** a fully loaded canonical agent: validated frontmatter plus the markdown body. */
export interface CanonicalAgent extends AgentFrontmatter {
  /** raw markdown body following the frontmatter (tokens not yet expanded). */
  body: string;
  /** absolute path of the source file, for diagnostics. */
  sourcePath: string;
}

/**
 * a single markdown content file inside a skill directory. its frontmatter is
 * the content author's responsibility and is passed through to the harness
 * unchanged — no hephaestus-level validation is applied to it.
 */
export interface CanonicalSkillFile {
  /** filename within the skill directory, e.g. `conventions.md`. */
  filename: string;
  /** raw markdown content including any frontmatter, passed through as-is. */
  contents: string;
}

/**
 * a bundled non-markdown resource shipped inside a skill folder (e.g.
 * `scripts/setup.sh`), carried in memory so transpilers stay IO-free.
 */
export interface BundledFile {
  /** path relative to the skill folder, in POSIX form. */
  path: string;
  /** raw bytes, copied through untouched — binary-safe (never decoded as UTF-8). */
  contents: Uint8Array;
}

/** a fully loaded canonical skill, identified by its directory name (slug). */
export interface CanonicalSkill {
  /** directory name — the skill's id. */
  name: string;
  /** absolute path of the skill directory. */
  dir: string;
  /** `*.md` content files, in alphabetical order. */
  contentFiles: CanonicalSkillFile[];
  /** non-markdown bundled resources (scripts, references, etc.). */
  bundledFiles: BundledFile[];
}

/** resolved engine configuration (source of canonical content, defaults). */
export const engineConfigSchema = z
  .object({
    /** absolute path to the canonical content root (contains agents/ and skills/). */
    contentDir: z.string().min(1),
    /** default output directory offered during `init`. */
    defaultOutputDir: z.string().min(1).default(".hephaestus"),
  })
  .strict();
export type EngineConfig = z.infer<typeof engineConfigSchema>;
