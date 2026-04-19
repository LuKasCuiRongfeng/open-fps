---
name: tailwind
description: For general-purpose Tailwind CSS usage, component styling, utility-class organization, theming, variant design, and code review. Use this skill when the task involves Tailwind class authoring, refactoring utility strings, building reusable style APIs, or keeping Tailwind code theme-ready and maintainable.
argument-hint: "[UI goal] [theme or variant needs] [constraints]"
---

# tailwind

Use this skill for general-purpose Tailwind CSS work.

## What This Skill Helps With

- Tailwind utility class authoring and refactoring.
- Reusable component style API design with variants and states.
- Multi-theme-ready styling based on semantic tokens rather than fixed visual choices.
- Utility string cleanup, normalization, and ordering.
- Review of Tailwind code for maintainability, consistency, and future theming flexibility.

## When To Use This Skill

- The task involves Tailwind utility classes in HTML, JSX, TSX, Vue, Svelte, or template files.
- The user asks for Tailwind refactoring, cleanup, theming, or style API design.
- The code uses long utility strings that need to be normalized, grouped, or made reusable.
- The UI may need to support multiple themes, brands, skins, or runtime visual variants.

## When Not To Use This Skill

- The project does not use Tailwind CSS.
- The styling task is primarily about non-Tailwind systems such as plain CSS modules, Sass architecture, or CSS-in-JS with no Tailwind layer.

## Default Technical Baseline

- Use official Tailwind utility names and standard Tailwind conventions.
- Prefer utilities that follow Tailwind's documented scale, naming, and variant syntax.
- Keep utility strings readable, stable, and consistently ordered.
- Design class composition so theme-specific appearance is not hardcoded into leaf components.
- Prefer semantic tokens, shared variants, and CSS variables for theme-sensitive values.

## Required Tailwind Rules

- Classes must use official Tailwind naming and recommended standard utilities.
- Do not invent pseudo-Tailwind class names or inconsistent shorthand patterns.
- Do not hardcode theme-specific visual classes directly into component implementations when those values may change across themes.
- Prefer semantic indirection such as CSS variables, shared token classes, component variants, or mapped style presets.
- Use arbitrary values only when the standard Tailwind scale or project token system cannot express the requirement cleanly.
- Keep class ordering clean and stable instead of leaving utility strings in a random order.

## Theming Rules

- Assume multi-theme support may be required unless the user explicitly says otherwise.
- Avoid baking fixed palette decisions such as `bg-white`, `text-black`, or one-off brand colors into reusable components unless they are genuine invariants.
- Prefer theme-ready patterns such as semantic color tokens, `data-theme` or state selectors, CSS custom properties, and centralized variant maps.
- If the same component needs multiple visual styles, expose variants instead of duplicating nearly identical utility strings.
- Keep structure, spacing, layout, and interaction utilities separate from theme-sensitive color and surface decisions whenever practical.

## Utility Composition Rules

- Prefer shared composition helpers already used by the project, such as `cn`, `clsx`, or `tailwind-merge`, when conditional class assembly is needed.
- Keep repeated utility groups in reusable constants, helpers, or variant definitions instead of copy-pasting long class strings.
- Do not bury business logic inside unreadable class concatenation.
- Keep utility strings deterministic so reviews and diffs stay readable.

## Class Ordering Rules

- Order classes consistently.
- Group utilities from broad layout to fine visual detail when no project-specific sorter exists.
- Keep related utilities adjacent, such as layout, spacing, sizing, typography, color, effects, and state modifiers.
- If the project already uses an automatic class sorter or formatter, follow that output instead of inventing a manual alternative.

## Execution Workflow

When using this skill, follow this sequence:

1. Identify whether the code is one-off styling or a reusable component style API.
2. Separate structure and behavior classes from theme-sensitive visual classes.
3. Replace hardcoded theme decisions with semantic tokens, variables, or variant mappings where needed.
4. Normalize utilities to official Tailwind naming and remove ad hoc patterns.
5. Extract repeated class groups into reusable helpers or variants.
6. Reorder utilities into a stable, readable sequence.
7. Review whether the result stays flexible for future themes and variants.

## Output Requirements

When you generate an answer, code change, design proposal, or review, include the following whenever relevant:

- Whether the utilities use official Tailwind naming.
- Whether any theme-sensitive classes are hardcoded and should be abstracted.
- Which theming mechanism is recommended, such as tokens, CSS variables, or variant maps.
- Whether repeated utility groups should be extracted.
- Whether the final utility ordering is clean and stable.
- Whether arbitrary values are justified or should be replaced with standard utilities or tokens.

## Review Checklist

- Do the classes use official Tailwind utility names?
- Are nonstandard or invented class patterns avoided?
- Are theme-sensitive colors and surfaces abstracted instead of hardcoded into reusable components?
- Is the solution flexible enough for multiple themes or future branding changes?
- Are repeated utility groups extracted for reuse?
- Are class strings ordered cleanly and consistently?
- Are arbitrary values used only when justified?
- Is conditional class composition readable rather than tangled?

## Example Inputs

- `Refactor this Tailwind component so colors are theme-ready and class strings are easier to maintain.`
- `Review these Tailwind classes and replace hardcoded palette choices with a flexible token-based approach.`
- `Design a reusable Tailwind button API with clean variants and sorted utilities.`
- `Normalize this TSX file's Tailwind utilities to official naming and readable ordering.`

## Expected Behavior

- Use official Tailwind naming and standard utility conventions.
- Avoid hardcoded theme-dependent classes in reusable code.
- Prefer semantic, token-driven, and variant-friendly styling patterns.
- Keep utility strings ordered, readable, and easy to review.
- Produce Tailwind code that stays flexible when themes or design tokens evolve.