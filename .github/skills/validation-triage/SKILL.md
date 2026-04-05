---
name: validation-triage
description: 'Use for pnpm lint, pnpm tsc --noEmit, grouped TypeScript or lint failures, import and path alias issues, type regressions, and root-cause validation fixes.'
argument-hint: 'Describe the failing command, main error cluster, and suspected root cause if known.'
---

# Validation Triage

## Use For

- `pnpm lint` failures
- `pnpm tsc --noEmit` failures
- Large error bursts after a refactor
- Import, path alias, typing, or contract regressions

## Check

1. Group errors by root cause before editing.
2. Fix shared imports, public types, and broken contracts before file-local symptoms.
3. Prefer API and type corrections over suppressions, casts, or temporary workarounds.
4. Re-run the relevant validation command after each logical fix group.
5. After the issue is resolved, remove temporary debug code, fallback code, and failed-attempt leftovers.

## Output

- Resolve the smallest root cause that collapses the most errors.
- Leave the codebase cleaner than it was during the failing intermediate state.
