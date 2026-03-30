---
name: threejs-webgpu
description: 'Use for Three.js WebGPU and TSL work: imports, API migrations, node typing, NodeMaterial issues, and post-processing changes.'
argument-hint: 'Describe the WebGPU or TSL issue, file, and API mismatch.'
---

# Three.js WebGPU

## Use For

- TypeScript errors in `three/webgpu` or `three/tsl`
- Import mistakes across Three.js WebGPU, TSL, and addons
- NodeMaterial, post-processing, or TSL node API changes

## Check

1. Inspect the exact error and affected file.
2. Verify imports first:
   - functions from `three/tsl`
   - classes and types from `three/webgpu`
   - addons from `three/addons/*`
3. Prefer API migration over type suppression.
4. Fix the smallest correct surface area: imports, node signatures, generics, or helper usage.
5. Re-run `pnpm tsc --noEmit` after the edit.
6. If the GPU path is unclear, stop before adding a CPU fallback.

## Output

- Keep changes minimal and aligned with current official APIs.
- Do not use `any` to bypass missing types.