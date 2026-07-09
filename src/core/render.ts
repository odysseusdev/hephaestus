import { KNOWN_TOKENS, type KnownToken } from "./schema.js";

/** Matches `{{ token.name }}` with optional inner whitespace. */
const TOKEN_REGEX: RegExp = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Phrase rendered when a handoff `reads`/`writes` list is empty. */
export const EMPTY_HANDOFF_PHRASE = "(none)";

/** Extract distinct token names from an agent body, in first-seen order. */
export function extractTokenNames(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(TOKEN_REGEX)) {
    const name: string = match[1] as string;
    if (!found.includes(name)) {
      found.push(name);
    }
  }
  return found;
}

/** Return token names in the body that are not in the known set. */
export function findUnknownTokens(body: string): string[] {
  const known: readonly string[] = KNOWN_TOKENS;
  return extractTokenNames(body).filter((name) => !known.includes(name));
}

/**
 * Format a handoff file list into a token value. Each file is joined to the
 * handoff dir with forward slashes (portable in agent instructions), comma-separated.
 * An empty list renders as {@link EMPTY_HANDOFF_PHRASE}.
 */
export function formatHandoffList(files: string[], handoffDir: string): string {
  if (files.length === 0) {
    return EMPTY_HANDOFF_PHRASE;
  }
  const normalisedDir: string = handoffDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return files.map((file) => `${normalisedDir}/${file}`).join(", ");
}

/** The fully-resolved replacement value for every known token. */
export type TokenValues = Record<KnownToken, string>;

/**
 * Expand all known tokens in an agent body. Unknown tokens (anything not in
 * `values`, i.e. not in {@link KNOWN_TOKENS}) are left untouched in the output
 * by design — agent bodies may legitimately contain `{{token}}` placeholders
 * that belong to a different templating system or are literal doc examples,
 * and those should pass through unmodified rather than fail rendering.
 */
export function expandTokens(body: string, values: TokenValues): string {
  return body.replace(TOKEN_REGEX, (whole: string, name: string): string => {
    if (!(name in values)) {
      return whole;
    }
    return values[name as KnownToken];
  });
}
