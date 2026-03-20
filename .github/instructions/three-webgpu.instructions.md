---
description: "Use when editing Three.js WebGPU, TSL, NodeMaterial, post-processing, sky, terrain rendering, editor rendering, GPU buffers, or compute pipelines. Covers imports, typing, official API usage, and fallback rules."
name: "Three.js WebGPU And TSL"
applyTo: "src/game/world/**/*.ts, src/game/editor/**/*.ts, src/game/core/gpu/**/*.ts, src/game/core/rendering/**/*.ts, src/game/prefabs/**/*.ts"
---
# Three.js WebGPU And TSL

- Import TSL functions such as `Fn`, `float`, `vec3`, `uniform`, `If`, and math helpers from `three/tsl`.
- Import classes and types such as `Node`, `UniformNode`, materials, render targets, and passes from `three/webgpu`.
- Import loaders, helpers, and post-processing utilities from `three/addons/*`.
- Never import from bare `three`.
- Use documented, current APIs only. Do not reach into undocumented properties with `any` casts.
- Prefer fixing root-cause typing and API mismatches over suppressing errors.
- If older TSL chaining syntax conflicts with current typings, update code to the official current API instead of forcing types.
- Do not add CPU fallbacks for rendering, sky, terrain generation, or other GPU-capable paths without user approval.
- If behavior is unclear, check official Three.js docs and current package declarations before editing.