# UI Layer

## Purpose

`src/ui/` contains shared React overlays and settings panels used by the editor and game targets.

## Key Entry Points

- `../editor/ui/EditorView.tsx`: editor runtime shell and editor-only workflow UI
- `../game/ui/PlayerView.tsx`: standalone game shell
- `settings/`: shared runtime settings UI
- `FpsCounter.tsx` and `LoadingOverlay.tsx`: shared runtime overlays

## Boundaries

- Keep project-management UI in the editor target only.
- Keep standalone game UI free of project selection, file tabs, and save or import workflow.
- Route editor workspace actions through `useEditorWorkspace` instead of duplicating workflow state across screens.
- Keep UI state separate from engine, rendering, and storage implementation details.
- Prefer changing shared hooks or controllers before patching multiple UI screens independently.

## Common Changes

- Change editor project workflow: start from `../editor/ui/hooks/useEditorWorkspace.ts` and the components that consume its controller.
- Change editor boot or runtime interaction: inspect `../editor/ui/EditorView.tsx`, `useEditorApp.ts`, and related editor hooks together.
- Change standalone game behavior: start from `../game/ui/PlayerView.tsx` and game hooks, not editor screens.
- Add a new panel or settings surface: keep target-specific UI in the correct subtree and reuse shared settings UI only when the workflow is shared.
