<div align="center">

<img src="assets/fire.svg" width="120" alt="hephaestus" />

# hephaestus

![npm](https://img.shields.io/badge/npm-v0.1.0-cb3837?style=flat-square&logo=npm&logoColor=white)
![node](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=nodedotjs&logoColor=white)
[![ci](https://img.shields.io/github/actions/workflow/status/odysseusdev/hephaestus/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/odysseusdev/hephaestus/actions/workflows/ci.yml)
![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![claude code](https://img.shields.io/badge/claude_code-supported-7B5EA7?style=flat-square)

**_forging ai agents fit for the gods._**

define your agents once in plain markdown. hephaestus shapes them for every harness and keeps them tempered.

[what is hephaestus?](#-what-is-hephaestus) | [install](#-install) | [getting started](#-getting-started) | [your canon](#-your-canon) | [commands](#-commands) | [lockfile](#-lockfile) | [contributing](#-contributing)

</div>

## 🔥 what is hephaestus?

hephaestus is a cli that provisions ai agents and skills from a single canonical source, and reconciles projects against it on demand.

you write an agent once, as a markdown file with a bit of frontmatter. hephaestus forges it into whatever coding harness you point it at, then tempers them on demand as the source changes.

- **harness-agnostic** — one canonical source, many targets. select one or more harnesses per project; claude code ships today, copilot and codex are reserved for the fan-out phase.
- **agent-agnostic** — hephaestus doesn't define your agents for you. it defines a directory structure and a handful of frontmatter fields; everything else is yours to write.
- **selective** — a canonical source can hold far more than one project needs. every `forge` lets you pick which agents (and, by extension, which skills) actually get provisioned.

## 📦 install

not yet published to npm. clone and link globally:

```bash
git clone https://github.com/odysseusdev/hephaestus
cd hephaestus
npm install
npm run build
npm link
```

## 🚀 getting started

1. **define a canonical source.** anywhere on disk. the repo ships example agents and skills under [`examples/`](examples/) to get you started: `agent-creator` and `skill-creator` scaffold new canonical files for you, guided by the [hephaestus format skills](#skills) that document the rules.
2. **bind hephaestus to it:**
   ```bash
   hephaestus bind ~/<canon-dir>
   ```
3. **forge a project.** open the project and run:
   ```bash
   hephaestus forge
   ```
   follow the prompts — pick agents, pick harnesses, confirm an output directory — and your selected agents land in all the right places.

see [your canon](#-your-canon) for the directory structure and file formats `bind` expects.

## 📜 your canon

hephaestus reads from a **canonical source** — a folder you own and maintain, pointed to once with `hephaestus bind`.

### structure

```
<canon-dir>/
  agents/        # one .md file per agent
  skills/        # one subdirectory per skill
    my-skill/
      conventions.md
```

### agents

each agent is a single markdown file at `agents/<id>.md`. `id` must be a lowercase, hyphen-separated slug and must match the filename exactly.

**frontmatter:**

```yaml
---
id: agent-creator
name: agent creator
category: meta
summary: creates a new canonical agent file from a description.
description: creates a new canonical agent file from a description. use when a new agent needs to be added to the hephaestus content directory.
tier: balanced
tools: [read, write, search, websearch, webfetch]
skills: [agent-output, hephaestus]
---
```

(taken straight from [`examples/agents/agent-creator.md`](examples/agents/agent-creator.md) — see that file for a full worked body.)

| field            | required | notes                                                                                   |
| ---------------- | -------- | --------------------------------------------------------------------------------------- |
| `id`             | yes      | slug, must match filename                                                               |
| `name`           | yes      | lowercase display name                                                                  |
| `category`       | no       | groups the agent in the forge agent-select prompt; omitted agents fall under `general`  |
| `summary`        | yes      | ≤80 chars, shown as the forge select-list hint — a human scanning a list, not a harness |
| `description`    | yes      | 1-2 sentences, injected verbatim by the harness at runtime. "does x. use when y."       |
| `tier`           | yes      | `fast` / `balanced` / `flagship` — maps to a model per harness                          |
| `tools`          | yes      | abstract set: `read`, `write`, `edit`, `search`, `execute`, `websearch`, `webfetch`     |
| `skills`         | no       | slugs referencing directories under `skills/`                                           |
| `modelOverrides` | no       | per-harness model alias, wins over the tier map                                         |

**model tiers** map to the following defaults:

| tier       | claude code |
| ---------- | ----------- |
| `fast`     | haiku       |
| `balanced` | sonnet      |
| `flagship` | opus        |

copilot and codex tiers are reserved but not yet wired in. use `modelOverrides` to pin a specific model alias for one harness regardless of tier.

**tokens:**

the agent body is plain markdown. hephaestus expands two template tokens at forge time — any other `{{token}}` is left untouched, so agent bodies can safely contain their own placeholder syntax:

| token        | expands to                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `{{output}}` | the project-relative path to the configured output directory. resolved fresh on every `forge`/`temper`. |
| `{{skills}}` | a markdown table linking every skill the agent declares, relative to the agent's location.              |

`{{skills}}` matters more than it looks — it's the only thing that turns a `skills:` frontmatter list into something the agent can actually read at runtime. declare a skill without using this token and the harness never sees it. by convention it sits alone in a closing `## your skills` section.

`{{output}}` points at a provisioned output directory (default `.hephaestus/`, set per project during `forge`) — a place for agents to write things, handoffs, research notes, decisions, whatever. hephaestus has no opinion on what goes there or in what format, and you don't have to use it at all. the example agents under [`examples/`](examples/) write handoff files there by convention; see the `agent-output` skill under `examples/skills/` if you want that format.

### skills

a skill is a directory under `skills/<slug>/` — lowercase, hyphen-separated. inside it, one or more markdown content files carry the actual rules (`conventions.md`, `patterns.md`, whatever split makes sense); non-markdown files are carried through to the harness untouched.

**frontmatter** is passed through unchanged — hephaestus applies no schema to it. by convention, one field:

```yaml
---
description: typescript conventions for this project.
---
```

agents reference skills by directory slug in their own `skills:` frontmatter — never at the individual-file level. hephaestus provisions the union of skills referenced by whichever agents you select at `forge` time; skills aren't picked separately.

## 🔨 commands

### `bind`

_anchor the workshop — bind to a canonical source._

set or update the global canonical source. runs interactively if no path is given. config is saved to `~/.config/hephaestus/config.json`.

```bash
hephaestus bind                   # interactive
hephaestus bind ~/<canon-dir>     # set directly
```

the path must contain both `agents/` and `skills/` subdirectories. set `HEPHAESTUS_CANON_DIR` as an environment variable to override the config file (useful in CI).

### `forge`

_strike the anvil — shape canonical source into provisioned harness files._

interactive provisioning. loads canonical content, then walks you through agent selection, harness selection, and agent output directory. writes provisioned files and a `hephaestus.lock.yaml` lockfile into the project. if no canon directory is configured yet, `forge` runs the bind prompt inline.

```bash
hephaestus forge                 # target the current directory
hephaestus forge --dir ./app     # target a specific directory
hephaestus forge --force         # re-initialise even if a lockfile exists
```

### `inventory`

_survey the work — catalogue what has been provisioned._

read-only status report. shows provisioned agents (tiers, skills), active harnesses, output directory, and any pending drift.

```bash
hephaestus inventory
hephaestus inventory --dir ./app
```

### `temper`

_heat, then cool — rework what was forged._

re-renders from canonical and reconciles with what is on disk, file by file. see [lockfile](#-lockfile) for how it decides what to write, keep, or flag.

```bash
hephaestus temper                          # interactive drift resolution
hephaestus temper --dry-run                # report changes, write nothing
hephaestus temper --strategy overwrite     # take the source version
hephaestus temper --strategy cancel        # keep your version, stay flagged
hephaestus temper --strategy merge         # write git-style conflict markers
hephaestus temper --dir ./app
```

### `quench`

_put out the forge — dissolve the provisioning entirely._

removes every provisioned file tracked by the lockfile, cleans up empty skill directories, and deletes the lockfile. confirms before deleting. also offers to remove the output directory.

```bash
hephaestus quench
hephaestus quench --dir ./app
```

## 🔁 lockfile

`hephaestus.lock.yaml` is written into the project on every `forge` and updated on every `temper`. it records, per provisioned file, the content hash hephaestus wrote last — the source of truth `temper` uses to tell your edits apart from upstream ones.

at a very high level: `temper` re-renders canonical, hashes what's on disk, and compares both against the hash recorded in the lock. if only the source changed, it updates. if only your file changed, it's kept as-is. if both changed since the last lock, that's drift, and you resolve it with a strategy. if a provisioned file vanished, it's recreated.

## 🤝 contributing

see [CONTRIBUTING.md](CONTRIBUTING.md).

## 🤖 ai disclosure

some of this was built with ai help (github copilot, claude), reviewed and tested by a human along the way. if your org needs ai-usage disclosure for dependencies, that's the deal here — ai as a dev aid, not flying solo.

## ⚖️ license

see [LICENSE](LICENSE).
