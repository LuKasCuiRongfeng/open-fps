// ChunkManager: GPU-first streaming chunk management.
// ChunkManager：GPU-first 流式分块管理

import type { Scene, WebGPURenderer, PerspectiveCamera, Texture } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import type { TerrainTextureResult } from "./TerrainTextures";
import { FloatingOrigin } from "../FloatingOrigin";
import { TerrainChunk, disposeSharedGeometries } from "./TerrainChunk";
import { TerrainHeightCompute, TerrainNormalCompute, TerrainBrushCompute } from "./gpu";
import { TerrainHeightSampler } from "./TerrainHeightSampler";
import type { BrushStroke } from "../../editor/terrain/TerrainEditor";

export type ChunkCoord = { cx: number; cz: number };

/**
 * GPU-first chunk manager with compute-based height baking.
 * GPU-first 分块管理器，带基于计算的高度烘焙
 *
 * GPU-first design:
 * - Height computed ONLY on GPU
 * - After bake, height data read back ONCE to CPU cache
 * - CPU heightAt() samples from this cache (no duplicate noise)
 *
 * GPU-first 设计：
 * - 高度仅在 GPU 上计算
 * - 烘焙后，高度数据回读一次到 CPU 缓存
 * - CPU heightAt() 从此缓存采样（无重复噪声实现）
 *
 * Frustum culling is handled by Three.js built-in culling (GPU-optimized).
 * 视锥剔除由 Three.js 内置剔除处理（已 GPU 优化）
 */
export class ChunkManager {
  private readonly config: TerrainConfig;
  private readonly scene: Scene;
  private readonly floatingOrigin: FloatingOrigin;

  // GPU compute pipelines.
  // GPU 计算管线
  private heightCompute: TerrainHeightCompute;
  private normalCompute: TerrainNormalCompute;
  private brushCompute: TerrainBrushCompute;

  // Active chunks keyed by "cx,cz".
  // 活跃 chunk，键为 "cx,cz"
  private readonly chunks = new Map<string, TerrainChunk>();

  // Pending load/unload queues.
  // 待加载/卸载队列
  private readonly loadQueue: ChunkCoord[] = [];
  private readonly unloadQueue: string[] = [];

  // Chunks that need height baking.
  // 需要高度烘焙的 chunk
  private readonly bakePending = new Map<string, ChunkCoord>();

  // Last known player chunk for hysteresis.
  // 上次已知的玩家 chunk，用于滞后判断
  private lastPlayerCx = 0;
  private lastPlayerCz = 0;

  // Renderer reference for async compute.
  // 用于异步计算的渲染器引用
  private renderer: WebGPURenderer | null = null;

  // GPU initialization state.
  // GPU 初始化状态
  private gpuReady = false;

  // Texture data for terrain materials (from texture.json).
  // 地形材质的纹理数据（来自 texture.json）
  private textureResult: TerrainTextureResult | null = null;
  private splatMapTexture: Texture | null = null;

  constructor(config: TerrainConfig, scene: Scene, floatingOrigin: FloatingOrigin) {
    this.config = config;
    this.scene = scene;
    this.floatingOrigin = floatingOrigin;

    // Create compute pipelines.
    // 创建计算管线
    this.heightCompute = new TerrainHeightCompute(config);
    this.normalCompute = new TerrainNormalCompute(config);
    this.brushCompute = new TerrainBrushCompute(config);
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   */
  async initGpu(renderer: WebGPURenderer): Promise<void> {
    this.renderer = renderer;

    // Initialize height compute.
    // 初始化高度计算
    await this.heightCompute.init(renderer);

    // Initialize normal compute with height texture.
    // 使用高度纹理初始化法线计算
    await this.normalCompute.init(renderer, this.heightCompute.heightTexture!);

    // Initialize brush compute with height texture and allocator.
    // 使用高度纹理和分配器初始化画刷计算
    await this.brushCompute.init(
      renderer,
      this.heightCompute.heightTexture!,
      this.heightCompute.allocator
    );

    this.gpuReady = true;
  }

  /**
   * Convert world position to chunk coordinates.
   * 将世界坐标转换为 chunk 坐标
   */
  worldToChunk(worldX: number, worldZ: number): ChunkCoord {
    const size = this.config.streaming.chunkSizeMeters;
    return {
      cx: Math.floor(worldX / size),
      cz: Math.floor(worldZ / size),
    };
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /**
   * Force load chunks around a position (for spawn).
   * 强制加载某位置周围的 chunk（用于出生点）
   */
  async forceLoadAround(worldX: number, worldZ: number): Promise<void> {
    if (!this.gpuReady || !this.renderer) return;

    const { cx: centerCx, cz: centerCz } = this.worldToChunk(worldX, worldZ);
    const viewDist = this.config.streaming.viewDistanceChunks;

    // Collect all chunks to load (based on view distance).
    // 收集所有要加载的 chunk（基于视距）
    const toLoad: ChunkCoord[] = [];
    for (let dz = -viewDist; dz <= viewDist; dz++) {
      for (let dx = -viewDist; dx <= viewDist; dx++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const key = this.chunkKey(cx, cz);
        if (!this.chunks.has(key)) {
          toLoad.push({ cx, cz });
        }
      }
    }

    // Bake and create all chunks.
    // 烘焙并创建所有 chunk
    for (const coord of toLoad) {
      await this.bakeAndCreateChunk(coord.cx, coord.cz);
    }

    // Regenerate all normals after baking.
    // 烘焙后重新生成所有法线
    await this.normalCompute.regenerate(this.renderer);

    this.lastPlayerCx = centerCx;
    this.lastPlayerCz = centerCz;
  }

  /**
   * Update chunk streaming based on player world position.
   * 根据玩家世界位置更新 chunk 流式加载
   *
   * Frustum culling is handled automatically by Three.js (mesh.frustumCulled = true).
   * 视锥剔除由 Three.js 自动处理（mesh.frustumCulled = true）
   */
  async update(
    playerWorldX: number,
    playerWorldZ: number,
    _camera: PerspectiveCamera,
  ): Promise<void> {
    if (!this.gpuReady || !this.renderer) return;

    const { cx: playerCx, cz: playerCz } = this.worldToChunk(playerWorldX, playerWorldZ);

    // Check if player moved to a different chunk (with hysteresis).
    // 检查玩家是否移动到不同的 chunk（带滞后）
    const hysteresis = this.config.streaming.hysteresisChunks;
    const dx = Math.abs(playerCx - this.lastPlayerCx);
    const dz = Math.abs(playerCz - this.lastPlayerCz);

    if (dx > hysteresis || dz > hysteresis) {
      this.lastPlayerCx = playerCx;
      this.lastPlayerCz = playerCz;
      this.rebuildQueues(playerCx, playerCz);
    }

    // Process load/unload operations (limited per frame).
    // 处理加载/卸载操作（每帧有限）
    await this.processQueues();

    // Update LOD for all chunks based on player position.
    // 根据玩家位置更新所有 chunk 的 LOD
    for (const chunk of this.chunks.values()) {
      chunk.updateLod(playerWorldX, playerWorldZ);
    }

    // Note: Frustum culling is now handled by Three.js built-in culling.
    // Each chunk's mesh has frustumCulled = true with a properly sized bounding sphere.
    // 注意：视锥剔除现在由 Three.js 内置剔除处理。
    // 每个 chunk 的 mesh 设置了 frustumCulled = true 并有正确大小的包围球。
  }

  private rebuildQueues(playerCx: number, playerCz: number): void {
    const viewDist = this.config.streaming.viewDistanceChunks;

    // Find chunks to load (based on view distance around player).
    // 找到要加载的 chunk（基于玩家周围的视距）
    // No world bounds check here - chunks can extend beyond playable area.
    // 此处不检查世界边界 - chunk 可以延伸到可玩区域之外
    // Player movement is restricted by worldBoundsSystem separately.
    // 玩家移动由 worldBoundsSystem 单独限制
    this.loadQueue.length = 0;
    
    for (let dz = -viewDist; dz <= viewDist; dz++) {
      for (let dx = -viewDist; dx <= viewDist; dx++) {
        const cx = playerCx + dx;
        const cz = playerCz + dz;
        const key = this.chunkKey(cx, cz);
        if (!this.chunks.has(key) && !this.bakePending.has(key)) {
          this.loadQueue.push({ cx, cz });
        }
      }
    }

    // Sort by distance (load closer chunks first).
    // 按距离排序（先加载更近的 chunk）
    this.loadQueue.sort((a, b) => {
      const da = (a.cx - playerCx) ** 2 + (a.cz - playerCz) ** 2;
      const db = (b.cx - playerCx) ** 2 + (b.cz - playerCz) ** 2;
      return da - db;
    });

    // Find chunks to unload.
    // 找到要卸载的 chunk
    this.unloadQueue.length = 0;
    const maxDist = viewDist + this.config.streaming.hysteresisChunks;
    for (const [key, chunk] of this.chunks) {
      const chunkDx = Math.abs(chunk.cx - playerCx);
      const chunkDz = Math.abs(chunk.cz - playerCz);
      if (chunkDx > maxDist || chunkDz > maxDist) {
        this.unloadQueue.push(key);
      }
    }
  }

  private async processQueues(): Promise<void> {
    const maxOps = this.config.streaming.maxChunkOpsPerFrame;
    let ops = 0;

    // Process unloads first (free memory).
    // 先处理卸载（释放内存）
    while (this.unloadQueue.length > 0 && ops < maxOps) {
      const key = this.unloadQueue.pop()!;
      this.unloadChunk(key);
      ops++;
    }

    // Process loads.
    // 处理加载
    while (this.loadQueue.length > 0 && ops < maxOps) {
      const coord = this.loadQueue.shift()!;
      await this.bakeAndCreateChunk(coord.cx, coord.cz);
      ops++;
    }

    // Regenerate normals if any chunks were baked.
    // 如果有 chunk 被烘焙，重新生成法线
    if (this.bakePending.size > 0 && this.renderer) {
      await this.normalCompute.regenerate(this.renderer);
      this.bakePending.clear();
    }
  }

  private async bakeAndCreateChunk(cx: number, cz: number): Promise<void> {
    if (!this.renderer) return;

    const key = this.chunkKey(cx, cz);
    if (this.chunks.has(key)) return;

    // Check if we have cached height data from previous edits.
    // 检查是否有之前编辑的缓存高度数据
    const cachedHeightData = TerrainHeightSampler.getChunkHeightData(cx, cz);

    if (cachedHeightData) {
      // Reuse cached data: upload to GPU instead of regenerating.
      // 重用缓存数据：上传到 GPU 而不是重新生成
      // This preserves edits when player returns to a previously edited chunk.
      // 这在玩家返回之前编辑过的 chunk 时保留编辑内容
      await this.heightCompute.bakeChunk(cx, cz, this.renderer);
      this.bakePending.set(key, { cx, cz });

      // Upload cached height data to GPU.
      // 上传缓存的高度数据到 GPU
      await this.heightCompute.uploadChunkHeight(cx, cz, cachedHeightData, this.renderer);
    } else {
      // No cached data: generate procedural terrain on GPU.
      // 无缓存数据：在 GPU 上生成程序地形
      await this.heightCompute.bakeChunk(cx, cz, this.renderer);
      this.bakePending.set(key, { cx, cz });

      // GPU-first: readback height data to CPU cache (ONCE per chunk).
      // GPU-first：回读高度数据到 CPU 缓存（每 chunk 一次）
      const heightData = await this.heightCompute.readbackChunkHeight(cx, cz, this.renderer);
      TerrainHeightSampler.setChunkHeightData(cx, cz, heightData);
    }

    // Get tile UV info.
    // 获取 tile UV 信息
    const tileInfo = this.heightCompute.getChunkTileUV(cx, cz);

    // Create chunk with GPU textures.
    // 使用 GPU 纹理创建 chunk
    const chunk = new TerrainChunk(
      cx,
      cz,
      this.config,
      this.floatingOrigin,
      this.heightCompute.heightTexture!,
      this.normalCompute.normalTexture!,
      tileInfo,
    );

    // If we have texture data loaded, apply it to the new chunk.
    // 如果已加载纹理数据，将其应用到新 chunk
    if (this.textureResult || this.splatMapTexture) {
      chunk.rebuildMaterial(this.textureResult, this.splatMapTexture);
    }

    this.chunks.set(key, chunk);
    this.scene.add(chunk.mesh);
  }

  private unloadChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    // Free the tile in the height atlas (dynamic allocation).
    // 释放高度图集中的 tile（动态分配）
    this.heightCompute.freeTile(chunk.cx, chunk.cz);

    // NOTE: Do NOT remove CPU height cache here!
    // 注意：此处不要移除 CPU 高度缓存！
    // In editable mode, we need to preserve edited data so it can be
    // reloaded when the player returns to this chunk.
    // 在可编辑模式下，我们需要保留编辑数据，以便玩家返回此 chunk 时可以重新加载。
    // The cache will be cleared when starting a new game or loading a different map.
    // 缓存将在开始新游戏或加载不同地图时清除。

    this.scene.remove(chunk.mesh);
    chunk.dispose();
    this.chunks.delete(key);
  }

  /**
   * Get all active chunks.
   * 获取所有活跃的 chunk
   */
  getActiveChunks(): TerrainChunk[] {
    return Array.from(this.chunks.values());
  }

  /**
   * Apply brush strokes to affected chunks.
   * 将画刷笔触应用到受影响的 chunk
   *
   * GPU-first: modifies height texture directly on GPU.
   * GPU-first：直接在 GPU 上修改高度纹理
   *
   * Includes edge stitching to prevent seams between chunks.
   * 包含边缘缝合以防止 chunk 之间的裂缝
   *
   * Processing order:
   * 1. Sync secondary buffer (B = A) so all chunks read consistent data
   * 2. Apply brush to all affected chunks (read from A, write to B)
   * 3. Copy all results back (B -> A)
   * 4. Stitch edges to ensure boundary consistency
   *
   * 处理顺序：
   * 1. 同步次要缓冲区（B = A）使所有 chunk 读取一致的数据
   * 2. 对所有受影响的 chunk 应用画刷（从 A 读取，写入 B）
   * 3. 将所有结果复制回来（B -> A）
   * 4. 缝合边缘以确保边界一致性
   */
  async applyBrushStrokes(strokes: BrushStroke[]): Promise<void> {
    if (!this.gpuReady || !this.renderer || strokes.length === 0) return;

    const chunkSize = this.config.streaming.chunkSizeMeters;
    const affectedChunks = new Set<string>();
    const affectedCoords: Array<{ cx: number; cz: number; tileX: number; tileZ: number }> = [];

    // Pre-compute flatten target height if needed (sample from brush center).
    // 如果需要，预计算 flatten 目标高度（从画刷中心采样）
    let flattenTargetHeight = 0;
    if (strokes.length > 0 && strokes[0].brush.type === "flatten") {
      const stroke = strokes[0];
      flattenTargetHeight = TerrainHeightSampler.heightAt(
        stroke.worldX,
        stroke.worldZ,
        this.config
      );
    }

    // Compute bounding box of all strokes (merge ranges).
    // 计算所有 strokes 的包围盒（合并范围）
    let minCx = Infinity, maxCx = -Infinity;
    let minCz = Infinity, maxCz = -Infinity;

    for (const stroke of strokes) {
      const radius = stroke.brush.radiusMeters;
      minCx = Math.min(minCx, Math.floor((stroke.worldX - radius) / chunkSize));
      maxCx = Math.max(maxCx, Math.floor((stroke.worldX + radius) / chunkSize));
      minCz = Math.min(minCz, Math.floor((stroke.worldZ - radius) / chunkSize));
      maxCz = Math.max(maxCz, Math.floor((stroke.worldZ + radius) / chunkSize));
    }

    // Collect affected chunks from merged bounding box (single pass).
    // 从合并的包围盒收集受影响的 chunk（单次遍历）
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = this.chunkKey(cx, cz);
        if (this.chunks.has(key)) {
          affectedChunks.add(key);
          const tileInfo = this.heightCompute.getChunkTileUV(cx, cz);
          const tileX = Math.round(tileInfo.uOffset * this.config.gpuCompute.atlasTilesPerSide);
          const tileZ = Math.round(tileInfo.vOffset * this.config.gpuCompute.atlasTilesPerSide);
          affectedCoords.push({ cx, cz, tileX, tileZ });
        }
      }
    }

    if (affectedCoords.length === 0) return;

    // Ensure readable texture is synced before first brush operation.
    // 确保在第一次画刷操作前同步可读纹理
    this.brushCompute.ensureSynced(this.renderer!);

    // Apply brush to all chunks without syncing between operations.
    // 对所有 chunk 应用画刷，操作之间不同步
    for (const stroke of strokes) {
      for (const { cx, cz, tileX, tileZ } of affectedCoords) {
        await this.brushCompute.applyBrushToChunkNoCopy(
          cx, cz, tileX, tileZ, stroke, flattenTargetHeight, this.renderer!
        );
      }
    }

    // Sync readable texture after all brush operations.
    // 所有画刷操作后同步可读纹理
    this.brushCompute.syncReadableTexture(this.renderer!);

    // Step 4: Stitch edges between affected chunks and their neighbors.
    // 步骤 4：缝合受影响 chunk 与其邻居之间的边缘
    const stitchedEdges = new Set<string>();
    for (const { cx, cz } of affectedCoords) {
      const neighbors = [
        { ncx: cx + 1, ncz: cz },
        { ncx: cx - 1, ncz: cz },
        { ncx: cx, ncz: cz + 1 },
        { ncx: cx, ncz: cz - 1 },
      ];

      for (const { ncx, ncz } of neighbors) {
        const neighborKey = this.chunkKey(ncx, ncz);
        if (!this.chunks.has(neighborKey)) continue;

        const edgeKey = cx < ncx || (cx === ncx && cz < ncz)
          ? `${cx},${cz}-${ncx},${ncz}`
          : `${ncx},${ncz}-${cx},${cz}`;

        if (!stitchedEdges.has(edgeKey)) {
          stitchedEdges.add(edgeKey);
          await this.brushCompute.stitchEdge(cx, cz, ncx, ncz, this.renderer!);
        }
      }
    }

    // Readback updated height data for affected chunks.
    // 回读受影响 chunk 的更新高度数据
    for (const key of affectedChunks) {
      const chunk = this.chunks.get(key)!;
      const heightData = await this.heightCompute.readbackChunkHeight(
        chunk.cx, chunk.cz, this.renderer!
      );
      TerrainHeightSampler.setChunkHeightData(chunk.cx, chunk.cz, heightData);
    }

    // Regenerate normals for affected chunks.
    // 重新生成受影响 chunk 的法线
    if (affectedChunks.size > 0) {
      await this.normalCompute.regenerate(this.renderer!);
    }
  }

  /**
   * Reupload all active chunks from CPU cache to GPU.
   * 从 CPU 缓存重新上传所有活跃 chunk 到 GPU
   *
   * Used after loading a map file.
   * 加载地图文件后使用
   */
  async reuploadAllChunks(): Promise<void> {
    if (!this.gpuReady || !this.renderer) return;

    const chunksToUpload: Array<{ cx: number; cz: number }> = [];
    for (const chunk of this.chunks.values()) {
      chunksToUpload.push({ cx: chunk.cx, cz: chunk.cz });
    }

    await this.reuploadChunks(chunksToUpload);
  }

  /**
   * Reupload specific chunks from CPU cache to GPU.
   * 从 CPU 缓存重新上传指定 chunk 到 GPU
   *
   * Workflow:
   * 1. Get height data from TerrainHeightSampler
   * 2. Upload to GPU height texture
   * 3. Regenerate normals
   *
   * 工作流程：
   * 1. 从 TerrainHeightSampler 获取高度数据
   * 2. 上传到 GPU 高度纹理
   * 3. 重新生成法线
   */
  async reuploadChunks(chunks: Array<{ cx: number; cz: number }>): Promise<void> {
    if (!this.gpuReady || !this.renderer || chunks.length === 0) return;

    // Collect all chunks with their height data for batch upload.
    // 收集所有 chunk 及其高度数据以进行批量上传
    const batchData: Array<{ cx: number; cz: number; heightData: Float32Array }> = [];

    for (const { cx, cz } of chunks) {
      const key = this.chunkKey(cx, cz);
      if (!this.chunks.has(key)) continue;

      // Get height data from CPU cache.
      // 从 CPU 缓存获取高度数据
      const heightData = TerrainHeightSampler.getChunkHeightData(cx, cz);
      if (!heightData) {
        console.warn(`[ChunkManager] No height data for chunk (${cx}, ${cz})`);
        continue;
      }

      batchData.push({ cx, cz, heightData });
    }

    // Batch upload all chunks at once.
    // 一次性批量上传所有 chunk
    await this.heightCompute.uploadChunksBatch(batchData, this.renderer!);

    // Mark brush compute as needing sync (terrain data changed).
    // 标记画刷计算需要同步（地形数据已更改）
    this.brushCompute.markNeedsSync();

    // Regenerate normals after uploading.
    // 上传后重新生成法线
    await this.normalCompute.regenerate(this.renderer!);
  }

  /**
   * Dispose all resources.
   * 释放所有资源
   */
  dispose(): void {
    // Dispose all chunks.
    // 释放所有 chunk
    for (const chunk of this.chunks.values()) {
      this.scene.remove(chunk.mesh);
      chunk.dispose();
    }
    this.chunks.clear();

    // Dispose compute pipelines.
    // 释放计算管线
    this.heightCompute.dispose();
    this.normalCompute.dispose();
    this.brushCompute.dispose();

    // Dispose shared geometries.
    // 释放共享几何体
    disposeSharedGeometries();

    this.gpuReady = false;
    this.renderer = null;
  }

  /**
   * Set texture data for terrain materials.
   * 设置地形材质的纹理数据
   *
   * This should be called after loading texture.json from a project.
   * 加载项目的 texture.json 后调用此方法
   */
  setTextureData(
    textureResult: TerrainTextureResult | null,
    splatMapTexture: Texture | null,
  ): void {
    this.textureResult = textureResult;
    this.splatMapTexture = splatMapTexture;

    // Recreate all existing chunk materials with new textures.
    // 使用新纹理重新创建所有现有 chunk 的材质
    if (this.gpuReady) {
      this.rebuildAllChunkMaterials();
    }
  }

  /**
   * Rebuild materials for all active chunks with current texture data.
   * 使用当前纹理数据重建所有活跃 chunk 的材质
   */
  private rebuildAllChunkMaterials(): void {
    for (const chunk of this.chunks.values()) {
      chunk.rebuildMaterial(this.textureResult, this.splatMapTexture);
    }
  }
}
