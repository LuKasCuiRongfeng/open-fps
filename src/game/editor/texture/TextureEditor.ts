// TextureEditor: texture painting coordinator for terrain splat maps.
// TextureEditor：地形 splat map 纹理绘制协调器

import type { DataTexture, PerspectiveCamera, WebGPURenderer } from "three/webgpu";
import { SplatMapSet } from "@game/world/terrain/gpu/SplatMapCompute";
import {
  type TextureDefinition,
  type SplatMapData,
  getSplatMapCount,
} from "./TextureData";
import { TextureStorage } from "./TextureStorage";
import { TextureBrush, type TextureBrushSettings } from "./TextureBrush";

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
  async loadFromProject(projectPath: string): Promise<void> {
    this._textureDefinition = await TextureStorage.loadTextureDefinition(projectPath);

    if (this._textureDefinition && this.splatMapSet && this.renderer) {
      this._editingEnabled = true;
      this.brush.setTextureDefinition(this._textureDefinition);

      // Resize splat map set to match number needed.
      // 调整 splat map 集合大小以匹配需要的数量
      const splatMapCount = getSplatMapCount(this._textureDefinition);
      await this.splatMapSet.resize(this.renderer, splatMapCount);

      // Load all splat maps.
      // 加载所有 splat map
      for (let i = 0; i < splatMapCount; i++) {
        await TextureStorage.ensureSplatMap(projectPath, i);
        const splatMapData = await TextureStorage.loadSplatMap(projectPath, i);
        if (splatMapData) {
          await this.splatMapSet.loadFromPixels(this.renderer, splatMapData.pixels, i);
        }
      }
    } else {
      this._editingEnabled = false;
      this.brush.setTextureDefinition(null);
    }

    this._dirty = false;
  }

  /**
   * Save texture definition and splat map to project.
   * 将纹理定义和 splat map 保存到项目
   */
  async saveToProject(projectPath: string): Promise<void> {
    if (!this._editingEnabled || !this._textureDefinition) {
      console.warn("[TextureEditor] Cannot save: texture editing not enabled");
      return;
    }

    await TextureStorage.saveTextureDefinition(projectPath, this._textureDefinition);

    if (this.splatMapSet && this.renderer) {
      const splatMapCount = this.splatMapSet.getCount();
      for (let i = 0; i < splatMapCount; i++) {
        const pixels = await this.splatMapSet.readToPixels(this.renderer, i);
        const splatMapData: SplatMapData = {
          resolution: this.splatMapSet.getResolution(),
          pixels,
          splatMapIndex: i,
        };
        await TextureStorage.saveSplatMap(projectPath, splatMapData, i);
      }
    }

    this.setDirty(false);
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
    heightAt: (x: number, z: number) => number
  ): void {
    this.brush.updateTarget(mouseX, mouseY, canvasWidth, canvasHeight, camera, heightAt);
  }

  invalidateBrushTarget(): void {
    this.brush.invalidateTarget();
  }

  startBrush(): void {
    this.brush.start();
  }

  endBrush(): void {
    this.brush.stop();
  }

  /**
   * Apply brush stroke to splat map.
   * 将画刷笔画应用到 splat map
   */
  async applyBrush(dt: number): Promise<void> {
    if (!this._editingEnabled || !this.splatMapSet || !this.renderer) {
      return;
    }

    const stroke = this.brush.generateStroke(dt);
    if (!stroke) return;

    await this.splatMapSet.applyBrush(this.renderer, stroke);
    this.setDirty(true);
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
