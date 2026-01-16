// TerrainHeightSampler: GPU-first CPU-side height sampling.
// TerrainHeightSampler：GPU-first 的 CPU 侧高度采样

import type { TerrainConfig } from "./terrain";

/**
 * GPU-first height sampler: stores height data from GPU readback.
 * GPU-first 高度采样器：存储从 GPU 回读的高度数据
 *
 * Key design (GPU-first principle):
 * - Height is ONLY computed on GPU (TerrainHeightCompute)
 * - After GPU bake, data is read back ONCE per chunk
 * - CPU samples from this cached readback data
 * - NO duplicate noise implementation on CPU
 *
 * 关键设计（GPU-first 原则）：
 * - 高度仅在 GPU 上计算（TerrainHeightCompute）
 * - GPU 烘焙后，每个 chunk 回读一次数据
 * - CPU 从这个缓存的回读数据采样
 * - CPU 上不重复实现噪声函数
 */
export class TerrainHeightSampler {
  // Cache: Map<chunkKey, Float32Array> from GPU readback.
  // 缓存：Map<chunkKey, Float32Array>，来自 GPU 回读
  private static cache = new Map<string, Float32Array>();

  // Resolution of cached tiles (must match GPU tile resolution).
  // 缓存 tile 的分辨率（必须与 GPU tile 分辨率匹配）
  private static tileResolution = 0;

  // Chunk size in meters.
  // Chunk 大小（米）
  private static chunkSizeMeters = 0;

  // Base height for fallback.
  // 备用基础高度
  private static baseHeight = 0;

  /**
   * Initialize the sampler with config.
   * 使用配置初始化采样器
   */
  static init(config: TerrainConfig): void {
    this.tileResolution = config.gpuCompute.tileResolution;
    this.chunkSizeMeters = config.streaming.chunkSizeMeters;
    this.baseHeight = config.height.baseHeightMeters;
  }

  /**
   * Clear all cached height data.
   * 清除所有缓存的高度数据
   */
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Store height data from GPU readback for a chunk.
   * 存储从 GPU 回读的 chunk 高度数据
   *
   * @param cx Chunk X coordinate.
   * @param cz Chunk Z coordinate.
   * @param heightData Height data from GPU readback (must be tileResolution x tileResolution).
   */
  static setChunkHeightData(cx: number, cz: number, heightData: Float32Array): void {
    const key = `${cx},${cz}`;

    // Clone the data to avoid reference issues.
    // 克隆数据以避免引用问题
    this.cache.set(key, new Float32Array(heightData));
  }

  /**
   * Get raw height data for a chunk (for saving map).
   * 获取 chunk 的原始高度数据（用于保存地图）
   */
  static getChunkHeightData(cx: number, cz: number): Float32Array | null {
    const key = `${cx},${cz}`;
    return this.cache.get(key) ?? null;
  }

  /**
   * Get all cached chunk keys.
   * 获取所有缓存的 chunk 键
   */
  static getAllCachedChunkKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Remove cached height data for a chunk (on unload).
   * 移除 chunk 的缓存高度数据（卸载时）
   */
  static removeChunkHeightData(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    this.cache.delete(key);
  }

  /**
   * Check if a chunk has cached height data.
   * 检查 chunk 是否有缓存的高度数据
   */
  static hasChunkData(cx: number, cz: number): boolean {
    const key = `${cx},${cz}`;
    return this.cache.has(key);
  }

  /**
   * Get the tile resolution.
   * 获取 tile 分辨率
   */
  static getTileResolution(): number {
    return this.tileResolution;
  }

  /**
   * Get the chunk size in meters.
   * 获取 chunk 大小（米）
   */
  static getChunkSizeMeters(): number {
    return this.chunkSizeMeters;
  }

  /**
   * Get height at a world position (bilinear interpolation from GPU-baked data).
   * 获取世界位置的高度（从 GPU 烘焙数据双线性插值）
   *
   * @param worldX World X coordinate.
   * @param worldZ World Z coordinate.
   * @param _config TerrainConfig (kept for API compatibility).
   */
  static heightAt(worldX: number, worldZ: number, _config: TerrainConfig): number {
    if (this.tileResolution === 0 || this.chunkSizeMeters === 0) {
      // Not initialized, return base height.
      // 未初始化，返回基础高度
      return this.baseHeight || _config.height.baseHeightMeters;
    }

    const chunkSize = this.chunkSizeMeters;
    const samples = this.tileResolution;

    // Determine chunk coordinates.
    // 确定 chunk 坐标
    const cx = Math.floor(worldX / chunkSize);
    const cz = Math.floor(worldZ / chunkSize);
    const key = `${cx},${cz}`;

    // Get cached height data.
    // 获取缓存的高度数据
    const heightData = this.cache.get(key);
    if (!heightData) {
      // Chunk not loaded yet, return base height.
      // Chunk 尚未加载，返回基础高度
      return this.baseHeight;
    }

    // Bilinear interpolation within chunk.
    // chunk 内的双线性插值
    const chunkOriginX = cx * chunkSize;
    const chunkOriginZ = cz * chunkSize;

    const localX = worldX - chunkOriginX;
    const localZ = worldZ - chunkOriginZ;

    // Convert to sample coordinates.
    // 转换为采样坐标
    const u = (localX / chunkSize) * (samples - 1);
    const v = (localZ / chunkSize) * (samples - 1);

    const u0 = Math.floor(u);
    const v0 = Math.floor(v);
    const u1 = Math.min(u0 + 1, samples - 1);
    const v1 = Math.min(v0 + 1, samples - 1);

    const fu = u - u0;
    const fv = v - v0;

    // Sample four corners.
    // 采样四个角
    const h00 = heightData[v0 * samples + u0];
    const h10 = heightData[v0 * samples + u1];
    const h01 = heightData[v1 * samples + u0];
    const h11 = heightData[v1 * samples + u1];

    // Bilinear interpolation.
    // 双线性插值
    const h0 = h00 + (h10 - h00) * fu;
    const h1 = h01 + (h11 - h01) * fu;
    return h0 + (h1 - h0) * fv;
  }
}
