# Game Structure

## Recommended Layout

- `app/`: high-level bootstrapping and runtime composition
- `gameplay/`: ECS, player systems, input, and prefabs
- `editor/`: authoring tools and editor-only runtime helpers
- `workspace/`: map/project persistence contracts and storage flows
- `settings/`: runtime settings data and patch helpers
- `world/`: terrain, sky, and world-space systems
- `core/`: low-level rendering, scheduling, and GPU infrastructure

## Why This Split

- `app/` is where engine pieces are assembled.
- `gameplay/` groups runtime behavior by domain rather than by implementation style.
- `workspace/` keeps storage and project flows out of gameplay and editor logic.
- `world/` keeps terrain and sky together as environment systems.
- `core/` remains the low-level utility layer used by higher domains.

## Compatibility Rule

- Old root-level entry files can remain as thin re-export shims during migration.
- New code should prefer domain paths such as `@game/app/GameApp` or `@game/workspace`.