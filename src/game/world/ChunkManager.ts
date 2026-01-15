// ChunkManager: streaming chunk management for large terrain.
// ChunkManager：大地形的流式分块管理

import type { Scene } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import { FloatingOrigin } from "./FloatingOrigin";
import { TerrainChunk } from "./TerrainChunk";

export type ChunkCoord = { cx: number; cz: number };

/**
 * Manages terrain chunk loading/unloading based on player position.
 * 根据玩家位置管理地形 chunk 的加载/卸载
 */
export class ChunkManager {
  private readonly config: TerrainConfig;
  private readonly scene: Scene;
  private readonly floatingOrigin: FloatingOrigin;

  // Active chunks keyed by "cx,cz".
  // 活跃 chunk，键为 "cx,cz"
  private readonly chunks = new Map<string, TerrainChunk>();

  // Pending load/unload queues.
  // 待加载/卸载队列
  private readonly loadQueue: ChunkCoord[] = [];
  private readonly unloadQueue: string[] = [];

  // Last known player chunk for hysteresis.
  // 上次已知的玩家 chunk，用于滞后判断
  private lastPlayerCx = 0;
  private lastPlayerCz = 0;

  constructor(
    config: TerrainConfig,
    scene: Scene,
    floatingOrigin: FloatingOrigin,
  ) {
    this.config = config;
    this.scene = scene;
    this.floatingOrigin = floatingOrigin;
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

  /**
   * Convert chunk coordinates to world center.
   * 将 chunk 坐标转换为世界中心点
   */
  chunkToWorld(cx: number, cz: number): { x: number; z: number } {
    const size = this.config.streaming.chunkSizeMeters;
    return {
      x: (cx + 0.5) * size,
      z: (cz + 0.5) * size,
    };
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /**
   * Update chunk loading based on player world position.
   * 根据玩家世界位置更新 chunk 加载
   *
   * @param playerWorldX Player X in world space (before floating origin offset).
   * @param playerWorldZ Player Z in world space (before floating origin offset).
   */
  update(playerWorldX: number, playerWorldZ: number): void {
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
    this.processQueues();
  }

  private rebuildQueues(playerCx: number, playerCz: number): void {
    const viewDist = this.config.streaming.viewDistanceChunks;

    // Determine which chunks should be loaded.
    // 确定应该加载哪些 chunk
    const shouldBeLoaded = new Set<string>();

    for (let dz = -viewDist; dz <= viewDist; dz++) {
      for (let dx = -viewDist; dx <= viewDist; dx++) {
        // Use circular distance for more natural loading.
        // 使用圆形距离以获得更自然的加载
        if (dx * dx + dz * dz <= viewDist * viewDist) {
          const cx = playerCx + dx;
          const cz = playerCz + dz;
          shouldBeLoaded.add(this.chunkKey(cx, cz));
        }
      }
    }

    // Queue chunks to unload (currently loaded but out of range).
    // 队列待卸载的 chunk（当前已加载但超出范围）
    this.unloadQueue.length = 0;
    for (const key of this.chunks.keys()) {
      if (!shouldBeLoaded.has(key)) {
        this.unloadQueue.push(key);
      }
    }

    // Queue chunks to load (in range but not loaded).
    // 队列待加载的 chunk（在范围内但未加载）
    this.loadQueue.length = 0;
    for (const key of shouldBeLoaded) {
      if (!this.chunks.has(key)) {
        const [cxStr, czStr] = key.split(",");
        this.loadQueue.push({ cx: parseInt(cxStr, 10), cz: parseInt(czStr, 10) });
      }
    }

    // Sort load queue by distance to player (load closest first).
    // 按与玩家的距离排序加载队列（先加载最近的）
    this.loadQueue.sort((a, b) => {
      const distA = (a.cx - playerCx) ** 2 + (a.cz - playerCz) ** 2;
      const distB = (b.cx - playerCx) ** 2 + (b.cz - playerCz) ** 2;
      return distA - distB;
    });
  }

  private processQueues(): void {
    const maxOps = this.config.streaming.maxChunkOpsPerFrame;
    let ops = 0;

    // Prioritize unloading to free memory.
    // 优先卸载以释放内存
    while (ops < maxOps && this.unloadQueue.length > 0) {
      const key = this.unloadQueue.shift()!;
      this.unloadChunk(key);
      ops++;
    }

    // Then load new chunks.
    // 然后加载新 chunk
    while (ops < maxOps && this.loadQueue.length > 0) {
      const coord = this.loadQueue.shift()!;
      this.loadChunk(coord.cx, coord.cz);
      ops++;
    }
  }

  private loadChunk(cx: number, cz: number): void {
    const key = this.chunkKey(cx, cz);
    if (this.chunks.has(key)) return;

    const chunk = new TerrainChunk(
      cx,
      cz,
      this.config,
      this.floatingOrigin,
    );
    this.chunks.set(key, chunk);
    this.scene.add(chunk.mesh);
  }

  private unloadChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    this.scene.remove(chunk.mesh);
    chunk.dispose();
    this.chunks.delete(key);
  }

  /**
   * Get all active chunks for GPU culling/rendering.
   * 获取所有活跃 chunk 用于 GPU 剔除/渲染
   */
  getActiveChunks(): TerrainChunk[] {
    return Array.from(this.chunks.values());
  }

  /**
   * Get chunk count for debugging.
   * 获取 chunk 数量用于调试
   */
  getChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Force immediate loading of chunks around a position (for initial spawn).
   * 强制立即加载某位置周围的 chunk（用于初始出生）
   */
  forceLoadAround(worldX: number, worldZ: number): void {
    const { cx: playerCx, cz: playerCz } = this.worldToChunk(worldX, worldZ);
    this.lastPlayerCx = playerCx;
    this.lastPlayerCz = playerCz;

    const viewDist = this.config.streaming.viewDistanceChunks;

    for (let dz = -viewDist; dz <= viewDist; dz++) {
      for (let dx = -viewDist; dx <= viewDist; dx++) {
        if (dx * dx + dz * dz <= viewDist * viewDist) {
          const cx = playerCx + dx;
          const cz = playerCz + dz;
          this.loadChunk(cx, cz);
        }
      }
    }
  }

  /**
   * Dispose all chunks and clear state.
   * 销毁所有 chunk 并清理状态
   */
  dispose(): void {
    for (const chunk of this.chunks.values()) {
      this.scene.remove(chunk.mesh);
      chunk.dispose();
    }
    this.chunks.clear();
    this.loadQueue.length = 0;
    this.unloadQueue.length = 0;
  }
}
