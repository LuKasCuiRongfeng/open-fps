// TerrainHeightCompute: GPU compute shader for terrain height generation.
// TerrainHeightCompute：用于地形高度生成的 GPU 计算着色器

import {
  float,
  texture,
  textureStore,
  uvec2,
  vec2,
  vec4,
  instanceIndex,
  Fn,
  floor,
  fract,
  If,
  uniform,
  mix,
  uint,
  mod,
} from "three/tsl";
import {
  DataTexture,
  FloatType,
  RedFormat,
  NearestFilter,
  RepeatWrapping,
  StorageTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { ComputeNode } from "three/webgpu";
import type { TerrainConfig } from "../terrain";

/**
 * GPU compute pipeline for terrain height generation.
 * GPU 地形高度生成的计算管线
 *
 * Generates a tiled heightmap texture where each tile represents a chunk.
 * 生成一个分块高度图纹理，每个 tile 代表一个 chunk。
 */
export class TerrainHeightCompute {
  private readonly config: TerrainConfig;

  // Resolution per chunk tile (from config).
  // 每个 chunk tile 的分辨率（来自配置）
  private readonly tileResolution: number;

  // Atlas dimensions (number of tiles per side, from config).
  // 图集尺寸（每边的 tile 数，来自配置）
  private readonly atlasTilesPerSide: number;

  // Total atlas resolution.
  // 图集总分辨率
  private readonly atlasResolution: number;

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

  // Hash texture for deterministic noise.
  // 用于确定性噪声的哈希纹理
  private hashTexture: DataTexture | null = null;

  constructor(config: TerrainConfig) {
    this.config = config;
    this.tileResolution = config.gpuCompute.tileResolution;
    this.atlasTilesPerSide = config.gpuCompute.atlasTilesPerSide;
    this.atlasResolution = this.tileResolution * this.atlasTilesPerSide;
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   */
  async init(renderer: WebGPURenderer): Promise<void> {
    // Create hash texture for noise.
    // 创建用于噪声的哈希纹理
    this.createHashTexture();

    // Create height storage texture with R32F format for single-channel height.
    // 创建 R32F 格式的高度存储纹理，用于单通道高度
    this.heightTexture = new StorageTexture(this.atlasResolution, this.atlasResolution);
    this.heightTexture.type = FloatType;
    this.heightTexture.format = RedFormat;

    // Build compute shader.
    // 构建计算着色器
    this.buildComputeShader();

    // Wait for renderer to be ready.
    // 等待渲染器就绪
    await renderer.computeAsync(this.computeNode!);
  }

  private createHashTexture(): void {
    // 256x256 hash texture for noise sampling.
    // 256x256 哈希纹理用于噪声采样
    const size = 256;
    const data = new Float32Array(size * size);
    const seed = this.config.height.seed;

    for (let i = 0; i < size * size; i++) {
      // Simple hash function.
      // 简单哈希函数
      let n = (i * 374761393 + seed * 668265263) >>> 0;
      n = ((n ^ (n >> 13)) * 1274126177) >>> 0;
      n = (n ^ (n >> 16)) >>> 0;
      data[i] = n / 4294967296;
    }

    this.hashTexture = new DataTexture(data, size, size, RedFormat, FloatType);
    this.hashTexture.magFilter = NearestFilter;
    this.hashTexture.minFilter = NearestFilter;
    this.hashTexture.wrapS = RepeatWrapping;
    this.hashTexture.wrapT = RepeatWrapping;
    this.hashTexture.needsUpdate = true;
  }

  private buildComputeShader(): void {
    const cfg = this.config;
    const tileRes = this.tileResolution;
    const chunkSize = float(cfg.streaming.chunkSizeMeters);

    const hashTex = texture(this.hashTexture!);

    // Hash function using texture lookup.
    // 使用纹理查找的哈希函数
    const hash2i = Fn(([xi, zi, seedOffset]: [
      ReturnType<typeof float>,
      ReturnType<typeof float>,
      ReturnType<typeof float>
    ]) => {
      const u = fract(xi.mul(0.00390625).add(seedOffset.mul(0.1234)));
      const v = fract(zi.mul(0.00390625).add(seedOffset.mul(0.5678)));
      return hashTex.sample(vec2(u, v)).r;
    });

    // Value noise 2D.
    // 2D 值噪声
    const valueNoise2D = Fn(([x, z, seedOffset]: [
      ReturnType<typeof float>,
      ReturnType<typeof float>,
      ReturnType<typeof float>
    ]) => {
      const xi = floor(x);
      const zi = floor(z);
      const xf = fract(x);
      const zf = fract(z);

      // Smoothstep interpolation.
      // Smoothstep 插值
      const u = xf.mul(xf).mul(float(3).sub(xf.mul(2)));
      const v = zf.mul(zf).mul(float(3).sub(zf.mul(2)));

      const a = hash2i(xi, zi, seedOffset);
      const b = hash2i(xi.add(1), zi, seedOffset);
      const c = hash2i(xi, zi.add(1), seedOffset);
      const d = hash2i(xi.add(1), zi.add(1), seedOffset);

      const ab = mix(a, b, u);
      const cd = mix(c, d, u);
      return mix(ab, cd, v);
    });

    // fBm noise.
    // fBm 噪声
    const fbm2D = Fn(([wx, wz]: [
      ReturnType<typeof float>,
      ReturnType<typeof float>
    ]) => {
      const sum = float(0).toVar();
      const amp = float(1).toVar();
      const freq = float(cfg.height.frequencyPerMeter).toVar();
      const octaves = cfg.height.octaves;
      const lacunarity = float(cfg.height.lacunarity);
      const gain = float(cfg.height.gain);
      const seed = float(cfg.height.seed);

      // Unroll octaves loop.
      // 展开八度循环
      for (let i = 0; i < octaves; i++) {
        const n01 = valueNoise2D(wx.mul(freq), wz.mul(freq), seed.add(float(i * 1013)));
        const n = n01.mul(2).sub(1);
        sum.addAssign(n.mul(amp));
        freq.mulAssign(lacunarity);
        amp.mulAssign(gain);
      }

      return sum;
    });

    // Domain warp.
    // 域扭曲
    const warpedCoords = Fn(([wx, wz]: [
      ReturnType<typeof float>,
      ReturnType<typeof float>
    ]) => {
      const warpCfg = cfg.height.warp;
      const warpFreq = float(warpCfg.frequencyPerMeter);
      const warpAmp = float(warpCfg.amplitudeMeters);
      const seed = float(cfg.height.seed);

      If(float(warpCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        const wx2 = valueNoise2D(wx.mul(warpFreq), wz.mul(warpFreq), seed.add(9001));
        const wz2 = valueNoise2D(wx.mul(warpFreq), wz.mul(warpFreq), seed.add(9002));
        wx.addAssign(wx2.mul(2).sub(1).mul(warpAmp));
        wz.addAssign(wz2.mul(2).sub(1).mul(warpAmp));
      });

      return vec2(wx, wz);
    });

    // Main compute function.
    // 主计算函数
    const computeFn = Fn(() => {
      // Compute pixel coordinates from instance index.
      // 从实例索引计算像素坐标
      const pixelX = mod(instanceIndex, uint(tileRes));
      const pixelY = mod(instanceIndex.div(uint(tileRes)), uint(tileRes));

      // Use pre-computed tile coordinates from JavaScript (handles negative coords).
      // 使用 JavaScript 预计算的 tile 坐标（正确处理负数）
      const tileXCoord = uint(this.tileX);
      const tileZCoord = uint(this.tileZ);

      // World coordinates.
      // 世界坐标
      const localU = float(pixelX).div(float(tileRes - 1));
      const localV = float(pixelY).div(float(tileRes - 1));
      const worldX = float(this.chunkOffsetX).mul(chunkSize).add(localU.mul(chunkSize)).toVar();
      const worldZ = float(this.chunkOffsetZ).mul(chunkSize).add(localV.mul(chunkSize)).toVar();

      // Apply domain warp.
      // 应用域扭曲
      const warped = warpedCoords(worldX, worldZ);
      worldX.assign(warped.x);
      worldZ.assign(warped.y);

      // Compute height.
      // 计算高度
      const height = fbm2D(worldX, worldZ)
        .mul(float(cfg.height.amplitudeMeters))
        .add(float(cfg.height.baseHeightMeters));

      // Write to atlas (vec4 required for textureStore, only R channel used).
      // 写入图集（textureStore 需要 vec4，仅使用 R 通道）
      // IMPORTANT: .toWriteOnly() is required for compute shader texture writes!
      // 重要：compute shader 写入纹理必须调用 .toWriteOnly()！
      const atlasX = tileXCoord.mul(uint(tileRes)).add(pixelX);
      const atlasY = tileZCoord.mul(uint(tileRes)).add(pixelY);

      textureStore(this.heightTexture!, uvec2(atlasX, atlasY), vec4(height, float(0), float(0), float(1))).toWriteOnly();
    });

    this.computeNode = computeFn().compute(tileRes * tileRes);
  }

  /**
   * Bake height for a chunk into the atlas.
   * 将一个 chunk 的高度烘焙到图集中
   *
   * @param cx Chunk X coordinate.
   * @param cz Chunk Z coordinate.
   * @param renderer WebGPU renderer.
   */
  async bakeChunk(cx: number, cz: number, renderer: WebGPURenderer): Promise<void> {
    // Set chunk world coordinates.
    // 设置 chunk 世界坐标
    this.chunkOffsetX.value = cx;
    this.chunkOffsetZ.value = cz;

    // Pre-compute tile coordinates with proper negative number handling.
    // 预计算 tile 坐标，正确处理负数
    const atlasTiles = this.atlasTilesPerSide;
    this.tileX.value = ((cx % atlasTiles) + atlasTiles) % atlasTiles;
    this.tileZ.value = ((cz % atlasTiles) + atlasTiles) % atlasTiles;

    await renderer.computeAsync(this.computeNode!);

    // Explicit GPU sync: wait for all submitted work to complete.
    // 显式 GPU 同步：等待所有提交的工作完成
    // This ensures the compute shader has finished writing before we read back.
    // 这确保在回读之前计算着色器已完成写入
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backend = (renderer as any).backend;
    const device: GPUDevice = backend.device;
    await device.queue.onSubmittedWorkDone();
  }

  /**
   * Get tile UV offset for a chunk.
   * 获取 chunk 的 tile UV 偏移
   */
  getChunkTileUV(cx: number, cz: number): { uOffset: number; vOffset: number; uvScale: number } {
    const tileX = ((cx % this.atlasTilesPerSide) + this.atlasTilesPerSide) % this.atlasTilesPerSide;
    const tileZ = ((cz % this.atlasTilesPerSide) + this.atlasTilesPerSide) % this.atlasTilesPerSide;

    return {
      uOffset: tileX / this.atlasTilesPerSide,
      vOffset: tileZ / this.atlasTilesPerSide,
      uvScale: 1 / this.atlasTilesPerSide,
    };
  }

  /**
   * Get atlas resolution info for material setup.
   * 获取图集分辨率信息，用于材质设置
   */
  getAtlasInfo(): { resolution: number; tileResolution: number; tilesPerSide: number } {
    return {
      resolution: this.atlasResolution,
      tileResolution: this.tileResolution,
      tilesPerSide: this.atlasTilesPerSide,
    };
  }

  /**
   * Read back height data for a chunk from GPU.
   * 从 GPU 回读 chunk 的高度数据
   *
   * GPU-first design: height is computed ONLY on GPU, then read back ONCE.
   * GPU-first 设计：高度仅在 GPU 上计算，然后回读一次。
   *
   * Uses Three.js internal API for reliable texture readback.
   * 使用 Three.js 内部 API 进行可靠的纹理回读。
   *
   * @param cx Chunk X coordinate.
   * @param cz Chunk Z coordinate.
   * @param renderer WebGPU renderer.
   * @returns Float32Array of height values (tileResolution x tileResolution).
   */
  async readbackChunkHeight(cx: number, cz: number, renderer: WebGPURenderer): Promise<Float32Array> {
    const tileRes = this.tileResolution;
    const tileX = ((cx % this.atlasTilesPerSide) + this.atlasTilesPerSide) % this.atlasTilesPerSide;
    const tileZ = ((cz % this.atlasTilesPerSide) + this.atlasTilesPerSide) % this.atlasTilesPerSide;

    // Calculate tile offset in atlas.
    // 计算 tile 在图集中的偏移
    const offsetX = tileX * tileRes;
    const offsetY = tileZ * tileRes;

    // Access Three.js backend internals.
    // 访问 Three.js backend 内部
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backend = (renderer as any).backend;

    // Get texture data from backend.
    // 从 backend 获取纹理数据
    const textureData = backend.get(this.heightTexture!);
    if (!textureData || !textureData.texture) {
      console.error(`[TerrainHeightCompute] heightTexture not registered with backend!`);
      return new Float32Array(tileRes * tileRes);
    }

    const textureGPU: GPUTexture = textureData.texture;
    const device: GPUDevice = backend.device;

    // Create staging buffer with correct alignment (256 bytes per row).
    // 创建具有正确对齐的暂存缓冲区（每行 256 字节）
    const bytesPerPixel = 4; // R32F = 4 bytes
    const bytesPerRow = Math.ceil(tileRes * bytesPerPixel / 256) * 256;
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
      },
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

  dispose(): void {
    if (this.hashTexture) {
      this.hashTexture.dispose();
      this.hashTexture = null;
    }
    this.heightTexture = null;
    this.computeNode = null;
  }
}
