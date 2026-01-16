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
  created: number;   // Unix timestamp / Unix 时间戳
  modified: number;  // Unix timestamp / Unix 时间戳
}

/**
 * Complete map data for save/load.
 * 完整的地图数据，用于保存/加载
 *
 * Simplified design (v2):
 * - Stores FULL HEIGHT data, not deltas
 * - User saves procedural terrain first, then edits the saved copy
 * - No complex GPU read-write, just CPU edit + GPU upload
 *
 * 简化设计（v2）：
 * - 存储完整高度数据，而非增量
 * - 用户先保存程序地形，然后编辑保存的副本
 * - 无复杂的 GPU 读写，只需 CPU 编辑 + GPU 上传
 */
export interface MapData {
  // Format version for future compatibility.
  // 格式版本，用于未来兼容
  version: number;

  // Terrain seed used for procedural generation (for reference).
  // 程序生成使用的地形种子（仅供参考）
  seed: number;

  // Resolution per chunk tile (must match GPU config).
  // 每个 chunk tile 的分辨率（必须与 GPU 配置匹配）
  tileResolution: number;

  // Chunk size in meters.
  // Chunk 大小（米）
  chunkSizeMeters: number;

  // Chunk data keyed by "cx,cz".
  // Chunk 数据，键为 "cx,cz"
  chunks: Record<string, ChunkHeightData>;

  // Map metadata.
  // 地图元数据
  metadata: MapMetadata;
}

// Current map data format version.
// 当前地图数据格式版本
export const MAP_DATA_VERSION = 2;

/**
 * Create empty map data with default metadata.
 * 创建带有默认元数据的空地图数据
 */
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

/**
 * Create chunk key from coordinates.
 * 从坐标创建 chunk 键
 */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/**
 * Parse chunk key to coordinates.
 * 解析 chunk 键为坐标
 */
export function parseChunkKey(key: string): { cx: number; cz: number } {
  const [cx, cz] = key.split(",").map(Number);
  return { cx, cz };
}

/**
 * Check if map data has any chunks.
 * 检查地图数据是否有任何 chunk
 */
export function hasChunks(mapData: MapData): boolean {
  return Object.keys(mapData.chunks).length > 0;
}

/**
 * Get chunk height data (returns undefined if not present).
 * 获取 chunk 高度数据（如果不存在则返回 undefined）
 */
export function getChunkData(
  mapData: MapData,
  cx: number,
  cz: number
): ChunkHeightData | undefined {
  const key = chunkKey(cx, cz);
  return mapData.chunks[key];
}

/**
 * Set chunk height data.
 * 设置 chunk 高度数据
 */
export function setChunkData(
  mapData: MapData,
  cx: number,
  cz: number,
  heights: number[]
): void {
  const key = chunkKey(cx, cz);
  mapData.chunks[key] = { heights };
}

/**
 * Serialize map data to JSON string.
 * 序列化地图数据为 JSON 字符串
 *
 * Uses base64 encoding for height arrays to reduce file size.
 * 使用 base64 编码高度数组以减小文件大小
 */
export function serializeMapData(mapData: MapData): string {
  // Update modified timestamp.
  // 更新修改时间戳
  mapData.metadata.modified = Date.now();

  // Convert height arrays to base64 for smaller file size.
  // 将高度数组转换为 base64 以减小文件大小
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
    const base64 = btoa(String.fromCharCode(...uint8));
    serializable.chunks[key] = { heightsBase64: base64 };
  }

  return JSON.stringify(serializable);
}

/**
 * Deserialize map data from JSON string.
 * 从 JSON 字符串反序列化地图数据
 */
export function deserializeMapData(json: string): MapData {
  const serialized = JSON.parse(json) as MapDataSerialized;

  // Version migration if needed.
  // 如果需要版本迁移
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

  // Convert base64 back to height arrays.
  // 将 base64 转换回高度数组
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

// --- Internal serialization types / 内部序列化类型 ---

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
