---
name: react
description: "在处理 React 组件实现与优化相关任务时使用。USE WHEN: React 组件、hooks、JSX/TSX、state management、React Compiler、re-render 优化。KEYWORDS: React, JSX, TSX, hooks, useEffect, useMemo, useCallback, state, re-render, React Compiler, Tailwind CSS, 组件, 状态, 重渲染, 样式"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明如何组织 React 组件、状态和样式，减少无意义渲染，并保持现代 API 与 React Compiler 友好。

## 核心原则

### 优先使用最新稳定现代推荐的 React APIs，避免已弃用或过时写法

组件、状态、副作用和并发能力都应优先走当前稳定的 React 路线，不要继续依赖已经过时的生命周期思维或旧写法。尽量使用最新版本 React 的新特性，比如新hooks、React Compiler 等。

### 样式方案默认倾向使用 Tailwind CSS，并兼顾多主题、紧凑布局和统一滚动体验

React UI 默认优先使用 Tailwind CSS 组织样式，同时应考虑多主题、信息密度和受控滚动容器的统一滚动条体验，而不是只做单一静态界面。

### UI 风格偏向紧凑小边距，不要默认使用大边距

React 界面默认应优先采用更紧凑的小边距、小间距和更高信息密度的布局，不要无理由堆大留白、大外边距和松散排版，导致有效内容被过度稀释。

### 图标库优先使用 `lucide-react`，基础组件能力优先使用 `shadcn/ui` 或 Radix

通用图标和基础交互能力优先选成熟生态，避免在按钮、弹层、菜单、对话框和图标这些低差异度问题上重复造轮子。

### 需要全局状态管理时，优先评估 `zustand`

当状态已经跨组件树传播、需要共享或需要独立于 React 树复用时，优先评估 `zustand`，不要把全局状态硬塞进层层 props 或巨大 context。

```tsx
// 正例
import { create } from "zustand";

type EditorStore = {
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
};

export const useEditorStore = create<EditorStore>((set) => ({
    selectedId: null,
    setSelectedId: (selectedId) => set({ selectedId }),
}));
```

### 重点关照重复渲染、派生 state、引用稳定性和 effect 依赖循环

React 性能问题很多不是来自“算得太慢”，而是来自不必要的派生 state、重复 effect、错误依赖和组件边界划分失控。优先消除这些结构性问题。

```tsx
// 反例
const [visibleItems, setVisibleItems] = useState<Item[]>([]);

useEffect(() => {
    setVisibleItems(items.filter((item) => item.name.includes(keyword)));
}, [items, keyword]);

// 正例
const visibleItems = items.filter((item) => item.name.includes(keyword));
```

### 如果目标 React 版本支持 React Compiler，优先把它视为默认优化路径

能用 React Compiler 覆盖的优化，不要先手写一层又一层缓存和手工 memo 逻辑。先按 Compiler 友好的组件结构组织，再看是否还存在真实热点。

### React Compiler 路线下不要把 `useMemo`、`useCallback` 当默认写法

`useMemo` 和 `useCallback` 不是“写 React 就要带上”的仪式。只有在已经证明存在热点、引用稳定性要求或第三方边界明确需要时才使用。

```tsx
// 反例
const handleOpen = useCallback(() => setOpen(true), []);

// 正例
function handleOpen() {
    setOpen(true);
}
```

### AI 写完 React 代码后必须严格自检，并形成自我反馈

React 代码完成后，AI 至少要检查四件事：

1. 组件边界、状态流和样式方案是否满足用户要求。
2. 有没有引入派生 state、重复渲染、依赖循环或 effect 误用。
3. React Compiler 路线下是否不必要地堆了 `useMemo`、`useCallback`。
4. 是否形成了明确反馈，说明验证了什么、还剩哪些未确认风险。

```text
自检反馈示例
- state flow: local vs global state boundaries checked
- rerender risk: no obvious derived-state effect loops found
- compiler path: no unnecessary memo hooks introduced
- remaining risk: interactive focus behavior not manually exercised
```