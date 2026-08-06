# 🔥 changelog

## 0.4.0

### Minor Changes

- 39ae0e9: added GitHub Copilot harness support. agents render to `.github/agents/<id>.agent.md` with the portable frontmatter intersection shared across VS Code, Copilot CLI, and the Copilot cloud agent, and skills render to `.github/skills/<name>/`.

  note: unlike claude, copilot has no canonical model slug format — its tier-to-model defaults are display-string picks against a roster that rotates roughly monthly, not guaranteed-stable identifiers. use `modelOverrides.copilot` if a default goes stale for your setup.

## 0.3.1

### Patch Changes

- 351abb6: documented that an agent with no declared tools inherits full harness access instead of none — the sanctioned way to grant capabilities (like MCP) hephaestus has no abstract tool for. added a stderr note when this fires so it reads as intentional, not an oversight. no schema change.

## 0.3.0

### Minor Changes

- 6f287db: added the `delegate` abstract tool, letting canonical agents spawn subagents for parallel fan-out work. maps to Claude Code's `Agent` tool (renamed from `Task` in v2.1.63). ships ungated, same as the existing seven abstract tools — no opt-in flag or allowlist mechanism. Copilot's mapping is not yet wired in (`src/harnesses/copilot.ts` doesn't exist on this branch); see the handoff for details.

### Patch Changes

- e4e8669: updated package.json homepage to point at the docs site instead of the readme

all notable changes to this project are documented here.

the format is based on [keep a changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.0

### Minor Changes

- 8af9059: hephaestus is now CI friendly. inventory and temper exit non zero on drift for gating, bind and quench gained --force, temper's --dry-run and forge's inline bind were dropped, and lockfile migrations now back up before writing.

### Patch Changes

- 8af9059: fixed a symlink escape in toProjectPath. a tracked symlink at an intermediate directory like .claude/skills could redirect writes and deletes outside the project root. ancestor directories are now checked and rejected if they escape.

## 0.1.1

### Patch Changes

- a2cf63f: reference the published npm package, use real install instructions, npm badge pulls live version from the registry

## 0.1.0

initial release.
