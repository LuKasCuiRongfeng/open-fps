# Copilot Instructions (open-fps)
# Copilot 指南 (open-fps)

---

## ⚠️ IRONCLAD RULES / 金戈铁律 ⚠️

> **AI MUST unconditionally follow these five ironclad rules. No exceptions, no compromises.**
> **AI 编码时必须无条件遵守以下五条铁律，不得以任何理由违反或妥协。**

### 1️⃣ GPU-First / GPU 优先
- **All work that CAN be done on GPU MUST be done on GPU.**
- **一切能在 GPU 上做的，必须在 GPU 上做。**
- **Never implement CPU alternatives** for GPU-capable workloads.
- **禁止在 CPU 上实现** GPU 可以更好完成的工作。
- Optimization **must never reduce visual quality**.
- 优化**不得降低视觉质量**。

### 2️⃣ Compute-Shader First / 计算着色器优先
- Data-parallel work (terrain, culling, LOD, skinning, particles, visibility, indirect draw) **MUST use compute shaders**.
- 数据并行任务（地形、剔除、LOD、蒙皮、粒子、可见性、间接绘制）**必须用 compute shader 实现**。
- CPU is **ONLY** for tiny bootstrap, UI, and glue. **NO per-vertex/per-instance CPU loops**.
- CPU **仅限于**微量引导代码、UI 和胶水逻辑；**禁止 CPU 逐顶点/逐实例循环**。

### 3️⃣ Industry Best Practices from Day 1 / 业界最佳实践
- Design with **industry best practices from day 1** (ECS, flow-field pathfinding, data-oriented pipelines).
- **从第一天起**就按业界最推崇的方式设计（ECS、flow-field 寻路、数据导向管线等）。
- **Do NOT wait** until "almost done" to ask about better approaches — **use the best approach from the start**.
- **不要等**项目"差不多"了才问是否要重构成更好的方案——**一开始就用最好的方案**。
- **AI must proactively suggest the best industry practices** — explain WHY it's the best approach and HOW it works in detail before implementation.
- **AI 必须主动提供业界最佳实践** — 在实现前需详细说明为什么这是最佳方案、以及其工作原理。

### 4️⃣ Single Responsibility & Decoupling / 单一职责与解耦
- **Each file should handle ONE responsibility** — do NOT cram multiple unrelated features into a single file.
- **每个文件只负责单一职责** — 不要把多个不相关的功能杂糅在一起。
- **Keep files small and focused** — split large files into smaller, focused modules.
- **保持文件小而专注** — 大文件应拆分为更小、更专注的模块。
- **Group related files in folders** — organize by feature/domain, not by file type.
- **相关文件放在同一文件夹** — 按功能/领域组织，而非按文件类型。
- **Loose coupling, high cohesion** — modules should be independent and communicate through clear interfaces.
- **低耦合、高内聚** — 模块应独立，通过清晰的接口通信。

### 5️⃣ Three.js Import Rules / Three.js 导入规则
- **TSL functions** (`float`, `vec3`, `uniform`, `Fn`, `If`, etc.) → import from `three/tsl`
- **TSL 函数**（`float`、`vec3`、`uniform`、`Fn`、`If` 等）→ 从 `three/tsl` 导入
- **Classes and types** → import from `three/webgpu`
- **类和类型** → 从 `three/webgpu` 导入
- **NEVER import from bare `three`** — always use `three/webgpu` or `three/tsl`
- **禁止从 `three` 直接导入** — 必须使用 `three/webgpu` 或 `three/tsl`
- **NEVER define custom types** for TSL nodes — use Three.js exports
- **禁止自定义 TSL 节点类型** — 使用 Three.js 导出的类型
- ⚠️ **Types FIRST from `three/webgpu`** — ALL types including TSL return types (e.g., `ShaderNodeObject`, `Node`, `UniformNode`, etc.) are exported from `three/webgpu`. **ONLY use `ReturnType<>` as a last resort** when a type truly doesn't exist.
- ⚠️ **类型优先从 `three/webgpu` 导入** — 所有类型包括 TSL 函数返回值类型（如 `ShaderNodeObject`、`Node`、`UniformNode` 等）都从 `three/webgpu` 导出。**只有在类型确实不存在时才用 `ReturnType<>`**。

---

## 🚀 Advanced Optimization / 高级优化

### Rust + WebAssembly for Performance / Rust + WebAssembly 提升性能
- **Use Rust compiled to WebAssembly** for CPU-bound hot paths that cannot run on GPU.
- **使用 Rust 编译 WebAssembly** 来加速无法在 GPU 上运行的 CPU 热点路径。
- Ideal for: pathfinding, physics simulation, heavy data processing, serialization.
- 适用于：寻路、物理模拟、大量数据处理、序列化等场景。

### Web Workers for Blocking Tasks / Web Workers 处理阻塞任务
- **Use Web Workers** for tasks that would block the main thread.
- **使用 Web Workers** 处理会阻塞主线程的任务。
- Ideal for: heavy computation, WASM execution, large data parsing, background processing.
- 适用于：大量计算、WASM 执行、大数据解析、后台处理等场景。

---

## Repo Shape / 仓库结构
- Frontend: `src/` (Vite + React + TypeScript + Tailwind) / 前端
- Backend: `src-tauri/` (Rust/Tauri) / 后端
- **Don't edit** build outputs (`dist/`, `src-tauri/target/`) / **不要编辑**构建输出

## Core Tech Constraints / 核心技术约束
- Rendering: Three.js **WebGPU-only**, NodeMaterial/TSL-based materials / 渲染：**仅 WebGPU**，NodeMaterial/TSL 材质
- **Three.js imports**: See **Ironclad Rule 5️⃣** above / **Three.js 导入**：见上方**铁律第五条**
- **React Compiler enabled** — **do NOT use** `useMemo`, `useCallback`, `React.memo` / **已启用 React Compiler**——**禁止使用** `useMemo`、`useCallback`、`React.memo`
- **NO `(xxx as any).xxx` pattern** — never cast to `any` to access undocumented APIs. Use only official, documented APIs. If an API doesn't exist, find an alternative approach.
- **禁止 `(xxx as any).xxx` 写法** — 不要通过 `any` 类型转换访问未文档化的 API。只使用官方文档化的 API。如果 API 不存在，寻找替代方案。

### ⚠️ Language Rule / 语言规则
- **ONLY code comments** use bilingual (English + Chinese) / **仅代码注释**使用中英双语
- **ALL other text** (UI strings, dialog messages, error messages, logs) **MUST be English ONLY** / **所有其他文本**（UI 字符串、对话框消息、错误消息、日志）**必须只用英文**
- This file (copilot-instructions.md) and README.md are exceptions / 本文件和 README.md 例外

## Code Cleanliness / 代码整洁
- **Delete** dead code, unused imports, redundant logic / **删除**无用代码、未使用的导入、冗余逻辑
- Keep codebase **lean and maintainable** / 保持代码**简洁可维护**
- **Use third-party libraries** when they simplify or optimize code / **允许使用第三方库**来简化或优化代码
- Write **clean, elegant, concise** code — avoid verbose or repetitive patterns / 代码要**简洁优雅**，避免冗长重复

## Dev Workflows / 开发流程
- Install: `pnpm install` / 安装依赖
- Dev: `pnpm tauri dev` (full) or `pnpm dev` (frontend only) / 开发
- Build: `pnpm build` then `pnpm tauri build` / 构建
- **AI testing**: use `pnpm build` or `pnpm tsc --noEmit`, **NOT `pnpm dev`** / AI 测试**禁止运行 dev**

## Configuration / 配置
- All configs in `src/config/` (terrain, camera, player, input, render, visuals) / 所有配置在 src/config/
- **Don't hardcode** data/constants — put in config files / **不要硬编码**，放到配置文件
- Use **real-world plausible defaults** with **SI units** (meters, seconds) / 使用**真实世界默认值**和 **SI 单位**

## Code Organization / 代码组织
- Game code: `src/game/` / 游戏代码
  - `project/` - Project/map storage (MapData, ProjectStorage) / 项目/地图存储
  - `ecs/` - ECS components and resources / ECS 组件和资源
  - `systems/` - ECS systems / ECS 系统
  - `editor/terrain/` - Terrain editing (TerrainEditor, TerrainBrush) / 地形编辑
  - `editor/texture/` - Texture editing (TextureEditor) / 纹理编辑
  - `world/terrain/` - Terrain system (chunks, materials, GPU compute) / 地形系统
  - `world/sky/` - Sky system (SkySystem, SkyShader) / 天空系统
  - `world/gpu/` - Shared GPU utilities (GpuTextureIO, WebGpuBackend) / 共享 GPU 工具
  - `input/`, `prefabs/`, `settings/` / 输入、预制体、设置
- UI: `src/ui/` / 用户界面
- Backend APIs: `src-tauri/src/lib.rs` (map save/load commands exist) / 后端 API（已有地图存取命令）
- **Path aliases / 路径别名**: Use `@game/*`, `@project/*`, `@ui/*`, `@config/*` instead of long relative paths
- **路径别名**：使用 `@game/*`、`@project/*`、`@ui/*`、`@config/*` 代替长相对路径

## Architecture Patterns / 架构模式
- **ECS**: components are pure data, systems are stateless functions, phase order: input → gameplay → physics → render
- **ECS**：组件是纯数据，系统是无状态函数，阶段顺序：输入 → 游戏逻辑 → 物理 → 渲染
- **Terrain**: GPU compute for height/normal generation, streaming chunks with LOD, CPU height cache for gameplay queries
- **地形**：GPU 计算生成高度/法线，流式 chunk + LOD，CPU 高度缓存供游戏查询
- **Editor**: GPU brush compute (ping-pong), orbit camera, map serialization via Tauri backend
- **编辑器**：GPU 画刷计算（乒乓），轨道相机，通过 Tauri 后端序列化地图
- **Large world**: streaming/tiling, GPU batching, floating origin for precision
- **大世界**：流式/分块，GPU 批处理，浮动原点保精度

## Code Style / 代码风格
- Prefer flat functional systems for gameplay logic / 优先使用扁平函数式系统处理游戏逻辑
- Classes only for lifecycle/state with clear `dispose()` cleanup / 类仅用于有生命周期/状态且需要 dispose() 的场景
- UI: shadcn/ui style (clean, minimal) / UI 风格：shadcn/ui（简洁、极简）
- **Tailwind CSS**: use modern syntax (e.g., `bg-linear-to-r` instead of `bg-gradient-to-r`) / **Tailwind CSS**：使用现代语法（如 `bg-linear-to-r` 而非 `bg-gradient-to-r`）
