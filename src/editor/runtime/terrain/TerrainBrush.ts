// TerrainBrush: terrain brush state and stroke generation.
// TerrainBrush：地形画刷状态和笔触生成

import type { PerspectiveCamera } from "three/webgpu";
import type { BrushSettings, BrushStroke, BrushType } from "@game/world/terrain/brushTypes";
import { TerrainSurfaceRaycaster } from "../common/TerrainSurfaceRaycaster";

export type { BrushSettings, BrushStroke, BrushType };

/**
 * TerrainBrush: manages brush state and stroke generation.
 * TerrainBrush：管理画刷状态和笔触生成
 */
export class TerrainBrush {
  // Brush settings.
  // 画刷设置
  private _settings: BrushSettings = {
    type: "raise",
    radiusMeters: 10,
    strength: 0.5,
    falloff: 0.7,
  };

  // Is brush currently active (mouse down).
  // 画刷是否正在激活（鼠标按下）
  private _active = false;

  // Current brush target position.
  // 当前画刷目标位置
  private _targetX = 0;
  private _targetZ = 0;
  private _targetValid = false;

  // Raycaster for terrain picking.
  // 用于地形拾取的射线投射器
  private readonly terrainRaycaster = new TerrainSurfaceRaycaster();

  // Pending brush strokes for GPU processing.
  // 待 GPU 处理的画刷笔触
  private readonly pendingStrokes: BrushStroke[] = [];

  // --- Getters / 获取器 ---

  get settings(): Readonly<BrushSettings> {
    return this._settings;
  }

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

  // --- Setters / 设置器 ---

  setType(type: BrushType): void {
    this._settings.type = type;
  }

  setRadius(radius: number): void {
    this._settings.radiusMeters = Math.max(1, Math.min(100, radius));
  }

  setStrength(strength: number): void {
    this._settings.strength = Math.max(0, Math.min(1, strength));
  }

  setFalloff(falloff: number): void {
    this._settings.falloff = Math.max(0, Math.min(1, falloff));
  }

  // --- Brush Input / 画刷输入 ---

  /**
   * Update brush target from mouse position.
   * 从鼠标位置更新画刷目标
   *
   * Uses adaptive step ray marching for accurate terrain intersection.
   * 使用自适应步长射线行进来精确地形交点
   */
  updateTarget(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number
  ): void {
    const result = this.terrainRaycaster.cast(mouseX, mouseY, canvasWidth, canvasHeight, camera, heightAt);

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

  /**
   * Start brush stroke (mouse down).
   * 开始画刷笔触（鼠标按下）
   */
  start(): void {
    if (this._targetValid) {
      this._active = true;
    }
  }

  /**
   * End brush stroke (mouse up).
   * 结束画刷笔触（鼠标抬起）
   */
  end(): void {
    this._active = false;
  }

  /**
   * Reset brush state.
   * 重置画刷状态
   */
  reset(): void {
    this._active = false;
    this._targetValid = false;
  }

  /**
   * Apply brush stroke this frame.
   * 本帧应用画刷笔触
   *
   * @returns true if stroke was applied, false otherwise.
   */
  applyStroke(dt: number): boolean {
    if (!this._active || !this._targetValid) {
      return false;
    }

    const stroke: BrushStroke = {
      worldX: this._targetX,
      worldZ: this._targetZ,
      brush: { ...this._settings },
      dt,
    };

    this.pendingStrokes.push(stroke);
    return true;
  }

  /**
   * Get and clear pending strokes.
   * 获取并清除待处理的笔触
   */
  consumePendingStrokes(): BrushStroke[] {
    const strokes = [...this.pendingStrokes];
    this.pendingStrokes.length = 0;
    return strokes;
  }
}
