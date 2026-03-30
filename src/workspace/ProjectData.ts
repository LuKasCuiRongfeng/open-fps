// ProjectData: project folder structure and serialization.
// ProjectData：项目文件夹结构和序列化

import type { MapData } from "./MapData";
import type { GameSettings } from "@game/settings";

export interface ProjectMapRecord {
  id: string;
  name: string;
  created: number;
  modified: number;
}

export interface ProjectMetadata {
  name: string;
  created: number;
  modified: number;
  version: number;
  currentMapId: string | null;
  maps: ProjectMapRecord[];
}

export interface ProjectData {
  metadata: ProjectMetadata;
  map: MapData | null;
  settings: GameSettings;
}

export const PROJECT_VERSION = 2;
export const DEFAULT_PROJECT_MAP_ID = "main";

export const PROJECT_FILES = {
  metadata: "project.json",
  mapsDirectory: "maps",
  map: "map.json",
  settings: "settings.json",
  texture: "texture.json",
} as const;

export function createProjectMetadata(name: string, initialMapName = "Main Map"): ProjectMetadata {
  const now = Date.now();
  const initialMap = createProjectMapRecord(initialMapName, DEFAULT_PROJECT_MAP_ID);
  return {
    name,
    created: now,
    modified: now,
    version: PROJECT_VERSION,
    currentMapId: initialMap.id,
    maps: [initialMap],
  };
}

export function createProjectMapRecord(name: string, id: string): ProjectMapRecord {
  const now = Date.now();
  return {
    id,
    name,
    created: now,
    modified: now,
  };
}

export function sanitizeProjectMapId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "map";
}

export function createUniqueProjectMapId(name: string, existingMaps: readonly ProjectMapRecord[]): string {
  const baseId = sanitizeProjectMapId(name);
  const existingIds = new Set(existingMaps.map((entry) => entry.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

export function upsertProjectMapRecord(
  metadata: ProjectMetadata,
  mapId: string,
  mapName: string,
): ProjectMetadata {
  const now = Date.now();
  const existing = metadata.maps.find((entry) => entry.id === mapId);
  const nextMaps = existing
    ? metadata.maps.map((entry) =>
        entry.id === mapId
          ? { ...entry, name: mapName, modified: now }
          : entry,
      )
    : [...metadata.maps, createProjectMapRecord(mapName, mapId)];

  return {
    ...metadata,
    modified: now,
    currentMapId: mapId,
    maps: nextMaps,
  };
}

export function getProjectMapRecord(
  metadata: ProjectMetadata,
  mapId: string,
): ProjectMapRecord | null {
  return metadata.maps.find((entry) => entry.id === mapId) ?? null;
}

export function getCurrentProjectMapRecord(metadata: ProjectMetadata): ProjectMapRecord {
  if (!metadata.currentMapId) {
    throw new Error("Project metadata is missing currentMapId");
  }

  const record = getProjectMapRecord(metadata, metadata.currentMapId);
  if (!record) {
    throw new Error(`Project metadata references missing map '${metadata.currentMapId}'`);
  }

  return record;
}

export function getProjectMapDirectory(projectPath: string, mapId: string): string {
  return `${projectPath}/${PROJECT_FILES.mapsDirectory}/${mapId}`;
}

export function getProjectMapFilePath(projectPath: string, mapId: string): string {
  return `${getProjectMapDirectory(projectPath, mapId)}/${PROJECT_FILES.map}`;
}

export function getProjectMapTextureDefinitionPath(projectPath: string, mapId: string): string {
  return `${getProjectMapDirectory(projectPath, mapId)}/${PROJECT_FILES.texture}`;
}

export function serializeProjectMetadata(metadata: ProjectMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

export function deserializeProjectMetadata(json: string): ProjectMetadata {
  const parsed = JSON.parse(json) as Partial<ProjectMetadata>;
  const now = Date.now();

  if (!Array.isArray(parsed.maps) || parsed.maps.length === 0) {
    throw new Error("Project metadata must contain at least one map");
  }

  const maps = parsed.maps
    .filter((entry): entry is ProjectMapRecord => Boolean(entry?.id) && Boolean(entry?.name))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      created: entry.created ?? now,
      modified: entry.modified ?? now,
    }));

  if (maps.length === 0) {
    throw new Error("Project metadata does not contain any valid maps");
  }

  if (!parsed.currentMapId) {
    throw new Error("Project metadata is missing currentMapId");
  }

  if (!maps.some((entry) => entry.id === parsed.currentMapId)) {
    throw new Error(`Current map '${parsed.currentMapId}' does not exist in project metadata`);
  }

  return {
    name: parsed.name ?? "Untitled Project",
    created: parsed.created ?? now,
    modified: parsed.modified ?? now,
    version: PROJECT_VERSION,
    currentMapId: parsed.currentMapId,
    maps,
  };
}