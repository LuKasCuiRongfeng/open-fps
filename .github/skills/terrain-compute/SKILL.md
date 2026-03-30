---
name: terrain-compute
description: 'Use for terrain GPU workflows: brush compute, generation, chunk streaming, atlas updates, LOD, and terrain texture I/O.'
argument-hint: 'Describe the terrain subsystem, GPU path, and intended change.'
---

# Terrain Compute

## Use For

- Terrain brush or generation changes
- Chunk streaming, atlas, or LOD changes
- Terrain GPU texture layout or I/O changes

## Check

1. Keep terrain work on GPU and prefer compute shaders.
2. Separate generation, data movement, editor interaction, and gameplay query caches.
3. Do not add CPU loops for terrain updates unless the path is an existing small readback or cache sync path.
4. Put terrain tunables in `src/config/terrain.ts`.
5. Validate with `pnpm tsc --noEmit` and inspect nearby shared terrain modules when contracts change.

## Output

- Preserve visual quality, chunk streaming, and LOD behavior.
- Keep terrain edits modular and boundary-aware.