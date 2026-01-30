// GpuTextureIO: GPU texture readback and upload utilities.
// GpuTextureIO：GPU 纹理回读和上传工具

import type { StorageTexture, WebGPURenderer } from "three/webgpu";
import type { TileAtlasAllocator } from "./TileAtlasAllocator";
import { WebGpuBackend } from "./WebGpuBackend";

/**
 * Utility class for GPU texture I/O operations (readback/upload).
 * GPU 纹理 I/O 操作（回读/上传）的工具类
 *
 * Handles WebGPU staging buffer creation and row alignment.
 * 处理 WebGPU 暂存缓冲区创建和行对齐
 */
export class GpuTextureIO {
  private readonly tileResolution: number;
  private readonly allocator: TileAtlasAllocator;
  private readonly heightTexture: StorageTexture;

  constructor(
    tileResolution: number,
    allocator: TileAtlasAllocator,
    heightTexture: StorageTexture
  ) {
    this.tileResolution = tileResolution;
    this.allocator = allocator;
    this.heightTexture = heightTexture;
  }

  /**
   * Read back height data for a chunk from GPU.
   * 从 GPU 回读 chunk 的高度数据
   *
   * GPU-first design: height is computed ONLY on GPU, then read back ONCE.
   * GPU-first 设计：高度仅在 GPU 上计算，然后回读一次。
   *
   * @param cx Chunk X coordinate.
   * @param cz Chunk Z coordinate.
   * @param renderer WebGPU renderer.
   * @returns Float32Array of height values (tileResolution x tileResolution).
   */
  async readbackChunkHeight(
    cx: number,
    cz: number,
    renderer: WebGPURenderer
  ): Promise<Float32Array> {
    const tileRes = this.tileResolution;

    // Get tile coordinates from allocator.
    // 从分配器获取 tile 坐标
    const tileIndex = this.allocator.getTileIndex(cx, cz);
    if (tileIndex === undefined) {
      console.error(`[GpuTextureIO] No tile allocated for chunk (${cx}, ${cz}) in readback`);
      return new Float32Array(tileRes * tileRes);
    }

    const { tileX, tileZ } = this.allocator.tileIndexToCoords(tileIndex);

    // Calculate tile offset in atlas.
    // 计算 tile 在图集中的偏移
    const offsetX = tileX * tileRes;
    const offsetY = tileZ * tileRes;

    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.heightTexture);
    
    if (!backend || !textureGPU) {
      console.error(`[GpuTextureIO] heightTexture not registered with backend!`);
      return new Float32Array(tileRes * tileRes);
    }

    const device = backend.device;

    // Create staging buffer with correct alignment (256 bytes per row).
    // 创建具有正确对齐的暂存缓冲区（每行 256 字节）
    const bytesPerPixel = 4; // R32F = 4 bytes
    const bytesPerRow = Math.ceil((tileRes * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * tileRes;

    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Copy tile region from texture to staging buffer.
    // 将 tile 区域从纹理复制到暂存缓冲区
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      {
        texture: textureGPU,
        origin: { x: offsetX, y: offsetY, z: 0 },
      },
      {
        buffer: stagingBuffer,
        bytesPerRow,
        rowsPerImage: tileRes,
      },
      {
        width: tileRes,
        height: tileRes,
        depthOrArrayLayers: 1,
      }
    );
    device.queue.submit([commandEncoder.finish()]);

    // Wait for GPU to finish and map buffer.
    // 等待 GPU 完成并映射缓冲区
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedRange = stagingBuffer.getMappedRange();
    const rawData = new Float32Array(mappedRange);

    // Extract height data (handle row padding).
    // 提取高度数据（处理行填充）
    const heightData = new Float32Array(tileRes * tileRes);
    const floatsPerRow = bytesPerRow / 4;

    for (let row = 0; row < tileRes; row++) {
      for (let col = 0; col < tileRes; col++) {
        heightData[row * tileRes + col] = rawData[row * floatsPerRow + col];
      }
    }

    // Clean up.
    // 清理
    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return heightData;
  }

  /**
   * Upload height data from CPU to GPU texture.
   * 从 CPU 上传高度数据到 GPU 纹理
   *
   * Used when loading a saved map or after CPU-side brush edits.
   * 用于加载保存的地图或 CPU 侧画刷编辑后
   *
   * @param cx Chunk X coordinate.
   * @param cz Chunk Z coordinate.
   * @param heightData Height data to upload (tileResolution x tileResolution).
   * @param renderer WebGPU renderer.
   */
  async uploadChunkHeight(
    cx: number,
    cz: number,
    heightData: Float32Array,
    renderer: WebGPURenderer
  ): Promise<void> {
    const tileRes = this.tileResolution;

    // Validate data size.
    // 验证数据大小
    if (heightData.length !== tileRes * tileRes) {
      console.error(
        `[GpuTextureIO] Invalid height data size: ${heightData.length}, expected ${tileRes * tileRes}`
      );
      return;
    }

    // Get or allocate tile for this chunk.
    // 获取或分配此 chunk 的 tile
    let tileIndex = this.allocator.getTileIndex(cx, cz);
    if (tileIndex === undefined) {
      tileIndex = this.allocator.allocate(cx, cz);
      if (tileIndex < 0) {
        console.error(`[GpuTextureIO] Failed to allocate tile for chunk (${cx}, ${cz})`);
        return;
      }
    }

    const { tileX, tileZ } = this.allocator.tileIndexToCoords(tileIndex);

    // Calculate tile offset in atlas.
    // 计算 tile 在图集中的偏移
    const offsetX = tileX * tileRes;
    const offsetY = tileZ * tileRes;

    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.heightTexture);
    
    if (!backend || !textureGPU) {
      console.error(`[GpuTextureIO] heightTexture not registered with backend!`);
      return;
    }

    const device = backend.device;

    // Create staging buffer for upload (needs COPY_SRC).
    // 创建用于上传的暂存缓冲区（需要 COPY_SRC）
    const bytesPerPixel = 4; // R32F = 4 bytes
    const bytesPerRow = Math.ceil((tileRes * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * tileRes;

    // Prepare data with row padding.
    // 准备带行填充的数据
    const paddedData = new Float32Array(bufferSize / 4);
    const floatsPerRow = bytesPerRow / 4;
    for (let row = 0; row < tileRes; row++) {
      for (let col = 0; col < tileRes; col++) {
        paddedData[row * floatsPerRow + col] = heightData[row * tileRes + col];
      }
    }

    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
      mappedAtCreation: true,
    });

    // Write data to staging buffer.
    // 将数据写入暂存缓冲区
    const mappedRange = stagingBuffer.getMappedRange();
    new Float32Array(mappedRange).set(paddedData);
    stagingBuffer.unmap();

    // Copy from staging buffer to texture.
    // 从暂存缓冲区复制到纹理
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToTexture(
      {
        buffer: stagingBuffer,
        bytesPerRow,
        rowsPerImage: tileRes,
      },
      {
        texture: textureGPU,
        origin: { x: offsetX, y: offsetY, z: 0 },
      },
      {
        width: tileRes,
        height: tileRes,
        depthOrArrayLayers: 1,
      }
    );
    device.queue.submit([commandEncoder.finish()]);

    // Wait for GPU to finish.
    // 等待 GPU 完成
    await device.queue.onSubmittedWorkDone();

    // Clean up staging buffer.
    // 清理暂存缓冲区
    stagingBuffer.destroy();
  }

  /**
   * Batch upload multiple chunks without waiting between each one.
   * 批量上传多个 chunk，不在每个之间等待
   *
   * Much faster than calling uploadChunkHeight() in a loop.
   * 比循环调用 uploadChunkHeight() 快得多
   */
  async uploadChunksBatch(
    chunks: Array<{ cx: number; cz: number; heightData: Float32Array }>,
    renderer: WebGPURenderer
  ): Promise<void> {
    if (chunks.length === 0) return;

    const tileRes = this.tileResolution;
    const expectedSize = tileRes * tileRes;

    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.heightTexture);

    if (!backend || !textureGPU) {
      console.error(`[GpuTextureIO] heightTexture not registered with backend!`);
      return;
    }

    const device = backend.device;

    const bytesPerPixel = 4;
    const bytesPerRow = Math.ceil((tileRes * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * tileRes;
    const floatsPerRow = bytesPerRow / 4;

    // Track staging buffers for cleanup.
    // 跟踪暂存缓冲区以便清理
    const stagingBuffers: GPUBuffer[] = [];

    // Create a single command encoder for all uploads.
    // 为所有上传创建单个命令编码器
    const commandEncoder = device.createCommandEncoder();

    for (const { cx, cz, heightData } of chunks) {
      if (heightData.length !== expectedSize) {
        console.warn(`[GpuTextureIO] Invalid height data size for (${cx}, ${cz})`);
        continue;
      }

      // Get or allocate tile.
      // 获取或分配 tile
      let tileIndex = this.allocator.getTileIndex(cx, cz);
      if (tileIndex === undefined) {
        tileIndex = this.allocator.allocate(cx, cz);
        if (tileIndex < 0) {
          console.warn(`[GpuTextureIO] Failed to allocate tile for (${cx}, ${cz})`);
          continue;
        }
      }

      const { tileX, tileZ } = this.allocator.tileIndexToCoords(tileIndex);
      const offsetX = tileX * tileRes;
      const offsetY = tileZ * tileRes;

      // Prepare padded data.
      // 准备填充的数据
      const paddedData = new Float32Array(bufferSize / 4);
      for (let row = 0; row < tileRes; row++) {
        for (let col = 0; col < tileRes; col++) {
          paddedData[row * floatsPerRow + col] = heightData[row * tileRes + col];
        }
      }

      // Create staging buffer.
      // 创建暂存缓冲区
      const stagingBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
        mappedAtCreation: true,
      });
      stagingBuffers.push(stagingBuffer);

      new Float32Array(stagingBuffer.getMappedRange()).set(paddedData);
      stagingBuffer.unmap();

      // Add copy command (no submit yet).
      // 添加复制命令（暂不提交）
      commandEncoder.copyBufferToTexture(
        { buffer: stagingBuffer, bytesPerRow, rowsPerImage: tileRes },
        { texture: textureGPU, origin: { x: offsetX, y: offsetY, z: 0 } },
        { width: tileRes, height: tileRes, depthOrArrayLayers: 1 }
      );
    }

    // Submit all copies at once.
    // 一次性提交所有复制
    device.queue.submit([commandEncoder.finish()]);

    // Wait for GPU once.
    // 等待 GPU 一次
    await device.queue.onSubmittedWorkDone();

    // Clean up all staging buffers.
    // 清理所有暂存缓冲区
    for (const buf of stagingBuffers) {
      buf.destroy();
    }
  }
}
