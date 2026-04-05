# Open-FPS

Open-FPS is an open-world FPS project built around a shared WebGPU runtime, separate editor and game targets, and GPU-driven terrain workflows.

Rendering uses Three.js WebGPU. The frontend uses React, TypeScript, Tailwind, and Vite. Desktop packaging uses Tauri and Rust.

## Project Layout

- `src/`: frontend, rendering, gameplay, editor
- `src/game/`: ECS, systems, world, GPU runtime
- `src/config/`: shared constants and tunables
- `src/platform/`: browser and desktop bridge boundary
- `src-tauri/`: Tauri backend and native integration
- `docs/`: project documentation

## Development

```bash
pnpm install
```

Frontend:

```bash
pnpm dev:editor
pnpm dev:game
pnpm build:editor
pnpm build:game
```

Desktop:

```bash
pnpm tauri:dev:editor
pnpm tauri:dev:game
pnpm tauri:build:editor
pnpm tauri:build:game
```

Validation:

```bash
pnpm lint
pnpm tsc --noEmit
```

## Architecture

See `docs/runtime-separation.md` for target and platform-boundary details.

## Release

- Push to `master` to run CI.
- Push a `v*` tag to create a release build.
- The Git tag is the release version source of truth.

Example:

```bash
git tag v0.1.1
git push origin v0.1.1
```
