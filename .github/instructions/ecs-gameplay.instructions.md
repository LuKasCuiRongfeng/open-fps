---
description: "Use when editing ECS components, gameplay systems, scheduling, player input, prefabs, or other game-runtime logic. Covers ECS boundaries, system order, and separation from rendering, UI, and storage concerns."
name: "ECS Gameplay Boundaries"
applyTo: "src/game/ecs/**/*.ts, src/game/gameplay/**/*.ts, src/game/systems/**/*.ts, src/game/input/**/*.ts, src/game/prefabs/**/*.ts, src/game/scheduling/**/*.ts"
---
# ECS Gameplay Boundaries

- Keep components pure-data where practical and keep systems stateless.
- Preserve runtime phase ordering: input -> gameplay -> physics -> render.
- Keep gameplay logic, rendering logic, UI state, and platform or storage concerns separated.
- Put shared tunables in config files instead of scattering magic numbers through systems.
- Prefer small focused systems and helpers over large mixed runtime files.
