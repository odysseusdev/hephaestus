import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

/**
 * convert a project-relative POSIX path to an absolute OS-native path, rooted
 * under `projectRoot`.
 *
 * @throws {Error} if the resolved path escapes `projectRoot` — via `../`
 *   segments or by `relativePosixPath` itself being absolute. this guards every
 *   caller that persists or prompts for a path (e.g. the `outputDir` prompt
 *   value in `forge`) against writing or deleting outside the project.
 */
export function toProjectPath(projectRoot: string, relativePosixPath: string): string {
  const nativeRelative: string = relativePosixPath.split("/").join(sep);
  const resolvedRoot: string = resolve(projectRoot);
  const resolvedPath: string = resolve(resolvedRoot, nativeRelative);

  const isWithinRoot: boolean =
    resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + sep);
  if (!isWithinRoot) {
    throw new Error(
      `refusing to resolve "${relativePosixPath}" outside the project root (${resolvedRoot}).`,
    );
  }

  return resolvedPath;
}

/** ensure a directory exists, creating parent directories as needed. */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * read a file's raw bytes, returning null if it does not exist. other IO errors
 * are rethrown with context.
 *
 * deliberately binary-safe (no encoding is forced): callers that know a file is
 * text (e.g. the lockfile, JSON config) decode it themselves with
 * `.toString("utf8")`, while callers handling bundled skill resources (which may
 * be binary) can compare/write the bytes untouched.
 */
export async function readFileIfExists(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return null;
    }
    throw new Error(`Failed to read ${filePath}: ${describeError(error)}`);
  }
}

/**
 * atomically write a file: write to a sibling temp file then rename into place,
 * so a crash mid-write cannot leave a half-written target. creates parent dirs.
 *
 * accepts either UTF-8 text or raw bytes so binary bundled skill resources
 * round-trip losslessly through the same write path as rendered text files.
 */
export async function writeFileAtomic(
  filePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  if (!isAbsolute(filePath)) {
    throw new Error(`writeFileAtomic requires an absolute path, received: ${filePath}`);
  }

  const dir: string = dirname(filePath);
  await ensureDir(dir);

  const tempPath: string = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);
  try {
    if (typeof contents === "string") {
      await writeFile(tempPath, contents, "utf8");
    } else {
      await writeFile(tempPath, contents);
    }
    await rename(tempPath, filePath);
  } catch (error: unknown) {
    // best-effort cleanup of the temp file; ignore if it is already gone.
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new Error(`Failed to write ${filePath}: ${describeError(error)}`);
  }
}

/** remove a single file. returns true if deleted, false if it did not exist. other IO errors are rethrown. */
export async function removeFile(filePath: string): Promise<boolean> {
  try {
    await rm(filePath);
    return true;
  } catch (error: unknown) {
    if (isNotFound(error)) return false;
    throw new Error(`Failed to remove ${filePath}: ${describeError(error)}`);
  }
}

/** remove a directory only if empty. silently ignores ENOENT and ENOTEMPTY. */
export async function tryRemoveEmptyDir(dirPath: string): Promise<void> {
  try {
    await rmdir(dirPath);
  } catch {
    // ENOENT or ENOTEMPTY — leave as-is
  }
}

/** remove a directory and all of its contents recursively. */
export async function removeDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}

/** whether an unknown error is a Node "file not found" error. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

/** extract a human-readable message from an unknown thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
