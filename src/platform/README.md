# Platform Layer

## Purpose

`src/platform/` isolates host-specific capabilities behind a replaceable bridge so shared app code does not depend directly on Tauri APIs or browser-only APIs.

## Key Files

- `types.ts`: `PlatformBridge` contract and shared platform-facing types
- `desktopBridge.ts`: desktop implementation and the only place allowed to import Tauri APIs
- `browserBridge.ts`: browser implementation placeholder and future web-safe adapter
- `index.ts`: bridge selection and public entrypoints

## Rules

- Add new native or host-specific capabilities to `PlatformBridge` first.
- Do not import Tauri packages outside `src/platform/desktopBridge.ts`.
- Prefer replacing bridge methods per host instead of branching host logic across callers.
- Keep asset URL resolution, dialogs, file access, and window lifecycle concerns inside the platform layer.

## Common Changes

- Add a new platform capability: update `types.ts`, implement it in `desktopBridge.ts`, then expose it through the platform entrypoint.
- Add browser support for an existing feature: implement the browser-side bridge behavior instead of modifying every caller.
- Fix asset loading: start with `resolveAssetUrl` before changing terrain, sky, or UI code.

## Related Docs

- See `docs/runtime-separation.md` for the higher-level target and platform boundary.
