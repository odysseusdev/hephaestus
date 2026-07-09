---
description: how to resolve the agent output directory. apply before writing any handoff, research, decision, or other agent output file.
---

# resolving the output directory

the output directory arrives as a project-relative path (e.g. `.hephaestus`, `docs`) — treat it as opaque, never invent, rename, or normalise it.

## finding-the-project-root

- run `git rev-parse --show-toplevel` to get the project root.
- if that command exits non-zero (not inside a git repo), use the current working directory as the project root instead.

## locating-the-directory

- join the project root with the relative output path — do not resolve it any other way.
- check the filesystem directly (`test -d`, `ls`) for existence — never infer existence from `git status` or `git ls-files`, since the directory may be empty, untracked, or gitignored and so invisible to git.
- if writing into a named subdirectory (e.g. `handoffs/`, `research/`) and it doesn't exist yet, create it directly — no confirmation needed, it's scoped inside the already-resolved output directory.

## when-not-found

- do not blindly create the directory.
- stop and report to the caller that the directory could not be located, stating where you propose creating it.
- only create it after the caller confirms, or when the prompt explicitly authorises creating it without confirmation.
