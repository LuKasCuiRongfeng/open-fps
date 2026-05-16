// TerrainPageManager: virtual height page residency and clipmap rendering coordinator.
// TerrainPageManager：虚拟高度 page 驻留与 clipmap 渲染协调器。

import type { Scene, WebGPURenderer, PerspectiveCamera, Texture } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import type { TerrainTextureArrayResult } from "./TerrainTextureArrays";
import { FloatingOrigin } from "../common/FloatingOrigin";
import { hasAuthoredTerrainTextureData } from "./material/terrainMaterialTexturedArray";
import { TerrainHeightCompute, TerrainNormalCompute, TerrainBrushCompute } from "./gpu";
import { TerrainHeightSampler } from "./TerrainHeightSampler";
import type { BrushStroke } from "./brushTypes";
import { buildPageLoadQueue, buildPageUnloadQueue, getAffectedPageBounds } from "./pageStreaming";
import { TerrainClipmapRenderer, disposeClipmapGeometries } from "./TerrainClipmapRenderer";
import type { HeightPageLoader } from "@project/MapData";

export type PageCoord = { cx: number; cz: number };

/**
 * Virtual page manager for terrain height data.
 * 虚拟 page 管理器，负责地形高度数据。
 *
 * EN: This class now owns GPU page residency and brush compute only; visible terrain meshes live in a fixed clipmap pool.
 * 中文: 该类现在只负责 GPU page 驻留和画刷计算；可见地形网格由固定 clipmap 池维护。
 */
export class TerrainPageManager {
  private readonly config: TerrainConfig;
  private readonly scene: Scene;
  private readonly floatingOrigin: FloatingOrigin;

  private readonly heightCompute: TerrainHeightCompute;
  private readonly normalCompute: TerrainNormalCompute;
  private readonly brushCompute: TerrainBrushCompute;

  private readonly residentPages = new Map<string, PageCoord>();
  private readonly loadQueue: PageCoord[] = [];
  private readonly unloadQueue: string[] = [];
  private readonly normalPending = new Map<string, PageCoord>();

  private renderer: WebGPURenderer | null = null;
  private clipmapRenderer: TerrainClipmapRenderer | null = null;
  private gpuReady = false;
  private queueProcessing = false;
  private streamingRevision = 0;

  private lastPlayerCx = 0;
  private lastPlayerCz = 0;
  private lastPlayerWorldX = 0;
  private lastPlayerWorldZ = 0;

  // EN: Only pages declared by the loaded map manifest may stream or edit.
  // 中文: 只有已加载地图清单声明的 page 可以流式加载或编辑。
  private mapPageKeys: ReadonlySet<string> = new Set();

  private textureArrays: TerrainTextureArrayResult | null = null;
  private splatMapTextures: (Texture | null)[] = [];
  private materialUsesAuthoredTextures = false;
  private heightPageLoader: HeightPageLoader | null = null;

  constructor(config: TerrainConfig, scene: Scene, floatingOrigin: FloatingOrigin) {
    this.config = config;
    this.scene = scene;
    this.floatingOrigin = floatingOrigin;
    this.heightCompute = new TerrainHeightCompute(config);
    this.normalCompute = new TerrainNormalCompute(config);
    this.brushCompute = new TerrainBrushCompute(config);
  }

  async initGpu(renderer: WebGPURenderer): Promise<void> {
    this.renderer = renderer;
    await this.heightCompute.init(renderer);
    await this.normalCompute.init(renderer, this.heightCompute.heightTexture!);
    await this.brushCompute.init(renderer, this.heightCompute.heightTexture!, this.heightCompute.allocator);

    this.clipmapRenderer = new TerrainClipmapRenderer(
      this.config,
      this.scene,
      this.floatingOrigin,
      this.heightCompute.heightTexture!,
      this.normalCompute.normalTexture!,
    );
    if (this.materialUsesAuthoredTextures) {
      this.clipmapRenderer.setTextureData(this.textureArrays, this.splatMapTextures);
    }
    this.gpuReady = true;
  }

  worldToPage(worldX: number, worldZ: number): PageCoord {
    const size = this.config.streaming.pageSizeMeters;
    return {
      cx: Math.floor(worldX / size),
      cz: Math.floor(worldZ / size),
    };
  }

  hasPageAtWorldPosition(worldX: number, worldZ: number): boolean {
    const { cx, cz } = this.worldToPage(worldX, worldZ);
    return this.clipmapRenderer?.hasRenderablePage(cx, cz) ?? false;
  }

  getStreamingRevision(): number {
    return this.streamingRevision;
  }

  setMapPageKeys(keys: ReadonlySet<string>): void {
    this.mapPageKeys = keys;
    this.loadQueue.length = 0;
    this.unloadQueue.length = 0;
    this.normalPending.clear();

    for (const key of Array.from(this.residentPages.keys())) {
      if (!keys.has(key)) {
        this.unloadPage(key);
      }
    }

    this.refreshClipmap();
  }

  setHeightPageLoader(loader: HeightPageLoader | null): void {
    this.heightPageLoader = loader;
  }

  async forceLoadAround(worldX: number, worldZ: number): Promise<void> {
    if (!this.gpuReady || !this.renderer) return;

    this.lastPlayerWorldX = worldX;
    this.lastPlayerWorldZ = worldZ;
    const { cx, cz } = this.worldToPage(worldX, worldZ);
    this.lastPlayerCx = cx;
    this.lastPlayerCz = cz;
    this.rebuildQueues(cx, cz);
    await this.processQueuesIfIdle();
    this.refreshClipmap();
  }

  async update(playerWorldX: number, playerWorldZ: number, _camera: PerspectiveCamera): Promise<void> {
    if (!this.gpuReady || !this.renderer) return;

    this.lastPlayerWorldX = playerWorldX;
    this.lastPlayerWorldZ = playerWorldZ;
    const { cx, cz } = this.worldToPage(playerWorldX, playerWorldZ);

    if (cx !== this.lastPlayerCx || cz !== this.lastPlayerCz) {
      this.lastPlayerCx = cx;
      this.lastPlayerCz = cz;
      this.rebuildQueues(cx, cz);
    }

    await this.processQueuesIfIdle();
    this.refreshClipmap();

    const playerLocal = this.floatingOrigin.worldToLocal(playerWorldX, 0, playerWorldZ);
    this.floatingOrigin.checkAndRebase(playerLocal.x, playerLocal.z);
  }

  async applyBrushStrokes(strokes: BrushStroke[]): Promise<void> {
    if (!this.gpuReady || !this.renderer || strokes.length === 0) return;

    const pageSize = this.config.streaming.pageSizeMeters;
    const affectedPages = new Set<string>();
    const affectedCoords: Array<{ cx: number; cz: number; tileX: number; tileZ: number }> = [];
    const bounds = getAffectedPageBounds(strokes, pageSize);
    if (!bounds) return;

    let flattenTargetHeight = 0;
    if (strokes[0].brush.type === "flatten") {
      flattenTargetHeight = TerrainHeightSampler.heightAt(strokes[0].worldX, strokes[0].worldZ, this.config);
    }

    for (let cx = bounds.minCx; cx <= bounds.maxCx; cx += 1) {
      for (let cz = bounds.minCz; cz <= bounds.maxCz; cz += 1) {
        const key = this.pageKey(cx, cz);
        if (!this.residentPages.has(key)) continue;

        const tileIndex = this.heightCompute.allocator.getTileIndex(cx, cz);
        if (tileIndex === undefined) continue;

        const { tileX, tileZ } = this.heightCompute.allocator.tileIndexToCoords(tileIndex);
        affectedPages.add(key);
        affectedCoords.push({ cx, cz, tileX, tileZ });
      }
    }

    if (affectedCoords.length === 0) return;

    this.brushCompute.ensureSynced(this.renderer);
    for (const stroke of strokes) {
      for (const { cx, cz, tileX, tileZ } of affectedCoords) {
        await this.brushCompute.applyBrushToPageNoCopy(cx, cz, tileX, tileZ, stroke, flattenTargetHeight, this.renderer);
      }
    }

    this.brushCompute.syncReadableTexture(this.renderer);
    await this.stitchAffectedPageEdges(affectedCoords);

    for (const key of affectedPages) {
      const page = this.residentPages.get(key)!;
      const heightData = await this.heightCompute.readbackPageHeight(page.cx, page.cz, this.renderer);
      TerrainHeightSampler.setPageHeightData(page.cx, page.cz, heightData, true);
    }

    await this.normalCompute.regeneratePages(affectedCoords, this.heightCompute.allocator, this.renderer);
  }

  async reuploadAllPages(): Promise<void> {
    if (!this.gpuReady || !this.renderer) return;
    await this.reuploadPages(Array.from(this.residentPages.values()));
    this.refreshClipmap();
  }

  async reuploadPages(pages: PageCoord[]): Promise<void> {
    if (!this.gpuReady || !this.renderer || pages.length === 0) return;

    const batchData: Array<{ cx: number; cz: number; heightData: Float32Array }> = [];
    for (const { cx, cz } of pages) {
      const key = this.pageKey(cx, cz);
      if (!this.residentPages.has(key)) continue;

      const heightData = await this.tryGetOrLoadHeightPageData(cx, cz);
      if (!heightData) {
        console.warn(`[TerrainPageManager] No height data for page (${cx}, ${cz})`);
        continue;
      }

      batchData.push({ cx, cz, heightData });
    }

    if (batchData.length === 0) return;
    await this.heightCompute.uploadPagesBatch(batchData, this.renderer);
    this.brushCompute.markNeedsSync();
    await this.normalCompute.regeneratePages(batchData, this.heightCompute.allocator, this.renderer);
  }

  dispose(): void {
    this.clipmapRenderer?.dispose();
    this.clipmapRenderer = null;
    this.residentPages.clear();
    this.loadQueue.length = 0;
    this.unloadQueue.length = 0;
    this.normalPending.clear();
    this.heightCompute.dispose();
    this.normalCompute.dispose();
    this.brushCompute.dispose();
    disposeClipmapGeometries();
    this.gpuReady = false;
    this.renderer = null;
  }

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

    this.clipmapRenderer?.setTextureData(
      this.materialUsesAuthoredTextures ? this.textureArrays : null,
      this.materialUsesAuthoredTextures ? this.splatMapTextures : [],
    );
  }

  private rebuildQueues(playerCx: number, playerCz: number): void {
    const viewDistance = this.config.streaming.viewDistancePages;
    const maxDistance = viewDistance + this.config.streaming.hysteresisPages;

    this.loadQueue.length = 0;
    this.loadQueue.push(
      ...buildPageLoadQueue(
        playerCx,
        playerCz,
        viewDistance,
        (key) => this.residentPages.has(key),
        (key) => this.normalPending.has(key),
        (cx, cz) => this.pageKey(cx, cz),
      ).filter(({ cx, cz }) => this.canUsePage(cx, cz)),
    );

    this.unloadQueue.length = 0;
    this.unloadQueue.push(...buildPageUnloadQueue(playerCx, playerCz, maxDistance, this.residentPages));
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
    const maxOps = this.config.streaming.maxPageOpsPerFrame;
    const loadBatch: PageCoord[] = [];
    const loadBudget = this.loadQueue.length > 0 ? Math.max(1, Math.ceil(maxOps * 0.75)) : 0;

    while (this.loadQueue.length > 0 && loadBatch.length < loadBudget) {
      loadBatch.push(this.loadQueue.shift()!);
    }

    await this.uploadPages(loadBatch);

    let ops = loadBatch.length;
    while (this.unloadQueue.length > 0 && ops < maxOps) {
      this.unloadPage(this.unloadQueue.pop()!);
      ops += 1;
    }

    if (this.normalPending.size > 0 && this.renderer) {
      const normalBudget = loadBatch.length > 0 ? 1 : Math.max(1, maxOps);
      const normalBatch = Array.from(this.normalPending.values()).slice(0, normalBudget);
      await this.normalCompute.regeneratePages(normalBatch, this.heightCompute.allocator, this.renderer);
      for (const { cx, cz } of normalBatch) {
        this.normalPending.delete(this.pageKey(cx, cz));
      }
    }
  }

  private async uploadPages(coords: PageCoord[]): Promise<void> {
    if (!this.renderer || coords.length === 0) return;

    const accepted: PageCoord[] = [];
    const batchData: Array<{ cx: number; cz: number; heightData: Float32Array }> = [];
    const expectedHeightCount = this.config.gpuCompute.tileResolution * this.config.gpuCompute.tileResolution;
    let availableTiles = this.heightCompute.allocator.freeCount;

    for (const { cx, cz } of coords) {
      if (!this.canUsePage(cx, cz)) continue;

      const key = this.pageKey(cx, cz);
      if (this.residentPages.has(key)) continue;

      const cachedHeightData = await this.tryGetOrLoadHeightPageData(cx, cz);
      if (!cachedHeightData) {
        console.warn(`[TerrainPageManager] Missing saved height data for map page (${cx}, ${cz})`);
        continue;
      }

      if (cachedHeightData.length !== expectedHeightCount) {
        console.warn(`[TerrainPageManager] Invalid height data size for map page (${cx}, ${cz})`);
        continue;
      }

      if (!this.heightCompute.allocator.hasTile(cx, cz)) {
        if (availableTiles <= 0) {
          console.warn(`[TerrainPageManager] No terrain height atlas tile available for page (${cx}, ${cz})`);
          continue;
        }
        availableTiles -= 1;
      }

      accepted.push({ cx, cz });
      batchData.push({ cx, cz, heightData: cachedHeightData });
      this.normalPending.set(key, { cx, cz });
    }

    if (batchData.length === 0) return;

    await this.heightCompute.uploadPagesBatch(batchData, this.renderer);
    this.brushCompute.markNeedsSync();

    for (const coord of accepted) {
      this.residentPages.set(this.pageKey(coord.cx, coord.cz), coord);
    }
  }

  private unloadPage(key: string): void {
    const page = this.residentPages.get(key);
    if (!page) return;

    this.heightCompute.freeTile(page.cx, page.cz);
    this.residentPages.delete(key);
    this.normalPending.delete(key);
  }

  private refreshClipmap(): void {
    if (!this.clipmapRenderer) return;

    const changed = this.clipmapRenderer.updateView(
      this.lastPlayerWorldX,
      this.lastPlayerWorldZ,
      this.mapPageKeys,
      this.heightCompute.allocator,
    );

    if (changed) {
      this.streamingRevision += 1;
    }
  }

  private async stitchAffectedPageEdges(affectedCoords: Array<{ cx: number; cz: number }>): Promise<void> {
    if (!this.renderer) return;

    const stitchedEdges = new Set<string>();
    for (const { cx, cz } of affectedCoords) {
      const neighbors = [
        { ncx: cx + 1, ncz: cz },
        { ncx: cx - 1, ncz: cz },
        { ncx: cx, ncz: cz + 1 },
        { ncx: cx, ncz: cz - 1 },
      ];

      for (const { ncx, ncz } of neighbors) {
        const neighborKey = this.pageKey(ncx, ncz);
        if (!this.residentPages.has(neighborKey)) continue;

        const edgeKey = cx < ncx || (cx === ncx && cz < ncz)
          ? `${cx},${cz}-${ncx},${ncz}`
          : `${ncx},${ncz}-${cx},${cz}`;

        if (stitchedEdges.has(edgeKey)) continue;
        stitchedEdges.add(edgeKey);
        await this.brushCompute.stitchEdge(cx, cz, ncx, ncz, this.renderer);
      }
    }
  }

  private canUsePage(cx: number, cz: number): boolean {
    return this.mapPageKeys.has(this.pageKey(cx, cz));
  }

  private async getOrLoadHeightPageData(cx: number, cz: number): Promise<Float32Array | null> {
    const cached = TerrainHeightSampler.getPageHeightData(cx, cz);
    if (cached) {
      return cached;
    }

    if (!this.heightPageLoader) {
      return null;
    }

    const key = this.pageKey(cx, cz);
    const page = await this.heightPageLoader(key);
    TerrainHeightSampler.setPageHeightData(cx, cz, page.heights);
    return page.heights;
  }

  private async tryGetOrLoadHeightPageData(cx: number, cz: number): Promise<Float32Array | null> {
    try {
      return await this.getOrLoadHeightPageData(cx, cz);
    } catch (error) {
      console.warn(`[TerrainPageManager] Failed to load map height page (${cx}, ${cz})`, error);
      return null;
    }
  }

  private pageKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }
}
