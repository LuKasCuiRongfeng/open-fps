// GpuTextureIO: GPU texture readback and upload utilities.
// GpuTextureIO：GPU 纹理回读和上传工具

import type { StorageTexture, WebGPURenderer } from "three/webgpu";
import type { TileAtlasAllocator } from "./TileAtlasAllocator";
import { WebGpuBackend } from "./WebGpuBackend";

/**
 * Utility class for GPU texture I/O operations (readback/upload).
 * GPU 纹理 I/O 操作（回读/上传）的工具类
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

  async readbackChunkHeight(
    cx: number,
    cz: number,
    renderer: WebGPURenderer
  ): Promise<Float32Array> {
    const tileRes = this.tileResolution;
    const tileIndex = this.allocator.getTileIndex(cx, cz);
    if (tileIndex === undefined) {
      console.error(`[GpuTextureIO] No tile allocated for chunk (${cx}, ${cz}) in readback`);
      return new Float32Array(tileRes * tileRes);
    }

    const { tileX, tileZ } = this.allocator.tileIndexToCoords(tileIndex);
    const offsetX = tileX * tileRes;
    const offsetY = tileZ * tileRes;

    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.heightTexture);

    if (!backend || !textureGPU) {
      console.error(`[GpuTextureIO] heightTexture not registered with backend!`);
      return new Float32Array(tileRes * tileRes);
    }

    const device = backend.device;
    const bytesPerPixel = 4;
    const bytesPerRow = Math.ceil((tileRes * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * tileRes;

    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

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

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedRange = stagingBuffer.getMappedRange();
    const rawData = new Float32Array(mappedRange);

    const heightData = new Float32Array(tileRes * tileRes);
    const floatsPerRow = bytesPerRow / 4;

    for (let row = 0; row < tileRes; row++) {
      for (let col = 0; col < tileRes; col++) {
        heightData[row * tileRes + col] = rawData[row * floatsPerRow + col];
      }
    }

    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return heightData;
  }

  async uploadChunkHeight(
    cx: number,
    cz: number,
    heightData: Float32Array,
    renderer: WebGPURenderer
  ): Promise<void> {
    const tileRes = this.tileResolution;

    if (heightData.length !== tileRes * tileRes) {
      console.error(
        `[GpuTextureIO] Invalid height data size: ${heightData.length}, expected ${tileRes * tileRes}`
      );
      return;
    }

    let tileIndex = this.allocator.getTileIndex(cx, cz);
    if (tileIndex === undefined) {
      tileIndex = this.allocator.allocate(cx, cz);
      if (tileIndex < 0) {
        console.error(`[GpuTextureIO] Failed to allocate tile for chunk (${cx}, ${cz})`);
        return;
      }
    }

    const { tileX, tileZ } = this.allocator.tileIndexToCoords(tileIndex);
    const offsetX = tileX * tileRes;
    const offsetY = tileZ * tileRes;

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

    const mappedRange = stagingBuffer.getMappedRange();
    new Float32Array(mappedRange).set(paddedData);
    stagingBuffer.unmap();

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

    await device.queue.onSubmittedWorkDone();
    stagingBuffer.destroy();
  }

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
    const stagingBuffers: GPUBuffer[] = [];
    const commandEncoder = device.createCommandEncoder();

    for (const { cx, cz, heightData } of chunks) {
      if (heightData.length !== expectedSize) {
        console.warn(`[GpuTextureIO] Invalid height data size for (${cx}, ${cz})`);
        continue;
      }

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

      const paddedData = new Float32Array(bufferSize / 4);
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
      stagingBuffers.push(stagingBuffer);

      new Float32Array(stagingBuffer.getMappedRange()).set(paddedData);
      stagingBuffer.unmap();

      commandEncoder.copyBufferToTexture(
        { buffer: stagingBuffer, bytesPerRow, rowsPerImage: tileRes },
        { texture: textureGPU, origin: { x: offsetX, y: offsetY, z: 0 } },
        { width: tileRes, height: tileRes, depthOrArrayLayers: 1 }
      );
    }

    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    for (const buf of stagingBuffers) {
      buf.destroy();
    }
  }
}