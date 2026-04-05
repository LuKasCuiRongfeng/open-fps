---
name: storage-contracts
description: 'Use for MapData, ProjectData, MapStorage, ProjectStorage, save and load flows, serialization changes, and frontend-backend storage contract updates.'
argument-hint: 'Describe the data shape, storage boundary, and which save or load flow is changing.'
---

# Storage Contracts

## Use For

- Map or project data shape changes
- Save and load bug fixes
- Serialization or deserialization changes
- Frontend and backend contract alignment work

## Check

1. Identify every contract surface first: data types, storage adapters, command boundaries, and callers.
2. Keep shared storage models aligned across frontend, workspace, and backend layers.
3. Prefer explicit migrations or compatibility handling over silent shape drift.
4. Keep Tauri commands thin and move storage logic into clear storage modules.
5. Update related documentation when file formats, save paths, or workflow behavior changes.
6. Validate with `pnpm tsc --noEmit`, and inspect affected save and load call sites after changing contracts.

## Output

- Preserve stable, explicit data contracts.
- Fix the root contract mismatch instead of patching each symptom separately.
