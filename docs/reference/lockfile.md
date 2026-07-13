# lockfile

## what is it?

`hephaestus.lock.yaml` is written into the project on every `forge` and updated on every `temper`.

it records, per provisioned file, the content hash hephaestus wrote last. this is the source of truth `temper` uses to tell when your provisioned files differ from the canonical source.

## the three-way decision

`temper` re-renders the canonical source, hashes what's currently on disk, and compares both against the hash recorded in the lock.

### file doesn't exist

if the provisioned file **doesn't exist on disk yet**, just `create` it, no further comparison needed.

### file does exist

if the provisioned file **does exist on disk**, two key questions decide the outcome:

- **did you change the disk file** since the last `temper`?
- **did you change the canonical source file** since the last `temper`?

| disk changed? | canon changed? | outcome                                      |
| ------------- | -------------- | -------------------------------------------- |
| no            | no             | `skip` - nothing to do                       |
| no            | yes            | `update` — your copy refreshes automatically |
| yes           | no             | `keep` — your edit sticks, untouched         |
| yes           | yes            | `drift` — both moved, you pick a strategy    |

::: details one other case
a file exists on disk but hephaestus never tracked it (you added it by hand, or it predates the lockfile).

there's no "did you change it?" to ask yet, so it's compared straight against the canon instead:

matches → `skip`, differs → `drift`.
:::

## resolving drift

there are 3 different strategies to handle drift:

- **`overwrite`**: take the source version. the lock advances to the newly-rendered hash.
- **`cancel`**: keep your version on disk exactly as it is; the file stays flagged as drifted and the lock is **not** advanced, so the next `temper` will surface it again until you resolve it.
- **`merge`**: write git-style conflict markers into the file for manual resolution; the lock is not advanced until you resolve the markers and run `temper` again.

```
<<<<<<< project
...your on-disk content...
=======
...freshly-rendered source content...
>>>>>>> source
```

::: warning `merge` is text-only
binary bundled skill resources (anything under a skill directory that isn't markdown) can't carry conflict markers. `temper --strategy merge` throws if either side of a drifted binary file isn't text. choose `overwrite` or `cancel` for those instead.
:::

see [`temper`](/reference/commands#temper) for the `--strategy` flag that drives this non-interactively.

## lockfile versioning

the lockfile has its own schema version (`LOCKFILE_VERSION`), independent of the CLI's own version, so old lockfiles keep working across upgrades.

### older version?

automatically migrated forward and **written back to disk** as part of any command that reads the lockfile (`forge`, `temper`, `inventory`, `quench`), including the fully read-only `inventory` command.

before writing, the raw pre-migration lockfile is backed up to `hephaestus.lock.yaml.bak`. only the most recent migration is kept, each new migration overwrites the previous backup. you'll see a "migrating lockfile" note naming the backup, followed by a "migration complete" note once the write-back finishes.

::: warning breaking rules
this is a deliberate exception to inventory's "read-only" contract, but needed so that hephaestus can continue to run its subsequent commands correctly.
:::

### newer version?

hard failure, hephaestus refuses to guess at an unknown format.

the error tells you which hephaestus version wrote it, and upgrading the CLI (or deleting the lockfile) are the only ways past it.

::: danger never hand-edit a newer lockfile back to an older version
if you hit the "lockfile is newer" error, don't try to manually downgrade the file to make an older CLI accept it. the shape may have changed in ways that silently corrupt the next `temper`.

upgrade the CLI instead.
:::
