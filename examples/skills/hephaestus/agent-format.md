---
description: canonical agent frontmatter schema and required body structure for hephaestus agents.
---

# agent format

apply when authoring or reviewing a canonical agent file (`canon/agents/<id>.md`).

## frontmatter fields

| field | type | required | notes |
|-------|------|----------|-------|
| `id` | slug | yes | lowercase, hyphen-separated. must match the filename (`my-agent` → `my-agent.md`). |
| `name` | string | yes | lowercase display name. |
| `description` | string | yes | 1-2 sentences. pattern: "does x. use when y." used verbatim as the harness agent description. |
| `tier` | enum | yes | `fast` / `balanced` / `flagship`. see tier guidance below. |
| `tools` | list | yes | abstract names: `read`, `write`, `edit`, `search`, `execute`. declare only what the agent genuinely uses. |
| `skills` | list | no | skill slugs. each must have a matching directory under `canon/skills/`. |
| `modelOverrides` | map | no | per-harness model string override. keys: `claude`, `copilot`, `codex`. |

## tier guidance

- `fast` — short-lived read or search tasks, no file writing. maps to the cheapest model.
- `balanced` — general implementation, authoring, and review work. maps to the mid-tier model.
- `flagship` — complex planning and architecture decisions. maps to the most capable model.

## handoff model

handoffs are optional context, not required inputs. every agent writes a dated handoff when it finishes. reading prior handoffs is prompt-driven — reference them in the prompt when you invoke the agent.

agents never declare what they read. agents generate their own output filename at runtime.

## handoff filename convention

`YYYY-MM-DD-<role>-<description>.md`

- `YYYY-MM-DD` — today's date in ISO 8601 format.
- `<role>` — matches the agent's role (e.g. `plan`, `build`, `review`, `agent`, `skill`).
- `<description>` — 2-4 word lowercase slug describing the specific work done (e.g. `add-auth-middleware`).

examples: `2026-06-29-plan-add-auth-middleware.md`, `2026-06-29-build-fix-token-expiry.md`

## body sections (required order)

every agent body must contain these five sections in this exact order. do not add, rename, or reorder them.

### 1. role

one sentence. who this agent is and its primary responsibility. no more.

### 2. when to use

2-3 sentences. when to invoke this agent. contrast with adjacent agents in the chain so the caller knows which agent to pick.

### 3. steps

numbered list. each step is one atomic action, independently verifiable. the final step always writes the handoff to `{{handoff.dir}}/YYYY-MM-DD-<role>-<description>.md`.

### 4. boundaries

bullet list of hard constraints — what the agent must not do. 3-6 bullets. imperative, not advisory.

### 5. your skills

always the last section. body is always exactly `{{skills}}` — no other content.

## known template tokens

| token | expands to |
|-------|-----------|
| `{{handoff.dir}}` | the configured handoff directory (e.g. `.hephaestus`). use to construct the handoff filepath. |
| `{{skills}}` | markdown table of links to each referenced skill's content files. |

unknown tokens are rejected at load time.

## description field rules

- start with what the agent does, not what it is: "produces a plan" not "a planner that..."
- end with the trigger condition: "use at the start of a feature or refactor."
- 1-2 sentences only. this text is injected at runtime for the harness to decide when to invoke the agent.
