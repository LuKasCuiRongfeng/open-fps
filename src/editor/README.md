# Editor Runtime Structure

## Purpose

`src/editor/` contains editor-only runtime orchestration, editing tools, and editor settings. It can depend on `src/game/` runtime APIs, but `src/game/` must stay free of `@editor/*` imports.

## Layout

- `app/`: editor app session that extends the game runtime with authoring behavior
- `runtime/`: terrain editing, texture painting, brush raycasting, and brush indicator systems
- `settings.ts`: editor-only settings layered on top of game runtime settings

## Boundary Rule

- Put terrain data contracts needed by the game renderer or terrain system under `src/game/world/terrain/`.
- Put authoring controls, editor cameras, brush UI state, and save/load editor orchestration under `src/editor/`.