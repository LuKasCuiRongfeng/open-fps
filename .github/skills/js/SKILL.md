---
name: js
description: "JavaScript 与 TypeScript 实现规范。USE WHEN: 编写或修改 JavaScript、TypeScript、ESM、CJS、异步流程、浏览器脚本、Node.js 逻辑，或需要决定函数式、class、Worker、WASM 等实现策略。KEYWORDS: JavaScript, TypeScript, ECMAScript, ESM, CJS, async, Promise, event loop, Worker, Web Worker, worker_threads, WASM, Rust, TS, JS, 类型, 非阻塞, 异步, 事件循环"
argument-hint: "[功能或模块目标] [性能目标] [运行时或约束]"
---

# js

聚焦现代 JavaScript / TypeScript 实现、异步非阻塞执行与高性能路径选择的技能卡。

## 核心原则

- 优先使用最新稳定的 ECMAScript 标准 API 和语法，避免过时写法与不必要的兼容性负担。
- 在 TypeScript 场景下，优先使用官方内置类型和标准库类型，避免随意自造低价值类型包装。
- 如果 TypeScript 已能从上下文清楚推导类型，就不要补多余的显式类型标注，例如明显的返回值类型。
- 避免使用 `any`；`unknown` 只在确实需要延迟收窄时使用，并应尽快通过类型守卫或边界检查收窄。
- 函数式、class 或更直接的局部实现都不是默认答案，应按问题规模、状态复杂度、复用需求和可读性自行选择。
- 独立且被多个位置使用的工具函数应提取为公共函数或共享模块，不要在多个业务文件里各写一份近似实现。
- 命名遵循 JavaScript / TypeScript 生态惯例；目录命名统一使用 kebab-case，例如 `some-books`。
- 默认保持非阻塞，避免阻塞 event loop 或主线程。
- 异步流程优先使用清晰可组合的 Promise / async / await 方案，并保证错误显式暴露。
- 需要高性能时，先判断瓶颈是在算法、数据传输、主线程阻塞还是纯计算吞吐，再决定是否引入 Worker 或 WASM。
- 需要 WASM 时，默认优先选择 Rust 编译链，除非项目已有明确标准或其他语言更合适。

## 设计与执行流程

使用此 skill 时，按以下顺序执行：

1. 先确认运行时是浏览器、Node.js，还是两者共享环境，并识别可用的标准 API。
2. 如果是 TypeScript，优先复用官方内置类型、DOM 类型、Node.js 类型或现有库导出的正式类型，再决定是否补充局部类型定义。
3. 判断当前问题更适合函数式、class，还是保持简单局部实现，不为风格偏好硬套结构。
4. 设计异步边界，确保 I/O、定时、并发任务和重计算不会阻塞主线程或 event loop。
5. 如果存在性能目标，先识别瓶颈，再决定是否拆到 Web Worker、worker_threads 或 WASM。
6. 如果引入 WASM，优先评估 Rust 方案，并控制 JS 与 WASM 之间的边界、序列化和调用开销。
7. 代码完成后，运行与改动匹配的 lint、test、build 或最小运行验证，并说明剩余风险。

## 输出与检查项

- 是否优先使用了当前可用的 ECMAScript 标准 API，而不是旧式或低价值封装。
- 如果使用 TypeScript，是否优先使用了官方内置类型，并避免 `any` 或未被收窄的含糊 `unknown`。
- 当前实现更适合函数式、class，还是无需额外抽象，理由是否成立。
- 是否保持非阻塞，是否存在同步重计算、长循环或阻塞式调用压住主线程或 event loop。
- 异步流程、并发控制和错误路径是否清晰。
- 性能瓶颈是否真的需要 Worker 或 WASM，而不是先优化算法、数据结构或批处理方式。
- 如果使用 WASM，Rust 是否是更合适的默认实现路径，以及边界成本是否可接受。

## 示例输入

- `用现代 JavaScript 重写这个旧模块，尽量使用最新 ECMAScript 标准 API。`
- `这个 TypeScript 模块尽量使用官方内置类型，不要写 any，也不要保留含糊 unknown。`
- `帮我判断这段逻辑更适合函数式、class，还是保持简单函数实现。`
- `这段 JS 在高负载下卡主线程，判断是否应该拆到 Worker。`
- `这个热点计算要不要上 WASM，如果上，优先按 Rust 方案评估。`