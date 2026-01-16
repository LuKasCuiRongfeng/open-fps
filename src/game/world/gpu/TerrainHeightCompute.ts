// TerrainHeightCompute: GPU compute pipeline for terrain height generation.
// TerrainHeightCompute：用于地形高度生成的 GPU 计算管线

import { uniform } from "three/tsl";
import {
  FloatType,
  RedFormat,
  LinearFilter,
  StorageTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { ComputeNode } from "three/webgpu";
import type { TerrainConfig } from "../terrain";
import { TileAtlasAllocator } from "./TileAtlasAllocator";
import { GpuTextureIO } from "./GpuTextureIO";
import { createHashTexture, buildHeightComputeShader } from "./TerrainNoiseShader";

/**
 * GPU compute pipeline for terrain height generation.
 * GPU 地形高度生成的计算管线
 *
 * Uses dynamic tile allocation to support infinite terrain streaming.
 * 使用动态 tile 分配以支持无限地形流式加载
 *
 * Generates a tiled heightmap texture where each tile represents a chunk.
 * 生成一个分块高度图纹理，每个 tile 代表一个 chunk。
 */
export class TerrainHeightCompute {
  private readonly config: TerrainConfig;

  // Tile atlas allocator.
  // Tile 图集分配器
  private readonly allocator: TileAtlasAllocator;

  // GPU texture I/O handler.
  // GPU 纹理 I/O 处理器
  private textureIO: GpuTextureIO | null = null;

  // Height storage texture (R32F atlas).
  // 高度存储纹理（R32F 图集）
  heightTexture: StorageTexture | null = null;

  // Chunk offset uniforms for baking (world coordinates).
  // 用于烘焙的 chunk 偏移 uniform（世界坐标）
  private chunkOffsetX = uniform(0);
  private chunkOffsetZ = uniform(0);

  // Pre-computed tile coordinates (handles negative chunk coords correctly).
  // 预计算的 tile 坐标（正确处理负数 chunk 坐标）
  private tileX = uniform(0);
  private tileZ = uniform(0);

  // Compute node for height baking.
  // 高度烘焙的计算节点
  private computeNode: ComputeNode | null = null;

  constructor(config: TerrainConfig) {
    this.config = config;
    this.allocator = new TileAtlasAllocator(
      config.gpuCompute.tileResolution,
      config.gpuCompute.atlasTilesPerSide
    );
  }

  /**
   * Allocate a tile for a chunk.
   * 为 chunk 分配一个 tile
   */
  allocateTile(cx: number, cz: number): number {
    return this.allocator.allocate(cx, cz);
  }

  /**
   * Free a tile when chunk is unloaded.
   * chunk 卸载时释放 tile
   */
  freeTile(cx: number, cz: number): void {
    this.allocator.free(cx, cz);
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   */
  async init(renderer: WebGPURenderer): Promise<void> {
    // Create hash texture for noise.
    // 创建用于噪声的哈希纹理
    const hashTexture = createHashTexture(this.config.height.seed);

    // Create height storage texture with R32F format for single-channel height.
    // 创建 R32F 格式的高度存储纹理，用于单通道高度
    this.heightTexture = new StorageTexture(
      this.allocator.atlasResolution,
      this.allocator.atlasResolution
    );
    this.heightTexture.type = FloatType;
    this.heightTexture.format = RedFormat;
    this.heightTexture.magFilter = LinearFilter;
    this.heightTexture.minFilter = LinearFilter;

    // Create texture I/O handler.
    // 创建纹理 I/O 处理器
    this.textureIO = new GpuTextureIO(
      this.allocator.tileResolution,
      this.allocator,
      this.heightTexture
    );

    // Build compute shader.
    // 构建计算着色器
    this.computeNode = buildHeightComputeShader(
      this.config,
      this.heightTexture,
      hashTexture,
      this.chunkOffsetX,
      this.chunkOffsetZ,
      this.tileX,
      this.tileZ
    );

    // Wait for renderer to be ready.
    // 等待渲染器就绪
    await renderer.computeAsync(this.computeNode);
  }

  /**
   * Bake height for a chunk into the atlas.
   * 将一个 chunk 的高度烘焙到图集中
   *
   * @param cx Chunk X coordinate.
   * @param cz Chunk Z coordinate.
   * @param renderer WebGPU renderer.
   * @returns The allocated tile index, or -1 if allocation failed.
   */
  async bakeChunk(cx: number, cz: number, renderer: WebGPURenderer): Promise<number> {
    // Allocate tile for this chunk (or get existing).
    // 为此 chunk 分配 tile（或获取已有的）
    const tileIndex = this.allocator.allocate(cx, cz);
    if (tileIndex < 0) {
      return -1;
    }

    const { tileX, tileZ } = this.allocator.tileIndexToCoords(tileIndex);

    // Set chunk world coordinates.
    // 设置 chunk 世界坐标
    this.chunkOffsetX.value = cx;
    this.chunkOffsetZ.value = cz;

    // Set tile coordinates from dynamic allocation.
    // 从动态分配设置 tile 坐标
    this.tileX.value = tileX;
    this.tileZ.value = tileZ;

    await renderer.computeAsync(this.computeNode!);

    // Explicit GPU sync: wait for all submitted work to complete.
    // 显式 GPU 同步：等待所有提交的工作完成
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backend = (renderer as any).backend;
    const device: GPUDevice = backend.device;
    await device.queue.onSubmittedWorkDone();

    return tileIndex;
  }

  /**
   * Get tile UV offset for a chunk.
   * 获取 chunk 的 tile UV 偏移
   */
  getChunkTileUV(cx: number, cz: number): { uOffset: number; vOffset: number; uvScale: number } {
    return this.allocator.getChunkTileUV(cx, cz);
  }

  /**
   * Get atlas resolution info for material setup.
   * 获取图集分辨率信息，用于材质设置
   */
  getAtlasInfo(): { resolution: number; tileResolution: number; tilesPerSide: number } {
    return this.allocator.getAtlasInfo();
  }

  /**
   * Read back height data for a chunk from GPU.
   * 从 GPU 回读 chunk 的高度数据
   */
  async readbackChunkHeight(cx: number, cz: number, renderer: WebGPURenderer): Promise<Float32Array> {
    if (!this.textureIO) {
      return new Float32Array(this.allocator.tileResolution * this.allocator.tileResolution);
    }
    return this.textureIO.readbackChunkHeight(cx, cz, renderer);
  }

  /**
   * Upload height data from CPU to GPU texture.
   * 从 CPU 上传高度数据到 GPU 纹理
   */
  async uploadChunkHeight(
    cx: number,
    cz: number,
    heightData: Float32Array,
    renderer: WebGPURenderer
  ): Promise<void> {
    if (!this.textureIO) {
      console.error(`[TerrainHeightCompute] textureIO not initialized`);
      return;
    }
    await this.textureIO.uploadChunkHeight(cx, cz, heightData, renderer);
  }

  dispose(): void {
    this.heightTexture = null;
    this.computeNode = null;
    this.textureIO = null;
  }
}
