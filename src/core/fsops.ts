import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

/**
 * convert a project-relative POSIX path to an absolute OS-native path, rooted
 * under `projectRoot`. rejects `../` and absolute-path escapes, and a tracked
 * symlink at an intermediate directory (e.g. `.claude/skills`) redirecting
 * outside the root.
 */
export async function toProjectPath(
  projectRoot: string,
  relativePosixPath: string,
): Promise<string> {
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

  await assertNoSymlinkEscape(resolvedRoot, resolvedPath, relativePosixPath);

  return resolvedPath;
}

/**
 * walk `resolvedPath`'s ancestors up to `resolvedRoot`, rejecting if an
 * existing one is a symlink escaping the root. stops at the first
 * not-yet-created segment (mkdir makes plain dirs below that) and never
 * inspects the leaf itself (writeFileAtomic's rename is already leaf-safe).
 */
async function assertNoSymlinkEscape(
  resolvedRoot: string,
  resolvedPath: string,
  relativePosixPath: string,
): Promise<void> {
  const realRoot: string = await realpathOrSelf(resolvedRoot);

  let current: string = dirname(resolvedPath);
  while (current === resolvedRoot || current.startsWith(resolvedRoot + sep)) {
    if (current === resolvedRoot) {
      // the root itself may legitimately be a symlink (e.g. a symlinked
      // tmpdir); it defines the trust boundary rather than being checked
      // against it.
      return;
    }

    const stats = await lstat(current).catch((error: unknown) => {
      if (isNotFound(error)) return null;
      throw error;
    });
    if (stats === null) {
      // nothing exists here yet; mkdir will create plain directories below
      // this point, so there is no further symlink risk to check.
      return;
    }

    if (stats.isSymbolicLink()) {
      const realCurrent: string = await realpath(current);
      const escapesRoot: boolean =
        realCurrent !== realRoot && !realCurrent.startsWith(realRoot + sep);
      if (escapesRoot) {
        throw new Error(
          `refusing to resolve "${relativePosixPath}" outside the project root (${resolvedRoot}): ` +
            `"${current}" is a symlink pointing outside it.`,
        );
      }
    }

    current = dirname(current);
  }
}

/** resolve a path's real (symlink-free) form, falling back to the path itself if it does not exist yet. */
async function realpathOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error: unknown) {
    if (isNotFound(error)) return path;
    throw error;
  }
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

/**
 * remove a directory only if empty. silently ignores ENOENT and ENOTEMPTY;
 * other errors (e.g. EACCES) are rethrown with context.
 */
export async function tryRemoveEmptyDir(dirPath: string): Promise<void> {
  try {
    await rmdir(dirPath);
  } catch (error: unknown) {
    if (isNotFound(error) || isErrorCode(error, "ENOTEMPTY")) {
      return;
    }
    throw new Error(`Failed to remove ${dirPath}: ${describeError(error)}`);
  }
}

/** remove a directory and all of its contents recursively. */
export async function removeDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}

/** whether an unknown error carries the given Node error `code`. */
function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

/** whether an unknown error is a Node "file not found" error. */
function isNotFound(error: unknown): boolean {
  return isErrorCode(error, "ENOENT");
}

/** extract a human-readable message from an unknown thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
