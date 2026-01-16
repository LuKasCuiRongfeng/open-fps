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
  LinearFilter,
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
 * Uses dynamic tile allocation to support infinite terrain streaming.
 * 使用动态 tile 分配以支持无限地形流式加载
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

  // Dynamic tile allocation tracking.
  // 动态 tile 分配跟踪
  // Maps "cx,cz" -> tile index (0 to atlasTilesPerSide² - 1).
  // 映射 "cx,cz" -> tile 索引（0 到 atlasTilesPerSide² - 1）
  private readonly chunkToTile = new Map<string, number>();
  
  // Free tile indices (stack for O(1) alloc/free).
  // 空闲 tile 索引（栈结构，O(1) 分配/释放）
  private readonly freeTiles: number[] = [];

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

    // Initialize free tile list with all tiles.
    // 初始化空闲 tile 列表，包含所有 tile
    const totalTiles = this.atlasTilesPerSide * this.atlasTilesPerSide;
    for (let i = totalTiles - 1; i >= 0; i--) {
      this.freeTiles.push(i);
    }
  }

  /**
   * Allocate a tile for a chunk. Returns tile index or -1 if no free tiles.
   * 为 chunk 分配一个 tile。返回 tile 索引，如果没有空闲 tile 则返回 -1
   */
  allocateTile(cx: number, cz: number): number {
    const key = `${cx},${cz}`;
    
    // Check if already allocated.
    // 检查是否已分配
    const existing = this.chunkToTile.get(key);
    if (existing !== undefined) {
      return existing;
    }

    // Allocate new tile from free list.
    // 从空闲列表分配新 tile
    if (this.freeTiles.length === 0) {
      console.error(`[TerrainHeightCompute] No free tiles available!`);
      return -1;
    }

    const tileIndex = this.freeTiles.pop()!;
    this.chunkToTile.set(key, tileIndex);
    return tileIndex;
  }

  /**
   * Free a tile when chunk is unloaded.
   * chunk 卸载时释放 tile
   */
  freeTile(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    const tileIndex = this.chunkToTile.get(key);
    if (tileIndex !== undefined) {
      this.chunkToTile.delete(key);
      this.freeTiles.push(tileIndex);
    }
  }

  /**
   * Convert tile index to (tileX, tileZ) coordinates.
   * 将 tile 索引转换为 (tileX, tileZ) 坐标
   */
  private tileIndexToCoords(tileIndex: number): { tileX: number; tileZ: number } {
    const tileX = tileIndex % this.atlasTilesPerSide;
    const tileZ = Math.floor(tileIndex / this.atlasTilesPerSide);
    return { tileX, tileZ };
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
    // Use LINEAR filter for smooth interpolation between samples.
    // Edge alignment ensures adjacent chunks share exact boundary values.
    // 使用 LINEAR 过滤器在采样点之间平滑插值
    // 边缘对齐确保相邻 chunk 共享精确的边界值
    this.heightTexture.magFilter = LinearFilter;
    this.heightTexture.minFilter = LinearFilter;

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

      // Quintic smoothstep interpolation for smoother results.
      // 五次平滑插值，效果更平滑
      const u = xf.mul(xf).mul(xf).mul(xf.mul(xf.mul(6).sub(15)).add(10));
      const v = zf.mul(zf).mul(zf).mul(zf.mul(zf.mul(6).sub(15)).add(10));

      const a = hash2i(xi, zi, seedOffset);
      const b = hash2i(xi.add(1), zi, seedOffset);
      const c = hash2i(xi, zi.add(1), seedOffset);
      const d = hash2i(xi.add(1), zi.add(1), seedOffset);

      const ab = mix(a, b, u);
      const cd = mix(c, d, u);
      return mix(ab, cd, v);
    });

    // Main compute function with all noise inlined.
    // 主计算函数，所有噪声内联
    const computeFn = Fn(() => {
      // Compute pixel coordinates from instance index.
      // 从实例索引计算像素坐标
      const pixelX = mod(instanceIndex, uint(tileRes));
      const pixelY = mod(instanceIndex.div(uint(tileRes)), uint(tileRes));

      // Use pre-computed tile coordinates from JavaScript.
      // 使用 JavaScript 预计算的 tile 坐标
      const tileXCoord = uint(this.tileX);
      const tileZCoord = uint(this.tileZ);

      // World coordinates.
      // 世界坐标
      const localU = float(pixelX).div(float(tileRes - 1));
      const localV = float(pixelY).div(float(tileRes - 1));
      const worldX = float(this.chunkOffsetX).mul(chunkSize).add(localU.mul(chunkSize)).toVar();
      const worldZ = float(this.chunkOffsetZ).mul(chunkSize).add(localV.mul(chunkSize)).toVar();

      const seed = float(cfg.height.seed);

      // ============== Domain warp (inline) ==============
      // ============== 域扭曲（内联） ==============
      const warpCfg = cfg.height.warp;
      If(float(warpCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        const warpFreq = float(warpCfg.frequencyPerMeter);
        const warpAmp = float(warpCfg.amplitudeMeters);

        // Simple warp using value noise.
        // 使用值噪声的简单扭曲
        const wn1 = valueNoise2D(worldX.mul(warpFreq), worldZ.mul(warpFreq), seed.add(9001));
        const wn2 = valueNoise2D(worldX.mul(warpFreq), worldZ.mul(warpFreq), seed.add(9002));
        worldX.addAssign(wn1.mul(2).sub(1).mul(warpAmp));
        worldZ.addAssign(wn2.mul(2).sub(1).mul(warpAmp));
      });

      const height = float(cfg.height.baseHeightMeters).toVar();

      // ============== Continental layer (fBm with power curve) ==============
      // ============== 大陆层（fBm 带幂曲线） ==============
      // Power curve creates natural distribution: most areas low, few areas high.
      // 幂曲线创建自然分布：大部分区域低，少部分区域高
      const contCfg = cfg.height.continental;
      const contPower = contCfg.powerCurve ?? 1.0;
      If(float(contCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        const contSum = float(0).toVar();
        const contAmp = float(1).toVar();
        const contFreq = float(contCfg.frequencyPerMeter).toVar();
        const contMaxAmp = float(0).toVar();

        // Standard fBm.
        // 标准 fBm
        for (let i = 0; i < contCfg.octaves; i++) {
          const n01 = valueNoise2D(worldX.mul(contFreq), worldZ.mul(contFreq), seed.add(1000 + i * 1013));
          contSum.addAssign(n01.mul(contAmp));
          contMaxAmp.addAssign(contAmp);
          contFreq.mulAssign(float(contCfg.lacunarity));
          contAmp.mulAssign(float(contCfg.gain));
        }

        // Normalize to 0..1, apply power curve, then scale.
        // 归一化到 0..1，应用幂曲线，然后缩放
        const normalized = contSum.div(contMaxAmp);
        const curved = normalized.pow(float(contPower));
        height.addAssign(curved.mul(float(contCfg.amplitudeMeters)));
      });

      // ============== Mountain layer (fBm with power curve) ==============
      // ============== 山地层（fBm 带幂曲线） ==============
      // Strong power curve means only select areas get mountains.
      // 强幂曲线意味着只有选定区域有山
      const mtnCfg = cfg.height.mountain;
      const mtnPower = mtnCfg.powerCurve ?? 1.0;
      If(float(mtnCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        const mtnSum = float(0).toVar();
        const mtnAmp = float(1).toVar();
        const mtnFreq = float(mtnCfg.frequencyPerMeter).toVar();
        const mtnMaxAmp = float(0).toVar();

        for (let i = 0; i < mtnCfg.octaves; i++) {
          const n01 = valueNoise2D(worldX.mul(mtnFreq), worldZ.mul(mtnFreq), seed.add(2000 + i * 1013));
          mtnSum.addAssign(n01.mul(mtnAmp));
          mtnMaxAmp.addAssign(mtnAmp);
          mtnFreq.mulAssign(float(mtnCfg.lacunarity));
          mtnAmp.mulAssign(float(mtnCfg.gain));
        }

        // Normalize to 0..1, apply power curve, then scale.
        // 归一化到 0..1，应用幂曲线，然后缩放
        const normalized = mtnSum.div(mtnMaxAmp);
        const curved = normalized.pow(float(mtnPower));
        height.addAssign(curved.mul(float(mtnCfg.amplitudeMeters)));
      });

      // ============== Hills layer (fBm with power curve) ==============
      // ============== 丘陵层（fBm 带幂曲线） ==============
      const hillCfg = cfg.height.hills;
      const hillPower = hillCfg.powerCurve ?? 1.0;
      If(float(hillCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        const hillSum = float(0).toVar();
        const hillAmp = float(1).toVar();
        const hillFreq = float(hillCfg.frequencyPerMeter).toVar();
        const hillMaxAmp = float(0).toVar();

        for (let i = 0; i < hillCfg.octaves; i++) {
          const n01 = valueNoise2D(worldX.mul(hillFreq), worldZ.mul(hillFreq), seed.add(3000 + i * 1013));
          hillSum.addAssign(n01.mul(hillAmp));
          hillMaxAmp.addAssign(hillAmp);
          hillFreq.mulAssign(float(hillCfg.lacunarity));
          hillAmp.mulAssign(float(hillCfg.gain));
        }

        // Apply power curve for natural hill distribution.
        // 应用幂曲线以获得自然的丘陵分布
        const normalized = hillSum.div(hillMaxAmp);
        const curved = normalized.pow(float(hillPower));
        height.addAssign(curved.mul(float(hillCfg.amplitudeMeters)));
      });

      // ============== Detail layer (fBm - symmetric) ==============
      // ============== 细节层（fBm - 对称） ==============
      // Detail uses signed noise for bumps and dips.
      // 细节使用有符号噪声产生凸起和凹陷
      const detCfg = cfg.height.detail;
      If(float(detCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        const detSum = float(0).toVar();
        const detAmp = float(1).toVar();
        const detFreq = float(detCfg.frequencyPerMeter).toVar();
        const detMaxAmp = float(0).toVar();

        for (let i = 0; i < detCfg.octaves; i++) {
          const n01 = valueNoise2D(worldX.mul(detFreq), worldZ.mul(detFreq), seed.add(4000 + i * 1013));
          // Convert to signed noise -1..1 for symmetric detail.
          // 转换为有符号噪声 -1..1 以获得对称细节
          const n = n01.mul(2).sub(1);
          detSum.addAssign(n.mul(detAmp));
          detMaxAmp.addAssign(detAmp);
          detFreq.mulAssign(float(detCfg.lacunarity));
          detAmp.mulAssign(float(detCfg.gain));
        }

        height.addAssign(detSum.div(detMaxAmp).mul(float(detCfg.amplitudeMeters)));
      });

      // ============== Plains flattening ==============
      // ============== 平原压平 ==============
      const plainsCfg = cfg.height.plains;
      If(float(plainsCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        const threshold = float(plainsCfg.thresholdMeters);
        const transition = float(plainsCfg.transitionMeters);
        const strength = float(plainsCfg.strength);

        // Smoothstep: (height - (threshold-transition)) / (2*transition), clamped 0..1
        const t = height.sub(threshold.sub(transition)).div(transition.mul(2)).clamp(0, 1);
        const smoothT = t.mul(t).mul(float(3).sub(t.mul(2)));
        const flattenFactor = float(1).sub(smoothT).mul(strength);

        const targetHeight = float(cfg.height.baseHeightMeters);
        height.assign(mix(height, targetHeight, flattenFactor));
      });

      // ============== Valley carving ==============
      // ============== 山谷雕刻 ==============
      const valCfg = cfg.height.valleys;
      If(float(valCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        // Valley noise using fBm.
        // 使用 fBm 的山谷噪声
        const valSum = float(0).toVar();
        const valAmp = float(1).toVar();
        const valFreq = float(valCfg.frequencyPerMeter).toVar();
        const valMaxAmp = float(0).toVar();

        for (let i = 0; i < valCfg.octaves; i++) {
          const n01 = valueNoise2D(worldX.mul(valFreq), worldZ.mul(valFreq), seed.add(5000 + i * 1013));
          const n = n01.mul(2).sub(1);
          valSum.addAssign(n.mul(valAmp));
          valMaxAmp.addAssign(valAmp);
          valFreq.mulAssign(float(2.0));
          valAmp.mulAssign(float(0.5));
        }

        const valleyNoise = valSum.div(valMaxAmp);

        // Valley shape: valleys where noise is near 0.
        // 山谷形状：噪声接近 0 的地方
        const valleyShape = float(1).sub(valleyNoise.abs().mul(2).clamp(0, 1));
        const valleyDepth = valleyShape.mul(valleyShape).mul(float(valCfg.amplitudeMeters));

        // Fade out valleys at high elevations.
        // 高海拔淡出山谷
        const fadeT = height.sub(float(valCfg.heightFadeStartMeters))
          .div(float(valCfg.heightFadeEndMeters - valCfg.heightFadeStartMeters)).clamp(0, 1);
        const heightFade = float(1).sub(fadeT);

        height.subAssign(valleyDepth.mul(heightFade));
      });

      // ============== Erosion detail ==============
      // ============== 侵蚀细节 ==============
      const erosionCfg = cfg.height.erosion;
      If(float(erosionCfg.enabled ? 1 : 0).greaterThan(0.5), () => {
        // Simple 2-octave fBm for erosion detail.
        // 简单的 2 八度 fBm 用于侵蚀细节
        const eroSum = float(0).toVar();
        const eroAmp = float(1).toVar();
        const eroFreq = float(erosionCfg.detailFrequency).toVar();
        const eroMaxAmp = float(0).toVar();

        for (let i = 0; i < 2; i++) {
          const n01 = valueNoise2D(worldX.mul(eroFreq), worldZ.mul(eroFreq), seed.add(6000 + i * 1013));
          const n = n01.mul(2).sub(1);
          eroSum.addAssign(n.mul(eroAmp));
          eroMaxAmp.addAssign(eroAmp);
          eroFreq.mulAssign(float(2.0));
          eroAmp.mulAssign(float(0.5));
        }

        height.addAssign(eroSum.div(eroMaxAmp).mul(float(erosionCfg.detailAmplitude)));
      });

      // Write to atlas.
      // 写入图集
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
   * Uses dynamic tile allocation for infinite terrain support.
   * 使用动态 tile 分配以支持无限地形
   *
   * @param cx Chunk X coordinate.
   * @param cz Chunk Z coordinate.
   * @param renderer WebGPU renderer.
   * @returns The allocated tile index, or -1 if allocation failed.
   */
  async bakeChunk(cx: number, cz: number, renderer: WebGPURenderer): Promise<number> {
    // Allocate tile for this chunk (or get existing).
    // 为此 chunk 分配 tile（或获取已有的）
    const tileIndex = this.allocateTile(cx, cz);
    if (tileIndex < 0) {
      return -1;
    }

    const { tileX, tileZ } = this.tileIndexToCoords(tileIndex);

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
    // This ensures the compute shader has finished writing before we read back.
    // 这确保在回读之前计算着色器已完成写入
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backend = (renderer as any).backend;
    const device: GPUDevice = backend.device;
    await device.queue.onSubmittedWorkDone();

    return tileIndex;
  }

  /**
   * Get tile UV offset for a chunk (using dynamic allocation).
   * 获取 chunk 的 tile UV 偏移（使用动态分配）
   */
  getChunkTileUV(cx: number, cz: number): { uOffset: number; vOffset: number; uvScale: number } {
    const key = `${cx},${cz}`;
    const tileIndex = this.chunkToTile.get(key);
    
    if (tileIndex === undefined) {
      console.error(`[TerrainHeightCompute] No tile allocated for chunk (${cx}, ${cz})`);
      return { uOffset: 0, vOffset: 0, uvScale: 1 / this.atlasTilesPerSide };
    }

    const { tileX, tileZ } = this.tileIndexToCoords(tileIndex);

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
   * Read back height data for a chunk from GPU (using dynamic tile allocation).
   * 从 GPU 回读 chunk 的高度数据（使用动态 tile 分配）
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
    
    // Get tile coordinates from dynamic allocation.
    // 从动态分配获取 tile 坐标
    const key = `${cx},${cz}`;
    const tileIndex = this.chunkToTile.get(key);
    if (tileIndex === undefined) {
      console.error(`[TerrainHeightCompute] No tile allocated for chunk (${cx}, ${cz}) in readback`);
      return new Float32Array(tileRes * tileRes);
    }

    const { tileX, tileZ } = this.tileIndexToCoords(tileIndex);

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
