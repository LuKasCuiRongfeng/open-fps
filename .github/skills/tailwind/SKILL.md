---
name: tailwind
description: "Tailwind CSS 样式编写与主题化规范。USE WHEN: 编写或重构 Tailwind classes、整理 utility strings、设计可复用样式 API，或让样式具备主题扩展性与可维护性。KEYWORDS: tailwind, utility, class, variant, theme, token, clsx, cn, tailwind-merge, 样式, 主题, 变体, 工具类"
argument-hint: "[UI 目标] [主题或变体需求] [约束]"
---

# tailwind

聚焦 Tailwind utility 编写、主题化能力与样式复用设计的技能卡。

## 核心原则

- 使用官方 Tailwind utility 命名和标准写法，避免伪 Tailwind 类名。
- 可复用组件中避免写死主题相关视觉值，优先使用 tokens、CSS variables、variant maps 或共享样式预设。
- 重复 utility 组优先提取为 reusable variants、helpers 或常量，而不是复制长字符串。
- 仅在标准 scale 或项目 token 无法表达时使用 arbitrary values。
- utility strings 保持稳定、有序、可审查；条件拼接优先使用项目已有的 `cn`、`clsx`、`tailwind-merge` 等方案。

## 设计与执行流程

使用此 skill 时，按以下顺序执行：

1. 判断当前任务是一次性样式，还是需要长期复用的组件样式 API。
2. 区分结构类、交互类和主题敏感类，避免把颜色和皮肤决策硬编码进叶子组件。
3. 将重复 utility 组提取为 variants、helpers 或共享样式映射。
4. 统一命名、排序和拼接方式，清理临时或随意写法。
5. 检查结果是否便于未来主题、品牌或变体扩展。

## 输出与检查项

- utility 是否使用了官方命名和稳定排序。
- 是否存在应被抽象掉的主题敏感类或硬编码视觉值。
- 是否应优先使用 tokens、CSS variables、variant maps 或共享样式预设。
- 重复 utility 组是否已经提取，条件拼接是否仍然可读。
- arbitrary values 是否合理，还是应替换为标准 utility 或 token。

## 示例输入

- `重构这个 Tailwind 组件，让颜色更适合主题化，class strings 更易维护。`
- `审查这些 Tailwind classes，把硬编码配色改成更灵活的 token 方案。`
- `设计一个可复用的 Tailwind 按钮 API，包含清晰 variants 和有序 utilities。`
- `把这个 TSX 文件里的 Tailwind utilities 规范到官方命名和可读排序。`