# 🔥 changelog

## 0.2.0

### Minor Changes

- 8af9059: hephaestus is now CI friendly. inventory and temper exit non zero on drift for gating, bind and quench gained --force, temper's --dry-run and forge's inline bind were dropped, and lockfile migrations now back up before writing.

### Patch Changes

- 8af9059: fixed a symlink escape in toProjectPath. a tracked symlink at an intermediate directory like .claude/skills could redirect writes and deletes outside the project root. ancestor directories are now checked and rejected if they escape.

## 0.1.1

### Patch Changes

- a2cf63f: reference the published npm package, use real install instructions, npm badge pulls live version from the registry

all notable changes to this project are documented here.

the format is based on [keep a changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [unreleased]

- docs: add vitepress docs site, published via GitHub Pages.
- docs: readme and getting-started guide now reflect the package being live on npm (was previously "not yet published" / clone-and-link instructions).
- readme: npm version badge now pulls live from the registry instead of a hardcoded static badge.

## [0.1.0]

initial release.
