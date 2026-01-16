// TerrainBrushCompute: GPU compute shader for terrain brush editing.
// TerrainBrushCompute：用于地形画刷编辑的 GPU 计算着色器

import {
  float,
  textureStore,
  textureLoad,
  uvec2,
  ivec2,
  vec4,
  instanceIndex,
  Fn,
  uniform,
  uint,
  int,
  mod,
  If,
} from "three/tsl";
import {
  FloatType,
  RedFormat,
  StorageTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { ComputeNode } from "three/webgpu";
import type { TerrainConfig } from "../terrain";
import type { BrushStroke } from "../../editor/TerrainEditor";

/**
 * GPU compute pipeline for terrain brush editing.
 * GPU 地形画刷编辑的计算管线
 *
 * Applies brush strokes directly to the height texture atlas.
 * 将画刷笔触直接应用到高度纹理图集
 */
export class TerrainBrushCompute {
  private readonly config: TerrainConfig;

  // Resolution per chunk tile.
  // 每个 chunk tile 的分辨率
  private readonly tileResolution: number;

  // Atlas dimensions.
  // 图集尺寸
  private readonly atlasTilesPerSide: number;

  // Reference to height texture (from TerrainHeightCompute).
  // 高度纹理的引用（来自 TerrainHeightCompute）
  private heightTexture: StorageTexture | null = null;

  // Edit delta texture (stores accumulated edits).
  // 编辑增量纹理（存储累积的编辑）
  editDeltaTexture: StorageTexture | null = null;

  // Brush uniforms.
  // 画刷 uniform
  private brushCenterX = uniform(0);
  private brushCenterZ = uniform(0);
  private brushRadius = uniform(10);
  private brushStrength = uniform(0.5);
  private brushFalloff = uniform(0.7);
  private brushDt = uniform(0.016);
  // 0 = raise, 1 = lower, 2 = smooth, 3 = flatten
  private brushType = uniform(0);

  // Target tile coordinates.
  // 目标 tile 坐标
  private targetTileX = uniform(0);
  private targetTileZ = uniform(0);

  // Chunk world offset (for world-space brush position).
  // Chunk 世界偏移（用于世界空间画刷位置）
  private chunkOffsetX = uniform(0);
  private chunkOffsetZ = uniform(0);

  // Compute node for brush application.
  // 画刷应用的计算节点
  private computeNode: ComputeNode | null = null;

  constructor(config: TerrainConfig) {
    this.config = config;
    this.tileResolution = config.gpuCompute.tileResolution;
    this.atlasTilesPerSide = config.gpuCompute.atlasTilesPerSide;
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   */
  async init(renderer: WebGPURenderer, heightTexture: StorageTexture): Promise<void> {
    this.heightTexture = heightTexture;

    // Create edit delta texture (same resolution as height texture).
    // 创建编辑增量纹理（与高度纹理相同分辨率）
    const atlasRes = this.tileResolution * this.atlasTilesPerSide;
    this.editDeltaTexture = new StorageTexture(atlasRes, atlasRes);
    this.editDeltaTexture.type = FloatType;
    this.editDeltaTexture.format = RedFormat;

    // Build compute shader.
    // 构建计算着色器
    this.buildComputeShader();

    // Initialize with renderer.
    // 使用渲染器初始化
    await renderer.computeAsync(this.computeNode!);
  }

  private buildComputeShader(): void {
    const tileRes = this.tileResolution;
    const chunkSize = float(this.config.streaming.chunkSizeMeters);
    const atlasSize = this.tileResolution * this.atlasTilesPerSide;
    const heightTexRef = this.heightTexture!;

    const computeFn = Fn(() => {
      // Compute pixel coordinates from instance index.
      // 从实例索引计算像素坐标
      const pixelX = mod(instanceIndex, uint(tileRes));
      const pixelY = mod(instanceIndex.div(uint(tileRes)), uint(tileRes));

      // Get target tile coordinates.
      // 获取目标 tile 坐标
      const tileXCoord = uint(this.targetTileX);
      const tileZCoord = uint(this.targetTileZ);

      // Atlas coordinates.
      // 图集坐标
      const atlasX = tileXCoord.mul(uint(tileRes)).add(pixelX);
      const atlasY = tileZCoord.mul(uint(tileRes)).add(pixelY);

      // World coordinates of this pixel.
      // 此像素的世界坐标
      const localU = float(pixelX).div(float(tileRes - 1));
      const localV = float(pixelY).div(float(tileRes - 1));
      const worldX = float(this.chunkOffsetX).mul(chunkSize).add(localU.mul(chunkSize));
      const worldZ = float(this.chunkOffsetZ).mul(chunkSize).add(localV.mul(chunkSize));

      // Distance from brush center.
      // 到画刷中心的距离
      const dx = worldX.sub(this.brushCenterX);
      const dz = worldZ.sub(this.brushCenterZ);
      const dist = dx.mul(dx).add(dz.mul(dz)).sqrt();

      // Brush falloff: smoothstep from radius to radius*falloff.
      // 画刷衰减：从 radius 到 radius*falloff 的平滑步进
      const innerRadius = this.brushRadius.mul(float(1).sub(this.brushFalloff));
      const outerRadius = this.brushRadius;

      // t = 0 at inner edge, 1 at outer edge.
      // t = 0 在内边缘，1 在外边缘
      const t = dist.sub(innerRadius).div(outerRadius.sub(innerRadius)).clamp(0, 1);
      // Inverted smoothstep: 1 at center, 0 at edge.
      // 反向平滑步进：中心为 1，边缘为 0
      const falloffMask = float(1).sub(t.mul(t).mul(float(3).sub(t.mul(2))));

      // Only affect pixels inside brush radius.
      // 只影响画刷半径内的像素
      const insideBrush = dist.lessThan(outerRadius);

      // Read current height using textureLoad with integer coords.
      // 使用整数坐标的 textureLoad 读取当前高度
      const readCoord = ivec2(int(atlasX), int(atlasY));
      const currentHeight = textureLoad(heightTexRef, readCoord).r;

      // Calculate height delta based on brush type.
      // 根据画刷类型计算高度增量
      const delta = float(0).toVar();
      const strengthPerSecond = float(50); // 50 meters per second at full strength
      const effectStrength = this.brushStrength.mul(this.brushDt).mul(strengthPerSecond).mul(falloffMask);

      // Raise (type 0).
      // 抬高（类型 0）
      If(this.brushType.equal(0), () => {
        delta.assign(effectStrength);
      });

      // Lower (type 1).
      // 降低（类型 1）
      If(this.brushType.equal(1), () => {
        delta.assign(effectStrength.negate());
      });

      // Smooth (type 2) - blend towards average of neighbors.
      // 平滑（类型 2）- 混合邻居的平均值
      If(this.brushType.equal(2), () => {
        // Sample neighbors (simplified 4-sample average) using textureLoad.
        // 使用 textureLoad 采样邻居（简化的 4 采样平均）
        const h0 = textureLoad(heightTexRef, readCoord.add(ivec2(1, 0))).r;
        const h1 = textureLoad(heightTexRef, readCoord.add(ivec2(-1, 0))).r;
        const h2 = textureLoad(heightTexRef, readCoord.add(ivec2(0, 1))).r;
        const h3 = textureLoad(heightTexRef, readCoord.add(ivec2(0, -1))).r;
        const avgHeight = h0.add(h1).add(h2).add(h3).div(4);

        const smoothFactor = this.brushStrength.mul(this.brushDt).mul(5).mul(falloffMask);
        delta.assign(avgHeight.sub(currentHeight).mul(smoothFactor));
      });

      // Flatten (type 3) - bring towards brush center height.
      // 平整（类型 3）- 向画刷中心高度靠拢
      If(this.brushType.equal(3), () => {
        // Sample center height.
        // 采样中心高度
        const centerU = float(this.brushCenterX).div(chunkSize).sub(float(this.chunkOffsetX));
        const centerV = float(this.brushCenterZ).div(chunkSize).sub(float(this.chunkOffsetZ));
        const centerPixelX = int(centerU.mul(float(tileRes - 1)));
        const centerPixelY = int(centerV.mul(float(tileRes - 1)));
        const centerAtlasX = int(tileXCoord).mul(int(tileRes)).add(centerPixelX);
        const centerAtlasY = int(tileZCoord).mul(int(tileRes)).add(centerPixelY);
        const centerCoord = ivec2(
          centerAtlasX.clamp(0, atlasSize - 1),
          centerAtlasY.clamp(0, atlasSize - 1)
        );
        const targetHeight = textureLoad(heightTexRef, centerCoord).r;

        const flattenFactor = this.brushStrength.mul(this.brushDt).mul(3).mul(falloffMask);
        delta.assign(targetHeight.sub(currentHeight).mul(flattenFactor));
      });

      // Apply delta if inside brush.
      // 如果在画刷内则应用增量
      const newHeight = currentHeight.add(delta);

      If(insideBrush, () => {
        textureStore(heightTexRef, uvec2(atlasX, atlasY), vec4(newHeight, float(0), float(0), float(1)));
      });
    });

    this.computeNode = computeFn().compute(tileRes * tileRes);
  }

  /**
   * Apply a brush stroke to a chunk.
   * 将画刷笔触应用到 chunk
   */
  async applyBrushToChunk(
    cx: number,
    cz: number,
    tileX: number,
    tileZ: number,
    stroke: BrushStroke,
    renderer: WebGPURenderer
  ): Promise<void> {
    // Set uniforms.
    // 设置 uniform
    this.brushCenterX.value = stroke.worldX;
    this.brushCenterZ.value = stroke.worldZ;
    this.brushRadius.value = stroke.brush.radiusMeters;
    this.brushStrength.value = stroke.brush.strength;
    this.brushFalloff.value = stroke.brush.falloff;
    this.brushDt.value = stroke.dt;

    // Map brush type to integer.
    // 将画刷类型映射为整数
    const typeMap: Record<string, number> = {
      raise: 0,
      lower: 1,
      smooth: 2,
      flatten: 3,
    };
    this.brushType.value = typeMap[stroke.brush.type] ?? 0;

    // Set target tile and chunk offset.
    // 设置目标 tile 和 chunk 偏移
    this.targetTileX.value = tileX;
    this.targetTileZ.value = tileZ;
    this.chunkOffsetX.value = cx;
    this.chunkOffsetZ.value = cz;

    // Execute compute shader.
    // 执行计算着色器
    await renderer.computeAsync(this.computeNode!);
  }

  dispose(): void {
    if (this.editDeltaTexture) {
      this.editDeltaTexture = null;
    }
    this.heightTexture = null;
    this.computeNode = null;
  }
}
