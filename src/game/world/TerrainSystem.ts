// TerrainSystem: GPU-first facade for the streaming terrain system.
// TerrainSystem：GPU-first 流式地形系统的门面

import { Group } from "three/webgpu";
import type { Scene, WebGPURenderer, PerspectiveCamera } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import { ChunkManager } from "./ChunkManager";
import { FloatingOrigin } from "./FloatingOrigin";
import { TerrainHeightSampler } from "./TerrainHeightSampler";

export type TerrainSystemResource = {
  root: Group;
  heightAt: (xMeters: number, zMeters: number) => number;
  floatingOrigin: FloatingOrigin;
  initGpu: (renderer: WebGPURenderer, spawnX?: number, spawnZ?: number) => Promise<void>;
  update: (playerWorldX: number, playerWorldZ: number, camera: PerspectiveCamera) => void;
  dispose: () => void;
};

/**
 * Create the GPU-first streaming terrain system.
 * 创建 GPU-first 流式地形系统
 *
 * Architecture:
 * - Height generation: GPU compute shader → StorageTexture atlas
 * - Normal generation: GPU compute shader → StorageTexture atlas
 * - Vertex displacement: GPU vertex shader samples from height texture
 * - Frustum culling: GPU compute shader → visibility buffer
 * - LOD: Shared geometries with different tessellation
 * - Height queries: CPU proxy with cache (for gameplay)
 *
 * 架构：
 * - 高度生成：GPU 计算着色器 → StorageTexture 图集
 * - 法线生成：GPU 计算着色器 → StorageTexture 图集
 * - 顶点位移：GPU 顶点着色器从高度纹理采样
 * - 视锥剔除：GPU 计算着色器 → 可见性缓冲区
 * - LOD：具有不同细分的共享几何体
 * - 高度查询：带缓存的 CPU 代理（用于游戏逻辑）
 */
export function createTerrainSystem(
  config: TerrainConfig,
  scene: Scene,
): TerrainSystemResource {
  const root = new Group();
  root.name = "terrain-system-gpu";

  const floatingOrigin = new FloatingOrigin(config);
  let chunkManager: ChunkManager | null = null;

  /**
   * CPU-side height query (cached for gameplay queries).
   * CPU 侧高度查询（缓存用于游戏逻辑查询）
   *
   * Note: This is a CPU proxy that matches the GPU height computation.
   * We keep this for:
   * - Physics/collision (player standing on terrain)
   * - Gameplay queries (spawning, pathfinding)
   * The cache ensures fast lookups without GPU readback.
   *
   * 注意：这是一个与 GPU 高度计算匹配的 CPU 代理。
   * 保留它用于：
   * - 物理/碰撞（玩家站在地形上）
   * - 游戏逻辑查询（出生、寻路）
   * 缓存确保快速查找，无需 GPU 回读。
   */
  const heightAt = (xMeters: number, zMeters: number): number => {
    return TerrainHeightSampler.heightAt(xMeters, zMeters, config);
  };

  const initGpu = async (r: WebGPURenderer, spawnX = 32, spawnZ = 32): Promise<void> => {
    // Create GPU chunk manager.
    // 创建 GPU chunk 管理器
    chunkManager = new ChunkManager(config, scene, floatingOrigin);

    // Initialize GPU compute pipelines.
    // 初始化 GPU 计算管线
    await chunkManager.initGpu(r);

    // Force load chunks around spawn point.
    // 强制加载出生点周围的 chunk
    await chunkManager.forceLoadAround(spawnX, spawnZ);
  };

  const update = (playerWorldX: number, playerWorldZ: number, camera: PerspectiveCamera): void => {
    if (!chunkManager) return;

    // Update chunk streaming (async but we don't await in frame loop).
    // 更新 chunk 流式加载（异步但不在帧循环中等待）
    // The async operations are queued and processed incrementally.
    // 异步操作被排队并增量处理
    void chunkManager.update(playerWorldX, playerWorldZ, camera);

    // Check for floating origin rebase.
    // 检查浮动原点重置
    const playerLocal = floatingOrigin.worldToLocal(playerWorldX, 0, playerWorldZ);
    floatingOrigin.checkAndRebase(playerLocal.x, playerLocal.z);
  };

  const dispose = (): void => {
    chunkManager?.dispose();
    chunkManager = null;
    TerrainHeightSampler.clearCache();
  };

  return {
    root,
    heightAt,
    floatingOrigin,
    initGpu,
    update,
    dispose,
  };
}
