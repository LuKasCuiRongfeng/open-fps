// MapData: virtual open-world map page schema and manifest helpers.
// MapData：虚拟开放世界地图 page 架构与清单辅助函数。

import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";

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
  materialSetPath: typeof MAP_PAINT_MATERIAL_SET_PATH;
  pageResolution: number;
  pageFormat: typeof MAP_PAINT_PAGE_FORMAT;
  pagesDirectory: typeof MAP_PAINT_PAGES_DIRECTORY;
  pageKeys: string[];
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
  terrain: {
    height: {
      format: typeof MAP_HEIGHT_FORMAT;
      pagesDirectory: typeof MAP_HEIGHT_PAGES_DIRECTORY;
      pageResolution: number;
      // EN: Sparse height page keys are authoritative; file paths are always derived from each key.
      // 中文: 稀疏高度 page key 是权威清单；文件路径始终由 key 推导。
      pageKeys: string[];
    };
  };
  paint: MapPaintData;
  vegetationPath: typeof MAP_VEGETATION_MODELS_PATH;
  metadata: MapMetadata;
}

export const MAP_DATA_VERSION = 6;
export const MAP_HEIGHT_FORMAT = "float32le";
export const MAP_HEIGHT_PAGES_DIRECTORY = "terrain/height/pages";
export const MAP_PAINT_MATERIAL_SET_PATH = "paint/layers.json";
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
    materialSetPath: MAP_PAINT_MATERIAL_SET_PATH,
    pageResolution: DEFAULT_PAINT_PAGE_RESOLUTION,
    pageFormat: MAP_PAINT_PAGE_FORMAT,
    pagesDirectory: MAP_PAINT_PAGES_DIRECTORY,
    pageKeys: [],
  };
}

export function pageKey(px: number, pz: number): string {
  return `${px},${pz}`;
}

export function parsePageKey(key: string): { px: number; pz: number } {
  const match = key.match(/^(-?\d+),(-?\d+)$/);
  if (!match) {
    throw new Error(`Invalid page key '${key}'`);
  }

  const px = Number(match[1]);
  const pz = Number(match[2]);
  return { px, pz };
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
    terrain: {
      height: {
        format: MAP_HEIGHT_FORMAT,
        pagesDirectory: MAP_HEIGHT_PAGES_DIRECTORY,
        pageResolution: mapData.heightPageResolution,
        pageKeys: getHeightPageKeys(mapData),
      },
    },
    paint: normalizePaintData(mapData.paint),
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
  const height = parsed.terrain?.height;

  if (!Number.isFinite(seed) || !world || !Number.isFinite(world.sizeMeters) || !Number.isFinite(world.pageSizeMeters)) {
    throw new Error("Map manifest has invalid world settings");
  }

  if (world.originX !== 0 || world.originZ !== 0) {
    throw new Error("Map manifest origin must be zero for the current virtual page coordinate system");
  }

  if (!height || height.format !== MAP_HEIGHT_FORMAT || height.pagesDirectory !== MAP_HEIGHT_PAGES_DIRECTORY) {
    throw new Error("Map manifest has invalid height page settings");
  }

  if (!Number.isFinite(height.pageResolution) || height.pageResolution <= 1) {
    throw new Error("Map manifest has invalid height page resolution");
  }

  if (!parsed.metadata?.name || !Number.isFinite(parsed.metadata.created) || !Number.isFinite(parsed.metadata.modified)) {
    throw new Error("Map manifest has invalid metadata");
  }

  const heightPageKeys = normalizePageKeys(height.pageKeys, "height page");

  return {
    version: MAP_DATA_VERSION,
    seed: seed!,
    world: {
      sizeMeters: world.sizeMeters,
      pageSizeMeters: world.pageSizeMeters,
      originX: 0,
      originZ: 0,
    },
    terrain: {
      height: {
        format: MAP_HEIGHT_FORMAT,
        pagesDirectory: MAP_HEIGHT_PAGES_DIRECTORY,
        pageResolution: height.pageResolution,
        pageKeys: heightPageKeys,
      },
    },
    paint: normalizePaintData(parsed.paint),
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
  heightPages: Record<string, HeightPageData>,
): MapData {
  return {
    version: MAP_DATA_VERSION,
    seed: manifest.seed,
    worldSizeMeters: manifest.world.sizeMeters,
    pageSizeMeters: manifest.world.pageSizeMeters,
    heightPageResolution: manifest.terrain.height.pageResolution,
    heightPageKeys: sortPageKeys(manifest.terrain.height.pageKeys),
    heightPages,
    paint: normalizePaintData(manifest.paint),
    vegetationPath: normalizeVegetationPath(manifest.vegetationPath),
    metadata: { ...manifest.metadata },
  };
}

export function getHeightPagePath(px: number, pz: number): string {
  return `${MAP_HEIGHT_PAGES_DIRECTORY}/p_${formatGridCoordinate(px)}_${formatGridCoordinate(pz)}.height.f32`;
}

export function getHeightPagePathForKey(key: string): string {
  const { px, pz } = parsePageKey(key);
  return getHeightPagePath(px, pz);
}

export function getPaintPagePath(px: number, pz: number): string {
  return `${MAP_PAINT_PAGES_DIRECTORY}/p_${formatGridCoordinate(px)}_${formatGridCoordinate(pz)}.paint.rgba`;
}

export function getPaintPagePathForKey(key: string): string {
  const { px, pz } = parsePageKey(key);
  return getPaintPagePath(px, pz);
}

export function sortPageKeys(keys: Iterable<string>): string[] {
  return Array.from(keys).sort(comparePageKeys);
}

export function encodeHeightPageBase64(heights: Float32Array, pageResolution: number): string {
  validateHeightPageLength(heights, pageResolution);

  const bytes = new Uint8Array(heights.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < heights.length; index += 1) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, heights[index], true);
  }

  return uint8ArrayToBase64(bytes);
}

export function decodeHeightPageBase64(base64: string, pageResolution: number): Float32Array {
  return decodeHeightPageBytes(base64ToUint8Array(base64), pageResolution);
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

export function decodeHeightPageBytes(bytes: Uint8Array, pageResolution: number): Float32Array {
  // EN: Bundled game data is fetched as raw binary, while editor storage still uses base64 over native commands.
  // 中文: 随游戏打包的数据以原始二进制读取，而编辑器存储仍通过原生命令传递 base64。
  const expectedByteLength = getExpectedHeightPageByteLength(pageResolution);
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(`Invalid height page byte length: expected ${expectedByteLength}, got ${bytes.byteLength}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const heights = new Float32Array(pageResolution * pageResolution);
  for (let index = 0; index < heights.length; index += 1) {
    heights[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }

  return heights;
}

export function getExpectedHeightPageByteLength(pageResolution: number): number {
  return pageResolution * pageResolution * Float32Array.BYTES_PER_ELEMENT;
}

export function getExpectedPaintPageByteLength(pageResolution: number): number {
  return pageResolution * pageResolution * 4;
}

function normalizePaintData(value: Partial<MapPaintData> | null | undefined): MapPaintData {
  const pageKeys = normalizePageKeys(value?.pageKeys ?? [], "paint page");
  return {
    materialSetPath: MAP_PAINT_MATERIAL_SET_PATH,
    pageResolution: readPositiveNumber(value?.pageResolution, DEFAULT_PAINT_PAGE_RESOLUTION, "paint page resolution"),
    pageFormat: MAP_PAINT_PAGE_FORMAT,
    pagesDirectory: MAP_PAINT_PAGES_DIRECTORY,
    pageKeys,
  };
}

function normalizeVegetationPath(value: unknown): typeof MAP_VEGETATION_MODELS_PATH {
  if (value !== MAP_VEGETATION_MODELS_PATH) {
    throw new Error("Map manifest has invalid vegetation path");
  }

  return MAP_VEGETATION_MODELS_PATH;
}

function normalizePageKeys(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Map manifest ${label} keys must be an array`);
  }

  const keys = new Set<string>();
  for (const key of value) {
    if (typeof key !== "string") {
      throw new Error(`Map manifest ${label} keys must be strings`);
    }

    parsePageKey(key);
    if (keys.has(key)) {
      throw new Error(`Map manifest has duplicate ${label} key '${key}'`);
    }

    keys.add(key);
  }

  return sortPageKeys(keys);
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

function validateHeightPageLength(heights: Float32Array, pageResolution: number): void {
  const expectedLength = pageResolution * pageResolution;
  if (heights.length !== expectedLength) {
    throw new Error(`Invalid height page length: expected ${expectedLength}, got ${heights.length}`);
  }
}

function comparePageKeys(left: string, right: string): number {
  const a = parsePageKey(left);
  const b = parsePageKey(right);
  return a.pz - b.pz || a.px - b.px;
}

function formatGridCoordinate(value: number): string {
  if (!Number.isInteger(value)) {
    throw new Error(`Grid coordinate must be an integer: ${value}`);
  }

  return value < 0 ? `m${Math.abs(value)}` : String(value);
}
