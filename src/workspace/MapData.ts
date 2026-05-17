// MapData: virtual open-world map page schema and manifest helpers.
// MapData：虚拟开放世界地图 page 架构与清单辅助函数。

import {
  pageKey,
  sortPageKeys,
} from "./PageGrid";
import {
  createEmptyPaintData,
  MAP_PAINT_PATH,
  type MapPaintData,
} from "./PaintData";
import {
  getTerrainHeightPageKeys,
  MAP_TERRAIN_HEIGHT_PATH,
  type TerrainHeightManifest,
} from "./TerrainHeightData";

export { pageKey, parsePageKey, sortPageKeys } from "./PageGrid";
export * from "./PaintData";
export * from "./TerrainHeightData";

/** Height page payload stored as float32 little-endian binary. / 以 float32 小端二进制保存的高度 page 数据。 */
export interface HeightPageData {
  heights: Float32Array;
}

/** Paint page payload stored as raw RGBA8 splat weights. / 以原始 RGBA8 splat 权重保存的绘制 page 数据。 */
export interface PaintPageData {
  pixels: Uint8Array;
}

export type HeightPageLoader = (key: string) => Promise<HeightPageData>;

/** Map metadata. / 地图元数据。 */
export interface MapMetadata {
  name: string;
  created: number;
  modified: number;
}

/** Complete map data for save/load. / 用于保存/加载的完整地图数据。 */
export interface MapData {
  version: number;
  seed: number;
  worldSizeMeters: number;
  pageSizeMeters: number;
  heightPageResolution: number;
  heightPageKeys: string[];
  heightPages: Record<string, HeightPageData>;
  loadHeightPage?: HeightPageLoader;
  terrainPath: typeof MAP_TERRAIN_HEIGHT_PATH;
  paintPath: typeof MAP_PAINT_PATH;
  paint: MapPaintData;
  vegetationPath: typeof MAP_VEGETATION_MODELS_PATH;
  objectsPath: typeof MAP_WORLD_OBJECTS_PATH;
  metadata: MapMetadata;
  dirtyHeightPageKeys?: readonly string[];
}

export interface MapManifest {
  version: number;
  seed: number;
  world: {
    sizeMeters: number;
    pageSizeMeters: number;
    originX: 0;
    originZ: 0;
  };
  terrainPath: typeof MAP_TERRAIN_HEIGHT_PATH;
  paintPath: typeof MAP_PAINT_PATH;
  vegetationPath: typeof MAP_VEGETATION_MODELS_PATH;
  objectsPath: typeof MAP_WORLD_OBJECTS_PATH;
  metadata: MapMetadata;
}

export const MAP_DATA_VERSION = 8;
export const MAP_VEGETATION_MODELS_PATH = "vegetation/models.json";
export const MAP_WORLD_OBJECTS_PATH = "objects/manifest.json";
export const DEFAULT_OPEN_WORLD_SIZE_METERS = 3200;
export const DEFAULT_MAP_PAGE_SIZE_METERS = 64;
export const DEFAULT_HEIGHT_PAGE_RESOLUTION = 129;

export function createEmptyMapData(
  seed: number,
  heightPageResolution: number,
  pageSizeMeters: number,
  name = "Untitled Map",
  worldSizeMeters = DEFAULT_OPEN_WORLD_SIZE_METERS,
): MapData {
  const now = Date.now();
  return {
    version: MAP_DATA_VERSION,
    seed,
    worldSizeMeters,
    pageSizeMeters,
    heightPageResolution,
    heightPageKeys: [],
    heightPages: {},
    terrainPath: MAP_TERRAIN_HEIGHT_PATH,
    paintPath: MAP_PAINT_PATH,
    paint: createEmptyPaintData(),
    vegetationPath: MAP_VEGETATION_MODELS_PATH,
    objectsPath: MAP_WORLD_OBJECTS_PATH,
    metadata: {
      name,
      created: now,
      modified: now,
    },
  };
}

export function hasHeightPages(mapData: MapData): boolean {
  return getHeightPageKeys(mapData).length > 0;
}

export function getHeightPageKeys(mapData: MapData): string[] {
  return mapData.heightPageKeys.length > 0
    ? sortPageKeys(mapData.heightPageKeys)
    : sortPageKeys(Object.keys(mapData.heightPages));
}

export function getHeightPageData(
  mapData: MapData,
  px: number,
  pz: number,
): HeightPageData | undefined {
  return mapData.heightPages[pageKey(px, pz)];
}

export function setHeightPageData(
  mapData: MapData,
  px: number,
  pz: number,
  heights: Float32Array | ArrayLike<number>,
): void {
  const key = pageKey(px, pz);
  mapData.heightPages[key] = {
    heights: heights instanceof Float32Array ? new Float32Array(heights) : Float32Array.from(heights),
  };
  if (!mapData.heightPageKeys.includes(key)) {
    mapData.heightPageKeys = sortPageKeys([...mapData.heightPageKeys, key]);
  }
}

export function createMapManifest(mapData: MapData): MapManifest {
  return {
    version: MAP_DATA_VERSION,
    seed: mapData.seed,
    world: {
      sizeMeters: mapData.worldSizeMeters,
      pageSizeMeters: mapData.pageSizeMeters,
      originX: 0,
      originZ: 0,
    },
    terrainPath: normalizeTerrainPath(mapData.terrainPath),
    paintPath: normalizePaintPath(mapData.paintPath),
    vegetationPath: normalizeVegetationPath(mapData.vegetationPath),
    objectsPath: normalizeObjectsPath(mapData.objectsPath),
    metadata: { ...mapData.metadata },
  };
}

export function serializeMapManifest(mapData: MapData): string {
  return `${JSON.stringify(createMapManifest(mapData), null, 2)}\n`;
}

export function deserializeMapManifest(json: string): MapManifest {
  const parsed = JSON.parse(json) as Partial<MapManifest>;

  if (parsed.version !== MAP_DATA_VERSION) {
    throw new Error(`Map manifest version ${parsed.version ?? "unknown"} is not supported`);
  }

  const seed = parsed.seed;
  const world = parsed.world;

  if (!Number.isFinite(seed) || !world || !Number.isFinite(world.sizeMeters) || !Number.isFinite(world.pageSizeMeters)) {
    throw new Error("Map manifest has invalid world settings");
  }

  if (world.originX !== 0 || world.originZ !== 0) {
    throw new Error("Map manifest origin must be zero for the current virtual page coordinate system");
  }

  if (!parsed.metadata?.name || !Number.isFinite(parsed.metadata.created) || !Number.isFinite(parsed.metadata.modified)) {
    throw new Error("Map manifest has invalid metadata");
  }

  return {
    version: MAP_DATA_VERSION,
    seed: seed!,
    world: {
      sizeMeters: world.sizeMeters,
      pageSizeMeters: world.pageSizeMeters,
      originX: 0,
      originZ: 0,
    },
    terrainPath: normalizeTerrainPath(parsed.terrainPath),
    paintPath: normalizePaintPath(parsed.paintPath),
    vegetationPath: normalizeVegetationPath(parsed.vegetationPath),
    objectsPath: normalizeObjectsPath(parsed.objectsPath),
    metadata: {
      name: parsed.metadata.name,
      created: parsed.metadata.created,
      modified: parsed.metadata.modified,
    },
  };
}

export function createMapDataFromManifest(
  manifest: MapManifest,
  terrainManifest: TerrainHeightManifest,
  heightPages: Record<string, HeightPageData>,
): MapData {
  if (terrainManifest.pageSizeMeters !== manifest.world.pageSizeMeters) {
    throw new Error("Terrain height manifest page size does not match map manifest");
  }

  return {
    version: MAP_DATA_VERSION,
    seed: manifest.seed,
    worldSizeMeters: manifest.world.sizeMeters,
    pageSizeMeters: manifest.world.pageSizeMeters,
    heightPageResolution: terrainManifest.pageResolution,
    heightPageKeys: getTerrainHeightPageKeys(terrainManifest),
    heightPages,
    terrainPath: normalizeTerrainPath(manifest.terrainPath),
    paintPath: normalizePaintPath(manifest.paintPath),
    paint: createEmptyPaintData(),
    vegetationPath: normalizeVegetationPath(manifest.vegetationPath),
    objectsPath: normalizeObjectsPath(manifest.objectsPath),
    metadata: { ...manifest.metadata },
  };
}

function normalizeTerrainPath(value: unknown): typeof MAP_TERRAIN_HEIGHT_PATH {
  if (value !== MAP_TERRAIN_HEIGHT_PATH) {
    throw new Error("Map manifest has invalid terrain height path");
  }

  return MAP_TERRAIN_HEIGHT_PATH;
}

function normalizePaintPath(value: unknown): typeof MAP_PAINT_PATH {
  if (value !== MAP_PAINT_PATH) {
    throw new Error("Map manifest has invalid paint path");
  }

  return MAP_PAINT_PATH;
}

function normalizeVegetationPath(value: unknown): typeof MAP_VEGETATION_MODELS_PATH {
  if (value !== MAP_VEGETATION_MODELS_PATH) {
    throw new Error("Map manifest has invalid vegetation path");
  }

  return MAP_VEGETATION_MODELS_PATH;
}

function normalizeObjectsPath(value: unknown): typeof MAP_WORLD_OBJECTS_PATH {
  if (value !== MAP_WORLD_OBJECTS_PATH) {
    throw new Error("Map manifest has invalid world objects path");
  }

  return MAP_WORLD_OBJECTS_PATH;
}


