# Open-FPS

Open-FPS 是一个开放世界 FPS 项目，核心是共享 WebGPU 运行时、分离的编辑器/游戏目标，以及面向大地图生产的 GPU-first 地形与世界分区工作流。

渲染使用 Three.js WebGPU。前端使用 React、TypeScript、Tailwind 和 Vite。桌面打包使用 Tauri 和 Rust。

## 项目结构

- `editor.html`: 编辑器前端入口。
- `game.html`: 游戏前端入口。
- `src/editor/`: 编辑器应用入口、UI、创作运行时和编辑器设置。
- `src/game/`: 游戏应用入口、UI、ECS、系统、世界与 GPU 运行时。
- `src/config/`: 共享常量与调参项。
- `src/platform/`: 浏览器与桌面平台能力边界。
- `kunlun_wilds/`: 正式默认资产项目，显示名为 `Kunlun Wilds`，取自中国神话昆仑意象。
- `src-tauri/`: Tauri 后端与原生集成。
- `AI_DEVELOPMENT_GUIDE.md`: 项目级 AI 开发规则。

## 开发

```bash
pnpm install
```

Copilot workspace prompt：

```text
/update-dep [--rust] [--js] [--conservative] [--aggressive]
/git-push [--lang=zh|en] [--message=custom message] [--force]
```

使用 `/update-dep` 在应用升级前审查依赖更新。`--rust` 只审查 `src-tauri/` Rust 依赖，`--js` 只审查 `package.json`，默认同时审查两者。`--conservative` 只应用明确安全的升级，`--aggressive` 会把选定范围升级到最新稳定版本。没有模式参数时，prompt 会先报告安全/高风险升级并在当前对话里询问策略。

使用 `/git-push` 检查当前 git 变更、准备提交信息、提交并推送。`--lang` 控制生成英文或中文提交信息，默认 `en`。`--message` 会直接使用自定义提交信息。省略 `--message` 时，prompt 会生成提交信息并在当前对话里询问选择。`--force` 表示跳过确认直接提交推送，不表示 `git push --force`。

前端：

```bash
pnpm web dev editor
pnpm web dev game
pnpm web build all
```

编辑器和游戏目标使用独立 HTML 与 TypeScript 入口。编辑器构建输出 `dist-editor/editor.html`；游戏构建输出 `dist-game/game.html`。
独立游戏目标从 `/game-data/kunlun_wilds/` 加载只读项目数据，该目录在 game build 时由工作区 `kunlun_wilds/` 复制。
`kunlun_wilds/maps/main/generation/graph.json` 是默认 world generation graph source sidecar，记录生成阶段、依赖、executor、局部重建 scope、预算和 cooked source hash。

地图生成与局部 cooked 重建：

```bash
pnpm gen:all -- --map main --force
pnpm cook:map -- --map main --plan --changed-stage terrain --terrain-region "0,0"
pnpm cook:map -- --map main --changed-stage collision --cell "0,0"
```

`--plan` 只输出 rebuild dry-run，不写 cooked 资产。`--changed-stage` 会按 generation graph 计算下游 stage closure；`--stage` 可指定只重建某个目标 stage。PowerShell 中 region/cell key 建议加引号，例如 `"0,0"`。

桌面：

```bash
pnpm dev
pnpm dev:game
pnpm desktop build editor
pnpm desktop build game
pnpm build
```

桌面打包为 editor 和 game 使用独立 Tauri 配置、窗口标签、二进制名和 Rust 入口。
请运行目标封装命令，不要直接运行裸 `pnpm tauri dev`；Cargo 需要封装脚本选择 `open-fps-editor` 或 `open-fps-game`。

目标封装命令：

```bash
pnpm web <dev|build> <editor|game|all>
pnpm desktop <dev|build|debug|release> <editor|game|all>
```

`all` 只支持 build 类命令，不支持 dev server。

验证：

```bash
pnpm lint
pnpm test
pnpm tsc --noEmit
pnpm validate:map
pnpm verify
```

## 架构

平台边界见 `src/platform/README.md`，目标级 UI 边界见 `src/ui/README.md`。开放世界长期路线见 `OPEN_WORLD_ROADMAP.md`，默认地图内容规格见 `OPEN_WORLD_DESIGN_SPEC.md`。

## 发布

- 推送到 `master` 会运行 CI。
- 推送 `v*` tag 会创建 release build。
- Git tag 是发布版本号的事实来源。

示例：

```bash
git tag v0.1.1
git push origin v0.1.1
```
