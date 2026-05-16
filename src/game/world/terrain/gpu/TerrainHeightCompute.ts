// TerrainHeightCompute: GPU height atlas upload/readback pipeline.
// TerrainHeightCompute：GPU 高度图集上传/回读管线

import {
  FloatType,
  RedFormat,
  LinearFilter,
  StorageTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { TerrainConfig } from "../terrain";
import { TileAtlasAllocator, GpuTextureIO } from "@game/gpu";

/**
 * GPU height atlas pipeline for loaded map chunks.
 * 已加载地图 chunk 的 GPU 高度图集管线
 *
 * Stores a tiled heightmap texture where each tile represents a loaded map chunk.
 * 存储一个分块高度图纹理，每个 tile 代表一个已加载的地图 chunk。
 */
export class TerrainHeightCompute {
  // Tile atlas allocator (exposed for brush compute to use).
  // Tile 图集分配器（暴露给画刷计算使用）
  readonly allocator: TileAtlasAllocator;

  // GPU texture I/O handler.
  // GPU 纹理 I/O 处理器
  private textureIO: GpuTextureIO | null = null;

  // Height storage texture (R32F atlas).
  // 高度存储纹理（R32F 图集）
  heightTexture: StorageTexture | null = null;

  constructor(config: TerrainConfig) {
    this.allocator = new TileAtlasAllocator(
      config.gpuCompute.tileResolution,
      config.gpuCompute.atlasTilesPerSide
    );
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
    void renderer;
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

  /**
   * Batch upload multiple chunks efficiently.
   * 高效批量上传多个 chunk
   */
  async uploadChunksBatch(
    chunks: Array<{ cx: number; cz: number; heightData: Float32Array }>,
    renderer: WebGPURenderer
  ): Promise<void> {
    if (!this.textureIO) {
      console.error(`[TerrainHeightCompute] textureIO not initialized`);
      return;
    }
    await this.textureIO.uploadChunksBatch(chunks, renderer);
  }

  dispose(): void {
    this.heightTexture = null;
    this.textureIO = null;
  }
}
