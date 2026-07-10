# configuration

## global config file

`~/.config/hephaestus/config.json` stores the bound canonincal source directory as an absolute path:

```json
{
  "canonDir": "/Users/you/my-canon"
}
```

`hephaestus bind` writes it. delete the file (or re-run `bind`) to change the bound source.

:::info path type
`bind` accepts a `~`-prefixed or relative path and expands/resolves it to absolute before writing, so the config never depends on the working directory or `$HOME` staying the same across shells.

a relative path stored directly in `config.json` (e.g. by hand-editing it) is rejected on read.
:::

## canonical source resolution

hephaestus resolves the canonical source directory in this order:

1. `HEPHAESTUS_CANON_DIR` environment variable.
2. global user config at `~/.config/hephaestus/config.json`, written by `hephaestus bind`.

if neither resolves, commands that can recover (e.g. `forge`) run the bind prompt inline. others fail with a message pointing at `hephaestus bind` or the env var.

::: info why this matters in CI
CI runners have no interactive terminal and no persisted `~/.config` from a previous `bind`. the env var is the only path that works there.

it also lets a CI job point at a different canon (a fork, a PR-preview branch of your canon repo) without touching the shared global config.
:::

both resolution paths only check that the directory itself exists at this point; hephaestus fails with a generic "canonical content directory does not exist" error otherwise.

the full `agents/`/`skills/` subdirectory check (the one that fails fast with "missing `agents/` subdirectory in: `<path>`") only runs when a source is first configured — inside `hephaestus bind` itself, and inline the first time `forge` runs with no source configured yet. once a source is bound, pointing `HEPHAESTUS_CANON_DIR` at a directory that exists but is missing `agents/` or `skills/` won't be caught here; it surfaces later as a less specific "no agents found under `<path>`/agents" error when content is loaded.

## agent output directory

each project sets its own provisioned agent output directory at `forge` time, defaults to `.hephaestus/`.

this is where agents write handoffs, research notes, decisions, or anything else, resolved via the <code v-pre>{{output}}</code> template token at render time. hephaestus has no opinion on what goes there or in what format.

see [concepts → tokens](/guide/concepts#tokens) for how the token itself resolves.

::: details changing the output directory later
the output directory is recorded in `hephaestus.lock.yaml`, not re-prompted on every `forge`/`temper`. pass `--force` to `forge` to re-run the setup flow (including the output directory prompt) against an existing lockfile.
:::
