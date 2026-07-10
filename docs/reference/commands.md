# commands

::: info note about this page
this page is static, not pulled live from the cli. if it drifts from `hephaestus <command> --help`, trust `--help` and file an issue.
:::

## `bind`

<p class="tagline"><em>anchor the workshop - bind to a canonical source.</em></p>

### syntax

```bash
hephaestus bind [path]
```

### description

set or update the global canonical source.

::: info validation
`bind` checks the path exists and contains both `agents/` and `skills/` before writing anything. it fails fast with a clear message rather than saving a broken pointer.
:::

runs interactively if no path is given.

config is saved to `~/.config/hephaestus/config.json`.

::: details usage in ci
set `HEPHAESTUS_CANON_DIR` as an environment variable in your project. it takes precedence over the saved config file and needs no interactive step.

see [configuration](/reference/configuration) for full resolution order.
:::

### flags

> no flags apply to the `bind` command.

### examples

```bash
hephaestus bind                   # interactive
hephaestus bind ~/<canon-dir>     # set directly
```

## `forge`

<p class="tagline"><em>strike the anvil - shape the source into provisioned files.</em></p>

### syntax

```bash
hephaestus forge [options]
```

### description

interactive provisioning. loads canonical content, then walks you through agent selection, harness selection, and agent output directory.

writes provisioned files and a `hephaestus.lock.yaml` lockfile into the project.

::: tip forgot to `bind` beforehand?
if no canon directory is configured yet, `forge` runs the `bind` prompt inline.
:::

::: warning no non-interactive mode
`forge` has no flag-driven equivalent of its prompts — it always asks for agent selection, harness selection, and the output directory. it refuses to run at all when stdin isn't a TTY (e.g. in CI). if the project is already provisioned, use `hephaestus temper --strategy <overwrite|cancel|merge>` instead, which is fully non-interactive.
:::

### flags

| flag              | default | description                                     |
| ----------------- | ------- | ----------------------------------------------- |
| `-d, --dir <dir>` | `.`     | target project directory                        |
| `-f, --force`     | `false` | re-initialise even if a lockfile already exists |

::: info `--force` re-runs the whole setup flow
it's not just "overwrite files". agent selection, harness selection, and the output directory prompt all run again, exactly like a first `forge`.

use it when you want to change which agents or harnesses a project has, not just to fix a stuck lockfile.
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

shows provisioned agents (tiers, skills), active harnesses, output directory, and any pending drift.

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

### flags

| flag                    | default | description                                                    |
| ----------------------- | ------- | -------------------------------------------------------------- |
| `-d, --dir <dir>`       | `.`     | target project directory                                       |
| `--dry-run`             | `false` | compute and report changes without writing                     |
| `--strategy <strategy>` | -       | non-interactive drift strategy: `overwrite \| cancel \| merge` |

::: warning breaking rules
if hephaestus identifies a lockfile with an older version to what it expects, it will perform a migration.

this is a deliberate exception to "dry-run writes nothing" rule, but needed so that hephaestus can continue to run its subsequent commands correctly.

see [lockfile](/reference/lockfile) for how it handles lockfile version mismatches.
:::

### examples

```bash
hephaestus temper                          # interactive drift resolution
hephaestus temper --dry-run                # report changes, write nothing
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
quench deletes every file it provisioned plus the lockfile itself. there's no undo beyond `forge`-ing again from the canonical source (which won't recover any edits you made to the provisioned files).

it lists every path it's about to remove and asks for confirmation first; read that list before confirming.
:::

### flags

| flag              | default | description              |
| ----------------- | ------- | ------------------------ |
| `-d, --dir <dir>` | `.`     | target project directory |

### examples

```bash
hephaestus quench
hephaestus quench --dir ./app
```
