// TerrainBrushCompute: GPU compute shader for terrain brush editing.
// TerrainBrushCompute：用于地形画刷编辑的 GPU 计算着色器
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
//
// Edge stitching: After brush application, edges are stitched to prevent seams.
// 边缘缝合：画刷应用后，缝合边缘以防止裂缝

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
  select,
} from "three/tsl";
import {
  FloatType,
  RedFormat,
  LinearFilter,
  StorageTexture,
  type WebGPURenderer,
} from "three/webgpu";
import type { ComputeNode } from "three/webgpu";
import type { TerrainConfig } from "../terrain";
import type { BrushStroke } from "../../editor/TerrainEditor";
import type { TileAtlasAllocator } from "./TileAtlasAllocator";

/**
 * GPU compute pipeline for terrain brush editing.
 * GPU 地形画刷编辑的计算管线
 *
 * Uses ping-pong double buffering for read-write operations.
 * 使用乒乓双缓冲进行读写操作
 *
 * Includes edge stitching to prevent seams between chunks.
 * 包含边缘缝合以防止 chunk 之间的裂缝
 */
export class TerrainBrushCompute {
  private readonly config: TerrainConfig;

  // Resolution per chunk tile.
  // 每个 chunk tile 的分辨率
  private readonly tileResolution: number;

  // Atlas dimensions.
  // 图集尺寸
  private readonly atlasTilesPerSide: number;
  private readonly atlasResolution: number;

  // Tile allocator reference for neighbor lookup.
  // Tile 分配器引用，用于邻居查找
  private allocator: TileAtlasAllocator | null = null;

  // Ping-pong height textures for double buffering.
  // 用于双缓冲的乒乓高度纹理
  // heightTextureA is the "primary" texture shared with TerrainHeightCompute.
  // heightTextureA 是与 TerrainHeightCompute 共享的"主"纹理
  private heightTextureA: StorageTexture | null = null;
  // heightTextureB is the secondary buffer for ping-pong.
  // heightTextureB 是乒乓的次要缓冲区
  private heightTextureB: StorageTexture | null = null;

  // Brush uniforms.
  // 画刷 uniform
  private brushCenterX = uniform(0);
  private brushCenterZ = uniform(0);
  private brushRadius = uniform(10);
  private brushStrength = uniform(0.5);
  private brushFalloff = uniform(0.7);
  private brushDt = uniform(0.016);
  // 0 = raise, 1 = lower, 2 = smooth, 3 = flatten
  private brushType = uniform(0);
  // Flatten target height (computed on CPU from brush center).
  // Flatten 目标高度（从画刷中心在 CPU 上计算）
  private flattenTargetHeight = uniform(0);

  // Target tile coordinates.
  // 目标 tile 坐标
  private targetTileX = uniform(0);
  private targetTileZ = uniform(0);

  // Neighbor tile coordinates for edge sampling (-1 means no neighbor loaded).
  // 用于边缘采样的邻居 tile 坐标（-1 表示没有加载邻居）
  // Each neighbor needs both X and Z coordinates in the atlas.
  // 每个邻居需要在图集中的 X 和 Z 坐标
  private neighborXNeg_tileX = uniform(-1); // Chunk at (cx-1, cz) tile X
  private neighborXNeg_tileZ = uniform(-1); // Chunk at (cx-1, cz) tile Z
  private neighborXPos_tileX = uniform(-1); // Chunk at (cx+1, cz) tile X
  private neighborXPos_tileZ = uniform(-1); // Chunk at (cx+1, cz) tile Z
  private neighborZNeg_tileX = uniform(-1); // Chunk at (cx, cz-1) tile X
  private neighborZNeg_tileZ = uniform(-1); // Chunk at (cx, cz-1) tile Z
  private neighborZPos_tileX = uniform(-1); // Chunk at (cx, cz+1) tile X
  private neighborZPos_tileZ = uniform(-1); // Chunk at (cx, cz+1) tile Z

  // Chunk world offset (for world-space brush position).
  // Chunk 世界偏移（用于世界空间画刷位置）
  private chunkOffsetX = uniform(0);
  private chunkOffsetZ = uniform(0);

  // Edge stitch uniforms.
  // 边缘缝合 uniform
  private stitchTileA_X = uniform(0);
  private stitchTileA_Z = uniform(0);
  private stitchTileB_X = uniform(0);
  private stitchTileB_Z = uniform(0);
  private stitchAxis = uniform(0); // 0 = X edge, 1 = Z edge

  // Compute nodes for brush application.
  // 画刷应用的计算节点
  // Read from A, write to B
  private computeNodeAtoB: ComputeNode | null = null;
  // Copy B back to A
  private copyNodeBtoA: ComputeNode | null = null;
  // Edge stitch compute node
  private edgeStitchNode: ComputeNode | null = null;

  private initialized = false;

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
    this.heightTextureA = heightTexture;
    this.allocator = allocator;

    // Create secondary buffer for ping-pong (same format as primary).
    // 为乒乓创建次要缓冲区（与主缓冲区相同格式）
    this.heightTextureB = new StorageTexture(this.atlasResolution, this.atlasResolution);
    this.heightTextureB.type = FloatType;
    this.heightTextureB.format = RedFormat;
    this.heightTextureB.magFilter = LinearFilter;
    this.heightTextureB.minFilter = LinearFilter;

    // Build compute shaders.
    // 构建计算着色器
    this.buildComputeShaders();

    // Build copy shader for syncing back.
    // 构建用于同步回的复制着色器
    this.buildCopyShader();

    // Build edge stitch shader.
    // 构建边缘缝合着色器
    this.buildEdgeStitchShader();

    // Initialize secondary buffer by copying from primary.
    // 通过从主缓冲区复制来初始化次要缓冲区
    await this.syncSecondaryBuffer(renderer);

    this.initialized = true;
  }

  /**
   * Build compute shaders for brush operations.
   * 为画刷操作构建计算着色器
   */
  private buildComputeShaders(): void {
    // A -> B: read from A, write to B
    // A -> B: 从 A 读取，写入 B
    this.computeNodeAtoB = this.buildBrushShader(
      this.heightTextureA!,
      this.heightTextureB!
    );
  }

  /**
   * Build a brush compute shader that reads from src and writes to dst.
   * 构建从 src 读取并写入 dst 的画刷计算着色器
   *
   * Handles edge sampling by using neighbor tile coordinates when available.
   * 通过使用可用的邻居 tile 坐标来处理边缘采样
   */
  private buildBrushShader(
    srcTexture: StorageTexture,
    dstTexture: StorageTexture
  ): ComputeNode {
    const tileRes = this.tileResolution;
    const chunkSize = float(this.config.streaming.chunkSizeMeters);

    const computeFn = Fn(() => {
      // Compute pixel coordinates from instance index.
      // 从实例索引计算像素坐标
      const pixelX = mod(instanceIndex, uint(tileRes));
      const pixelY = mod(instanceIndex.div(uint(tileRes)), uint(tileRes));

      // Get target tile coordinates.
      // 获取目标 tile 坐标
      const tileXCoord = uint(this.targetTileX);
      const tileZCoord = uint(this.targetTileZ);

      // Atlas coordinates.
      // 图集坐标
      const atlasX = tileXCoord.mul(uint(tileRes)).add(pixelX);
      const atlasY = tileZCoord.mul(uint(tileRes)).add(pixelY);

      // World coordinates of this pixel.
      // 此像素的世界坐标
      const localU = float(pixelX).div(float(tileRes - 1));
      const localV = float(pixelY).div(float(tileRes - 1));
      const worldX = float(this.chunkOffsetX).mul(chunkSize).add(localU.mul(chunkSize));
      const worldZ = float(this.chunkOffsetZ).mul(chunkSize).add(localV.mul(chunkSize));

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

      // Read current height from SOURCE texture.
      // 从源纹理读取当前高度
      const readCoord = ivec2(int(atlasX), int(atlasY));
      const currentHeight = textureLoad(srcTexture, readCoord).r;

      // Calculate height delta based on brush type.
      // 根据画刷类型计算高度增量
      const delta = float(0).toVar();
      const strengthPerSecond = float(50); // 50 meters per second at full strength
      const effectStrength = this.brushStrength.mul(this.brushDt).mul(strengthPerSecond).mul(falloffMask);

      // Raise (type 0).
      // 抬高（类型 0）
      If(this.brushType.equal(0), () => {
        delta.assign(effectStrength);
      });

      // Lower (type 1).
      // 降低（类型 1）
      If(this.brushType.equal(1), () => {
        delta.assign(effectStrength.negate());
      });

      // Smooth (type 2) - blend towards average of neighbors.
      // 平滑（类型 2）- 混合邻居的平均值
      // Handle edge sampling with neighbor tiles to prevent seams.
      // 使用邻居 tile 处理边缘采样以防止裂缝
      //
      // CRITICAL: Edge pixels OVERLAP between adjacent chunks!
      // 关键：边缘像素在相邻 chunk 之间重叠！
      // - Chunk A pixel 63 = Chunk B pixel 0 (same world position)
      // - Chunk A pixel 63 = Chunk B pixel 0（同一世界位置）
      // So when sampling "neighbor" from edge, we need pixel 1 (not 0)!
      // 所以从边缘采样"邻居"时，需要 pixel 1（不是 0）！
      If(this.brushType.equal(2), () => {
        // Check if we're at tile edges.
        // 检查是否在 tile 边缘
        const atLeftEdge = pixelX.equal(uint(0));
        const atRightEdge = pixelX.equal(uint(tileRes - 1));
        const atBottomEdge = pixelY.equal(uint(0));
        const atTopEdge = pixelY.equal(uint(tileRes - 1));

        // Neighbor tile availability (check tileX >= 0 as indicator).
        // 邻居 tile 可用性（检查 tileX >= 0 作为指示器）
        const hasLeftNeighbor = this.neighborXNeg_tileX.greaterThanEqual(0);
        const hasRightNeighbor = this.neighborXPos_tileX.greaterThanEqual(0);
        const hasBottomNeighbor = this.neighborZNeg_tileX.greaterThanEqual(0);
        const hasTopNeighbor = this.neighborZPos_tileX.greaterThanEqual(0);

        // Left neighbor (X-1): when at pixel 0, sample neighbor's pixel 62 (not 63!).
        // 左邻居（X-1）：在 pixel 0 时，采样邻居的 pixel 62（不是 63！）
        // Because pixel 63 of neighbor = pixel 0 of current (same world pos).
        // 因为邻居的 pixel 63 = 当前的 pixel 0（相同世界位置）
        const useLeftNeighbor = atLeftEdge.and(hasLeftNeighbor);
        const leftAtlasX = select(
          useLeftNeighbor,
          this.neighborXNeg_tileX.mul(int(tileRes)).add(int(tileRes - 2)), // pixel 62
          int(tileXCoord).mul(int(tileRes)).add(int(pixelX).sub(1).max(0))
        );
        const leftAtlasY = select(
          useLeftNeighbor,
          this.neighborXNeg_tileZ.mul(int(tileRes)).add(int(pixelY)),
          int(atlasY)
        );
        const h1 = textureLoad(srcTexture, ivec2(leftAtlasX, leftAtlasY)).r;

        // Right neighbor (X+1): when at pixel 63, sample neighbor's pixel 1 (not 0!).
        // 右邻居（X+1）：在 pixel 63 时，采样邻居的 pixel 1（不是 0！）
        // Because pixel 0 of neighbor = pixel 63 of current (same world pos).
        // 因为邻居的 pixel 0 = 当前的 pixel 63（相同世界位置）
        const useRightNeighbor = atRightEdge.and(hasRightNeighbor);
        const rightAtlasX = select(
          useRightNeighbor,
          this.neighborXPos_tileX.mul(int(tileRes)).add(int(1)), // pixel 1
          int(tileXCoord).mul(int(tileRes)).add(int(pixelX).add(1).min(tileRes - 1))
        );
        const rightAtlasY = select(
          useRightNeighbor,
          this.neighborXPos_tileZ.mul(int(tileRes)).add(int(pixelY)),
          int(atlasY)
        );
        const h0 = textureLoad(srcTexture, ivec2(rightAtlasX, rightAtlasY)).r;

        // Bottom neighbor (Z-1): when at pixel 0, sample neighbor's pixel 62.
        // 下邻居（Z-1）：在 pixel 0 时，采样邻居的 pixel 62
        const useBottomNeighbor = atBottomEdge.and(hasBottomNeighbor);
        const bottomAtlasX = select(
          useBottomNeighbor,
          this.neighborZNeg_tileX.mul(int(tileRes)).add(int(pixelX)),
          int(atlasX)
        );
        const bottomAtlasY = select(
          useBottomNeighbor,
          this.neighborZNeg_tileZ.mul(int(tileRes)).add(int(tileRes - 2)), // pixel 62
          int(tileZCoord).mul(int(tileRes)).add(int(pixelY).sub(1).max(0))
        );
        const h3 = textureLoad(srcTexture, ivec2(bottomAtlasX, bottomAtlasY)).r;

        // Top neighbor (Z+1): when at pixel 63, sample neighbor's pixel 1.
        // 上邻居（Z+1）：在 pixel 63 时，采样邻居的 pixel 1
        const useTopNeighbor = atTopEdge.and(hasTopNeighbor);
        const topAtlasX = select(
          useTopNeighbor,
          this.neighborZPos_tileX.mul(int(tileRes)).add(int(pixelX)),
          int(atlasX)
        );
        const topAtlasY = select(
          useTopNeighbor,
          this.neighborZPos_tileZ.mul(int(tileRes)).add(int(1)), // pixel 1
          int(tileZCoord).mul(int(tileRes)).add(int(pixelY).add(1).min(tileRes - 1))
        );
        const h2 = textureLoad(srcTexture, ivec2(topAtlasX, topAtlasY)).r;

        const avgHeight = h0.add(h1).add(h2).add(h3).div(4);

        const smoothFactor = this.brushStrength.mul(this.brushDt).mul(5).mul(falloffMask);
        delta.assign(avgHeight.sub(currentHeight).mul(smoothFactor));
      });

      // Flatten (type 3) - bring towards brush center height (pre-computed on CPU).
      // 平整（类型 3）- 向画刷中心高度靠拢（CPU 预计算）
      If(this.brushType.equal(3), () => {
        const targetHeight = this.flattenTargetHeight;
        const flattenFactor = this.brushStrength.mul(this.brushDt).mul(3).mul(falloffMask);
        delta.assign(targetHeight.sub(currentHeight).mul(flattenFactor));
      });

      // Compute new height.
      // 计算新高度
      const newHeight = currentHeight.add(delta);

      // Write to DESTINATION texture.
      // 写入目标纹理
      // Inside brush: write modified height. Outside brush: copy original.
      // 画刷内：写入修改后的高度。画刷外：复制原始值
      const outputHeight = insideBrush.select(newHeight, currentHeight);
      textureStore(dstTexture, uvec2(atlasX, atlasY), vec4(outputHeight, float(0), float(0), float(1))).toWriteOnly();
    });

    return computeFn().compute(tileRes * tileRes);
  }

  /**
   * Build copy shader for syncing B back to A (tile-based).
   * 构建用于将 B 同步回 A 的复制着色器（基于 tile）
   */
  private buildCopyShader(): void {
    const tileRes = this.tileResolution;

    // Copy single tile from B -> A
    // 从 B -> A 复制单个 tile
    const copyTileFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(tileRes));
      const pixelY = instanceIndex.div(uint(tileRes));

      const tileXCoord = uint(this.targetTileX);
      const tileZCoord = uint(this.targetTileZ);

      const atlasX = tileXCoord.mul(uint(tileRes)).add(pixelX);
      const atlasY = tileZCoord.mul(uint(tileRes)).add(pixelY);

      const coord = ivec2(int(atlasX), int(atlasY));
      const value = textureLoad(this.heightTextureB!, coord);
      textureStore(this.heightTextureA!, uvec2(atlasX, atlasY), value).toWriteOnly();
    });
    this.copyNodeBtoA = copyTileFn().compute(tileRes * tileRes);
  }

  /**
   * Build edge stitch shader for averaging adjacent tile edges.
   * 构建用于平均相邻 tile 边缘的边缘缝合着色器
   *
   * This shader processes one edge at a time:
   * - For X edges: processes the right edge of tile A and left edge of tile B
   * - For Z edges: processes the top edge of tile A and bottom edge of tile B
   * 此着色器一次处理一条边：
   * - X 边：处理 tile A 的右边缘和 tile B 的左边缘
   * - Z 边：处理 tile A 的上边缘和 tile B 的下边缘
   *
   * Forces boundary pixels to have identical heights (average of both).
   * 强制边界像素具有相同的高度（两者的平均值）
   */
  private buildEdgeStitchShader(): void {
    const tileRes = this.tileResolution;

    const stitchFn = Fn(() => {
      // Instance index is the edge pixel index (0 to tileRes-1).
      // 实例索引是边缘像素索引（0 到 tileRes-1）
      const edgeIdx = int(instanceIndex);

      // Tile A and B coordinates.
      // Tile A 和 B 坐标
      const tileAx = this.stitchTileA_X;
      const tileAz = this.stitchTileA_Z;
      const tileBx = this.stitchTileB_X;
      const tileBz = this.stitchTileB_Z;

      // Calculate atlas coordinates for boundary pixels.
      // 计算边界像素的图集坐标
      const atlasA = ivec2(0, 0).toVar();
      const atlasB = ivec2(0, 0).toVar();

      If(this.stitchAxis.equal(0), () => {
        // X edge: A's right edge (pixelX = tileRes-1) meets B's left edge (pixelX = 0).
        // X 边：A 的右边缘（pixelX = tileRes-1）与 B 的左边缘（pixelX = 0）相接
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
        // Z edge: A's top edge (pixelY = tileRes-1) meets B's bottom edge (pixelY = 0).
        // Z 边：A 的上边缘（pixelY = tileRes-1）与 B 的下边缘（pixelY = 0）相接
        atlasA.assign(ivec2(
          tileAx.mul(int(tileRes)).add(edgeIdx),
          tileAz.mul(int(tileRes)).add(int(tileRes - 1))
        ));
        atlasB.assign(ivec2(
          tileBx.mul(int(tileRes)).add(edgeIdx),
          tileBz.mul(int(tileRes))
        ));
      });

      // Read heights from both boundary pixels.
      // 从两个边界像素读取高度
      const heightA = textureLoad(this.heightTextureA!, atlasA).r;
      const heightB = textureLoad(this.heightTextureA!, atlasB).r;

      // Force both to average value.
      // 强制两者为平均值
      const avgHeight = heightA.add(heightB).mul(0.5);

      // Write to both edges.
      // 写入两条边
      textureStore(this.heightTextureA!, uvec2(atlasA), vec4(avgHeight, float(0), float(0), float(1))).toWriteOnly();
      textureStore(this.heightTextureA!, uvec2(atlasB), vec4(avgHeight, float(0), float(0), float(1))).toWriteOnly();
    });

    this.edgeStitchNode = stitchFn().compute(tileRes);
  }

  /**
   * Sync secondary buffer from primary (after external changes like chunk upload).
   * 从主缓冲区同步次要缓冲区（在外部更改如 chunk 上传后）
   */
  async syncSecondaryBuffer(renderer: WebGPURenderer): Promise<void> {
    // Build a full-atlas copy shader for initial sync.
    // 为初始同步构建完整图集复制着色器
    const atlasRes = this.atlasResolution;
    const copyFullFn = Fn(() => {
      const pixelX = mod(instanceIndex, uint(atlasRes));
      const pixelY = instanceIndex.div(uint(atlasRes));
      const coord = ivec2(int(pixelX), int(pixelY));
      const value = textureLoad(this.heightTextureA!, coord);
      textureStore(this.heightTextureB!, uvec2(pixelX, pixelY), value).toWriteOnly();
    });
    const copyNode = copyFullFn().compute(atlasRes * atlasRes);
    await renderer.computeAsync(copyNode);
  }

  /**
   * Get the current "active" height texture (the one with latest data).
   * 获取当前"活跃"的高度纹理（包含最新数据的那个）
   *
   * This is always heightTextureA (primary), as we ensure it's synced after brush ops.
   * 这始终是 heightTextureA（主），因为我们确保它在画刷操作后同步
   */
  getActiveHeightTexture(): StorageTexture {
    return this.heightTextureA!;
  }

  /**
   * Get tile coordinates for a chunk (returns null if not allocated).
   * 获取 chunk 的 tile 坐标（如果未分配则返回 null）
   */
  private getTileCoords(cx: number, cz: number): { tileX: number; tileZ: number } | null {
    if (!this.allocator) return null;
    const tileIndex = this.allocator.getTileIndex(cx, cz);
    if (tileIndex === undefined) return null;
    return this.allocator.tileIndexToCoords(tileIndex);
  }

  /**
   * Apply a brush stroke to a chunk.
   * 将画刷笔触应用到 chunk
   *
   * GPU-first: All brush math runs on GPU compute shader.
   * GPU-first：所有画刷数学运算在 GPU 计算着色器上运行
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
    if (!this.initialized) {
      console.error("[TerrainBrushCompute] Not initialized!");
      return;
    }

    // Set uniforms.
    // 设置 uniform
    this.brushCenterX.value = stroke.worldX;
    this.brushCenterZ.value = stroke.worldZ;
    this.brushRadius.value = stroke.brush.radiusMeters;
    this.brushStrength.value = stroke.brush.strength;
    this.brushFalloff.value = stroke.brush.falloff;
    this.brushDt.value = stroke.dt;
    this.flattenTargetHeight.value = flattenTargetHeight;

    // Map brush type to integer.
    // 将画刷类型映射为整数
    const typeMap: Record<string, number> = {
      raise: 0,
      lower: 1,
      smooth: 2,
      flatten: 3,
    };
    this.brushType.value = typeMap[stroke.brush.type] ?? 0;

    // Set target tile and chunk offset.
    // 设置目标 tile 和 chunk 偏移
    this.targetTileX.value = tileX;
    this.targetTileZ.value = tileZ;
    this.chunkOffsetX.value = cx;
    this.chunkOffsetZ.value = cz;

    // Set neighbor tile coordinates for edge sampling (smooth brush).
    // 设置邻居 tile 坐标用于边缘采样（平滑画刷）
    // Each neighbor needs full (tileX, tileZ) coordinates in the atlas.
    // 每个邻居需要在图集中的完整 (tileX, tileZ) 坐标
    const neighborXNeg = this.getTileCoords(cx - 1, cz);
    const neighborXPos = this.getTileCoords(cx + 1, cz);
    const neighborZNeg = this.getTileCoords(cx, cz - 1);
    const neighborZPos = this.getTileCoords(cx, cz + 1);

    this.neighborXNeg_tileX.value = neighborXNeg ? neighborXNeg.tileX : -1;
    this.neighborXNeg_tileZ.value = neighborXNeg ? neighborXNeg.tileZ : -1;
    this.neighborXPos_tileX.value = neighborXPos ? neighborXPos.tileX : -1;
    this.neighborXPos_tileZ.value = neighborXPos ? neighborXPos.tileZ : -1;
    this.neighborZNeg_tileX.value = neighborZNeg ? neighborZNeg.tileX : -1;
    this.neighborZNeg_tileZ.value = neighborZNeg ? neighborZNeg.tileZ : -1;
    this.neighborZPos_tileX.value = neighborZPos ? neighborZPos.tileX : -1;
    this.neighborZPos_tileZ.value = neighborZPos ? neighborZPos.tileZ : -1;

    // Execute compute shader: A -> B (read from A, write to B)
    // 执行计算着色器：A -> B（从 A 读取，写入 B）
    await renderer.computeAsync(this.computeNodeAtoB!);

    // Copy result back: B -> A (so A always has latest data)
    // 复制结果回来：B -> A（使 A 始终有最新数据）
    await renderer.computeAsync(this.copyNodeBtoA!);
  }

  /**
   * Apply brush stroke without copying back (for batch processing).
   * 应用画刷笔触但不复制回来（用于批量处理）
   *
   * Use this when processing multiple chunks, then call copyTileBack for each.
   * 处理多个 chunk 时使用，然后为每个调用 copyTileBack
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
    if (!this.initialized) return;

    // Set all uniforms (same as applyBrushToChunk).
    // 设置所有 uniform（与 applyBrushToChunk 相同）
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

    // Set neighbor tile coordinates.
    // 设置邻居 tile 坐标
    const neighborXNeg = this.getTileCoords(cx - 1, cz);
    const neighborXPos = this.getTileCoords(cx + 1, cz);
    const neighborZNeg = this.getTileCoords(cx, cz - 1);
    const neighborZPos = this.getTileCoords(cx, cz + 1);

    this.neighborXNeg_tileX.value = neighborXNeg ? neighborXNeg.tileX : -1;
    this.neighborXNeg_tileZ.value = neighborXNeg ? neighborXNeg.tileZ : -1;
    this.neighborXPos_tileX.value = neighborXPos ? neighborXPos.tileX : -1;
    this.neighborXPos_tileZ.value = neighborXPos ? neighborXPos.tileZ : -1;
    this.neighborZNeg_tileX.value = neighborZNeg ? neighborZNeg.tileX : -1;
    this.neighborZNeg_tileZ.value = neighborZNeg ? neighborZNeg.tileZ : -1;
    this.neighborZPos_tileX.value = neighborZPos ? neighborZPos.tileX : -1;
    this.neighborZPos_tileZ.value = neighborZPos ? neighborZPos.tileZ : -1;

    // Execute compute shader: A -> B only (no copy back).
    // 仅执行计算着色器：A -> B（不复制回来）
    await renderer.computeAsync(this.computeNodeAtoB!);
  }

  /**
   * Copy a single tile from B back to A.
   * 将单个 tile 从 B 复制回 A
   */
  async copyTileBack(tileX: number, tileZ: number, renderer: WebGPURenderer): Promise<void> {
    if (!this.initialized) return;

    this.targetTileX.value = tileX;
    this.targetTileZ.value = tileZ;

    await renderer.computeAsync(this.copyNodeBtoA!);
  }

  /**
   * Stitch edges between two adjacent chunks.
   * 缝合两个相邻 chunk 之间的边缘
   *
   * @param cx1 First chunk X coordinate
   * @param cz1 First chunk Z coordinate
   * @param cx2 Second chunk X coordinate
   * @param cz2 Second chunk Z coordinate
   * @param renderer WebGPU renderer
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

    // Determine axis: X if cx differs, Z if cz differs.
    // 确定轴：如果 cx 不同则为 X，如果 cz 不同则为 Z
    const isXEdge = cx1 !== cx2;

    if (isXEdge) {
      // X edge: chunk with smaller cx is A, larger is B.
      // X 边：cx 较小的 chunk 是 A，较大的是 B
      const [tileA, tileB] = cx1 < cx2 ? [tile1, tile2] : [tile2, tile1];
      this.stitchTileA_X.value = tileA.tileX;
      this.stitchTileA_Z.value = tileA.tileZ;
      this.stitchTileB_X.value = tileB.tileX;
      this.stitchTileB_Z.value = tileB.tileZ;
      this.stitchAxis.value = 0;
    } else {
      // Z edge: chunk with smaller cz is A, larger is B.
      // Z 边：cz 较小的 chunk 是 A，较大的是 B
      const [tileA, tileB] = cz1 < cz2 ? [tile1, tile2] : [tile2, tile1];
      this.stitchTileA_X.value = tileA.tileX;
      this.stitchTileA_Z.value = tileA.tileZ;
      this.stitchTileB_X.value = tileB.tileX;
      this.stitchTileB_Z.value = tileB.tileZ;
      this.stitchAxis.value = 1;
    }

    await renderer.computeAsync(this.edgeStitchNode);
  }

  dispose(): void {
    // Only dispose the secondary buffer we created.
    // 只释放我们创建的次要缓冲区
    // Primary (heightTextureA) is owned by TerrainHeightCompute.
    // 主缓冲区 (heightTextureA) 由 TerrainHeightCompute 拥有
    this.heightTextureB = null;
    this.heightTextureA = null;
    this.computeNodeAtoB = null;
    this.copyNodeBtoA = null;
    this.edgeStitchNode = null;
    this.allocator = null;
    this.initialized = false;
  }
}
