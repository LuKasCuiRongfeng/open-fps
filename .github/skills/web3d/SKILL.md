---
name: web3d
description: "Three.js WebGPU 渲染编程规范。USE WHEN: 编写或修改 3D 渲染代码、创建场景、编写 TSL 着色器、使用 Node Material、调试 WebGPU 渲染问题，或进行渲染架构与性能优化。KEYWORDS: Three.js, WebGPU, TSL, shader, 3D, scene, renderer, Node Material, WGSL, compute shader, 渲染, 着色器, 场景, WebGPU"
argument-hint: "[场景目标] [性能目标] [约束]"
---

# web3d

聚焦 Three.js、WebGPU、TSL 与 GPU-first 渲染架构的技能卡。

## 核心原则

- 除 GIS、globe、surveying 等特殊场景外，默认选择 Three.js。
- renderer 必须使用 WebGPU；materials 默认使用 Node Materials；shader 默认优先 TSL，热点再考虑 WGSL。
- GPU-first：能放到 GPU 的重复重活不要留在 CPU。
- 优先选择更高性能但仍可维护的架构，关注主线程开销、draw calls、状态切换和垃圾压力。
- 能带来真实收益时，优先使用 instancing、batching、compute shader、BVH、GPU animation、GPU particles 等现代手段。
- 第三方库只要能显著提效或减少低价值样板，就应积极采用。

## 设计与执行流程

使用此 skill 时，按以下顺序执行：

1. 先判断是否真的是普通 Web 3D 场景，而不是 GIS、globe 或测绘类特殊问题。
2. 对普通场景默认选择 Three.js + WebGPU，并明确 GPU/CPU 边界。
3. 先用 Node Materials + TSL 设计材质与着色逻辑，热点再考虑 WGSL。
4. 评估 instancing、batching、compute shader、BVH 和 GPU 粒子/动画等加速路径。
5. 需要时引入高价值第三方库，并说明它带来的真实性能或工程收益。
6. 输出最终方案时说明渲染路径、瓶颈判断和为什么这样更快。

## 输出与检查项

- 推荐的 engine、renderer、shader 路径，以及 GPU/CPU 职责边界。
- 是否使用了 WebGPU、Node Materials、TSL，以及热点是否需要 WGSL 或 compute shader。
- 是否应使用 instancing、batching、BVH、GPU animation、GPU particles 等高价值优化手段。
- imports 是否限制在 `three/webgpu`、`three/tsl` 和 `three/addons/...`，是否避免了 bare `three` 和过时 API。
- 哪些第三方库值得引入，以及它们为何能提升性能或减少样板。

## 示例输入

- `构建一个高性能海洋粒子场景，粒子数 10 万，并在移动端保持稳定。`
- `把现有 Three.js 场景迁移到 WebGPU，并说明哪些动画逻辑应搬到 GPU。`
- `为产品展示场景设计材质和后处理方案，兼顾画质与低主线程开销。`
- `审查这段 Web 3D 代码，重点看 CPU 重活、错误 import、过时 API 和渲染架构问题。`