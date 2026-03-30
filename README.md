# Open-FPS

Open-FPS is an extensible open-world FPS survival project with large seamless terrain.

Open-FPS 是一个可扩展的开放世界 FPS 生存项目，目标是支持超大无缝地形。

## Overview / 概览

- Perspective: first-person with third-person support / 第一人称，支持第三人称
- Rendering: Three.js WebGPU-only with NodeMaterial and TSL / 仅使用 Three.js WebGPU 与 NodeMaterial、TSL
- App shell: React + TypeScript + Tailwind + Vite / 前端使用 React + TypeScript + Tailwind + Vite
- Native layer: Tauri + Rust / 原生层使用 Tauri + Rust

## Core Rules / 核心规则

- GPU-first: GPU-capable work stays on GPU / GPU 优先：能放 GPU 的工作必须放 GPU
- Compute-shader-first: data-parallel systems use compute shaders / 计算着色器优先：数据并行系统必须使用 compute shader
- No quality-loss shortcuts / 不接受降低画质的取巧方案
- No WebGL fallback / 不提供 WebGL 回退
- Use current official Three.js WebGPU and TSL APIs / 使用最新官方 Three.js WebGPU 与 TSL API

## Project Layout / 项目结构

- `src/`: frontend, rendering, game logic / 前端、渲染、游戏逻辑
- `src/game/`: ECS, systems, world, editor / ECS、系统、世界、编辑器
- `src/config/`: shared configs and tunables / 配置与可调参数
- `src-tauri/`: backend and native integration / 后端与原生集成

## Development / 开发

```bash
pnpm install
pnpm dev
pnpm tauri dev
pnpm build
pnpm tauri build
```

Editor is the default target for the generic commands above.

Use explicit target commands when you want a dedicated runtime or package:

```bash
pnpm dev:editor
pnpm dev:game
pnpm build:editor
pnpm build:game
pnpm tauri:dev:editor
pnpm tauri:dev:game
pnpm tauri:build:editor
pnpm tauri:build:game
pnpm tauri:debug:editor
pnpm tauri:debug:game
pnpm tauri:release:editor
pnpm tauri:release:game
```

- `dist-editor/`: editor-only frontend bundle
- `dist-game/`: game-only frontend bundle
- `src-tauri/target-editor/`: editor-native cargo output and bundles
- `src-tauri/target-game/`: game-native cargo output and bundles
- `src-tauri/tauri.editor.conf.json`: editor package config
- `src-tauri/tauri.game.conf.json`: game package config

Dedicated native binaries:

- Editor: `open-fps-editor`
- Game: `open-fps-game`

CI entrypoints:

```bash
pnpm ci:frontend:editor
pnpm ci:frontend:game
pnpm ci:tauri:editor
pnpm ci:tauri:game
```

Release flow:

```bash
git tag v0.1.1
git push origin v0.1.1
```

Pushing a `v*` tag runs the release workflow, builds editor/game bundles on Windows, Linux, and macOS, and attaches them to a GitHub Release.

CI vs Release:

- A normal `git push` to `master` runs CI only.
- CI means build and validation jobs run in GitHub Actions, but no GitHub Release page is created.
- A pushed `v*` tag runs the release workflow.
- Only the release workflow creates a GitHub Release and uploads installer assets.
- If the release workflow fails, the Release page will not be published successfully.
- The Release page includes a short summary and a full changelog link instead of relying only on the default GitHub auto text.

What counts as a real release:

- A commit pushed to `master` is not a release.
- A version tag like `v0.1.1` is the release trigger.
- The GitHub Release page with attached installers is the actual published release artifact.

Recommended steps:

1. Push your code changes to `master`.
2. Wait for CI to pass.
3. Create a version tag such as `v0.1.1`.
4. Push the tag with `git push origin v0.1.1`.
5. Wait for the `Release` workflow to finish.
6. Check the GitHub Releases page for the published installers.

What you do not need to do manually:

- You do not need to edit `package.json` version before release.
- You do not need to click `Create a new release` in the GitHub web UI.
- You do not need to upload installer files by hand.

Release versioning:

- The Git tag is now the release version source of truth.
- On release jobs, the workflow syncs `package.json` from the pushed tag before building.
- Tauri configs read version metadata from `package.json`, so installers and app metadata follow the tag automatically.
- Example: pushing `v0.1.1` makes the release build use `0.1.1` without manually editing files first.

`cross` note:

- `cross` is available locally and can help with Rust-only or no-bundle target compilation.
- Tauri release bundles still rely on native OS runners in CI because installers and app bundles are platform-specific.
- In practice: use GitHub Actions native runners for release packaging; treat `cross` as a local helper, not the primary release path.

## Architecture / 架构

- ECS: pure-data components, stateless systems / ECS：纯数据组件、无状态系统
- Phase order: `input -> gameplay -> physics -> render` / 阶段顺序：输入 -> 游戏逻辑 -> 物理 -> 渲染
- Terrain: GPU generation, chunk streaming, LOD / 地形：GPU 生成、分块流式加载、LOD
- Large world: batching, streaming, floating origin / 大世界：批处理、流式加载、浮动原点

## Code Notes / 代码说明

- TSL functions from `three/tsl`; classes and types from `three/webgpu` / TSL 函数从 `three/tsl`，类和类型从 `three/webgpu`
- Keep constants in `src/config/` / 常量放入 `src/config/`
- Runtime text should stay English-only / 运行时文本保持英文
- Static assets live in `src-tauri/resources/` / 静态资源放在 `src-tauri/resources/`
