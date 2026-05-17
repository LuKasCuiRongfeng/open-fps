// MapData: virtual open-world map page schema and manifest helpers.
// MapData：虚拟开放世界地图 page 架构与清单辅助函数。

import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";
import {
  pageKey,
  sortPageKeys,
} from "./PageGrid";
import {
  getTerrainHeightPageKeys,
  MAP_TERRAIN_HEIGHT_PATH,
  type TerrainHeightManifest,
} from "./TerrainHeightData";

export { pageKey, parsePageKey, sortPageKeys } from "./PageGrid";
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

export interface MapPaintData {
  splatMaps: {
    format: typeof MAP_PAINT_PAGE_FORMAT;
    resolution: number;
    directory: typeof MAP_PAINT_PAGES_DIRECTORY;
    indices: number[];
  };
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
  metadata: MapMetadata;
}

export const MAP_DATA_VERSION = 8;
export const MAP_PAINT_PATH = "paint/layers.json";
export const MAP_PAINT_PAGES_DIRECTORY = "paint/pages";
export const MAP_PAINT_PAGE_FORMAT = "rgba8-splat-v1";
export const MAP_VEGETATION_MODELS_PATH = "vegetation/models.json";
export const DEFAULT_OPEN_WORLD_SIZE_METERS = 3200;
export const DEFAULT_MAP_PAGE_SIZE_METERS = 64;
export const DEFAULT_HEIGHT_PAGE_RESOLUTION = 129;
export const DEFAULT_PAINT_PAGE_RESOLUTION = 1024;

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
    metadata: {
      name,
      created: now,
      modified: now,
    },
  };
}

export function createEmptyPaintData(): MapPaintData {
  return {
    splatMaps: {
      format: MAP_PAINT_PAGE_FORMAT,
      resolution: DEFAULT_PAINT_PAGE_RESOLUTION,
      directory: MAP_PAINT_PAGES_DIRECTORY,
      indices: [],
    },
  };
}

export function clonePaintData(paintData: MapPaintData): MapPaintData {
  const normalized = normalizePaintData(paintData);
  return {
    splatMaps: {
      ...normalized.splatMaps,
      indices: [...normalized.splatMaps.indices],
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
    metadata: { ...manifest.metadata },
  };
}

export function getPaintPagePath(splatMapIndex: number): string {
  return `${MAP_PAINT_PAGES_DIRECTORY}/splat_${formatSplatMapIndex(splatMapIndex)}.paint.rgba`;
}

export function encodePaintPageBase64(pixels: Uint8Array | ArrayLike<number>, pageResolution: number): string {
  const expectedByteLength = getExpectedPaintPageByteLength(pageResolution);
  if (pixels.length !== expectedByteLength) {
    throw new Error(`Paint page requires ${expectedByteLength} RGBA8 bytes, got ${pixels.length}`);
  }

  return uint8ArrayToBase64(pixels instanceof Uint8Array ? pixels : Uint8Array.from(pixels));
}

export function decodePaintPageBase64(base64: string, pageResolution: number): Uint8Array {
  return decodePaintPageBytes(base64ToUint8Array(base64), pageResolution);
}

export function decodePaintPageBytes(bytes: Uint8Array, pageResolution: number): Uint8Array {
  const expectedByteLength = getExpectedPaintPageByteLength(pageResolution);
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(`Invalid paint page byte length: expected ${expectedByteLength}, got ${bytes.byteLength}`);
  }

  return new Uint8Array(bytes);
}

export function getExpectedPaintPageByteLength(pageResolution: number): number {
  return pageResolution * pageResolution * 4;
}

export function normalizePaintData(value: unknown): MapPaintData {
  const record = isRecord(value) ? value : {};
  const splatMaps = isRecord(record.splatMaps) ? record.splatMaps : {};
  return {
    splatMaps: {
      format: normalizePaintPageFormat(splatMaps.format),
      resolution: readPositiveNumber(splatMaps.resolution, DEFAULT_PAINT_PAGE_RESOLUTION, "paint splat map resolution"),
      directory: normalizePaintPagesDirectory(splatMaps.directory),
      indices: normalizeSplatMapIndices(splatMaps.indices ?? []),
    },
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

function normalizePaintPageFormat(value: unknown): typeof MAP_PAINT_PAGE_FORMAT {
  if (value === undefined || value === MAP_PAINT_PAGE_FORMAT) {
    return MAP_PAINT_PAGE_FORMAT;
  }

  throw new Error("Paint manifest has invalid splat map format");
}

function normalizePaintPagesDirectory(value: unknown): typeof MAP_PAINT_PAGES_DIRECTORY {
  if (value === undefined || value === MAP_PAINT_PAGES_DIRECTORY) {
    return MAP_PAINT_PAGES_DIRECTORY;
  }

  throw new Error("Paint manifest has invalid splat map directory");
}

function normalizeVegetationPath(value: unknown): typeof MAP_VEGETATION_MODELS_PATH {
  if (value !== MAP_VEGETATION_MODELS_PATH) {
    throw new Error("Map manifest has invalid vegetation path");
  }

  return MAP_VEGETATION_MODELS_PATH;
}

function normalizeSplatMapIndices(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("Paint manifest splat map indices must be an array");
  }

  const indices = new Set<number>();
  for (const index of value) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Paint manifest has invalid splat map index '${String(index)}'`);
    }

    if (indices.has(index)) {
      throw new Error(`Paint manifest has duplicate splat map index '${index}'`);
    }

    indices.add(index);
  }

  return Array.from(indices).sort((left, right) => left - right);
}

function formatSplatMapIndex(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Splat map index must be a non-negative integer: ${value}`);
  }

  return `${value}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPositiveNumber(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Map manifest has invalid ${label}`);
  }

  return value;
}

