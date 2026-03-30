# Copilot Instructions (open-fps)

Keep this file limited to rules that must always be present. Put directory-specific guidance in `.github/instructions/` and task workflows in `.github/skills/`.

## Non-Negotiable Rules

### GPU-First
- All workloads that can reasonably run on GPU must stay on GPU.
- Do not introduce CPU fallbacks for GPU-capable terrain, culling, LOD, particles, skinning, visibility, or indirect draw work.
- Do not trade visual quality for convenience.

### Compute-Shader First
- Data-parallel gameplay and world-generation work must use compute shaders.
- CPU code is only for bootstrap, UI, orchestration, and small glue logic.
- Do not add per-vertex or per-instance CPU loops for work that belongs in GPU compute.

### No Unapproved Fallbacks
- If a WebGPU or TSL path appears blocked, check official docs first.
- If the GPU path is still unclear, stop and ask before implementing a CPU or otherwise inferior fallback.

### React Compiler
- React Compiler is enabled.
- Do not add `useMemo`, `useCallback`, or `React.memo` unless the user explicitly requests an exception.

### Language
- Code comments may be bilingual English and Chinese.
- UI strings, dialog text, logs, errors, and other runtime text must be English only.

### Documentation Style
- When writing documentation, keep it concise and direct.
- Do not produce overly detailed, verbose, or repetitive documentation unless the user explicitly asks for it.

### Customization Maintenance
- During implementation, if it would improve future coding quality or execution reliability, update documentation, update existing skills or instructions, or add a new appropriate skill or instruction.
- Only make these customization changes when they are genuinely useful for better future coding in this repository.
- Name skills by domain, not by one-off actions or bug categories.

## Repository Constraints

- Frontend code lives in `src/`.
- Tauri backend code lives in `src-tauri/`.
- Do not edit build outputs such as `dist/` or `src-tauri/target/`.
- Prefer path aliases: `@game/*`, `@project/*`, `@ui/*`, `@config/*`.
- Put constants and tunables in `src/config/` instead of hardcoding them.

## Architecture Defaults

- Favor ECS with pure-data components and stateless systems.
- Preserve phase ordering: input -> gameplay -> physics -> render.
- Keep files focused on one responsibility and organize by feature or domain.
- Preserve the browser/desktop platform boundary through `src/platform/`; do not spread Tauri-specific logic across app code.
- Preserve the split between editor and game targets: share runtime systems where appropriate, but keep editor workflow and project-management UI out of the standalone game target.
- Terrain remains GPU-driven with chunk streaming and LOD.
- Large-world work should preserve batching, streaming, and floating-origin discipline.

## Verification

- Use `pnpm build` or `pnpm tsc --noEmit` for validation.
- Do not run `pnpm dev` or `pnpm tauri dev` for AI validation.
- When working in Three.js WebGPU or TSL code, consult official docs and current package APIs before assuming a limitation.
