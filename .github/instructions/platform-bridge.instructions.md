---
description: "Use when editing platform bridges, workspace storage adapters, project storage, map storage, asset URL resolution, or browser and desktop integration. Covers PlatformBridge boundaries and host-specific API rules."
name: "Platform Bridge Boundaries"
applyTo: "src/platform/**/*.ts, src/workspace/**/*.ts, src/game/project/**/*.ts, src/game/workspace/**/*.ts"
---
# Platform Bridge Boundaries

- Keep browser and desktop capability seams behind `src/platform/`.
- Only `src/platform/desktopBridge.ts` may import Tauri APIs.
- Prefer extending `PlatformBridge` contracts over branching host logic at individual call sites.
- Keep storage, asset loading, and project workflow code dependent on bridge contracts, not direct host APIs.
- Preserve stable data contracts when frontend storage types and backend storage commands evolve together.
