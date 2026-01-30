// TerrainBrush: terrain brush state and stroke generation.
// TerrainBrush：地形画刷状态和笔触生成

import type { PerspectiveCamera } from "three/webgpu";
import { Raycaster, Vector2 } from "three/webgpu";

/**
 * Brush types for terrain editing.
 * 地形编辑的画刷类型
 */
export type BrushType = "raise" | "lower" | "smooth" | "flatten";

/**
 * Brush settings.
 * 画刷设置
 */
export interface BrushSettings {
  type: BrushType;
  radiusMeters: number;
  strength: number;
  falloff: number;
}

/**
 * Brush stroke event (for GPU processing).
 * 画刷笔触事件（用于 GPU 处理）
 */
export interface BrushStroke {
  worldX: number;
  worldZ: number;
  brush: BrushSettings;
  dt: number;
}

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
  private readonly raycaster = new Raycaster();
  private readonly mouseNdc = new Vector2();

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
    // Convert mouse to NDC.
    // 将鼠标转换为 NDC
    this.mouseNdc.x = (mouseX / canvasWidth) * 2 - 1;
    this.mouseNdc.y = -(mouseY / canvasHeight) * 2 + 1;

    // Cast ray from camera.
    // 从相机投射射线
    this.raycaster.setFromCamera(this.mouseNdc, camera);

    const ray = this.raycaster.ray;
    const origin = ray.origin;
    const direction = ray.direction;

    // Adaptive step ray marching for terrain intersection.
    // 自适应步长射线行进以检测地形交点
    const maxDist = 1000;
    const minStep = 0.5; // Minimum step size for accuracy / 最小步长以保证精度
    const maxStep = 5.0; // Maximum step size for performance / 最大步长以保证性能

    let t = 0;
    let prevT = 0;
    let prevAboveGround = true;
    let hitX = 0;
    let hitZ = 0;
    let found = false;

    // Initial sample to check if we're above ground.
    // 初始采样检查是否在地面上方
    {
      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      const terrainY = heightAt(x, z);
      prevAboveGround = y > terrainY;
    }

    while (t < maxDist) {
      // Adaptive step: smaller near camera, larger far away.
      // 自适应步长：靠近相机时较小，远离时较大
      const step = Math.min(maxStep, Math.max(minStep, t * 0.02 + minStep));
      t += step;

      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      const terrainY = heightAt(x, z);
      const aboveGround = y > terrainY;

      // Detect crossing from above to below ground (first intersection).
      // 检测从地面上方到下方的穿越（第一个交点）
      if (prevAboveGround && !aboveGround) {
        // Binary search to refine intersection point.
        // 二分搜索细化交点
        let lo = prevT;
        let hi = t;

        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) * 0.5;
          const mx = origin.x + direction.x * mid;
          const my = origin.y + direction.y * mid;
          const mz = origin.z + direction.z * mid;
          const mTerrainY = heightAt(mx, mz);

          if (my > mTerrainY) {
            lo = mid;
          } else {
            hi = mid;
          }
        }

        // Use the point just above the terrain.
        // 使用刚好在地形上方的点
        const finalT = (lo + hi) * 0.5;
        hitX = origin.x + direction.x * finalT;
        hitZ = origin.z + direction.z * finalT;
        found = true;
        break;
      }

      prevT = t - step;
      prevAboveGround = aboveGround;
    }

    this._targetValid = found;
    if (found) {
      this._targetX = hitX;
      this._targetZ = hitZ;
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
