---
name: web3d
description: For Web 3D architecture design, technology selection, implementation, refactoring, debugging, code review, and performance optimization. Unless the task is a special case such as GIS, globe rendering, or surveying, default to Three.js and enforce WebGPU, TSL, GPU-first, and performance-first decisions. Use this skill when the task involves rendering architecture, shaders, materials, animation, interaction, GPU compute, performance tuning, or selecting third-party rendering acceleration libraries.
argument-hint: "[scene goal] [performance target] [constraints]"
---

# web3d

Use this skill for general-purpose Web 3D work. This is the default skill for most 3D scenes in the browser.

## What This Skill Helps With

- Rendering architecture and technology selection for Web 3D projects.
- Three.js scene design, renderer setup, resource flow, and rendering pipeline design.
- Shader, material, post-processing, particle, animation, and interaction implementation.
- Refactoring, debugging, reviewing, and optimizing existing Web 3D code.
- GPU compute strategy, acceleration structures, and advanced rendering technique selection.
- Third-party library selection when the goal is higher performance or less boilerplate.

## When To Use This Skill

- The task is a normal browser 3D scene rather than a GIS or globe platform.
- The user asks for scene implementation, renderer setup, material design, shader authoring, animation, post-processing, or interaction logic.
- The user asks for WebGPU migration, Three.js architecture, performance tuning, bottleneck analysis, or rendering-path redesign.
- The user asks which rendering technique or library should be chosen for a Web 3D problem.

## When Not To Use This Skill

- The task is primarily GIS, globe rendering, map projection, terrain, or surveying. In those cases, evaluate Cesium or other dedicated engines first.
- The task is not really 3D rendering, such as pure 2D canvas, DOM-only animation, or generic frontend UI work.

## Default Technical Baseline

- Except for special cases such as GIS, globe, and surveying, default to Three.js.
- The renderer must be WebGPU.
- Materials must use Node Materials.
- Shaders must default to TSL.
- If TSL cannot reach the required performance, use native WGSL.
- GPU is the first priority. If work can run on the GPU, do not move it back to the CPU.
- If compute shader can accelerate the workload, prefer compute shader.

## Required Three.js Rules

- Import only from `three/webgpu`, `three/tsl`, and `three/addons/...`.
- Never import from bare `three`.
- Use Node Materials for material authoring. Do not default to legacy non-node material workflows.
- Use current standard APIs.
- Do not use deprecated APIs, legacy example patterns, or compatibility-era code style.
- Prefer official Three.js types whenever available. Do not casually invent replacement types for existing official ones.

## Core Decision Rules

- Prefer the highest-performance architecture that is still maintainable.
- Do not keep GPU-eligible work on the CPU just because it is easier to write.
- Prefer lower main-thread cost, fewer draw calls, fewer state changes, less synchronization, and less garbage pressure.
- Prefer instancing, batching, GPU-driven animation, GPU particles, GPU visibility work, indirect workflows, spatial acceleration structures, and advanced modern rendering paths when they provide measurable gains.
- If a more advanced technique can deliver meaningfully better real-world performance, prefer it over conservative implementations.

## Shader And Compute Strategy

- Start with Node Materials plus TSL for material logic, procedural effects, and render-path customization.
- If profiling shows that TSL output is the bottleneck and WGSL can materially improve performance, switch the hotspot to WGSL.
- For large particle systems, procedural animation, crowd logic, simulation, precomputation, and spatial queries, evaluate compute shader first.
- Move animation, deformation, blending preparation, visibility classification, sampling preparation, and repeated per-element math to the GPU whenever practical.

## Third-Party Library Strategy

- Use third-party libraries aggressively when they improve performance or remove substantial boilerplate.
- Prefer well-maintained libraries with a clear benefit and active usage.
- For mesh raycasting, picking, spatial queries, and acceleration structures, prefer `three-mesh-bvh` when appropriate.
- Do not add libraries that increase abstraction without a clear rendering or productivity win.

## Execution Workflow

When using this skill, follow this sequence:

1. Classify the scene type. Decide whether it is a normal Web 3D scene or a special engine case such as GIS.
2. Choose the rendering baseline. For normal scenes, default to Three.js plus WebGPU.
3. Define the GPU/CPU boundary. Explicitly state what must stay on the GPU and what remains CPU-side only for orchestration.
4. Choose shader strategy. Prefer TSL first, then WGSL only for proven hotspots.
5. Choose acceleration strategy. Evaluate instancing, batching, BVH, compute shader, culling, and other advanced techniques.
6. Choose supporting libraries. Add high-value libraries when they improve performance or reduce low-value boilerplate.
7. Produce the implementation or review. The final answer should reflect the performance-first constraints above.

## Output Requirements

When you generate an answer, code change, design proposal, or review, include the following whenever relevant:

- The recommended engine and rendering path.
- The GPU versus CPU responsibility split.
- Whether Node Materials are used for material authoring.
- Whether TSL, WGSL, compute shader, instancing, BVH, or other advanced techniques should be used.
- Why the chosen path is faster or more scalable.
- Which imports and APIs are acceptable.
- Which third-party libraries are justified and why.
- If multiple options exist, rank them by expected real-world performance.

## Review Checklist

- Is this actually a normal Web 3D task rather than a special GIS-style task?
- Does the solution default to Three.js for normal scenes?
- Is the renderer WebGPU?
- Are materials implemented with Node Materials?
- Are imports restricted to `three/webgpu`, `three/tsl`, and `three/addons/...`?
- Is TSL used by default, and is WGSL only used for justified hotspots?
- Is GPU-first respected throughout the design?
- Was compute shader evaluated for heavy repeated computation?
- Are deprecated APIs avoided?
- Were official types reused where possible?
- Should `three-mesh-bvh` or another mature performance-oriented library be used?

## Example Inputs

- `Build a high-performance ocean particle scene with 100k particles and keep it stable on mobile devices.`
- `Migrate an existing Three.js scene to WebGPU and explain which animation logic should move to the GPU.`
- `Design the material and post-processing strategy for a product showcase scene with high image quality and low main-thread cost.`
- `Review this Web 3D code and focus on CPU-heavy logic, invalid import paths, deprecated APIs, and incorrect rendering architecture.`

## Expected Behavior

- Default to a Three.js plus WebGPU solution for standard browser 3D scenes.
- Use Node Materials as the default material system.
- Push heavy repeated work to GPU implementations whenever feasible.
- Prefer TSL-first shader authoring, with WGSL reserved for hotspot optimization.
- Recommend advanced rendering techniques and high-value ecosystem libraries when they improve real performance.
- Reject bare `three` imports, deprecated APIs, and CPU-first rendering designs unless the user explicitly requests an exception.