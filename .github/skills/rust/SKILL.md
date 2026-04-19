---
name: rust
description: "Rust 实现与性能优化规范。USE WHEN: 编写或修改 Rust、Cargo、async Rust、trait、ownership、borrowing、并发、FFI、WASM 或需要决定函数、struct、enum、trait、module 等实现策略。KEYWORDS: Rust, Cargo, async, Tokio, trait, struct, enum, ownership, borrowing, lifetime, Send, Sync, rayon, WASM, FFI, Rust, 所有权, 借用, 生命周期, 并发, 性能"
argument-hint: "[功能或模块目标] [性能或并发目标] [约束]"
---

# rust

聚焦现代 Rust 实现、所有权建模、并发性能与工程化验证的技能卡。

## 核心原则

- 优先使用最新稳定的 Rust 语言特性、标准库能力和主流稳定生态，避免过时写法与低价值样板。
- 函数、struct、enum、trait、module 都不是默认答案，应按数据模型、状态边界、扩展需求和可读性自行选择。
- 先把所有权、借用和生命周期关系设计清楚，再写实现细节，避免靠绕路 clone 或无意义 `Arc<Mutex<_>>` 掩盖建模问题。
- 默认保持执行路径清晰；I/O 密集场景优先非阻塞 async 方案，CPU 密集场景优先明确的并行或批处理方案。
- 性能优化先找真实瓶颈，再决定是否使用 `rayon`、async runtime、SIMD、FFI、WASM 或受控 `unsafe`。
- `unsafe` 只能在有明确必要性和边界控制时使用，必须尽量收敛作用域并维护安全不变量。

## 设计与执行流程

使用此 skill 时，按以下顺序执行：

1. 先确认这是库、CLI、服务端、嵌入式、FFI 还是 WASM 场景，并识别约束。
2. 先建模数据与状态边界，判断更适合函数、struct、enum、trait 还是 module 组织，不为模式而模式。
3. 明确所有权、借用、错误边界和并发模型，避免过早引入共享可变状态。
4. 如果是 I/O 密集任务，优先设计非阻塞 async 路径；如果是 CPU 密集任务，优先评估线程并行、批处理或 `rayon`。
5. 如果存在高性能目标，先测量瓶颈，再决定是否引入 `unsafe`、FFI、SIMD、WASM 或更底层优化。
6. 代码完成后，主动运行与改动匹配的 `cargo fmt`、`cargo clippy`、`cargo test`、`cargo check`、`cargo build` 或最小运行验证，并说明剩余风险。

## 输出与检查项

- 是否优先使用了当前稳定 Rust 和标准库能力，而不是旧式模式或不必要依赖。
- 当前实现更适合函数、struct、enum、trait 还是 module，理由是否成立。
- 所有权、借用和生命周期设计是否清晰，是否存在本可避免的 clone、锁竞争或共享可变状态。
- 当前任务是 I/O 密集还是 CPU 密集，是否选择了合适的非阻塞或并行执行路径。
- 性能问题是否基于真实瓶颈，而不是过早使用 `unsafe`、FFI、WASM 或复杂并发。
- 如果使用 `unsafe` 或底层优化，边界、不变量和验证是否足够清楚。

## 示例输入

- `用现代 Rust 重写这个模块，优先保持类型和所有权设计清晰。`
- `帮我判断这里更适合函数、struct + impl，还是 trait 抽象。`
- `这个 Rust 服务在高并发下吞吐不稳，判断 async 模型和阻塞点是否合理。`
- `这个热点路径要不要上 rayon、unsafe、FFI 或 WASM，先按真实瓶颈评估。`