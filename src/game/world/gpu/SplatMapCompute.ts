// SplatMapCompute: GPU compute shader for texture painting on splat map.
// SplatMapCompute：用于在 splat map 上绘制纹理的 GPU 计算着色器
//
// GPU-first design: All brush operations run on GPU compute shaders.
// GPU-first 设计：所有画刷操作都在 GPU 计算着色器上运行
//
// Uses ping-pong (double buffer) pattern for read-write on same data:
// - Read from source texture (textureLoad)
// - Write to destination texture (textureStore)
// - Copy result back to primary texture
// 使用乒乓（双缓冲）模式处理同一数据的读写：
// - 从源纹理读取 (textureLoad)
// - 写入目标纹理 (textureStore)
// - 将结果复制回主纹理

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
  UnsignedByteType,
  RGBAFormat,
  LinearFilter,
  StorageTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { ComputeNode } from "three/webgpu";

/**
 * Brush stroke data for splat map painting.
 * Splat map 绘制的画刷笔画数据
 */
export interface SplatBrushStroke {
  // World position of brush center.
  // 画刷中心的世界位置
  worldX: number;
  worldZ: number;
  // Brush parameters.
  // 画刷参数
  radius: number;
  strength: number;
  falloff: number;
  // Target texture layer (0-3 = R, G, B, A channels).
  // 目标纹理层（0-3 = R、G、B、A 通道）
  targetLayer: number;
  // Delta time for framerate-independent strength.
  // 用于帧率无关强度的时间增量
  dt: number;
}

/**
 * GPU compute pipeline for splat map texture painting.
 * Splat map 纹理绘制的 GPU 计算管线
 *
 * Uses ping-pong double buffering for read-write operations.
 * 使用乒乓双缓冲进行读写操作
 */
export class SplatMapCompute {
  // Resolution of the splat map texture.
  // Splat map 纹理的分辨率
  private readonly resolution: number;

  // World size covered by the splat map (meters).
  // Splat map 覆盖的世界大小（米）
  private readonly worldSize: number;

  // Ping-pong splat textures for double buffering.
  // 用于双缓冲的乒乓 splat 纹理
  // splatTextureA is the "primary" texture used for rendering.
  // splatTextureA 是用于渲染的"主"纹理
  private splatTextureA: StorageTexture | null = null;
  // splatTextureB is the secondary buffer for ping-pong.
  // splatTextureB 是乒乓的次要缓冲区
  private splatTextureB: StorageTexture | null = null;

  // Brush uniforms.
  // 画刷 uniform
  private brushCenterX = uniform(0);
  private brushCenterZ = uniform(0);
  private brushRadius = uniform(10);
  private brushStrength = uniform(0.5);
  private brushFalloff = uniform(0.7);
  private brushDt = uniform(0.016);
  // Target layer: 0=R, 1=G, 2=B, 3=A.
  // 目标层：0=R, 1=G, 2=B, 3=A
  private targetLayer = uniform(0);

  // World coordinate offset (for splat map world alignment).
  // 世界坐标偏移（用于 splat map 世界对齐）
  private worldOffsetX = uniform(0);
  private worldOffsetZ = uniform(0);

  // Compute nodes for brush application.
  // 画刷应用的计算节点
  // Read from A, write to B
  private computeNodeAtoB: ComputeNode | null = null;
  // Copy B back to A
  private copyNodeBtoA: ComputeNode | null = null;

  private initialized = false;

  /**
   * Create a new SplatMapCompute instance.
   * 创建新的 SplatMapCompute 实例
   *
   * @param resolution - Resolution of the splat map texture (power of 2 recommended).
   * @param worldSize - World size covered by the splat map in meters.
   */
  constructor(resolution: number = 1024, worldSize: number = 1024) {
    this.resolution = resolution;
    this.worldSize = worldSize;
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   */
  async init(renderer: WebGPURenderer): Promise<void> {
    // Create primary splat map texture (RGBA, 8-bit per channel).
    // 创建主 splat map 纹理（RGBA，每通道 8 位）
    this.splatTextureA = new StorageTexture(this.resolution, this.resolution);
    this.splatTextureA.type = UnsignedByteType;
    this.splatTextureA.format = RGBAFormat;
    this.splatTextureA.magFilter = LinearFilter;
    this.splatTextureA.minFilter = LinearFilter;

    // Create secondary buffer for ping-pong.
    // 为乒乓创建次要缓冲区
    this.splatTextureB = new StorageTexture(this.resolution, this.resolution);
    this.splatTextureB.type = UnsignedByteType;
    this.splatTextureB.format = RGBAFormat;
    this.splatTextureB.magFilter = LinearFilter;
    this.splatTextureB.minFilter = LinearFilter;

    // Fill with default values (255 in R channel = 100% first texture).
    // 填充默认值（R 通道 255 = 100% 第一个纹理）
    await this.initializeDefaultValues(renderer);

    // Build compute shaders.
    // 构建计算着色器
    this.buildComputeShaders();

    // Build copy shader for syncing back.
    // 构建用于同步回的复制着色器
    this.buildCopyShader();

    this.initialized = true;
    console.log(`[SplatMapCompute] Initialized ${this.resolution}x${this.resolution} splat map`);
  }

  /**
   * Initialize splat map with default values (100% first texture).
   * 使用默认值初始化 splat map（100% 第一个纹理）
   */
  private async initializeDefaultValues(renderer: WebGPURenderer): Promise<void> {
    const res = this.resolution;

    // Create initialization shader.
    // 创建初始化着色器
    const initFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(res));
      const pixelY = instanceIndex.div(uint(res));
      const coord = uvec2(pixelX, pixelY);

      // Default: 100% first texture (R=255, G=0, B=0, A=0).
      // 默认：100% 第一个纹理（R=255, G=0, B=0, A=0）
      textureStore(this.splatTextureA!, coord, vec4(1.0, 0.0, 0.0, 0.0));
    });

    const initNode = initFn().compute(res * res);
    await renderer.computeAsync(initNode);

    // Copy to secondary buffer.
    // 复制到次要缓冲区
    const copyFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(res));
      const pixelY = instanceIndex.div(uint(res));
      const readCoord = ivec2(int(pixelX), int(pixelY));
      const writeCoord = uvec2(pixelX, pixelY);
      const value = textureLoad(this.splatTextureA!, readCoord);
      textureStore(this.splatTextureB!, writeCoord, value);
    });

    const copyNode = copyFn().compute(res * res);
    await renderer.computeAsync(copyNode);
  }

  /**
   * Build compute shaders for brush operations.
   * 为画刷操作构建计算着色器
   */
  private buildComputeShaders(): void {
    // A -> B: read from A, write to B
    // A -> B: 从 A 读取，写入 B
    this.computeNodeAtoB = this.buildBrushShader(
      this.splatTextureA!,
      this.splatTextureB!,
    );
  }

  /**
   * Build a brush compute shader that reads from src and writes to dst.
   * 构建从 src 读取并写入 dst 的画刷计算着色器
   */
  private buildBrushShader(
    srcTexture: StorageTexture,
    dstTexture: StorageTexture,
  ): ComputeNode {
    const res = this.resolution;
    const worldSize = float(this.worldSize);

    const computeFn = Fn(() => {
      // Compute pixel coordinates from instance index.
      // 从实例索引计算像素坐标
      const pixelX = mod(instanceIndex, uint(res));
      const pixelY = instanceIndex.div(uint(res));

      // World coordinates of this pixel.
      // 此像素的世界坐标
      const u = float(pixelX).div(float(res - 1));
      const v = float(pixelY).div(float(res - 1));
      const worldX = this.worldOffsetX.add(u.mul(worldSize));
      const worldZ = this.worldOffsetZ.add(v.mul(worldSize));

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

      // Read current splat values from SOURCE texture.
      // 从源纹理读取当前 splat 值
      const readCoord = ivec2(int(pixelX), int(pixelY));
      const currentSplat = textureLoad(srcTexture, readCoord);

      // Extract channels as variables.
      // 将通道提取为变量
      const r = currentSplat.r.toVar();
      const g = currentSplat.g.toVar();
      const b = currentSplat.b.toVar();
      const a = currentSplat.a.toVar();

      // Calculate strength per frame (faster painting).
      // 计算每帧强度（更快的绘制）
      const effectStrength = this.brushStrength.mul(this.brushDt).mul(3.0).mul(falloffMask);

      // Apply brush effect only inside brush radius.
      // 仅在画刷半径内应用画刷效果
      If(insideBrush, () => {
        // Add to target channel, subtract from others (maintain sum = 1).
        // 添加到目标通道，从其他通道减去（保持总和 = 1）

        // Layer 0 = R channel.
        // 层 0 = R 通道
        If(this.targetLayer.equal(0), () => {
          const add = effectStrength.mul(float(1).sub(r));
          r.addAssign(add);
          // Redistribute from other channels proportionally.
          // 从其他通道按比例重新分配
          const otherSum = g.add(b).add(a);
          If(otherSum.greaterThan(0.001), () => {
            const scale = float(1).sub(r).div(otherSum).max(0);
            g.mulAssign(scale);
            b.mulAssign(scale);
            a.mulAssign(scale);
          });
        });

        // Layer 1 = G channel.
        // 层 1 = G 通道
        If(this.targetLayer.equal(1), () => {
          const add = effectStrength.mul(float(1).sub(g));
          g.addAssign(add);
          const otherSum = r.add(b).add(a);
          If(otherSum.greaterThan(0.001), () => {
            const scale = float(1).sub(g).div(otherSum).max(0);
            r.mulAssign(scale);
            b.mulAssign(scale);
            a.mulAssign(scale);
          });
        });

        // Layer 2 = B channel.
        // 层 2 = B 通道
        If(this.targetLayer.equal(2), () => {
          const add = effectStrength.mul(float(1).sub(b));
          b.addAssign(add);
          const otherSum = r.add(g).add(a);
          If(otherSum.greaterThan(0.001), () => {
            const scale = float(1).sub(b).div(otherSum).max(0);
            r.mulAssign(scale);
            g.mulAssign(scale);
            a.mulAssign(scale);
          });
        });

        // Layer 3 = A channel.
        // 层 3 = A 通道
        If(this.targetLayer.equal(3), () => {
          const add = effectStrength.mul(float(1).sub(a));
          a.addAssign(add);
          const otherSum = r.add(g).add(b);
          If(otherSum.greaterThan(0.001), () => {
            const scale = float(1).sub(a).div(otherSum).max(0);
            r.mulAssign(scale);
            g.mulAssign(scale);
            b.mulAssign(scale);
          });
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

      // Write result to DESTINATION texture.
      // 将结果写入目标纹理
      const writeCoord = uvec2(pixelX, pixelY);
      textureStore(dstTexture, writeCoord, vec4(r, g, b, a));
    });

    return computeFn().compute(res * res);
  }

  /**
   * Build copy shader for B -> A sync.
   * 构建 B -> A 同步的复制着色器
   */
  private buildCopyShader(): void {
    const res = this.resolution;

    const copyFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(res));
      const pixelY = instanceIndex.div(uint(res));
      const readCoord = ivec2(int(pixelX), int(pixelY));
      const writeCoord = uvec2(pixelX, pixelY);
      const value = textureLoad(this.splatTextureB!, readCoord);
      textureStore(this.splatTextureA!, writeCoord, value);
    });

    this.copyNodeBtoA = copyFn().compute(res * res);
  }

  /**
   * Apply brush stroke to splat map.
   * 将画刷笔画应用到 splat map
   */
  async applyBrush(renderer: WebGPURenderer, stroke: SplatBrushStroke): Promise<void> {
    if (!this.initialized || !this.computeNodeAtoB || !this.copyNodeBtoA) {
      console.warn("[SplatMapCompute] Not initialized");
      return;
    }

    // Update brush uniforms.
    // 更新画刷 uniform
    this.brushCenterX.value = stroke.worldX;
    this.brushCenterZ.value = stroke.worldZ;
    this.brushRadius.value = stroke.radius;
    this.brushStrength.value = stroke.strength;
    this.brushFalloff.value = stroke.falloff;
    this.brushDt.value = stroke.dt;
    this.targetLayer.value = stroke.targetLayer;

    // Execute A -> B brush shader.
    // 执行 A -> B 画刷着色器
    await renderer.computeAsync(this.computeNodeAtoB);

    // Copy B -> A.
    // 复制 B -> A
    await renderer.computeAsync(this.copyNodeBtoA);
  }

  /**
   * Get the primary splat map texture for rendering.
   * 获取用于渲染的主 splat map 纹理
   */
  getSplatTexture(): StorageTexture | null {
    return this.splatTextureA;
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
   */
  async loadFromPixels(_renderer: WebGPURenderer, _pixels: Uint8Array): Promise<void> {
    if (!this.splatTextureA || !this.splatTextureB) {
      console.warn("[SplatMapCompute] Not initialized");
      return;
    }

    // Create CPU upload texture.
    // 创建 CPU 上传纹理
    // For now, we'll use a compute shader to load pixel data.
    // 目前，我们使用计算着色器加载像素数据
    // This is a simplified approach - in production, use staging buffers.
    // 这是简化方法 - 在生产中，使用暂存缓冲区

    // TODO: Implement proper texture upload from CPU data.
    // TODO: 实现从 CPU 数据正确上传纹理
    console.log("[SplatMapCompute] loadFromPixels - TODO: implement texture upload");
  }

  /**
   * Read splat map data back to CPU (Uint8Array RGBA).
   * 将 splat map 数据读回 CPU（Uint8Array RGBA）
   */
  async readToPixels(_renderer: WebGPURenderer): Promise<Uint8Array> {
    if (!this.splatTextureA) {
      throw new Error("[SplatMapCompute] Not initialized");
    }

    // TODO: Implement proper texture readback to CPU.
    // TODO: 实现从纹理正确读回 CPU
    console.log("[SplatMapCompute] readToPixels - TODO: implement texture readback");

    // Return default data for now.
    // 暂时返回默认数据
    const pixels = new Uint8Array(this.resolution * this.resolution * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255; // R = 100% first texture
      pixels[i + 1] = 0; // G
      pixels[i + 2] = 0; // B
      pixels[i + 3] = 0; // A
    }
    return pixels;
  }

  /**
   * Dispose GPU resources.
   * 释放 GPU 资源
   */
  dispose(): void {
    this.splatTextureA?.dispose();
    this.splatTextureB?.dispose();
    this.splatTextureA = null;
    this.splatTextureB = null;
    this.computeNodeAtoB = null;
    this.copyNodeBtoA = null;
    this.initialized = false;
    console.log("[SplatMapCompute] Disposed");
  }
}
