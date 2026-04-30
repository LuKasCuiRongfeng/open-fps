# Open-FPS

Open-FPS is an open-world FPS project built around a shared WebGPU runtime, separate editor and game targets, and GPU-driven terrain workflows.

Rendering uses Three.js WebGPU. The frontend uses React, TypeScript, Tailwind, and Vite. Desktop packaging uses Tauri and Rust.

## Project Layout

- `editor.html`: editor frontend entry
- `game.html`: game frontend entry
- `src/editor/`: editor app entry, UI, authoring runtime, and editor settings
- `src/game/`: game app entry, UI, ECS, systems, world, and GPU runtime
- `src/config/`: shared constants and tunables
- `src/platform/`: browser and desktop platform boundary
- `src-tauri/`: Tauri backend and native integration
- `AI_DEVELOPMENT_GUIDE.md`: project-specific AI development rules

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
pnpm web dev editor
pnpm web dev game
pnpm web build all
```

The editor and game targets use separate HTML and TypeScript entries. The editor build writes `dist-editor/editor.html`; the game build writes `dist-game/game.html`.

Desktop:

```bash
pnpm dev
pnpm dev:game
pnpm desktop build editor
pnpm desktop build game
pnpm build
```

Desktop packaging uses separate Tauri configs, window labels, binary names, and Rust entrypoints for editor and game.
Run the target-specific desktop wrapper instead of raw `pnpm tauri dev`; Cargo needs it to select either `open-fps-editor` or `open-fps-game`.

Target wrappers:

```bash
pnpm web <dev|build> <editor|game|all>
pnpm desktop <dev|build|debug|release> <editor|game|all>
```

`all` is supported for build-style commands, not dev servers.

Validation:

```bash
pnpm lint
pnpm tsc --noEmit
```

## Architecture

See `src/platform/README.md` for platform-boundary details and `src/ui/README.md` for target-level UI boundaries.

## Release

- Push to `master` to run CI.
- Push a `v*` tag to create a release build.
- The Git tag is the release version source of truth.

Example:

```bash
git tag v0.1.1
git push origin v0.1.1
```
