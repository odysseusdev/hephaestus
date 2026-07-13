---
"@odysseusdev/hephaestus": patch
---

fixed a symlink escape in toProjectPath. a tracked symlink at an intermediate directory like .claude/skills could redirect writes and deletes outside the project root. ancestor directories are now checked and rejected if they escape.
