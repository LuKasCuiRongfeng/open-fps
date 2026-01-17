# Open-FPS

> 🎮 An extensible open-world FPS survival game with massive terrain support
> 
> 🎮 可扩展的超大地图开放世界 FPS 生存游戏

---

## 🎯 Project Vision / 项目愿景

An open-world first-person (switchable to third-person) 3D FPS post-apocalyptic survival game. Similar to Don't Starve, but with innovative gameplay mechanics and massive seamless terrain.

开发一款可扩展的超大地图开放世界第一人称（可切换第三人称）3D FPS 末日生存游戏。类似饥荒，但拥有新颖的玩法和无缝大地形。

---

## 🛠️ Tech Stack / 技术栈

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript + Tailwind CSS + Vite |
| Rendering | Three.js (**WebGPU-only**, NodeMaterial/TSL) |
| Performance | Rust → WebAssembly, Web Workers |
| Backend | Rust / Tauri |

### Directory Structure / 目录结构
- `src/` — Frontend (React, Three.js, Game Logic) / 前端
- `src-tauri/` — Backend (Rust/Tauri) / 后端
- `src/config/` — All game configurations / 所有游戏配置
- `src/game/` — Game code (ECS, systems, world, editor) / 游戏代码

---

## ⚠️ Core Principles / 核心原则

### 1️⃣ GPU-First / GPU 优先
- **All work that CAN be done on GPU MUST be done on GPU**
- **一切能在 GPU 上做的，必须在 GPU 上做**
- Optimization **must never reduce visual quality**
- 优化**不得降低视觉质量**

### 2️⃣ Compute-Shader First / 计算着色器优先
- Data-parallel work (terrain, culling, LOD, skinning, particles) **MUST use compute shaders**
- 数据并行任务**必须用 compute shader 实现**
- CPU only for bootstrap, UI, and glue — **NO per-vertex/per-instance CPU loops**
- CPU 仅限引导代码、UI 和胶水逻辑——**禁止 CPU 逐顶点/逐实例循环**

### 3️⃣ Industry Best Practices / 业界最佳实践
- Design with **best practices from day 1** (ECS, flow-field pathfinding, data-oriented pipelines)
- **从第一天起**就按最佳方式设计（ECS、flow-field 寻路、数据导向管线）

---

## 🚀 Advanced Optimization / 高级优化

### Rust + WebAssembly
- Use **Rust → WASM** for CPU-bound hot paths that cannot run on GPU
- **使用 Rust 编译 WebAssembly** 加速无法在 GPU 上运行的 CPU 热点路径
- Ideal for: pathfinding, physics, heavy data processing, serialization
- 适用于：寻路、物理、大量数据处理、序列化

### Web Workers
- Use **Web Workers** for tasks that would block the main thread
- **使用 Web Workers** 处理会阻塞主线程的任务
- Ideal for: heavy computation, WASM execution, large data parsing
- 适用于：大量计算、WASM 执行、大数据解析

---

## 📦 Development / 开发

```bash
# Install dependencies / 安装依赖
pnpm install

# Development (full app) / 开发（完整应用）
pnpm tauri dev

# Development (frontend only) / 开发（仅前端）
pnpm dev

# Build / 构建
pnpm build
pnpm tauri build
```

---

## 📐 Architecture / 架构

### ECS Pattern / ECS 模式
- Components are **pure data** / 组件是纯数据
- Systems are **stateless functions** / 系统是无状态函数
- Phase order: `input → gameplay → physics → render`
- 阶段顺序：`输入 → 游戏逻辑 → 物理 → 渲染`

### Terrain System / 地形系统
- GPU compute for height/normal generation / GPU 计算生成高度/法线
- Streaming chunks with LOD / 流式 chunk + LOD
- CPU height cache for gameplay queries / CPU 高度缓存供游戏查询

### Large World Support / 大世界支持
- Streaming/tiling architecture / 流式/分块架构
- GPU batching / GPU 批处理
- Floating origin for precision / 浮动原点保精度

---

## 📝 Code Guidelines / 代码规范

- **Three.js imports**: TSL functions from `three/tsl`, classes from `three/webgpu` — **never from bare `three`**
- **Three.js 导入**：TSL 函数从 `three/tsl`，类从 `three/webgpu`——**禁止从 `three` 直接导入**
- **Comments**: Important code needs bilingual (EN/CN) comments
- **注释**：重要代码需要中英双语注释
- **Clean code**: Delete dead code, unused imports, redundant logic
- **整洁代码**：删除无用代码、未使用的导入、冗余逻辑
- **No hardcoding**: All constants go in `src/config/`
- **禁止硬编码**：所有常量放入 `src/config/`
- **SI units**: Use meters, seconds for real-world plausible defaults
- **SI 单位**：使用米、秒等真实世界单位

---

## 🔧 No Compatibility Concerns / 不考虑兼容性

This project uses **cutting-edge features only**:
- Latest JavaScript/TypeScript features
- WebGPU (no WebGL fallback)
- Latest Three.js APIs
- Modern browser features

本项目**只使用最新特性**，不考虑任何兼容性。

---

## 📁 Static Assets / 静态资源

Place static assets in `src-tauri/resources/`

静态资源放在 `src-tauri/resources/` 目录下
