# AI Development Guide

Project-specific supplement to `.github/copilot-instructions.md`.

## Rules

- Keep this document concise. Add only durable project rules, and prefer short bullets over explanations.
- Add durable project rules here proactively when they emerge during development.
- When legacy code or feature design is materially flawed, AI agents may redesign and refactor it when that yields better correctness, maintainability, or workflow boundaries; do not preserve the old design merely because it exists.
- Keep AI-led redesigns focused: explain the design change, preserve intended user-facing behavior, and verify the affected workflows.
- Keep all project UI in a compact, serious editor-style desktop application aesthetic; avoid web-page or card-grid presentation patterns.
- Keep platform-specific behavior behind `src/platform/` capabilities; app code must not call native command names directly.
- Store editable terrain as v5 sparse virtual height pages under `terrain/height/pages`; manifest paths are derived from page keys and no legacy map-format compatibility should be added unless explicitly requested.
- Use English for all new or modified project text: UI copy, docs, test names, logs, errors, config descriptions, fixture text, file names, and asset metadata.
- Keep existing non-English text unchanged unless localization work requires touching it.
- Use clear English code identifiers.
- Write new or modified code comments in both English and Chinese.
- Comment important code when intent, constraints, risks, or invariants are not obvious. This includes algorithms, rendering or GPU decisions, persistence, migrations, platform bridges, scheduling, security-sensitive paths, and domain rules.
- Do not add comments that merely restate obvious syntax.

## Comment Format

```ts
// EN: Keep the terrain seed stable so saved maps reproduce the same height field.
// 中文: 保持地形种子稳定，确保已保存地图能复现相同高度场。
const terrainSeed = project.map.seed;
```

## Self-Check

Before finishing, verify that new text is English, important changed code has useful bilingual comments, and this guide stays short.

