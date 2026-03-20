---
name: repo-architecture-review
description: 'Review or plan code changes against this repo architecture: ECS boundaries, feature-folder organization, single-responsibility files, config placement, terrain GPU constraints, and frontend-backend separation. Use when adding systems, refactoring modules, or planning larger structural changes.'
argument-hint: 'Describe the feature, folders touched, and architectural concern.'
---

# Repository Architecture Review

## When to Use

- Adding a new gameplay or rendering system
- Refactoring files that have grown too broad
- Moving code across frontend, game, editor, and backend boundaries
- Checking whether config, ECS, terrain, and storage placement are still coherent

## Procedure

1. Identify the feature boundary and target folder.
2. Check whether the file mixes multiple responsibilities.
3. Keep organization by feature or domain rather than by file type.
4. For gameplay logic, prefer ECS-style data and stateless systems.
5. For rendering and terrain, preserve GPU-first and compute-first constraints.
6. For storage and backend work, keep Tauri commands thin and data contracts explicit.
7. Move constants into config files when appropriate.
8. Call out required follow-on splits if a file is still too broad after the immediate change.

## Output Standard

- Prefer the smallest architecture improvement that removes the current design pressure.
- Explain structural tradeoffs briefly and concretely.