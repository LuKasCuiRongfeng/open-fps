// TerrainSystem: GPU-first facade for the streaming terrain system.
// TerrainSystem：GPU-first 流式地形系统的门面

import { Group, type Texture } from "three/webgpu";
import type { Scene, WebGPURenderer, PerspectiveCamera } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import { TerrainPageManager } from "./TerrainPageManager";
import { FloatingOrigin } from "../common/FloatingOrigin";
import { TerrainHeightSampler } from "./TerrainHeightSampler";
import type { BrushStroke } from "./brushTypes";
import { type MapData, setHeightPageData, parsePageKey, getHeightPageData, getHeightPageKeys, hasHeightPages } from "@project/MapData";
import type { TerrainTextureArrayResult } from "./TerrainTextureArrays";

export type TerrainSystemResource = {
  root: Group;
  heightAt: (xMeters: number, zMeters: number) => number;
  hasHeightAt: (xMeters: number, zMeters: number) => boolean;
  hasRenderablePageAt: (xMeters: number, zMeters: number) => boolean;
  getStreamingRevision: () => number;
  floatingOrigin: FloatingOrigin;
  initGpu: (renderer: WebGPURenderer) => Promise<void>;
  update: (playerWorldX: number, playerWorldZ: number, camera: PerspectiveCamera) => void;
  // GPU-first brush editing: all brush operations run on GPU compute shaders.
  // GPU-first 画刷编辑：所有画刷操作在 GPU 计算着色器上运行
  applyBrushStrokes: (strokes: BrushStroke[]) => Promise<void>;
  // Map save/load API.
  // 地图保存/加载 API
  exportCurrentMapData: () => MapData;
  loadMapData: (mapData: MapData) => Promise<void>;
  markMapDataSaved: () => void;
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
 * - Height source: map files → CPU cache → StorageTexture atlas
 * - Height readback: GPU → CPU cache after brush edits
 * - Normal generation: GPU compute shader → StorageTexture atlas
 * - Vertex displacement: GPU vertex shader samples from height texture
 * - Frustum culling: Three.js built-in (GPU-optimized)
 * - LOD: Shared geometries with different tessellation
 * - Height queries: CPU samples from GPU-readback cache
 *
 * 架构（GPU-first 设计）：
 * - 高度来源：地图文件 → CPU 缓存 → StorageTexture 图集
 * - 高度回读：画刷编辑后从 GPU 回读到 CPU 缓存
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
  let pageManager: TerrainPageManager | null = null;

  // Store original map data for reset functionality.
  // 存储原始地图数据用于重置功能
  let originalMapData: MapData | null = null;
  let mapHeightPageKeys = new Set<string>();

  // Initialize height sampler with config.
  // 使用配置初始化高度采样器
  TerrainHeightSampler.init(config);

  const createMapDataShell = (source: MapData): MapData => ({
    version: source.version,
    seed: source.seed,
    worldSizeMeters: source.worldSizeMeters,
    pageSizeMeters: source.pageSizeMeters,
    heightPageResolution: source.heightPageResolution,
    heightPageKeys: [...source.heightPageKeys],
    heightPages: {},
    loadHeightPage: source.loadHeightPage,
    paint: { ...source.paint, pageKeys: [...source.paint.pageKeys] },
    vegetationPath: source.vegetationPath,
    metadata: { ...source.metadata },
  });

  const cloneMapData = (source: MapData): MapData => {
    const clone = createMapDataShell(source);
    for (const key of Object.keys(source.heightPages)) {
      const { px, pz } = parsePageKey(key);
      const pageData = getHeightPageData(source, px, pz);
      if (pageData) {
        setHeightPageData(clone, px, pz, pageData.heights);
      }
    }

    return clone;
  };

  /**
   * CPU-side height query (from GPU-readback cache).
   * CPU 侧高度查询（来自 GPU 回读缓存）
   */
  const heightAt = (xMeters: number, zMeters: number): number => {
    return TerrainHeightSampler.heightAt(xMeters, zMeters, config);
  };

  /**
   * Check whether a world position has loaded height data instead of fallback base height.
   * 检查世界坐标是否有已加载高度数据，而不是回退到基础高度。
   */
  const hasHeightAt = (xMeters: number, zMeters: number): boolean => {
    const pageSize = config.streaming.pageSizeMeters;
    const cx = Math.floor(xMeters / pageSize);
    const cz = Math.floor(zMeters / pageSize);
    const key = `${cx},${cz}`;
    if (!mapHeightPageKeys.has(key)) {
      return false;
    }

    return TerrainHeightSampler.hasPageData(cx, cz);
  };

  const hasRenderablePageAt = (xMeters: number, zMeters: number): boolean => (
    pageManager?.hasPageAtWorldPosition(xMeters, zMeters) ?? false
  );

  const getStreamingRevision = (): number => pageManager?.getStreamingRevision() ?? 0;

  const initGpu = async (r: WebGPURenderer): Promise<void> => {
    // Create GPU page residency and clipmap manager.
    // 创建 GPU page 驻留与 clipmap 管理器。
    pageManager = new TerrainPageManager(config, scene, floatingOrigin);

    // Initialize GPU compute pipelines.
    // 初始化 GPU 计算管线
    await pageManager.initGpu(r);

    // EN: Terrain is created only after map data is loaded; init must not generate placeholder pages.
    // 中文: 地形只在加载地图数据后创建；初始化阶段不能生成占位 page。
  };

  const update = (playerWorldX: number, playerWorldZ: number, camera: PerspectiveCamera): void => {
    if (!pageManager) return;

    // Update page residency and fixed clipmap patches without awaiting in the frame loop.
    // 更新 page 驻留和固定 clipmap patch，帧循环中不等待。
    void pageManager.update(playerWorldX, playerWorldZ, camera);
  };

  /**
   * Apply brush strokes to terrain using GPU compute shaders.
   * 使用 GPU 计算着色器将画刷笔触应用到地形
   *
   * GPU-first design: Brush operations run entirely on GPU.
   * GPU-first 设计：画刷操作完全在 GPU 上运行
   */
  const applyBrushStrokes = async (strokes: BrushStroke[]): Promise<void> => {
    if (!pageManager) return;
    const editableStrokes = strokes.filter((stroke) => {
      const pageSize = config.streaming.pageSizeMeters;
      const cx = Math.floor(stroke.worldX / pageSize);
      const cz = Math.floor(stroke.worldZ / pageSize);
      return mapHeightPageKeys.has(`${cx},${cz}`);
    });

    await pageManager.applyBrushStrokes(editableStrokes);
  };

  /**
   * Export current terrain as MapData (for saving).
   * 导出当前地形为 MapData（用于保存）
   */
  const exportCurrentMapData = (): MapData => {
    if (!originalMapData || !hasHeightPages(originalMapData)) {
      throw new Error("Cannot export terrain before loading a map file");
    }

    const originalPageKeys = new Set(getHeightPageKeys(originalMapData));
    const dirtyPageKeys = TerrainHeightSampler.getDirtyPageKeys().filter((key) => originalPageKeys.has(key));
    const dirtyPageKeySet = new Set(dirtyPageKeys);

    const mapData = createMapDataShell(originalMapData);
    // EN: Saves preserve the loaded sparse page manifest; runtime never invents or expands terrain pages.
    // 中文: 保存保持已加载的稀疏 page 清单；运行时绝不创建或扩展地形 page。
    for (const key of originalPageKeys) {
      const { px, pz } = parsePageKey(key);
      const originalPage = getHeightPageData(originalMapData, px, pz);
      const cachedHeightData = TerrainHeightSampler.getPageHeightData(px, pz);
      const heights = dirtyPageKeySet.has(key)
        ? cachedHeightData ?? originalPage?.heights
        : originalPage?.heights ?? cachedHeightData;

      if (heights) {
        setHeightPageData(mapData, px, pz, heights);
      }
    }

    mapData.dirtyHeightPageKeys = dirtyPageKeys;

    return mapData;
  };

  /**
   * Load terrain from MapData.
   * 从 MapData 加载地形
   */
  const loadMapData = async (mapData: MapData): Promise<void> => {
    if (!pageManager) return;

    // EN: Loading a project map replaces the terrain cache; map files are the only valid terrain source.
    // 中文: 加载项目地图时替换地形缓存；地图文件是唯一有效的地形来源。
    TerrainHeightSampler.clearCache();

    // Verify config matches.
    // 验证配置匹配
    if (mapData.heightPageResolution !== config.gpuCompute.tileResolution) {
      console.warn("[TerrainSystem] Map height page resolution mismatch, may cause issues");
    }
    if (mapData.pageSizeMeters !== config.streaming.pageSizeMeters) {
      console.warn("[TerrainSystem] Map page size mismatch, may cause issues");
    }

    // Load height pages into CPU cache.
    // 将高度 page 加载到 CPU 缓存。
    if (hasHeightPages(mapData)) {
      for (const key of Object.keys(mapData.heightPages)) {
        const { px, pz } = parsePageKey(key);
        const pageData = getHeightPageData(mapData, px, pz);
        if (pageData) {
          TerrainHeightSampler.setPageHeightData(px, pz, pageData.heights);
        }
      }
    }

    TerrainHeightSampler.clearDirtyPages();
    mapHeightPageKeys = new Set(getHeightPageKeys(mapData));
    pageManager.setMapPageKeys(mapHeightPageKeys);
    pageManager.setHeightPageLoader(mapData.loadHeightPage ?? null);

    // Store original map data for reset.
    // 存储原始地图数据用于重置
    originalMapData = cloneMapData(mapData);

    // EN: Existing resident pages may share coordinates with the newly loaded map, so refresh their GPU tiles first.
    // 中文: 已驻留 page 可能与新加载地图共用坐标，因此先刷新它们的 GPU tile。
    await pageManager.reuploadAllPages();

    // Load visible map pages around the map center without synthesizing missing terrain.
    // 围绕地图中心加载可见地图 page，但不合成缺失地形。
    await pageManager.forceLoadAround(...resolveMapInitialLoadPoint(mapData));
  };

  /**
   * Reset terrain to original loaded data (discard all edits).
   * 重置地形为原始加载数据（丢弃所有编辑）
   */
  const resetToOriginal = async (): Promise<void> => {
    if (!pageManager || !originalMapData) {
      console.warn("[TerrainSystem] No original map data to reset to");
      return;
    }

    // Clear all cached height data.
    // 清除所有缓存的高度数据
    TerrainHeightSampler.clearCache();
    // Reload original data.
    // 重新加载原始数据
    await loadMapData(originalMapData);
  };

  /**
  * Mark exported terrain pages as saved after project persistence succeeds.
  * 项目持久化成功后，将已导出的地形 page 标记为已保存。
   */
  const markMapDataSaved = (): void => {
    TerrainHeightSampler.clearDirtyPages();
  };

  /**
   * Set texture array data for PBR terrain materials.
   * 设置 PBR 地形材质的纹理数组数据
   *
  * Rebuilds fixed clipmap patch materials with the new texture arrays.
  * 使用新纹理数组重建固定 clipmap patch 材质。
   */
  const setTextureData = (
    textureArrays: TerrainTextureArrayResult | null,
    splatMapTextures: (Texture | null)[],
  ): void => {
    pageManager?.setTextureData(textureArrays, splatMapTextures);
  };

  const dispose = (): void => {
    pageManager?.dispose();
    pageManager = null;
    TerrainHeightSampler.clearCache();
    originalMapData = null;
    mapHeightPageKeys = new Set<string>();
  };

  return {
    root,
    heightAt,
    hasHeightAt,
    hasRenderablePageAt,
    getStreamingRevision,
    floatingOrigin,
    initGpu,
    update,
    applyBrushStrokes,
    exportCurrentMapData,
    loadMapData,
    markMapDataSaved,
    resetToOriginal,
    setTextureData,
    dispose,
  };
}

function resolveMapInitialLoadPoint(mapData: MapData): [number, number] {
  const keys = getHeightPageKeys(mapData);
  if (keys.length === 0) {
    return [0, 0];
  }

  let minPageX = Number.POSITIVE_INFINITY;
  let maxPageX = Number.NEGATIVE_INFINITY;
  let minPageZ = Number.POSITIVE_INFINITY;
  let maxPageZ = Number.NEGATIVE_INFINITY;

  const coords: Array<{ cx: number; cz: number }> = [];
  for (const key of keys) {
    const { px, pz } = parsePageKey(key);
    coords.push({ cx: px, cz: pz });
    minPageX = Math.min(minPageX, px);
    maxPageX = Math.max(maxPageX, px);
    minPageZ = Math.min(minPageZ, pz);
    maxPageZ = Math.max(maxPageZ, pz);
  }

  const targetPageX = (minPageX + maxPageX) / 2;
  const targetPageZ = (minPageZ + maxPageZ) / 2;
  let nearestPage = coords[0]!;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const coord of coords) {
    const dx = coord.cx - targetPageX;
    const dz = coord.cz - targetPageZ;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearestPage = coord;
    }
  }

  const pageSize = mapData.pageSizeMeters;
  // EN: Use the nearest declared page center, not the bounding-box center, so sparse maps never preload empty space.
  // 中文: 使用最近的已声明 page 中心，而不是包围盒中心，避免稀疏地图预加载空白区域。
  return [
    (nearestPage.cx + 0.5) * pageSize,
    (nearestPage.cz + 0.5) * pageSize,
  ];
}
