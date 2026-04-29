# 仓库 Copilot 指引

这些指引负责为当前任务路由到合适的 skill，并集中声明仓库级的 skill 与 prompt 入口。

保持这个文件简短。可复用的实现细节应下沉到 skills。
skill 的 YAML `description` 统一使用这类简洁结构：`[一句简短说明]。USE WHEN: [短语]。KEYWORDS: [关键词列表]`。

## Project-Specific Supplement

Always read and follow [`AI_DEVELOPMENT_GUIDE.md`](../AI_DEVELOPMENT_GUIDE.md) for this project's AI-assisted development requirements.

## Skills

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

- `engineering`: 通用工程 skill，聚焦 review、refactor、maintainability、复杂度控制、垃圾代码清理与验证闭环。
- `testing`: 通用测试 skill，聚焦测试分层、补测优先级、mock 策略、回归保护与自动化验证取舍。
- `documentation`: 通用文档与注释 skill，聚焦何时写注释、文档放哪、如何保持文档简洁且不陈旧。
- `js`: 通用 JavaScript / TypeScript skill，聚焦现代标准 API、官方类型优先、结构选择、异步非阻塞执行，以及 Worker / WASM 性能路径判断。
- `rust`: 通用 Rust skill，聚焦现代稳定 Rust、所有权与并发建模、async 与并行路径选择，以及性能优化边界判断。
- `web3d`: 通用 Web 3D 高性能开发 skill，默认采用 Three.js + WebGPU + TSL，并坚持 GPU-first。
- `react`: 通用 React 开发 skill，强调 React Compiler 兼容、现代 API、减少重复渲染、组件拆分复用和 800 行内组件规模控制。
- `tailwind`: 通用 Tailwind CSS skill，要求使用官方标准 utility 命名、避免写死主题相关 class、保持多主题可扩展，并尽量保持 class 有序整洁。
- `network`: 通用网络排障 skill，聚焦定位失败层级，并检查是否存在已配置且真正可用的代理。

## Prompts

- `git-push`: 用于暂存变更、创建 commit 并推送到远端分支的 Slash command。提供 `--message` 时使用指定提交信息，否则根据实际变更自动生成英文提交信息。
