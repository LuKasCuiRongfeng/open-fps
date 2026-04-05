# Copilot Instructions (open-fps)

Keep this file limited to rules that must always be present. Put directory-specific guidance in `.github/instructions/` and task workflows in `.github/skills/`.

## GPU-First
- All workloads that can reasonably run on GPU must stay on GPU.
- If GPU can implement it, or GPU is the better option, do not add any CPU compatibility path.
- Do not trade visual quality for convenience.

## Compute-Shader First
- Data-parallel gameplay and world-generation work must use compute shaders.
- CPU code is only for bootstrap, UI, orchestration, and small glue logic.
- Do not add per-vertex or per-instance CPU loops for work that belongs in GPU compute.

## No Unapproved Fallbacks
- If a WebGPU or TSL path appears blocked, check official docs first.
- If the GPU path is still unclear, stop and ask before implementing a CPU or otherwise inferior fallback.

## React Compiler
- React Compiler is enabled.
- Do not add `useMemo`, `useCallback`, or `React.memo` unless the user explicitly requests an exception.

## Language
- Code comments may be bilingual English and Chinese, and important logic must be commented.
- Everything else must be English only, including UI strings, dialog text, logs, errors, and documentation.

## Documentation Style
- When writing documentation, keep it concise and direct.
- Keep documentation updated in a timely manner so it does not drift out of sync with the implementation or surrounding context.
- Do not produce overly detailed, verbose, or repetitive documentation unless the user explicitly asks for it.

## Code Hygiene
- Keep code concise and remove redundant content.
- After resolving a problem, review any code added in earlier attempts and delete anything that is no longer necessary.
- Do not leave behind dead code, unused compatibility paths, temporary fixes, or other redundant implementation leftovers.

## Customization Maintenance
- During implementation, if it would improve future coding quality or execution reliability, update documentation, update existing skills or instructions, or add a new appropriate skill or instruction.
- Only make these customization changes when they are genuinely useful for better future coding in this repository.
- Name skills by domain, not by one-off actions or bug categories.

## Repository Constraints

- Frontend code lives in `src/`.
- Tauri backend code lives in `src-tauri/`.
- Do not edit build outputs such as `dist/` or `src-tauri/target/`.
- Prefer path aliases: `@game/*`, `@project/*`, `@ui/*`, `@config/*`.
- Put constants and tunables in `src/config/` instead of hardcoding them.

## Architecture

- The project supports separate `editor` and `game` app targets on top of a shared WebGPU runtime.
- Preserve the browser/desktop boundary through `src/platform/`; do not spread Tauri-specific logic across app code.
- Tauri APIs may only be imported inside `src/platform/desktopBridge.ts`; browser support should be implemented by replacing bridge methods, not by branching host logic at call sites.
- Storage and asset-loading flows must depend on `PlatformBridge` contracts rather than directly depending on Tauri packages or platform-specific APIs.
- Keep editor boot flow, project selection, recent-projects state, and save/open workflows in the editor target and workspace layer.
- Keep the standalone game target free of project-management UI while continuing to share runtime systems where appropriate.

## Verification

- Use `pnpm lint` or `pnpm tsc --noEmit` for validation.
- Do not run `pnpm dev` or `pnpm tauri dev` for AI validation.
- When working in Three.js WebGPU or TSL code, consult official docs and current package APIs before assuming a limitation.
