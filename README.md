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

Copilot workspace prompt:

```text
/update-dep [--rust] [--js] [--conservative] [--aggressive]
/git-push [--lang=zh|en] [--message=custom message] [--force]
```

Use `/update-dep` to review dependency upgrades before applying them. `--rust` limits the review to `src-tauri/` Rust dependencies, `--js` limits it to `package.json`, and the default reviews both. `--conservative` applies only clearly safe upgrades without asking again. `--aggressive` upgrades the selected scope to the latest stable versions without asking again. If neither mode flag is present, the prompt reports safe versus risky upgrades and asks you to choose a strategy in the current conversation before making any change.

Use `/git-push` to inspect current git changes, prepare a commit message, commit, and push. `--lang` controls whether the generated message is English or Chinese and defaults to `en`. `--message` uses your custom commit message directly. If `--message` is omitted, the prompt generates a commit message and asks for your choice in the current conversation. `--force` skips that confirmation step and commits and pushes immediately. It does not mean `git push --force`.

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
