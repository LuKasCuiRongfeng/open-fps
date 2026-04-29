# Workspace Layer

## Purpose

`src/workspace/` defines shared project and map data contracts plus storage helpers used by editor workflows. This layer is where project structure, map serialization, and save or load behavior should stay explicit.

## Key Files

- `MapData.ts`: map schema, chunk serialization helpers, and map versioning
- `ProjectData.ts`: project metadata, map records, project paths, and project versioning
- `MapStorage.ts`: map import, export, save, and current map file tracking
- `ProjectStorage.ts`: project open, create, load, save, recent-project, and current project flows
- `index.ts`: barrel exports for workspace contracts

## Rules

- Keep `MapData` and `ProjectData` as the source of truth for serialized shapes.
- Update every affected caller when storage contracts change.
- Keep storage flows explicit instead of hiding them inside UI components.
- Use platform bridge capabilities for dialogs, file reads or writes, and backend commands.
- Treat current map and current project references as shared workflow state, not UI-local state.

## Common Changes

- Change a saved field: update the data type, serializer, deserializer, and all related callers in the same change.
- Change open or save behavior: start from `ProjectStorage.ts` or `MapStorage.ts` before editing UI screens.
- Add a project workflow feature: keep orchestration here and let UI call into it.

## Related Docs

- See `docs/runtime-separation.md` for how workspace flows stay editor-only.
- See `.github/skills/storage-contracts/SKILL.md` for contract-change workflow guidance.
