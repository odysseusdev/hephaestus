---
description: handoff file format for an agent's output summary. apply when authoring or reviewing a handoff file.
---

# handoff format

## base template

every handoff begins with this structure:

```markdown
# <agent-name> handoff

**status**: complete | blocked | partial
**agent**: <agent-id>
**date**: <ISO 8601 date>

## goal

one or two sentences restating the task as understood by this agent.

## result

what was done. include any deviations from intent and the reason for each.

## files changed

- `path/to/file` — brief description of what changed

## follow-ups

items discovered but deferred. blockers if status is `blocked`.
```

## extending the template

add role-specific sections after `follow-ups` when they add value. these are conventions, not requirements:

| role                                                | suggested section | content                                          |
| --------------------------------------------------- | ----------------- | ------------------------------------------------ |
| planner                                             | `## task list`    | ordered tasks, each naming the files it affects  |
| developer                                           | `## checklist`    | items a reviewer should verify                   |
| reviewer                                            | `## findings`     | categorised findings — see findings format below |
| creator role (agent/skill author, scaffolder, etc.) | `## created`      | file path and full frontmatter written           |

## field rules

- `status` is one of three values: `complete`, `blocked`, `partial`. never omit it.
- `goal` restates the task in the agent's own words — do not copy the original prompt verbatim.
- each entry in `files changed` names the file first (`backtick-wrapped path`), then a short description after the dash.
- `follow-ups` must be present even if empty — write "(none)" rather than omitting it.
- `date` is ISO 8601: `2026-06-29`. no times, no relative dates.
- if the agent could not complete its task (missing permissions, a tool it needed was unavailable, required input was ambiguous or missing), set `status` to `blocked` or `partial` and describe the blocker in `follow-ups` — never write a `complete` handoff for work that did not finish.

## findings format

use in `## findings` when reviewing an implementation:

```
`path/to/file:line` **blocking** — description. fix: what to do.
`path/to/file:line` **should-fix** — description. fix: what to do.
`path/to/file:line` **nitpick** — description.
```

every finding names a file. general observations with no file reference go in `## result`.
