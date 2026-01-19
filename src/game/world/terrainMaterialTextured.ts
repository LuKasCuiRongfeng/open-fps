// terrainMaterialTextured: PBR terrain material with splat map blending and triplanar projection.
// terrainMaterialTextured：使用 splat map 混合和三平面投影的 PBR 地形材质

import { DoubleSide, MeshStandardNodeMaterial, type Texture, type StorageTexture } from "three/webgpu";
import {
  abs,
  clamp,
  float,
  mix,
  pow,
  add,
  vec2,
  vec3,
  vec4,
  texture,
  uniform,
  positionLocal,
  normalize,
  cameraViewMatrix,
} from "three/tsl";
import type { TerrainConfig } from "./terrain";
import type { TerrainTextureResult, PBRTextureSet } from "./TerrainTextures";

// ============================================================================
// Shared Global Uniforms (all terrain materials reference these)
// 共享全局 Uniform（所有地形材质引用这些）
// ============================================================================

/** Shared uniform for normal softness (0=sharp, 1=flat). / 法线柔和度共享 uniform */
const sharedNormalSoftness = { value: 0.4 };
const normalSoftnessUniform = uniform(sharedNormalSoftness.value);

/**
 * Update the global normal softness value for all terrain materials.
 * 更新所有地形材质的全局法线柔和度值
 */
export function setTerrainNormalSoftness(value: number): void {
  sharedNormalSoftness.value = value;
  normalSoftnessUniform.value = value;
}

/**
 * Parameters for terrain material.
 * 地形材质参数
 */
export interface TerrainMaterialParams {
  heightTexture: StorageTexture;
  normalTexture: StorageTexture;
  tileUvOffset: { x: number; y: number };
  tileUvScale: number;
  chunkWorldX: number;
  chunkWorldZ: number;
  chunkSize: number;
  /** Splat map texture (null = use procedural blending) */
  splatMap?: Texture | null;
  /** Texture result from TerrainTextures loader */
  textureResult?: TerrainTextureResult | null;
}

/**
 * Create terrain material with PBR textures and splat map blending.
 * 创建使用 PBR 纹理和 splat map 混合的地形材质
 *
 * Two modes:
 * 1. useTextures=true: Load PBR textures from texture.json, blend via splat map
 * 2. useTextures=false: Use procedural height/slope-based blending
 *
 * 两种模式：
 * 1. useTextures=true: 从 texture.json 加载 PBR 纹理，通过 splat map 混合
 * 2. useTextures=false: 使用程序化的高度/坡度混合
 */
export function createTexturedTerrainMaterial(
  cfg: TerrainConfig,
  params: TerrainMaterialParams,
): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.fog = true;
  mat.side = DoubleSide;

  // Uniforms for chunk positioning.
  // Chunk 定位的 uniform
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

  // ============================================================================
  // Vertex Displacement
  // 顶点位移
  // ============================================================================
  const localU = positionLocal.x.div(chunkSize).add(0.5);
  const localV = positionLocal.z.div(chunkSize).add(0.5);

  const tilePixels = float(64.0);
  const halfPixel = float(0.5).div(tilePixels);
  const pixelRange = tilePixels.sub(1.0).div(tilePixels);
  const pixelU = halfPixel.add(localU.mul(pixelRange));
  const pixelV = halfPixel.add(localV.mul(pixelRange));
  const atlasU = tileOffsetU.add(pixelU.mul(tileScale));
  const atlasV = tileOffsetV.add(pixelV.mul(tileScale));
  const atlasUv = vec2(atlasU, atlasV);

  const height = heightTex.sample(atlasUv).r;

  mat.positionNode = vec3(
    positionLocal.x,
    positionLocal.y.add(height),
    positionLocal.z,
  );

  // Sample terrain normal.
  // 采样地形法线
  const sampledNormal = normalTex.sample(atlasUv).xyz;
  const rawNormal = normalize(sampledNormal);
  
  // Soften normal for lighting by blending toward up vector (reduces harsh front/back contrast).
  // 将法线向上方向混合以软化光照（减少正面/背面的强烈对比）
  // This creates a "wrapped diffuse" effect similar to Half-Lambert.
  // 这会产生类似于 Half-Lambert 的"包裹漫反射"效果
  const upVector = vec3(0.0, 1.0, 0.0);
  // Use shared global uniform for normal softness.
  // 使用共享全局 uniform 控制法线柔和度
  const terrainNormal = normalize(mix(rawNormal, upVector, normalSoftnessUniform));

  // World position for texture sampling.
  // 用于纹理采样的世界位置
  const worldX = chunkWorldX.add(positionLocal.x);
  const worldZ = chunkWorldZ.add(positionLocal.z);
  const worldY = height;
  const worldPos = vec3(worldX, worldY, worldZ);

  // ============================================================================
  // Triplanar Projection Setup
  // 三平面投影设置
  // ============================================================================
  const blendSharpness = float(4.0);
  const absNormal = vec3(abs(terrainNormal.x), abs(terrainNormal.y), abs(terrainNormal.z));
  const weights = vec3(
    pow(absNormal.x, blendSharpness),
    pow(absNormal.y, blendSharpness),
    pow(absNormal.z, blendSharpness),
  );
  const weightSum = add(add(weights.x, weights.y), weights.z);
  const triplanarWeights = weights.div(weightSum);

  // Check if we have real textures or use procedural.
  // 检查是否有真实纹理或使用程序纹理
  const textureResult = params.textureResult;

  if (textureResult?.useTextures && textureResult.layers.size > 0 && params.splatMap) {
    // ========================================================================
    // Mode 1: PBR Textures + Splat Map Blending
    // 模式1：PBR 纹理 + Splat Map 混合
    // ========================================================================
    const splatTex = texture(params.splatMap);
    
    // Sample splat map at world position (normalized to 0-1).
    // 在世界位置采样 splat map（归一化到 0-1）
    // Splat map covers entire world bounds centered on origin.
    // Splat map 覆盖以原点为中心的整个世界边界
    const worldSize = float(cfg.worldBounds.halfSizeMeters * 2);
    // Clamp UV to [0, 1] to prevent sampling outside texture.
    // 将 UV 钳制到 [0, 1] 以防止采样到纹理外部
    const splatU = clamp(worldX.div(worldSize).add(0.5), 0.0, 1.0);
    const splatV = clamp(worldZ.div(worldSize).add(0.5), 0.0, 1.0);
    const splatUV = vec2(splatU, splatV);
    const splatWeights = splatTex.sample(splatUV);

    // Normalize splat weights (RGBA = layers 0-3).
    // 归一化 splat 权重（RGBA = 层 0-3）
    // Protect against division by zero (fallback to 100% first layer).
    // 防止除零（默认回退到 100% 第一层）
    const splatSum = add(add(add(splatWeights.r, splatWeights.g), splatWeights.b), splatWeights.a);
    const safeSplatSum = splatSum.max(0.001);
    const normSplat = vec4(
      splatSum.lessThan(0.001).select(float(1.0), splatWeights.r.div(safeSplatSum)),
      splatSum.lessThan(0.001).select(float(0.0), splatWeights.g.div(safeSplatSum)),
      splatSum.lessThan(0.001).select(float(0.0), splatWeights.b.div(safeSplatSum)),
      splatSum.lessThan(0.001).select(float(0.0), splatWeights.a.div(safeSplatSum)),
    );

    // Sample each texture layer with triplanar projection and blend.
    // 使用三平面投影采样每个纹理层并混合
    const layers = Array.from(textureResult.layers.values());

    // Sample all layers (pad with null if less than 4).
    // 采样所有层（不足4层则填充null）

    // Helper to sample one layer with triplanar.
    // 辅助函数：使用三平面采样单层
    const sampleLayer = (layer: PBRTextureSet | undefined) => {
      if (!layer) return vec3(0, 0, 0);
      const scale = float(layer.scale);
      const coord = worldPos.div(scale);
      const tex = texture(layer.diffuse);
      const sYZ = tex.sample(vec2(coord.y, coord.z)).xyz;
      const sXZ = tex.sample(vec2(coord.x, coord.z)).xyz;
      const sXY = tex.sample(vec2(coord.x, coord.y)).xyz;
      return sYZ.mul(triplanarWeights.x)
        .add(sXZ.mul(triplanarWeights.y))
        .add(sXY.mul(triplanarWeights.z));
    };

    // Sample and blend 4 layers.
    // 采样并混合4层
    const c0 = sampleLayer(layers[0]);
    const c1 = sampleLayer(layers[1]);
    const c2 = sampleLayer(layers[2]);
    const c3 = sampleLayer(layers[3]);

    const finalColor = c0.mul(normSplat.r)
      .add(c1.mul(normSplat.g))
      .add(c2.mul(normSplat.b))
      .add(c3.mul(normSplat.a));

    mat.colorNode = finalColor;
    // Transform world-space normal to view space using cameraViewMatrix.
    // (cameraNormalMatrix is the INVERSE - it transforms view→world, not world→view)
    // 使用 cameraViewMatrix 将世界空间法线变换到视图空间。
    // （cameraNormalMatrix 是逆矩阵 - 它将视图→世界，而不是世界→视图）
    mat.normalNode = normalize(cameraViewMatrix.transformDirection(terrainNormal));
    mat.roughnessNode = float(cfg.material.roughness);
    mat.metalnessNode = float(cfg.material.metalness);

  } else {
    // ========================================================================
    // Mode 2: Procedural Blending (no texture.json)
    // 模式2：程序混合（无 texture.json）
    // ========================================================================
    // Create simple procedural colors.
    // 创建简单程序颜色
    const grassColor = vec3(0.15, 0.42, 0.12);
    const rockColor = vec3(0.38, 0.35, 0.32);
    const snowColor = vec3(0.95, 0.95, 0.98);

    // Height and slope based blending.
    // 基于高度和坡度的混合
    const slope = clamp(float(1).sub(terrainNormal.y), float(0), float(1));

    // Grass to rock by height.
    // 按高度从草到岩石
    const grassToRock = clamp(
      worldY.sub(float(cfg.material.grassToRockStartMeters))
        .div(float(cfg.material.grassToRockEndMeters - cfg.material.grassToRockStartMeters)),
      float(0),
      float(1),
    );

    // Rock by slope.
    // 按坡度显示岩石
    const rockBySlope = clamp(
      slope.sub(float(cfg.material.rockSlopeStart))
        .div(float(cfg.material.rockSlopeEnd - cfg.material.rockSlopeStart)),
      float(0),
      float(1),
    );

    const rockMask = clamp(add(grassToRock, rockBySlope), float(0), float(1));

    // Snow by height.
    // 按高度显示雪
    const snowMask = clamp(
      worldY.sub(float(cfg.material.rockToSnowStartMeters))
        .div(float(cfg.material.rockToSnowEndMeters - cfg.material.rockToSnowStartMeters)),
      float(0),
      float(1),
    );

    // Mix colors.
    // 混合颜色
    const baseColor = mix(grassColor, rockColor, rockMask);
    const finalColor = mix(baseColor, snowColor, snowMask);

    mat.colorNode = finalColor;
    // Transform world-space normal to view space using cameraViewMatrix.
    // (cameraNormalMatrix is the INVERSE - it transforms view→world, not world→view)
    // 使用 cameraViewMatrix 将世界空间法线变换到视图空间。
    // （cameraNormalMatrix 是逆矩阵 - 它将视图→世界，而不是世界→视图）
    mat.normalNode = normalize(cameraViewMatrix.transformDirection(terrainNormal));
    mat.roughnessNode = float(cfg.material.roughness);
    mat.metalnessNode = float(cfg.material.metalness);
  }

  return mat;
}
