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
    const seed = config.height.seed;

    // Domain warp (must match GPU exactly).
    // GPU uses: seed.add(9001) and seed.add(9002) as seedOffset
    // 域扭曲（必须与 GPU 精确匹配）
    // GPU 使用: seed.add(9001) 和 seed.add(9002) 作为 seedOffset
    if (config.height.warp.enabled) {
      const wf = config.height.warp.frequencyPerMeter;
      const wa = config.height.warp.amplitudeMeters;
      const wx = (valueNoise2D(x * wf, z * wf, seed + 9001, seed) * 2 - 1) * wa;
      const wz = (valueNoise2D(x * wf, z * wf, seed + 9002, seed) * 2 - 1) * wa;
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

// Hash texture cache (matches GPU's hash texture).
// 哈希纹理缓存（与 GPU 的哈希纹理匹配）
let hashTextureData: Float32Array | null = null;
let hashTextureSeed: number | null = null;

function getHashTextureData(seed: number): Float32Array {
  if (hashTextureData && hashTextureSeed === seed) {
    return hashTextureData;
  }

  const size = 256;
  hashTextureData = new Float32Array(size * size);
  hashTextureSeed = seed;

  for (let i = 0; i < size * size; i++) {
    // Must match GPU's hash texture generation exactly.
    // 必须与 GPU 的哈希纹理生成完全匹配
    let n = (i * 374761393 + seed * 668265263) >>> 0;
    n = ((n ^ (n >> 13)) * 1274126177) >>> 0;
    n = (n ^ (n >> 16)) >>> 0;
    hashTextureData[i] = n / 4294967296;
  }

  return hashTextureData;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Hash function matching GPU's texture-based hash.
 * 与 GPU 基于纹理的哈希函数匹配
 *
 * NOTE: seedOffset should be the FULL offset (e.g. seed + 9001), same as GPU.
 * 注意：seedOffset 应该是完整的偏移量（例如 seed + 9001），与 GPU 相同。
 */
function hash2i(xi: number, zi: number, seedOffset: number, seed: number): number {
  const hashData = getHashTextureData(seed);
  const size = 256;

  // Match GPU's UV calculation exactly.
  // GPU uses: fract(xi.mul(0.00390625).add(seedOffset.mul(0.1234)))
  // where seedOffset is already (seed + baseOffset)
  // 精确匹配 GPU 的 UV 计算
  // GPU 使用: fract(xi.mul(0.00390625).add(seedOffset.mul(0.1234)))
  // 其中 seedOffset 已经是 (seed + baseOffset)
  let u = (xi * 0.00390625 + seedOffset * 0.1234) % 1;
  let v = (zi * 0.00390625 + seedOffset * 0.5678) % 1;

  // Handle negative values (fract behavior).
  // 处理负值（fract 行为）
  if (u < 0) u += 1;
  if (v < 0) v += 1;

  // Nearest neighbor sampling (matches GPU's NearestFilter).
  // 最近邻采样（匹配 GPU 的 NearestFilter）
  const px = Math.floor(u * size) % size;
  const py = Math.floor(v * size) % size;

  return hashData[py * size + px];
}

function valueNoise2D(x: number, z: number, seedOffset: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);

  const xf = x - xi;
  const zf = z - zi;

  const u = smoothstep01(xf);
  const v = smoothstep01(zf);

  // seedOffset is the FULL offset (seed + baseOffset), matching GPU.
  // seedOffset 是完整偏移量（seed + baseOffset），与 GPU 匹配
  const a = hash2i(xi, zi, seedOffset, seed);
  const b = hash2i(xi + 1, zi, seedOffset, seed);
  const c = hash2i(xi, zi + 1, seedOffset, seed);
  const d = hash2i(xi + 1, zi + 1, seedOffset, seed);

  const ab = lerp(a, b, u);
  const cd = lerp(c, d, u);
  return lerp(ab, cd, v);
}

function fbm2D(x: number, z: number, cfg: TerrainConfig): number {
  let sum = 0;
  let amp = 1;
  let freq = cfg.height.frequencyPerMeter;
  const seed = cfg.height.seed;

  for (let i = 0; i < cfg.height.octaves; i++) {
    // GPU uses: seed.add(float(i * 1013)) → seedOffset = seed + i * 1013
    // GPU 使用: seed.add(float(i * 1013)) → seedOffset = seed + i * 1013
    const seedOffset = seed + i * 1013;
    const n01 = valueNoise2D(x * freq, z * freq, seedOffset, seed);
    const n = n01 * 2 - 1;
    sum += n * amp;

    freq *= cfg.height.lacunarity;
    amp *= cfg.height.gain;
  }

  return sum;
}
