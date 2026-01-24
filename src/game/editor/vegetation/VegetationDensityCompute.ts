// VegetationDensityCompute: GPU compute shader for vegetation density map painting.
// VegetationDensityCompute：用于植被密度贴图绘制的 GPU 计算着色器
//
// GPU-first design: All brush operations run on GPU compute shaders.
// GPU-first 设计：所有画刷操作都在 GPU 计算着色器上运行
//
// ARCHITECTURE:
// Similar to SplatMapCompute but for vegetation density:
// - Use DataTexture (readable) as input for texture().load()
// - Use StorageTexture (writable) as output for textureStore()
// - After each brush pass, copy StorageTexture -> DataTexture
// 架构：
// 与 SplatMapCompute 类似，但用于植被密度：
// - 使用 DataTexture（可读）作为 texture().load() 的输入
// - 使用 StorageTexture（可写）作为 textureStore() 的输出
// - 每次画刷操作后，复制 StorageTexture -> DataTexture

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
  max,
  min,
} from "three/tsl";
import {
  UnsignedByteType,
  RGBAFormat,
  NearestFilter,
  StorageTexture,
  DataTexture,
  type WebGPURenderer,
  type ComputeNode,
} from "three/webgpu";
import { WebGpuBackend } from "@game/world/gpu/WebGpuBackend";
import type { VegetationBrushStroke } from "./VegetationBrush";

/**
 * GPU compute pipeline for vegetation density map painting.
 * 植被密度贴图绘制的 GPU 计算管线
 */
export class VegetationDensityCompute {
  private readonly resolution: number;
  private readonly worldSize: number;

  // Storage texture for writing (primary).
  // 用于写入的存储纹理（主）
  private densityTexture: StorageTexture | null = null;

  // Readable copy for compute shader input.
  // 用于 compute shader 输入的可读副本
  private densityTextureRead: DataTexture | null = null;

  // Brush uniforms.
  // 画刷 uniform
  private brushCenterX = uniform(0);
  private brushCenterZ = uniform(0);
  private brushRadius = uniform(10);
  private brushStrength = uniform(0.5);
  private brushFalloff = uniform(0.7);
  private brushDt = uniform(0.016);
  private targetChannel = uniform(0); // 0=R, 1=G, 2=B, 3=A
  private brushMode = uniform(0); // 0=add, 1=remove, 2=erase

  // World offset.
  // 世界偏移
  private worldOffsetX = uniform(0);
  private worldOffsetZ = uniform(0);

  // Compute nodes.
  // 计算节点
  private brushComputeNode: ComputeNode | null = null;

  private initialized = false;
  private brushOperationInProgress = false;
  private cpuSyncNeeded = false;

  constructor(resolution: number = 1024, worldSize: number = 1024) {
    this.resolution = resolution;
    this.worldSize = worldSize;
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   */
  async init(renderer: WebGPURenderer): Promise<void> {
    // Create primary storage texture (RGBA, 8-bit per channel).
    // 创建主存储纹理（RGBA，每通道 8 位）
    this.densityTexture = new StorageTexture(this.resolution, this.resolution);
    this.densityTexture.type = UnsignedByteType;
    this.densityTexture.format = RGBAFormat;
    this.densityTexture.magFilter = NearestFilter;
    this.densityTexture.minFilter = NearestFilter;

    // Create readable DataTexture copy.
    // 创建可读的 DataTexture 副本
    const data = new Uint8Array(this.resolution * this.resolution * 4);
    // Default: all zeros (no vegetation).
    // 默认：全零（无植被）
    this.densityTextureRead = new DataTexture(
      data,
      this.resolution,
      this.resolution,
      RGBAFormat,
      UnsignedByteType
    );
    this.densityTextureRead.magFilter = NearestFilter;
    this.densityTextureRead.minFilter = NearestFilter;
    this.densityTextureRead.needsUpdate = true;

    // Initialize storage texture with default values.
    // 使用默认值初始化存储纹理
    await this.initializeStorageTexture(renderer);

    // Build compute shader.
    // 构建计算着色器
    this.buildBrushShader();

    this.initialized = true;
  }

  /**
   * Initialize storage texture with default values.
   * 使用默认值初始化存储纹理
   */
  private async initializeStorageTexture(renderer: WebGPURenderer): Promise<void> {
    const res = this.resolution;

    // Create default pixel data (all zeros = no vegetation).
    // 创建默认像素数据（全零 = 无植被）
    const defaultPixels = new Uint8Array(res * res * 4);

    // Run a dummy compute to ensure the texture is created on GPU.
    // 运行一个虚拟计算以确保纹理在 GPU 上创建
    const dstTexture = this.densityTexture!;
    const initFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(res));
      const pixelY = instanceIndex.div(uint(res));
      const coord = uvec2(pixelX, pixelY);
      textureStore(dstTexture, coord, vec4(0.0, 0.0, 0.0, 0.0)).toWriteOnly();
    });
    const initNode = initFn().compute(res * res);
    await renderer.computeAsync(initNode);

    // Now the texture should be registered with backend.
    // 现在纹理应该已注册到后端
    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.densityTexture!);
    if (backend && textureGPU) {
      backend.device.queue.writeTexture(
        { texture: textureGPU },
        defaultPixels,
        { bytesPerRow: res * 4 },
        { width: res, height: res }
      );
    }

    // Sync to readable texture.
    // 同步到可读纹理
    renderer.copyTextureToTexture(this.densityTexture!, this.densityTextureRead!);
  }

  /**
   * Build brush compute shader.
   * 构建画刷计算着色器
   */
  private buildBrushShader(): void {
    const res = this.resolution;
    const worldSize = float(this.worldSize);
    const srcTexture = this.densityTextureRead!;
    const dstTexture = this.densityTexture!;

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

      // Read current density values from readable texture.
      // 从可读纹理读取当前密度值
      const readCoord = ivec2(int(pixelX), int(pixelY));
      const currentDensity = texture(srcTexture).load(readCoord);

      const r = currentDensity.r.toVar();
      const g = currentDensity.g.toVar();
      const b = currentDensity.b.toVar();
      const a = currentDensity.a.toVar();

      // Blend factor based on strength and dt.
      // 基于强度和 dt 的混合因子
      const centerBoost = falloffMask.mul(falloffMask);
      const blendAmount = this.brushStrength.mul(this.brushDt).mul(15.0).mul(centerBoost).clamp(0, 1);

      If(insideBrush, () => {
        // Mode 0: Add density / 模式 0：添加密度
        If(this.brushMode.equal(0), () => {
          If(this.targetChannel.equal(0), () => {
            r.assign(min(r.add(blendAmount), float(1.0)));
          });
          If(this.targetChannel.equal(1), () => {
            g.assign(min(g.add(blendAmount), float(1.0)));
          });
          If(this.targetChannel.equal(2), () => {
            b.assign(min(b.add(blendAmount), float(1.0)));
          });
          If(this.targetChannel.equal(3), () => {
            a.assign(min(a.add(blendAmount), float(1.0)));
          });
        });

        // Mode 1: Remove density (subtract from selected channel only)
        // 模式 1：移除密度（仅从选中通道减去）
        If(this.brushMode.equal(1), () => {
          If(this.targetChannel.equal(0), () => {
            r.assign(max(r.sub(blendAmount), float(0.0)));
          });
          If(this.targetChannel.equal(1), () => {
            g.assign(max(g.sub(blendAmount), float(0.0)));
          });
          If(this.targetChannel.equal(2), () => {
            b.assign(max(b.sub(blendAmount), float(0.0)));
          });
          If(this.targetChannel.equal(3), () => {
            a.assign(max(a.sub(blendAmount), float(0.0)));
          });
        });

        // Mode 2: Erase all (subtract from all channels)
        // 模式 2：擦除全部（从所有通道减去）
        If(this.brushMode.equal(2), () => {
          r.assign(max(r.sub(blendAmount), float(0.0)));
          g.assign(max(g.sub(blendAmount), float(0.0)));
          b.assign(max(b.sub(blendAmount), float(0.0)));
          a.assign(max(a.sub(blendAmount), float(0.0)));
        });
      });

      const writeCoord = uvec2(pixelX, pixelY);
      textureStore(dstTexture, writeCoord, vec4(r, g, b, a)).toWriteOnly();
    });

    this.brushComputeNode = computeFn().compute(res * res);
  }

  /**
   * Apply brush stroke to density map.
   * 将画刷笔画应用到密度贴图
   */
  async applyBrush(renderer: WebGPURenderer, stroke: VegetationBrushStroke): Promise<void> {
    if (!this.initialized || !this.brushComputeNode) {
      console.warn("[VegetationDensityCompute] Not initialized");
      return;
    }

    if (this.brushOperationInProgress) {
      return;
    }
    this.brushOperationInProgress = true;

    try {

      // Update uniforms.
      // 更新 uniform
      this.brushCenterX.value = stroke.worldX;
      this.brushCenterZ.value = stroke.worldZ;
      this.brushRadius.value = stroke.radius;
      this.brushStrength.value = stroke.strength;
      this.brushFalloff.value = stroke.falloff;
      this.brushDt.value = stroke.dt;
      this.targetChannel.value = stroke.targetChannel;

      // Map brush mode to integer.
      // 将画刷模式映射为整数
      const modeMap = { add: 0, remove: 1, erase: 2 };
      this.brushMode.value = modeMap[stroke.mode];

      // Execute brush compute shader.
      // 执行画刷计算着色器
      await renderer.computeAsync(this.brushComputeNode);

      // Sync: copy storage texture to readable texture (GPU side).
      // 同步：将存储纹理复制到可读纹理（GPU 端）
      renderer.copyTextureToTexture(this.densityTexture!, this.densityTextureRead!);

      // Sync CPU-side data for VegetationSystem sampling.
      // 同步 CPU 端数据供 VegetationSystem 采样
      this.cpuSyncNeeded = true;
    } finally {
      this.brushOperationInProgress = false;
    }
  }

  /**
   * Sync GPU density data to CPU (call periodically, not every frame).
   * 将 GPU 密度数据同步到 CPU（定期调用，而非每帧）
   */
  async syncToCpu(renderer: WebGPURenderer): Promise<void> {
    if (!this.cpuSyncNeeded || !this.densityTextureRead) return;

    try {
      const pixels = await this.readToPixels(renderer);
      const data = this.densityTextureRead.image.data as Uint8Array;
      data.set(pixels);
      this.densityTextureRead.needsUpdate = true;
      this.cpuSyncNeeded = false;
    } catch (e) {
      console.error("[VegetationDensityCompute] Failed to sync CPU data:", e);
    }
  }

  /**
   * Check if CPU sync is needed.
   * 检查是否需要 CPU 同步
   */
  get needsCpuSync(): boolean {
    return this.cpuSyncNeeded;
  }

  /**
   * Get the density map texture for vegetation system.
   * 获取用于植被系统的密度贴图纹理
   */
  getDensityTexture(): DataTexture | null {
    return this.densityTextureRead;
  }

  /**
   * Set world offset for density map alignment.
   * 设置密度贴图对齐的世界偏移
   */
  setWorldOffset(offsetX: number, offsetZ: number): void {
    this.worldOffsetX.value = offsetX;
    this.worldOffsetZ.value = offsetZ;
  }

  /**
   * Get resolution of the density map.
   * 获取密度贴图的分辨率
   */
  getResolution(): number {
    return this.resolution;
  }

  /**
   * Get world size covered by the density map.
   * 获取密度贴图覆盖的世界大小
   */
  getWorldSize(): number {
    return this.worldSize;
  }

  /**
   * Load density map data from CPU pixels (Uint8Array RGBA).
   * Handles resolution mismatch by resizing if needed.
   * 从 CPU 像素（Uint8Array RGBA）加载密度贴图数据
   * 如果需要，通过调整大小来处理分辨率不匹配
   */
  async loadFromPixels(
    renderer: WebGPURenderer,
    pixels: Uint8Array,
    sourceResolution?: number
  ): Promise<void> {
    if (!this.densityTexture || !this.densityTextureRead) {
      console.warn("[VegetationDensityCompute] Not initialized");
      return;
    }

    const res = this.resolution;

    // Detect source resolution from pixel data if not provided.
    // 如果未提供，则从像素数据检测源分辨率
    const srcRes = sourceResolution ?? Math.sqrt(pixels.length / 4);
    if (!Number.isInteger(srcRes)) {
      console.error("[VegetationDensityCompute] Invalid pixel data size");
      return;
    }

    // Resize if resolutions don't match.
    // 如果分辨率不匹配则调整大小
    let pixelData: Uint8Array<ArrayBuffer>;
    if (srcRes !== res) {
      console.log(
        `[VegetationDensityCompute] Resizing density map from ${srcRes}x${srcRes} to ${res}x${res}`
      );
      pixelData = this.resizePixels(pixels, srcRes, res);
    } else {
      // Ensure we have a proper ArrayBuffer (not SharedArrayBuffer).
      // 确保我们有正确的 ArrayBuffer（不是 SharedArrayBuffer）
      const copy = new Uint8Array(pixels.length);
      copy.set(pixels);
      pixelData = copy;
    }

    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.densityTexture);

    if (!backend || !textureGPU) {
      console.error("[VegetationDensityCompute] StorageTexture not registered with backend");
      // Fallback: update DataTexture directly.
      // 回退：直接更新 DataTexture
      const data = this.densityTextureRead.image.data as Uint8Array;
      const len = Math.min(pixelData.length, data.length);
      for (let i = 0; i < len; i++) {
        data[i] = pixelData[i];
      }
      this.densityTextureRead.needsUpdate = true;
      return;
    }

    backend.device.queue.writeTexture(
      { texture: textureGPU },
      pixelData,
      { bytesPerRow: res * 4 },
      { width: res, height: res }
    );

    renderer.copyTextureToTexture(this.densityTexture, this.densityTextureRead);

    const data = this.densityTextureRead.image.data as Uint8Array;
    const len = Math.min(pixelData.length, data.length);
    for (let i = 0; i < len; i++) {
      data[i] = pixelData[i];
    }
    this.densityTextureRead.needsUpdate = true;
  }

  /**
   * Resize pixel data using bilinear interpolation.
   * 使用双线性插值调整像素数据大小
   */
  private resizePixels(src: Uint8Array, srcRes: number, dstRes: number): Uint8Array<ArrayBuffer> {
    const dst = new Uint8Array(dstRes * dstRes * 4);

    for (let dy = 0; dy < dstRes; dy++) {
      for (let dx = 0; dx < dstRes; dx++) {
        // Map destination pixel to source coordinates.
        // 将目标像素映射到源坐标
        const sx = (dx / (dstRes - 1)) * (srcRes - 1);
        const sy = (dy / (dstRes - 1)) * (srcRes - 1);

        // Bilinear interpolation.
        // 双线性插值
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, srcRes - 1);
        const y1 = Math.min(y0 + 1, srcRes - 1);

        const fx = sx - x0;
        const fy = sy - y0;

        const dstIdx = (dy * dstRes + dx) * 4;

        for (let c = 0; c < 4; c++) {
          const v00 = src[(y0 * srcRes + x0) * 4 + c];
          const v10 = src[(y0 * srcRes + x1) * 4 + c];
          const v01 = src[(y1 * srcRes + x0) * 4 + c];
          const v11 = src[(y1 * srcRes + x1) * 4 + c];

          const v = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
          dst[dstIdx + c] = Math.round(v);
        }
      }
    }

    return dst;
  }

  /**
   * Read density map data to CPU (returns Uint8Array RGBA).
   * 读取密度贴图数据到 CPU（返回 Uint8Array RGBA）
   */
  async readToPixels(renderer: WebGPURenderer): Promise<Uint8Array> {
    if (!this.densityTexture || !this.densityTextureRead) {
      throw new Error("[VegetationDensityCompute] Not initialized");
    }

    const res = this.resolution;
    const backend = WebGpuBackend.from(renderer);
    const textureGPU = backend?.getTextureGPU(this.densityTexture);

    if (!backend || !textureGPU) {
      // Fallback to CPU-side data.
      // 回退到 CPU 端数据
      const cpuData = this.densityTextureRead.image.data as Uint8Array;
      return new Uint8Array(cpuData);
    }

    const device = backend.device;
    await device.queue.onSubmittedWorkDone();

    // Create buffers for readback.
    // 创建用于回读的缓冲区
    const bufferSize = res * res * 4;
    const storageBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Create compute shader for texture to buffer copy.
    // 创建纹理到缓冲区复制的 compute shader
    const shaderCode = `
      @group(0) @binding(0) var srcTexture: texture_2d<f32>;
      @group(0) @binding(1) var<storage, read_write> dstBuffer: array<u32>;

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let res = ${res}u;
        if (gid.x >= res || gid.y >= res) { return; }
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
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });

    const pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      compute: { module: shaderModule, entryPoint: "main" },
    });

    // Create texture view for the readable texture.
    // 为可读纹理创建纹理视图
    const readTextureGPU = backend.getTextureGPU(this.densityTextureRead);
    if (!readTextureGPU) {
      throw new Error("[VegetationDensityCompute] DataTexture not on GPU");
    }

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: readTextureGPU.createView() },
        { binding: 1, resource: { buffer: storageBuffer } },
      ],
    });

    // Execute compute pass.
    // 执行计算通道
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(res / 16), Math.ceil(res / 16));
    pass.end();
    encoder.copyBufferToBuffer(storageBuffer, 0, stagingBuffer, 0, bufferSize);
    device.queue.submit([encoder.finish()]);

    // Map and read.
    // 映射并读取
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedRange = stagingBuffer.getMappedRange();
    const result = new Uint8Array(mappedRange.slice(0));
    stagingBuffer.unmap();

    // Cleanup.
    // 清理
    storageBuffer.destroy();
    stagingBuffer.destroy();

    return result;
  }

  /**
   * Dispose GPU resources.
   * 释放 GPU 资源
   */
  dispose(): void {
    this.densityTexture?.dispose();
    this.densityTextureRead?.dispose();
    this.densityTexture = null;
    this.densityTextureRead = null;
    this.brushComputeNode = null;
    this.initialized = false;
  }
}
