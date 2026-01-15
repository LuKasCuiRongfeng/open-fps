// ChunkManager: GPU-first streaming chunk management.
// ChunkManager：GPU-first 流式分块管理

import type { Scene, WebGPURenderer, PerspectiveCamera } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import { FloatingOrigin } from "./FloatingOrigin";
import { TerrainChunk, disposeSharedGeometries } from "./TerrainChunk";
import { TerrainHeightCompute, TerrainNormalCompute } from "./gpu";
import { TerrainHeightSampler } from "./TerrainHeightSampler";

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

  constructor(config: TerrainConfig, scene: Scene, floatingOrigin: FloatingOrigin) {
    this.config = config;
    this.scene = scene;
    this.floatingOrigin = floatingOrigin;

    // Create compute pipelines.
    // 创建计算管线
    this.heightCompute = new TerrainHeightCompute(config);
    this.normalCompute = new TerrainNormalCompute(config);
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

    // Collect all chunks to load.
    // 收集所有要加载的 chunk
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

    // Find chunks to load.
    // 找到要加载的 chunk
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

    // Bake height for this chunk on GPU.
    // 在 GPU 上为此 chunk 烘焙高度
    await this.heightCompute.bakeChunk(cx, cz, this.renderer);
    this.bakePending.set(key, { cx, cz });

    // GPU-first: readback height data to CPU cache (ONCE per chunk).
    // GPU-first：回读高度数据到 CPU 缓存（每 chunk 一次）
    const heightData = await this.heightCompute.readbackChunkHeight(cx, cz, this.renderer);
    TerrainHeightSampler.setChunkHeightData(cx, cz, heightData);

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

    this.chunks.set(key, chunk);
    this.scene.add(chunk.mesh);
  }

  private unloadChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    // Remove from CPU height cache.
    // 从 CPU 高度缓存移除
    TerrainHeightSampler.removeChunkHeightData(chunk.cx, chunk.cz);

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

    // Dispose shared geometries.
    // 释放共享几何体
    disposeSharedGeometries();

    this.gpuReady = false;
    this.renderer = null;
  }
}
