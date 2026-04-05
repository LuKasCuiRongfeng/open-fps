# UI Layer

## Purpose

`src/ui/` contains the React shells for editor and game targets, shared overlays, settings panels, and editor-facing workflow UI.

## Key Entry Points

- `EditorView.tsx`: editor runtime shell and the entry point for editor-only workflow UI
- `PlayerView.tsx`: standalone game shell
- `GameView.tsx`: compatibility wrapper that currently re-exports the editor shell
- `editor/`: editor-only panels, project screens, tabs, and editor hooks
- `settings/`: shared runtime settings UI
- `hooks/`: shared app boot hooks such as the standalone game app hook

## Boundaries

- Keep project-management UI in the editor target only.
- Keep standalone game UI free of project selection, file tabs, and save or import workflow.
- Route editor workspace actions through `useEditorWorkspace` instead of duplicating workflow state across screens.
- Keep UI state separate from engine, rendering, and storage implementation details.
- Prefer changing shared hooks or controllers before patching multiple UI screens independently.

## Common Changes

- Change editor project workflow: start from `editor/hooks/useEditorWorkspace.ts` and the components that consume its controller.
- Change editor boot or runtime interaction: inspect `EditorView.tsx`, `useEditorApp.ts`, and related editor hooks together.
- Change standalone game behavior: start from `PlayerView.tsx` and shared game hooks, not editor screens.
- Add a new panel or settings surface: keep target-specific UI in the correct subtree and reuse shared settings UI only when the workflow is shared.

## Related Docs

- See `docs/runtime-separation.md` for target-level UI boundaries.
- See `.github/skills/editor-workspace-flow/SKILL.md` for editor workflow changes.
