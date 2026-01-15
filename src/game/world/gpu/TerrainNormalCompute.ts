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

    // Texel size in world units.
    // 纹素在世界单位中的大小
    const worldTexelSize = float(chunkSize / (tileRes - 1));

    // Height texture sampler.
    // 高度纹理采样器
    const heightTex = texture(this.heightTexture!);

    // Sample height at atlas UV.
    // 在图集 UV 处采样高度
    const sampleHeight = Fn(([u, v]: [
      ReturnType<typeof float>,
      ReturnType<typeof float>
    ]) => {
      // Clamp to valid range.
      // 限制到有效范围
      const clampedU = u.clamp(0, 1);
      const clampedV = v.clamp(0, 1);
      return heightTex.sample(vec2(clampedU, clampedV)).r;
    });

    const computeFn = Fn(() => {
      // Compute pixel coordinates.
      // 计算像素坐标
      const pixelX = mod(instanceIndex, uint(atlasRes));
      const pixelY = instanceIndex.div(uint(atlasRes));

      // UV in atlas.
      // 图集中的 UV
      const u = float(pixelX).div(float(atlasRes - 1));
      const v = float(pixelY).div(float(atlasRes - 1));

      // Texel offset for gradient sampling.
      // 用于梯度采样的纹素偏移
      const texelOffset = float(1).div(float(atlasRes - 1));

      // Sample heights for gradient (central differences).
      // 采样高度用于梯度（中心差分）
      const hL = sampleHeight(u.sub(texelOffset), v);
      const hR = sampleHeight(u.add(texelOffset), v);
      const hD = sampleHeight(u, v.sub(texelOffset));
      const hU = sampleHeight(u, v.add(texelOffset));

      // Compute gradients.
      // 计算梯度
      const dhdx = hR.sub(hL).div(worldTexelSize.mul(2));
      const dhdz = hU.sub(hD).div(worldTexelSize.mul(2));

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
