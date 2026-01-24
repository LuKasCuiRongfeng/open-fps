// VegetationEditor: vegetation density painting coordinator.
// VegetationEditor：植被密度绘制协调器

import type { PerspectiveCamera, WebGPURenderer } from "three/webgpu";
import { VegetationDensityCompute } from "./VegetationDensityCompute";
import {
  type VegetationDefinition,
  type VegetationDensityMap,
} from "./VegetationData";
import { VegetationStorage } from "./VegetationStorage";
import {
  VegetationBrush,
  type VegetationBrushSettings,
  type VegetationBrushMode,
} from "./VegetationBrush";

/**
 * VegetationEditor: coordinates vegetation density painting on terrain.
 * VegetationEditor：协调地形上的植被密度绘制
 *
 * Delegates brush operations to VegetationBrush (mirrors TextureEditor pattern).
 * 将画刷操作委托给 VegetationBrush（与 TextureEditor 模式一致）
 */
export class VegetationEditor {
  // Density map GPU compute.
  // 密度贴图 GPU 计算
  private densityCompute: VegetationDensityCompute | null = null;

  // Vegetation brush (delegated).
  // 植被画刷（委托）
  private readonly brush = new VegetationBrush();

  // Vegetation definition loaded from project.
  // 从项目加载的植被定义
  private _vegetationDefinition: VegetationDefinition | null = null;

  // Whether vegetation editing is enabled.
  // 植被编辑是否启用
  private _editingEnabled = false;

  // Dirty flag.
  // 脏标志
  private _dirty = false;

  // World offset for density map alignment.
  // 用于密度贴图对齐的世界偏移
  private worldOffsetX = 0;
  private worldOffsetZ = 0;

  // Renderer reference.
  // 渲染器引用
  private renderer: WebGPURenderer | null = null;

  // Callbacks.
  // 回调
  private onDirtyChange?: (dirty: boolean) => void;

  constructor() {}

  // --- Initialization / 初始化 ---

  /**
   * Initialize GPU resources for density map painting.
   * 初始化密度贴图绘制的 GPU 资源
   */
  async init(renderer: WebGPURenderer, worldSize = 1024): Promise<void> {
    this.renderer = renderer;
    this.worldOffsetX = -worldSize / 2;
    this.worldOffsetZ = -worldSize / 2;

    const resolution = Math.min(4096, Math.max(1024, Math.ceil(worldSize / 2)));
    this.densityCompute = new VegetationDensityCompute(resolution, worldSize);
    await this.densityCompute.init(renderer);
    this.densityCompute.setWorldOffset(this.worldOffsetX, this.worldOffsetZ);
  }

  /**
   * Load vegetation definition and density map from project.
   * 从项目加载植被定义和密度贴图
   */
  async loadFromProject(projectPath: string): Promise<void> {
    this._vegetationDefinition = await VegetationStorage.loadVegetationDefinition(projectPath);

    if (this._vegetationDefinition) {
      this._editingEnabled = true;
      this.brush.setVegetationDefinition(this._vegetationDefinition);

      const expectedResolution = this.densityCompute?.getResolution() ?? 1024;
      await VegetationStorage.ensureDensityMap(projectPath, expectedResolution);

      const densityMapData = await VegetationStorage.loadDensityMap(projectPath);
      if (densityMapData && this.densityCompute && this.renderer) {
        await this.densityCompute.loadFromPixels(
          this.renderer,
          densityMapData.pixels,
          densityMapData.resolution
        );
      }
    } else {
      this._editingEnabled = false;
      this.brush.setVegetationDefinition(null);
    }

    this._dirty = false;
  }

  /**
   * Save vegetation definition and density map to project.
   * 将植被定义和密度贴图保存到项目
   */
  async saveToProject(projectPath: string): Promise<void> {
    if (!this._editingEnabled || !this._vegetationDefinition) {
      console.warn("[VegetationEditor] Cannot save: vegetation editing not enabled");
      return;
    }

    await VegetationStorage.saveVegetationDefinition(projectPath, this._vegetationDefinition);

    if (this.densityCompute && this.renderer) {
      const pixels = await this.densityCompute.readToPixels(this.renderer);
      const densityMapData: VegetationDensityMap = {
        resolution: this.densityCompute.getResolution(),
        pixels,
      };
      await VegetationStorage.saveDensityMap(projectPath, densityMapData);
    }

    this.setDirty(false);
  }

  // --- Getters / 获取器 ---

  get vegetationDefinition(): Readonly<VegetationDefinition> | null {
    return this._vegetationDefinition;
  }

  get editingEnabled(): boolean {
    return this._editingEnabled;
  }

  get brushSettings(): Readonly<VegetationBrushSettings> {
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
   * Get the density map texture for vegetation rendering.
   * 获取用于植被渲染的密度贴图纹理
   */
  getDensityTexture() {
    return this.densityCompute?.getDensityTexture() ?? null;
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

  setBrushMode(mode: VegetationBrushMode): void {
    this.brush.mode = mode;
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
   * Apply brush stroke to density map.
   * 将画刷笔画应用到密度贴图
   */
  async applyBrush(dt: number): Promise<void> {
    if (!this._editingEnabled || !this.densityCompute || !this.renderer) {
      return;
    }

    const stroke = this.brush.generateStroke(dt);
    if (!stroke) return;

    await this.densityCompute.applyBrush(this.renderer, stroke);
    this.setDirty(true);
  }

  /**
   * Sync GPU density data to CPU for VegetationSystem sampling.
   * 将 GPU 密度数据同步到 CPU 供 VegetationSystem 采样
   */
  async syncDensityToCpu(): Promise<void> {
    if (!this.densityCompute || !this.renderer) return;
    await this.densityCompute.syncToCpu(this.renderer);
  }

  /**
   * Check if CPU sync is needed.
   * 检查是否需要 CPU 同步
   */
  get needsCpuSync(): boolean {
    return this.densityCompute?.needsCpuSync ?? false;
  }

  reset(): void {
    this.brush.reset();
  }

  // --- Vegetation Definition Editing / 植被定义编辑 ---

  updateLayerDefinition(
    layerName: string,
    updates: Partial<VegetationDefinition[string]>
  ): void {
    if (!this._vegetationDefinition || !this._vegetationDefinition[layerName]) return;
    Object.assign(this._vegetationDefinition[layerName], updates);
    this.setDirty(true);
  }

  // --- Disposal / 清理 ---

  dispose(): void {
    this.densityCompute?.dispose();
    this.densityCompute = null;
    this.renderer = null;
  }
}
