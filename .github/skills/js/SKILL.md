---
name: js
description: "在处理 JavaScript、TypeScript 与相关运行时编码任务时使用。USE WHEN: JavaScript、TypeScript、ESM、CJS、异步流程、浏览器脚本、Node.js、Bun、Deno、函数式编程、class、Worker、WASM 实现判断。KEYWORDS: JavaScript, TypeScript, ECMAScript, ESM, CJS, async, Promise, event loop, Worker, Web Worker, worker_threads, WASM, Rust, Node.js, Bun, Deno, TS, JS, 类型, 非阻塞, 异步, 事件循环"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明如何在不同 JavaScript 运行时中做现代实现、类型取舍、非阻塞设计和性能判断。

## 核心原则

### 优先使用最新稳定的标准 API 和语法，避免过时写法与不必要的兼容性负担

默认先写现代、稳定、可直接维护的 JavaScript / TypeScript。只有在目标运行时明确受限时，才为兼容性回退。尽量使用新特性以获取更高的性能。

### 在 TypeScript 场景下，优先使用官方内置类型和标准库类型，避免随意自造低价值类型包装

能直接使用 `Record`、`Partial`、`Pick`、DOM 类型、Node 类型等标准类型时，就不要再包一层几乎等价的私有类型别名。

### 尽量避免使用 `any` 和 `unknown`

只有在边界收窄前的极短路径里，`unknown` 才能作为临时输入类型存在；不要把 `any` 当成逃生口，也不要让 `unknown` 长期停留在业务逻辑里。

```ts
// 反例
function getTotal(line: any): unknown {
    return line.price * line.count;
}

// 正例
type CartLine = {
    price: number;
    count: number;
};

function getTotal(line: CartLine) {
    return line.price * line.count;
}
```

### 模块管理只能使用 ESM

新实现统一使用 `import` / `export`，不要引入 `require`、`module.exports`，也不要混用 ESM / CJS。

```js
// 反例
const path = require("node:path");
module.exports = {
    resolveAsset(fileName) {
        return path.join("assets", fileName);
    },
};

// 正例
import { join } from "node:path";

export function resolveAsset(fileName) {
    return join("assets", fileName);
}
```

### 默认保持非阻塞，避免阻塞 event loop 或主线程

默认不要在主线程或 event loop 上堆同步 I/O、长循环或重计算。读写文件、网络请求、密集计算都优先走异步或并行路径。

```ts
// 反例
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config.json", "utf8"));
for (let index = 0; index < 1_000_000_000; index += 1) {
    // heavy compute on main thread
}

// 正例
import { readFile } from "node:fs/promises";

const configText = await readFile("config.json", "utf8");
const worker = new Worker(new URL("./compute.worker.ts", import.meta.url), {
    type: "module",
});
worker.postMessage(JSON.parse(configText));
```

### 异步流程优先使用清晰可组合的 Promise / async / await 方案，并保证错误显式暴露

异步逻辑要优先可读、可组合、可追踪错误；不要把失败吞掉后返回模糊结果，让调用方误以为成功。

```ts
// 反例
export function loadProfile() {
    return fetch("/api/profile")
        .then((response) => response.json())
        .catch(() => null);
}

// 正例
export async function loadProfile() {
    const response = await fetch("/api/profile");

    if (!response.ok) {
        throw new Error(`Failed to load profile: ${response.status}`);
    }

    return response.json();
}
```

### 默认优先使用 pnpm 作为包管理器

新项目和日常依赖管理默认优先使用 `pnpm`，除非仓库已经明确固定在其他包管理器上。

```bash
# 反例
npm install three
yarn add typescript -D

# 正例
pnpm add three
pnpm add -D typescript
```

### 默认使用具名导入导出

默认优先使用具名导出和具名导入，降低重命名歧义，提升批量搜索、重构和自动补全的稳定性。

```ts
// 反例
export default function formatPrice(price: number) {
    return `￥${price.toFixed(2)}`;
}

import formatPrice from "./price";

// 正例
export function formatPrice(price: number) {
    return `￥${price.toFixed(2)}`;
}

import { formatPrice } from "./price";
```

### 需要高性能时，考虑引入 Worker、WASM、compute shader 并行计算

当瓶颈已经明确落在 CPU 密集计算、可并行任务或 GPU 计算场景时，考虑引入 Worker、WASM 或 compute shader；不要在没证明瓶颈前提前堆复杂度。不同瓶颈优先匹配不同手段：主线程 CPU 压力优先看 Worker，热点数值计算优先看 WASM，大规模 GPU 友好并行任务优先看 compute shader。

```ts
// 正例：把 CPU 密集批处理移到 Worker
const worker = new Worker(new URL("./mesh-bake.worker.ts", import.meta.url), {
    type: "module",
});

worker.postMessage({ vertices, faces });
worker.onmessage = (event) => {
    applyBakeResult(event.data);
};
```

### 需要 WASM 时，默认优先选择 Rust 编译链

如果确实需要 WASM，默认优先选择 Rust 编译链，以获得更成熟的生态、较强的性能边界和更清晰的类型建模能力。

```ts
// 正例：用 Rust/WASM 承担热点数值计算
import init, { solveTerrainPath } from "@acme/pathfinding-wasm";

await init();

const path = solveTerrainPath(heightMap, start, end);
```

### 需要 compute shader 时，默认优先选择用 Three.js 的 TSL 写

如果确实需要 compute shader，默认优先选择 Three.js 的 TSL 路径；只有在性能或底层控制需求仍然不满足时，再考虑直接写原生 WGSL。

```ts
// 正例：先用 TSL 组织 compute pass
import { Fn, instanceIndex } from "three/tsl";

// positionStorage 和 velocityStorage 代表已绑定好的 GPU storage buffers
const updateParticles = Fn(() => {
    const position = positionStorage.element(instanceIndex);
    const velocity = velocityStorage.element(instanceIndex);

    position.xyz.addAssign(velocity.xyz);
})().compute(particleCount);

await renderer.computeAsync(updateParticles);
```

### AI 写完代码后必须严格自检，并形成自我反馈

代码完成后，AI 必须主动做严格自检，至少覆盖三件事：

1. 有没有代码错误：根据改动风险检查语法、类型、lint、构建、测试或最小运行验证，而不是写完就结束。
2. 有没有严格按照要求做事：检查是否满足用户要求、skill 约束、运行时边界、导入约束、风格约束和验证要求。
3. 有没有形成自我反馈：把自检结果收敛成明确结论，发现偏差就继续修，不要把问题留给用户二次发现。

```text
自检反馈示例
- typecheck: passed
- build: passed
- imports: only ESM named imports used
- requirements: all requested constraints satisfied
- remaining risk: runtime behavior not manually exercised in browser
```
