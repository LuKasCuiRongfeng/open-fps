// terrainMaterial: GPU-first TSL terrain material with vertex displacement.
// terrainMaterial：GPU-first TSL 地形材质，带顶点位移
//
// Uses multi-octave detail noise and advanced blending for natural-looking
// terrain textures without visible tiling artifacts.
// 使用多八度细节噪声和高级混合，实现无明显重复的自然地形纹理

import { DoubleSide, MeshStandardNodeMaterial, type StorageTexture } from "three/webgpu";
import {
  clamp,
  color,
  float,
  max,
  mix,
  mul,
  mx_fractal_noise_float,
  mx_heighttonormal,
  mx_worley_noise_float,
  oneMinus,
  smoothstep,
  add,
  vec2,
  vec3,
  texture,
  uniform,
  positionLocal,
  normalize,
  cameraViewMatrix,
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
  // Enable double-sided rendering for skirts to be visible from below.
  // 启用双面渲染以便从下方看到裙边
  mat.side = DoubleSide;

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

  // Map to atlas UV with proper boundary handling.
  // 映射到图集 UV，正确处理边界
  //
  // The height texture uses EDGE ALIGNMENT in baking:
  // - Pixel 0 bakes localU=0 (chunk start)
  // - Pixel 63 bakes localU=1 (chunk end, same as next chunk's start)
  // 高度纹理在烘焙时使用边缘对齐：
  // - 像素 0 烘焙 localU=0（chunk 起点）
  // - 像素 63 烘焙 localU=1（chunk 终点，与下一个 chunk 起点相同）
  //
  // With LINEAR filter, we want to sample pixel centers:
  // - Pixel 0 center is at texU = 0.5/64
  // - Pixel 63 center is at texU = 63.5/64
  // So localU [0,1] maps to texU [0.5/64, 63.5/64] within the tile.
  // 使用 LINEAR 过滤器时，我们要采样像素中心：
  // - 像素 0 中心在 texU = 0.5/64
  // - 像素 63 中心在 texU = 63.5/64
  // 所以 localU [0,1] 映射到 tile 内的 texU [0.5/64, 63.5/64]
  //
  // Formula: texU = (0.5 + localU * 63) / 64 = 0.5/64 + localU * 63/64
  // 公式：texU = (0.5 + localU * 63) / 64 = 0.5/64 + localU * 63/64
  const tilePixels = float(64.0);
  const halfPixel = float(0.5).div(tilePixels);
  const pixelRange = tilePixels.sub(1.0).div(tilePixels); // 63/64
  const pixelU = halfPixel.add(localU.mul(pixelRange));
  const pixelV = halfPixel.add(localV.mul(pixelRange));
  const atlasU = tileOffsetU.add(pixelU.mul(tileScale));
  const atlasV = tileOffsetV.add(pixelV.mul(tileScale));
  const atlasUv = vec2(atlasU, atlasV);

  // Sample height from texture.
  // 从纹理采样高度
  const height = heightTex.sample(atlasUv).r;

  // Displace vertex Y position by ADDING height to original Y.
  // 通过将高度加到原始 Y 来位移顶点 Y 位置
  // This is critical for skirt vertices:
  // - Main surface: Y=0 → final Y = 0 + height = height ✓
  // - Skirt vertices: Y=-150 → final Y = -150 + height (hangs below surface) ✓
  // 这对裙边顶点至关重要：
  // - 主表面：Y=0 → 最终 Y = 0 + height = height ✓
  // - 裙边顶点：Y=-150 → 最终 Y = -150 + height（悬挂在表面下方）✓
  mat.positionNode = vec3(
    positionLocal.x,
    positionLocal.y.add(height),
    positionLocal.z,
  );

  // Sample normal from pre-computed texture.
  // 从预计算纹理采样法线
  const sampledNormal = normalTex.sample(atlasUv).xyz;

  // The normal from texture is in WORLD space (not object space).
  // Use cameraViewMatrix.transformDirection() to transform world-space normal to view-space.
  // (cameraNormalMatrix is the INVERSE - it transforms view→world, not world→view)
  // 纹理中的法线是世界空间的（不是对象空间）。
  // 使用 cameraViewMatrix.transformDirection() 将世界空间法线变换到视图空间。
  // （cameraNormalMatrix 是逆矩阵 - 它将视图→世界，而不是世界→视图）
  const worldNormal = normalize(sampledNormal);
  const viewNormal = normalize(cameraViewMatrix.transformDirection(worldNormal));

  mat.normalNode = viewNormal;

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

  // ============================================================================
  // Optimized Color Variation (single noise sample, reuse macro noise)
  // 优化的颜色变化（单次噪声采样，复用宏观噪声）
  // ============================================================================
  // Reuse the macro noise already computed for biome blending.
  // 复用已计算的宏观噪声用于生物群落混合

  // Use macro01 (already computed) + one additional fine detail sample.
  // 使用已计算的 macro01 + 一个额外的细节采样
  const fineNoise = mx_fractal_noise_float(
    vec3(worldX, float(0.0), worldZ).mul(float(0.15)),
    2, 2.0, 0.5, 1.0,
  );

  // Combine macro (large patches) + fine (small detail).
  // 组合宏观（大斑块）+ 细节（小细节）
  const combinedNoise = add(mul(macro01, float(0.6)), mul(fineNoise, float(0.4)));

  // Single variation factor for all materials (simpler, faster).
  // 所有材质使用单一变化因子（更简单、更快）
  const colorVariation = add(float(0.92), mul(combinedNoise, float(0.16)));

  // Apply variation to base colors.
  // 将变化应用到基础颜色
  const grassVaried = mul(grass, colorVariation);
  const rockVaried = mul(rock, colorVariation);
  const snowVaried = mul(snow, add(float(0.96), mul(combinedNoise, float(0.08))));

  // Mix materials with variation.
  // 混合带变化的材质
  const baseColorVaried = mix(grassVaried, rockVaried, rockMask);
  const baseShaded = mix(baseColorVaried, snowVaried, snowMask);

  // Wet/muddy lowlands - compute wet mask first.
  // 低洼湿地/泥地 - 先计算湿度遮罩
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
  const wetBlend = cfg.material.wetness.enabled
    ? clamp(mul(wetMask, float(cfg.material.wetness.strength)), float(0.0), float(1.0))
    : float(0.0);

  const mud = color(...cfg.material.wetness.mudColorRgb);
  const finalShaded = mul(mix(baseShaded, mud, wetBlend), mix(float(1.0), float(cfg.material.wetness.darken), wetBlend));

  mat.roughnessNode = mix(
    float(cfg.material.roughness),
    float(cfg.material.wetness.roughness),
    wetBlend,
  );

  // Procedural detail normal (single sample, optimized).
  // 程序化细节法线（单次采样，已优化）
  if (cfg.material.detailNormal.enabled) {
    const dnPos = vec3(worldX, float(0.0), worldZ).mul(float(cfg.material.detailNormal.frequencyPerMeter));
    const dnHeight = mx_fractal_noise_float(
      dnPos,
      cfg.material.detailNormal.octaves,
      cfg.material.detailNormal.lacunarity,
      cfg.material.detailNormal.diminish,
      cfg.material.detailNormal.amplitude,
    );

    // Convert height to normal perturbation.
    // 将高度转换为法线扰动
    const detailNormal = mx_heighttonormal(dnHeight, float(cfg.material.detailNormal.strength));

    // Blend detail normal with world normal, then transform to view space.
    // Use cameraViewMatrix.transformDirection() for world→view transformation.
    // 将细节法线与世界空间法线混合，然后转换到视图空间
    // 使用 cameraViewMatrix.transformDirection() 进行世界→视图变换
    const blendedWorldNormal = normalize(add(worldNormal, mul(detailNormal, float(0.5))));
    mat.normalNode = normalize(cameraViewMatrix.transformDirection(blendedWorldNormal));
  }

  mat.colorNode = finalShaded;
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
