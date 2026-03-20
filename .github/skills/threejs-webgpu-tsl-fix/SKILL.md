---
name: threejs-webgpu-tsl-fix
description: 'Fix Three.js WebGPU or TSL type errors, import mistakes, API migrations, NodeMaterial issues, UniformNode typing, shader-node chaining, post-processing node errors, and outdated syntax. Use when TypeScript errors appear in three/webgpu or three/tsl code.'
argument-hint: 'Describe the WebGPU or TSL error, file, and current API mismatch.'
---

# Three.js WebGPU And TSL Fix Workflow

## When to Use

- TypeScript errors in `three/webgpu` or `three/tsl` code
- Import-source mistakes between `three`, `three/webgpu`, `three/tsl`, and `three/addons/*`
- TSL node typing issues such as `Node`, `UniformNode`, chained math helpers, or texture store arguments
- Post-processing or NodeMaterial API drift after Three.js upgrades

## Procedure

1. Inspect the failing file and exact error output.
2. Check current official syntax and local package declarations before assuming the code is valid.
3. Verify imports first:
   - TSL functions from `three/tsl`
   - types and classes from `three/webgpu`
   - addons from `three/addons/*`
4. Prefer API migration over type suppression.
5. Fix the smallest correct surface area:
   - imports
   - node construction signatures
   - explicit generic parameters when the official type requires them
   - current helper usage for math or texture operations
6. Re-run `pnpm tsc --noEmit` after the edit.
7. If a GPU path looks blocked, stop and ask before adding any CPU fallback.

## Output Standard

- Keep edits minimal and consistent with current official APIs.
- Do not use `any` to bypass missing types.
- Mention any remaining errors that are outside the changed scope.