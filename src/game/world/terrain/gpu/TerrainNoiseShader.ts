// TerrainNoiseShader: TSL noise functions and height generation shader nodes.
// TerrainNoiseShader：TSL 噪声函数和高度生成着色器节点

import {
  float,
  texture,
  textureStore,
  uvec2,
  vec2,
  vec4,
  instanceIndex,
  Fn,
  floor,
  fract,
  If,
  mix,
  uint,
  mod,
} from "three/tsl";
import {
  DataTexture,
  FloatType,
  RedFormat,
  NearestFilter,
  RepeatWrapping,
  StorageTexture,
} from "three/webgpu";
import type { ComputeNode, UniformNode } from "three/webgpu";
import type { TerrainConfig } from "../terrain";

// Type alias for TSL float node.
// TSL float 节点类型别名
type FloatNode = ReturnType<typeof float>;

/**
 * Creates hash texture for deterministic noise.
 * 创建用于确定性噪声的哈希纹理
 */
export function createHashTexture(seed: number): DataTexture {
  const size = 256;
  const data = new Float32Array(size * size);

  for (let i = 0; i < size * size; i++) {
    // Simple hash function.
    // 简单哈希函数
    let n = (i * 374761393 + seed * 668265263) >>> 0;
    n = ((n ^ (n >> 13)) * 1274126177) >>> 0;
    n = (n ^ (n >> 16)) >>> 0;
    data[i] = n / 4294967296;
  }

  const hashTexture = new DataTexture(data, size, size, RedFormat, FloatType);
  hashTexture.magFilter = NearestFilter;
  hashTexture.minFilter = NearestFilter;
  hashTexture.wrapS = RepeatWrapping;
  hashTexture.wrapT = RepeatWrapping;
  hashTexture.needsUpdate = true;

  return hashTexture;
}

/** fBm layer config for noise generation. / fBm 噪声层配置 */
type FbmLayerConfig = {
  enabled: boolean;
  octaves: number;
  frequencyPerMeter: number;
  lacunarity: number;
  gain: number;
  amplitudeMeters: number;
  powerCurve?: number;
  symmetric?: boolean; // If true, remap [0,1] -> [-1,1] / 若为 true，映射 [0,1] -> [-1,1]
};

/**
 * Build terrain height compute shader.
 * 构建地形高度计算着色器
 */
export function buildHeightComputeShader(
  config: TerrainConfig,
  heightTexture: StorageTexture,
  hashTexture: DataTexture,
  chunkOffsetX: UniformNode<number>,
  chunkOffsetZ: UniformNode<number>,
  tileX: UniformNode<number>,
  tileZ: UniformNode<number>
): ComputeNode {
  const tileRes = config.gpuCompute.tileResolution;
  const chunkSize = float(config.streaming.chunkSizeMeters);

  const hashTex = texture(hashTexture);

  // Hash function using texture lookup.
  // 使用纹理查找的哈希函数
  const hash2i = Fn(([xi, zi, seedOffset]: [FloatNode, FloatNode, FloatNode]) => {
    const u = fract(xi.mul(0.00390625).add(seedOffset.mul(0.1234)));
    const v = fract(zi.mul(0.00390625).add(seedOffset.mul(0.5678)));
    return hashTex.sample(vec2(u, v)).r;
  });

  // Value noise 2D.
  // 2D 值噪声
  const valueNoise2D = Fn(([x, z, seedOffset]: [FloatNode, FloatNode, FloatNode]) => {
    const xi = floor(x);
    const zi = floor(z);
    const xf = fract(x);
    const zf = fract(z);

    // Quintic smoothstep interpolation for smoother results.
    // 五次平滑插值，效果更平滑
    const u = xf.mul(xf).mul(xf).mul(xf.mul(xf.mul(6).sub(15)).add(10));
    const v = zf.mul(zf).mul(zf).mul(zf.mul(zf.mul(6).sub(15)).add(10));

    const a = hash2i(xi, zi, seedOffset);
    const b = hash2i(xi.add(1), zi, seedOffset);
    const c = hash2i(xi, zi.add(1), seedOffset);
    const d = hash2i(xi.add(1), zi.add(1), seedOffset);

    return mix(mix(a, b, u), mix(c, d, u), v);
  });

  /**
   * Reusable fBm generator (fractal Brownian motion).
   * 可复用的 fBm 生成器（分形布朗运动）
   */
  const fBm = (
    worldX: FloatNode, worldZ: FloatNode, seed: FloatNode,
    cfg: FbmLayerConfig, seedBase: number
  ): FloatNode => {
    const sum = float(0).toVar();
    const amp = float(1).toVar();
    const freq = float(cfg.frequencyPerMeter).toVar();
    const maxAmp = float(0).toVar();

    for (let i = 0; i < cfg.octaves; i++) {
      const n01 = valueNoise2D(worldX.mul(freq), worldZ.mul(freq), seed.add(seedBase + i * 1013));
      const n = cfg.symmetric ? n01.mul(2).sub(1) : n01;
      sum.addAssign(n.mul(amp));
      maxAmp.addAssign(amp);
      freq.mulAssign(float(cfg.lacunarity));
      amp.mulAssign(float(cfg.gain));
    }

    const normalized = sum.div(maxAmp);
    const power = cfg.powerCurve ?? 1.0;
    return power === 1.0 ? normalized : normalized.pow(float(power));
  };

  // Main compute function with all noise inlined.
  // 主计算函数，所有噪声内联
  const computeFn = Fn(() => {
    // Compute pixel coordinates from instance index.
    // 从实例索引计算像素坐标
    const pixelX = mod(instanceIndex, uint(tileRes));
    const pixelY = mod(instanceIndex.div(uint(tileRes)), uint(tileRes));

    // Use pre-computed tile coordinates from JavaScript.
    // 使用 JavaScript 预计算的 tile 坐标
    const tileXCoord = uint(tileX);
    const tileZCoord = uint(tileZ);

    // World coordinates.
    // 世界坐标
    const localU = float(pixelX).div(float(tileRes - 1));
    const localV = float(pixelY).div(float(tileRes - 1));
    const worldX = float(chunkOffsetX).mul(chunkSize).add(localU.mul(chunkSize)).toVar();
    const worldZ = float(chunkOffsetZ).mul(chunkSize).add(localV.mul(chunkSize)).toVar();

    const seed = float(config.height.seed);

    // Domain warp.
    // 域扭曲
    const warpCfg = config.height.warp;
    If(float(warpCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
      const warpFreq = float(warpCfg.frequencyPerMeter);
      const warpAmp = float(warpCfg.amplitudeMeters);
      const wn1 = valueNoise2D(worldX.mul(warpFreq), worldZ.mul(warpFreq), seed.add(9001));
      const wn2 = valueNoise2D(worldX.mul(warpFreq), worldZ.mul(warpFreq), seed.add(9002));
      worldX.addAssign(wn1.mul(2).sub(1).mul(warpAmp));
      worldZ.addAssign(wn2.mul(2).sub(1).mul(warpAmp));
    });

    const height = float(config.height.baseHeightMeters).toVar();

    // --- fBm noise layers / fBm 噪声层 ---
    const { continental, mountain, hills, detail } = config.height;

    // Continental layer (fBm with power curve).
    // 大陆层（fBm 带幂曲线）
    if (continental.enabled) {
      height.addAssign(fBm(worldX, worldZ, seed, continental, 1000).mul(float(continental.amplitudeMeters)));
    }

    // Mountain layer (fBm with power curve).
    // 山地层（fBm 带幂曲线）
    if (mountain.enabled) {
      height.addAssign(fBm(worldX, worldZ, seed, mountain, 2000).mul(float(mountain.amplitudeMeters)));
    }

    // Hills layer (fBm with power curve).
    // 丘陵层（fBm 带幂曲线）
    if (hills.enabled) {
      height.addAssign(fBm(worldX, worldZ, seed, hills, 3000).mul(float(hills.amplitudeMeters)));
    }

    // Detail layer (fBm - symmetric).
    // 细节层（fBm - 对称）
    if (detail.enabled) {
      const detailCfg = { ...detail, symmetric: true };
      height.addAssign(fBm(worldX, worldZ, seed, detailCfg, 4000).mul(float(detail.amplitudeMeters)));
    }

    // Plains flattening.
    // 平原压平
    const plainsCfg = config.height.plains;
    if (plainsCfg.enabled) {
      const threshold = float(plainsCfg.thresholdMeters);
      const transition = float(plainsCfg.transitionMeters);
      const t = height.sub(threshold.sub(transition)).div(transition.mul(2)).clamp(0, 1);
      const smoothT = t.mul(t).mul(float(3).sub(t.mul(2)));
      const flattenFactor = float(1).sub(smoothT).mul(float(plainsCfg.strength));
      height.assign(mix(height, float(config.height.baseHeightMeters), flattenFactor));
    }

    // Valley carving (uses fBm but needs custom post-processing).
    // 山谷雕刻（使用 fBm 但需要自定义后处理）
    const valCfg = config.height.valleys;
    if (valCfg.enabled) {
      const valFbmCfg: FbmLayerConfig = { ...valCfg, lacunarity: 2.0, gain: 0.5, symmetric: true };
      const valleyNoise = fBm(worldX, worldZ, seed, valFbmCfg, 5000);
      const valleyShape = float(1).sub(valleyNoise.abs().mul(2).clamp(0, 1));
      const valleyDepth = valleyShape.mul(valleyShape).mul(float(valCfg.amplitudeMeters));
      const fadeT = height.sub(float(valCfg.heightFadeStartMeters))
        .div(float(valCfg.heightFadeEndMeters - valCfg.heightFadeStartMeters)).clamp(0, 1);
      height.subAssign(valleyDepth.mul(float(1).sub(fadeT)));
    }

    // Erosion detail.
    // 侵蚀细节
    const erosionCfg = config.height.erosion;
    if (erosionCfg.enabled) {
      const erosionFbm: FbmLayerConfig = {
        enabled: true, octaves: 2, frequencyPerMeter: erosionCfg.detailFrequency,
        lacunarity: 2.0, gain: 0.5, amplitudeMeters: erosionCfg.detailAmplitude, symmetric: true
      };
      height.addAssign(fBm(worldX, worldZ, seed, erosionFbm, 6000).mul(float(erosionCfg.detailAmplitude)));
    }

    // Write to atlas.
    // 写入图集
    const atlasX = tileXCoord.mul(uint(tileRes)).add(pixelX);
    const atlasY = tileZCoord.mul(uint(tileRes)).add(pixelY);

    textureStore(heightTexture, uvec2(atlasX, atlasY), vec4(height, float(0), float(0), float(1))).toWriteOnly();
  });

  return computeFn().compute(tileRes * tileRes);
}
