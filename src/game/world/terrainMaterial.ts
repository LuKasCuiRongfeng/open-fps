// terrainMaterial: GPU-first TSL terrain material with vertex displacement.
// terrainMaterial：GPU-first TSL 地形材质，带顶点位移

import { MeshStandardNodeMaterial, type StorageTexture } from "three/webgpu";
import {
  clamp,
  color,
  float,
  hash,
  max,
  mix,
  mul,
  mx_fractal_noise_float,
  mx_heighttonormal,
  mx_worley_noise_float,
  oneMinus,
  smoothstep,
  add,
  vec3,
  texture,
  uniform,
  positionLocal,
  vec2,
  normalize,
} from "three/tsl";
import type { TerrainConfig } from "./terrain";

/**
 * Parameters for GPU-displaced terrain material.
 * GPU 位移地形材质的参数
 */
export type TerrainMaterialParams = {
  heightTexture: StorageTexture;
  normalTexture: StorageTexture;
  tileUvOffset: { x: number; y: number };
  tileUvScale: number;
  chunkWorldX: number;
  chunkWorldZ: number;
  chunkSize: number;
};

/**
 * Create a GPU-first TSL terrain material with vertex displacement.
 * 创建带顶点位移的 GPU-first TSL 地形材质
 *
 * Key difference from old approach:
 * - Vertices are displaced in the vertex shader from height texture
 * - Normals are sampled from pre-computed normal texture
 * - All per-vertex work is on GPU
 * 与旧方法的关键区别：
 * - 顶点在顶点着色器中从高度纹理位移
 * - 法线从预计算的法线纹理采样
 * - 所有每顶点工作都在 GPU 上
 */
export function createGpuTerrainMaterial(
  cfg: TerrainConfig,
  params: TerrainMaterialParams,
): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.fog = true;

  // Uniforms for this chunk's atlas tile location.
  // 此 chunk 在图集中的 tile 位置 uniform
  const tileOffsetU = uniform(params.tileUvOffset.x);
  const tileOffsetV = uniform(params.tileUvOffset.y);
  const tileScale = uniform(params.tileUvScale);
  const chunkWorldX = uniform(params.chunkWorldX);
  const chunkWorldZ = uniform(params.chunkWorldZ);
  const chunkSize = uniform(params.chunkSize);

  // Height and normal textures.
  // 高度和法线纹理
  const heightTex = texture(params.heightTexture);
  const normalTex = texture(params.normalTexture);

  // Compute atlas UV from local position.
  // 从本地位置计算图集 UV
  // Local position is in range [-chunkSize/2, chunkSize/2]
  // 本地位置在 [-chunkSize/2, chunkSize/2] 范围内
  const localU = positionLocal.x.div(chunkSize).add(0.5);
  const localV = positionLocal.z.div(chunkSize).add(0.5);

  // Transform to atlas UV with half-pixel inset to prevent bleeding.
  // 变换到图集 UV，带半像素内缩以防止渗透
  // Tile resolution is 64, so half-pixel = 0.5/64 = 0.0078125
  // tile 分辨率为 64，所以半像素 = 0.5/64 = 0.0078125
  const halfPixel = float(0.5 / 64.0).mul(tileScale);
  const atlasU = tileOffsetU.add(localU.mul(tileScale));
  const atlasV = tileOffsetV.add(localV.mul(tileScale));
  
  // Clamp to tile bounds with half-pixel margin.
  // 限制在 tile 边界内，带半像素边距
  const tileMinU = tileOffsetU.add(halfPixel);
  const tileMaxU = tileOffsetU.add(tileScale).sub(halfPixel);
  const tileMinV = tileOffsetV.add(halfPixel);
  const tileMaxV = tileOffsetV.add(tileScale).sub(halfPixel);
  const clampedU = clamp(atlasU, tileMinU, tileMaxU);
  const clampedV = clamp(atlasV, tileMinV, tileMaxV);
  const atlasUv = vec2(clampedU, clampedV);

  // Sample height from texture.
  // 从纹理采样高度
  const height = heightTex.sample(atlasUv).r;

  // Displace vertex Y position.
  // 位移顶点 Y 位置
  mat.positionNode = vec3(
    positionLocal.x,
    height,
    positionLocal.z,
  );

  // Sample normal from pre-computed texture.
  // 从预计算纹理采样法线
  const sampledNormal = normalTex.sample(atlasUv).xyz;

  // Use sampled normal for lighting.
  // 使用采样的法线进行光照
  mat.normalNode = normalize(sampledNormal);

  // Compute world position for material blending (after displacement).
  // 计算世界位置用于材质混合（位移后）
  const worldX = chunkWorldX.add(positionLocal.x);
  const worldZ = chunkWorldZ.add(positionLocal.z);
  const worldY = height;

  // Height & slope driven material blending.
  // 基于高度 + 坡度的材质混合
  // Layer order: grass (low) -> rock (mid/steep) -> snow (high)
  // 层级顺序：草地（低）-> 岩石（中/陡）-> 雪（高）
  const y = worldY;
  const slope = clamp(oneMinus(sampledNormal.y), float(0.0), float(1.0));

  const grass = color(...cfg.material.grassColorRgb);
  const rock = color(...cfg.material.rockColorRgb);
  const snow = color(...cfg.material.snowColorRgb);

  // Macro noise for large-scale patchiness.
  // 宏观噪声：制造成片的自然变化
  const macroPos = mul(
    vec3(worldX, float(0.0), worldZ),
    float(cfg.material.macro.frequencyPerMeter),
  );
  const macroN = mx_fractal_noise_float(
    macroPos,
    cfg.material.macro.octaves,
    cfg.material.macro.lacunarity,
    cfg.material.macro.diminish,
    cfg.material.macro.amplitude,
  );
  const macro01 = clamp(macroN, float(0.0), float(1.0));
  const macroShift = mul(
    add(mul(macro01, float(2.0)), float(-1.0)),
    float(cfg.material.macro.heightShiftMeters),
  );

  // Grass to rock transition by height.
  // 草地到岩石的高度过渡
  const grassToRock = smoothstep(
    add(float(cfg.material.grassToRockStartMeters), macroShift),
    add(float(cfg.material.grassToRockEndMeters), macroShift),
    y,
  );

  // Rock by slope (steep = rock).
  // 坡度驱动的岩石（陡坡=岩石）
  const rockBySlope = smoothstep(
    float(cfg.material.rockSlopeStart),
    float(cfg.material.rockSlopeEnd),
    slope,
  );

  // Combined rock mask: either by height or by slope.
  // 组合岩石遮罩：高度或坡度
  let rockMask = max(grassToRock, rockBySlope);

  // Rock breakup to avoid continuous bands.
  // 岩石破碎度：打散连续的岩石带
  const worley = mx_worley_noise_float(
    vec2(worldX, worldZ).mul(float(cfg.material.rockBreakup.frequencyPerMeter)),
    cfg.material.rockBreakup.jitter,
  );
  const rockBreak = smoothstep(
    float(cfg.material.rockBreakup.threshold),
    float(cfg.material.rockBreakup.threshold + cfg.material.rockBreakup.softness),
    worley,
  );
  rockMask = clamp(
    add(rockMask, mul(rockBreak, float(cfg.material.rockBreakup.strength))),
    float(0.0),
    float(1.0),
  );

  // Mix grass and rock.
  // 混合草地和岩石
  const baseColor = mix(grass, rock, rockMask);

  // Snow on mountain peaks (natural distribution).
  // 山峰上的雪（自然分布）
  //
  // Real snow patterns:
  // 真实雪的分布模式：
  // 1. Accumulates at high elevations / 在高海拔积累
  // 2. Doesn't stick on steep slopes / 不附着在陡坡
  // 3. Has patchy, irregular edges / 有斑驳不规则的边缘
  // 4. Wind creates drift patterns / 风创建飘雪纹理

  // Base snow by height (with macro variation for patchy treeline).
  // 基于高度的雪（带宏观变化产生斑驳的雪线）
  const snowHeightThreshold = add(float(cfg.material.rockToSnowStartMeters), macroShift.mul(1.5));
  const snowHeightEnd = add(float(cfg.material.rockToSnowEndMeters), macroShift.mul(1.5));
  const snowByHeight = smoothstep(snowHeightThreshold, snowHeightEnd, y);

  // Snow doesn't stick well on steep slopes (avalanche zones).
  // 雪在陡坡不容易附着（雪崩区）
  const snowSlopeFade = oneMinus(smoothstep(float(0.35), float(0.6), slope));

  // Add noise-based variation for natural patchy edges.
  // 添加基于噪声的变化产生自然斑驳的边缘
  const snowNoisePos = mul(
    vec3(worldX, float(0.0), worldZ),
    float(0.025),  // Large-scale noise for snow patches / 大尺度噪声产生雪斑
  );
  const snowNoise = mx_fractal_noise_float(snowNoisePos, 2, 2.0, 0.5, 1.0);
  const snowPatchy = clamp(snowNoise.add(0.2), float(0.0), float(1.0));

  // Combine factors: height + slope + patchiness.
  // 组合因素：高度 + 坡度 + 斑驳度
  const snowCombined = mul(mul(snowByHeight, snowSlopeFade), snowPatchy);
  
  // Sharpen the snow edge for cleaner transition.
  // 锐化雪边缘以获得更清晰的过渡
  const snowMask = smoothstep(float(0.2), float(0.6), snowCombined);

  const c = mix(baseColor, snow, snowMask);

  // Micro-variation (cheap hash noise in world space).
  // 微观变化（世界空间哈希噪声，成本低）
  const n = hash(vec2(worldX, worldZ).mul(float(cfg.material.detailFrequencyPerMeter)));
  const shade = mix(float(cfg.material.detailShadeMin), float(cfg.material.detailShadeMax), n);
  let shaded = mul(c, shade);

  // Wet/muddy lowlands.
  // 低洼湿地/泥地
  if (cfg.material.wetness.enabled) {
    const wetHeight = oneMinus(
      smoothstep(
        float(cfg.material.wetness.startHeightMeters),
        float(cfg.material.wetness.endHeightMeters),
        y,
      ),
    );

    const wetFlat = oneMinus(
      smoothstep(
        float(cfg.material.wetness.slopeStart),
        float(cfg.material.wetness.slopeEnd),
        slope,
      ),
    );

    const macroMul = mix(
      float(1.0 - cfg.material.wetness.macroInfluence),
      float(1.0 + cfg.material.wetness.macroInfluence),
      macro01,
    );

    const wetMask = clamp(mul(mul(wetHeight, wetFlat), macroMul), float(0.0), float(1.0));
    const wetBlend = clamp(
      mul(wetMask, float(cfg.material.wetness.strength)),
      float(0.0),
      float(1.0),
    );

    const mud = color(...cfg.material.wetness.mudColorRgb);
    shaded = mul(mix(shaded, mud, wetBlend), float(cfg.material.wetness.darken));

    mat.roughnessNode = mix(
      float(cfg.material.roughness),
      float(cfg.material.wetness.roughness),
      wetBlend,
    );
  } else {
    mat.roughnessNode = float(cfg.material.roughness);
  }

  // Procedural detail normal (adds to sampled normal).
  // 程序化细节法线（添加到采样法线）
  if (cfg.material.detailNormal.enabled) {
    const dnPos = mul(
      vec3(worldX, float(0.0), worldZ),
      float(cfg.material.detailNormal.frequencyPerMeter),
    );
    const dnHeight = mx_fractal_noise_float(
      dnPos,
      cfg.material.detailNormal.octaves,
      cfg.material.detailNormal.lacunarity,
      cfg.material.detailNormal.diminish,
      cfg.material.detailNormal.amplitude,
    );
    const detailNormal = mx_heighttonormal(dnHeight, float(cfg.material.detailNormal.strength));
    // Blend detail normal with sampled normal.
    // 将细节法线与采样法线混合
    mat.normalNode = normalize(add(sampledNormal, detailNormal.mul(0.5)));
  }

  mat.colorNode = shaded;
  mat.metalnessNode = float(cfg.material.metalness);

  return mat;
}

/**
 * Shared flat plane geometry for all chunks (GPU displacement handles height).
 * 所有 chunk 共享的平面几何体（GPU 位移处理高度）
 */
export function getSharedChunkGeometrySegments(lodIndex: number, cfg: TerrainConfig): number {
  return cfg.lod.levels[lodIndex]?.segmentsPerSide ?? 16;
}
