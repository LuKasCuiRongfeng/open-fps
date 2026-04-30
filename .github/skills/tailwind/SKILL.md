---
name: tailwind
description: "在处理 Tailwind CSS 样式与主题化相关任务时使用。USE WHEN: Tailwind classes、utility strings、可复用样式 API、主题扩展性与可维护性优化。KEYWORDS: tailwind, utility, class, variant, theme, token, clsx, cn, tailwind-merge, 样式, 主题, 变体, 工具类"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明如何编写可维护的 utilities、主题化样式和复用变体，而不堆硬编码 class。

## 核心原则

### 按基础变量、`@theme`、utility、UI 四层分离主题系统

主题样式必须按固定依赖方向组织，避免 UI 直接接触底层变量或硬编码视觉值。

1. 先定义主题无关基础变量，例如 spacing、radius、font、duration、easing、z-index 与 layout scale。
2. 再定义主题相关基础变量，例如 surface、content、stroke、accent、status、focus、selection 与 overlay，并在 `:root`、`.dark` 或 `[data-theme]` 中切换。
3. `@theme {}` 只允许引用上述基础变量，作为 Tailwind token 出口，不直接写业务组件里的临时值。
4. 自定义 `@utility`、项目 utility 与组件 variant 只允许引用 `@theme` 暴露的 token。
5. UI 层只使用官方 utility、项目 utility 或组件 variant；禁止直接写 `var()`、主题相关 arbitrary values、硬编码颜色、阴影、边框与主题视觉值。

```css
:root {
    --sys-surface-panel: oklch(98% 0.01 250);
    --sys-content-primary: oklch(20% 0.02 250);
}

.dark {
    --sys-surface-panel: oklch(22% 0.02 250);
    --sys-content-primary: oklch(96% 0.01 250);
}

@theme {
    --color-surface-panel: var(--sys-surface-panel);
    --color-content-primary: var(--sys-content-primary);
}

@utility surface-panel {
    background-color: var(--color-surface-panel);
    color: var(--color-content-primary);
}
```

`@theme` 中的 `--color-*` 会自动生成 `bg-*`、`text-*`、`border-*` 等官方 utility；需要组合语义或项目级封装时，再用 `@utility` 定义自定义 utility。自定义 utility 只能引用 `@theme` 暴露的 token，不能回头引用 `--sys-*` 基础变量或写死主题值。

```tsx
// 反例
<section className="bg-[var(--sys-surface-panel)] text-[#111827]" />

// 正例
<section className="bg-surface-panel text-content-primary" />

// 组合语义正例
<section className="surface-panel" />
```

### 使用官方 Tailwind utility 命名和标准写法，避免伪 Tailwind 类名

Tailwind 类名必须来自官方 utility 体系或项目已定义的扩展 token，不要写“看起来像 Tailwind”但实际上没人认识的伪类名。

```tsx
// 反例
<div className="flex-center rounded-12 text-whiteish" />

// 正例
<div className="flex items-center justify-center rounded-xl text-white" />
```

### 可复用组件中避免写死主题相关视觉值，优先使用 tokens、CSS variables、variant maps 或共享样式预设

可复用组件不应把颜色、阴影、边框和主题状态写死在局部类名里。主题相关视觉值应尽量走 token 或共享映射。

```tsx
// 反例
<button className="bg-[#111827] text-[#f9fafb]" />

// 正例
<button className="bg-[var(--surface-primary)] text-[var(--text-primary)]" />
```

### 重复 utility 组优先提取为 reusable variants、helpers 或常量

同一组 class 一旦在多个地方复制，就应提取为 variant、helper、常量或共享组件，而不是继续复制长字符串靠人工同步。

### 仅在标准 scale 或项目 token 无法表达时使用 arbitrary values

arbitrary values 不是默认写法，只能在标准 scale、token 或语义类名无法表达时使用。能落回标准体系时就不要继续写死数值。

### utility strings 保持稳定、有序、可审查

class 顺序应稳定、可读、可比较，避免同一类名四处无序堆叠，导致 review 和 diff 成本上升。

### 条件拼接优先使用项目已有的 `cn`、`clsx`、`tailwind-merge` 等方案

条件 class 组合不要手写字符串拼接地狱，优先走项目既有的组合工具，减少重复和冲突。

```tsx
// 反例
className={base + (active ? " text-sky-500" : " text-zinc-500")}

// 正例
className={cn(base, active ? "text-sky-500" : "text-zinc-500")}
```

### AI 写完 Tailwind 代码后必须严格自检，并形成自我反馈

Tailwind 代码完成后，AI 至少要检查四件事：

1. 是否全部使用了真实存在的 Tailwind utility 或项目扩展类名。
2. 可复用组件里是否还残留硬编码主题值。
3. 重复 utility、arbitrary values 和条件拼接方式是否合理。
4. 是否形成了明确反馈，说明整理了什么、还剩哪些样式风险。

```text
自检反馈示例
- utilities: only official utilities and project tokens used
- theme values: reusable components moved to tokens
- class composition: cn used for conditional branches
- remaining risk: visual QA on small-screen breakpoints not yet run
```
