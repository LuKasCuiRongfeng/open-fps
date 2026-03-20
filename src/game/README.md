# Game Structure

## Recommended Layout

- `app/`: high-level bootstrapping and runtime composition
- `rendering/`: renderer lifecycle and frame instrumentation
- `gpu/`: low-level WebGPU and atlas helpers
- `scheduling/`: system execution orchestration
- `gameplay/`: ECS, player systems, input, and prefabs
- `editor/`: authoring tools and editor-only runtime helpers
- `workspace/`: map/project persistence contracts and storage flows
- `settings/`: runtime settings data and patch helpers
- `world/`: terrain, sky, and world-space systems
- `core/`: temporary compatibility layer for legacy imports and leftover utilities

## Why This Split

- `app/` is where engine pieces are assembled.
- `rendering/`, `gpu/`, and `scheduling/` make infrastructure responsibilities explicit instead of hiding them under a broad `core/` label.
- `gameplay/` groups runtime behavior by domain rather than by implementation style.
- `workspace/` keeps storage and project flows out of gameplay and editor logic.
- `world/` keeps terrain and sky together as environment systems.
- `core/` should shrink over time until only shims or truly cross-domain leftovers remain.

## Compatibility Rule

- Old root-level entry files can remain as thin re-export shims during migration.
- New code should prefer domain paths such as `@game/app/GameApp`, `@game/gpu`, or `@game/rendering`.