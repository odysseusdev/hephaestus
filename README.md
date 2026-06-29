<div align="center">

<img src="assets/fire.svg" width="120" alt="hephaestus" />

# hephaestus

![npm](https://img.shields.io/badge/npm-v0.1.0-cb3837?style=flat-square&logo=npm&logoColor=white)
![node](https://img.shields.io/badge/node-%3E%3D18.18-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![claude code](https://img.shields.io/badge/claude_code-supported-7B5EA7?style=flat-square)

**_all the gods relied on hephaestus._**

define your agents once in plain markdown. hephaestus shapes them for every harness and keeps them in sync.

[install](#-install) | [getting started](#-getting-started) | [your canon](#-your-canon) | [cli reference](#-using-the-cli) | [sync / drift](#-sync--drift) | [contributing](CONTRIBUTING.md)

</div>

## 📦 install

not yet published to npm. clone and link globally:

```bash
git clone https://github.com/odysseusdev/hephaestus
cd hephaestus
npm install
npm run build
npm link
```

## 🔥 getting started

the fastest way to build your canon is to use hephaestus's own example agents. bind the included `examples/` directory and forge it into a project:

```bash
hephaestus bind /path/to/this/repo/examples
hephaestus forge --dir /tmp/bootstrap
```

this provisions two meta-agents into your harness:

- **`agent-author`** — writes new canonical agent files in the correct format, complete with frontmatter, recommended body structure, and a handoff step
- **`skill-author`** — writes new canonical skill directories and content files

invoke them to scaffold your own agents and skills, then run `hephaestus forge` in your actual project once your canon is ready.

## 📜 your canon

hephaestus reads from a **canonical source** — a folder you own and maintain. it must contain two subdirectories:

```
<canon-dir>/
  agents/        # one .md file per agent
  skills/        # one subdirectory per skill
    my-skill/
      conventions.md
```

point hephaestus at it once with `hephaestus bind`. from then on every command reads from it.

---

### ✉️ handoffs

a **handoff** is a markdown file an agent writes at the end of its task — recording what was done, decisions made, and context for the next session. files live in the handoff directory configured during `forge` (default `.hephaestus/`) and are referenced in agents via `{{handoff.dir}}`.

convention: `YYYY-MM-DD-<agent>-<short-description>.md`. `agent-author` includes the handoff step automatically.

---

### 🗿 agents

each agent is a single markdown file at `agents/<id>.md`. the `id` must be a lowercase, hyphen-separated slug and must match the filename exactly.

**frontmatter:**

```yaml
---
id: agent-author
name: agent author
description: creates a new canonical agent file from a description. use when a new agent needs to be added to the hephaestus content directory.
tier: balanced
tools: [read, write, search]
skills: [hephaestus]
---
```

| field            | required | notes                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------- |
| `id`             | yes      | slug, must match filename                                                        |
| `name`           | yes      | lowercase display name                                                           |
| `description`    | yes      | 1-2 sentences injected verbatim by the harness at runtime. "does x. use when y." |
| `tier`           | yes      | `fast` / `balanced` / `flagship` — maps to a model per harness                   |
| `tools`          | yes      | abstract set: `read`, `write`, `edit`, `search`, `execute`                       |
| `skills`         | no       | slugs referencing directories under `skills/`                                    |
| `modelOverrides` | no       | per-harness model alias, wins over the tier map                                  |

**model tiers** map to the following defaults:

| tier       | claude code |
| ---------- | ----------- |
| `fast`     | haiku       |
| `balanced` | sonnet      |
| `flagship` | opus        |

use `modelOverrides` in the agent frontmatter to pin a specific model alias for one harness.

**body:**

the agent body is plain markdown. hephaestus expands two template tokens at render time:

| token             | expands to                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `{{handoff.dir}}` | the configured handoff directory (e.g. `.hephaestus`). use to construct handoff file paths.                               |
| `{{skills}}`      | a markdown table of links to each referenced skill's content files, relative to the agent file's location in the harness. |

unknown tokens are rejected at load time. the `{{skills}}` token is required if you declare any `skills` in frontmatter — place it in a `## your skills` section at the end of the body.

**recommended body structure:**

```markdown
## role

one sentence. who this agent is.

## when to use

2-3 sentences. when to invoke it. contrast with adjacent agents.

## steps

numbered list. each step is one atomic action.
last step always writes a handoff to `{{handoff.dir}}/YYYY-MM-DD-<agent>-<description>.md`.

## boundaries

bullet list of hard constraints — what the agent must not do.

## your skills

{{skills}}
```

---

### 🛡️ skills

each skill is a directory under `skills/<slug>/`. the slug is lowercase and hyphen-separated.

- at least one `*.md` content file is required
- non-markdown files are carried through to the harness untouched
- skill frontmatter is passed through unchanged — no engine-level validation is applied. by convention, include only a `description` field:

```yaml
---
description: typescript conventions for this project.
---
```

agents reference skills by their directory slug. hephaestus provisions the union of skills referenced by the selected agents — you do not select skills separately.

## 🔨 using the cli

### `bind`

_anchor the workshop - bind to a canonical source._

set or update the global canonical source. runs interactively if no path is given. config is saved to `~/.config/hephaestus/config.json`.

```bash
hephaestus bind                   # interactive
hephaestus bind ~/my-agents       # set directly
```

the path must contain both `agents/` and `skills/` subdirectories. set `HEPHAESTUS_CANON_DIR` as an environment variable to override the config file (useful in CI).

---

### `forge`

_strike the anvil — shape canonical source into provisioned harness files._

interactive provisioning. loads canonical content, then walks you through agent selection, harness selection, and handoff directory. writes provisioned files and a `hephaestus.lock.yaml` lockfile into the project.

if no canon directory is configured, forge runs the bind prompt inline.

```bash
hephaestus forge                 # target the current directory
hephaestus forge --dir ./app     # target a specific directory
hephaestus forge --force         # re-initialise even if a lockfile exists
```

---

### `inventory`

_survey the workshop — catalogue what has been provisioned._

read-only status report. shows provisioned agents (tiers, skills), active harnesses, handoff directory, and any pending drift.

```bash
hephaestus inventory
hephaestus inventory --dir ./app
```

---

### `temper`

_heat, then cool — rework what was forged._

re-renders from canonical and reconciles with what is on disk. uses a [three-way sync](#-sync--drift) to decide what to write, keep, or flag as drift.

```bash
hephaestus temper                          # interactive drift resolution
hephaestus temper --dry-run                # report changes, write nothing
hephaestus temper --strategy overwrite     # take the source version
hephaestus temper --strategy cancel        # keep your version, stay flagged
hephaestus temper --strategy merge         # write git-style conflict markers
hephaestus temper --dir ./app
```

---

### `quench`

_put out the forge — dissolve the provisioning entirely._

removes all provisioned files tracked by the lockfile, cleans up empty skill directories, and deletes the lockfile. confirms before deleting. also offers to remove the handoff directory.

```bash
hephaestus quench
hephaestus quench --dir ./app
```

## 🔁 sync / drift

`hephaestus.lock.yaml` records each provisioned output and its content hash. on `temper`, three hashes decide each file's fate:

- `lock` — hash recorded in the last lockfile write
- `disk` — hash of what is on disk now (`null` if missing)
- `new` — hash of what re-rendering canonical produces now

| condition                     | decision | action                                      |
| ----------------------------- | -------- | ------------------------------------------- |
| `disk == lock`, `new == lock` | skip     | nothing to do                               |
| `disk == lock`, `new != lock` | update   | write `new`, advance lock                   |
| `disk != lock`, `new == lock` | keep     | upstream unchanged; preserve your edit      |
| `disk != lock`, `new != lock` | drift    | both sides changed; resolve with a strategy |
| `disk` is `null`              | create   | file was deleted; re-provision              |

resolution is per-file — one drifted file never blocks the rest.

## 🏔️ roadmap

- ✅ global config
- ✅ three-way sync engine
- ✅ `bind` / `forge` / `temper` / `inventory` / `quench`
- ✅ claude code harness
- ✅ critical path test coverage
- ⬜ github copilot harness
- ⬜ openai codex harness
- ⬜ full test coverage
- ⬜ npm publish

## 🤝 contributing

see [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ license

see [LICENSE](LICENSE).
