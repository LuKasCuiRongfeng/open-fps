# Platform Layer

## Purpose

`src/platform/` isolates host-specific capabilities behind one platform host so shared app code does not depend directly on Tauri APIs, browser-only APIs, or native command names.

## Key Files

- `types.ts`: `PlatformHost` contract and shared platform-facing types
- `desktopBridge.ts`: desktop implementation and the only place allowed to import Tauri APIs or native command names
- `browserBridge.ts`: browser implementation for web dialogs, file import/export, asset URLs, and graceful unsupported project workspace methods
- `index.ts`: runtime selection and public entrypoints

## Rules

- Add new host-specific behavior through `dialogs`, `files`, `projects`, or `window` first.
- Do not import Tauri packages outside `src/platform/desktopBridge.ts`.
- Do not call Tauri command names outside `src/platform/desktopBridge.ts`.
- Prefer replacing capability methods per host instead of branching host logic across callers.
- Keep asset URL resolution, dialogs, file access, project workspace, and window lifecycle concerns inside the platform layer.
- Keep native command registration target-specific: the editor Tauri binary owns project/file/PNG authoring commands, while the game binary should stay free of editor project commands.

## Common Changes

- Add a new platform capability: update `types.ts`, implement each host adapter, then expose it through `getPlatform()`.
- Add browser support for an existing feature: implement the browser-side capability instead of modifying every caller.
- Fix asset loading: start with `platform.files.resolveAssetUrl` before changing terrain, sky, or UI code.

## Related Docs

- See `AI_DEVELOPMENT_GUIDE.md` for project-wide AI development rules.
