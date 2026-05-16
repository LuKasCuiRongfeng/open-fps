// TerrainHeightSampler: GPU-first CPU-side height sampling.
// TerrainHeightSampler：GPU-first 的 CPU 侧高度采样

import type { TerrainConfig } from "./terrain";

/**
 * GPU-first height sampler: stores map-file heights plus edited GPU readback data.
 * GPU-first 高度采样器：存储地图文件高度以及编辑后的 GPU 回读数据
 *
 * Key design (GPU-first principle):
 * - Initial height data comes from loaded map height pages
 * - Brush edits read updated GPU height data back into this cache
 * - CPU samples only from this cache
 * - NO procedural height fallback on CPU
 *
 * 关键设计（GPU-first 原则）：
 * - 初始高度数据来自已加载地图的高度 page
 * - 画刷编辑会将更新后的 GPU 高度回读到此缓存
 * - CPU 只从此缓存采样
 * - CPU 上没有程序高度回退
 */
export class TerrainHeightSampler {
  // Cache: Map<pageKey, Float32Array> from map files or edited GPU readback.
  // 缓存：Map<pageKey, Float32Array>，来自地图文件或编辑后的 GPU 回读。
  private static cache = new Map<string, Float32Array>();

  // Dirty pages changed since the last successful project save.
  // 自上次成功保存项目以来发生变化的脏 page。
  private static dirtyPages = new Set<string>();

  // Resolution of cached tiles (must match GPU tile resolution).
  // 缓存 tile 的分辨率（必须与 GPU tile 分辨率匹配）
  private static tileResolution = 0;

  // Page size in meters.
  // Page 大小（米）。
  private static pageSizeMeters = 0;

  // Base height for fallback.
  // 备用基础高度
  private static baseHeight = 0;

  /**
   * Initialize the sampler with config.
   * 使用配置初始化采样器
   */
  static init(config: TerrainConfig): void {
    this.tileResolution = config.gpuCompute.tileResolution;
    this.pageSizeMeters = config.streaming.pageSizeMeters;
    this.baseHeight = config.height.baseHeightMeters;
  }

  /**
   * Clear all cached height data.
   * 清除所有缓存的高度数据
   */
  static clearCache(): void {
    this.cache.clear();
    this.dirtyPages.clear();
  }

  /**
  * Store height data for a page.
  * 存储 page 高度数据。
   *
   * @param px Page X coordinate.
   * @param pz Page Z coordinate.
  * @param heightData Height data (must be tileResolution x tileResolution).
   */
  static setPageHeightData(px: number, pz: number, heightData: Float32Array, dirty = false): void {
    const key = `${px},${pz}`;

    // Clone the data to avoid reference issues.
    // 克隆数据以避免引用问题
    this.cache.set(key, new Float32Array(heightData));

    if (dirty) {
      this.dirtyPages.add(key);
    }
  }

  /**
   * Mark all cached pages as clean after a successful save or load.
   * 成功保存或加载后，将所有缓存 page 标记为干净。
   */
  static clearDirtyPages(): void {
    this.dirtyPages.clear();
  }

  /**
   * Get page keys modified since the last clean state.
   * 获取自上次干净状态以来修改过的 page 键。
   */
  static getDirtyPageKeys(): string[] {
    return Array.from(this.dirtyPages.keys());
  }

  /**
   * Get raw height data for a page (for saving map).
   * 获取 page 的原始高度数据（用于保存地图）。
   */
  static getPageHeightData(px: number, pz: number): Float32Array | null {
    const key = `${px},${pz}`;
    return this.cache.get(key) ?? null;
  }

  /**
   * Check if a page has cached height data.
   * 检查 page 是否有缓存的高度数据。
   */
  static hasPageData(px: number, pz: number): boolean {
    const key = `${px},${pz}`;
    return this.cache.has(key);
  }

  /**
  * Get height at a world position (bilinear interpolation from loaded map data).
  * 获取世界位置的高度（从已加载地图数据双线性插值）
   *
   * @param worldX World X coordinate.
   * @param worldZ World Z coordinate.
   * @param _config TerrainConfig (kept for API compatibility).
   */
  static heightAt(worldX: number, worldZ: number, _config: TerrainConfig): number {
    if (this.tileResolution === 0 || this.pageSizeMeters === 0) {
      // Not initialized, return base height.
      // 未初始化，返回基础高度
      return this.baseHeight || _config.height.baseHeightMeters;
    }

    const pageSize = this.pageSizeMeters;
    const samples = this.tileResolution;

    // Determine page coordinates.
    // 确定 page 坐标。
    const px = Math.floor(worldX / pageSize);
    const pz = Math.floor(worldZ / pageSize);
    const key = `${px},${pz}`;

    // Get cached height data.
    // 获取缓存的高度数据
    const heightData = this.cache.get(key);
    if (!heightData) {
      // Page not loaded yet, return base height.
      // Page 尚未加载，返回基础高度。
      return this.baseHeight;
    }

    // Bilinear interpolation within page.
    // page 内的双线性插值。
    const pageOriginX = px * pageSize;
    const pageOriginZ = pz * pageSize;

    const localX = worldX - pageOriginX;
    const localZ = worldZ - pageOriginZ;

    // Convert to sample coordinates.
    // 转换为采样坐标
    const u = (localX / pageSize) * (samples - 1);
    const v = (localZ / pageSize) * (samples - 1);

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
