---
name: repo-architecture
description: 'Use for architecture-level changes in this repo: system boundaries, folder placement, ECS structure, config placement, frontend-backend separation, platform boundaries, and editor-game target separation.'
argument-hint: 'Describe the feature, affected folders or targets, and architecture decision.'
---

# Repo Architecture

## Use For

- Adding or moving gameplay, rendering, editor, or backend code
- Refactoring files that are mixing responsibilities
- Checking whether a change fits existing repo boundaries
- Deciding whether code belongs in shared runtime, editor-only flow, game-only flow, or platform adapters

## Check

1. Keep code organized by feature or domain.
2. Keep files focused on one responsibility.
3. Prefer ECS-style data and stateless systems for gameplay logic.
4. Keep rendering and terrain aligned with GPU-first and compute-first rules.
5. Keep Tauri commands thin and storage contracts explicit.
6. Keep browser and desktop integration behind `src/platform/` instead of importing host APIs across the app.
7. Keep editor workspace, project selection, and save flows in editor-target code, not in the standalone game target.
8. Move shared constants and tunables into config files.

## Output

- Make the smallest structural change that resolves the current boundary problem.
- State any follow-up split only if it is still needed after the change.