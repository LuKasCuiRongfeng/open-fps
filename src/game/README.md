# Game Structure

## Recommended Layout

- `app/`: high-level bootstrapping and runtime composition
- `main.tsx`: standalone game frontend application entry
- `ui/`: standalone player shell and game boot hooks
- `rendering/`: renderer lifecycle and frame instrumentation
- `gpu/`: low-level WebGPU and atlas helpers
- `scheduling/`: system execution orchestration
- `gameplay/`: ECS, player systems, input, and prefabs
- `settings/`: runtime settings data and patch helpers
- `world/`: terrain, sky, and world-space systems
- `workspace/`: read-only bundled project loading for standalone game data
- `core/`: temporary compatibility layer for legacy imports and leftover utilities

## Why This Split

- `app/` is where engine pieces are assembled.
- `rendering/`, `gpu/`, and `scheduling/` make infrastructure responsibilities explicit instead of hiding them under a broad `core/` label.
- `gameplay/` groups runtime behavior by domain rather than by implementation style.
- Editor runtime code lives under `src/editor/` and may depend on `src/game/`; `src/game/` must not depend on editor modules.
- Workspace storage lives under `src/workspace/` and keeps project flows out of gameplay.
- `world/` keeps terrain and sky together as environment systems.
- `core/` should shrink over time until only shims or truly cross-domain leftovers remain.

## Boundary Rule

- Game code must not import `@editor/*` or editor UI modules.
- New code should prefer domain paths such as `@game/app/GameApp`, `@game/gpu`, or `@game/rendering`.
- Project selection, save/import workflows, editor panels, and authoring controls belong under `src/editor/`.
- Standalone game startup reads bundled project data; it must not open editor project-selection or save workflows.