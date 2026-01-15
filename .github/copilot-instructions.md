# Copilot instructions (open-fps)

## Repo shape (frontend vs backend)
- Frontend lives in [src/](../src) (Vite + React + TypeScript + Tailwind).
- Tauri/Rust backend lives in [src-tauri/](../src-tauri). The binary entrypoint is [src-tauri/src/main.rs](../src-tauri/src/main.rs) which calls `open_fps_lib::run()` from [src-tauri/src/lib.rs](../src-tauri/src/lib.rs).
- Don’t edit build outputs like `dist/` or [src-tauri/target/](../src-tauri/target).

## Core tech constraints (from README + current config)
- Rendering is Three.js **WebGPU-only**. Prefer importing WebGPU/TSL types via the TS path mappings in [tsconfig.json](../tsconfig.json):
  - Use `three/webgpu` for WebGPU renderer APIs.
  - Use `three/tsl` for TSL shader authoring.
- **Three.js import rules (important for AI)**:
  - TSL shader functions (`float`, `vec2`, `vec3`, `vec4`, `texture`, `uv`, `uniform`, `attribute`, `varying`, `mix`, `smoothstep`, `step`, `clamp`, `sin`, `cos`, `pow`, `normalize`, `dot`, `cross`, `reflect`, `length`, `distance`, `Fn`, `If`, etc.) → import from `three/tsl`
  - All classes (`WebGPURenderer`, `Scene`, `PerspectiveCamera`, `Mesh`, `BufferGeometry`, `NodeMaterial`, `MeshStandardNodeMaterial`, `Vector3`, `Matrix4`, `Color`, `Texture`, `Clock`, etc.) and TypeScript types → import from `three/webgpu`
  - TSL node types (return types of TSL functions) such as `Node`, `ShaderNodeObject`, `UniformNode`, `MathNode`, `FunctionNode`, `VarNode`, `AttributeNode`, etc. → also import from `three/webgpu` (do NOT define custom types for these)
  - Never import from bare `three` — always use the specific subpath.
- Materials should be **NodeMaterial/TSL-based** (no WebGL compatibility paths).
- **GPU-first is mandatory**: aggressively prefer GPU acceleration. If a GPU approach can improve results/perf, don’t implement a CPU alternative; optimization must not reduce visual quality.
- **Compute-shader first (maximize compute)**: when work is data-parallel (terrain, culling, LOD selection, animation skinning, particle simulation, visibility lists, indirect draws), implement it as a **compute shader / compute-node pipeline** rather than CPU loops.
  - Prefer compute for anything that scales with vertex/instance count or world size.
  - CPU is acceptable only for tiny bootstrapping, UI, and glue; avoid CPU per-vertex/per-instance work.
  - Keep a CPU fallback only if required for gameplay determinism/queries (e.g., a lightweight `heightAt(x,z)` sampler), but still render/simulate on GPU.
  - Treat compute outputs as resources: storage buffers/textures feeding render materials/passes.
  - Keep compute parameters config-driven (use `src/config/`), not hardcoded.
- Only **code comments** need bilingual (中文/English) text; identifiers/UI/README and other text do not.

## Design principles (day 1)
- Design gameplay/engine systems using industry best practices from day 1 (e.g., ECS, flow-field pathfinding, data-oriented pipelines) — do not wait until the project is “almost done” to ask whether we should refactor to a better approach.
  - 一开始就按业界最推崇/最佳实践的方式设计（例如 ECS、flow-field 寻路、数据导向管线等），不要等项目差不多了才来问是否要用更好的方式重构。

## Compute shader patterns (WebGPU/Three.js)
- Prefer using Three.js WebGPU + TSL compute facilities (compute nodes, storage buffers/textures) instead of ad-hoc CPU generation.
- Aim for these GPU workflows as the default:
  - Terrain: compute height/normal/biome masks into storage textures; render via vertex displacement or sampled height/normal maps.
  - World rendering: GPU frustum/occlusion culling → compact visible instance list → indirect drawing.
  - Simulation: particles/foliage wind/ambient effects in compute; avoid CPU stepping of large sets.
- Avoid readbacks each frame (GPU→CPU sync). If gameplay needs queries, keep a small CPU-side proxy (height sampler, broadphase grid) and accept approximate results.

## Dev workflows (known-good commands)
- Install deps: `pnpm install` (repo uses `pnpm-lock.yaml`).
- Frontend dev server: `pnpm dev` (Vite).
- Full Tauri dev: `pnpm tauri dev`.
- Production build: `pnpm build` then `pnpm tauri build`.

## Local dev ports / Vite+Tauri wiring
- Vite is configured for Tauri with a fixed port in [vite.config.ts](../vite.config.ts):
  - `http://localhost:1420` (strict port; Tauri expects this).
  - HMR uses port `1421` when `TAURI_DEV_HOST` is set.
  - Vite file watching ignores `**/src-tauri/**`.
- Tauri config [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) runs `pnpm dev` before `tauri dev` and uses `../dist` as `frontendDist`.

## TypeScript conventions enforced by config
- TS runs in strict mode with `noUnusedLocals`/`noUnusedParameters` (see [tsconfig.json](../tsconfig.json)). Keep exports/imports clean.
- Module resolution is `bundler`; prefer ESM imports.

## Configuration (no hardcoded data)
- Requirement: don’t hardcode data/tuning/constants in code; put them in a config file/module and load them from there (中文/English: 不要在代码里硬编码数据/常量，必须放到配置里).
- `src/config/` is for **gameplay/system data** (tuning, rules, world params), not UI text.
- If no config location exists yet for a gameplay/system feature, create one under `src/config/` (frontend) or `src-tauri/resources/` (static assets) and keep runtime code reading from it.
- Default values in config must be **real-world plausible** and use **clear SI units** (e.g. meters/seconds). Don’t start from “gamey” numbers and rely on sliders later; set a realistic baseline (e.g. gravity defaults to ~9.8 m/s²).

## Adding backend capabilities (Tauri)
- There are no `tauri::command` handlers yet. If you add backend APIs, implement them in [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) and register them in the `tauri::Builder` chain.
- Frontend should call backend via `@tauri-apps/api` (already a dependency) instead of ad-hoc IPC.

## Where new game code should go
- Game/runtime code: [src/game/](../src/game).
  - ECS core: `src/game/ecs/`
  - Systems: `src/game/systems/`
  - Input layer (events/pointer lock): `src/game/input/`
  - Prefabs/factories (Three objects, entity setup): `src/game/prefabs/`
- UI components: [src/ui/](../src/ui).
- React entrypoints are [src/main.tsx](../src/main.tsx) and [src/App.tsx](../src/App.tsx).

## Game architecture (ECS)
- Gameplay is organized as ECS: components are plain data in `Map`s and per-frame logic lives in systems.
- The main loop is in [src/game/GameApp.ts](../src/game/GameApp.ts): it wires `InputManager`, creates entities/components, then runs systems each frame.
- Be proactive about **ECS normalization**: if you see non-ECS patterns or messy ownership, refactor immediately into the most standard ECS structure (entities/components/systems/prefabs/resources) without waiting for explicit approval, as long as behavior and visuals don’t regress.
- Don’t ask for approval on routine architecture/structure choices: default to the most standard ECS approach and implement it directly; only ask when genuinely blocked or when a tradeoff would change gameplay/visual behavior.

## Large world scalability
- Prefer **streaming/tiling** for large worlds: represent terrain/props in chunks (e.g. 32–256m tiles), and only keep nearby chunks loaded/visible.
- Prefer **GPU-friendly batching**: instancing, merged geometry, and material reuse; avoid huge counts of individual objects.
- Use a **floating origin (origin rebasing)** strategy once the world extends to kilometers to avoid float precision issues (keep the player near (0,0,0) by shifting world transforms).

## Code style (functions vs classes)
- Prefer **flat functional systems** for gameplay logic: `fooSystem(stores, resources, dt)` in `src/game/systems/` (easy composition, low coupling).
- Use **classes** only where lifecycle/state matters (must have a clear cleanup path like `dispose()`): input managers, GPU/asset caches, renderer wrappers.

## UI style
- UI should lean towards a **shadcn/ui** style (clean, minimal, consistent spacing/typography).
