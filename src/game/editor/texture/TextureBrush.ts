// TextureBrush: texture painting brush state and stroke generation.
// TextureBrush：纹理绘制画刷状态和笔画生成

import { Raycaster, Plane, Vector3, Vector2 } from "three/webgpu";
import type { PerspectiveCamera } from "three/webgpu";
import type { SplatBrushStroke } from "@game/world/terrain/gpu/SplatMapCompute";
import type { TextureDefinition } from "./TextureData";
import { getChannelForLayer, getLayerNames } from "./TextureData";

/**
 * Texture brush settings.
 * 纹理画刷设置
 */
export interface TextureBrushSettings {
  /** Brush radius in meters. / 画刷半径（米） */
  radius: number;
  /** Brush strength (0-1). / 画刷强度（0-1） */
  strength: number;
  /** Brush falloff (0-1, 0 = hard edge, 1 = soft edge). / 画刷衰减（0-1，0=硬边缘，1=软边缘） */
  falloff: number;
  /** Selected texture layer name. / 选中的纹理层名称 */
  selectedLayer: string;
}

const DEFAULT_BRUSH_SETTINGS: TextureBrushSettings = {
  radius: 20,
  strength: 0.5,
  falloff: 0.5,
  selectedLayer: "",
};

/**
 * TextureBrush: manages brush state for texture painting on terrain splat maps.
 * TextureBrush：管理地形 splat map 纹理绘制的画刷状态
 *
 * Follows same pattern as TerrainBrush for consistency.
 * 与 TerrainBrush 保持一致的设计模式
 */
export class TextureBrush {
  // Brush settings.
  // 画刷设置
  private readonly _settings: TextureBrushSettings;

  // Brush activation state.
  // 画刷激活状态
  private _active = false;

  // Brush target position.
  // 画刷目标位置
  private _targetValid = false;
  private _targetX = 0;
  private _targetZ = 0;

  // Raycasting for brush positioning.
  // 用于画刷定位的射线投射
  private readonly raycaster = new Raycaster();
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);

  // Texture definition reference (for layer validation).
  // 纹理定义引用（用于层验证）
  private textureDefinition: TextureDefinition | null = null;

  constructor(settings?: Partial<TextureBrushSettings>) {
    this._settings = { ...DEFAULT_BRUSH_SETTINGS, ...settings };
  }

  // --- Settings Accessors / 设置访问器 ---

  get settings(): Readonly<TextureBrushSettings> {
    return this._settings;
  }

  get radius(): number {
    return this._settings.radius;
  }

  set radius(value: number) {
    this._settings.radius = Math.max(1, Math.min(200, value));
  }

  get strength(): number {
    return this._settings.strength;
  }

  set strength(value: number) {
    this._settings.strength = Math.max(0, Math.min(1, value));
  }

  get falloff(): number {
    return this._settings.falloff;
  }

  set falloff(value: number) {
    this._settings.falloff = Math.max(0, Math.min(1, value));
  }

  get selectedLayer(): string {
    return this._settings.selectedLayer;
  }

  set selectedLayer(layerName: string) {
    if (!this.textureDefinition) return;
    if (getLayerNames(this.textureDefinition).includes(layerName)) {
      this._settings.selectedLayer = layerName;
    }
  }

  // --- State Accessors / 状态访问器 ---

  get active(): boolean {
    return this._active;
  }

  get targetValid(): boolean {
    return this._targetValid;
  }

  get targetX(): number {
    return this._targetX;
  }

  get targetZ(): number {
    return this._targetZ;
  }

  /**
   * Get available texture layer names.
   * 获取可用的纹理层名称
   */
  get layerNames(): readonly string[] {
    if (!this.textureDefinition) return [];
    return getLayerNames(this.textureDefinition);
  }

  // --- Texture Definition / 纹理定义 ---

  /**
   * Set texture definition for layer validation.
   * 设置用于层验证的纹理定义
   */
  setTextureDefinition(definition: TextureDefinition | null): void {
    this.textureDefinition = definition;

    // Set default layer if not set.
    // 如果未设置则设置默认层
    if (definition && !this._settings.selectedLayer) {
      const names = getLayerNames(definition);
      if (names.length > 0) {
        this._settings.selectedLayer = names[0];
      }
    }
  }

  // --- Brush Activation / 画刷激活 ---

  /**
   * Start brush painting.
   * 开始画刷绘制
   */
  start(): void {
    this._active = true;
  }

  /**
   * Stop brush painting.
   * 停止画刷绘制
   */
  stop(): void {
    this._active = false;
  }

  // --- Target Tracking / 目标跟踪 ---

  /**
   * Update brush target position from mouse position.
   * 从鼠标位置更新画刷目标位置
   */
  updateTarget(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number
  ): void {
    // Convert mouse to normalized device coordinates.
    // 将鼠标转换为标准化设备坐标
    const ndc = new Vector2(
      (mouseX / canvasWidth) * 2 - 1,
      -(mouseY / canvasHeight) * 2 + 1
    );

    this.raycaster.setFromCamera(ndc, camera);

    // Intersect with ground plane at y=0.
    // 与 y=0 的地面平面相交
    const intersection = new Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, intersection)) {
      this._targetX = intersection.x;
      this._targetZ = intersection.z;

      // Adjust plane height to actual terrain height.
      // 将平面高度调整为实际地形高度
      const terrainY = heightAt(intersection.x, intersection.z);
      this.groundPlane.constant = -terrainY;

      // Re-intersect with adjusted plane for precision.
      // 与调整后的平面重新相交以提高精度
      if (this.raycaster.ray.intersectPlane(this.groundPlane, intersection)) {
        this._targetX = intersection.x;
        this._targetZ = intersection.z;
      }

      this._targetValid = true;
    } else {
      this._targetValid = false;
    }
  }

  /**
   * Invalidate brush target.
   * 使画刷目标无效
   */
  invalidateTarget(): void {
    this._targetValid = false;
  }

  // --- Stroke Generation / 笔画生成 ---

  /**
   * Generate a brush stroke if brush is active and target is valid.
   * 如果画刷激活且目标有效则生成画刷笔画
   *
   * @returns Brush stroke or null if cannot paint.
   */
  generateStroke(dt: number): SplatBrushStroke | null {
    if (!this._active || !this._targetValid || !this.textureDefinition) {
      return null;
    }

    const channel = getChannelForLayer(this._settings.selectedLayer, this.textureDefinition);
    if (channel === -1) {
      return null;
    }

    return {
      worldX: this._targetX,
      worldZ: this._targetZ,
      radius: this._settings.radius,
      strength: this._settings.strength,
      falloff: this._settings.falloff,
      targetLayer: channel,
      dt,
    };
  }

  // --- Reset / 重置 ---

  /**
   * Reset brush state.
   * 重置画刷状态
   */
  reset(): void {
    this._active = false;
    this._targetValid = false;
  }
}
