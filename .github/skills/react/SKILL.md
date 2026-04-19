---
name: react
description: "React 组件实现与优化规范。USE WHEN: 编写或修改 React 组件、hooks、JSX/TSX、state management、React Compiler 相关代码，或需要减少不必要的 re-renders。KEYWORDS: React, JSX, TSX, hooks, useEffect, useMemo, useCallback, state, re-render, React Compiler, 组件, 状态, 重渲染"
argument-hint: "[功能或组件目标] [性能目标] [约束]"
---

# react

聚焦 React 组件实现、结构拆分、渲染性能与 React Compiler 兼容性的通用技能卡。

## 核心原则

- 优先使用最新稳定的 React APIs，避免已弃用或过时写法。
- 一般图标优先使用 `lucide-react`；需要组件库基础能力时，优先使用 `shadcn/ui` 或 Radix UI primitives，除非项目已有明确标准。
- 需要全局状态管理时，倾向使用 `zustand`，除非项目已有明确标准或存在更合适的既有方案。
- 保持清晰的组件边界和单一职责，优先通过 composition 与局部 state 减少父到子 re-render 级联。
- 谨慎处理 effect dependencies、derived objects、inline functions 和不稳定引用，避免重复执行和 effect loops。
- 如果启用了 React Compiler，将其视为默认优化路径；除非 profiling 或明确热点证明有必要，否则避免手动使用 `useMemo`、`useCallback` 等缓存 hooks。
- 需要优化时，先改进组件边界、state placement、render scope 和 data flow，再考虑手动 memoization。
- 在实际可行时，将组件文件控制在 800 行以内；接近该规模时就拆分。

## 设计与执行流程

使用此 skill 时，按以下顺序执行：

1. 识别组件边界、功能职责和当前渲染瓶颈。
2. 检查是否启用了 React Compiler，并选择最简单的现代 React APIs。
3. 设计 state placement、prop flow 与复用方式，必要时提取可复用组件、hooks 或 helper modules。
4. 检查 `useEffect` dependencies、引用稳定性和缓存 hooks，避免重复执行、effect loops 和无意义 memoization。
5. 将过大或职责混杂的组件拆开；接近 800 行时，拆分 layout、state logic、effects 和 subviews。

## 输出与检查项

- 推荐的组件结构是否清晰，是否需要拆分。
- 是否使用了当前标准的 React APIs，以及是否应优先选择 `lucide-react`、`shadcn/ui` 或 Radix UI。
- 如果存在全局状态管理需求，是否应优先使用 `zustand`。
- React Compiler 是否会影响 hook 选择，`useMemo`、`useCallback` 等缓存 hooks 是否有充分理由存在。
- 设计是否减少了不必要的 re-renders，`useEffect` dependencies、引用稳定性和 state placement 是否合理。
- 重复模式、业务逻辑和职责是否已在组件、hooks、helper modules 之间清晰拆分。
- 是否有组件或文件过大，需要继续拆开。

## 示例输入

- `重构这个 React dashboard，把它拆成更小且可复用的组件，并减少不必要的 re-renders。`
- `审查这个 React 代码库，重点关注 React Compiler 兼容性以及不必要的 useMemo 使用。`
- `设计一个现代 React 表单流程，兼顾良好的组件边界和低 render 开销。`
- `把这个过大的 TSX 组件拆成可复用部分，并保持行为不变。`
