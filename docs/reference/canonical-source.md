# canonical source

full directory layout and frontmatter schema for a canonical source.

see [concepts](/guide/concepts) for the narrative version.

## directory structure

```
<canon-dir>/
  agents/        # one .md file per agent
  skills/        # one subdirectory per skill
    my-skill/
      conventions.md
```

the path passed to `hephaestus bind` must contain both `agents/` and `skills/` subdirectories. `bind` validates this before writing the config, so a typo'd path fails immediately rather than surfacing later at `forge` time.

## slugs

`id`, `category`, and each entry in `skills` are all validated against the same pattern. lowercase letters, numbers, and single hyphens, e.g. `agent-creator`, `my-skill-2`.

no leading/trailing hyphens, no consecutive hyphens, no uppercase.

## agent frontmatter

each agent is a single markdown file at `agents/<id>.md`.

`id` must match the filename exactly (`agents/agent-creator.md` → `id: agent-creator`).

| field            | required | notes                                                                                                                                                                                                                        |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | yes      | slug. must match. filename                                                                                                                                                                                                   |
| `name`           | yes      | lowercase display name.                                                                                                                                                                                                      |
| `category`       | no       | slug. groups the agent for easier selection. omitted agents fall under `general`.                                                                                                                                            |
| `summary`        | yes      | 1–80 chars. shown as the hint when `forge`-ing. meant for humans.                                                                                                                                                            |
| `description`    | yes      | any non-empty string; by convention 1+ sentence, "does x. use when y.". meant for agents.                                                                                                                                    |
| `tier`           | yes      | `fast` / `balanced` / `flagship`. maps to a model per harness.                                                                                                                                                               |
| `tools`          | no       | abstract set: `read`, `write`, `edit`, `search`, `execute`, `websearch`, `webfetch`, `delegate`. defaults to `[]`. an empty list also grants full harness access. see [abstract tools](/reference/harnesses#abstract-tools). |
| `skills`         | no       | slugs referencing directories under `skills/`. defaults to `[]`.                                                                                                                                                             |
| `modelOverrides` | no       | a specific model per harness, keyed by harness id, e.g. `{ claude: opus }`. wins over the tier map.                                                                                                                          |

`id`, `name`, `summary`, `description`, and `tier` must be present and valid or hephaestus rejects the file with a field-by-field error.

everything else is silently ignored, so independently-maintained canon files can carry custom metadata without breaking on a hephaestus upgrade.

::: warning tool values aren't validated
`tools` accepts any string, not just the eight names above. an unrecognised value doesn't fail loading, it just means no harness maps it to anything.

see [abstract tools](/reference/harnesses#abstract-tools) for what that looks like at forge time.
:::

### model tiers

each agent declares an abstract `tier` (`fast` / `balanced` / `flagship`), not a concrete model.

every harness maps tiers to its own models. see [model tiers](/reference/harnesses#model-tiers) for the individual harness mappings.

::: tip need to use a specific model?
use `modelOverrides` in an agent's frontmatter to pin a specific model alias for one harness regardless of tier; an override always wins over the tier map.
:::

## skill frontmatter

skills carry no schema. frontmatter passes through to the harness unchanged, unvalidated.

by convention, one field:

| field         | required | notes                   |
| ------------- | -------- | ----------------------- |
| `description` | no       | one line, by convention |

non-markdown files inside a skill directory (scripts, reference data, anything) are carried through to the harness untouched, as raw bytes, so binary assets survive intact.

agents reference skills by directory slug in their own `skills:` frontmatter, never at the individual-file level. hephaestus provisions the **union** of skills referenced by whichever agents you select at `forge` time.

::: info what happens when multiple agents use the same skills?
skills aren't picked separately, and a skill referenced by two selected agents is only written once.
:::

## tokens

expanded inside agent bodies at forge time. any other <code v-pre>{{token}}</code> is left untouched, safe for agent bodies that legitimately contain <code v-pre>{{...}}</code> placeholders belonging to something else.

| token                         | expands to                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| <code v-pre>{{output}}</code> | the project-relative path to the configured output directory. resolved fresh on every `forge`/`temper`. |
| <code v-pre>{{skills}}</code> | a markdown table linking every skill the agent declares, relative to the agent's location.              |

**<span v-pre>{{output}}</span>**

<code v-pre>{{output}}</code> points at the provisioned output directory (default `.hephaestus/`, set per project during `forge`). hephaestus has no opinion on what goes there or in what format, and using it at all is optional.

the example agents under [`examples/`](https://github.com/odysseusdev/hephaestus/tree/main/examples) write handoff files there by convention; see the `agent-output` skill under `examples/skills/` for that format.

::: details why does the token stay a relative path, not an absolute path?
<code v-pre>{{output}}</code> expands to the _project-relative_ output directory, never an absolute path. baking an absolute path into rendered output would break the moment the provisioned files are committed and cloned onto a different machine at a different path.

agents resolve the relative token against the project root themselves at runtime.
:::

**<span v-pre>{{skills}}</span>**

<code v-pre>{{skills}}</code> generates a markdown table that links each skill in the agent's frontmatter to the associated skill files.

::: warning `skills:` isn't automatic
declaring `skills:` in frontmatter provisions the files, but it does _not_ make the agent aware of them at runtime.

<code v-pre>{{skills}}</code> is the only thing that turns that list into something the agent can actually read. skip the token and the harness never sees the link.

by convention it sits alone in a closing `## your skills` section, so it renders as a clean table block rather than mid-paragraph.
:::
