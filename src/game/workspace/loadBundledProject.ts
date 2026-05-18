// loadBundledProject: read-only project loading for packaged game data.
// loadBundledProject：面向已打包游戏数据的只读项目加载。

import {
  createMapDataFromManifest,
  decodeHeightPageBytes,
  deserializeTerrainHeightManifest,
  createTerrainHeightPageIndex,
  getHeightRegionPackByteLength,
  getHeightRegionPageBytes,
  MAP_DATA_VERSION,
  MAP_GENERATION_GRAPH_PATH,
  MAP_HEIGHT_REGIONS_DIRECTORY,
  MAP_PAINT_PATH,
  MAP_PAINT_REGIONS_DIRECTORY,
  MAP_TERRAIN_HEIGHT_PATH,
  MAP_VEGETATION_MODELS_PATH,
  MAP_WORLD_OBJECTS_PATH,
  TERRAIN_HEIGHT_MANIFEST_VERSION,
  type MapData,
  type MapManifest,
  type TerrainHeightManifest,
  type TerrainHeightRegionManifest,
} from "@project/MapData";
import { validateSidecarRegionIntegrity, type SidecarRegionIntegrityMap } from "@workspace/SidecarAssetIntegrity";
import {
  createProjectMapRecord,
  deserializeProjectMetadata,
  getCurrentProjectMapId,
  type ProjectMapRecord,
  type ProjectMetadata,
} from "@project/ProjectData";
import { mergeSettingsWithDefaults, type GameSettings } from "@game/settings";
import {
  createPaintDataFromManifest,
  deserializePaintManifest,
  PAINT_MANIFEST_VERSION,
  type PaintManifest,
  type TextureDefinition,
} from "@game/world/terrain/TextureData";
import {
  createVegetationDataFromManifest,
  deserializeVegetationManifest,
  getVegetationRegions,
  VEGETATION_DATA_VERSION,
  VEGETATION_REGIONS_DIRECTORY,
  type VegetationManifest,
  type VegetationMapData,
} from "@game/world/vegetation";
import {
  deserializeCookedMapManifest,
  getCookedMapManifestPath,
  type CookedCellAsset,
  type CookedCellRef,
  type CookedMapManifest,
  type CookedRegionTable,
} from "./CookedMapManifest";
import { CookedWorldPartitionRuntime } from "./CookedWorldPartitionRuntime";

export const DEFAULT_BUNDLED_PROJECT_URL = "/game-data/kunlun_wilds/";

export interface BundledGameProject {
  projectBaseUrl: string;
  metadata: ProjectMetadata;
  activeMap: ProjectMapRecord;
  mapDirectoryUrl: string;
  cookedMap: CookedMapManifest;
  map: MapData;
  settings: GameSettings;
  textureDefinition: TextureDefinition | null;
  vegetationData: VegetationMapData | null;
  worldPartition: BundledWorldPartitionRuntime;
}

export type BundledWorldPartitionCellKind = "objects" | "collision" | "nav";

export interface BundledWorldPartitionRuntime {
  runtime: CookedWorldPartitionRuntime;
  loadCellAsset(kind: BundledWorldPartitionCellKind, key: string): Promise<unknown>;
  retainCellAssets(activeKeys: ReadonlySet<string>): void;
}

function normalizeDirectoryUrl(path: string): string {
  const baseUrl = typeof window === "undefined" ? "http://localhost/" : window.location.href;
  const resolved = new URL(path, baseUrl).href;
  return resolved.endsWith("/") ? resolved : `${resolved}/`;
}

function resolveProjectUrl(projectBaseUrl: string, relativePath: string): string {
  return new URL(relativePath, projectBaseUrl).href;
}

async function fetchRequiredText(url: string, label: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchOptionalText(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load optional project file: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return text.trim() ? text : null;
}

async function fetchRequiredBytes(url: string, label: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status} ${response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function loadBundledGameProject(
  projectUrl: string = DEFAULT_BUNDLED_PROJECT_URL,
): Promise<BundledGameProject> {
  const projectBaseUrl = normalizeDirectoryUrl(projectUrl);
  const metadataJson = await fetchRequiredText(
    resolveProjectUrl(projectBaseUrl, "project.json"),
    "project metadata",
  );
  const metadata = deserializeProjectMetadata(metadataJson);
  const activeMapId = getCurrentProjectMapId(metadata);
  const [cookedJson, settingsJson] = await Promise.all([
    fetchRequiredText(resolveProjectUrl(projectBaseUrl, getCookedMapManifestPath(activeMapId)), "cooked map manifest"),
    fetchOptionalText(resolveProjectUrl(projectBaseUrl, "settings.json")),
  ]);
  const cookedMap = deserializeCookedMapManifest(cookedJson);
  validateCookedMapSelection(cookedMap, activeMapId);
  const mapDirectoryUrl = resolveProjectFileDirectoryUrl(projectBaseUrl, getCookedMapManifestPath(activeMapId));
  const worldPartition = createBundledWorldPartitionRuntime(projectBaseUrl, cookedMap);

  const manifest = createMapManifestFromCooked(cookedMap);
  const activeMap = createProjectMapRecord(activeMapId, manifest.metadata);
  const terrainManifest = createTerrainManifestFromCooked(cookedMap);
  const heightPageIndex = createTerrainHeightPageIndex(terrainManifest);
  const heightPageCache = new Map<string, ReturnType<NonNullable<MapData["loadHeightPage"]>>>();
  const heightRegionCache = new Map<string, Promise<Uint8Array>>();
  const map = createMapDataFromManifest(manifest, terrainManifest, {});
  map.loadHeightPage = async (key) => {
    const cached = heightPageCache.get(key);
    if (cached) {
      return cached;
    }

    const location = heightPageIndex.get(key);
    if (!location) {
      throw new Error(`Map height page '${key}' is not declared in the terrain manifest`);
    }

    const request = (async () => {
      const regionBytes = await loadBundledHeightRegionPack(
        projectBaseUrl,
        location.region,
        terrainManifest.pageResolution,
        cookedMap.assets.terrain.regions,
        heightRegionCache,
      );
      const pageBytes = getHeightRegionPageBytes(regionBytes, location.page);
      return { heights: decodeHeightPageBytes(pageBytes, terrainManifest.pageResolution) };
    })();
    heightPageCache.set(key, request);
    return request;
  };

  const settings = mergeSettingsWithDefaults(settingsJson);
  const paintManifest = createPaintManifestFromCooked(cookedMap);
  map.paint = createPaintDataFromManifest(paintManifest);

  const textureDefinition = paintManifest.layers;
  const vegetationData = await loadBundledVegetationData(
    projectBaseUrl,
    createVegetationManifestFromCooked(cookedMap),
    cookedMap,
  );

  return {
    projectBaseUrl,
    metadata,
    activeMap,
    mapDirectoryUrl,
    cookedMap,
    map,
    settings,
    textureDefinition,
    vegetationData,
    worldPartition,
  };
}

function createBundledWorldPartitionRuntime(
  projectBaseUrl: string,
  cookedMap: CookedMapManifest,
): BundledWorldPartitionRuntime {
  const runtime = new CookedWorldPartitionRuntime(cookedMap.partition);
  const cache = new Map<string, Promise<unknown>>();
  return {
    runtime,
    loadCellAsset(kind, key) {
      const cacheKey = `${kind}:${key}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const request = loadCookedCellAsset(projectBaseUrl, cookedMap.assets[kind], kind, key);
      cache.set(cacheKey, request);
      return request;
    },
    retainCellAssets(activeKeys) {
      for (const key of cache.keys()) {
        if (!activeKeys.has(key)) {
          cache.delete(key);
        }
      }
    },
  };
}

async function loadCookedCellAsset(
  projectBaseUrl: string,
  asset: CookedCellAsset,
  kind: BundledWorldPartitionCellKind,
  key: string,
): Promise<unknown> {
  const cell = getCookedCell(asset, key, kind);
  const bytes = await fetchRequiredBytes(resolveProjectUrl(projectBaseUrl, cell.path), `${kind} cell ${key}`);
  await validateSidecarRegionIntegrity(`Cooked ${kind} cell`, key, bytes, cell);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

async function loadBundledHeightRegionPack(
  projectBaseUrl: string,
  region: TerrainHeightRegionManifest,
  pageResolution: number,
  cookedRegions: CookedRegionTable,
  cache: Map<string, Promise<Uint8Array>>,
): Promise<Uint8Array> {
  const cached = cache.get(region.key);
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const cookedRegion = getCookedRegion(cookedRegions, region.key, "height region");
    const bytes = await fetchRequiredBytes(
      resolveProjectUrl(projectBaseUrl, cookedRegion.path),
      `height region ${region.key}`,
    );
    const expectedByteLength = getHeightRegionPackByteLength(region, pageResolution);
    if (bytes.byteLength !== expectedByteLength) {
      throw new Error(`Invalid height region '${region.key}' byte length`);
    }
    await validateSidecarRegionIntegrity("Height region", region.key, bytes, cookedRegion);

    return bytes;
  })();
  cache.set(region.key, request);
  return request;
}

async function loadBundledVegetationData(
  projectBaseUrl: string,
  manifest: VegetationManifest,
  cookedMap: CookedMapManifest,
): Promise<VegetationMapData> {
  const regionEntries = await Promise.all(
    getVegetationRegions(manifest).map(async (region) => {
      const cookedRegion = getCookedRegion(cookedMap.assets.vegetation.regions, region.key, "vegetation region");
      const bytes = await fetchRequiredBytes(
        resolveProjectUrl(projectBaseUrl, cookedRegion.path),
        `vegetation region ${region.key}`,
      );
      await validateSidecarRegionIntegrity("Vegetation region", region.key, bytes, cookedRegion);
      return [region.key, bytes] as const;
    }),
  );

  return createVegetationDataFromManifest(manifest, Object.fromEntries(regionEntries));
}

function resolveProjectFileDirectoryUrl(projectBaseUrl: string, relativeFilePath: string): string {
  const slashIndex = relativeFilePath.lastIndexOf("/");
  const directoryPath = slashIndex >= 0 ? relativeFilePath.slice(0, slashIndex + 1) : "";
  return normalizeDirectoryUrl(resolveProjectUrl(projectBaseUrl, directoryPath));
}

function validateCookedMapSelection(cookedMap: CookedMapManifest, activeMapId: string): void {
  if (cookedMap.mapId !== activeMapId) {
    throw new Error(`Cooked map '${cookedMap.mapId}' does not match active project map '${activeMapId}'`);
  }
}

function createMapManifestFromCooked(cookedMap: CookedMapManifest): MapManifest {
  return {
    version: MAP_DATA_VERSION,
    seed: cookedMap.map.seed,
    world: {
      sizeMeters: cookedMap.world.sizeMeters,
      pageSizeMeters: cookedMap.world.pageSizeMeters,
      originX: 0,
      originZ: 0,
    },
    terrainPath: MAP_TERRAIN_HEIGHT_PATH,
    generationGraphPath: MAP_GENERATION_GRAPH_PATH,
    paintPath: MAP_PAINT_PATH,
    vegetationPath: MAP_VEGETATION_MODELS_PATH,
    objectsPath: MAP_WORLD_OBJECTS_PATH,
    metadata: {
      name: cookedMap.map.metadata.name,
      created: cookedMap.map.metadata.created,
      modified: cookedMap.map.metadata.modified,
    },
  };
}

function createTerrainManifestFromCooked(cookedMap: CookedMapManifest): TerrainHeightManifest {
  const asset = cookedMap.assets.terrain;
  return deserializeTerrainHeightManifest(JSON.stringify({
    version: TERRAIN_HEIGHT_MANIFEST_VERSION,
    format: asset.format,
    sampleFormat: asset.sampleFormat,
    pageResolution: asset.pageResolution,
    pageSizeMeters: asset.pageSizeMeters,
    regionSizePages: asset.regionSizePages,
    regionsDirectory: MAP_HEIGHT_REGIONS_DIRECTORY,
    regions: createCookedRegionMasks(asset.regions),
    regionIntegrity: createCookedRegionIntegrity(asset.regions),
  }));
}

function createPaintManifestFromCooked(cookedMap: CookedMapManifest): PaintManifest {
  const asset = cookedMap.assets.paint;
  return deserializePaintManifest(JSON.stringify({
    version: PAINT_MANIFEST_VERSION,
    layers: asset.layers,
    splatMaps: {
      format: asset.format,
      resolution: asset.resolution,
      pageResolution: asset.pageResolution,
      pageSizeMeters: asset.pageSizeMeters,
      regionSizePages: asset.regionSizePages,
      regionsDirectory: MAP_PAINT_REGIONS_DIRECTORY,
      indices: asset.indices,
      regions: createCookedRegionMasks(asset.regions),
      regionIntegrity: createCookedRegionIntegrity(asset.regions),
    },
  }));
}

function createVegetationManifestFromCooked(cookedMap: CookedMapManifest): VegetationManifest {
  const asset = cookedMap.assets.vegetation;
  return deserializeVegetationManifest(JSON.stringify({
    version: VEGETATION_DATA_VERSION,
    models: asset.models,
    instances: {
      format: asset.format,
      instanceFormat: asset.instanceFormat,
      cellSizeMeters: asset.cellSizeMeters,
      regionSizeCells: asset.regionSizeCells,
      regionsDirectory: VEGETATION_REGIONS_DIRECTORY,
      regions: createCookedRegionMasks(asset.regions),
      regionIntegrity: createCookedRegionIntegrity(asset.regions),
      modelIds: asset.modelIds,
    },
  }));
}

function createCookedRegionMasks(regions: CookedRegionTable): Record<string, string> {
  return Object.fromEntries(Object.entries(regions).map(([key, region]) => [key, region.mask]));
}

function createCookedRegionIntegrity(regions: CookedRegionTable): SidecarRegionIntegrityMap {
  return Object.fromEntries(Object.entries(regions).map(([key, region]) => [key, {
    byteLength: region.byteLength,
    sha256: region.sha256,
  }]));
}

function getCookedRegion(regions: CookedRegionTable, regionKey: string, label: string) {
  const region = regions[regionKey];
  if (!region) {
    throw new Error(`Cooked ${label} '${regionKey}' is missing from the asset index`);
  }

  return region;
}

function getCookedCell(asset: CookedCellAsset, cellKey: string, label: string): CookedCellRef {
  const cell = asset.cells[cellKey];
  if (!cell) {
    throw new Error(`Cooked ${label} cell '${cellKey}' is missing from the asset index`);
  }

  return cell;
}
