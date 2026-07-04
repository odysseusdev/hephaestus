---
description: canonical agent frontmatter schema and required body structure for hephaestus agents.
---

# agent format

apply when authoring or reviewing a canonical agent file (`<content-dir>/agents/<id>.md`).

## frontmatter fields

| field | type | required | notes |
|-------|------|----------|-------|
| `id` | slug | yes | lowercase, hyphen-separated. must match the filename (`my-agent` → `my-agent.md`). |
| `name` | string | yes | lowercase display name. |
| `category` | slug | no | groups the agent in the forge agent-select prompt. same slug format as `id`. omit only for the CLI's default `"general"` bucket (sorts last). |
| `summary` | string | yes | ≤80 characters. display-only hint for the `hephaestus forge` select prompt. always write it even if `description` would fit — different reader, never derive one from the other. no "use when..." clause; that belongs in `description`. |
| `description` | string | yes | 1-2 sentences, pattern "does x. use when y." injected verbatim as the harness agent description — this is what the harness reads to decide when to invoke the agent. |
| `tier` | enum | yes | `fast` / `balanced` / `flagship`. see tier guidance below. |
| `tools` | list | yes | abstract names: `read`, `write`, `edit`, `search`, `execute`, `websearch`, `webfetch`. grant only what the steps actually use. |
| `skills` | list | no | skill slugs. each must have a matching directory under `<content-dir>/skills/`. |
| `modelOverrides` | map | no | per-harness model string override. keys: `claude`, `copilot`, `codex`. |

## tier guidance

- `fast` — short-lived read or search tasks, no file writing. cheapest model.
- `balanced` — general implementation, authoring, and review work. mid-tier model.
- `flagship` — complex planning and architecture decisions. most capable model.

## tool selection heuristics

grant an abstract tool only when a step genuinely requires it:

- `read` — inspects existing files before acting.
- `write` — produces new files.
- `edit` — modifies existing files in place.
- `search` — locates code or content by pattern/keyword across the repo.
- `execute` — runs shell commands (tests, builds, git, package managers).
- `websearch` — must verify facts that could be stale by tomorrow: current package versions, current best practices, current API docs.
- `webfetch` — given a specific known url and needs to read that exact page, no open-ended search.

## body sections (required order)

every agent body must contain these five sections, in this exact order — do not add, rename, or reorder:

1. **role** — one sentence: who this agent is, its primary responsibility.
2. **when to use** — 2-3 sentences. contrasts with adjacent agents so the caller knows which one to pick.
3. **steps** — numbered list, max 12. each step is one atomic, independently verifiable action. include an explicit step for reporting blockers (missing permissions, an unavailable tool, ambiguous input) back to the caller rather than proceeding or failing silently. the final step always writes the handoff — see the `handoff` skill for the format and where to write it.
4. **boundaries** — 3-6 bullets. hard constraints, imperative, not advisory.
5. **your skills** — always last. body is exactly `{{skills}}`, nothing else.

## known template tokens

| token | expands to |
|-------|-----------|
| `{{handoff.dir}}` | the configured handoff directory, rendered as a project-relative path. resolve it against the actual project root at runtime — see the `handoff` skill's resolution rules. |
| `{{skills}}` | markdown table of links to each referenced skill's content files. |

unknown tokens are rejected at load time.

## handoff filename convention

`YYYY-MM-DD-<role>-<description>.md`, e.g. `2026-06-29-build-fix-token-expiry.md`.

- `YYYY-MM-DD` — today's date, ISO 8601.
- `<role>` — matches the agent's role (`plan`, `build`, `review`, `agent`, `skill`, ...).
- `<description>` — 2-4 word lowercase slug for the specific work done.

reading prior handoffs is optional and prompt-driven, not a declared input — agents don't declare what they read.
