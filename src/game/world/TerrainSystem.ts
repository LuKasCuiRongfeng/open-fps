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
 * Architecture (GPU-first design):
 * - Height generation: GPU compute shader → StorageTexture atlas
 * - Height readback: GPU → CPU cache (ONCE per chunk, no duplicate noise)
 * - Normal generation: GPU compute shader → StorageTexture atlas
 * - Vertex displacement: GPU vertex shader samples from height texture
 * - Frustum culling: Three.js built-in (GPU-optimized)
 * - LOD: Shared geometries with different tessellation
 * - Height queries: CPU samples from GPU-readback cache
 *
 * 架构（GPU-first 设计）：
 * - 高度生成：GPU 计算着色器 → StorageTexture 图集
 * - 高度回读：GPU → CPU 缓存（每 chunk 一次，无重复噪声）
 * - 法线生成：GPU 计算着色器 → StorageTexture 图集
 * - 顶点位移：GPU 顶点着色器从高度纹理采样
 * - 视锥剔除：Three.js 内置（已 GPU 优化）
 * - LOD：具有不同细分的共享几何体
 * - 高度查询：CPU 从 GPU 回读缓存采样
 */
export function createTerrainSystem(
  config: TerrainConfig,
  scene: Scene,
): TerrainSystemResource {
  const root = new Group();
  root.name = "terrain-system-gpu";

  const floatingOrigin = new FloatingOrigin(config);
  let chunkManager: ChunkManager | null = null;

  // Initialize height sampler with config.
  // 使用配置初始化高度采样器
  TerrainHeightSampler.init(config);

  /**
   * CPU-side height query (from GPU-readback cache).
   * CPU 侧高度查询（来自 GPU 回读缓存）
   *
   * GPU-first design: height is computed ONLY on GPU, then read back ONCE.
   * CPU samples from this cache - NO duplicate noise implementation.
   *
   * GPU-first 设计：高度仅在 GPU 上计算，然后回读一次。
   * CPU 从此缓存采样 - 无重复噪声实现。
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
