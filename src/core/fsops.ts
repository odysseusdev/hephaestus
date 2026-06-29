import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

/** Convert a project-relative POSIX path to an absolute OS-native path. */
export function toProjectPath(projectRoot: string, relativePosixPath: string): string {
  const nativeRelative: string = relativePosixPath.split("/").join(sep);
  return resolve(projectRoot, nativeRelative);
}

/** Ensure a directory exists, creating parent directories as needed. */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Read a file as UTF-8, returning null if it does not exist. Other IO errors are rethrown with context. */
export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return null;
    }
    throw new Error(`Failed to read ${filePath}: ${describeError(error)}`);
  }
}

/**
 * Atomically write a file: write to a sibling temp file then rename into place,
 * so a crash mid-write cannot leave a half-written target. Creates parent dirs.
 */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  if (!isAbsolute(filePath)) {
    throw new Error(`writeFileAtomic requires an absolute path, received: ${filePath}`);
  }

  const dir: string = dirname(filePath);
  await ensureDir(dir);

  const tempPath: string = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(tempPath, contents, "utf8");
    await rename(tempPath, filePath);
  } catch (error: unknown) {
    // Best-effort cleanup of the temp file; ignore if it is already gone.
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new Error(`Failed to write ${filePath}: ${describeError(error)}`);
  }
}

/** Remove a single file. Returns true if deleted, false if it did not exist. Other IO errors are rethrown. */
export async function removeFile(filePath: string): Promise<boolean> {
  try {
    await rm(filePath);
    return true;
  } catch (error: unknown) {
    if (isNotFound(error)) return false;
    throw new Error(`Failed to remove ${filePath}: ${describeError(error)}`);
  }
}

/** Remove a directory only if empty. Silently ignores ENOENT and ENOTEMPTY. */
export async function tryRemoveEmptyDir(dirPath: string): Promise<void> {
  try {
    await rmdir(dirPath);
  } catch {
    // ENOENT or ENOTEMPTY — leave as-is
  }
}

/** Remove a directory and all of its contents recursively. */
export async function removeDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}

/** Whether an unknown error is a Node "file not found" error. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

/** Extract a human-readable message from an unknown thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
