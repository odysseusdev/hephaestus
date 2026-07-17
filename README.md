<div align="center">

<img src="assets/fire.svg" width="120" alt="hephaestus" />

# hephaestus

[![npm](https://img.shields.io/npm/v/%40odysseusdev%2Fhephaestus?style=for-the-badge&labelColor=363a4f&color=f5a97f&logo=npm&logoColor=white)](https://www.npmjs.com/package/@odysseusdev/hephaestus)
![node](https://img.shields.io/badge/node-%3E%3D20-eed49f?style=for-the-badge&labelColor=363a4f&logo=nodedotjs&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-a6da95?style=for-the-badge&labelColor=363a4f)

![claude code](https://img.shields.io/badge/claude_code-supported-c6a0f6?style=for-the-badge&labelColor=363a4f&)
![copilot](https://img.shields.io/badge/copilot-supported-c6a0f6?style=for-the-badge&labelColor=363a4f&)
![codex](https://img.shields.io/badge/codex-coming_soon-6e738d?style=for-the-badge&labelColor=363a4f)

**_forging ai agents fit for the gods._**

write once in markdown. forge for any harness.

[what is hephaestus?](#-what-is-hephaestus) | [install](#-install) | [getting started](#-getting-started) | [your canon](#-your-canon) | [commands](#-commands) | [lockfile](#-lockfile) | [contributing](#-contributing)

[full docs](https://hephaestus.odysseusdev.io)

</div>

## 🔥 what is hephaestus?

hephaestus is a cli that provisions ai agents and skills from a single canonical source, and reconciles projects against it on demand.

you write an agent once, as a markdown file with a bit of frontmatter. hephaestus forges it into whatever coding harness you point it at, then tempers them on demand as the source changes.

- **harness-agnostic** — one canonical source, forged for every harness. pick any combination per project. claude code and copilot ship today, codex is next.
- **unopinionated** — hephaestus forges anything, so long as it takes a shape: a directory structure and a handful of frontmatter fields. everything else is yours to write.
- **provision only what you need** — your canon can hold every agent you've ever written. each forge only provisions the ones you pick, skills included.

## 📦 install

install globally with npm, or your preferred package manager:

```bash
npm install -g @odysseusdev/hephaestus
```

or run it without installing:

```bash
npx @odysseusdev/hephaestus
```

## 🚀 getting started

1. **define a canonical source.** anywhere on disk. the repo ships example agents and skills under [`examples/`](examples/) to get you started.
2. **bind hephaestus to it:**
   ```bash
   hephaestus bind ~/<canon-dir>
   ```
3. **forge a project.** open the project and run:
   ```bash
   hephaestus forge
   ```
   follow the prompts. pick agents, harnesses and an output directory and your selected agents land in all the right places.

see the [getting started guide](https://hephaestus.odysseusdev.io/guide/getting-started) for the full walkthrough.

## 📜 your canon

hephaestus reads from a **canonical source** — a folder you own and maintain, pointed to once with `hephaestus bind`. it holds `agents/`, one markdown file per agent with a bit of frontmatter (id, tier, tools, skills), and `skills/`, one directory per skill that agents opt into by slug.

see [concepts](https://hephaestus.odysseusdev.io/guide/concepts) for how the pieces fit together, and the [canonical source reference](https://hephaestus.odysseusdev.io/reference/canonical-source) for the full frontmatter and template token spec.

## 🔨 commands

| command                | does                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `hephaestus bind`      | anchor the workshop - bind to a canonical source.           |
| `hephaestus forge`     | strike the anvil - shape the source into provisioned files. |
| `hephaestus inventory` | survey the work - catalogue what has been provisioned.      |
| `hephaestus temper`    | heat, then cool - rework what was forged.                   |
| `hephaestus quench`    | put out the forge - dissolve the provisioning entirely.     |

full flags and examples for each: [commands reference](https://hephaestus.odysseusdev.io/reference/commands).

## 🔁 lockfile

`hephaestus.lock.yaml` is written on every `forge` and updated on every `temper`. it tracks a content hash per provisioned file, which `temper` uses to tell your edits apart from upstream changes and resolve accordingly (update, keep, or flag as drift).

full mechanics: [lockfile reference](https://hephaestus.odysseusdev.io/reference/lockfile).

## 🤝 contributing

see [CONTRIBUTING.md](CONTRIBUTING.md).

## 🤖 ai disclosure

hephaestus forges his own armor and tools too.

this repo runs its own bespoke agents and skills for npm package work, the typescript cli, security, and documentation. as a consequence, some of the code in here was written with their help, with a human reviewing along the way where it mattered.

## ⚖️ license

see [LICENSE](LICENSE).
