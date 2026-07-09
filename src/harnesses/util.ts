import { stringify as stringifyYaml } from "yaml";

/**
 * assemble a markdown document with YAML frontmatter. shared by markdown-based
 * harnesses (Claude, and later Copilot). keys are emitted in insertion order.
 */
export function buildMarkdownDocument(frontmatter: Record<string, unknown>, body: string): string {
  const yaml: string = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}
