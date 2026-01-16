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
  const hash2i = Fn(
    ([xi, zi, seedOffset]: [
      ReturnType<typeof float>,
      ReturnType<typeof float>,
      ReturnType<typeof float>,
    ]) => {
      const u = fract(xi.mul(0.00390625).add(seedOffset.mul(0.1234)));
      const v = fract(zi.mul(0.00390625).add(seedOffset.mul(0.5678)));
      return hashTex.sample(vec2(u, v)).r;
    }
  );

  // Value noise 2D.
  // 2D 值噪声
  const valueNoise2D = Fn(
    ([x, z, seedOffset]: [
      ReturnType<typeof float>,
      ReturnType<typeof float>,
      ReturnType<typeof float>,
    ]) => {
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

      const ab = mix(a, b, u);
      const cd = mix(c, d, u);
      return mix(ab, cd, v);
    }
  );

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

    // Continental layer (fBm with power curve).
    // 大陆层（fBm 带幂曲线）
    const contCfg = config.height.continental;
    const contPower = contCfg.powerCurve ?? 1.0;
    If(float(contCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
      const contSum = float(0).toVar();
      const contAmp = float(1).toVar();
      const contFreq = float(contCfg.frequencyPerMeter).toVar();
      const contMaxAmp = float(0).toVar();

      for (let i = 0; i < contCfg.octaves; i++) {
        const n01 = valueNoise2D(
          worldX.mul(contFreq),
          worldZ.mul(contFreq),
          seed.add(1000 + i * 1013)
        );
        contSum.addAssign(n01.mul(contAmp));
        contMaxAmp.addAssign(contAmp);
        contFreq.mulAssign(float(contCfg.lacunarity));
        contAmp.mulAssign(float(contCfg.gain));
      }

      const normalized = contSum.div(contMaxAmp);
      const curved = normalized.pow(float(contPower));
      height.addAssign(curved.mul(float(contCfg.amplitudeMeters)));
    });

    // Mountain layer (fBm with power curve).
    // 山地层（fBm 带幂曲线）
    const mtnCfg = config.height.mountain;
    const mtnPower = mtnCfg.powerCurve ?? 1.0;
    If(float(mtnCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
      const mtnSum = float(0).toVar();
      const mtnAmp = float(1).toVar();
      const mtnFreq = float(mtnCfg.frequencyPerMeter).toVar();
      const mtnMaxAmp = float(0).toVar();

      for (let i = 0; i < mtnCfg.octaves; i++) {
        const n01 = valueNoise2D(
          worldX.mul(mtnFreq),
          worldZ.mul(mtnFreq),
          seed.add(2000 + i * 1013)
        );
        mtnSum.addAssign(n01.mul(mtnAmp));
        mtnMaxAmp.addAssign(mtnAmp);
        mtnFreq.mulAssign(float(mtnCfg.lacunarity));
        mtnAmp.mulAssign(float(mtnCfg.gain));
      }

      const normalized = mtnSum.div(mtnMaxAmp);
      const curved = normalized.pow(float(mtnPower));
      height.addAssign(curved.mul(float(mtnCfg.amplitudeMeters)));
    });

    // Hills layer (fBm with power curve).
    // 丘陵层（fBm 带幂曲线）
    const hillCfg = config.height.hills;
    const hillPower = hillCfg.powerCurve ?? 1.0;
    If(float(hillCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
      const hillSum = float(0).toVar();
      const hillAmp = float(1).toVar();
      const hillFreq = float(hillCfg.frequencyPerMeter).toVar();
      const hillMaxAmp = float(0).toVar();

      for (let i = 0; i < hillCfg.octaves; i++) {
        const n01 = valueNoise2D(
          worldX.mul(hillFreq),
          worldZ.mul(hillFreq),
          seed.add(3000 + i * 1013)
        );
        hillSum.addAssign(n01.mul(hillAmp));
        hillMaxAmp.addAssign(hillAmp);
        hillFreq.mulAssign(float(hillCfg.lacunarity));
        hillAmp.mulAssign(float(hillCfg.gain));
      }

      const normalized = hillSum.div(hillMaxAmp);
      const curved = normalized.pow(float(hillPower));
      height.addAssign(curved.mul(float(hillCfg.amplitudeMeters)));
    });

    // Detail layer (fBm - symmetric).
    // 细节层（fBm - 对称）
    const detCfg = config.height.detail;
    If(float(detCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
      const detSum = float(0).toVar();
      const detAmp = float(1).toVar();
      const detFreq = float(detCfg.frequencyPerMeter).toVar();
      const detMaxAmp = float(0).toVar();

      for (let i = 0; i < detCfg.octaves; i++) {
        const n01 = valueNoise2D(
          worldX.mul(detFreq),
          worldZ.mul(detFreq),
          seed.add(4000 + i * 1013)
        );
        const n = n01.mul(2).sub(1);
        detSum.addAssign(n.mul(detAmp));
        detMaxAmp.addAssign(detAmp);
        detFreq.mulAssign(float(detCfg.lacunarity));
        detAmp.mulAssign(float(detCfg.gain));
      }

      height.addAssign(detSum.div(detMaxAmp).mul(float(detCfg.amplitudeMeters)));
    });

    // Plains flattening.
    // 平原压平
    const plainsCfg = config.height.plains;
    If(float(plainsCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
      const threshold = float(plainsCfg.thresholdMeters);
      const transition = float(plainsCfg.transitionMeters);
      const strength = float(plainsCfg.strength);

      const t = height
        .sub(threshold.sub(transition))
        .div(transition.mul(2))
        .clamp(0, 1);
      const smoothT = t.mul(t).mul(float(3).sub(t.mul(2)));
      const flattenFactor = float(1).sub(smoothT).mul(strength);

      const targetHeight = float(config.height.baseHeightMeters);
      height.assign(mix(height, targetHeight, flattenFactor));
    });

    // Valley carving.
    // 山谷雕刻
    const valCfg = config.height.valleys;
    If(float(valCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
      const valSum = float(0).toVar();
      const valAmp = float(1).toVar();
      const valFreq = float(valCfg.frequencyPerMeter).toVar();
      const valMaxAmp = float(0).toVar();

      for (let i = 0; i < valCfg.octaves; i++) {
        const n01 = valueNoise2D(
          worldX.mul(valFreq),
          worldZ.mul(valFreq),
          seed.add(5000 + i * 1013)
        );
        const n = n01.mul(2).sub(1);
        valSum.addAssign(n.mul(valAmp));
        valMaxAmp.addAssign(valAmp);
        valFreq.mulAssign(float(2.0));
        valAmp.mulAssign(float(0.5));
      }

      const valleyNoise = valSum.div(valMaxAmp);
      const valleyShape = float(1).sub(valleyNoise.abs().mul(2).clamp(0, 1));
      const valleyDepth = valleyShape.mul(valleyShape).mul(float(valCfg.amplitudeMeters));

      const fadeT = height
        .sub(float(valCfg.heightFadeStartMeters))
        .div(float(valCfg.heightFadeEndMeters - valCfg.heightFadeStartMeters))
        .clamp(0, 1);
      const heightFade = float(1).sub(fadeT);

      height.subAssign(valleyDepth.mul(heightFade));
    });

    // Erosion detail.
    // 侵蚀细节
    const erosionCfg = config.height.erosion;
    If(float(erosionCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
      const eroSum = float(0).toVar();
      const eroAmp = float(1).toVar();
      const eroFreq = float(erosionCfg.detailFrequency).toVar();
      const eroMaxAmp = float(0).toVar();

      for (let i = 0; i < 2; i++) {
        const n01 = valueNoise2D(
          worldX.mul(eroFreq),
          worldZ.mul(eroFreq),
          seed.add(6000 + i * 1013)
        );
        const n = n01.mul(2).sub(1);
        eroSum.addAssign(n.mul(eroAmp));
        eroMaxAmp.addAssign(eroAmp);
        eroFreq.mulAssign(float(2.0));
        eroAmp.mulAssign(float(0.5));
      }

      height.addAssign(eroSum.div(eroMaxAmp).mul(float(erosionCfg.detailAmplitude)));
    });

    // Write to atlas.
    // 写入图集
    const atlasX = tileXCoord.mul(uint(tileRes)).add(pixelX);
    const atlasY = tileZCoord.mul(uint(tileRes)).add(pixelY);

    textureStore(heightTexture, uvec2(atlasX, atlasY), vec4(height, float(0), float(0), float(1))).toWriteOnly();
  });

  return computeFn().compute(tileRes * tileRes);
}
