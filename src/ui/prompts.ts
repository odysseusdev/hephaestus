import * as clack from "@clack/prompts";

import { ENGINE_VERSION } from "../core/version.js";
import { bold, dim, theme } from "./theme.js";

/** A selectable option for a select/multiselect prompt. */
export interface PromptOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Unwrap a clack prompt result, exiting gracefully on cancel (Ctrl+C / Esc).
 * Centralises cancellation so every prompt behaves consistently.
 */
function unwrap<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel(theme.danger("cancelled. nothing was written."));
    process.exit(130);
  }
  return value as T;
}

/** Print the themed intro banner with a prominent header and per-command tagline. */
export function intro(command: string, subtitle: string): void {
  const header = `  ${theme.fire("󰈸")}  ${bold(theme.accent("hephaestus"))}  ${dim("·")}  ${dim(ENGINE_VERSION)}`;
  process.stdout.write(`\n${header}\n\n`);
  clack.intro(bold(theme.text(command)));
  clack.log.message(theme.muted(subtitle));
}

/** Print the themed outro banner. */
export function outro(message: string): void {
  clack.outro(theme.accentAlt(message));
}

/** Print a titled note block. */
export function note(message: string, title?: string): void {
  clack.note(message, title ? theme.accent(title) : undefined);
}

export const log = clack.log;

/** Multi-select prompt. Returns the chosen values. */
export async function multiselect<T extends string>(
  message: string,
  options: PromptOption<T>[],
  initialValues: T[] = [],
  required = true,
): Promise<T[]> {
  // Drive clack with a concrete `string` type so its conditional Option type resolves;
  // values are already strings (T extends string).
  const result = await clack.multiselect({
    message: theme.text(message),
    options: options.map((option) => ({
      value: option.value as string,
      label: option.label,
      hint: option.hint,
    })),
    initialValues: initialValues as string[],
    required,
  });
  return unwrap(result) as T[];
}

/** Single-select prompt. Returns the chosen value. */
export async function select<T extends string>(
  message: string,
  options: PromptOption<T>[],
  initialValue?: T,
): Promise<T> {
  const result = await clack.select({
    message: theme.text(message),
    options: options.map((option) => ({
      value: option.value as string,
      label: option.label,
      hint: option.hint,
    })),
    initialValue: initialValue as string | undefined,
  });
  return unwrap(result) as T;
}

/** Text input prompt with an optional default value. */
export async function text(message: string, defaultValue: string): Promise<string> {
  const result = await clack.text({
    message: theme.text(message),
    placeholder: defaultValue,
    defaultValue,
  });
  const value: string = unwrap(result);
  return value.trim().length > 0 ? value.trim() : defaultValue;
}

/** Yes/no confirmation prompt. */
export async function confirm(message: string, initialValue = true): Promise<boolean> {
  const result = await clack.confirm({ message: theme.text(message), initialValue });
  return unwrap(result);
}
