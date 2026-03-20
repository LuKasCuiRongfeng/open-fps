---
name: terrain-compute-workflow
description: 'Implement or refactor terrain compute workflows for brush logic, noise generation, chunk streaming, atlas updates, LOD, and GPU texture I/O. Use when working on terrain generation, terrain editing, or terrain performance-sensitive systems.'
argument-hint: 'Describe the terrain subsystem, compute path, and intended change.'
---

# Terrain Compute Workflow

## When to Use

- Terrain brush compute changes
- Terrain noise or height generation changes
- Chunk streaming, atlas, or LOD changes
- GPU texture I/O or terrain data layout updates

## Procedure

1. Confirm the work belongs on GPU and keep the design compute-shader-first.
2. Identify affected boundaries:
   - terrain compute shaders or TSL nodes
   - GPU texture storage and atlas code
   - gameplay-facing CPU cache reads
   - config values in `src/config/terrain.ts`
3. Keep responsibilities separated:
   - generation and brush math
   - chunk or atlas data movement
   - editor interaction
   - gameplay query caches
4. Do not add CPU loops for terrain updates unless the path is strictly a small readback or cache synchronization path already required by architecture.
5. Keep constants configurable and physically plausible.
6. Validate with `pnpm tsc --noEmit` and inspect nearby shared terrain modules for contract breakage.

## Output Standard

- Preserve visual fidelity.
- Preserve chunked streaming and LOD behavior.
- Keep edits modular.