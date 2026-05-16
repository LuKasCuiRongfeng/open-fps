// ProjectData: project folder structure and serialization.
// ProjectData：项目文件夹结构和序列化

import type { MapData, MapMetadata } from "./MapData";
import type { GameSettings } from "@game/settings";

// EN: Project files store only map IDs; this record is a runtime view hydrated from each map manifest.
// 中文: 项目文件只存地图 ID；这个记录是在运行时从每个地图清单补全的视图。
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
  maps: string[];
}

export interface ProjectData<TSettings extends GameSettings = GameSettings> {
  metadata: ProjectMetadata;
  map: MapData | null;
  settings: TSettings;
}

export const PROJECT_VERSION = 3;
export const DEFAULT_PROJECT_MAP_ID = "main";

export const PROJECT_FILES = {
  metadata: "project.json",
  mapsDirectory: "maps",
  map: "map.json",
  settings: "settings.json",
  texture: "paint/layers.json",
  vegetation: "vegetation/models.json",
} as const;

export function createProjectMetadata(name: string, initialMapId = DEFAULT_PROJECT_MAP_ID): ProjectMetadata {
  const now = Date.now();
  return {
    name,
    created: now,
    modified: now,
    version: PROJECT_VERSION,
    currentMapId: initialMapId,
    maps: [initialMapId],
  };
}

export function createProjectMapRecord(id: string, metadata: MapMetadata): ProjectMapRecord {
  return {
    id,
    name: metadata.name,
    created: metadata.created,
    modified: metadata.modified,
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

export function createUniqueProjectMapId(name: string, existingMapIds: readonly string[]): string {
  const baseId = sanitizeProjectMapId(name);
  const existingIds = new Set(existingMapIds);
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

export function upsertProjectMapId(
  metadata: ProjectMetadata,
  mapId: string,
): ProjectMetadata {
  const now = Date.now();
  const nextMaps = metadata.maps.includes(mapId) ? metadata.maps : [...metadata.maps, mapId];

  return {
    ...metadata,
    modified: now,
    currentMapId: mapId,
    maps: nextMaps,
  };
}

export function getProjectMapId(
  metadata: ProjectMetadata,
  mapId: string,
): string | null {
  return metadata.maps.includes(mapId) ? mapId : null;
}

export function getCurrentProjectMapId(metadata: ProjectMetadata): string {
  if (!metadata.currentMapId) {
    throw new Error("Project metadata is missing currentMapId");
  }

  const mapId = getProjectMapId(metadata, metadata.currentMapId);
  if (!mapId) {
    throw new Error(`Project metadata references missing map '${metadata.currentMapId}'`);
  }

  return mapId;
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

  if (parsed.version !== PROJECT_VERSION) {
    throw new Error(`Project metadata version ${parsed.version ?? "unknown"} is not supported`);
  }

  if (!Array.isArray(parsed.maps) || parsed.maps.length === 0) {
    throw new Error("Project metadata must contain at least one map");
  }

  const mapIds = parsed.maps.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  const maps = [...new Set(mapIds.map((entry) => entry.trim()))];

  if (maps.length === 0) {
    throw new Error("Project metadata does not contain any valid maps");
  }

  if (!parsed.currentMapId) {
    throw new Error("Project metadata is missing currentMapId");
  }

  if (!maps.includes(parsed.currentMapId)) {
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