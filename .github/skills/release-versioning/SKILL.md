---
name: release-versioning
description: 'Use for release tags, version sync from tags, CI versus release behavior, Tauri target packaging, and release workflow questions.'
argument-hint: 'Describe the release step, tag or version issue, and whether the change affects CI, packaging, or metadata.'
---

# Release Versioning

## Use For

- Release tag workflow questions
- Version synchronization from git tags
- CI versus release troubleshooting
- Tauri editor or game packaging flow changes

## Check

1. Treat the pushed git tag as the release version source of truth.
2. Separate normal CI behavior from tagged release behavior.
3. Keep editor and game packaging flows explicit when changing scripts or release automation.
4. Update documentation when release steps, version sources, or packaging outputs change.
5. Avoid manual version drift between git tags, package metadata, and packaged app metadata.

## Output

- Keep release behavior predictable and tag-driven.
- Preserve a clear separation between validation builds and published release builds.
