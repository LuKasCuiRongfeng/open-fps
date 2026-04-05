---
name: editor-workspace-flow
description: 'Use for editor workspace flows: project selection, recent projects, open and save, import flows, current session path, map import screens, file tabs, and editor-only workflow orchestration.'
argument-hint: 'Describe the editor workflow, affected UI or workspace files, and what state or file flow needs to change.'
---

# Editor Workspace Flow

## Use For

- Project selection or recent-project changes
- Open, save, close, or import workflow changes
- Editor workspace controller refactors
- UI flows that touch current project or session state

## Check

1. Start from the workspace controller and current source of truth before editing UI screens.
2. Keep project-management workflow in the editor target and workspace layer, not in the standalone game target.
3. Route UI actions through shared workspace orchestration instead of duplicating save or open logic across components.
4. Preserve consistent handling of current project path, recent projects, dirty state, and confirmation flows.
5. If the change touches storage and UI together, update both sides of the contract in the same change.
6. Validate with `pnpm tsc --noEmit` after changing shared workspace state or contracts.

## Output

- Keep the workflow centralized and editor-only where appropriate.
- Prefer one clear source of truth over mirrored state across screens or hooks.
