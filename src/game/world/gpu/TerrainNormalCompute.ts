// TerrainNormalCompute: GPU compute shader for terrain normal generation.
// TerrainNormalCompute：用于地形法线生成的 GPU 计算着色器

import {
  float,
  texture,
  textureStore,
  uvec2,
  vec2,
  vec4,
  instanceIndex,
  Fn,
  uint,
  normalize,
  vec3,
  mod,
} from "three/tsl";
import {
  FloatType,
  LinearFilter,
  RGBAFormat,
  StorageTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { ComputeNode } from "three/webgpu";
import type { TerrainConfig } from "../terrain";

/**
 * GPU compute pipeline for terrain normal generation.
 * GPU 地形法线生成的计算管线
 *
 * Reads from height atlas and generates normal atlas.
 * 从高度图集读取并生成法线图集。
 */
export class TerrainNormalCompute {
  private readonly config: TerrainConfig;

  // Resolution per chunk tile (from config, must match height compute).
  // 每个 chunk tile 的分辨率（来自配置，必须与高度计算匹配）
  private readonly tileResolution: number;

  // Atlas dimensions (from config).
  // 图集尺寸（来自配置）
  private readonly atlasTilesPerSide: number;
  private readonly atlasResolution: number;

  // Normal storage texture (RGBA32F atlas - xyz = normal, w = unused).
  // 法线存储纹理（RGBA32F 图集 - xyz = 法线, w = 未使用）
  normalTexture: StorageTexture | null = null;

  // Reference to height texture for sampling.
  // 用于采样的高度纹理引用
  private heightTexture: StorageTexture | null = null;

  // Compute node for normal generation.
  // 法线生成的计算节点
  private computeNode: ComputeNode | null = null;

  constructor(config: TerrainConfig) {
    this.config = config;
    this.tileResolution = config.gpuCompute.tileResolution;
    this.atlasTilesPerSide = config.gpuCompute.atlasTilesPerSide;
    this.atlasResolution = this.tileResolution * this.atlasTilesPerSide;
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   *
   * @param heightTexture The height atlas texture from TerrainHeightCompute.
   */
  async init(renderer: WebGPURenderer, heightTexture: StorageTexture): Promise<void> {
    this.heightTexture = heightTexture;

    // Create normal storage texture (RGBA for xyz normal + padding).
    // 创建法线存储纹理（RGBA 用于 xyz 法线 + 填充）
    this.normalTexture = new StorageTexture(this.atlasResolution, this.atlasResolution);
    this.normalTexture.type = FloatType;
    this.normalTexture.format = RGBAFormat;
    // Use LINEAR filter for smooth interpolation.
    // 使用 LINEAR 过滤器进行平滑插值
    this.normalTexture.magFilter = LinearFilter;
    this.normalTexture.minFilter = LinearFilter;

    // Build compute shader.
    // 构建计算着色器
    this.buildComputeShader();

    // Initial compute pass (will be re-run when chunks bake).
    // 初始计算通道（chunk 烘焙时会重新运行）
    await renderer.computeAsync(this.computeNode!);
  }

  private buildComputeShader(): void {
    const cfg = this.config;
    const atlasRes = this.atlasResolution;
    const chunkSize = cfg.streaming.chunkSizeMeters;
    const tileRes = this.tileResolution;

    // World distance between adjacent pixels in a tile.
    // tile 中相邻像素之间的世界距离
    // With edge alignment: pixel 0 at x=0, pixel 63 at x=chunkSize
    // So pixel step = chunkSize / (tileRes - 1)
    // 边缘对齐：像素 0 在 x=0，像素 63 在 x=chunkSize
    // 所以像素步长 = chunkSize / (tileRes - 1)
    const pixelWorldStep = float(chunkSize / (tileRes - 1));

    // Height texture sampler.
    // 高度纹理采样器
    const heightTex = texture(this.heightTexture!);

    // Sample height at atlas UV.
    // 在图集 UV 处采样高度
    const sampleHeight = Fn(([u, v]: [
      ReturnType<typeof float>,
      ReturnType<typeof float>
    ]) => {
      const clampedU = u.clamp(0, 1);
      const clampedV = v.clamp(0, 1);
      return heightTex.sample(vec2(clampedU, clampedV)).r;
    });

    const computeFn = Fn(() => {
      // Compute pixel coordinates within atlas.
      // 计算图集内的像素坐标
      const pixelX = mod(instanceIndex, uint(atlasRes));
      const pixelY = instanceIndex.div(uint(atlasRes));

      // Compute which tile this pixel belongs to.
      // 计算此像素属于哪个 tile
      const tileX = pixelX.div(uint(tileRes));
      const tileY = pixelY.div(uint(tileRes));

      // Pixel position within tile (0 to tileRes-1).
      // tile 内的像素位置（0 到 tileRes-1）
      const localX = mod(pixelX, uint(tileRes));
      const localY = mod(pixelY, uint(tileRes));

      // UV in atlas (pixel center for sampling).
      // 图集中的 UV（采样用的像素中心）
      const u = float(pixelX).add(0.5).div(float(atlasRes));
      const v = float(pixelY).add(0.5).div(float(atlasRes));

      // One pixel step in atlas UV space.
      // 图集 UV 空间中的一像素步长
      const texelStep = float(1).div(float(atlasRes));

      // Tile boundaries (first and last pixel centers).
      // tile 边界（第一个和最后一个像素中心）
      const tileStartU = float(tileX.mul(uint(tileRes))).add(0.5).div(float(atlasRes));
      const tileStartV = float(tileY.mul(uint(tileRes))).add(0.5).div(float(atlasRes));
      const tileEndU = float(tileX.mul(uint(tileRes)).add(uint(tileRes - 1))).add(0.5).div(float(atlasRes));
      const tileEndV = float(tileY.mul(uint(tileRes)).add(uint(tileRes - 1))).add(0.5).div(float(atlasRes));

      // Sample heights, clamping to tile boundaries.
      // 采样高度，限制在 tile 边界内
      const uL = u.sub(texelStep).max(tileStartU);
      const uR = u.add(texelStep).min(tileEndU);
      const vD = v.sub(texelStep).max(tileStartV);
      const vU = v.add(texelStep).min(tileEndV);

      const hL = sampleHeight(uL, v);
      const hR = sampleHeight(uR, v);
      const hD = sampleHeight(u, vD);
      const hU = sampleHeight(u, vU);

      // Check if we're at tile boundary (use one-sided difference).
      // 检查是否在 tile 边界（使用单侧差分）
      const isLeftEdge = float(localX).lessThan(0.5);
      const isRightEdge = float(localX).greaterThan(float(tileRes - 1).sub(0.5));
      const isBottomEdge = float(localY).lessThan(0.5);
      const isTopEdge = float(localY).greaterThan(float(tileRes - 1).sub(0.5));

      // Distance for gradient (1 pixel step normally, half at edges).
      // 梯度距离（正常是 1 像素步长，边界是半个）
      const dxPixels = isLeftEdge.or(isRightEdge).select(float(1), float(2));
      const dzPixels = isBottomEdge.or(isTopEdge).select(float(1), float(2));

      // Compute gradients in world units.
      // 计算世界单位的梯度
      const dhdx = hR.sub(hL).div(dxPixels.mul(pixelWorldStep));
      const dhdz = hU.sub(hD).div(dzPixels.mul(pixelWorldStep));

      // Normal from height gradient: n = normalize(-dhdx, 1, -dhdz).
      // 从高度梯度计算法线: n = normalize(-dhdx, 1, -dhdz)
      const normal = normalize(vec3(dhdx.negate(), float(1), dhdz.negate()));

      // Write to normal atlas.
      // 写入法线图集
      textureStore(this.normalTexture!, uvec2(pixelX, pixelY), vec4(normal, float(1)));
    });

    this.computeNode = computeFn().compute(atlasRes * atlasRes);
  }

  /**
   * Regenerate normals after height changes.
   * 高度变化后重新生成法线
   */
  async regenerate(renderer: WebGPURenderer): Promise<void> {
    if (this.computeNode) {
      await renderer.computeAsync(this.computeNode);
    }
  }

  dispose(): void {
    this.normalTexture = null;
    this.heightTexture = null;
    this.computeNode = null;
  }
}
