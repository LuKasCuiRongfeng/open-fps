# Development Log

## 2026-03-30

### Terrain Generation
- Added `scripts/generate-terrain-map.mjs` to generate a full battleground-style terrain offline.
- Added package scripts for direct generation into `test_pro`.
- Replaced manual test terrain generation with deterministic chunked output.
- Added four PUBG-inspired presets for rapid multi-map project bootstrapping.
- Added a shared-texture `texture.json` setup for `test_pro/maps/main` using project-level terrain assets.
- Added matching shared-texture `texture.json` files for the other generated test maps.
- Updated the shared terrain texture references after replacing the test project texture files with PNG ARM and normal maps.
- Added `scripts/generate-default-splatmaps.mjs` and generated height-driven default `splatmap.png` files for all `test_pro` maps.

### Multi-Map Hard Cut
- Switched project metadata to version 2 with `currentMapId` and `maps`.
- Defined map storage layout as `maps/<map-id>/map.json` and `maps/<map-id>/texture.json`.
- Removed legacy root `map.json` fallback from Tauri commands.
- Split editor save state into project-level metadata and map-level data.
- Added editor-side map switching and new-map creation from the current editor state.
- Fixed texture brush routing so layers beyond the first splat map paint the correct global layer.

### Next
- Add map creation helpers beyond duplicate-from-current if the editor later needs blank-map templates.
- Decide whether sky and other per-map assets should remain map-scoped or be split into shared project assets.

### Validation
- Regenerated `test_pro` into the new `maps/main/map.json` layout.
- Regenerated `test_pro` with multiple prebuilt battleground-style maps.
- Passed `pnpm tsc --noEmit`.
- Passed `cargo check` in `src-tauri`.