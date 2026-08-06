# harnesses

a harness is a target coding tool hephaestus knows how to provision agents and skills into.

this page documents exactly what each harness writes and how the abstract canon model maps onto it.

## status

`claude code` and `copilot` are wired into the registry today.

`codex` is a reserved identifier. it validates in frontmatter (`modelOverrides`, harness selection) but has no renderer yet.

selecting it at `forge` time isn't possible until a future release.

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

## copilot

### output

| type  | written to                           |
| ----- | ------------------------------------ |
| agent | `.github/agents/<id>.agent.md`       |
| skill | `.github/skills/<skill-name>/<file>` |

**agents**

agent files are markdown with YAML frontmatter, shared (with caveats) across VS Code, Copilot CLI, and the Copilot cloud agent. frontmatter is deliberately limited to the portable intersection all three surfaces accept.

| field         | source                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `name`        | the agent's `id`                                                                                                        |
| `description` | copied verbatim from canonincal source frontmatter                                                                      |
| `tools`       | canon `tools` mapped through the table below (omitted if the list is empty)                                             |
| `model`       | resolved from `tier` (or `modelOverrides.copilot`, which wins outright); always a scalar string, never a fallback array |

VS Code-only fields (`argument-hint`, `handoffs`, `agents`, `hooks`) are never emitted, and `model` is never emitted as an array — Copilot CLI rejects the array fallback-list form VS Code accepts ([`copilot-cli#2133`](https://github.com/github/copilot-cli/issues/2133)).

**skills**

skill files are copied through with their original filename (`conventions.md` stays `conventions.md`). bundled non-markdown files inside a skill directory are carried through byte-for-byte.

### abstract tools

copilot maps them like this:

| abstract    | copilot concrete |
| ----------- | ---------------- |
| `read`      | `read`           |
| `write`     | `edit`           |
| `edit`      | `edit`           |
| `search`    | `search`         |
| `execute`   | `execute`        |
| `websearch` | `web`            |
| `webfetch`  | `web`            |
| `delegate`  | `agent`          |

copilot has no separate `write` alias — write operations fall under `edit` — and `web` covers both search and fetch.

`delegate` is ungated, same as claude: any agent listing it can spawn any subagent type. see the claude section above for why.

::: warning unrecognised tool values
an unrecognised value just gets skipped: the agent gets no matching tool for it, and `forge`/`temper` prints `⚠ Unrecognised tool "<value>" for Copilot harness — no output tool granted.`.
:::

### model tiers

copilot maps tiers like this:

| tier       | copilot model     |
| ---------- | ----------------- |
| `fast`     | Claude Haiku 4.5  |
| `balanced` | Claude Sonnet 4.6 |
| `flagship` | Claude Opus 4.6   |

`modelOverrides.copilot` wins over this map outright, if set.

::: warning no canonical slug format
unlike claude and openai's own APIs, copilot has no single stable model identifier — its `model` field takes whatever display string the calling environment's picker resolves, and the roster rotates roughly monthly. treat the defaults above as reasonable picks, not guaranteed-stable identifiers, and use `modelOverrides.copilot` if one goes stale for your setup.
:::

### <code v-pre>{{skills}}</code>

see [tokens](/reference/canonical-source#tokens) for what this token means in general.

copilot renders it like this, with paths relative to the agent's own output location (`.github/agents/`) so the links resolve correctly on disk:

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
