---
description: canonical skill file format and body structure for hephaestus skills.
---

# skill format

apply when authoring or reviewing a canonical skill file (`<content-dir>/skills/<id>/<name>.md`).

## directory structure

each skill is a directory under `<content-dir>/skills/<slug>/`. the slug is lowercase, hyphen-separated.

- at least one `*.md` content file is required. directories with no `.md` files are silently skipped.
- non-markdown files (scripts, references, etc.) are carried through untouched.
- file names should be descriptive: `conventions.md`, `components.md`, `patterns.md`, `errors.md`.
- a single skill directory can contain multiple `.md` files if the content is large enough to split.

## frontmatter

skill frontmatter is passed through to the harness unchanged. no schema validation is applied. by convention, always include exactly one field:

```yaml
---
description: one sentence. what this skill covers and when it applies.
---
```

no other frontmatter fields are required or expected.

## body structure

```markdown
# skill name

one-liner restating the skill's scope.

## section-name

- imperative rule
- imperative rule

## section-name

- imperative rule
- imperative rule
```

## writing rules

- section names are lowercase, hyphen-separated (e.g. `## error-handling`, `## component-composition`).
- rules are imperative directives: "use x", "never y", "prefer a over b".
- no prose paragraphs. no explanations unless a rule is genuinely non-obvious.
- one rule per bullet. rules do not nest.
- aim for 3-8 rules per section. if a section has more than 8, split it into two named sections.
- the opening line after the `# skill name` heading is a short scope summary, not a section heading.
