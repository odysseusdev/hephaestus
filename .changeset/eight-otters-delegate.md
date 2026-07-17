---
"@odysseusdev/hephaestus": minor
---

added the `delegate` abstract tool, letting canonical agents spawn subagents for parallel fan-out work. maps to Claude Code's `Agent` tool (renamed from `Task` in v2.1.63). ships ungated, same as the existing seven abstract tools — no opt-in flag or allowlist mechanism. Copilot's mapping is not yet wired in (`src/harnesses/copilot.ts` doesn't exist on this branch); see the handoff for details.
