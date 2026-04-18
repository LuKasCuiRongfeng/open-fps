---
name: threejs-webgpu
description: 'Use for general Web 3D rendering work built on modern Three.js WebGPU, TSL, addons, compute shaders, and performance-first GPU workflows.'
argument-hint: 'Describe the rendering goal, WebGPU or TSL issue, performance bottleneck, affected file, and any API mismatch.'
---

# Web 3D Rendering

## Use For

- Modern Three.js WebGPU rendering architecture
- TSL shader authoring, node graphs, and material logic
- WGSL shaders when TSL is not sufficient for performance or capability
- Compute-shader workflows for simulation, culling, terrain, particles, or other data-parallel systems
- Post-processing, node materials, and GPU-driven rendering pipelines
- Import cleanup, API migration, typing fixes, and removal of deprecated APIs
- Performance tuning where GPU execution should dominate over CPU work

## Check

1. Use current official Three.js APIs only. Prefer the newest standard API surface and remove deprecated usage instead of preserving compatibility paths.
2. Restrict imports to these three directions only:
   - functions, nodes, and shader helpers from `three/tsl`
   - renderers, materials, core classes, and types from `three/webgpu`
   - extensions and helpers from `three/addons/*`
3. Do not import from bare `three`.
4. Renderer choice is fixed: use WebGPU only. Do not add WebGL or CPU fallback renderers.
5. Shader choice is TSL first. If TSL cannot provide the required performance or capability, use native WGSL shaders.
6. Keep GPU as the first execution target for rendering and data-parallel work. If a task can reasonably run on GPU, do not move it to CPU for convenience.
7. Prefer compute shaders for heavy parallel computation such as simulation, reduction, generation, culling, classification, or batch updates.
8. Reduce CPU-side loops, per-object orchestration, and readbacks when the same work can stay GPU-resident.
9. Before inventing custom types, check official Three.js WebGPU or TSL types first. Prefer official exported types over ad hoc local aliases.
10. Prefer API migration, correct node signatures, official helpers, and proper typing over `any`, suppression comments, or manual type bypasses.
11. When changing performance-sensitive code, optimize for real GPU throughput and minimal synchronization, not for temporary simplicity.
12. If the GPU path is unclear, check official docs first and stop before introducing a CPU fallback.

## Output

- Keep changes aligned with current official Three.js WebGPU, TSL, WGSL, and addon APIs.
- Remove deprecated APIs instead of wrapping them.
- Prefer GPU-first, compute-first, performance-maximizing solutions.
- Use official types whenever available.
- Do not use `any`, CPU fallbacks, or bare `three` imports to bypass the correct solution.