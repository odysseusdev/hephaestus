---
outline: 2
---

# commands

::: info note about this page
this page is static, not pulled live from the cli. if it drifts from `hephaestus <command> --help`, trust `--help` and file an issue.
:::

## `bind`

<p class="tagline"><em>anchor the workshop - bind to a canonical source.</em></p>

### syntax

```bash
hephaestus bind [path] [options]
```

### description

set or update the global canonical source.

::: info validation
`bind` checks the path exists and contains both `agents/` and `skills/` before writing anything.
:::

runs interactively if no path is given.

config is saved to `~/.config/hephaestus/config.json`.

::: details usage in ci
set `HEPHAESTUS_CANON_DIR` instead of running `bind` interactively. see [using hephaestus in ci](/guide/ci) for the full pattern.
:::

### flags

| flag          | default | description                                                  |
| ------------- | ------- | ------------------------------------------------------------ |
| `-f, --force` | `false` | rebind even if a different canonical source is already bound |

::: info already bound to something else?
rebinding to a different canonical source asks for confirmation first (shows current vs. new path), unless `--force` is passed.
:::

### examples

```bash
hephaestus bind                          # interactive
hephaestus bind ~/<canon-dir>            # set directly
hephaestus bind ~/<canon-dir> --force    # skip the rebind confirmation
```

## `forge`

<p class="tagline"><em>strike the anvil - shape the source into provisioned files.</em></p>

### syntax

```bash
hephaestus forge [options]
```

### description

loads canonical content, then walks you through agent selection, harness selection, and the agent output directory.

writes provisioned files and a `hephaestus.lock.yaml` lockfile into the project.

::: warning no non-interactive mode
`forge` has no flag-driven equivalent of its prompts, meaning it always asks for agent, harness, and output selection.

see [using hephaestus in ci](/guide/ci) for the recommended forge-once-then-reconcile pattern.
:::

### flags

| flag              | default | description                                                      |
| ----------------- | ------- | ---------------------------------------------------------------- |
| `-d, --dir <dir>` | `.`     | target project directory                                         |
| `-f, --force`     | `false` | re-initialise even if a lockfile already exists or can't be read |

::: info `--force` re-runs the whole setup flow
it's not just "overwrite files". agent selection, harness selection, and the output directory prompt all run again, exactly like a first `forge`.

use it when you want to change which agents or harnesses a project has, or to recover when the existing lockfile is corrupt or unreadable.
:::

### examples

```bash
hephaestus forge                 # target the current directory
hephaestus forge --dir ./app     # target a specific directory
hephaestus forge --force         # re-initialise even if a lockfile exists
```

## `inventory`

<p class="tagline"><em>survey the work - catalogue what has been provisioned.</em></p>

### syntax

```bash
hephaestus inventory [options]
```

### description

read-only status report.

shows provisioned agents, active harnesses, output directory, and any pending drift.

::: warning read-only, with one exception
if hephaestus identifies a lockfile with an older version than it expects, it migrates the lockfile forward and writes it back to disk, even though `inventory` itself never touches provisioned files.

see [lockfile](/reference/lockfile) for how it handles lockfile version mismatches.
:::

### flags

| flag              | default | description              |
| ----------------- | ------- | ------------------------ |
| `-d, --dir <dir>` | `.`     | target project directory |

### examples

```bash
hephaestus inventory
hephaestus inventory --dir ./app
```

## `temper`

<p class="tagline"><em>heat, then cool - rework what was forged.</em></p>

### syntax

```bash
hephaestus temper [options]
```

### description

re-renders from the canonical source and reconciles with what is on disk, file by file.

see [lockfile](/reference/lockfile) for how it decides what to write, keep, or flag.

::: tip want to preview first?
`temper` always writes. for a read-only report of what it would do, run [`inventory`](#inventory) instead.
:::

### flags

| flag                    | default | description                                                    |
| ----------------------- | ------- | -------------------------------------------------------------- |
| `-d, --dir <dir>`       | `.`     | target project directory                                       |
| `--strategy <strategy>` | -       | non-interactive drift strategy: `overwrite \| cancel \| merge` |

### examples

```bash
hephaestus temper                          # interactive drift resolution
hephaestus temper --strategy overwrite     # take the source version
hephaestus temper --strategy cancel        # keep your version, stay flagged
hephaestus temper --strategy merge         # write git-style conflict markers
hephaestus temper --dir ./app
```

## `quench`

<p class="tagline"><em>put out the forge - dissolve the provisioning entirely.</em></p>

### syntax

```bash
hephaestus quench [options]
```

### description

removes every provisioned file tracked by the lockfile, cleans up empty skill directories, and deletes the lockfile.

also offers to remove the agent output directory.

::: danger irreversible
quench deletes every file it provisioned plus the lockfile itself. there's no undo beyond `forge`-ing again from the canonical source.

it lists every path it's about to remove and asks for confirmation first. read that list before confirming.

`--force` skips both confirmations. so only use `--force` in scripts you trust.
:::

### flags

| flag              | default | description                                                                |
| ----------------- | ------- | -------------------------------------------------------------------------- |
| `-d, --dir <dir>` | `.`     | target project directory                                                   |
| `-f, --force`     | `false` | delete immediately without confirming (output directory is left untouched) |

### examples

```bash
hephaestus quench
hephaestus quench --dir ./app
hephaestus quench --force    # skip confirmation, delete immediately
```
