# Editor Runtime Structure

## Purpose

`src/editor/` contains the editor app entry, editor-only UI, runtime orchestration, editing tools, and editor settings. It can depend on `src/game/` runtime APIs, but `src/game/` must stay free of `@editor/*` imports.

## Layout

- `main.tsx`: editor frontend application entry
- `app/`: editor app session that extends the game runtime with authoring behavior
- `runtime/`: terrain editing, texture painting, brush raycasting, and brush indicator systems
- `ui/`: project workflow, editor panels, settings tabs, and editor hooks
- `settings.ts`: editor-only settings layered on top of game runtime settings

## Boundary Rule

- Put terrain data contracts needed by the game renderer or terrain system under `src/game/world/terrain/`.
- Put authoring controls, editor cameras, brush UI state, and save/load editor orchestration under `src/editor/`.