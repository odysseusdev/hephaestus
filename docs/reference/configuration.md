# configuration

## global config file

`~/.config/hephaestus/config.json` stores the bound canonical source as an absolute path:

```json
{
  "canonDir": "/Users/you/my-canon"
}
```

`hephaestus bind` writes it. delete the file (or re-run `bind`) to change the bound source.

:::info path type
`bind` accepts a `~`-prefixed or relative path and resolves it to absolute before writing, so the config never depends on the working directory or `$HOME` staying the same across shells.

a relative path stored directly in `config.json` (e.g. by hand-editing it) is rejected on read.
:::

## canonical source resolution

hephaestus resolves the canonical source in this order:

1. `HEPHAESTUS_CANON_DIR` environment variable.
2. global user config at `~/.config/hephaestus/config.json`, written by `hephaestus bind`.

if neither resolves, every command fails and asks you to run `hephaestus bind` or set the env var.

::: info why this matters in ci
ci runners have no interactive terminal and no persisted `~/.config` from a previous `bind`. the env var is the only path that works there.

see [using hephaestus in ci](/guide/ci) for the full recommended workflow.
:::

both resolution paths run the same `agents/`/`skills/` subdirectory check `bind` does. the directory must exist and contain both `agents/` and `skills/`.

## agent output directory

each project sets its own provisioned agent output directory at `forge` time, which defaults to `.hephaestus/`.

this is where agents write handoffs, research notes, decisions, or anything else, resolved via the <code v-pre>{{output}}</code> template token at render time.

hephaestus has no opinion on what goes there or in what format.

see [tokens](/guide/concepts#tokens) for how the token itself resolves.
