// MapData: terrain editor map data types and serialization.
// MapData：地形编辑器地图数据类型和序列化

/**
 * Chunk height data: full height data for a single chunk.
 * Chunk 高度数据：单个 chunk 的完整高度数据
 */
export interface ChunkHeightData {
  // Full height array (resolution x resolution), base64 encoded in JSON.
  // 完整高度数组（resolution x resolution），JSON 中使用 base64 编码
  heights: number[];
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
}

export const MAP_DATA_VERSION = 2;

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
  const [cx, cz] = key.split(",").map(Number);
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
  heights: number[]
): void {
  const key = chunkKey(cx, cz);
  mapData.chunks[key] = { heights };
}

export function serializeMapData(mapData: MapData): string {
  mapData.metadata.modified = Date.now();

  const serializable: MapDataSerialized = {
    version: mapData.version,
    seed: mapData.seed,
    tileResolution: mapData.tileResolution,
    chunkSizeMeters: mapData.chunkSizeMeters,
    chunks: {},
    metadata: mapData.metadata,
  };

  for (const [key, chunkData] of Object.entries(mapData.chunks)) {
    const float32 = new Float32Array(chunkData.heights);
    const uint8 = new Uint8Array(float32.buffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);
    serializable.chunks[key] = { heightsBase64: base64 };
  }

  return JSON.stringify(serializable);
}

export function deserializeMapData(json: string): MapData {
  const serialized = JSON.parse(json) as MapDataSerialized;

  if (serialized.version < MAP_DATA_VERSION) {
    console.warn(`[MapData] Migrating map from version ${serialized.version} to ${MAP_DATA_VERSION}`);
  }

  const mapData: MapData = {
    version: MAP_DATA_VERSION,
    seed: serialized.seed,
    tileResolution: serialized.tileResolution,
    chunkSizeMeters: serialized.chunkSizeMeters,
    chunks: {},
    metadata: serialized.metadata,
  };

  for (const [key, chunkData] of Object.entries(serialized.chunks)) {
    const binary = atob(chunkData.heightsBase64);
    const uint8 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      uint8[i] = binary.charCodeAt(i);
    }
    const float32 = new Float32Array(uint8.buffer);
    mapData.chunks[key] = { heights: Array.from(float32) };
  }

  return mapData;
}

interface ChunkHeightDataSerialized {
  heightsBase64: string;
}

interface MapDataSerialized {
  version: number;
  seed: number;
  tileResolution: number;
  chunkSizeMeters: number;
  chunks: Record<string, ChunkHeightDataSerialized>;
  metadata: MapMetadata;
}