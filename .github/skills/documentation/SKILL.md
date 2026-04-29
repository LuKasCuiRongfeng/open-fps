---
name: documentation
description: "在处理代码注释与文档相关任务时使用。USE WHEN: 注释、README、架构说明、迁移说明、工作流文档、文档位置判断。KEYWORDS: documentation, comment, README, architecture, migration, workflow, note, 注释, 文档, README, 架构, 迁移"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明何时需要写注释或文档、该写在哪里，以及怎样保持内容短、准、不过期。

## 核心原则

### 只记录能明显提升理解或操作正确性的内容

不要为了“看起来完整”补低价值说明。只有能帮助理解业务规则、边界条件、依赖关系、操作步骤或历史坑点的内容，才值得写进注释或文档。

```ts
// 反例
// 将 userId 赋值给 payload.userId
payload.userId = userId;

// 正例
// Preserve the upstream user id so retry logs can be correlated.
payload.userId = userId;
```

### 文档尽量短、准、作用域清晰，并放在最贴近责任的位置

文档应直接服务当前读者要完成的动作或理解目标，避免长篇背景铺垫、重复代码语义或跨层混写。

### 仓库范围的概念写仓库文档，局部行为写局部文档

跨模块约定、架构边界、工作流说明写在仓库级文档；局部模块规则、组件用法、脚本说明写在最接近责任的目录或文件旁边。

```md
# 反例
README.md 里写某个缓存模块内部 3 个状态位的更新顺序

# 正例
docs/architecture.md 写跨模块缓存策略
src/cache/README.md 写本模块的键规则和失效时机
```

### 修改代码时同步更新或删除过期文档与注释

重构、重命名、移动文件或改变行为时，相关文档和注释必须一起更新。过期文档比没有文档更危险。

### AI 写完文档或注释后必须严格自检，并形成自我反馈

文档完成后，AI 至少要检查三件事：

1. 内容是否仍然准确，没有复述代码或保留过期说明。
2. 位置是否合理，仓库级与局部级内容有没有写错地方。
3. 是否形成了明确反馈，说明改了什么、验证了什么、还剩哪些未确认项。

```text
自检反馈示例
- scope: repo-level vs local docs placed correctly
- stale content: none found after the rename
- precision: removed duplicated code narration
- remaining risk: runtime screenshots not updated yet
```