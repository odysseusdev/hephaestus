# concepts

## canonical source

hephaestus reads from a **canonical source**, a directory you own and maintain, pointed to once with `hephaestus bind`. it never writes into your canon; every write happens in the project you `forge`/`temper`.

a canonical source is just two directories: `agents/`, one markdown file per agent, and `skills/`, one subdirectory per skill. see [canonical source reference](/reference/canonical-source) for the exact layout, frontmatter fields, and validation rules.

## agents

each agent is a single markdown file at `agents/<id>.md`: YAML frontmatter hephaestus reads, and a markdown body the harness reads. frontmatter declares things like the agent's `id`, its abstract `tier`, and which `tools` and `skills` it needs.

see [canonical source reference](/reference/canonical-source#agent-frontmatter) for the full field table, including which fields are required and what happens on validation failure.

### tokens

the agent body is plain markdown, with two template tokens hephaestus expands at forge time. <code v-pre>{{output}}</code>, the project's configured output path and <code v-pre>{{skills}}</code>, a table linking the agent's declared skills.

any other <code v-pre>{{token}}</code> is left untouched, so agent bodies can safely contain their own placeholder syntax.

::: warning `skills:` isn't automatic
declaring `skills:` in frontmatter provisions the files, but it does _not_ make the agent aware of them at runtime — only the <code v-pre>{{skills}}</code> token does that. see [canonical source reference → template tokens](/reference/canonical-source#tokens) for the full explanation.
:::

## skills

a skill is a directory under `skills/<slug>/`, with one or more markdown files carrying the actual rules (`conventions.md`, `patterns.md`, whatever split makes sense). non-markdown files are carried through to the harness untouched, byte-for-byte.

agents reference skills by directory slug in their own `skills:` frontmatter. see [canonical source reference](/reference/canonical-source#skill-frontmatter) for the frontmatter convention and how hephaestus handles skills shared across agents.

## harnesses

a harness is a target coding tool hephaestus provisions agents/skills into.

hephaestus defines the concrete output paths, the tool-name mapping, and how agents and skills gets rendered for that tool.

::: details which harnesses are available?
claude code ships today. copilot and codex are reserved identifiers for future releases.
:::

each project selects one or more harnesses at `forge` time, and the same canon renders differently for each.

see [harness reference](/reference/harnesses) for exactly what gets written to disk.

## lockfile

every `forge` writes `hephaestus.lock.yaml` into the project, recording the hash of what it wrote. `temper` uses that record to tell whether you or the canonical source changed a file since — deciding whether to update it, keep your edit, or flag it as drift for you to resolve.

see [lockfile reference](/reference/lockfile) for the full decision table and how drift gets resolved.
