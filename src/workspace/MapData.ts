// MapData: terrain editor map data types and manifest helpers.
// MapData：地形编辑器地图数据类型和清单辅助函数

import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";

/**
 * Chunk height data: full height data for a single chunk.
 * Chunk 高度数据：单个 chunk 的完整高度数据
 */
export interface ChunkHeightData {
  // Full height array (resolution x resolution), stored as binary float32 chunks on disk.
  // 完整高度数组（resolution x resolution），在磁盘上以二进制 float32 chunk 存储
  heights: Float32Array;
}

/**
 * Map metadata.
 * 地图元数据
 */
export interface MapMetadata {
  name: string;
  created: number;
  modified: number;
}

/**
 * Complete map data for save/load.
 * 完整的地图数据，用于保存/加载
 */
export interface MapData {
  version: number;
  seed: number;
  tileResolution: number;
  chunkSizeMeters: number;
  chunks: Record<string, ChunkHeightData>;
  metadata: MapMetadata;
  dirtyChunkKeys?: readonly string[];
}

export interface MapChunkReference {
  path: string;
  byteLength: number;
}

export interface MapChunkBounds {
  minChunkX: number;
  maxChunkX: number;
  minChunkZ: number;
  maxChunkZ: number;
}

export interface MapManifest {
  version: number;
  seed: number;
  tileResolution: number;
  chunkSizeMeters: number;
  heightFormat: typeof MAP_HEIGHT_FORMAT;
  chunksDirectory: typeof MAP_HEIGHT_CHUNKS_DIRECTORY;
  chunks: Record<string, MapChunkReference>;
  bounds: MapChunkBounds | null;
  metadata: MapMetadata;
}

export const MAP_DATA_VERSION = 3;
export const MAP_HEIGHT_FORMAT = "float32le";
export const MAP_HEIGHT_CHUNKS_DIRECTORY = "terrain/chunks";

export function createEmptyMapData(
  seed: number,
  tileResolution: number,
  chunkSizeMeters: number,
  name = "Untitled Map"
): MapData {
  const now = Date.now();
  return {
    version: MAP_DATA_VERSION,
    seed,
    tileResolution,
    chunkSizeMeters,
    chunks: {},
    metadata: {
      name,
      created: now,
      modified: now,
    },
  };
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function parseChunkKey(key: string): { cx: number; cz: number } {
  const match = key.match(/^(-?\d+),(-?\d+)$/);
  if (!match) {
    throw new Error(`Invalid chunk key '${key}'`);
  }

  const cx = Number(match[1]);
  const cz = Number(match[2]);
  return { cx, cz };
}

export function hasChunks(mapData: MapData): boolean {
  return Object.keys(mapData.chunks).length > 0;
}

export function getChunkData(
  mapData: MapData,
  cx: number,
  cz: number
): ChunkHeightData | undefined {
  const key = chunkKey(cx, cz);
  return mapData.chunks[key];
}

export function setChunkData(
  mapData: MapData,
  cx: number,
  cz: number,
  heights: Float32Array | ArrayLike<number>
): void {
  const key = chunkKey(cx, cz);
  mapData.chunks[key] = {
    heights: heights instanceof Float32Array ? new Float32Array(heights) : Float32Array.from(heights),
  };
}

export function createMapManifest(mapData: MapData): MapManifest {
  const chunks: Record<string, MapChunkReference> = {};

  for (const key of Object.keys(mapData.chunks).sort(compareChunkKeys)) {
    const { cx, cz } = parseChunkKey(key);
    chunks[key] = {
      path: getHeightChunkPath(cx, cz),
      byteLength: getExpectedHeightChunkByteLength(mapData.tileResolution),
    };
  }

  return {
    version: MAP_DATA_VERSION,
    seed: mapData.seed,
    tileResolution: mapData.tileResolution,
    chunkSizeMeters: mapData.chunkSizeMeters,
    heightFormat: MAP_HEIGHT_FORMAT,
    chunksDirectory: MAP_HEIGHT_CHUNKS_DIRECTORY,
    chunks,
    bounds: getMapChunkBounds(mapData),
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

  if (parsed.heightFormat !== MAP_HEIGHT_FORMAT) {
    throw new Error(`Map height format '${parsed.heightFormat ?? "unknown"}' is not supported`);
  }

  if (parsed.chunksDirectory !== MAP_HEIGHT_CHUNKS_DIRECTORY) {
    throw new Error(`Map chunks directory '${parsed.chunksDirectory ?? "unknown"}' is not supported`);
  }

  const seed = parsed.seed;
  const tileResolution = parsed.tileResolution;
  const chunkSizeMeters = parsed.chunkSizeMeters;

  if (!Number.isFinite(seed) || !Number.isFinite(tileResolution) || !Number.isFinite(chunkSizeMeters)) {
    throw new Error("Map manifest has invalid terrain settings");
  }

  if (!parsed.metadata?.name || !Number.isFinite(parsed.metadata.created) || !Number.isFinite(parsed.metadata.modified)) {
    throw new Error("Map manifest has invalid metadata");
  }

  if (!parsed.chunks || typeof parsed.chunks !== "object") {
    throw new Error("Map manifest must contain chunk references");
  }

  const chunks: Record<string, MapChunkReference> = {};
  const expectedByteLength = getExpectedHeightChunkByteLength(tileResolution!);

  for (const [key, reference] of Object.entries(parsed.chunks)) {
    parseChunkKey(key);
    if (!reference || typeof reference.path !== "string" || !reference.path.startsWith(`${MAP_HEIGHT_CHUNKS_DIRECTORY}/`)) {
      throw new Error(`Map chunk '${key}' has an invalid path`);
    }

    if (reference.byteLength !== expectedByteLength) {
      throw new Error(`Map chunk '${key}' has invalid byte length ${reference.byteLength}`);
    }

    chunks[key] = {
      path: reference.path,
      byteLength: reference.byteLength,
    };
  }

  return {
    version: MAP_DATA_VERSION,
    seed: seed!,
    tileResolution: tileResolution!,
    chunkSizeMeters: chunkSizeMeters!,
    heightFormat: MAP_HEIGHT_FORMAT,
    chunksDirectory: MAP_HEIGHT_CHUNKS_DIRECTORY,
    chunks,
    bounds: parsed.bounds ?? null,
    metadata: {
      name: parsed.metadata.name,
      created: parsed.metadata.created,
      modified: parsed.metadata.modified,
    },
  };
}

export function createMapDataFromManifest(
  manifest: MapManifest,
  chunks: Record<string, ChunkHeightData>,
): MapData {
  return {
    version: MAP_DATA_VERSION,
    seed: manifest.seed,
    tileResolution: manifest.tileResolution,
    chunkSizeMeters: manifest.chunkSizeMeters,
    chunks,
    metadata: { ...manifest.metadata },
  };
}

export function getHeightChunkPath(cx: number, cz: number): string {
  return `${MAP_HEIGHT_CHUNKS_DIRECTORY}/${formatChunkCoordinate(cx)}_${formatChunkCoordinate(cz)}.height.f32`;
}

export function encodeHeightChunkBase64(heights: Float32Array, tileResolution: number): string {
  validateHeightChunkLength(heights, tileResolution);

  const bytes = new Uint8Array(heights.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < heights.length; index += 1) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, heights[index], true);
  }

  return uint8ArrayToBase64(bytes);
}

export function decodeHeightChunkBase64(base64: string, tileResolution: number): Float32Array {
  return decodeHeightChunkBytes(base64ToUint8Array(base64), tileResolution);
}

export function decodeHeightChunkBytes(bytes: Uint8Array, tileResolution: number): Float32Array {
  // EN: Bundled game data is fetched as raw binary, while editor storage still uses base64 over native commands.
  // 中文: 随游戏打包的数据以原始二进制读取，而编辑器存储仍通过原生命令传递 base64。
  const expectedByteLength = getExpectedHeightChunkByteLength(tileResolution);
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(`Invalid height chunk byte length: expected ${expectedByteLength}, got ${bytes.byteLength}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const heights = new Float32Array(tileResolution * tileResolution);
  for (let index = 0; index < heights.length; index += 1) {
    heights[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }

  return heights;
}

export function getExpectedHeightChunkByteLength(tileResolution: number): number {
  return tileResolution * tileResolution * Float32Array.BYTES_PER_ELEMENT;
}

function validateHeightChunkLength(heights: Float32Array, tileResolution: number): void {
  const expectedLength = tileResolution * tileResolution;
  if (heights.length !== expectedLength) {
    throw new Error(`Invalid height chunk length: expected ${expectedLength}, got ${heights.length}`);
  }
}

function getMapChunkBounds(mapData: MapData): MapChunkBounds | null {
  const keys = Object.keys(mapData.chunks);
  if (keys.length === 0) {
    return null;
  }

  let minChunkX = Number.POSITIVE_INFINITY;
  let maxChunkX = Number.NEGATIVE_INFINITY;
  let minChunkZ = Number.POSITIVE_INFINITY;
  let maxChunkZ = Number.NEGATIVE_INFINITY;

  for (const key of keys) {
    const { cx, cz } = parseChunkKey(key);
    minChunkX = Math.min(minChunkX, cx);
    maxChunkX = Math.max(maxChunkX, cx);
    minChunkZ = Math.min(minChunkZ, cz);
    maxChunkZ = Math.max(maxChunkZ, cz);
  }

  return { minChunkX, maxChunkX, minChunkZ, maxChunkZ };
}

function compareChunkKeys(left: string, right: string): number {
  const a = parseChunkKey(left);
  const b = parseChunkKey(right);
  return a.cz - b.cz || a.cx - b.cx;
}

function formatChunkCoordinate(value: number): string {
  if (!Number.isInteger(value)) {
    throw new Error(`Chunk coordinate must be an integer: ${value}`);
  }

  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

