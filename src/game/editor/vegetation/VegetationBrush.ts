// VegetationBrush: vegetation density painting brush state and stroke generation.
// VegetationBrush：植被密度绘制画刷状态和笔画生成

import type { PerspectiveCamera } from "three/webgpu";
import type { VegetationDefinition } from "./VegetationData";
import { getVegetationLayerNames } from "./VegetationData";
import { BrushRaycaster } from "../common/BrushRaycaster";

/**
 * Vegetation brush mode.
 * 植被画刷模式
 */
export type VegetationBrushMode = "add" | "remove" | "erase";

/**
 * Vegetation brush settings.
 * 植被画刷设置
 */
export interface VegetationBrushSettings {
  /** Brush mode: add, remove, or erase. / 画刷模式：添加、移除或擦除 */
  mode: VegetationBrushMode;
  /** Brush radius in meters. / 画刷半径（米） */
  radius: number;
  /** Brush strength (0-1). / 画刷强度（0-1） */
  strength: number;
  /** Brush falloff (0-1, 0 = hard edge, 1 = soft edge). / 画刷衰减（0-1，0=硬边缘，1=软边缘） */
  falloff: number;
  /** Selected vegetation layer name. / 选中的植被层名称 */
  selectedLayer: string;
}

/**
 * Vegetation brush stroke data for GPU processing.
 * 植被画刷笔画数据，用于 GPU 处理
 */
export interface VegetationBrushStroke {
  worldX: number;
  worldZ: number;
  radius: number;
  strength: number;
  falloff: number;
  targetChannel: 0 | 1 | 2 | 3;
  mode: VegetationBrushMode;
  dt: number;
}

const DEFAULT_BRUSH_SETTINGS: VegetationBrushSettings = {
  mode: "add",
  radius: 15,
  strength: 0.5,
  falloff: 0.5,
  selectedLayer: "",
};

/**
 * VegetationBrush: manages brush state for vegetation density painting.
 * VegetationBrush：管理植被密度绘制的画刷状态
 *
 * Follows same pattern as TextureBrush for consistency.
 * 与 TextureBrush 保持一致的设计模式
 */
export class VegetationBrush {
  // Brush settings.
  // 画刷设置
  private readonly _settings: VegetationBrushSettings;

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
  private readonly brushRaycaster = new BrushRaycaster();

  // Vegetation definition reference (for layer validation).
  // 植被定义引用（用于层验证）
  private vegetationDefinition: VegetationDefinition | null = null;

  constructor(settings?: Partial<VegetationBrushSettings>) {
    this._settings = { ...DEFAULT_BRUSH_SETTINGS, ...settings };
  }

  // --- Settings Accessors / 设置访问器 ---

  get settings(): Readonly<VegetationBrushSettings> {
    return this._settings;
  }

  get mode(): VegetationBrushMode {
    return this._settings.mode;
  }

  set mode(value: VegetationBrushMode) {
    this._settings.mode = value;
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
    if (!this.vegetationDefinition) return;
    if (getVegetationLayerNames(this.vegetationDefinition).includes(layerName)) {
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
   * Get available vegetation layer names.
   * 获取可用的植被层名称
   */
  get layerNames(): readonly string[] {
    if (!this.vegetationDefinition) return [];
    return getVegetationLayerNames(this.vegetationDefinition);
  }

  // --- Vegetation Definition / 植被定义 ---

  /**
   * Set vegetation definition for layer validation.
   * 设置用于层验证的植被定义
   */
  setVegetationDefinition(definition: VegetationDefinition | null): void {
    this.vegetationDefinition = definition;

    // Set default layer if not set.
    // 如果未设置则设置默认层
    if (definition && !this._settings.selectedLayer) {
      const names = getVegetationLayerNames(definition);
      if (names.length > 0) {
        this._settings.selectedLayer = names[0];
      }
    }
  }

  /**
   * Get the density channel for the selected layer.
   * 获取选中层的密度通道
   */
  getSelectedChannel(): 0 | 1 | 2 | 3 | -1 {
    if (!this.vegetationDefinition || !this._settings.selectedLayer) {
      return -1;
    }
    const layer = this.vegetationDefinition[this._settings.selectedLayer];
    if (!layer) return -1;
    return layer.densityChannel;
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
    const result = this.brushRaycaster.cast(
      mouseX,
      mouseY,
      canvasWidth,
      canvasHeight,
      camera,
      heightAt
    );

    this._targetValid = result.valid;
    if (result.valid) {
      this._targetX = result.x;
      this._targetZ = result.z;
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
  generateStroke(dt: number): VegetationBrushStroke | null {
    if (!this._active || !this._targetValid || !this.vegetationDefinition) {
      return null;
    }

    const channel = this.getSelectedChannel();
    if (channel === -1) {
      return null;
    }

    return {
      worldX: this._targetX,
      worldZ: this._targetZ,
      radius: this._settings.radius,
      strength: this._settings.strength,
      falloff: this._settings.falloff,
      targetChannel: channel,
      mode: this._settings.mode,
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
