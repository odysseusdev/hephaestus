# using hephaestus in ci

forging a tool takes a hand at the anvil, that part stays human. but once it's made, keeping the edge sharp is work ci can do on its own.

## 1. forge once, locally

[`forge`](/reference/commands#forge) has no non-interactive mode.

agent, harness, and output selection are all interactive prompts with no flag equivalent, and it refuses to run at all without a TTY.

run it once, locally, choosing your agents and harnesses, and commit the provisioned files it writes, along with `hephaestus.lock.yaml` to your repo.

## 2. point ci at your canonical source with an env var

ci runners have no persisted `~/.config` and no terminal to prompt in, so `hephaestus bind` isn't an option.

set `HEPHAESTUS_CANON_DIR` instead. it takes precedence over any saved global config and needs no interactive step:

```bash
export HEPHAESTUS_CANON_DIR=/path/to/canon
```

see [canonical source resolution](/reference/configuration#canonical-source-resolution) for the full resolution order.

## 3. gate on drift, or reconcile automatically

with the project already forged and the environment variable set, two commands work fully headlessly.

### `inventory`, as a drift gate

```bash
hephaestus inventory
```

read-only, never writes anything, and exits non-zero if the project has drifted from canonical (a file changed upstream, on disk, or both).

good for a ci job that should fail the build and let a human sort it out, rather than silently changing anything.

### `temper --strategy`, to reconcile automatically

```bash
hephaestus temper --strategy overwrite
```

writes the resolution instead of just reporting it.

`overwrite` takes the canonical version whenever both sides changed, `cancel` keeps the project's version and leaves it flagged, and `merge` writes conflict markers for a human to resolve later.

see [`temper`](/reference/commands#temper) for the full flag reference.

::: warning word of warning
be careful with `overwrite` in an automated pipeline, it will discard local edits to provisioned files without asking.

`inventory` as a gate is the safer default, but use `temper --strategy` when you specifically want ci to keep a project in sync on its own.
:::

## worked example

```yaml
name: check agent drift
on: [pull_request]
jobs:
  drift-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g @odysseusdev/hephaestus
      - run: hephaestus inventory
        env:
          HEPHAESTUS_CANON_DIR: ${{ github.workspace }}/canon
```

## what's not covered

[`quench`](/reference/commands#quench) isn't part of a normal ci flow, it's destructive and there's no undo.

::: details still want to use it?
if you do need to tear a provisioned project down unattended, `--force` skips both of its confirmations.
:::
