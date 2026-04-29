---
name: rust
description: "在处理 Rust 实现、建模与性能优化时使用。USE WHEN: Rust、Cargo、async Rust、trait、ownership、borrowing、并发、FFI、WASM、模块与类型设计。KEYWORDS: Rust, Cargo, async, Tokio, trait, struct, enum, ownership, borrowing, lifetime, Send, Sync, rayon, WASM, FFI, Rust, 所有权, 借用, 生命周期, 并发, 性能"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明如何围绕所有权、并发模型和真实瓶颈组织 Rust 实现与验证。

## 核心原则

### 优先使用最新稳定的 Rust 语言、标准库和主流稳定生态

默认先用稳定 Rust、标准库和主流稳定 crates 解决问题，不要为形式感依赖过时写法、实验性能力或低价值样板。

### 根据任务类型选择合适的并发模型，而不是把异步、线程和共享状态混成一团

I/O 密集任务优先异步；CPU 密集任务优先线程并行；共享状态越少越好。并发模型必须服务工作负载，而不是因为“Rust 擅长并发”就全部一起上。

### 默认先用安全 Rust、清晰所有权和零拷贝建模解决问题

在没有明确瓶颈前，优先用所有权、借用、切片、迭代器和批处理组织高性能实现，而不是先跳到共享可变状态、裸指针或底层技巧。

```rust
// 反例
unsafe {
    *buffer.as_mut_ptr().add(index) = value;
}

// 正例
buffer[index] = value;
```

### 如果有明显瓶颈或资源限制，再考虑 `unsafe`、SIMD、FFI 或底层系统编程

这些手段只能在瓶颈已经证明存在、收益明确且边界可控时使用。没有测量依据时，不要把实现直接推进到高风险复杂区。

### 倾向使用成熟热门的第三方库，除非有明确理由不选

像 Tokio、Rayon、Serde、Reqwest、SQLx、Axum、Diesel 这类成熟库能显著减少样板和实现风险时，应优先使用，而不是重复造一套更脆弱的替代品。

```toml
[dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
serde = { version = "1", features = ["derive"] }
reqwest = { version = "0.12", features = ["json"] }
```

### 性能优化要以真实瓶颈为前提，而不是提前堆底层技巧

Rust 给了很多底层能力，但不代表每个问题都该先上锁分片、内存池、SIMD 或 FFI。先测量、再定位、再优化。

### AI 写完 Rust 代码后必须严格自检，并形成自我反馈

Rust 代码完成后，AI 至少要检查四件事：

1. 所有权、借用和并发模型是否清楚且合理。
2. 有没有在无明确瓶颈时过早引入 `unsafe`、FFI 或底层优化。
3. 是否运行了与改动匹配的格式化、类型检查、构建或测试验证。
4. 是否形成了明确反馈，说明验证结果和剩余风险。

```text
自检反馈示例
- ownership model: no unnecessary shared mutable state introduced
- unsafe usage: none added without benchmark evidence
- validation: cargo fmt, cargo check and cargo test passed
- remaining risk: production-sized benchmark not yet run
```
