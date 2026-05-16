// ProjectStorage: project save/load workflow over platform project capabilities.
// ProjectStorage：基于平台项目能力的项目保存/加载流程

import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import type { ChunkHeightData, MapData } from "./MapData";
import {
  createMapDataFromManifest,
  createMapManifest,
  decodeHeightChunkBase64,
  deserializeMapManifest,
  encodeHeightChunkBase64,
  getHeightChunkPathForKey,
  sortChunkKeys,
  type MapManifest,
} from "./MapData";
import type { ProjectMapRecord, ProjectMetadata } from "./ProjectData";
import {
  createProjectMapRecord,
  createProjectMetadata,
  createUniqueProjectMapId,
  deserializeProjectMetadata,
  getCurrentProjectMapId,
  getProjectMapDirectory,
  serializeProjectMetadata,
  upsertProjectMapId,
} from "./ProjectData";
import type { GameSettings } from "@game/settings";
import { mergeSettingsWithDefaults } from "@game/settings";

type SettingsParser<TSettings extends GameSettings> = (json: string | null) => TSettings;

type CurrentProjectState = {
  path: string;
  metadata: ProjectMetadata;
};

export type LoadedProject<TSettings extends GameSettings = GameSettings> = {
  projectPath: string;
  metadata: ProjectMetadata;
  activeMap: ProjectMapRecord;
  availableMaps: ProjectMapRecord[];
  activeMapDirectory: string;
  map: MapData | null;
  settings: TSettings;
};

type SaveProjectMapOptions<TSettings extends GameSettings = GameSettings> = {
  settings?: TSettings;
  projectName?: string;
  mapName?: string;
  mapId?: string;
  createNewMap?: boolean;
  forceWriteAllChunks?: boolean;
};

let currentProject: CurrentProjectState | null = null;
const platform = getPlatform();

export function getCurrentProjectPath(): string | null {
  return currentProject?.path ?? null;
}

export function setCurrentProjectReference(
  path: string | null,
  metadata?: ProjectMetadata | null,
): void {
  if (!path) {
    currentProject = null;
    return;
  }

  currentProject = {
    path,
    metadata: metadata ?? currentProject?.metadata ?? createProjectMetadata(getProjectNameFromPath(path)),
  };
}

export function getProjectNameFromPath(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

export async function openProjectDialog(): Promise<string | null> {
  const selected = await platform.dialogs.openFolder({
    title: "Open Project Folder",
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  const isValid = await platform.projects.isValidProject(selected);
  if (!isValid) {
    throw new Error("Selected folder is not a valid Open FPS project (missing project.json)");
  }

  return selected;
}

export async function selectProjectFolderDialog(): Promise<string | null> {
  const selected = await platform.dialogs.openFolder({
    title: "Select Folder for New Project",
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  return selected;
}

export async function loadProject(projectPath: string): Promise<{
  metadata: ProjectMetadata;
  map: MapData | null;
  settings: GameSettings;
}> {
  return loadProjectMap(projectPath);
}

export async function loadProjectMap<TSettings extends GameSettings = GameSettings>(
  projectPath: string,
  requestedMapId?: string,
  parseSettings: SettingsParser<TSettings> = mergeSettingsWithDefaults as SettingsParser<TSettings>,
): Promise<LoadedProject<TSettings>> {
  const metadataJson = await platform.projects.readMetadata(projectPath);
  let metadata = deserializeProjectMetadata(metadataJson);
  const activeMapId = requestedMapId ?? metadata.currentMapId;
  const resolvedActiveMapId = resolveProjectMapId(metadata, activeMapId);

  if (metadata.currentMapId !== resolvedActiveMapId) {
    metadata = { ...metadata, currentMapId: resolvedActiveMapId, modified: Date.now() };
    await saveProjectMetadata(projectPath, metadata);
  }

  let map: MapData | null = null;
  try {
    map = await loadProjectMapData(projectPath, resolvedActiveMapId);
  } catch (error) {
    if (isMissingFileSystemResourceError(error)) {
      console.warn("[ProjectStorage] Project map does not exist yet", error);
    } else {
      console.error(`[ProjectStorage] Failed to read project map: ${formatUnknownError(error)}`, error);
      throw error;
    }
  }

  let settingsJson: string | null = null;
  try {
    settingsJson = await platform.projects.readSettings(projectPath);
    if (!settingsJson || settingsJson.trim() === "") {
      settingsJson = null;
    }
  } catch (error) {
    if (isMissingFileSystemResourceError(error)) {
      console.warn("[ProjectStorage] Project settings do not exist yet", error);
    } else {
      console.error(`[ProjectStorage] Failed to read project settings: ${formatUnknownError(error)}`, error);
      throw error;
    }
  }
  const settings = parseSettings(settingsJson);
  const availableMaps = await loadProjectMapRecords(projectPath, metadata.maps, map
    ? { mapId: resolvedActiveMapId, map }
    : null);
  const activeMap = resolveLoadedProjectMap(availableMaps, resolvedActiveMapId);

  currentProject = { path: projectPath, metadata };

  try {
    await platform.projects.addRecentProject(projectPath);
  } catch (error) {
    console.warn("[ProjectStorage] Failed to add recent project entry", error);
  }

  return {
    projectPath,
    metadata,
    activeMap,
    availableMaps,
    activeMapDirectory: getProjectMapDirectory(projectPath, activeMap.id),
    map,
    settings,
  };
}

export async function createProject(
  projectPath: string,
  projectName: string,
): Promise<ProjectMetadata> {
  const metadata = createProjectMetadata(projectName);
  const metadataJson = serializeProjectMetadata(metadata);

  await platform.projects.createProject(projectPath, metadataJson);

  currentProject = { path: projectPath, metadata };
  return metadata;
}

export async function saveProjectMap<TSettings extends GameSettings = GameSettings>(
  mapData: MapData,
  options: SaveProjectMapOptions<TSettings> = {},
  parseSettings: SettingsParser<TSettings> = mergeSettingsWithDefaults as SettingsParser<TSettings>,
): Promise<LoadedProject<TSettings>> {
  if (!currentProject) {
    throw new Error("No project open");
  }

  let projectPath = currentProject.path;
  let metadata = currentProject.metadata;
  const normalizedProjectName = normalizeName(options.projectName, metadata.name);
  if (normalizedProjectName !== metadata.name) {
    projectPath = await platform.projects.renameProject(currentProject.path, normalizedProjectName);
    metadata = { ...metadata, name: normalizedProjectName, modified: Date.now() };
  }

  const currentMapId = getCurrentProjectMapId(metadata);
  const normalizedMapName = normalizeName(options.mapName, mapData.metadata.name || currentMapId);
  const targetMapId = options.createNewMap
    ? createUniqueProjectMapId(normalizedMapName, metadata.maps)
    : options.mapId ?? currentMapId;

  const now = Date.now();
  metadata = upsertProjectMapId(metadata, targetMapId);
  const savedMapData: MapData = {
    ...mapData,
    version: createMapManifest(mapData).version,
    metadata: {
      ...mapData.metadata,
      name: normalizedMapName,
      modified: now,
    },
  };

  const writeAllChunks = options.forceWriteAllChunks || options.createNewMap || mapData.dirtyChunkKeys === undefined;
  await saveProjectMapData(projectPath, targetMapId, savedMapData, writeAllChunks);

  if (options.settings) {
    const settingsJson = JSON.stringify(options.settings, null, 2);
    await platform.projects.saveSettings(projectPath, settingsJson);
  }

  await saveProjectMetadata(projectPath, metadata);

  currentProject = { path: projectPath, metadata };
  const availableMaps = await loadProjectMapRecords(projectPath, metadata.maps, {
    mapId: targetMapId,
    map: savedMapData,
  });
  const activeMap = resolveLoadedProjectMap(availableMaps, targetMapId);

  return {
    projectPath,
    metadata,
    activeMap,
    availableMaps,
    activeMapDirectory: getProjectMapDirectory(projectPath, targetMapId),
    map: savedMapData,
    settings: options.settings ?? parseSettings(null),
  };
}

export async function saveProjectSettings(settings: GameSettings): Promise<void> {
  if (!currentProject) {
    throw new Error("No project open");
  }

  const settingsJson = JSON.stringify(settings, null, 2);
  await platform.projects.saveSettings(currentProject.path, settingsJson);
}

export async function saveProjectAs<TSettings extends GameSettings = GameSettings>(
  mapData: MapData,
  projectName: string,
  mapName: string,
  settings?: TSettings,
): Promise<LoadedProject<TSettings> | null> {
  const folderPath = await selectProjectFolderDialog();
  if (!folderPath) {
    return null;
  }

  const projectPath = `${folderPath}/${projectName}`;

  await createProject(projectPath, projectName);
  return saveProjectMap<TSettings>(mapData, { settings, mapName, forceWriteAllChunks: true });
}

export function hasOpenProject(): boolean {
  return currentProject !== null;
}

export async function listRecentProjects(): Promise<string[]> {
  return platform.projects.listRecentProjects();
}

export async function addRecentProject(projectPath: string): Promise<void> {
  return platform.projects.addRecentProject(projectPath);
}

export async function removeRecentProject(projectPath: string): Promise<void> {
  return platform.projects.removeRecentProject(projectPath);
}

function resolveProjectMapId(metadata: ProjectMetadata, mapId: string | null | undefined): string {
  if (!mapId) {
    throw new Error("No map selected in project metadata");
  }

  if (!metadata.maps.includes(mapId)) {
    throw new Error(`Project map '${mapId}' was not found`);
  }

  return mapId;
}

function resolveLoadedProjectMap(maps: readonly ProjectMapRecord[], mapId: string): ProjectMapRecord {
  const map = maps.find((entry) => entry.id === mapId);
  if (!map) {
    throw new Error(`Project map '${mapId}' was not loaded`);
  }

  return map;
}

function normalizeName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

async function saveProjectMetadata(projectPath: string, metadata: ProjectMetadata): Promise<void> {
  await platform.projects.saveMetadata(projectPath, serializeProjectMetadata(metadata));
}

async function loadProjectMapData(projectPath: string, mapId: string): Promise<MapData> {
  const manifestJson = await platform.projects.readMapManifest(projectPath, mapId);
  const manifest = deserializeMapManifest(manifestJson);
  const chunkEntries = await Promise.all(
    manifest.chunkKeys.map(async (key) => {
      const base64 = await platform.projects.readMapChunk(
        projectPath,
        mapId,
        getHeightChunkPathForKey(key),
      );
      return [key, { heights: decodeHeightChunkBase64(base64, manifest.tileResolution) }] as const;
    }),
  );

  const chunks: Record<string, ChunkHeightData> = Object.fromEntries(chunkEntries);
  return createMapDataFromManifest(manifest, chunks);
}

async function loadProjectMapRecord(projectPath: string, mapId: string): Promise<ProjectMapRecord> {
  const manifestJson = await platform.projects.readMapManifest(projectPath, mapId);
  const manifest = deserializeMapManifest(manifestJson);
  return createProjectMapRecord(mapId, manifest.metadata);
}

async function loadProjectMapRecords(
  projectPath: string,
  mapIds: readonly string[],
  loadedMap: { mapId: string; map: MapData } | null,
): Promise<ProjectMapRecord[]> {
  return Promise.all(mapIds.map(async (mapId) => {
    if (loadedMap?.mapId === mapId) {
      return createProjectMapRecord(mapId, loadedMap.map.metadata);
    }

    return loadProjectMapRecord(projectPath, mapId);
  }));
}

async function saveProjectMapData(
  projectPath: string,
  mapId: string,
  mapData: MapData,
  writeAllChunks: boolean,
): Promise<void> {
  const nextManifest = createMapManifest(mapData);
  const dirtyChunkKeys = new Set(mapData.dirtyChunkKeys ?? []);
  const chunkKeys = Object.keys(mapData.chunks);
  const chunkKeysToWrite = writeAllChunks
    ? chunkKeys
    : chunkKeys.filter((key) => dirtyChunkKeys.has(key));
  const manifest = writeAllChunks
    ? nextManifest
    : await createPartialSaveManifest(projectPath, mapId, mapData, nextManifest, dirtyChunkKeys);
  const manifestChunkKeys = new Set(manifest.chunkKeys);

  // EN: Height payloads are written before the manifest so the manifest never points at missing new chunk files.
  // 中文: 高度数据先于清单写入，避免清单指向尚未写好的新 chunk 文件。
  await Promise.all(chunkKeysToWrite.map(async (key) => {
    const chunkData = mapData.chunks[key];
    if (!manifestChunkKeys.has(key) || !chunkData) {
      throw new Error(`Map chunk '${key}' is missing during save`);
    }

    const base64 = encodeHeightChunkBase64(chunkData.heights, mapData.tileResolution);
    await platform.projects.saveMapChunk(projectPath, mapId, getHeightChunkPathForKey(key), base64);
  }));

  await platform.projects.saveMapManifest(projectPath, mapId, serializeManifest(manifest));
}

async function createPartialSaveManifest(
  projectPath: string,
  mapId: string,
  mapData: MapData,
  nextManifest: MapManifest,
  dirtyChunkKeys: ReadonlySet<string>,
): Promise<MapManifest> {
  let existingManifest: MapManifest | null = null;
  try {
    existingManifest = deserializeMapManifest(await platform.projects.readMapManifest(projectPath, mapId));
  } catch (error) {
    if (!isMissingFileSystemResourceError(error)) {
      throw error;
    }
  }

  if (!existingManifest) {
    return nextManifest;
  }

  const exportedChunkKeys = new Set(Object.keys(mapData.chunks));
  const chunkKeys = new Set<string>();

  for (const key of existingManifest.chunkKeys) {
    if (exportedChunkKeys.has(key)) {
      chunkKeys.add(key);
    }
  }

  // EN: Partial saves may add edited chunks, but must not add unedited procedural cache chunks to the manifest.
  // 中文: 部分保存可以加入被编辑的 chunk，但不能把未编辑的程序缓存 chunk 加进清单。
  const nextChunkKeys = new Set(nextManifest.chunkKeys);
  for (const key of dirtyChunkKeys) {
    if (nextChunkKeys.has(key)) {
      chunkKeys.add(key);
    }
  }

  return {
    ...nextManifest,
    chunkKeys: sortChunkKeys(chunkKeys),
  };
}

function serializeManifest(manifest: MapManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
