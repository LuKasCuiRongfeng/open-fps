---
name: react
description: For React architecture design, component implementation, refactoring, debugging, code review, and performance optimization. Use this skill when the task involves React components, hooks, rendering behavior, state management, composition, reuse, React Compiler compatibility, or reducing unnecessary re-renders. Prefer the latest stable React APIs and modern React patterns.
argument-hint: "[feature or component goal] [performance target] [constraints]"
---

# react

Use this skill for general-purpose React work.

## What This Skill Helps With

- React component architecture and implementation.
- Refactoring large components into smaller reusable units.
- Rendering behavior analysis and unnecessary re-render reduction.
- Hook usage, component composition, and state organization.
- React Compiler-compatible coding patterns.
- Code review and optimization for maintainability and UI performance.

## When To Use This Skill

- The task involves React components, hooks, JSX or TSX files, client-side rendering, or interactive UI behavior.
- The user asks for React refactoring, optimization, performance review, or component decomposition.
- The user asks how to structure a React feature for reuse, readability, or lower re-render cost.
- The user asks which React APIs or patterns should be used in a modern codebase.

## When Not To Use This Skill

- The task is framework-agnostic frontend work with no React-specific behavior.
- The code is primarily server-only logic or non-React UI technology.

## Default Technical Baseline

- Prefer the latest stable React APIs and modern React patterns.
- Prefer `lucide-react` for general-purpose icon usage unless the project already standardizes on another icon set.
- Prefer `shadcn/ui` or Radix UI primitives for component building blocks when a component library is needed.
- If the project enables React Compiler, avoid manual caching hooks such as `useMemo` and `useCallback` unless there is a measured and justified need.
- Do not add memoization hooks by default just because a component looks complex.
- Optimize each component to minimize unnecessary re-renders.
- Pay close attention to dependency-driven repeated execution, especially repeated `useEffect` runs and rerenders caused by unstable dependencies.
- Split components by responsibility so they stay understandable, reusable, and easy to optimize.
- Keep each component file under 800 lines whenever practical. If a component approaches that size, split it.

## Required React Rules

- Prefer current standard React APIs over legacy patterns.
- Avoid deprecated or legacy React APIs.
- Prefer clear component boundaries with focused responsibilities.
- Prefer reuse through composition instead of copy-paste variants.
- Prefer established ecosystem primitives over reinventing common UI building blocks from scratch.
- Keep state as local as practical and avoid lifting state higher than necessary.
- Design props and state flow to avoid avoidable parent-to-child re-render cascades.
- Be careful with effect dependencies, derived objects, inline functions, and unstable references that can cause repeated execution.

## React Compiler Rules

- If React Compiler is enabled, treat it as the default optimization path.
- Do not reach for `useMemo`, `useCallback`, or similar caching hooks unless profiling or a clear hotspot justifies them.
- Do not add cache hooks as ritual boilerplate.
- When optimization is needed, first improve component boundaries, state placement, render scope, and data flow before adding manual memoization.

## Performance And Rendering Strategy

- Reduce unnecessary re-renders at the architecture level first.
- Prefer splitting expensive UI regions into smaller components with narrower update surfaces.
- Keep derived values simple and colocated with the logic that needs them.
- Avoid unnecessary object recreation, unstable props, and broad state updates when they trigger expensive subtree re-renders.
- Review dependency arrays carefully and prevent effect loops or repeated work caused by changing references.
- Treat repeated `useEffect` execution, redundant async requests, and state updates that retrigger the same effect as core optimization problems.
- Use the latest React APIs for transitions, deferred rendering, and event handling when they solve a real rendering problem.

## Component Design Strategy

- Each component should have one clear responsibility.
- Extract repeated UI patterns into reusable components or hooks.
- Extract non-UI business logic into hooks or helper modules when it improves reuse and readability.
- Keep components short enough to reason about quickly.
- If a component grows toward 800 lines, split layout, state logic, effects, and subviews into separate units.

## Execution Workflow

When using this skill, follow this sequence:

1. Identify the component boundaries and the feature responsibilities.
2. Check whether React Compiler is enabled and adjust hook strategy accordingly.
3. Choose the simplest modern React APIs that solve the problem.
4. Design state placement and prop flow to reduce unnecessary re-renders.
5. Inspect effect dependencies and reference stability to prevent repeated execution and effect loops.
6. Split oversized or mixed-responsibility components into reusable parts.
7. Review whether manual memoization is actually needed or should be removed.
8. Produce the implementation or review with performance, reuse, and maintainability in balance.

## Output Requirements

When you generate an answer, code change, design proposal, or review, include the following whenever relevant:

- The recommended component structure.
- Whether `lucide-react`, `shadcn/ui`, or Radix UI should be preferred for the task.
- Whether the design reduces unnecessary re-renders and how.
- Whether any `useEffect` or dependency list is likely to cause repeated execution.
- Whether React Compiler affects hook choices.
- Whether `useMemo`, `useCallback`, or other caching hooks should be avoided or justified.
- Which modern React APIs should be used.
- Whether a component should be split for reuse, readability, or performance.
- Whether any component or file is too large and should be broken up.

## Review Checklist

- Does the solution use current standard React APIs?
- Are deprecated or legacy React APIs avoided?
- Does it prefer `lucide-react` for icons unless the project already has a different standard?
- Does it prefer `shadcn/ui` or Radix UI primitives when a component library is needed?
- If React Compiler is enabled, are `useMemo` and similar caching hooks avoided unless justified?
- Does the component structure minimize unnecessary re-renders?
- Are `useEffect` dependencies stable and free from accidental repeated execution patterns?
- Are derived objects, inline callbacks, or state updates causing avoidable reruns or rerenders?
- Is state placement narrow enough to avoid broad render fan-out?
- Are repeated patterns extracted for reuse?
- Are responsibilities split clearly across components and hooks?
- Is any component file approaching or exceeding 800 lines?
- Is manual memoization used only when it has a real and explainable benefit?

## Example Inputs

- `Refactor this React dashboard into smaller reusable components and reduce unnecessary re-renders.`
- `Review this React codebase and focus on React Compiler compatibility and unnecessary useMemo usage.`
- `Design a modern React form flow with good component boundaries and low render overhead.`
- `Split this oversized TSX component into reusable parts and keep behavior unchanged.`

## Expected Behavior

- Prefer modern stable React APIs.
- Prefer `lucide-react` for icons unless an existing project convention overrides it.
- Prefer `shadcn/ui` or Radix UI when reusable UI primitives or a component library are needed.
- If React Compiler is enabled, avoid manual cache hooks unless they are clearly justified.
- Reduce unnecessary re-renders through better component structure and state placement.
- Watch for dependency-update bugs that cause repeated `useEffect` execution, repeated async work, or avoidable rerenders.
- Keep components focused, reusable, and reasonably small.
- Treat components approaching 800 lines as refactoring candidates.