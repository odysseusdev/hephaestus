import * as clack from "@clack/prompts";

import { ENGINE_VERSION } from "../core/version.js";
import { bold, dim, theme } from "./theme.js";

/** a selectable option for a select/multiselect prompt. */
export interface PromptOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * unwrap a clack prompt result, exiting gracefully on cancel (Ctrl+C / Esc).
 * centralises cancellation so every prompt behaves consistently.
 */
function unwrap<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel(theme.danger("cancelled. nothing was written."));
    process.exit(130);
  }
  return value as T;
}

/** whether the current process is attached to an interactive terminal that can serve a prompt. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY);
}

/**
 * throw a clear, actionable error when stdin is not a TTY, instead of letting a
 * clack prompt hang indefinitely or crash with a raw Node "unsettled top-level
 * await" warning. callers with a specific non-interactive alternative (a flag,
 * a positional argument) should call this themselves before starting their
 * interactive flow so the message can name that alternative; the check here
 * is a defense-in-depth fallback for any prompt call that skips it.
 *
 * @param nonInteractiveHint - a short suggestion for accomplishing the same
 *   operation without a prompt. defaults to a generic re-run suggestion.
 * @throws {Error} if stdin is not a TTY.
 */
export function assertInteractive(
  nonInteractiveHint = "re-run this command in an interactive terminal.",
): void {
  if (!isInteractive()) {
    throw new Error(
      `this command needs an interactive terminal to prompt for input, but stdin is not a TTY. ${nonInteractiveHint}`,
    );
  }
}

/** print the themed intro banner with a prominent header and per-command tagline. */
export function intro(command: string, subtitle: string): void {
  const header = `  ${theme.fire("󰈸")}  ${bold(theme.fire("hephaestus"))}  ${dim("·")}  ${dim(ENGINE_VERSION)}`;
  process.stdout.write(`\n${header}\n\n`);
  clack.intro(bold(theme.text(command)));
  clack.log.message(theme.muted(subtitle));
}

/** print the themed outro banner. */
export function outro(message: string): void {
  clack.outro(theme.accentAlt(message));
}

/** print a titled note block. */
export function note(message: string, title?: string): void {
  clack.note(message, title ? theme.accent(title) : undefined);
}

/** multi-select prompt. returns the chosen values. */
export async function multiselect<T extends string>(
  message: string,
  options: PromptOption<T>[],
  initialValues: T[] = [],
  required = true,
): Promise<T[]> {
  assertInteractive();
  // drive clack with a concrete `string` type so its conditional Option type resolves;
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

/**
 * grouped multi-select prompt. options are bucketed under named categories; selecting a
 * category header toggles every option beneath it. returns the chosen values, flattened
 * across categories.
 */
export async function groupMultiselect<T extends string>(
  message: string,
  groups: Record<string, PromptOption<T>[]>,
  initialValues: T[] = [],
  required = true,
): Promise<T[]> {
  assertInteractive();
  const options: Record<string, { value: string; label: string; hint?: string }[]> = {};
  for (const [category, categoryOptions] of Object.entries(groups)) {
    options[category] = categoryOptions.map((option) => ({
      value: option.value as string,
      label: option.label,
      hint: option.hint,
    }));
  }
  const result = await clack.groupMultiselect({
    message: theme.text(message),
    options,
    initialValues: initialValues as string[],
    required,
  });
  return unwrap(result) as T[];
}

/** single-select prompt. returns the chosen value. */
export async function select<T extends string>(
  message: string,
  options: PromptOption<T>[],
  initialValue?: T,
): Promise<T> {
  assertInteractive();
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

/** text input prompt with an optional default value. */
export async function text(message: string, defaultValue: string): Promise<string> {
  assertInteractive();
  const result = await clack.text({
    message: theme.text(message),
    placeholder: defaultValue,
    defaultValue,
  });
  const value: string = unwrap(result);
  return value.trim().length > 0 ? value.trim() : defaultValue;
}

/** yes/no confirmation prompt. */
export async function confirm(message: string, initialValue = true): Promise<boolean> {
  assertInteractive();
  const result = await clack.confirm({ message: theme.text(message), initialValue });
  return unwrap(result);
}
