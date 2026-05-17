// TextureEditor: texture painting coordinator for terrain splat maps.
// TextureEditor：地形 splat map 纹理绘制协调器

import type { DataTexture, PerspectiveCamera, WebGPURenderer } from "three/webgpu";
import { SplatMapSet } from "@game/world/terrain/gpu/SplatMapSet";
import {
  type TextureDefinition,
  type SplatMapData,
  createDefaultSplatMap,
  getSplatMapCount,
} from "@game/world/terrain/TextureData";
import { TextureStorage, getPaintSplatMapIndices } from "./TextureStorage";
import { TextureBrush, type TextureBrushSettings } from "./TextureBrush";
import type { EditorCommand } from "@editor/runtime/history/EditorCommandHistory";
import {
  applyPaintRegionPacksToSplatMapPixels,
  createPaintDataForMap,
  createPaintRegionPackPayload,
  getPaintRegionKeysForWorldBounds,
  type MapData,
  type MapPaintData,
  type PaintRegionPackPayload,
} from "@project/MapData";

type EditorCommandRecorder = (command: EditorCommand) => void;

interface TexturePaintStrokeSession {
  beforeSplatMaps: SplatMapData[];
  dirtyRegionKeys: Set<string>;
  changed: boolean;
}

interface TextureRegionSnapshot {
  paintData: MapPaintData;
  splatMapCount: number;
  resolution: number;
  regionKeys: string[];
  regions: PaintRegionPackPayload[];
}

/**
 * TextureEditor: coordinates texture painting on terrain splat maps.
 * TextureEditor：协调地形 splat map 上的纹理绘制
 *
 * Supports multiple splat maps for >4 texture layers.
 * 支持多个 splat map 以支持 >4 个纹理层
 *
 * Delegates brush operations to TextureBrush (mirrors TerrainEditor pattern).
 * 将画刷操作委托给 TextureBrush（与 TerrainEditor 模式一致）
 */
export class TextureEditor {
  // Splat map set (manages multiple splat maps).
  // Splat map 集合（管理多个 splat map）
  private splatMapSet: SplatMapSet | null = null;

  // Texture brush (delegated).
  // 纹理画刷（委托）
  private readonly brush = new TextureBrush();

  // Texture definition loaded from project.
  // 从项目加载的纹理定义
  private _textureDefinition: TextureDefinition | null = null;

  // Whether texture editing is enabled.
  // 纹理编辑是否启用
  private _editingEnabled = false;

  // Dirty flag.
  // 脏标志
  private _dirty = false;

  // World offset for splat map alignment.
  // 用于 splat map 对齐的世界偏移
  private worldOffsetX = 0;
  private worldOffsetZ = 0;

  // Renderer reference.
  // 渲染器引用
  private renderer: WebGPURenderer | null = null;

  // Resolution for splat maps.
  // Splat map 分辨率
  private resolution = 1024;

  // Dirty paint regions touched by brush strokes since the last save.
  // 上次保存后被画刷笔画触碰的脏绘制 region。
  private readonly dirtyPaintRegionKeys = new Set<string>();

  private mapWorldSizeMeters = 1024;
  private mapPageSizeMeters = 64;
  private mapPaintRegionSizePages = 8;
  private activePaintStroke: TexturePaintStrokeSession | null = null;
  private brushApplyPromise: Promise<void> | null = null;
  private historyFlushPromise: Promise<void> | null = null;
  private commandPlaybackInProgress = false;
  private commandRecorder: EditorCommandRecorder | null = null;

  // Callbacks.
  // 回调
  private onDirtyChange?: (dirty: boolean) => void;

  constructor() {}

  // --- Initialization / 初始化 ---

  /**
   * Initialize GPU resources for splat map painting.
   * 初始化 splat map 绘制的 GPU 资源
   */
  async init(renderer: WebGPURenderer, worldSize = 1024): Promise<void> {
    this.renderer = renderer;
    this.worldOffsetX = -worldSize / 2;
    this.worldOffsetZ = -worldSize / 2;

    this.resolution = Math.min(4096, Math.max(1024, Math.ceil(worldSize / 2)));
    this.splatMapSet = new SplatMapSet(this.resolution, worldSize);
    // Start with 1 splat map, will resize when texture def is loaded.
    // 从 1 个 splat map 开始，加载纹理定义时会调整大小
    await this.splatMapSet.init(renderer, 1);
    this.splatMapSet.setWorldOffset(this.worldOffsetX, this.worldOffsetZ);
  }

  /**
   * Load texture definition and splat map from project.
   * 从项目加载纹理定义和 splat map
   */
  async loadFromMapDirectory(mapDirectory: string, mapData?: MapData | null): Promise<void> {
    this._textureDefinition = await TextureStorage.loadTextureDefinition(mapDirectory, mapData);
    if (mapData) {
      this.mapWorldSizeMeters = mapData.worldSizeMeters;
      this.mapPageSizeMeters = mapData.pageSizeMeters;
      this.mapPaintRegionSizePages = mapData.paint.splatMaps.regionSizePages;
    }

    if (this._textureDefinition && this.splatMapSet && this.renderer && mapData) {
      this._editingEnabled = true;
      this.brush.setTextureDefinition(this._textureDefinition);

      // Resize splat map set to match number needed.
      // 调整 splat map 集合大小以匹配需要的数量
      const splatMapCount = getSplatMapCount(this._textureDefinition);
      await this.splatMapSet.resize(this.renderer, splatMapCount);
      const splatMaps = await TextureStorage.loadPaintPages(mapDirectory, mapData, splatMapCount);

      for (let i = 0; i < splatMapCount; i++) {
        const splatMapData = splatMaps[i]
          ?? createDefaultSplatMap(this.splatMapSet.getResolution(), i);
        await this.splatMapSet.loadFromPixels(
          this.renderer,
          splatMapData.pixels,
          splatMapData.resolution,
          i,
        );
      }
    } else {
      this._editingEnabled = false;
      this.brush.setTextureDefinition(null);
    }

    this._dirty = false;
    this.dirtyPaintRegionKeys.clear();
  }

  /**
   * Save texture definition and splat map to project.
   * 将纹理定义和 splat map 保存到项目
   */
  async saveToMapDirectory(mapDirectory: string, mapData: MapData): Promise<void> {
    if (!this._editingEnabled || !this._textureDefinition) {
      console.warn("[TextureEditor] Cannot save: texture editing not enabled");
      return;
    }

    if (this.splatMapSet && this.renderer) {
      const splatMapCount = this.splatMapSet.getCount();
      const splatMaps: SplatMapData[] = [];
      for (let i = 0; i < splatMapCount; i++) {
        const pixels = await this.splatMapSet.readToPixels(this.renderer, i);
        splatMaps.push({
          resolution: this.splatMapSet.getResolution(),
          pixels,
          splatMapIndex: i,
        });
      }
      const dirtyRegionKeys = this.dirtyPaintRegionKeys.size > 0
        ? Array.from(this.dirtyPaintRegionKeys)
        : undefined;
      await TextureStorage.savePaintData(mapDirectory, this._textureDefinition, mapData, splatMaps, { dirtyRegionKeys });
    } else {
      await TextureStorage.saveTextureDefinition(mapDirectory, this._textureDefinition, mapData);
    }

    this.setDirty(false);
    this.dirtyPaintRegionKeys.clear();
  }

  // --- Getters / 获取器 ---

  get textureDefinition(): Readonly<TextureDefinition> | null {
    return this._textureDefinition;
  }

  get editingEnabled(): boolean {
    return this._editingEnabled;
  }

  get brushSettings(): Readonly<TextureBrushSettings> {
    return this.brush.settings;
  }

  get brushActive(): boolean {
    return this.brush.active;
  }

  get brushTargetValid(): boolean {
    return this.brush.targetValid;
  }

  get brushTargetX(): number {
    return this.brush.targetX;
  }

  get brushTargetZ(): number {
    return this.brush.targetZ;
  }

  get dirty(): boolean {
    return this._dirty;
  }

  get layerNames(): readonly string[] {
    return this.brush.layerNames;
  }

  /**
   * Get the primary splat map texture for material rendering.
   * 获取用于材质渲染的主 splat map 纹理
   */
  getSplatTexture(): DataTexture | null {
    return this.splatMapSet?.getSplatTexture(0) ?? null;
  }

  /**
   * Get all splat map textures for material rendering.
   * 获取用于材质渲染的所有 splat map 纹理
   */
  getAllSplatTextures(): (DataTexture | null)[] {
    return this.splatMapSet?.getAllSplatTextures() ?? [];
  }

  /**
   * Get number of splat maps.
   * 获取 splat map 数量
   */
  getSplatMapCount(): number {
    return this.splatMapSet?.getCount() ?? 1;
  }

  applyToMapData(mapData: MapData): void {
    if (!this._editingEnabled || !this._textureDefinition || !this.splatMapSet) {
      mapData.paint.splatMaps.indices = [];
      return;
    }

    mapData.paint = createPaintDataForMap(
      mapData.worldSizeMeters,
      mapData.pageSizeMeters,
      getPaintSplatMapIndices(this.splatMapSet.getCount()),
      this.splatMapSet.getResolution(),
    );
  }

  // --- Dirty State / 脏状态 ---

  private setDirty(dirty: boolean): void {
    if (this._dirty !== dirty) {
      this._dirty = dirty;
      this.onDirtyChange?.(dirty);
    }
  }

  setOnDirtyChange(callback: (dirty: boolean) => void): void {
    this.onDirtyChange = callback;
  }

  setCommandRecorder(callback: EditorCommandRecorder | null): void {
    this.commandRecorder = callback;
  }

  // --- Brush Settings (delegated) / 画刷设置（委托） ---

  setSelectedLayer(layerName: string): void {
    this.brush.selectedLayer = layerName;
  }

  setBrushRadius(radius: number): void {
    this.brush.radius = radius;
  }

  setBrushStrength(strength: number): void {
    this.brush.strength = strength;
  }

  setBrushFalloff(falloff: number): void {
    this.brush.falloff = falloff;
  }

  // --- Brush Input (delegated) / 画刷输入（委托） ---

  updateBrushTarget(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number,
    hasHeightAt?: (x: number, z: number) => boolean
  ): void {
    this.brush.updateTarget(mouseX, mouseY, canvasWidth, canvasHeight, camera, heightAt, hasHeightAt);
  }

  invalidateBrushTarget(): void {
    this.brush.invalidateTarget();
  }

  startBrush(): void {
    this.brush.start();
  }

  endBrush(): void {
    this.brush.stop();
    if (!this.historyFlushPromise) {
      const flushPromise = this.finishPaintStrokeAfterPendingWork();
      this.historyFlushPromise = flushPromise;
      void flushPromise.finally(() => {
        if (this.historyFlushPromise === flushPromise) {
          this.historyFlushPromise = null;
        }
      });
    }
  }

  async flushPendingHistory(): Promise<void> {
    if (this.historyFlushPromise) {
      await this.historyFlushPromise;
    }
  }

  /**
   * Apply brush stroke to splat map.
   * 将画刷笔画应用到 splat map
   */
  async applyBrush(dt: number): Promise<void> {
    if (!this._editingEnabled || !this.splatMapSet || !this.renderer || this.commandPlaybackInProgress) {
      return;
    }

    if (this.brushApplyPromise) {
      return;
    }

    this.brushApplyPromise = this.applyBrushInternal(dt);
    try {
      await this.brushApplyPromise;
    } finally {
      this.brushApplyPromise = null;
    }
  }

  private async applyBrushInternal(dt: number): Promise<void> {
    if (!this.splatMapSet || !this.renderer) {
      return;
    }

    const stroke = this.brush.generateStroke(dt);
    if (!stroke) return;

    const paintStroke = await this.ensurePaintStrokeSession();
    if (!paintStroke) return;

    await this.splatMapSet.applyBrush(this.renderer, stroke);
    const dirtyRegionKeys = getPaintRegionKeysForWorldBounds(
      this.mapWorldSizeMeters,
      this.mapPageSizeMeters,
      this.mapPaintRegionSizePages,
      stroke.worldX - stroke.radius,
      stroke.worldZ - stroke.radius,
      stroke.worldX + stroke.radius,
      stroke.worldZ + stroke.radius,
    );
    for (const key of dirtyRegionKeys) {
      this.dirtyPaintRegionKeys.add(key);
      paintStroke.dirtyRegionKeys.add(key);
    }

    if (dirtyRegionKeys.length > 0) {
      paintStroke.changed = true;
      this.setDirty(true);
    }
  }

  private async ensurePaintStrokeSession(): Promise<TexturePaintStrokeSession | null> {
    if (this.activePaintStroke) {
      return this.activePaintStroke;
    }

    if (!this.splatMapSet || !this.renderer) {
      return null;
    }

    const beforeSplatMaps = await this.readAllSplatMaps();
    this.activePaintStroke = {
      beforeSplatMaps,
      dirtyRegionKeys: new Set<string>(),
      changed: false,
    };
    return this.activePaintStroke;
  }

  private async finishPaintStrokeAfterPendingWork(): Promise<void> {
    if (this.brushApplyPromise) {
      await this.brushApplyPromise;
    }

    await this.finishPaintStroke();
  }

  private async finishPaintStroke(): Promise<void> {
    const session = this.activePaintStroke;
    this.activePaintStroke = null;
    if (!session?.changed || session.dirtyRegionKeys.size === 0 || !this.commandRecorder) {
      return;
    }

    const afterSplatMaps = await this.readAllSplatMaps();
    const regionKeys = Array.from(session.dirtyRegionKeys).sort();
    const beforeSnapshot = this.createRegionSnapshot(session.beforeSplatMaps, regionKeys);
    const afterSnapshot = this.createRegionSnapshot(afterSplatMaps, regionKeys);
    this.commandRecorder({
      label: "Texture paint stroke",
      undo: () => this.applyRegionSnapshot(beforeSnapshot),
      redo: () => this.applyRegionSnapshot(afterSnapshot),
    });
  }

  private createRegionSnapshot(splatMaps: readonly SplatMapData[], regionKeys: readonly string[]): TextureRegionSnapshot {
    const paintData = this.createCurrentPaintData();
    return {
      paintData,
      splatMapCount: splatMaps.length,
      resolution: splatMaps[0]?.resolution ?? this.resolution,
      regionKeys: [...regionKeys],
      regions: createPaintRegionPackPayload(
        paintData,
        this.mapWorldSizeMeters,
        this.mapPageSizeMeters,
        splatMaps,
        regionKeys,
      ),
    };
  }

  private async applyRegionSnapshot(snapshot: TextureRegionSnapshot): Promise<void> {
    if (!this.splatMapSet || !this.renderer) {
      return;
    }

    this.commandPlaybackInProgress = true;
    try {
      await this.splatMapSet.resize(this.renderer, snapshot.splatMapCount);
      const regionBytesByKey = Object.fromEntries(snapshot.regions.map((region) => [region.key, region.bytes]));
      for (let index = 0; index < snapshot.splatMapCount; index += 1) {
        const pixels = await this.splatMapSet.readToPixels(this.renderer, index);
        applyPaintRegionPacksToSplatMapPixels(
          snapshot.paintData,
          this.mapWorldSizeMeters,
          this.mapPageSizeMeters,
          index,
          regionBytesByKey,
          pixels,
        );
        await this.splatMapSet.loadFromPixels(this.renderer, pixels, snapshot.resolution, index);
      }

      for (const key of snapshot.regionKeys) {
        this.dirtyPaintRegionKeys.add(key);
      }
      this.setDirty(true);
    } finally {
      this.commandPlaybackInProgress = false;
    }
  }

  private async readAllSplatMaps(): Promise<SplatMapData[]> {
    if (!this.splatMapSet || !this.renderer) {
      return [];
    }

    const splatMapCount = this.splatMapSet.getCount();
    const splatMaps: SplatMapData[] = [];
    for (let index = 0; index < splatMapCount; index += 1) {
      splatMaps.push({
        resolution: this.splatMapSet.getResolution(),
        pixels: await this.splatMapSet.readToPixels(this.renderer, index),
        splatMapIndex: index,
      });
    }

    return splatMaps;
  }

  private createCurrentPaintData(): MapPaintData {
    const splatMapCount = this.splatMapSet?.getCount() ?? 1;
    const resolution = this.splatMapSet?.getResolution() ?? this.resolution;
    return createPaintDataForMap(
      this.mapWorldSizeMeters,
      this.mapPageSizeMeters,
      getPaintSplatMapIndices(splatMapCount),
      resolution,
      undefined,
      this.mapPaintRegionSizePages,
    );
  }

  reset(): void {
    this.brush.reset();
  }

  // --- Texture Definition Editing / 纹理定义编辑 ---

  updateLayerDefinition(
    layerName: string,
    updates: Partial<TextureDefinition[string]>
  ): void {
    if (!this._textureDefinition || !this._textureDefinition[layerName]) return;
    Object.assign(this._textureDefinition[layerName], updates);
    this.setDirty(true);
  }

  // --- Disposal / 清理 ---

  dispose(): void {
    this.splatMapSet?.dispose();
    this.splatMapSet = null;
    this.renderer = null;
  }
}
