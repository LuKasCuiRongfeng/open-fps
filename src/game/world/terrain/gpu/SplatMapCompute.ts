// SplatMapCompute: GPU compute shader for texture painting on splat map.
// SplatMapCompute：用于在 splat map 上绘制纹理的 GPU 计算着色器
//
// GPU-first design: All brush operations run on GPU compute shaders.
// GPU-first 设计：所有画刷操作都在 GPU 计算着色器上运行
//
// ARCHITECTURE:
// WebGPU storage textures are write-only in compute shaders. To read and write:
// - Use DataTexture (readable) as input for texture().load()
// - Use StorageTexture (writable) as output for textureStore()
// - After each brush pass, copy StorageTexture -> DataTexture via renderer.copyTextureToTexture()
// 架构：
// WebGPU 存储纹理在 compute shader 中只能写入。为了读写：
// - 使用 DataTexture（可读）作为 texture().load() 的输入
// - 使用 StorageTexture（可写）作为 textureStore() 的输出
// - 每次画刷操作后，通过 renderer.copyTextureToTexture() 复制 StorageTexture -> DataTexture
//
// MULTI-SPLAT-MAP SUPPORT:
// - Uses SplatMapSet to manage multiple splat maps for >4 texture layers
// - Each splat map handles 4 channels (RGBA) = 4 texture layers
// - Brush strokes are routed to the correct splat map based on target layer
// 多 SPLAT MAP 支持：
// - 使用 SplatMapSet 管理多个 splat map 以支持 >4 个纹理层
// - 每个 splat map 处理 4 个通道 (RGBA) = 4 个纹理层
// - 画刷笔画根据目标层路由到正确的 splat map

import {
  float,
  textureStore,
  texture,
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
  mix,
  select,
} from "three/tsl";
import {
  UnsignedByteType,
  RGBAFormat,
  NearestFilter,
  StorageTexture,
  DataTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { ComputeNode } from "three/webgpu";
import { WebGpuBackend } from "@game/core/gpu";
import { MAX_SPLAT_MAPS, LAYERS_PER_SPLAT_MAP } from "../../../editor/texture/TextureData";

/**
 * Brush stroke data for splat map painting.
 * Splat map 绘制的画刷笔画数据
 */
export interface SplatBrushStroke {
  worldX: number;
  worldZ: number;
  radius: number;
  strength: number;
  falloff: number;
  /** Global layer index (0-15 for 4 splat maps) / 全局层索引（4 个 splat map 时为 0-15） */
  targetLayer: number;
  dt: number;
}

/**
 * GPU compute pipeline for splat map texture painting.
 * Splat map 纹理绘制的 GPU 计算管线
 */
export class SplatMapCompute {
  private readonly resolution: number;
  private readonly worldSize: number;

  // Storage texture for writing (primary, used for rendering).
  // 用于写入的存储纹理（主，用于渲染）
  private splatTexture: StorageTexture | null = null;

  // Readable copy for compute shader input.
  // 用于 compute shader 输入的可读副本
  private splatTextureRead: DataTexture | null = null;

  // Brush uniforms.
  // 画刷 uniform
  private brushCenterX = uniform(0);
  private brushCenterZ = uniform(0);
  private brushRadius = uniform(10);
  private brushStrength = uniform(0.5);
  private brushFalloff = uniform(0.7);
  private brushDt = uniform(0.016);
  private targetLayer = uniform(0); // 0=R, 1=G, 2=B, 3=A

  // World offset.
  // 世界偏移
  private worldOffsetX = uniform(0);
  private worldOffsetZ = uniform(0);

  // Compute nodes.
  // 计算节点
  private brushComputeNode: ComputeNode | null = null;

  private initialized = false;

  // Flag to track if readable texture needs sync before first brush.
  // 跟踪是否需要在第一次画刷前同步可读纹理的标志
  private needsSync = true;

  // Flag to prevent concurrent brush operations.
  // 防止并发画刷操作的标志
  private brushOperationInProgress = false;

  /** Index of this splat map (0=first, has R=255 default; others have all zeros) */
  private splatMapIndex = 0;

  constructor(resolution: number = 1024, worldSize: number = 1024) {
    this.resolution = resolution;
    this.worldSize = worldSize;
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   *
   * @param splatMapIndex Index of this splat map (0 = first, others = secondary)
   */
  async init(renderer: WebGPURenderer, splatMapIndex: number = 0): Promise<void> {
    this.splatMapIndex = splatMapIndex;

    // Create primary storage texture (RGBA, 8-bit per channel).
    // 创建主存储纹理（RGBA，每通道 8 位）
    this.splatTexture = new StorageTexture(this.resolution, this.resolution);
    this.splatTexture.type = UnsignedByteType;
    this.splatTexture.format = RGBAFormat;
    this.splatTexture.magFilter = NearestFilter;
    this.splatTexture.minFilter = NearestFilter;

    // Create readable DataTexture copy.
    // 创建可读的 DataTexture 副本
    const data = new Uint8Array(this.resolution * this.resolution * 4);

    // Only the FIRST splat map (index 0) has R=255 (100% first texture).
    // Other splat maps default to all zeros (no contribution).
    // 只有第一个 splat map（索引 0）有 R=255（100% 第一个纹理）
    // 其他 splat map 默认全零（无贡献）
    if (splatMapIndex === 0) {
      for (let i = 0; i < this.resolution * this.resolution; i++) {
        data[i * 4] = 255;     // R = layer 0 (100%)
        data[i * 4 + 1] = 0;   // G = layer 1 (0%)
        data[i * 4 + 2] = 0;   // B = layer 2 (0%)
        data[i * 4 + 3] = 0;   // A = layer 3 (0%)
      }
    }
    // For splatMapIndex > 0, data is already all zeros (Uint8Array default)
    this.splatTextureRead = new DataTexture(
      data,
      this.resolution,
      this.resolution,
      RGBAFormat,
      UnsignedByteType
    );
    this.splatTextureRead.magFilter = NearestFilter;
    this.splatTextureRead.minFilter = NearestFilter;
    this.splatTextureRead.needsUpdate = true;

    // Initialize storage texture with default values.
    // 使用默认值初始化存储纹理
    await this.initializeStorageTexture(renderer);

    // Build compute shader.
    // 构建计算着色器
    this.buildBrushShader();

    this.initialized = true;
    this.needsSync = false; // Just initialized, already in sync
  }

  /**
   * Initialize storage texture with default values.
   * 使用默认值初始化存储纹理
   *
   * Uses WebGPU native API for reliable initialization.
   * 使用 WebGPU 原生 API 进行可靠的初始化
   */
  private async initializeStorageTexture(renderer: WebGPURenderer): Promise<void> {
    const res = this.resolution;
    const isFirstSplatMap = this.splatMapIndex === 0;

    // Create default pixel data.
    // Only the FIRST splat map has R=255 (100% first texture).
    // 创建默认像素数据
    // 只有第一个 splat map 有 R=255（100% 第一个纹理）
    const defaultPixels = new Uint8Array(res * res * 4);
    if (isFirstSplatMap) {
      for (let i = 0; i < res * res; i++) {
        defaultPixels[i * 4] = 255;     // R = layer 0 (100%)
        defaultPixels[i * 4 + 1] = 0;   // G
        defaultPixels[i * 4 + 2] = 0;   // B
        defaultPixels[i * 4 + 3] = 0;   // A
      }
    }
    // For secondary splat maps, defaultPixels is already all zeros

    // First, run a dummy compute to ensure the texture is created on GPU.
    // 首先运行一个虚拟计算以确保纹理在 GPU 上创建
    const dstTexture = this.splatTexture!;
    const defaultR = isFirstSplatMap ? 1.0 : 0.0;
    const initFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(res));
      const pixelY = instanceIndex.div(uint(res));
      const coord = uvec2(pixelX, pixelY);
      textureStore(dstTexture, coord, vec4(float(defaultR), 0.0, 0.0, 0.0)).toWriteOnly();
    });
    const initNode = initFn().compute(res * res);
    await renderer.computeAsync(initNode);

    // Now the texture should be registered with backend.
    // 现在纹理应该已注册到后端
    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.splatTexture!);
    if (backend && textureGPU) {
      // Write default data using WebGPU API for consistency.
      // 使用 WebGPU API 写入默认数据以保持一致性
      backend.device.queue.writeTexture(
        { texture: textureGPU },
        defaultPixels,
        { bytesPerRow: res * 4 },
        { width: res, height: res }
      );
    }

    // Sync to readable texture.
    // 同步到可读纹理
    renderer.copyTextureToTexture(this.splatTexture!, this.splatTextureRead!);
  }

  /**
   * Build brush compute shader.
   * 构建画刷计算着色器
   */
  private buildBrushShader(): void {
    const res = this.resolution;
    const worldSize = float(this.worldSize);
    const srcTexture = this.splatTextureRead!;
    const dstTexture = this.splatTexture!;

    const computeFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(res));
      const pixelY = instanceIndex.div(uint(res));

      // World coordinates.
      // 世界坐标
      const u = float(pixelX).div(float(res - 1));
      const v = float(pixelY).div(float(res - 1));
      const worldX = this.worldOffsetX.add(u.mul(worldSize));
      const worldZ = this.worldOffsetZ.add(v.mul(worldSize));

      // Distance from brush center.
      // 到画刷中心的距离
      const dx = worldX.sub(this.brushCenterX);
      const dz = worldZ.sub(this.brushCenterZ);
      const dist = dx.mul(dx).add(dz.mul(dz)).sqrt();

      // Brush falloff.
      // 画刷衰减
      const innerRadius = this.brushRadius.mul(float(1).sub(this.brushFalloff));
      const outerRadius = this.brushRadius;
      const t = dist.sub(innerRadius).div(outerRadius.sub(innerRadius)).clamp(0, 1);
      const falloffMask = float(1).sub(t.mul(t).mul(float(3).sub(t.mul(2))));

      const insideBrush = dist.lessThan(outerRadius);

      // Read current splat values from readable texture.
      // 从可读纹理读取当前 splat 值
      const readCoord = ivec2(int(pixelX), int(pixelY));
      const currentSplat = texture(srcTexture).load(readCoord);

      const r = currentSplat.r.toVar();
      const g = currentSplat.g.toVar();
      const b = currentSplat.b.toVar();
      const a = currentSplat.a.toVar();

      // Blend factor: how much to blend toward target (0-1 per frame).
      // 混合因子：每帧向目标混合多少（0-1）
      // High multiplier for responsive painting. At strength=1.0, center reaches 100% in ~0.5s.
      // 高乘数实现响应式绘制。强度=1.0时，中心在约0.5秒内达到100%
      // Use power of falloffMask to make center more dominant.
      // 使用 falloffMask 的幂次使中心更占主导
      const centerBoost = falloffMask.mul(falloffMask); // Square for sharper center
      const blendFactor = this.brushStrength.mul(this.brushDt).mul(25.0).mul(centerBoost).clamp(0, 1);

      If(insideBrush, () => {
        // Direct blend: lerp current channel toward 1.0, others toward 0.0
        // 直接混合：将当前通道 lerp 向 1.0，其他通道向 0.0
        // This gives smooth falloff at brush edges and full coverage at center.
        // 这在画刷边缘提供平滑过渡，在中心提供完全覆盖
        //
        // To ensure full replacement, use a threshold: if blendFactor > 0.99, snap to target.
        // 为确保完全替换，使用阈值：如果 blendFactor > 0.99，直接跳到目标值
        const snapToTarget = blendFactor.greaterThan(0.95);

        // Layer 0 = R channel.
        // 层 0 = R 通道
        If(this.targetLayer.equal(0), () => {
          r.assign(select(snapToTarget, float(1.0), mix(r, float(1.0), blendFactor)));
          g.assign(select(snapToTarget, float(0.0), mix(g, float(0.0), blendFactor)));
          b.assign(select(snapToTarget, float(0.0), mix(b, float(0.0), blendFactor)));
          a.assign(select(snapToTarget, float(0.0), mix(a, float(0.0), blendFactor)));
        });

        // Layer 1 = G channel.
        // 层 1 = G 通道
        If(this.targetLayer.equal(1), () => {
          r.assign(select(snapToTarget, float(0.0), mix(r, float(0.0), blendFactor)));
          g.assign(select(snapToTarget, float(1.0), mix(g, float(1.0), blendFactor)));
          b.assign(select(snapToTarget, float(0.0), mix(b, float(0.0), blendFactor)));
          a.assign(select(snapToTarget, float(0.0), mix(a, float(0.0), blendFactor)));
        });

        // Layer 2 = B channel.
        // 层 2 = B 通道
        If(this.targetLayer.equal(2), () => {
          r.assign(select(snapToTarget, float(0.0), mix(r, float(0.0), blendFactor)));
          g.assign(select(snapToTarget, float(0.0), mix(g, float(0.0), blendFactor)));
          b.assign(select(snapToTarget, float(1.0), mix(b, float(1.0), blendFactor)));
          a.assign(select(snapToTarget, float(0.0), mix(a, float(0.0), blendFactor)));
        });

        // Layer 3 = A channel.
        // 层 3 = A 通道
        If(this.targetLayer.equal(3), () => {
          r.assign(select(snapToTarget, float(0.0), mix(r, float(0.0), blendFactor)));
          g.assign(select(snapToTarget, float(0.0), mix(g, float(0.0), blendFactor)));
          b.assign(select(snapToTarget, float(0.0), mix(b, float(0.0), blendFactor)));
          a.assign(select(snapToTarget, float(1.0), mix(a, float(1.0), blendFactor)));
        });
      });

      // Normalize to ensure sum = 1.
      // 归一化确保总和 = 1
      const sum = r.add(g).add(b).add(a);
      If(sum.greaterThan(0.001), () => {
        r.divAssign(sum);
        g.divAssign(sum);
        b.divAssign(sum);
        a.divAssign(sum);
      });

      const writeCoord = uvec2(pixelX, pixelY);
      textureStore(dstTexture, writeCoord, vec4(r, g, b, a)).toWriteOnly();
    });

    this.brushComputeNode = computeFn().compute(res * res);
  }

  /**
   * Apply brush stroke to splat map.
   * 将画刷笔画应用到 splat map
   */
  async applyBrush(renderer: WebGPURenderer, stroke: SplatBrushStroke): Promise<void> {
    if (!this.initialized || !this.brushComputeNode) {
      console.warn("[SplatMapCompute] Not initialized");
      return;
    }

    // Prevent concurrent brush operations to avoid race conditions.
    // 防止并发画刷操作以避免竞态条件
    if (this.brushOperationInProgress) {
      return;
    }
    this.brushOperationInProgress = true;

    try {
      // Ensure readable texture is synced before brush operation.
      // 确保在画刷操作前同步可读纹理
      this.ensureSynced(renderer);

      // Update uniforms.
      // 更新 uniform
      this.brushCenterX.value = stroke.worldX;
      this.brushCenterZ.value = stroke.worldZ;
      this.brushRadius.value = stroke.radius;
      this.brushStrength.value = stroke.strength;
      this.brushFalloff.value = stroke.falloff;
      this.brushDt.value = stroke.dt;
      this.targetLayer.value = stroke.targetLayer;

      // Execute brush compute shader.
      // 执行画刷计算着色器
      await renderer.computeAsync(this.brushComputeNode);

      // Sync: copy storage texture to readable texture.
      // 同步：将存储纹理复制到可读纹理
      renderer.copyTextureToTexture(this.splatTexture!, this.splatTextureRead!);
    } finally {
      this.brushOperationInProgress = false;
    }
  }

  /**
   * Get the primary splat map texture for rendering.
   * 获取用于渲染的主 splat map 纹理
   *
   * Returns the readable DataTexture (not StorageTexture) for material sampling.
   * 返回可读的 DataTexture（而非 StorageTexture）用于材质采样
   */
  getSplatTexture(): DataTexture | null {
    // Return the readable texture for material sampling.
    // Materials use texture().sample() which works with DataTexture.
    // 返回可读纹理用于材质采样
    // 材质使用 texture().sample() 与 DataTexture 配合工作
    return this.splatTextureRead;
  }

  /**
   * Set world offset for splat map alignment.
   * 设置 splat map 对齐的世界偏移
   */
  setWorldOffset(offsetX: number, offsetZ: number): void {
    this.worldOffsetX.value = offsetX;
    this.worldOffsetZ.value = offsetZ;
  }

  /**
   * Get resolution of the splat map.
   * 获取 splat map 的分辨率
   */
  getResolution(): number {
    return this.resolution;
  }

  /**
   * Get world size covered by the splat map.
   * 获取 splat map 覆盖的世界大小
   */
  getWorldSize(): number {
    return this.worldSize;
  }

  /**
   * Load splat map data from CPU pixels (Uint8Array RGBA).
   * 从 CPU 像素（Uint8Array RGBA）加载 splat map 数据
   *
   * Uses WebGPU native API to directly write to StorageTexture,
   * bypassing DataTexture needsUpdate timing issues.
   * 使用 WebGPU 原生 API 直接写入 StorageTexture，绕过 DataTexture needsUpdate 时序问题
   */
  async loadFromPixels(renderer: WebGPURenderer, pixels: Uint8Array): Promise<void> {
    if (!this.splatTexture || !this.splatTextureRead) {
      console.warn("[SplatMapCompute] Not initialized");
      return;
    }

    const res = this.resolution;
    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.splatTexture);
    
    if (!backend || !textureGPU) {
      console.error("[SplatMapCompute] StorageTexture not registered with backend, falling back to DataTexture");
      // Fallback: update DataTexture directly.
      // 回退：直接更新 DataTexture
      const data = this.splatTextureRead.image.data as Uint8Array;
      const len = Math.min(pixels.length, data.length);
      for (let i = 0; i < len; i++) {
        data[i] = pixels[i];
      }
      this.splatTextureRead.needsUpdate = true;
      return;
    }

    // Ensure pixels is backed by a regular ArrayBuffer (not SharedArrayBuffer).
    // 确保 pixels 由普通 ArrayBuffer 支持（而非 SharedArrayBuffer）
    const pixelData = new Uint8Array(pixels.buffer instanceof ArrayBuffer ? pixels : new Uint8Array(pixels));

    // Directly write pixels to StorageTexture using WebGPU API.
    // 使用 WebGPU API 直接将像素写入 StorageTexture
    backend.device.queue.writeTexture(
      { texture: textureGPU },
      pixelData,
      { bytesPerRow: res * 4 },
      { width: res, height: res }
    );

    // Sync StorageTexture to DataTexture (for material sampling).
    // 同步 StorageTexture 到 DataTexture（用于材质采样）
    renderer.copyTextureToTexture(this.splatTexture, this.splatTextureRead);

    // Also update CPU-side data for consistency.
    // 同时更新 CPU 端数据以保持一致性
    const data = this.splatTextureRead.image.data as Uint8Array;
    const len = Math.min(pixels.length, data.length);
    for (let i = 0; i < len; i++) {
      data[i] = pixels[i];
    }
    // Mark texture as needing update to ensure CPU data is uploaded to GPU.
    // This is necessary because copyTextureToTexture may not fully sync in all cases.
    // 标记纹理需要更新以确保 CPU 数据上传到 GPU。
    // 这是必要的，因为 copyTextureToTexture 可能在某些情况下无法完全同步。
    this.splatTextureRead.needsUpdate = true;

    this.needsSync = false;
  }

  /**
   * Read splat map data to CPU (returns Uint8Array RGBA).
   * 读取 splat map 数据到 CPU（返回 Uint8Array RGBA）
   *
   * Uses a compute shader to copy texture data to a storage buffer,
   * then reads the buffer back to CPU.
   * 使用 compute shader 将纹理数据复制到存储缓冲区，然后回读到 CPU
   */
  async readToPixels(renderer: WebGPURenderer): Promise<Uint8Array> {
    if (!this.splatTexture || !this.splatTextureRead) {
      throw new Error("[SplatMapCompute] Not initialized");
    }

    const res = this.resolution;
    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.splatTexture);

    if (!backend || !textureGPU) {
      console.error("[SplatMapCompute] StorageTexture not registered with backend!");
      // Fallback to CPU-side data.
      // 回退到 CPU 端数据
      const cpuData = this.splatTextureRead.image.data as Uint8Array;
      return new Uint8Array(cpuData);
    }

    const device = backend.device;

    // Wait for any pending GPU work.
    // 等待任何待处理的 GPU 工作
    await device.queue.onSubmittedWorkDone();

    // Create a storage buffer to hold the pixel data.
    // 创建一个存储缓冲区来保存像素数据
    const bufferSize = res * res * 4; // RGBA8 = 4 bytes per pixel
    const storageBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create staging buffer for readback.
    // 创建用于回读的暂存缓冲区
    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Create a compute shader to copy texture to buffer.
    // 创建一个 compute shader 将纹理复制到缓冲区
    const shaderCode = `
      @group(0) @binding(0) var srcTexture: texture_2d<f32>;
      @group(0) @binding(1) var<storage, read_write> dstBuffer: array<u32>;

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let res = ${res}u;
        if (gid.x >= res || gid.y >= res) {
          return;
        }
        let pixel = textureLoad(srcTexture, vec2<i32>(i32(gid.x), i32(gid.y)), 0);
        let r = u32(clamp(pixel.r * 255.0, 0.0, 255.0));
        let g = u32(clamp(pixel.g * 255.0, 0.0, 255.0));
        let b = u32(clamp(pixel.b * 255.0, 0.0, 255.0));
        let a = u32(clamp(pixel.a * 255.0, 0.0, 255.0));
        let idx = gid.y * res + gid.x;
        dstBuffer[idx] = r | (g << 8u) | (b << 16u) | (a << 24u);
      }
    `;

    const shaderModule = device.createShaderModule({ code: shaderCode });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });


    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const computePipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    // Create texture view for the StorageTexture.
    // 为 StorageTexture 创建纹理视图
    const textureView = textureGPU.createView();

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: { buffer: storageBuffer } },
      ],
    });

    // Run the compute shader.
    // 运行 compute shader
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(res / 16), Math.ceil(res / 16));
    passEncoder.end();

    // Copy storage buffer to staging buffer.
    // 将存储缓冲区复制到暂存缓冲区
    commandEncoder.copyBufferToBuffer(storageBuffer, 0, stagingBuffer, 0, bufferSize);
    device.queue.submit([commandEncoder.finish()]);

    // Wait and read back.
    // 等待并回读
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedRange = stagingBuffer.getMappedRange();
    const rawData = new Uint32Array(mappedRange);

    // Convert to Uint8Array RGBA.
    // 转换为 Uint8Array RGBA
    const pixels = new Uint8Array(res * res * 4);
    for (let i = 0; i < res * res; i++) {
      const packed = rawData[i];
      pixels[i * 4] = packed & 0xFF;           // R
      pixels[i * 4 + 1] = (packed >> 8) & 0xFF;  // G
      pixels[i * 4 + 2] = (packed >> 16) & 0xFF; // B
      pixels[i * 4 + 3] = (packed >> 24) & 0xFF; // A
    }

    // Clean up.
    // 清理
    stagingBuffer.unmap();
    stagingBuffer.destroy();
    storageBuffer.destroy();

    return pixels;
  }

  /**
   * Sync readable texture from storage texture.
   * 从存储纹理同步可读纹理
   */
  syncReadableTexture(renderer: WebGPURenderer): void {
    if (this.splatTexture && this.splatTextureRead) {
      renderer.copyTextureToTexture(this.splatTexture, this.splatTextureRead);
    }
  }

  /**
   * Ensure readable texture is synced before brush operations.
   * 确保在画刷操作前同步可读纹理
   */
  ensureSynced(renderer: WebGPURenderer): void {
    if (this.needsSync && this.splatTexture && this.splatTextureRead) {
      renderer.copyTextureToTexture(this.splatTexture, this.splatTextureRead);
      this.needsSync = false;
    }
  }

  /**
   * Mark that readable texture needs sync.
   * 标记可读纹理需要同步
   */
  markNeedsSync(): void {
    this.needsSync = true;
  }

  dispose(): void {
    this.splatTexture?.dispose();
    this.splatTextureRead?.dispose();
    this.splatTexture = null;
    this.splatTextureRead = null;
    this.brushComputeNode = null;
    this.initialized = false;
  }
}

// ============================================================================
// SplatMapSet: Manages multiple splat maps for >4 texture layers
// SplatMapSet：管理多个 splat map 以支持 >4 个纹理层
// ============================================================================

/**
 * Manages multiple splat maps to support more than 4 texture layers.
 * 管理多个 splat map 以支持超过 4 个纹理层
 *
 * Each splat map supports 4 layers (RGBA channels).
 * Multiple splat maps enable 8, 12, 16+ texture layers.
 * 每个 splat map 支持 4 层（RGBA 通道）
 * 多个 splat map 可支持 8、12、16+ 纹理层
 */
export class SplatMapSet {
  private readonly splatMaps: SplatMapCompute[] = [];
  private readonly resolution: number;
  private readonly worldSize: number;
  private splatMapCount = 1;

  constructor(resolution: number = 1024, worldSize: number = 1024) {
    this.resolution = resolution;
    this.worldSize = worldSize;
  }

  /**
   * Initialize with specified number of splat maps.
   * 使用指定数量的 splat map 初始化
   *
   * @param count Number of splat maps (1-4, each supports 4 layers)
   */
  async init(renderer: WebGPURenderer, count: number = 1): Promise<void> {
    // Clamp to valid range.
    // 限制到有效范围
    this.splatMapCount = Math.max(1, Math.min(count, MAX_SPLAT_MAPS));

    // Dispose existing splat maps.
    // 释放现有 splat map
    this.dispose();

    // Create new splat maps.
    // 创建新的 splat map
    for (let i = 0; i < this.splatMapCount; i++) {
      const splatMap = new SplatMapCompute(this.resolution, this.worldSize);
      await splatMap.init(renderer, i); // Pass index for correct default values
      this.splatMaps.push(splatMap);
    }
  }

  /**
   * Resize to different number of splat maps.
   * 调整为不同数量的 splat map
   */
  async resize(renderer: WebGPURenderer, newCount: number): Promise<void> {
    const targetCount = Math.max(1, Math.min(newCount, MAX_SPLAT_MAPS));

    if (targetCount === this.splatMapCount) return;

    if (targetCount > this.splatMapCount) {
      // Add more splat maps.
      // 添加更多 splat map
      for (let i = this.splatMapCount; i < targetCount; i++) {
        const splatMap = new SplatMapCompute(this.resolution, this.worldSize);
        await splatMap.init(renderer, i); // Pass index for correct default values
        // Copy world offset from first splat map.
        // 从第一个 splat map 复制世界偏移
        if (this.splatMaps[0]) {
          splatMap.setWorldOffset(
            (this.splatMaps[0] as unknown as { worldOffsetX: { value: number } }).worldOffsetX?.value ?? 0,
            (this.splatMaps[0] as unknown as { worldOffsetZ: { value: number } }).worldOffsetZ?.value ?? 0,
          );
        }
        this.splatMaps.push(splatMap);
      }
    } else {
      // Remove excess splat maps.
      // 移除多余的 splat map
      while (this.splatMaps.length > targetCount) {
        const removed = this.splatMaps.pop();
        removed?.dispose();
      }
    }

    this.splatMapCount = targetCount;
  }

  /**
   * Apply brush stroke to the appropriate splat map.
   * 将画刷笔画应用到适当的 splat map
   *
   * Routes the stroke to the correct splat map based on target layer.
   * 根据目标层将笔画路由到正确的 splat map
   */
  async applyBrush(renderer: WebGPURenderer, stroke: SplatBrushStroke): Promise<void> {
    // Determine which splat map this layer belongs to.
    // 确定此层属于哪个 splat map
    const splatMapIndex = Math.floor(stroke.targetLayer / LAYERS_PER_SPLAT_MAP);
    const channel = stroke.targetLayer % LAYERS_PER_SPLAT_MAP;

    if (splatMapIndex >= this.splatMaps.length) {
      console.warn(`[SplatMapSet] Layer ${stroke.targetLayer} exceeds available splat maps`);
      return;
    }

    // Create internal stroke with channel instead of global layer.
    // 使用通道而非全局层创建内部笔画
    const internalStroke: SplatBrushStroke = {
      ...stroke,
      targetLayer: channel,
    };

    await this.splatMaps[splatMapIndex].applyBrush(renderer, internalStroke);
  }

  /**
   * Get splat map texture by index.
   * 通过索引获取 splat map 纹理
   */
  getSplatTexture(index: number = 0): DataTexture | null {
    return this.splatMaps[index]?.getSplatTexture() ?? null;
  }

  /**
   * Get all splat map textures.
   * 获取所有 splat map 纹理
   */
  getAllSplatTextures(): (DataTexture | null)[] {
    return this.splatMaps.map(sm => sm.getSplatTexture());
  }

  /**
   * Get number of splat maps.
   * 获取 splat map 数量
   */
  getCount(): number {
    return this.splatMapCount;
  }

  /**
   * Set world offset for all splat maps.
   * 设置所有 splat map 的世界偏移
   */
  setWorldOffset(offsetX: number, offsetZ: number): void {
    for (const splatMap of this.splatMaps) {
      splatMap.setWorldOffset(offsetX, offsetZ);
    }
  }

  /**
   * Get resolution of splat maps.
   * 获取 splat map 的分辨率
   */
  getResolution(): number {
    return this.resolution;
  }

  /**
   * Get world size covered by splat maps.
   * 获取 splat map 覆盖的世界大小
   */
  getWorldSize(): number {
    return this.worldSize;
  }

  /**
   * Load splat map data for a specific index.
   * 加载特定索引的 splat map 数据
   */
  async loadFromPixels(
    renderer: WebGPURenderer,
    pixels: Uint8Array,
    splatMapIndex: number = 0,
  ): Promise<void> {
    if (splatMapIndex >= this.splatMaps.length) {
      console.warn(`[SplatMapSet] Index ${splatMapIndex} out of range`);
      return;
    }
    await this.splatMaps[splatMapIndex].loadFromPixels(renderer, pixels);
  }

  /**
   * Read splat map data for a specific index.
   * 读取特定索引的 splat map 数据
   */
  async readToPixels(renderer: WebGPURenderer, splatMapIndex: number = 0): Promise<Uint8Array> {
    if (splatMapIndex >= this.splatMaps.length) {
      throw new Error(`[SplatMapSet] Index ${splatMapIndex} out of range`);
    }
    return this.splatMaps[splatMapIndex].readToPixels(renderer);
  }

  /**
   * Sync all readable textures.
   * 同步所有可读纹理
   */
  syncReadableTextures(renderer: WebGPURenderer): void {
    for (const splatMap of this.splatMaps) {
      splatMap.syncReadableTexture(renderer);
    }
  }

  /**
   * Dispose all splat maps.
   * 释放所有 splat map
   */
  dispose(): void {
    for (const splatMap of this.splatMaps) {
      splatMap.dispose();
    }
    this.splatMaps.length = 0;
  }
}
