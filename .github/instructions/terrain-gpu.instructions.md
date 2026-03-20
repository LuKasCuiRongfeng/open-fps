---
description: "Use when editing terrain generation, terrain materials, terrain brush compute, chunk streaming, height data, LOD, or editor terrain tools. Covers compute-shader-first rules, terrain architecture, and config placement."
name: "Terrain GPU Workflow"
applyTo: "src/game/world/terrain/**/*.ts, src/game/editor/terrain/**/*.ts, src/config/terrain.ts"
---
# Terrain GPU Workflow

- Terrain data-parallel work must remain compute-shader-first.
- Keep height, normal, brush, and atlas work on GPU unless a CPU cache is explicitly needed for gameplay queries.
- Do not introduce per-vertex or per-instance CPU loops for terrain updates.
- Preserve chunked streaming and LOD architecture.
- Keep tuning values in `src/config/terrain.ts` or other config files instead of hardcoding them.
- Prefer small, focused modules over large mixed terrain files.
- Validate terrain changes with type-checking and review related GPU utility code when shared structures change.