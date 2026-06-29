import { stringify as stringifyYaml } from "yaml";

/**
 * Assemble a markdown document with YAML frontmatter. Shared by markdown-based
 * harnesses (Claude, and later Copilot). Keys are emitted in insertion order.
 */
export function buildMarkdownDocument(frontmatter: Record<string, unknown>, body: string): string {
  const yaml: string = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}
