// ProjectStorage: project save/load workflow over platform project capabilities.
// ProjectStorage：基于平台项目能力的项目保存/加载流程

import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import { commitSidecarAsset, type SidecarRegionPayload } from "./SidecarAssetCommit";
import {
  createSidecarRegionIntegrityMap,
  validateSidecarRegionIntegrity,
  type SidecarRegionIntegrityMap,
} from "./SidecarAssetIntegrity";
import type { HeightPageData, MapData } from "./MapData";
import {
  createMapDataFromManifest,
  createMapManifest,
  createTerrainHeightManifest,
  createTerrainHeightPageIndex,
  decodeHeightPageBytes,
  decodeHeightRegionPackBase64,
  deserializeTerrainHeightManifest,
  encodeHeightPageBytes,
  deserializeMapManifest,
  getHeightPageKeys,
  getHeightRegionPages,
  getHeightRegionPackByteLength,
  getHeightRegionPageBytes,
  getTerrainHeightRegions,
  getTerrainHeightPageKeys,
  serializeTerrainHeightManifest,
  type MapManifest,
  type TerrainHeightManifest,
  type TerrainHeightRegionManifest,
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
import { createPaintDataFromManifest, deserializePaintManifest } from "@game/world/terrain/TextureData";

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
  forceWriteAllPages?: boolean;
};

interface TerrainHeightSavePlan {
  regionsToWrite: TerrainHeightRegionManifest[];
  staleRegionPaths?: string[];
  baseIntegrity?: SidecarRegionIntegrityMap;
}

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

  const writeAllPages = options.forceWriteAllPages || options.createNewMap || mapData.dirtyHeightPageKeys === undefined;
  await saveProjectMapData(projectPath, targetMapId, savedMapData, writeAllPages);

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
  return saveProjectMap<TSettings>(mapData, { settings, mapName, forceWriteAllPages: true });
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
  const terrainManifest = await loadProjectTerrainHeightManifest(projectPath, mapId, manifest.terrainPath);
  const mapData = createMapDataFromManifest(manifest, terrainManifest, {});
  mapData.loadHeightPage = createProjectHeightPageLoader(projectPath, mapId, terrainManifest);
  const paintManifest = await loadProjectPaintManifest(projectPath, mapId, mapData.paintPath);
  if (paintManifest) {
    mapData.paint = createPaintDataFromManifest(paintManifest);
  }

  return mapData;
}

async function loadProjectTerrainHeightManifest(
  projectPath: string,
  mapId: string,
  terrainPath: MapManifest["terrainPath"],
): Promise<TerrainHeightManifest> {
  const jsonPath = `${getProjectMapDirectory(projectPath, mapId)}/${terrainPath}`;
  return deserializeTerrainHeightManifest(await platform.files.readText(jsonPath));
}

function createProjectHeightPageLoader(
  projectPath: string,
  mapId: string,
  terrainManifest: TerrainHeightManifest,
): NonNullable<MapData["loadHeightPage"]> {
  const pageIndex = createTerrainHeightPageIndex(terrainManifest);
  const regionPackCache = new Map<string, Promise<Uint8Array>>();

  return async (key) => {
    const location = pageIndex.get(key);
    if (!location) {
      throw new Error(`Map height page '${key}' is not declared in the terrain manifest`);
    }

    const regionBytes = await loadProjectHeightRegionPack(
      projectPath,
      mapId,
      location.region,
      terrainManifest.pageResolution,
      regionPackCache,
    );
    const pageBytes = getHeightRegionPageBytes(regionBytes, location.page);
    return { heights: decodeHeightPageBytes(pageBytes, terrainManifest.pageResolution) };
  };
}

function loadProjectHeightRegionPack(
  projectPath: string,
  mapId: string,
  region: TerrainHeightRegionManifest,
  pageResolution: number,
  cache: Map<string, Promise<Uint8Array>>,
): Promise<Uint8Array> {
  const cached = cache.get(region.key);
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const base64 = await platform.projects.readMapChunk(projectPath, mapId, region.path);
    const bytes = decodeHeightRegionPackBase64(base64);
    const expectedByteLength = getHeightRegionPackByteLength(region, pageResolution);
    if (bytes.byteLength !== expectedByteLength) {
      throw new Error(`Invalid height region '${region.key}' byte length`);
    }
    if (!region.integrity) {
      throw new Error(`Height region '${region.key}' is missing integrity metadata`);
    }
    await validateSidecarRegionIntegrity("Height region", region.key, bytes, region.integrity);

    return bytes;
  })();
  cache.set(region.key, request);
  return request;
}

async function loadProjectPaintManifest(
  projectPath: string,
  mapId: string,
  paintPath: MapManifest["paintPath"],
): Promise<ReturnType<typeof deserializePaintManifest> | null> {
  const jsonPath = `${getProjectMapDirectory(projectPath, mapId)}/${paintPath}`;
  try {
    return deserializePaintManifest(await platform.files.readText(jsonPath));
  } catch (error) {
    if (isMissingFileSystemResourceError(error)) {
      return null;
    }

    throw error;
  }
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
  writeAllPages: boolean,
): Promise<void> {
  const nextManifest = createMapManifest(mapData);
  const nextTerrainManifest = createTerrainHeightManifest(
    getHeightPageKeys(mapData),
    mapData.heightPageResolution,
    mapData.pageSizeMeters,
  );
  const dirtyHeightPageKeys = new Set(mapData.dirtyHeightPageKeys ?? []);
  const terrainSavePlan = await createTerrainHeightSavePlan(
    projectPath,
    mapId,
    nextTerrainManifest,
    dirtyHeightPageKeys,
    writeAllPages,
  );
  const mapDirectory = getProjectMapDirectory(projectPath, mapId);
  const regionPayloads: SidecarRegionPayload[] = [];

  for (const region of terrainSavePlan.regionsToWrite) {
    regionPayloads.push(await createHeightRegionPackPayload(mapData, nextTerrainManifest, region));
  }
  nextTerrainManifest.regionIntegrity = await createSidecarRegionIntegrityMap(
    regionPayloads,
    terrainSavePlan.baseIntegrity,
  );

  await commitSidecarAsset({
    mapDirectory,
    manifestPath: nextManifest.terrainPath,
    manifestText: serializeTerrainHeightManifest(nextTerrainManifest),
    regions: regionPayloads,
    staleRegionPaths: terrainSavePlan.staleRegionPaths,
    staleDeleteLabel: "terrain height region",
  });
  await platform.projects.saveMapManifest(projectPath, mapId, serializeManifest(nextManifest));
}

async function createTerrainHeightSavePlan(
  projectPath: string,
  mapId: string,
  nextTerrainManifest: TerrainHeightManifest,
  dirtyHeightPageKeys: ReadonlySet<string>,
  writeAllPages: boolean,
): Promise<TerrainHeightSavePlan> {
  let existingTerrainManifest: TerrainHeightManifest | null = null;
  try {
    const manifestJson = await platform.projects.readMapManifest(projectPath, mapId);
    const manifest = deserializeMapManifest(manifestJson);
    existingTerrainManifest = await loadProjectTerrainHeightManifest(projectPath, mapId, manifest.terrainPath);
  } catch (error) {
    if (!isMissingFileSystemResourceError(error)) {
      throw error;
    }
  }

  const nextRegions = getTerrainHeightRegions(nextTerrainManifest);
  if (
    writeAllPages
    || !existingTerrainManifest
    || !hasSameTerrainStorageLayout(existingTerrainManifest, nextTerrainManifest)
  ) {
    return {
      regionsToWrite: nextRegions,
      staleRegionPaths: existingTerrainManifest
        ? getTerrainHeightRegions(existingTerrainManifest).map((region) => region.path)
        : undefined,
    };
  }

  const pageIndex = createTerrainHeightPageIndex(nextTerrainManifest);
  const dirtyRegionKeys = new Set<string>();
  for (const key of dirtyHeightPageKeys) {
    const location = pageIndex.get(key);
    if (!location) {
      throw new Error(`Dirty map height page '${key}' is not declared in the terrain manifest`);
    }

    dirtyRegionKeys.add(location.region.key);
  }

  return {
    regionsToWrite: nextRegions.filter((region) => dirtyRegionKeys.has(region.key)),
    baseIntegrity: existingTerrainManifest.regionIntegrity,
  };
}

async function createHeightRegionPackPayload(
  mapData: MapData,
  terrainManifest: TerrainHeightManifest,
  region: TerrainHeightRegionManifest,
): Promise<SidecarRegionPayload> {
  const packBytes = new Uint8Array(getHeightRegionPackByteLength(region, terrainManifest.pageResolution));

  for (const page of getHeightRegionPages(region, terrainManifest.pageResolution, terrainManifest.regionSizePages)) {
    const heightPage = await loadHeightPageForSave(mapData, page.key);
    const pageBytes = encodeHeightPageBytes(heightPage.heights, mapData.heightPageResolution);
    if (pageBytes.byteLength !== page.byteLength) {
      throw new Error(`Map height page '${page.key}' has invalid byte length during save`);
    }

    packBytes.set(pageBytes, page.offset);
  }

  return {
    key: region.key,
    path: region.path,
    bytes: packBytes,
  };
}

async function loadHeightPageForSave(mapData: MapData, key: string): Promise<HeightPageData> {
  const cached = mapData.heightPages[key];
  if (cached) {
    return cached;
  }

  if (mapData.loadHeightPage) {
    return mapData.loadHeightPage(key);
  }

  throw new Error(`Map height page '${key}' is missing during save`);
}

function hasSameTerrainStorageLayout(
  left: TerrainHeightManifest,
  right: TerrainHeightManifest,
): boolean {
  if (
    left.format !== right.format
    || left.sampleFormat !== right.sampleFormat
    || left.pageResolution !== right.pageResolution
    || left.pageSizeMeters !== right.pageSizeMeters
    || left.regionSizePages !== right.regionSizePages
    || left.regionsDirectory !== right.regionsDirectory
  ) {
    return false;
  }

  const leftKeys = getTerrainHeightPageKeys(left);
  const rightKeys = getTerrainHeightPageKeys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function serializeManifest(manifest: MapManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
