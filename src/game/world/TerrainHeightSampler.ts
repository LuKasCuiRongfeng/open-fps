// TerrainHeightSampler: CPU-side height sampling with caching.
// TerrainHeightSampler：带缓存的 CPU 侧高度采样

import type { TerrainConfig } from "./terrain";

/**
 * CPU-side height sampler with optional caching.
 * 带可选缓存的 CPU 侧高度采样器
 *
 * Provides fast heightAt queries without recomputing fBm each time.
 * 提供快速的 heightAt 查询，无需每次重新计算 fBm。
 */
export class TerrainHeightSampler {
  // Cache: Map<chunkKey, Float32Array>.
  // 缓存：Map<chunkKey, Float32Array>
  private static cache = new Map<string, Float32Array>();
  private static cachedConfig: TerrainConfig | null = null;

  /**
   * Clear all cached height data.
   * 清除所有缓存的高度数据
   */
  static clearCache(): void {
    this.cache.clear();
    this.cachedConfig = null;
  }

  /**
   * Get height at a world position (cached with bilinear interpolation).
   * 获取世界位置的高度（带双线性插值的缓存）
   */
  static heightAt(worldX: number, worldZ: number, config: TerrainConfig): number {
    // Invalidate cache if config changed.
    // 如果配置改变则使缓存失效
    if (this.cachedConfig !== config) {
      this.clearCache();
      this.cachedConfig = config;
    }

    const chunkSize = config.streaming.chunkSizeMeters;
    const samples = config.heightCache.samplesPerChunkSide;

    // Determine chunk coordinates.
    // 确定 chunk 坐标
    const cx = Math.floor(worldX / chunkSize);
    const cz = Math.floor(worldZ / chunkSize);
    const key = `${cx},${cz}`;

    // Get or create chunk cache.
    // 获取或创建 chunk 缓存
    let heightData = this.cache.get(key);
    if (!heightData) {
      heightData = this.bakeChunkHeights(cx, cz, config);
      this.cache.set(key, heightData);
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

  private static bakeChunkHeights(cx: number, cz: number, config: TerrainConfig): Float32Array {
    const chunkSize = config.streaming.chunkSizeMeters;
    const samples = config.heightCache.samplesPerChunkSide;

    const data = new Float32Array(samples * samples);
    const chunkOriginX = cx * chunkSize;
    const chunkOriginZ = cz * chunkSize;

    for (let vIdx = 0; vIdx < samples; vIdx++) {
      for (let uIdx = 0; uIdx < samples; uIdx++) {
        const worldX = chunkOriginX + (uIdx / (samples - 1)) * chunkSize;
        const worldZ = chunkOriginZ + (vIdx / (samples - 1)) * chunkSize;
        data[vIdx * samples + uIdx] = this.computeHeight(worldX, worldZ, config);
      }
    }

    return data;
  }

  /**
   * Compute height directly from noise (no cache).
   * 直接从噪声计算高度（无缓存）
   */
  static computeHeight(worldX: number, worldZ: number, config: TerrainConfig): number {
    let x = worldX;
    let z = worldZ;

    // Domain warp.
    // 域扭曲
    if (config.height.warp.enabled) {
      const wf = config.height.warp.frequencyPerMeter;
      const wa = config.height.warp.amplitudeMeters;
      const wx = (valueNoise2D(x * wf, z * wf, config.height.seed + 9001) * 2 - 1) * wa;
      const wz = (valueNoise2D(x * wf, z * wf, config.height.seed + 9002) * 2 - 1) * wa;
      x += wx;
      z += wz;
    }

    // fBm.
    const n = fbm2D(x, z, config);
    return config.height.baseHeightMeters + n * config.height.amplitudeMeters;
  }
}

// ============================================================================
// Noise functions (CPU-side, matching GPU implementation).
// 噪声函数（CPU 侧，与 GPU 实现匹配）
// ============================================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function hash2i(xi: number, zi: number, seed: number): number {
  let n = (xi | 0) * 374761393 + (zi | 0) * 668265263 + (seed | 0) * 2147483647;
  n = (n ^ (n >> 13)) | 0;
  n = Math.imul(n, 1274126177) | 0;
  n = (n ^ (n >> 16)) >>> 0;
  return n / 4294967296;
}

function valueNoise2D(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);

  const xf = x - xi;
  const zf = z - zi;

  const u = smoothstep01(xf);
  const v = smoothstep01(zf);

  const a = hash2i(xi, zi, seed);
  const b = hash2i(xi + 1, zi, seed);
  const c = hash2i(xi, zi + 1, seed);
  const d = hash2i(xi + 1, zi + 1, seed);

  const ab = lerp(a, b, u);
  const cd = lerp(c, d, u);
  return lerp(ab, cd, v);
}

function fbm2D(x: number, z: number, cfg: TerrainConfig): number {
  let sum = 0;
  let amp = 1;
  let freq = cfg.height.frequencyPerMeter;

  for (let i = 0; i < cfg.height.octaves; i++) {
    const n01 = valueNoise2D(x * freq, z * freq, cfg.height.seed + i * 1013);
    const n = n01 * 2 - 1;
    sum += n * amp;

    freq *= cfg.height.lacunarity;
    amp *= cfg.height.gain;
  }

  return sum;
}
