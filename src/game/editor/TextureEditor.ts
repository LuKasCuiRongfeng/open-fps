// TextureEditor: texture painting state and brush management.
// TextureEditor：纹理绘制状态和画刷管理

import type { PerspectiveCamera } from "three/webgpu";
import type { WebGPURenderer } from "three/webgpu";
import { Raycaster, Plane, Vector3, Vector2 } from "three/webgpu";
import { SplatMapCompute, type SplatBrushStroke } from "../world/gpu/SplatMapCompute";
import {
  type TextureDefinition,
  type SplatMapData,
  getChannelForLayer,
  getLayerNames,
} from "./TextureData";
import { TextureStorage } from "./TextureStorage";

/**
 * Texture brush settings.
 * 纹理画刷设置
 */
export interface TextureBrushSettings {
  // Brush radius in meters.
  // 画刷半径（米）
  radius: number;
  // Brush strength (0-1).
  // 画刷强度（0-1）
  strength: number;
  // Brush falloff (0-1, 0 = hard edge, 1 = soft edge).
  // 画刷衰减（0-1，0=硬边缘，1=软边缘）
  falloff: number;
  // Selected texture layer name.
  // 选中的纹理层名称
  selectedLayer: string;
}

/**
 * TextureEditor: manages texture painting state on terrain.
 * TextureEditor：管理地形上的纹理绘制状态
 */
export class TextureEditor {
  // Splat map GPU compute.
  // Splat map GPU 计算
  private splatMapCompute: SplatMapCompute | null = null;

  // Texture definition loaded from project (null = procedural textures, editing disabled).
  // 从项目加载的纹理定义（null = 程序纹理，禁用编辑）
  private _textureDefinition: TextureDefinition | null = null;

  // Whether texture editing is enabled (requires texture.json).
  // 纹理编辑是否启用（需要 texture.json）
  private _editingEnabled = false;

  // Brush settings.
  // 画刷设置
  private _brushSettings: TextureBrushSettings = {
    radius: 20,
    strength: 0.5,
    falloff: 0.5,
    selectedLayer: "",
  };

  // Brush target state.
  // 画刷目标状态
  private _brushActive = false;
  private _brushTargetValid = false;
  private _brushTargetX = 0;
  private _brushTargetZ = 0;

  // Raycasting for brush positioning.
  // 用于画刷定位的射线投射
  private readonly raycaster = new Raycaster();
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);

  // Dirty flag: splat map has unsaved changes.
  // 脏标志：splat map 有未保存的更改
  private _dirty = false;

  // World size and offset for splat map alignment.
  // 用于 splat map 对齐的世界大小和偏移
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
   * Initialize GPU resources for splat map painting.
   * 初始化 splat map 绘制的 GPU 资源
   */
  async init(renderer: WebGPURenderer, worldSize: number = 1024): Promise<void> {
    this.renderer = renderer;
    // Splat map covers [-worldSize/2, worldSize/2] centered on origin.
    // Splat map 覆盖以原点为中心的 [-worldSize/2, worldSize/2] 范围
    this.worldOffsetX = -worldSize / 2;
    this.worldOffsetZ = -worldSize / 2;

    // Create splat map compute with resolution proportional to world size.
    // 创建分辨率与世界大小成比例的 splat map 计算
    const resolution = 1024; // 1 pixel per meter at default size
    this.splatMapCompute = new SplatMapCompute(resolution, worldSize);
    await this.splatMapCompute.init(renderer);

    // Set world offset.
    // 设置世界偏移
    this.splatMapCompute.setWorldOffset(this.worldOffsetX, this.worldOffsetZ);

    console.log(
      `[TextureEditor] Initialized with ${worldSize}m world, ${resolution}x${resolution} splat map`,
    );
  }

  /**
   * Load texture definition and splat map from project.
   * 从项目加载纹理定义和 splat map
   */
  async loadFromProject(projectPath: string): Promise<void> {
    // Load texture definition (null if doesn't exist).
    // 加载纹理定义（不存在则为 null）
    this._textureDefinition = await TextureStorage.loadTextureDefinition(projectPath);

    if (this._textureDefinition) {
      // Texture editing enabled.
      // 启用纹理编辑
      this._editingEnabled = true;

      // Set default selected layer to first one.
      // 将默认选中的层设置为第一个
      const names = getLayerNames(this._textureDefinition);
      if (names.length > 0) {
        this._brushSettings.selectedLayer = names[0];
      }

      // Ensure splat map exists.
      // 确保 splat map 存在
      await TextureStorage.ensureSplatMap(projectPath);

      // Load splat map.
      // 加载 splat map
      const splatMapData = await TextureStorage.loadSplatMap(projectPath);
      if (splatMapData && this.splatMapCompute && this.renderer) {
        await this.splatMapCompute.loadFromPixels(this.renderer, splatMapData.pixels);
      }

      console.log("[TextureEditor] Loaded textures from project:", projectPath);
    } else {
      // No texture.json, use procedural textures.
      // 没有 texture.json，使用程序纹理
      this._editingEnabled = false;
      this._brushSettings.selectedLayer = "";
      console.log("[TextureEditor] No texture.json, using procedural textures");
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

    // Save texture definition.
    // 保存纹理定义
    await TextureStorage.saveTextureDefinition(projectPath, this._textureDefinition);

    // Save splat map.
    // 保存 splat map
    if (this.splatMapCompute && this.renderer) {
      const pixels = await this.splatMapCompute.readToPixels(this.renderer);
      const splatMapData: SplatMapData = {
        resolution: this.splatMapCompute.getResolution(),
        pixels,
      };
      await TextureStorage.saveSplatMap(projectPath, splatMapData);
    }

    this.setDirty(false);
    console.log("[TextureEditor] Saved to project:", projectPath);
  }

  // --- Getters / 获取器 ---

  get textureDefinition(): Readonly<TextureDefinition> | null {
    return this._textureDefinition;
  }

  /**
   * Whether texture editing is enabled (texture.json exists).
   * 纹理编辑是否启用（texture.json 存在）
   */
  get editingEnabled(): boolean {
    return this._editingEnabled;
  }

  get brushSettings(): Readonly<TextureBrushSettings> {
    return this._brushSettings;
  }

  get brushActive(): boolean {
    return this._brushActive;
  }

  get brushTargetValid(): boolean {
    return this._brushTargetValid;
  }

  get brushTargetX(): number {
    return this._brushTargetX;
  }

  get brushTargetZ(): number {
    return this._brushTargetZ;
  }

  get dirty(): boolean {
    return this._dirty;
  }

  /**
   * Get available texture layer names.
   * 获取可用的纹理层名称
   */
  get layerNames(): readonly string[] {
    if (!this._textureDefinition) return [];
    return getLayerNames(this._textureDefinition);
  }

  /**
   * Get the splat map texture for material rendering.
   * 获取用于材质渲染的 splat map 纹理
   */
  getSplatTexture() {
    return this.splatMapCompute?.getSplatTexture() ?? null;
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

  // --- Brush Settings / 画刷设置 ---

  setSelectedLayer(layerName: string): void {
    if (!this._textureDefinition) return;
    if (getLayerNames(this._textureDefinition).includes(layerName)) {
      this._brushSettings.selectedLayer = layerName;
    }
  }

  setBrushRadius(radius: number): void {
    this._brushSettings.radius = Math.max(1, Math.min(200, radius));
  }

  setBrushStrength(strength: number): void {
    this._brushSettings.strength = Math.max(0, Math.min(1, strength));
  }

  setBrushFalloff(falloff: number): void {
    this._brushSettings.falloff = Math.max(0, Math.min(1, falloff));
  }

  // --- Brush Input / 画刷输入 ---

  /**
   * Update brush target position from mouse position.
   * 从鼠标位置更新画刷目标位置
   */
  updateBrushTarget(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number,
  ): void {
    // Convert mouse to normalized device coordinates.
    // 将鼠标转换为标准化设备坐标
    const ndc = new Vector2(
      (mouseX / canvasWidth) * 2 - 1,
      -(mouseY / canvasHeight) * 2 + 1,
    );

    this.raycaster.setFromCamera(ndc, camera);

    // Intersect with ground plane at y=0.
    // 与 y=0 的地面平面相交
    const intersection = new Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, intersection)) {
      this._brushTargetX = intersection.x;
      this._brushTargetZ = intersection.z;

      // Adjust plane height to actual terrain height.
      // 将平面高度调整为实际地形高度
      const terrainY = heightAt(intersection.x, intersection.z);
      this.groundPlane.constant = -terrainY;

      // Re-intersect with adjusted plane.
      // 与调整后的平面重新相交
      if (this.raycaster.ray.intersectPlane(this.groundPlane, intersection)) {
        this._brushTargetX = intersection.x;
        this._brushTargetZ = intersection.z;
      }

      this._brushTargetValid = true;
    } else {
      this._brushTargetValid = false;
    }
  }

  /**
   * Invalidate brush target (e.g., when not in edit mode).
   * 使画刷目标无效（例如，不在编辑模式时）
   */
  invalidateBrushTarget(): void {
    this._brushTargetValid = false;
  }

  /**
   * Start brush painting.
   * 开始画刷绘制
   */
  startBrush(): void {
    this._brushActive = true;
  }

  /**
   * Stop brush painting.
   * 停止画刷绘制
   */
  endBrush(): void {
    this._brushActive = false;
  }

  /**
   * Apply brush stroke to splat map.
   * 将画刷笔画应用到 splat map
   */
  async applyBrush(dt: number): Promise<void> {
    if (!this._editingEnabled || !this._textureDefinition) return;
    if (!this._brushActive || !this._brushTargetValid || !this.splatMapCompute || !this.renderer) {
      return;
    }

    // Get channel index for selected layer.
    // 获取选中层的通道索引
    const channel = getChannelForLayer(
      this._brushSettings.selectedLayer,
      this._textureDefinition,
    );
    if (channel === -1) {
      console.warn(`[TextureEditor] Invalid layer: ${this._brushSettings.selectedLayer}`);
      return;
    }

    // Create brush stroke.
    // 创建画刷笔画
    const stroke: SplatBrushStroke = {
      worldX: this._brushTargetX,
      worldZ: this._brushTargetZ,
      radius: this._brushSettings.radius,
      strength: this._brushSettings.strength,
      falloff: this._brushSettings.falloff,
      targetLayer: channel,
      dt,
    };

    // Apply to splat map.
    // 应用到 splat map
    await this.splatMapCompute.applyBrush(this.renderer, stroke);

    // Mark as dirty.
    // 标记为脏
    this.setDirty(true);
  }

  /**
   * Reset brush state.
   * 重置画刷状态
   */
  reset(): void {
    this._brushActive = false;
    this._brushTargetValid = false;
  }

  // --- Texture Definition Editing / 纹理定义编辑 ---

  /**
   * Update a texture layer definition.
   * 更新纹理层定义
   */
  updateLayerDefinition(
    layerName: string,
    updates: Partial<TextureDefinition[string]>,
  ): void {
    if (!this._textureDefinition || !this._textureDefinition[layerName]) return;
    Object.assign(this._textureDefinition[layerName], updates);
    this.setDirty(true);
  }

  // --- Disposal / 清理 ---

  dispose(): void {
    this.splatMapCompute?.dispose();
    this.splatMapCompute = null;
    this.renderer = null;
    console.log("[TextureEditor] Disposed");
  }
}
