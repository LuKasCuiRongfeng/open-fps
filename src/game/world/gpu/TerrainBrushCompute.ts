// TerrainBrushCompute: GPU compute shader for terrain brush editing.
// TerrainBrushCompute：用于地形画刷编辑的 GPU 计算着色器
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
  select,
} from "three/tsl";
import {
  FloatType,
  RedFormat,
  NearestFilter,
  StorageTexture,
  DataTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { ComputeNode } from "three/webgpu";
import type { TerrainConfig } from "../terrain";
import type { BrushStroke } from "../../editor/TerrainEditor";
import type { TileAtlasAllocator } from "./TileAtlasAllocator";

/**
 * GPU compute pipeline for terrain brush editing.
 * GPU 地形画刷编辑的计算管线
 */
export class TerrainBrushCompute {
  private readonly config: TerrainConfig;
  private readonly tileResolution: number;
  private readonly atlasTilesPerSide: number;
  private readonly atlasResolution: number;

  private allocator: TileAtlasAllocator | null = null;

  // Main storage texture (writable, shared with materials).
  // 主存储纹理（可写，与材质共享）
  private heightTexture: StorageTexture | null = null;

  // Readable copy for compute shader input.
  // 用于 compute shader 输入的可读副本
  private heightTextureRead: DataTexture | null = null;

  // Brush uniforms.
  // 画刷 uniform
  private brushCenterX = uniform(0);
  private brushCenterZ = uniform(0);
  private brushRadius = uniform(10);
  private brushStrength = uniform(0.5);
  private brushFalloff = uniform(0.7);
  private brushDt = uniform(0.016);
  private brushType = uniform(0); // 0=raise, 1=lower, 2=smooth, 3=flatten
  private flattenTargetHeight = uniform(0);

  // Target tile uniforms.
  // 目标 tile uniform
  private targetTileX = uniform(0);
  private targetTileZ = uniform(0);
  private chunkOffsetX = uniform(0);
  private chunkOffsetZ = uniform(0);

  // Neighbor tile coordinates for smooth brush edge sampling.
  // 用于平滑画刷边缘采样的邻居 tile 坐标
  private neighborXNeg_tileX = uniform(-1);
  private neighborXNeg_tileZ = uniform(-1);
  private neighborXPos_tileX = uniform(-1);
  private neighborXPos_tileZ = uniform(-1);
  private neighborZNeg_tileX = uniform(-1);
  private neighborZNeg_tileZ = uniform(-1);
  private neighborZPos_tileX = uniform(-1);
  private neighborZPos_tileZ = uniform(-1);

  // Edge stitch uniforms.
  // 边缘缝合 uniform
  private stitchTileA_X = uniform(0);
  private stitchTileA_Z = uniform(0);
  private stitchTileB_X = uniform(0);
  private stitchTileB_Z = uniform(0);
  private stitchAxis = uniform(0);

  // Compute nodes.
  // 计算节点
  private brushComputeNode: ComputeNode | null = null;
  private edgeStitchNode: ComputeNode | null = null;

  private initialized = false;

  // Flag to track if readable texture needs sync before first brush.
  // 跟踪是否需要在第一次画刷前同步可读纹理的标志
  private needsSync = true;

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
  async init(
    renderer: WebGPURenderer,
    heightTexture: StorageTexture,
    allocator: TileAtlasAllocator
  ): Promise<void> {
    this.heightTexture = heightTexture;
    this.allocator = allocator;

    // Create readable DataTexture copy.
    // 创建可读的 DataTexture 副本
    const data = new Float32Array(this.atlasResolution * this.atlasResolution);
    this.heightTextureRead = new DataTexture(
      data,
      this.atlasResolution,
      this.atlasResolution,
      RedFormat,
      FloatType
    );
    this.heightTextureRead.magFilter = NearestFilter;
    this.heightTextureRead.minFilter = NearestFilter;
    this.heightTextureRead.needsUpdate = true;

    // Build compute shaders.
    // 构建计算着色器
    this.buildBrushShader();
    this.buildEdgeStitchShader();

    // Initial sync: copy storage texture to readable texture.
    // 初始同步：将存储纹理复制到可读纹理
    renderer.copyTextureToTexture(this.heightTexture, this.heightTextureRead);

    // Mark that we need to sync again before first brush (terrain may be baked after init).
    // 标记我们需要在第一次画刷前再次同步（地形可能在 init 之后烘焙）
    this.needsSync = true;

    this.initialized = true;
  }

  /**
   * Build brush compute shader.
   * 构建画刷计算着色器
   */
  private buildBrushShader(): void {
    const tileRes = this.tileResolution;
    const chunkSize = float(this.config.streaming.chunkSizeMeters);
    const srcTexture = this.heightTextureRead!;
    const dstTexture = this.heightTexture!;

    const computeFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(tileRes));
      const pixelY = instanceIndex.div(uint(tileRes));

      const tileXCoord = uint(this.targetTileX);
      const tileZCoord = uint(this.targetTileZ);

      const atlasX = tileXCoord.mul(uint(tileRes)).add(pixelX);
      const atlasY = tileZCoord.mul(uint(tileRes)).add(pixelY);

      // World coordinates.
      // 世界坐标
      const localU = float(pixelX).div(float(tileRes - 1));
      const localV = float(pixelY).div(float(tileRes - 1));
      const worldX = float(this.chunkOffsetX).mul(chunkSize).add(localU.mul(chunkSize));
      const worldZ = float(this.chunkOffsetZ).mul(chunkSize).add(localV.mul(chunkSize));

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

      // Read current height from readable texture.
      // 从可读纹理读取当前高度
      const readCoord = ivec2(int(atlasX), int(atlasY));
      const currentHeight = texture(srcTexture).load(readCoord).r;

      // Calculate height delta.
      // 计算高度增量
      const delta = float(0).toVar();
      const strengthPerSecond = float(50);
      const effectStrength = this.brushStrength.mul(this.brushDt).mul(strengthPerSecond).mul(falloffMask);

      // Raise (type 0).
      // 抬高
      If(this.brushType.equal(0), () => {
        delta.assign(effectStrength);
      });

      // Lower (type 1).
      // 降低
      If(this.brushType.equal(1), () => {
        delta.assign(effectStrength.negate());
      });

      // Smooth (type 2).
      // 平滑
      If(this.brushType.equal(2), () => {
        const atLeftEdge = pixelX.equal(uint(0));
        const atRightEdge = pixelX.equal(uint(tileRes - 1));
        const atBottomEdge = pixelY.equal(uint(0));
        const atTopEdge = pixelY.equal(uint(tileRes - 1));

        const hasLeftNeighbor = this.neighborXNeg_tileX.greaterThanEqual(0);
        const hasRightNeighbor = this.neighborXPos_tileX.greaterThanEqual(0);
        const hasBottomNeighbor = this.neighborZNeg_tileX.greaterThanEqual(0);
        const hasTopNeighbor = this.neighborZPos_tileX.greaterThanEqual(0);

        // Left neighbor.
        // 左邻居
        const useLeftNeighbor = atLeftEdge.and(hasLeftNeighbor);
        const leftAtlasX = select(
          useLeftNeighbor,
          this.neighborXNeg_tileX.mul(int(tileRes)).add(int(tileRes - 2)),
          int(tileXCoord).mul(int(tileRes)).add(int(pixelX).sub(1).max(0))
        );
        const leftAtlasY = select(
          useLeftNeighbor,
          this.neighborXNeg_tileZ.mul(int(tileRes)).add(int(pixelY)),
          int(atlasY)
        );
        const h1 = texture(srcTexture).load(ivec2(leftAtlasX, leftAtlasY)).r;

        // Right neighbor.
        // 右邻居
        const useRightNeighbor = atRightEdge.and(hasRightNeighbor);
        const rightAtlasX = select(
          useRightNeighbor,
          this.neighborXPos_tileX.mul(int(tileRes)).add(int(1)),
          int(tileXCoord).mul(int(tileRes)).add(int(pixelX).add(1).min(tileRes - 1))
        );
        const rightAtlasY = select(
          useRightNeighbor,
          this.neighborXPos_tileZ.mul(int(tileRes)).add(int(pixelY)),
          int(atlasY)
        );
        const h0 = texture(srcTexture).load(ivec2(rightAtlasX, rightAtlasY)).r;

        // Bottom neighbor.
        // 下邻居
        const useBottomNeighbor = atBottomEdge.and(hasBottomNeighbor);
        const bottomAtlasX = select(
          useBottomNeighbor,
          this.neighborZNeg_tileX.mul(int(tileRes)).add(int(pixelX)),
          int(atlasX)
        );
        const bottomAtlasY = select(
          useBottomNeighbor,
          this.neighborZNeg_tileZ.mul(int(tileRes)).add(int(tileRes - 2)),
          int(tileZCoord).mul(int(tileRes)).add(int(pixelY).sub(1).max(0))
        );
        const h3 = texture(srcTexture).load(ivec2(bottomAtlasX, bottomAtlasY)).r;

        // Top neighbor.
        // 上邻居
        const useTopNeighbor = atTopEdge.and(hasTopNeighbor);
        const topAtlasX = select(
          useTopNeighbor,
          this.neighborZPos_tileX.mul(int(tileRes)).add(int(pixelX)),
          int(atlasX)
        );
        const topAtlasY = select(
          useTopNeighbor,
          this.neighborZPos_tileZ.mul(int(tileRes)).add(int(1)),
          int(tileZCoord).mul(int(tileRes)).add(int(pixelY).add(1).min(tileRes - 1))
        );
        const h2 = texture(srcTexture).load(ivec2(topAtlasX, topAtlasY)).r;

        const avgHeight = h0.add(h1).add(h2).add(h3).div(4);
        const smoothFactor = this.brushStrength.mul(this.brushDt).mul(5).mul(falloffMask);
        delta.assign(avgHeight.sub(currentHeight).mul(smoothFactor));
      });

      // Flatten (type 3).
      // 平整
      If(this.brushType.equal(3), () => {
        const flattenFactor = this.brushStrength.mul(this.brushDt).mul(3).mul(falloffMask);
        delta.assign(this.flattenTargetHeight.sub(currentHeight).mul(flattenFactor));
      });

      const newHeight = currentHeight.add(delta);
      const outputHeight = insideBrush.select(newHeight, currentHeight);
      textureStore(dstTexture, uvec2(atlasX, atlasY), vec4(outputHeight, float(0), float(0), float(1))).toWriteOnly();
    });

    this.brushComputeNode = computeFn().compute(tileRes * tileRes);
  }

  /**
   * Build edge stitch shader.
   * 构建边缘缝合着色器
   */
  private buildEdgeStitchShader(): void {
    const tileRes = this.tileResolution;
    const srcTexture = this.heightTextureRead!;
    const dstTexture = this.heightTexture!;

    const stitchFn = Fn(() => {
      const edgeIdx = int(instanceIndex);

      const tileAx = this.stitchTileA_X;
      const tileAz = this.stitchTileA_Z;
      const tileBx = this.stitchTileB_X;
      const tileBz = this.stitchTileB_Z;

      const atlasA = ivec2(0, 0).toVar();
      const atlasB = ivec2(0, 0).toVar();

      If(this.stitchAxis.equal(0), () => {
        atlasA.assign(ivec2(
          tileAx.mul(int(tileRes)).add(int(tileRes - 1)),
          tileAz.mul(int(tileRes)).add(edgeIdx)
        ));
        atlasB.assign(ivec2(
          tileBx.mul(int(tileRes)),
          tileBz.mul(int(tileRes)).add(edgeIdx)
        ));
      });

      If(this.stitchAxis.equal(1), () => {
        atlasA.assign(ivec2(
          tileAx.mul(int(tileRes)).add(edgeIdx),
          tileAz.mul(int(tileRes)).add(int(tileRes - 1))
        ));
        atlasB.assign(ivec2(
          tileBx.mul(int(tileRes)).add(edgeIdx),
          tileBz.mul(int(tileRes))
        ));
      });

      const heightA = texture(srcTexture).load(atlasA).r;
      const heightB = texture(srcTexture).load(atlasB).r;
      const avgHeight = heightA.add(heightB).mul(0.5);

      textureStore(dstTexture, uvec2(atlasA), vec4(avgHeight, float(0), float(0), float(1))).toWriteOnly();
      textureStore(dstTexture, uvec2(atlasB), vec4(avgHeight, float(0), float(0), float(1))).toWriteOnly();
    });

    this.edgeStitchNode = stitchFn().compute(tileRes);
  }

  /**
   * Get tile coordinates for a chunk.
   * 获取 chunk 的 tile 坐标
   */
  private getTileCoords(cx: number, cz: number): { tileX: number; tileZ: number } | null {
    if (!this.allocator) return null;
    const tileIndex = this.allocator.getTileIndex(cx, cz);
    if (tileIndex === undefined) return null;
    return this.allocator.tileIndexToCoords(tileIndex);
  }

  /**
   * Apply brush stroke to a chunk.
   * 将画刷笔触应用到 chunk
   */
  async applyBrushToChunk(
    cx: number,
    cz: number,
    tileX: number,
    tileZ: number,
    stroke: BrushStroke,
    flattenTargetHeight: number,
    renderer: WebGPURenderer
  ): Promise<void> {
    if (!this.initialized || !this.brushComputeNode) return;

    // Update uniforms.
    // 更新 uniform
    this.brushCenterX.value = stroke.worldX;
    this.brushCenterZ.value = stroke.worldZ;
    this.brushRadius.value = stroke.brush.radiusMeters;
    this.brushStrength.value = stroke.brush.strength;
    this.brushFalloff.value = stroke.brush.falloff;
    this.brushDt.value = stroke.dt;
    this.flattenTargetHeight.value = flattenTargetHeight;

    const typeMap: Record<string, number> = { raise: 0, lower: 1, smooth: 2, flatten: 3 };
    this.brushType.value = typeMap[stroke.brush.type] ?? 0;

    this.targetTileX.value = tileX;
    this.targetTileZ.value = tileZ;
    this.chunkOffsetX.value = cx;
    this.chunkOffsetZ.value = cz;

    // Set neighbor tile coordinates for smooth brush.
    // 设置平滑画刷的邻居 tile 坐标
    const neighborXNeg = this.getTileCoords(cx - 1, cz);
    const neighborXPos = this.getTileCoords(cx + 1, cz);
    const neighborZNeg = this.getTileCoords(cx, cz - 1);
    const neighborZPos = this.getTileCoords(cx, cz + 1);

    this.neighborXNeg_tileX.value = neighborXNeg?.tileX ?? -1;
    this.neighborXNeg_tileZ.value = neighborXNeg?.tileZ ?? -1;
    this.neighborXPos_tileX.value = neighborXPos?.tileX ?? -1;
    this.neighborXPos_tileZ.value = neighborXPos?.tileZ ?? -1;
    this.neighborZNeg_tileX.value = neighborZNeg?.tileX ?? -1;
    this.neighborZNeg_tileZ.value = neighborZNeg?.tileZ ?? -1;
    this.neighborZPos_tileX.value = neighborZPos?.tileX ?? -1;
    this.neighborZPos_tileZ.value = neighborZPos?.tileZ ?? -1;

    // Execute brush compute shader.
    // 执行画刷计算着色器
    await renderer.computeAsync(this.brushComputeNode);

    // Sync: copy storage texture back to readable texture.
    // 同步：将存储纹理复制回可读纹理
    renderer.copyTextureToTexture(this.heightTexture!, this.heightTextureRead!);
  }

  /**
   * Apply brush without syncing (for batch processing).
   * 应用画刷但不同步（用于批量处理）
   */
  async applyBrushToChunkNoCopy(
    cx: number,
    cz: number,
    tileX: number,
    tileZ: number,
    stroke: BrushStroke,
    flattenTargetHeight: number,
    renderer: WebGPURenderer
  ): Promise<void> {
    if (!this.initialized || !this.brushComputeNode) return;

    this.brushCenterX.value = stroke.worldX;
    this.brushCenterZ.value = stroke.worldZ;
    this.brushRadius.value = stroke.brush.radiusMeters;
    this.brushStrength.value = stroke.brush.strength;
    this.brushFalloff.value = stroke.brush.falloff;
    this.brushDt.value = stroke.dt;
    this.flattenTargetHeight.value = flattenTargetHeight;

    const typeMap: Record<string, number> = { raise: 0, lower: 1, smooth: 2, flatten: 3 };
    this.brushType.value = typeMap[stroke.brush.type] ?? 0;

    this.targetTileX.value = tileX;
    this.targetTileZ.value = tileZ;
    this.chunkOffsetX.value = cx;
    this.chunkOffsetZ.value = cz;

    const neighborXNeg = this.getTileCoords(cx - 1, cz);
    const neighborXPos = this.getTileCoords(cx + 1, cz);
    const neighborZNeg = this.getTileCoords(cx, cz - 1);
    const neighborZPos = this.getTileCoords(cx, cz + 1);

    this.neighborXNeg_tileX.value = neighborXNeg?.tileX ?? -1;
    this.neighborXNeg_tileZ.value = neighborXNeg?.tileZ ?? -1;
    this.neighborXPos_tileX.value = neighborXPos?.tileX ?? -1;
    this.neighborXPos_tileZ.value = neighborXPos?.tileZ ?? -1;
    this.neighborZNeg_tileX.value = neighborZNeg?.tileX ?? -1;
    this.neighborZNeg_tileZ.value = neighborZNeg?.tileZ ?? -1;
    this.neighborZPos_tileX.value = neighborZPos?.tileX ?? -1;
    this.neighborZPos_tileZ.value = neighborZPos?.tileZ ?? -1;

    await renderer.computeAsync(this.brushComputeNode);
  }

  /**
   * Sync readable texture from storage texture.
   * 从存储纹理同步可读纹理
   */
  syncReadableTexture(renderer: WebGPURenderer): void {
    if (this.heightTexture && this.heightTextureRead) {
      renderer.copyTextureToTexture(this.heightTexture, this.heightTextureRead);
    }
  }

  /**
   * Ensure readable texture is synced before brush operations.
   * 确保在画刷操作前同步可读纹理
   *
   * Call this once before the first brush stroke after terrain is loaded/generated.
   * 在地形加载/生成后，第一次画刷前调用此方法。
   */
  ensureSynced(renderer: WebGPURenderer): void {
    if (this.needsSync && this.heightTexture && this.heightTextureRead) {
      renderer.copyTextureToTexture(this.heightTexture, this.heightTextureRead);
      this.needsSync = false;
      console.log("[TerrainBrushCompute] Synced readable texture before first brush");
    }
  }

  /**
   * Mark that readable texture needs sync (call after terrain is regenerated/loaded).
   * 标记可读纹理需要同步（在地形重新生成/加载后调用）
   */
  markNeedsSync(): void {
    this.needsSync = true;
  }

  /**
   * Stitch edges between two adjacent chunks.
   * 缝合两个相邻 chunk 之间的边缘
   */
  async stitchEdge(
    cx1: number,
    cz1: number,
    cx2: number,
    cz2: number,
    renderer: WebGPURenderer
  ): Promise<void> {
    if (!this.initialized || !this.edgeStitchNode) return;

    const tile1 = this.getTileCoords(cx1, cz1);
    const tile2 = this.getTileCoords(cx2, cz2);
    if (!tile1 || !tile2) return;

    const isXEdge = cx1 !== cx2;

    if (isXEdge) {
      const [tileA, tileB] = cx1 < cx2 ? [tile1, tile2] : [tile2, tile1];
      this.stitchTileA_X.value = tileA.tileX;
      this.stitchTileA_Z.value = tileA.tileZ;
      this.stitchTileB_X.value = tileB.tileX;
      this.stitchTileB_Z.value = tileB.tileZ;
      this.stitchAxis.value = 0;
    } else {
      const [tileA, tileB] = cz1 < cz2 ? [tile1, tile2] : [tile2, tile1];
      this.stitchTileA_X.value = tileA.tileX;
      this.stitchTileA_Z.value = tileA.tileZ;
      this.stitchTileB_X.value = tileB.tileX;
      this.stitchTileB_Z.value = tileB.tileZ;
      this.stitchAxis.value = 1;
    }

    await renderer.computeAsync(this.edgeStitchNode);

    // Sync after stitching.
    // 缝合后同步
    this.syncReadableTexture(renderer);
  }

  /**
   * Get the active height texture (for materials).
   * 获取活跃的高度纹理（用于材质）
   */
  getActiveHeightTexture(): StorageTexture {
    return this.heightTexture!;
  }

  dispose(): void {
    this.heightTextureRead?.dispose();
    this.heightTextureRead = null;
    this.heightTexture = null;
    this.brushComputeNode = null;
    this.edgeStitchNode = null;
    this.allocator = null;
    this.initialized = false;
  }
}
