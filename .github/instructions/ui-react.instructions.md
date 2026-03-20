---
description: "Use when editing React UI, hooks, app shell, panels, overlays, settings screens, or Tailwind styling. Covers React Compiler constraints, UI text rules, and repo UI conventions."
name: "UI React Constraints"
applyTo: "src/ui/**/*.tsx, src/App.tsx, src/main.tsx"
---
# UI React Constraints

- React Compiler is enabled. Do not add `useMemo`, `useCallback`, or `React.memo`.
- Keep runtime text in English only.
- Follow the existing clean, minimal UI direction unless the user asks for a redesign.
- Use modern Tailwind syntax.
- Prefer focused components and hooks over large mixed UI files.
- Keep UI state and engine state boundaries clear.