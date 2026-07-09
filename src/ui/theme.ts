import pc from "picocolors";

/**
 * Catppuccin Macchiato palette. single source of truth for colour in the CLI.
 * @see https://catppuccin.com/palette
 */
export const MACCHIATO = {
  rosewater: "#f4dbd6",
  flamingo: "#f0c6c6",
  pink: "#f5bde6",
  mauve: "#c6a0f6",
  red: "#ed8796",
  maroon: "#ee99a0",
  peach: "#f5a97f",
  yellow: "#eed49f",
  green: "#a6da95",
  teal: "#8bd5ca",
  sky: "#91d7e3",
  sapphire: "#7dc4e7",
  blue: "#8aadf4",
  lavender: "#b7bdf8",
  text: "#cad3f5",
  subtext1: "#b8c0e0",
  subtext0: "#a5adcb",
  overlay2: "#939ab7",
  overlay1: "#8087a2",
  overlay0: "#6e738d",
  surface2: "#5b6078",
  surface1: "#494d64",
  surface0: "#363a4f",
  base: "#24273a",
  mantle: "#1e2030",
  crust: "#181926",
} as const;

export type PaletteColor = keyof typeof MACCHIATO;

/** parse a `#rrggbb` string into its RGB components. */
function toRgb(hex: string): [number, number, number] {
  const value: number = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * colour text using a 24-bit truecolor escape. falls back to plain text when
 * colour is not supported (NO_COLOR, non-TTY, dumb terminal).
 */
export function paint(color: PaletteColor, text: string): string {
  if (!pc.isColorSupported) {
    return text;
  }
  const [r, g, b] = toRgb(MACCHIATO[color]);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/** embolden text (respects colour support). */
export function bold(text: string): string {
  return pc.bold(text);
}

/** dim text (respects colour support). */
export function dim(text: string): string {
  return pc.dim(text);
}

/** semantic colour helpers — palette colours mapped to UI roles. */
export const theme = {
  accent: (text: string): string => paint("mauve", text),
  accentAlt: (text: string): string => paint("lavender", text),
  fire: (text: string): string => paint("peach", text),
  success: (text: string): string => paint("green", text),
  warn: (text: string): string => paint("yellow", text),
  danger: (text: string): string => paint("red", text),
  conflict: (text: string): string => paint("maroon", text),
  info: (text: string): string => paint("sky", text),
  muted: (text: string): string => paint("subtext0", text),
  hint: (text: string): string => paint("overlay0", text),
  text: (text: string): string => paint("text", text),
} as const;
