---
name: web3d
description: "在处理 Three.js WebGPU 渲染相关任务时使用。USE WHEN: 3D 渲染代码、场景创建、TSL 着色器、Node Material、WebGPU 调试、渲染架构与性能优化。KEYWORDS: Three.js, WebGPU, TSL, shader, 3D, scene, renderer, Node Material, WGSL, compute shader, 渲染, 着色器, 场景, WebGPU"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明如何在 Three.js + WebGPU 路径下组织 GPU-first 渲染架构、材质方案、并行计算和性能判断。

## 核心原则

### 除 GIS、globe、surveying 等特殊场景外，默认选择 Three.js

普通 Web 3D 场景优先以 Three.js 为基础，不要一上来切到更重或更偏专用领域的技术栈。只有需求明确落在 GIS、地球、测绘等特殊问题上，才考虑更专项的方案。

### 只能从 `three/webgpu`、`three/tsl` 和 `three/addons/...` 导入，禁止 bare `three` 和过时 API

导入路径必须保持在 WebGPU、TSL 和 addons 的新路径上，避免 bare `three`、旧导入习惯和会破坏 WebGPU 路线的过时 API。

```ts
// 反例
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// 正例
import { PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu";
import { color, Fn } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
```

### renderer 必须使用 WebGPU

渲染器默认必须走 `WebGPURenderer`。除非任务明确要求兼容旧运行时，或者已经验证当前环境没有可用 WebGPU，再考虑其他路径。

```ts
// 正例
import { WebGPURenderer } from "three/webgpu";

const renderer = new WebGPURenderer({ antialias: true });
await renderer.init();
```

### materials 必须使用 Node Materials

材质层默认必须使用 Node Materials，不要在 WebGPU 路线里退回旧材质体系。颜色、粗糙度、发光、透明度和位移逻辑都优先放进节点表达式里组织。

```ts
// 反例
const material = new MeshStandardMaterial({ color: "#7aa2ff" });

// 正例
const material = new MeshStandardNodeMaterial();
material.colorNode = color("#7aa2ff");
```

### shader 默认使用 TSL，有性能问题再考虑原生 WGSL

默认先用 TSL 组织 shader 逻辑，优先保证可维护性、组合能力和与 Node Materials 的一致性。只有当性能或底层控制需求已经证明 TSL 不够时，再考虑直接写 WGSL。

```ts
// 正例
import { Fn, time, uv, vec3 } from "three/tsl";

const pulseColor = Fn(() => {
    const wave = uv().x.mul(10).add(time).sin().mul(0.5).add(0.5);
    return vec3(wave, wave, 1);
});
```

### 几乎所有的类和类型都能在 three/webgpu 下找到，所有的 TSL 函数和工具都能在 three/tsl 下找到

在 WebGPU 路线下，几乎所有的核心类和常用类型在 `three/webgpu` 都能找到，几乎所有的函数和工具在 `three/tsl` 能找到。禁止擅自自定义类型和打 patch。

```ts
// 反例
import type { ColorRepresentation, Vector3Tuple } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";

type CloudLayerConfig = {
    tint: ColorRepresentation;
    drift: Vector3Tuple;
};

function makeCloudLayer(config: CloudLayerConfig) {
    const material = new MeshStandardNodeMaterial();
    material.colorNode = { tint: config.tint } as never;
    return material;
}

// 正例
import { MeshStandardNodeMaterial, Vector3 } from "three/webgpu";
import { color, normalWorld, vec3 } from "three/tsl";

const drift = new Vector3(0.2, 0.05, 0);
const material = new MeshStandardNodeMaterial();
material.colorNode = color("#d8f1ff").mul(normalWorld.y.max(0).add(0.2));
material.positionNode = vec3(drift.x, drift.y, drift.z);
```

### TSL 函数返回类型必须直接从 three/webgpu 导入

这是高频误写点，必须单独强调。像 `texture3D()`、`vertexColor()`、`toneMapping()` 这类 TSL 工厂函数，默认先去 `three/webgpu` 找对应返回类型；禁止默认写 `ReturnType<typeof ...>`，禁止用 `Node<"...">` 或自定义别名包一层再传染到 API 边界。只有在确认 `three/webgpu` 确实没有对应导出时，才允许退回更宽的节点类型。

```ts
// 反例
import { Data3DTexture, Node } from "three/webgpu";
import { texture3D, vertexColor } from "three/tsl";

type CloudTextureNode = ReturnType<typeof texture3D>;
type LayerTintNode = Node<"vec4">;

function createVolumeNode(texture: Data3DTexture): CloudTextureNode {
    return texture3D(texture);
}

function createTintNode(): LayerTintNode {
    return vertexColor();
}

// 正例
import { Data3DTexture, Texture3DNode, VertexColorNode } from "three/webgpu";
import { texture3D, vertexColor } from "three/tsl";

function createVolumeNode(texture: Data3DTexture): Texture3DNode {
    return texture3D(texture);
}

function createTintNode(): VertexColorNode {
    return vertexColor();
}
```

### GPU-first：能放到 GPU 的重复重活不要留在 CPU

逐帧的大批量位移、粒子更新、风场扰动、体积采样、蒙皮或重复几何计算，默认优先判断能否放到 GPU。不要把明显适合 GPU 的重复重活继续留在 CPU 主线程上跑。

```ts
// 反例
for (const particle of particles) {
    particle.position.add(particle.velocity);
}

// 正例
material.positionNode = basePosition.add(velocity.mul(time));
```

### 需要并行优化时，优先使用 compute shader 处理可并行任务

当任务具备明显的数据并行特征，例如粒子模拟、实例状态更新、可见性筛选或体素处理时，优先考虑 compute shader，而不是继续在 CPU 上做大循环。

```ts
// 正例
import { Fn, instanceIndex } from "three/tsl";

const updateParticles = Fn(() => {
    const position = positionStorage.element(instanceIndex);
    const velocity = velocityStorage.element(instanceIndex);

    position.xyz.addAssign(velocity.xyz);
})().compute(particleCount);

await renderer.computeAsync(updateParticles);
```

### 优先选择业界已验证的高性能渲染方案

在保持可维护性的前提下，优先使用已经被广泛验证的高性能手段，例如 instancing、batching、LOD、BVH、GPU particles、visibility culling 和贴图合批，而不是停留在最直白但低效的实现上。

```ts
// 反例
for (const transform of transforms) {
    const mesh = new Mesh(grassGeometry, grassMaterial);
    mesh.position.copy(transform.position);
    scene.add(mesh);
}

// 正例
const grass = new InstancedMesh(
    grassGeometry,
    grassMaterial,
    transforms.length,
);
```

### Three.js 版本必须保持在最新的稳定版本

Three.js 生态发展迅速，尤其是 WebGPU 路线相关的更新频繁。必须保持对 Three.js 的版本更新，优先使用最新的稳定版本，以获得性能改进、bug 修复和新功能支持。

### 第三方库只要能显著提效或减少低价值样板，就应积极采用

不要为了“纯手写”偏好拒绝高价值库。只要第三方库能明显改善性能、减少样板代码或补齐 Three.js 生态缺口，就应积极采用，并说明它带来的真实收益。

```ts
// 正例
import {
    acceleratedRaycast,
    computeBoundsTree,
    disposeBoundsTree,
} from "three-mesh-bvh";

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;
```

### 必须处理资源生命周期

组件卸载、场景重建或 preset 切换时，必须停止 animation loop，移除事件监听，并 dispose geometry、material、texture、render target 和 renderer 相关资源。

### AI 写完 Web 3D 代码后必须严格自检，并形成自我反馈

Web 3D 代码完成后，AI 必须主动做严格自检，至少覆盖这些点：

1. 有没有代码错误：检查语法、类型、构建、运行时错误和最小可运行验证。
2. 有没有严格遵守 WebGPU 路线：确认导入路径、renderer、materials、shader 路径是否都符合 skill 要求。
3. 有没有把该上 GPU 的逻辑错误地留在 CPU：检查主线程循环、draw calls、实例化方式和并行计算路径。
4. 有没有形成自我反馈：把验证结果、剩余风险和未验证项明确写出来，发现偏差继续修，不要留给用户兜底。
5. 是否使用的是最新版本的 Three.js 和相关库，如果不是，询问用户是否更新。

```text
自检反馈示例
- imports: only three/webgpu, three/tsl, three/addons used
- renderer: WebGPURenderer in use
- materials: Node Materials only
- shader path: TSL by default, no unnecessary WGSL introduced
- validation: typecheck and build passed
- remaining risk: final frame-time profile not measured on target device
```
