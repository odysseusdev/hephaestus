/**
 * public programmatic entry point. the engine is standalone — it has no bundled
 * content. point it at your own canonical source via `hephaestus bind`, the
 * `HEPHAESTUS_CANON_DIR` environment variable, or by calling `loadConfig` after
 * writing a global config with `writeGlobalConfig`.
 */

export {
  loadConfig,
  CONTENT_DIR_ENV,
  DEFAULT_OUTPUT_DIR,
  EngineConfigNotFoundError,
} from "./core/config.js";
export {
  readGlobalConfig,
  writeGlobalConfig,
  validateCanonDir,
  expandHome,
  GLOBAL_CONFIG_PATH,
  type GlobalConfig,
} from "./core/globalconfig.js";
export { loadCanonical, CanonicalLoadError, type CanonicalContent } from "./core/loader.js";
export {
  renderAll,
  buildLockfile,
  toLockOutput,
  previousLockHash,
  selectionFromLock,
  type ProvisionSelection,
  type RenderedOutput,
  type HashedFile,
} from "./core/provision.js";
export {
  decideFile,
  resolveDrift,
  buildConflictMarkers,
  CONFLICT_MARKERS,
  type SyncDecision,
  type DriftStrategy,
  type FileSyncInput,
} from "./core/sync.js";
export {
  readLockfile,
  writeLockfile,
  LOCKFILE_NAME,
  LOCKFILE_VERSION,
  LockfileError,
  LockfileTooNewError,
  type Lockfile,
  type LockfileMigrationNotice,
} from "./core/lockfile.js";
export { LOCKFILE_MIGRATIONS, applyMigrations, type LockfileMigration } from "./core/lockfile-migrations.js";
export { hashContents, rollupHash } from "./core/hash.js";
export { writeOutputs, ensureOutputDir } from "./core/writer.js";
export {
  expandTokens,
  formatHandoffList,
  findUnknownTokens,
  EMPTY_HANDOFF_PHRASE,
  type TokenValues,
} from "./core/render.js";
export { ENGINE_VERSION } from "./core/version.js";

export {
  availableHarnesses,
  getHarness,
  isHarnessAvailable,
  type Harness,
  type RenderContext,
  type RenderedFile,
} from "./harnesses/index.js";
export { resolveModelFor, MODEL_MAP } from "./harnesses/models.js";

export type {
  Tier,
  HarnessId,
  AbstractTool,
  CanonicalAgent,
  CanonicalSkill,
  CanonicalSkillFile,
  BundledFile,
  EngineConfig,
} from "./core/schema.js";
export { TIERS, HARNESS_IDS, ABSTRACT_TOOLS, KNOWN_TOKENS } from "./core/schema.js";
