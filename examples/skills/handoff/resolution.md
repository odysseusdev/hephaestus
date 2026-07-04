---
description: how to locate the directory to write a handoff file into. apply before writing any handoff.
---

# resolving the handoff directory

the directory to write into arrives as a relative path (e.g. `.hephaestus`, `docs/handoffs`) — do not invent, rename, or normalise it.

## locating it

- check for an existing directory at that relative path from the current working directory first.
- if not found, walk upward through parent directories, checking each level for that same relative path, until it is found or the filesystem root is reached.
- use the first existing match. never create a second one alongside it.
- never assume the current working directory is the project root — that is why the walk is necessary.

## when nothing is found

- do not blindly create the directory.
- stop, report to the caller that the directory could not be located, and state where you propose creating it.
- only create it after the caller confirms, or when the prompt explicitly authorises creating it without confirmation.
