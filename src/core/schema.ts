import { z } from "zod";

/**
 * Abstract model tier declared by a canonical agent. Each harness maps a tier to
 * its own concrete model string (see {@link "../harnesses/models"}).
 */
export const TIERS = ["fast", "balanced", "flagship"] as const;
export type Tier = (typeof TIERS)[number];
export const tierSchema = z.enum(TIERS);

/**
 * Supported harness identifiers. Only `claude` is wired into the registry today;
 * `copilot` and `codex` are reserved and added in the fan-out phase.
 */
export const HARNESS_IDS = ["claude", "copilot", "codex"] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];
export const harnessIdSchema = z.enum(HARNESS_IDS);

/**
 * Harness-agnostic abstract tool names. Each harness maps these to its own
 * concrete tool identifiers. Keeping the set closed lets validation fail fast on
 * typos in canonical agent frontmatter.
 */
export const ABSTRACT_TOOLS = ["read", "write", "edit", "search", "execute"] as const;
export type AbstractTool = (typeof ABSTRACT_TOOLS)[number];
export const abstractToolSchema = z.enum(ABSTRACT_TOOLS);

/**
 * Template tokens the agent-body renderer understands. Any other `{{token}}` in a
 * canonical agent body is rejected at load time.
 */
export const KNOWN_TOKENS = ["handoff.dir", "skills"] as const;
export type KnownToken = (typeof KNOWN_TOKENS)[number];

/** Lowercase, hyphen-separated identifier (e.g. `shadcn-ux`). */
const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "must be lowercase letters, numbers and single hyphens (e.g. `my-agent`)",
  );


/**
 * Per-harness concrete model overrides that bypass the tier map for one harness.
 * Unknown harness keys are silently ignored so independently-maintained canon
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
 * Validation fails fast only for missing required fields (`id`, `name`,
 * `description`, `tier`). Unknown frontmatter fields are silently ignored so
 * independently-maintained canon files can carry custom metadata without
 * breaking the loader.
 */
export const agentFrontmatterSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  tier: tierSchema,
  modelOverrides: modelOverridesSchema.optional(),
  /** Abstract tool names. Unknown values are silently ignored by each harness. */
  tools: z.array(z.string()).default([]),
  skills: z.array(slugSchema).default([]),
});
export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;

/** A fully loaded canonical agent: validated frontmatter plus the markdown body. */
export interface CanonicalAgent extends AgentFrontmatter {
  /** Raw markdown body following the frontmatter (tokens not yet expanded). */
  body: string;
  /** Absolute path of the source file, for diagnostics. */
  sourcePath: string;
}

/**
 * A single markdown content file inside a skill directory. Its frontmatter is
 * the content author's responsibility and is passed through to the harness
 * unchanged — no hephaestus-level validation is applied to it.
 */
export interface CanonicalSkillFile {
  /** Filename within the skill directory, e.g. `conventions.md`. */
  filename: string;
  /** Raw markdown content including any frontmatter, passed through as-is. */
  contents: string;
}

/**
 * A bundled non-markdown resource shipped inside a skill folder (e.g.
 * `scripts/setup.sh`), carried in memory so transpilers stay IO-free.
 */
export interface BundledFile {
  /** Path relative to the skill folder, in POSIX form. */
  path: string;
  /** UTF-8 contents, copied through untouched. */
  contents: string;
}

/** A fully loaded canonical skill, identified by its directory name (slug). */
export interface CanonicalSkill {
  /** Directory name — the skill's id. */
  name: string;
  /** Absolute path of the skill directory. */
  dir: string;
  /** `*.md` content files, in alphabetical order. */
  contentFiles: CanonicalSkillFile[];
  /** Non-markdown bundled resources (scripts, references, etc.). */
  bundledFiles: BundledFile[];
}

/** Resolved engine configuration (source of canonical content, defaults). */
export const engineConfigSchema = z
  .object({
    /** Absolute path to the canonical content root (contains agents/ and skills/). */
    contentDir: z.string().min(1),
    /** Default handoff directory offered during `init`. */
    defaultHandoffDir: z.string().min(1).default(".hephaestus"),
  })
  .strict();
export type EngineConfig = z.infer<typeof engineConfigSchema>;
