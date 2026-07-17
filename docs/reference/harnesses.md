# harnesses

a harness is a target coding tool hephaestus knows how to provision agents and skills into.

this page documents exactly what each harness writes and how the abstract canon model maps onto it.

## status

`claude code` is the only harness wired into the registry today.

`codex` and `copilot` are reserved identifiers. they validate in frontmatter (`modelOverrides`, harness selection) but have no renderer yet.

selecting them at `forge` time isn't possible until future releases.

## claude code

### output

| type  | written to                           |
| ----- | ------------------------------------ |
| agent | `.claude/agents/<id>.md`             |
| skill | `.claude/skills/<skill-name>/<file>` |

**agents**

agent files are markdown with YAML frontmatter that claude code understands directly.

| field         | source                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| `name`        | the agent's `id`                                                            |
| `description` | copied verbatim from canonincal source frontmatter                          |
| `tools`       | canon `tools` mapped through the table below (omitted if the list is empty) |
| `model`       | resolved from `tier` (or `modelOverrides.claude`, which wins outright)      |

**skills**

skill files are copied through with their original filename (`conventions.md` stays `conventions.md`). bundled non-markdown files inside a skill directory are carried through byte-for-byte.

### abstract tools

canonical source frontmatter declares tools abstractly so the same agent file can target multiple harnesses.

claude maps them like this:

| abstract    | claude concrete |
| ----------- | --------------- |
| `read`      | `Read`          |
| `write`     | `Write`         |
| `edit`      | `Edit`          |
| `search`    | `Grep`, `Glob`  |
| `execute`   | `Bash`          |
| `websearch` | `WebSearch`     |
| `webfetch`  | `WebFetch`      |
| `delegate`  | `Agent`         |

`delegate` is ungated. any agent listing it can spawn any subagent type.

::: details what does empty tools mean?
leaving `tools` empty or omitting it entirely is the sanctioned way to inherit every tool claude code offers. useful when a step needs capability beyond the abstract set above, such as MCP-provided tools.

this is all-or-nothing. the agent trades away granular scoping in exchange for that broader reach. so reserve it for genuine gaps in the abstract set.
:::

::: warning unrecognised tool values
skipped silently. `forge`/`temper` logs `⚠ Unrecognised tool "<value>" for Claude harness — no output tool granted.`. see [agent frontmatter](/reference/canonical-source#agent-frontmatter) for why this is allowed.
:::

### model tiers

`tier` is abstract, not a concrete model (see [model tiers](/reference/canonical-source#model-tiers) for why).

claude maps tiers like this:

| tier       | claude model |
| ---------- | ------------ |
| `fast`     | haiku        |
| `balanced` | sonnet       |
| `flagship` | opus         |

`modelOverrides.claude` wins over this map outright, if set.

### <code v-pre>{{skills}}</code>

see [tokens](/reference/canonical-source#tokens) for what this token means in general.

claude code renders it like this, with paths relative to the agent's own output location (`.claude/agents/`) so the links resolve correctly on disk:

```markdown
| Skill        | Reference                                    |
| ------------ | -------------------------------------------- |
| agent-output | [handoff](../skills/agent-output/handoff.md) |
```

a skill with more than one content file lists all of them, comma-separated, in the `Reference` column.

## codex

<p class="tagline"><em>reserved.</em></p>

`HarnessId` already includes `"codex"`, and `modelOverrides` accepts keys for it, so you can prepare overrides ahead of time.

but `hephaestus forge` won't offer it as a selectable target and no renderer exists until its wired in.

## copilot

<p class="tagline"><em>reserved.</em></p>

`HarnessId` already includes `"copilot"`, and `modelOverrides` accepts keys for it, so you can prepare overrides ahead of time.

but `hephaestus forge` won't offer it as a selectable target and no renderer exists until its wired in.
