# Runtime Separation

## Goal

- Keep the shared WebGPU runtime reusable.
- Keep editor-only workflow outside the standalone game shell.
- Keep native desktop capabilities behind a replaceable platform bridge.

## Current Seams

- App target seam:
  - `src/App.tsx` resolves the target through `VITE_APP_TARGET` or `?target=editor|game`.
  - `editor` target mounts `src/ui/EditorView.tsx`.
  - `game` target mounts `src/ui/PlayerView.tsx`.

- Platform seam:
  - All native integration now goes through `src/platform/`.
  - `src/platform/desktopBridge.ts` is the only place allowed to import Tauri APIs.
  - `src/platform/browserBridge.ts` is the placeholder for browser-native replacements.

- Storage seam:
  - `ProjectStorage`, `MapStorage`, and `TextureStorage` depend on `PlatformBridge`, not on Tauri packages.
  - Terrain texture loading and star texture loading resolve asset URLs through the same bridge.

- UI seam:
  - `SettingsPanel` filters tabs by app target.
  - File and editor tabs are editor-only.
  - Runtime settings tabs stay shared between editor and game shells.

- Editor workspace seam:
  - `src/ui/hooks/useEditorWorkspace.ts` owns project selection, recent projects, open/save flows, and the current editor session path.
  - `GameView` now consumes that controller instead of hosting project workflow state inline.
  - `MapImportScreen`, `FileTab`, and close-confirmation logic call into the same workspace controller.

## Rules

- Do not import Tauri packages outside `src/platform/`.
- When a new native capability is needed, extend `PlatformBridge` first.
- Keep editor boot flow, project selection, and save workflows in the editor target.
- Keep project workflow orchestration in the editor workspace layer instead of duplicating it in panels or screens.
- Keep the standalone game target free of project-management UI.
- For browser support, replace bridge methods instead of branching business logic per call site.

## Browser Port Plan

- Implement browser-safe file/project persistence behind `browserBridge` or a second web adapter.
- Keep project/map/texture contracts stable so the frontend does not care whether storage is Rust, IndexedDB, remote API, or another host.
- If browser asset loading needs remapping, add that logic in `resolveAssetUrl` rather than in terrain or sky systems.

## Maintenance

- Update this document whenever a new target, platform capability, or storage contract is introduced.
- If a feature is desktop-only for now, document that limitation in the bridge layer instead of spreading checks across UI or gameplay code.