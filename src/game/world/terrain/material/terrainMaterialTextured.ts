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
import type { TerrainConfig } from "../terrain";
import type { TerrainTextureResult, PBRTextureSet } from "../TerrainTextures";

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

    // Helper to do triplanar sampling for any texture.
    // 辅助函数：对任意纹理进行三平面采样
    const triplanarSample = (tex: ReturnType<typeof texture>, scale: ReturnType<typeof float>) => {
      const coord = worldPos.div(scale);
      const sYZ = tex.sample(vec2(coord.y, coord.z)).xyz;
      const sXZ = tex.sample(vec2(coord.x, coord.z)).xyz;
      const sXY = tex.sample(vec2(coord.x, coord.y)).xyz;
      return sYZ.mul(triplanarWeights.x)
        .add(sXZ.mul(triplanarWeights.y))
        .add(sXY.mul(triplanarWeights.z));
    };

    // Sample diffuse for one layer.
    // 采样单层的漫反射
    const sampleDiffuse = (layer: PBRTextureSet | undefined) => {
      if (!layer) return vec3(0.5, 0.5, 0.5);
      return triplanarSample(texture(layer.diffuse), float(layer.scale));
    };

    // Sample normal map for one layer (returns tangent-space normal).
    // 采样单层的法线贴图（返回切线空间法线）
    const sampleNormal = (layer: PBRTextureSet | undefined) => {
      if (!layer?.normal) return vec3(0.5, 0.5, 1.0); // Flat normal / 平面法线
      return triplanarSample(texture(layer.normal), float(layer.scale));
    };

    // Sample ARM (AO, Roughness, Metallic) or separate maps.
    // 采样 ARM（AO、Roughness、Metallic）或分开的贴图
    const sampleARM = (layer: PBRTextureSet | undefined) => {
      if (!layer) return vec3(1.0, 0.8, 0.0); // Default: AO=1, Rough=0.8, Metal=0
      const scale = float(layer.scale);
      if (layer.arm) {
        // ARM packed texture / ARM 打包纹理
        return triplanarSample(texture(layer.arm), scale);
      } else {
        // Separate maps or defaults / 分开的贴图或默认值
        const ao = layer.ao ? triplanarSample(texture(layer.ao), scale).x : float(1.0);
        const rough = layer.roughness ? triplanarSample(texture(layer.roughness), scale).x : float(0.8);
        const metal = layer.metallic ? triplanarSample(texture(layer.metallic), scale).x : float(0.0);
        return vec3(ao, rough, metal);
      }
    };

    // Sample and blend 4 layers - Diffuse.
    // 采样并混合4层 - 漫反射
    const d0 = sampleDiffuse(layers[0]);
    const d1 = sampleDiffuse(layers[1]);
    const d2 = sampleDiffuse(layers[2]);
    const d3 = sampleDiffuse(layers[3]);

    const finalDiffuse = d0.mul(normSplat.r)
      .add(d1.mul(normSplat.g))
      .add(d2.mul(normSplat.b))
      .add(d3.mul(normSplat.a));

    // Sample and blend 4 layers - Normal.
    // 采样并混合4层 - 法线
    const n0 = sampleNormal(layers[0]);
    const n1 = sampleNormal(layers[1]);
    const n2 = sampleNormal(layers[2]);
    const n3 = sampleNormal(layers[3]);

    const blendedNormalMap = n0.mul(normSplat.r)
      .add(n1.mul(normSplat.g))
      .add(n2.mul(normSplat.b))
      .add(n3.mul(normSplat.a));

    // Convert normal map (0-1) to tangent space (-1 to 1) and apply to terrain normal.
    // 将法线贴图（0-1）转换为切线空间（-1到1）并应用到地形法线
    const tangentNormal = normalize(blendedNormalMap.mul(2.0).sub(1.0));
    
    // Perturb the terrain normal using the tangent-space normal (simplified TBN).
    // 使用切线空间法线扰动地形法线（简化的 TBN）
    // For terrain, we approximate: tangent = X axis, bitangent = Z axis.
    // 对于地形，我们近似：tangent = X 轴，bitangent = Z 轴
    const perturbedNormal = normalize(
      vec3(
        terrainNormal.x.add(tangentNormal.x.mul(0.5)),
        terrainNormal.y.add(tangentNormal.z),
        terrainNormal.z.add(tangentNormal.y.mul(0.5)),
      )
    );

    // Sample and blend 4 layers - ARM (AO, Roughness, Metallic).
    // 采样并混合4层 - ARM（AO、Roughness、Metallic）
    const arm0 = sampleARM(layers[0]);
    const arm1 = sampleARM(layers[1]);
    const arm2 = sampleARM(layers[2]);
    const arm3 = sampleARM(layers[3]);

    const finalARM = arm0.mul(normSplat.r)
      .add(arm1.mul(normSplat.g))
      .add(arm2.mul(normSplat.b))
      .add(arm3.mul(normSplat.a));

    // Extract AO, Roughness, Metallic from blended ARM.
    // 从混合后的 ARM 中提取 AO、Roughness、Metallic
    const finalAO = finalARM.x;
    const finalRoughness = finalARM.y;
    const finalMetallic = finalARM.z;

    // Apply AO to diffuse color.
    // 将 AO 应用到漫反射颜色
    const aoIntensity = float(0.5); // AO strength / AO 强度
    const aoFactor = mix(float(1.0), finalAO, aoIntensity);
    const finalColor = finalDiffuse.mul(aoFactor);

    mat.colorNode = finalColor;
    // Transform perturbed normal to view space.
    // 将扰动后的法线变换到视图空间
    mat.normalNode = normalize(cameraViewMatrix.transformDirection(perturbedNormal));
    mat.roughnessNode = finalRoughness;
    mat.metalnessNode = finalMetallic;

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
