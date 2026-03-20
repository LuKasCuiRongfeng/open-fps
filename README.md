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
