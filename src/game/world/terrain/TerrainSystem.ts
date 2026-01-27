// TerrainSystem: GPU-first facade for the streaming terrain system.
// TerrainSystem：GPU-first 流式地形系统的门面

import { Group, type Texture } from "three/webgpu";
import type { Scene, WebGPURenderer, PerspectiveCamera } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import { ChunkManager } from "./ChunkManager";
import { FloatingOrigin } from "../FloatingOrigin";
import { TerrainHeightSampler } from "./TerrainHeightSampler";
import type { BrushStroke } from "../../editor/terrain/TerrainEditor";
import { type MapData, createEmptyMapData, setChunkData, parseChunkKey, getChunkData, hasChunks } from "../../project/MapData";
import type { TerrainTextureArrayResult } from "./TerrainTextureArrays";

export type TerrainSystemResource = {
  root: Group;
  heightAt: (xMeters: number, zMeters: number) => number;
  floatingOrigin: FloatingOrigin;
  initGpu: (renderer: WebGPURenderer, spawnX?: number, spawnZ?: number) => Promise<void>;
  update: (playerWorldX: number, playerWorldZ: number, camera: PerspectiveCamera) => void;
  // GPU-first brush editing: all brush operations run on GPU compute shaders.
  // GPU-first 画刷编辑：所有画刷操作在 GPU 计算着色器上运行
  applyBrushStrokes: (strokes: BrushStroke[]) => Promise<void>;
  // Map save/load API.
  // 地图保存/加载 API
  exportCurrentMapData: () => MapData;
  loadMapData: (mapData: MapData) => Promise<void>;
  resetToOriginal: () => Promise<void>;
  // Texture array data for PBR terrain materials.
  // PBR 地形材质的纹理数组数据
  setTextureData: (textureArrays: TerrainTextureArrayResult | null, splatMapTextures: (Texture | null)[]) => void;
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

  // Track which chunks have been modified by brush (need re-upload).
  // 跟踪哪些 chunk 被画刷修改过（需要重新上传）
  const modifiedChunks = new Set<string>();

  // Store original map data for reset functionality.
  // 存储原始地图数据用于重置功能
  let originalMapData: MapData | null = null;

  // Initialize height sampler with config.
  // 使用配置初始化高度采样器
  TerrainHeightSampler.init(config);

  /**
   * CPU-side height query (from GPU-readback cache).
   * CPU 侧高度查询（来自 GPU 回读缓存）
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
    void chunkManager.update(playerWorldX, playerWorldZ, camera);

    // Check for floating origin rebase.
    // 检查浮动原点重置
    const playerLocal = floatingOrigin.worldToLocal(playerWorldX, 0, playerWorldZ);
    floatingOrigin.checkAndRebase(playerLocal.x, playerLocal.z);
  };

  /**
   * Apply brush strokes to terrain using GPU compute shaders.
   * 使用 GPU 计算着色器将画刷笔触应用到地形
   *
   * GPU-first design: Brush operations run entirely on GPU.
   * GPU-first 设计：画刷操作完全在 GPU 上运行
   */
  const applyBrushStrokes = async (strokes: BrushStroke[]): Promise<void> => {
    if (!chunkManager) return;
    await chunkManager.applyBrushStrokes(strokes);
  };

  /**
   * Export current terrain as MapData (for saving).
   * 导出当前地形为 MapData（用于保存）
   */
  const exportCurrentMapData = (): MapData => {
    const mapData = createEmptyMapData(
      config.height.seed,
      config.gpuCompute.tileResolution,
      config.streaming.chunkSizeMeters,
      "Exported Map"
    );

    // Copy all cached chunk height data.
    // 复制所有缓存的 chunk 高度数据
    const chunkKeys = TerrainHeightSampler.getAllCachedChunkKeys();
    for (const key of chunkKeys) {
      const { cx, cz } = parseChunkKey(key);
      const heightData = TerrainHeightSampler.getChunkHeightData(cx, cz);
      if (heightData) {
        setChunkData(mapData, cx, cz, Array.from(heightData));
      }
    }

    return mapData;
  };

  /**
   * Load terrain from MapData.
   * 从 MapData 加载地形
   */
  const loadMapData = async (mapData: MapData): Promise<void> => {
    if (!chunkManager) return;

    // Verify config matches.
    // 验证配置匹配
    if (mapData.tileResolution !== config.gpuCompute.tileResolution) {
      console.warn("[TerrainSystem] Map tile resolution mismatch, may cause issues");
    }

    // Load height data into CPU cache.
    // 将高度数据加载到 CPU 缓存
    if (hasChunks(mapData)) {
      for (const key of Object.keys(mapData.chunks)) {
        const { cx, cz } = parseChunkKey(key);
        const chunkData = getChunkData(mapData, cx, cz);
        if (chunkData) {
          const heightData = new Float32Array(chunkData.heights);
          TerrainHeightSampler.setChunkHeightData(cx, cz, heightData);
        }
      }
    }

    // Store original map data for reset.
    // 存储原始地图数据用于重置
    originalMapData = mapData;

    // Re-upload all loaded chunks to GPU.
    // 重新上传所有已加载的 chunk 到 GPU
    await chunkManager.reuploadAllChunks();
  };

  /**
   * Reset terrain to original loaded data (discard all edits).
   * 重置地形为原始加载数据（丢弃所有编辑）
   */
  const resetToOriginal = async (): Promise<void> => {
    if (!chunkManager || !originalMapData) {
      console.warn("[TerrainSystem] No original map data to reset to");
      return;
    }

    // Clear all cached height data.
    // 清除所有缓存的高度数据
    TerrainHeightSampler.clearCache();
    modifiedChunks.clear();

    // Reload original data.
    // 重新加载原始数据
    await loadMapData(originalMapData);
  };

  /**
   * Set texture array data for PBR terrain materials.
   * 设置 PBR 地形材质的纹理数组数据
   *
   * Rebuilds all chunk materials with the new texture arrays.
   * 使用新纹理数组重建所有 chunk 材质
   */
  const setTextureData = (
    textureArrays: TerrainTextureArrayResult | null,
    splatMapTextures: (Texture | null)[],
  ): void => {
    chunkManager?.setTextureData(textureArrays, splatMapTextures);
  };

  const dispose = (): void => {
    chunkManager?.dispose();
    chunkManager = null;
    TerrainHeightSampler.clearCache();
    modifiedChunks.clear();
    originalMapData = null;
  };

  return {
    root,
    heightAt,
    floatingOrigin,
    initGpu,
    update,
    applyBrushStrokes,
    exportCurrentMapData,
    loadMapData,
    resetToOriginal,
    setTextureData,
    dispose,
  };
}
