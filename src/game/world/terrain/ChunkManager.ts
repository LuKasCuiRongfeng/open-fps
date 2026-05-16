// ChunkManager: GPU-first streaming chunk management.
// ChunkManager：GPU-first 流式分块管理

import type { Scene, WebGPURenderer, PerspectiveCamera, Texture } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import type { TerrainTextureArrayResult } from "./TerrainTextureArrays";
import { FloatingOrigin } from "../common/FloatingOrigin";
import { TerrainChunk, disposeSharedGeometries } from "./TerrainChunk";
import { hasAuthoredTerrainTextureData } from "./material/terrainMaterialTexturedArray";
import { TerrainHeightCompute, TerrainNormalCompute, TerrainBrushCompute } from "./gpu";
import { TerrainHeightSampler } from "./TerrainHeightSampler";
import type { BrushStroke } from "./brushTypes";
import { buildLoadQueue, buildUnloadQueue, getAffectedChunkBounds } from "./chunkStreaming";

export type ChunkCoord = { cx: number; cz: number };

/**
 * GPU-first chunk manager for map-file height chunks.
 * GPU-first 分块管理器，用于地图文件高度 chunk
 *
 * GPU-first design:
 * - Height data must come from loaded map files
 * - CPU height cache uploads to the GPU atlas on demand
 * - Brush edits read updated GPU height data back to the CPU cache
 *
 * GPU-first 设计：
 * - 高度数据必须来自已加载的地图文件
 * - CPU 高度缓存按需上传到 GPU 图集
 * - 画刷编辑后将更新后的 GPU 高度回读到 CPU 缓存
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

  // Chunks that need normal regeneration after upload or edits.
  // 上传或编辑后需要重新生成法线的 chunk
  private readonly normalPending = new Map<string, ChunkCoord>();

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

  // EN: Queue processing does GPU uploads; keep only one async batch active to avoid duplicated work and normal recompute storms.
  // 中文: 队列处理会执行 GPU 上传；只允许一个异步批次运行，避免重复工作和法线重算风暴。
  private queueProcessing = false;

  // Active chunk set revision for render systems that depend on terrain availability.
  // 活跃 chunk 集合版本号，供依赖地形可用性的渲染系统使用。
  private streamingRevision = 0;

  // EN: Only chunks declared by the loaded map manifest may stream or edit.
  // 中文: 只有已加载地图清单声明的 chunk 可以流式加载或编辑。
  private mapChunkKeys: ReadonlySet<string> = new Set();

  // Texture array data for terrain materials (from texture.json).
  // 地形材质的纹理数组数据（来自 texture.json）
  private textureArrays: TerrainTextureArrayResult | null = null;
  private splatMapTextures: (Texture | null)[] = [];
  private materialUsesAuthoredTextures = false;

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

  hasChunkAtWorldPosition(worldX: number, worldZ: number): boolean {
    const { cx, cz } = this.worldToChunk(worldX, worldZ);
    return this.chunks.has(this.chunkKey(cx, cz));
  }

  getStreamingRevision(): number {
    return this.streamingRevision;
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  setMapChunkKeys(keys: ReadonlySet<string>): void {
    this.mapChunkKeys = keys;
    this.loadQueue.length = 0;
    this.normalPending.clear();

    for (const key of Array.from(this.chunks.keys())) {
      if (!keys.has(key)) {
        this.unloadChunk(key);
      }
    }
  }

  private canUseChunk(cx: number, cz: number): boolean {
    return this.mapChunkKeys.has(this.chunkKey(cx, cz));
  }

  /**
   * Force load map chunks around a position.
   * 强制加载某位置周围的地图 chunk
   */
  async forceLoadAround(worldX: number, worldZ: number): Promise<void> {
    if (!this.gpuReady || !this.renderer) return;

    const { cx: centerCx, cz: centerCz } = this.worldToChunk(worldX, worldZ);
    this.lastPlayerCx = centerCx;
    this.lastPlayerCz = centerCz;
    this.rebuildQueues(centerCx, centerCz);
    await this.processQueuesIfIdle();
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

    // EN: Queue loads as soon as the camera enters a new chunk; hysteresis only delays unloads.
    // 中文: 相机进入新 chunk 就立即排入加载队列；滞后只用于延迟卸载。
    if (playerCx !== this.lastPlayerCx || playerCz !== this.lastPlayerCz) {
      this.lastPlayerCx = playerCx;
      this.lastPlayerCz = playerCz;
      this.rebuildQueues(playerCx, playerCz);
    }

    // Process load/unload operations in one async batch at a time.
    // 每次只运行一个异步批次来处理加载/卸载操作。
    await this.processQueuesIfIdle();

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
    const maxDist = viewDist + this.config.streaming.hysteresisChunks;

    this.loadQueue.length = 0;
    this.loadQueue.push(
      ...buildLoadQueue(
        playerCx,
        playerCz,
        viewDist,
        (key) => this.chunks.has(key),
        (key) => this.normalPending.has(key),
        (cx, cz) => this.chunkKey(cx, cz),
      ).filter(({ cx, cz }) => this.canUseChunk(cx, cz)),
    );

    this.unloadQueue.length = 0;
    this.unloadQueue.push(...buildUnloadQueue(playerCx, playerCz, maxDist, this.chunks));
  }

  private async processQueuesIfIdle(): Promise<void> {
    if (this.queueProcessing) return;

    this.queueProcessing = true;
    try {
      await this.processQueues();
    } finally {
      this.queueProcessing = false;
    }
  }

  private async processQueues(): Promise<void> {
    const maxOps = this.config.streaming.maxChunkOpsPerFrame;

    // EN: Load visible chunks first so editor panning fills newly exposed terrain promptly.
    // 中文: 优先加载可见 chunk，让编辑器平移时新暴露的地形能更快补上。
    const loadBatch: ChunkCoord[] = [];
    const loadBudget = this.loadQueue.length > 0 ? Math.max(1, Math.ceil(maxOps * 0.75)) : 0;
    while (this.loadQueue.length > 0 && loadBatch.length < loadBudget) {
      const coord = this.loadQueue.shift()!;
      loadBatch.push(coord);
    }
    await this.uploadAndCreateChunks(loadBatch);

    let ops = loadBatch.length;
    while (this.unloadQueue.length > 0 && ops < maxOps) {
      const key = this.unloadQueue.pop()!;
      this.unloadChunk(key);
      ops++;
    }

    // EN: Normal generation is throttled separately so loading a ring of chunks does not submit a compute burst in one frame.
    // 中文: 法线生成单独限流，避免加载一圈 chunk 时在同一帧提交一波计算任务。
    if (this.normalPending.size > 0 && this.renderer) {
      const normalBudget = loadBatch.length > 0 ? 1 : Math.max(1, maxOps);
      const normalBatch = Array.from(this.normalPending.values()).slice(0, normalBudget);
      await this.normalCompute.regenerateChunks(
        normalBatch,
        this.heightCompute.allocator,
        this.renderer,
      );
      for (const { cx, cz } of normalBatch) {
        this.normalPending.delete(this.chunkKey(cx, cz));
      }
    }
  }

  private async uploadAndCreateChunks(coords: ChunkCoord[]): Promise<void> {
    if (!this.renderer) return;
    if (coords.length === 0) return;

    const accepted: ChunkCoord[] = [];
    const batchData: Array<{ cx: number; cz: number; heightData: Float32Array }> = [];
    const expectedHeightCount = this.config.gpuCompute.tileResolution * this.config.gpuCompute.tileResolution;
    let availableTiles = this.heightCompute.allocator.freeCount;

    for (const { cx, cz } of coords) {
      if (!this.canUseChunk(cx, cz)) continue;

      const key = this.chunkKey(cx, cz);
      if (this.chunks.has(key)) continue;

      const cachedHeightData = TerrainHeightSampler.getChunkHeightData(cx, cz);
      if (!cachedHeightData) {
        // EN: Missing map height data is an asset error; runtime must not synthesize replacement terrain.
        // 中文: 缺少地图高度数据是资源错误；运行时不能合成替代地形。
        console.warn(`[ChunkManager] Missing saved height data for map chunk (${cx}, ${cz})`);
        continue;
      }

      if (cachedHeightData.length !== expectedHeightCount) {
        console.warn(`[ChunkManager] Invalid height data size for map chunk (${cx}, ${cz})`);
        continue;
      }

      if (!this.heightCompute.allocator.hasTile(cx, cz)) {
        if (availableTiles <= 0) {
          console.warn(`[ChunkManager] No terrain height atlas tile available for chunk (${cx}, ${cz})`);
          continue;
        }
        availableTiles--;
      }

      accepted.push({ cx, cz });
      batchData.push({ cx, cz, heightData: cachedHeightData });
      this.normalPending.set(key, { cx, cz });
    }

    if (batchData.length === 0) return;

    await this.heightCompute.uploadChunksBatch(batchData, this.renderer);

    // EN: Brush compute keeps a readable copy of the height atlas; map chunk uploads invalidate it.
    // 中文: 画刷计算保留高度图集的可读副本；地图 chunk 上传会使其失效。
    this.brushCompute.markNeedsSync();

    for (const { cx, cz } of accepted) {
      this.createChunkMesh(cx, cz);
    }
  }

  private createChunkMesh(cx: number, cz: number): void {
    const key = this.chunkKey(cx, cz);
    if (this.chunks.has(key)) return;
    if (!this.heightCompute.allocator.hasTile(cx, cz)) {
      this.normalPending.delete(key);
      return;
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
      this.materialUsesAuthoredTextures ? this.textureArrays : null,
      this.materialUsesAuthoredTextures ? this.splatMapTextures : [],
    );

    this.chunks.set(key, chunk);
    this.scene.add(chunk.mesh);
    this.streamingRevision += 1;
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
    this.streamingRevision += 1;
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

    const bounds = getAffectedChunkBounds(strokes, chunkSize);
    if (!bounds) return;

    // Collect affected chunks from merged bounding box (single pass).
    // 从合并的包围盒收集受影响的 chunk（单次遍历）
    for (let cx = bounds.minCx; cx <= bounds.maxCx; cx++) {
      for (let cz = bounds.minCz; cz <= bounds.maxCz; cz++) {
        if (!this.canUseChunk(cx, cz)) continue;

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
      TerrainHeightSampler.setChunkHeightData(chunk.cx, chunk.cz, heightData, true);
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
    textureArrays: TerrainTextureArrayResult | null,
    splatMapTextures: (Texture | null)[],
  ): void {
    const wasUsingAuthoredTextures = this.materialUsesAuthoredTextures;
    this.textureArrays = textureArrays;
    this.splatMapTextures = splatMapTextures;
    this.materialUsesAuthoredTextures = hasAuthoredTerrainTextureData(textureArrays, splatMapTextures);

    if (!wasUsingAuthoredTextures && !this.materialUsesAuthoredTextures) {
      return;
    }

    // Recreate all existing chunk materials with new texture arrays.
    // 使用新纹理数组重新创建所有现有 chunk 的材质
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
      chunk.rebuildMaterial(this.textureArrays, this.splatMapTextures);
    }
  }
}
