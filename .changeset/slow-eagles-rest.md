---
"@odysseusdev/hephaestus": minor
---

added GitHub Copilot harness support. agents render to `.github/agents/<id>.agent.md` with the portable frontmatter intersection shared across VS Code, Copilot CLI, and the Copilot cloud agent, and skills render to `.github/skills/<name>/`.

note: unlike claude, copilot has no canonical model slug format — its tier-to-model defaults are display-string picks against a roster that rotates roughly monthly, not guaranteed-stable identifiers. use `modelOverrides.copilot` if a default goes stale for your setup.
