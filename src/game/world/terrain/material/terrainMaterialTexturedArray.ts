// terrainMaterialTexturedArray: PBR terrain material using DataArrayTexture for efficient GPU sampling.
// terrainMaterialTexturedArray：使用 DataArrayTexture 进行高效 GPU 采样的 PBR 地形材质

import {
  DoubleSide,
  MeshStandardNodeMaterial,
  type Texture,
  type StorageTexture,
} from "three/webgpu";
import {
  abs,
  clamp,
  float,
  int,
  mix,
  pow,
  add,
  vec2,
  vec3,
  texture,
  uniform,
  positionLocal,
  normalize,
  cameraViewMatrix,
} from "three/tsl";
import type { TerrainConfig } from "../terrain";
import type { TerrainTextureArrayResult } from "../TerrainTextureArrays";

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
 * Parameters for terrain material using texture arrays.
 * 使用纹理数组的地形材质参数
 */
export interface TerrainMaterialArrayParams {
  heightTexture: StorageTexture;
  normalTexture: StorageTexture;
  tileUvOffset: { x: number; y: number };
  tileUvScale: number;
  chunkWorldX: number;
  chunkWorldZ: number;
  chunkSize: number;
  /** Array of splat map textures (one per 4 layers, null = use procedural blending) */
  splatMaps?: (Texture | null)[];
  /** Texture array result from TerrainTextureArrays loader */
  textureArrays?: TerrainTextureArrayResult | null;
}

/**
 * Create terrain material with PBR texture arrays and splat map blending.
 * 创建使用 PBR 纹理数组和 splat map 混合的地形材质
 *
 * Benefits of texture arrays / 纹理数组的优势:
 * - Only 4 texture slots (diffuse, normal, arm, displacement arrays)
 *   只需 4 个纹理槽（漫反射、法线、ARM、位移数组）
 * - Scalable to many terrain types without WebGPU limits
 *   可扩展到多种地形类型而不受 WebGPU 限制
 * - Better GPU cache utilization
 *   更好的 GPU 缓存利用率
 */
export function createTexturedArrayTerrainMaterial(
  cfg: TerrainConfig,
  params: TerrainMaterialArrayParams,
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

  // Soften normal for lighting.
  // 软化法线以柔和光照
  const upVector = vec3(0.0, 1.0, 0.0);
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

  // Check if we have texture arrays or use procedural.
  // 检查是否有纹理数组或使用程序纹理
  const textureArrays = params.textureArrays;
  const splatMaps = params.splatMaps ?? [];
  const hasSplatMaps = splatMaps.length > 0 && splatMaps[0] !== null;

  if (textureArrays?.useTextures && textureArrays.diffuseArray && hasSplatMaps) {
    // ========================================================================
    // Mode 1: PBR Texture Arrays + Multi-Splat Map Blending
    // 模式1：PBR 纹理数组 + 多 Splat Map 混合
    // ========================================================================

    // Splat map UV calculation (same for all splat maps).
    // Splat map UV 计算（所有 splat map 相同）
    const worldSize = float(cfg.worldBounds.halfSizeMeters * 2);
    const splatU = clamp(worldX.div(worldSize).add(0.5), 0.0, 1.0);
    const splatV = clamp(worldZ.div(worldSize).add(0.5), 0.0, 1.0);
    const splatUV = vec2(splatU, splatV);

    // Create texture nodes for arrays.
    // 创建纹理数组节点
    const diffuseArray = textureArrays.diffuseArray!;
    const normalArray = textureArrays.normalArray!;
    const armArray = textureArrays.armArray!;

    // Scale values for each layer.
    // 每层的缩放值
    const scales = textureArrays.scales;
    const layerCount = textureArrays.layerCount;
    const layerAssignments = textureArrays.layerAssignments;

    // Helper: triplanar sample from texture array at specific layer.
    // 辅助函数：从纹理数组的特定层进行三平面采样
    const triplanarSampleArray = (
      texArrayData: typeof diffuseArray,
      layerIndex: number,
      scale: number,
    ) => {
      const s = float(scale);
      const coord = worldPos.div(s);
      const layer = int(layerIndex);

      // Create texture nodes with UV passed to constructor, then depth for layer selection.
      // 创建带 UV 的纹理节点，然后用 depth 选择层
      const sYZ = texture(texArrayData, vec2(coord.y, coord.z)).depth(layer).xyz;
      const sXZ = texture(texArrayData, vec2(coord.x, coord.z)).depth(layer).xyz;
      const sXY = texture(texArrayData, vec2(coord.x, coord.y)).depth(layer).xyz;

      return sYZ.mul(triplanarWeights.x)
        .add(sXZ.mul(triplanarWeights.y))
        .add(sXY.mul(triplanarWeights.z));
    };

    // Create splat map texture nodes for each available splat map.
    // 为每个可用的 splat map 创建纹理节点
    const splatTexNodes = splatMaps
      .filter((t): t is Texture => t !== null)
      .map((t) => texture(t));

    // Sample each splat map.
    // 采样每个 splat map
    const splatSamples = splatTexNodes.map((tex) => tex.sample(splatUV));

    // Build layer contributions: weighted diffuse, normal, ARM for each layer.
    // 构建层贡献：每层的加权漫反射、法线、ARM
    const layerContributions: Array<{
      diffuse: ReturnType<typeof triplanarSampleArray>;
      normal: ReturnType<typeof triplanarSampleArray>;
      arm: ReturnType<typeof triplanarSampleArray>;
      weight: ReturnType<typeof float>;
    }> = [];

    for (let i = 0; i < layerCount; i++) {
      const assignment = layerAssignments[i];
      if (!assignment) continue;

      const { splatMapIndex, channel } = assignment;

      // Skip if splat map not available.
      // 如果 splat map 不可用则跳过
      if (splatMapIndex >= splatSamples.length) continue;

      const splatSample = splatSamples[splatMapIndex];

      // Get weight from the appropriate channel (0=R, 1=G, 2=B, 3=A).
      // 从适当的通道获取权重（0=R, 1=G, 2=B, 3=A）
      const layerWeight = [splatSample.r, splatSample.g, splatSample.b, splatSample.a][channel];

      // Sample textures for this layer.
      // 为此层采样纹理
      const layerDiffuse = triplanarSampleArray(diffuseArray, i, scales[i] ?? 4);
      const layerNormal = triplanarSampleArray(normalArray, i, scales[i] ?? 4);
      const layerARM = triplanarSampleArray(armArray, i, scales[i] ?? 4);

      layerContributions.push({
        diffuse: layerDiffuse.mul(layerWeight),
        normal: layerNormal.mul(layerWeight),
        arm: layerARM.mul(layerWeight),
        weight: layerWeight,
      });
    }

    // If no layers have splat map data, fallback to first layer only.
    // 如果没有层有 splat map 数据，回退到仅第一层
    if (layerContributions.length === 0) {
      layerContributions.push({
        diffuse: triplanarSampleArray(diffuseArray, 0, scales[0] ?? 4),
        normal: triplanarSampleArray(normalArray, 0, scales[0] ?? 4),
        arm: triplanarSampleArray(armArray, 0, scales[0] ?? 4),
        weight: float(1),
      });
    }

    // Reduce all layer contributions into final accumulated values.
    // 将所有层贡献 reduce 为最终累积值
    // Start with the first contribution.
    // 从第一个贡献开始
    const first = layerContributions[0];
    let accDiffuse = first.diffuse;
    let accNormal = first.normal;
    let accARM = first.arm;
    let totalWeight = first.weight;

    // Add remaining contributions.
    // 添加剩余贡献
    for (let i = 1; i < layerContributions.length; i++) {
      const c = layerContributions[i];
      accDiffuse = accDiffuse.add(c.diffuse);
      accNormal = accNormal.add(c.normal);
      accARM = accARM.add(c.arm);
      totalWeight = totalWeight.add(c.weight);
    }

    // Normalize by total weight (fallback to first layer if no weight).
    // 按总权重归一化（如无权重则回退到第一层）
    const safeWeight = totalWeight.max(0.001);
    const finalDiffuse = accDiffuse.div(safeWeight);
    const blendedNormalMap = accNormal.div(safeWeight);
    const finalARM = accARM.div(safeWeight);

    // Convert and apply normal map.
    // 转换并应用法线贴图
    const tangentNormal = normalize(blendedNormalMap.mul(2.0).sub(1.0));
    const perturbedNormal = normalize(
      vec3(
        terrainNormal.x.add(tangentNormal.x.mul(0.5)),
        terrainNormal.y.add(tangentNormal.z),
        terrainNormal.z.add(tangentNormal.y.mul(0.5)),
      )
    );

    // Extract AO, Roughness, Metallic.
    // 提取 AO、Roughness、Metallic
    const finalAO = finalARM.x;
    const finalRoughness = finalARM.y;
    const finalMetallic = finalARM.z;

    // Apply AO.
    // 应用 AO
    const aoIntensity = float(0.5);
    const aoFactor = mix(float(1.0), finalAO, aoIntensity);
    const finalColor = finalDiffuse.mul(aoFactor);

    mat.colorNode = finalColor;
    mat.normalNode = normalize(cameraViewMatrix.transformDirection(perturbedNormal));
    mat.roughnessNode = finalRoughness;
    mat.metalnessNode = finalMetallic;

  } else {
    // ========================================================================
    // Mode 2: Procedural Blending (no texture.json)
    // 模式2：程序混合（无 texture.json）
    // ========================================================================
    const grassColor = vec3(0.15, 0.42, 0.12);
    const rockColor = vec3(0.38, 0.35, 0.32);
    const snowColor = vec3(0.95, 0.95, 0.98);

    const slope = clamp(float(1).sub(terrainNormal.y), float(0), float(1));

    const grassToRock = clamp(
      worldY.sub(float(cfg.material.grassToRockStartMeters))
        .div(float(cfg.material.grassToRockEndMeters - cfg.material.grassToRockStartMeters)),
      float(0),
      float(1),
    );

    const rockBySlope = clamp(
      slope.sub(float(cfg.material.rockSlopeStart))
        .div(float(cfg.material.rockSlopeEnd - cfg.material.rockSlopeStart)),
      float(0),
      float(1),
    );

    const rockMask = clamp(add(grassToRock, rockBySlope), float(0), float(1));

    const snowMask = clamp(
      worldY.sub(float(cfg.material.rockToSnowStartMeters))
        .div(float(cfg.material.rockToSnowEndMeters - cfg.material.rockToSnowStartMeters)),
      float(0),
      float(1),
    );

    const baseColor = mix(grassColor, rockColor, rockMask);
    const finalColor = mix(baseColor, snowColor, snowMask);

    mat.colorNode = finalColor;
    mat.normalNode = normalize(cameraViewMatrix.transformDirection(terrainNormal));
    mat.roughnessNode = float(cfg.material.roughness);
    mat.metalnessNode = float(cfg.material.metalness);
  }

  return mat;
}
