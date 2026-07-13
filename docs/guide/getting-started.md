# getting started

## what is hephaestus?

hephaestus is a cli that provisions ai agents and skills from a single canonical source, and reconciles projects against it on demand.

you write an agent once, as a markdown file with a bit of frontmatter. hephaestus forges it into whatever coding harness you point it at, then tempers them on demand as the source changes.

## prerequisites

1. **node >= v20**: ESM-only CLI and won't run on older runtimes.
2. **npm**: developed and tested against npm. other package managers likely work.
3. **a disk**: a place to keep your canonical agents and skills. any directory on disk.

## 1. install

install globally with npm, or your preferred package manager:

::: code-group

```bash [npm]
npm install -g @odysseusdev/hephaestus
```

```bash [bun]
bun add -g @odysseusdev/hephaestus
```

```bash [pnpm]
pnpm add -g @odysseusdev/hephaestus
```

```bash [yarn]
yarn global add @odysseusdev/hephaestus
```

:::

or run it without installing:

::: code-group

```bash [npm]
npx @odysseusdev/hephaestus
```

```bash [bun]
bunx @odysseusdev/hephaestus
```

```bash [pnpm]
pnpm dlx @odysseusdev/hephaestus
```

:::

verify it's on your path:

```bash
hephaestus --version
```

## 2. define a source

your canonical source of agents and skills is just a folder with two subdirectories:

```
<canon-dir>/
  agents/
  skills/
```

it can sit anywhere on disk and, outside of a few frontmatter fields, hephaestus doesn't enforce what these files look like.

you could also set up a separate repo to version control these. the point is, it's up to you.

see [canonical source](/reference/canonical-source) for the full directory layout and frontmatter schema hephaestus expects.

:::details examples
the repo ships worked examples under [`examples/`](https://github.com/odysseusdev/hephaestus/tree/main/examples).

`agent-creator` and `skill-creator` are agents whose entire job is to scaffold _new_ canonical agents and skills for you, guided by the hephaestus format skills that document the rules.

cloning `examples/` as a starting point and forging those two agents into a project is the fastest way to get started.
:::

## 3. bind hephaestus to it

```bash
hephaestus bind ~/<canon-dir>
```

this writes the resolved absolute path to `~/.config/hephaestus/config.json`. every subsequent command in any project on this machine reads from that same canonical source unless overridden.

::: info validation
`bind` checks the path exists and contains both `agents/` and `skills/` before writing anything. it fails fast with a clear message rather than saving a broken pointer.
:::

::: details usage in ci
set `HEPHAESTUS_CANON_DIR` instead of running `bind` interactively. see [using hephaestus in ci](/guide/ci) for the full pattern.
:::

## 4. forge into a project

open the project you want to provision agents into and run:

```bash
hephaestus forge
```

this walks you through, in order:

1. **agent selection**: every agent in your canon, grouped by `category` (ungrouped agents fall under `general`).
2. **harness selection**: which coding tool(s) to provision for (see [harnesses](/reference/harnesses)).
3. **output directory**: where provisioned agents write scratch output (handoffs, research, decision) via the <code v-pre>{{output}}</code> token, default `.hephaestus/`.

your selected agents land at the relevant directories your selected harnesses expect, in the format they need.

a `hephaestus.lock.yaml` lockfile records exactly what was written and its content hash.

## next

- [concepts](/guide/concepts): canon model, agents, skills, tiers, template tokens
- [commands](/reference/commands): full flag reference for every command
- [lockfile](/reference/lockfile): exactly how `temper` decides what to write, keep, or flag as drift
- [harnesses](/reference/harnesses): what gets written to disk, per harness
- [using hephaestus in ci](/guide/ci): running hephaestus in an unattended pipeline
