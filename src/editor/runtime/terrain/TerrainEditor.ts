// TerrainEditor: terrain editing state and brush management.
// TerrainEditor：地形编辑状态和画刷管理

import type { PerspectiveCamera } from "three/webgpu";
import type { TerrainConfig } from "@game/world/terrain/terrain";
import type { EditorMouseAction } from "@editor/settings";
import {
  createEmptyMapData,
  type MapData,
} from "@project/MapData";
import { EditorOrbitCamera } from "./EditorOrbitCamera";
import { TerrainBrush, type BrushType, type BrushStroke, type BrushSettings } from "./TerrainBrush";

/**
 * Editor mode.
 * 编辑器模式
 */
export type EditorMode = "edit";

// Re-export mouse action type from settings.
// 从设置重新导出鼠标操作类型
export type { EditorMouseAction };

/**
 * Editor mouse button configuration.
 * 编辑器鼠标按钮配置
 */
export interface EditorMouseConfig {
  leftButton: EditorMouseAction;
  rightButton: EditorMouseAction;
  middleButton: EditorMouseAction;
}

export type EditorCameraAction = Extract<EditorMouseAction, "orbit" | "pan">;
type TerrainHeightAt = (x: number, z: number) => number;
type TerrainHeightAvailability = (x: number, z: number) => boolean;

// Re-export types from TerrainBrush.
// 从 TerrainBrush 重新导出类型
export type { BrushType, BrushStroke, BrushSettings };

/**
 * TerrainEditor: manages terrain editing state.
 * TerrainEditor：管理地形编辑状态
 */
export class TerrainEditor {
  private readonly config: TerrainConfig;

  // Current map data (edits).
  // 当前地图数据（编辑）
  private mapData: MapData;

  // Editor mode stays edit-only; object selection is handled by the UI active editor state.
  // 编辑器模式固定为纯编辑；具体编辑对象由 UI 的 active editor 状态处理。
  private _mode: EditorMode = "edit";

  // Sub-components.
  // 子组件
  private readonly orbitCamera = new EditorOrbitCamera();
  private readonly _brush = new TerrainBrush();

  // Dirty flag: map has unsaved changes.
  // 脏标志：地图有未保存的更改
  private _dirty = false;

  // Mouse button configuration.
  // 鼠标按钮配置
  private _mouseConfig: EditorMouseConfig = {
    leftButton: "brush",
    rightButton: "orbit",
    middleButton: "pan",
  };

  // Sticky drag: when true, drag continues even if mouse leaves window.
  // 粘性拖拽：为 true 时，鼠标离开窗口后拖拽继续
  private _stickyDrag = false;

  // Callbacks.
  // 回调
  private onDirtyChange?: (dirty: boolean) => void;

  constructor(config: TerrainConfig) {
    this.config = config;

    // Create empty map data.
    // 创建空地图数据
    this.mapData = createEmptyMapData(
      config.height.seed,
      config.gpuCompute.tileResolution,
      config.streaming.chunkSizeMeters
    );
  }

  // --- Getters / 获取器 ---

  get mode(): EditorMode {
    return this._mode;
  }

  get brushSettings(): Readonly<BrushSettings> {
    return this._brush.settings;
  }

  /** @deprecated Use brushSettings instead */
  get brush(): Readonly<BrushSettings> {
    return this._brush.settings;
  }

  get brushActive(): boolean {
    return this._brush.active;
  }

  get brushTargetValid(): boolean {
    return this._brush.targetValid;
  }

  get brushTargetX(): number {
    return this._brush.targetX;
  }

  get brushTargetZ(): number {
    return this._brush.targetZ;
  }

  get dirty(): boolean {
    return this._dirty;
  }

  get currentMapData(): Readonly<MapData> {
    return this.mapData;
  }

  get mouseConfig(): Readonly<EditorMouseConfig> {
    return this._mouseConfig;
  }

  get isCameraControlActive(): boolean {
    return this.orbitCamera.isControlActive;
  }

  get stickyDrag(): boolean {
    return this._stickyDrag;
  }

  setStickyDrag(enabled: boolean): void {
    this._stickyDrag = enabled;
  }

  // --- Mouse Config / 鼠标配置 ---

  setMouseConfig(config: Partial<EditorMouseConfig>): void {
    if (config.leftButton !== undefined) {
      this._mouseConfig.leftButton = config.leftButton;
    }
    if (config.rightButton !== undefined) {
      this._mouseConfig.rightButton = config.rightButton;
    }
    if (config.middleButton !== undefined) {
      this._mouseConfig.middleButton = config.middleButton;
    }
  }

  swapMouseButtons(): void {
    const temp = this._mouseConfig.rightButton;
    this._mouseConfig.rightButton = this._mouseConfig.middleButton;
    this._mouseConfig.middleButton = temp;
  }

  getActionForButton(button: number): EditorMouseAction | null {
    switch (button) {
      case 0:
        return this._mouseConfig.leftButton;
      case 1:
        return this._mouseConfig.middleButton;
      case 2:
        return this._mouseConfig.rightButton;
      default:
        return null;
    }
  }

  // --- Mode Control / 模式控制 ---

  setMode(mode: EditorMode): void {
    if (this._mode !== mode) {
      this._mode = mode;
      this._brush.reset();
    }
  }

  // --- Brush Control / 画刷控制 ---

  setBrushType(type: BrushType): void {
    this._brush.setType(type);
  }

  setBrushRadius(radius: number): void {
    this._brush.setRadius(radius);
  }

  setBrushStrength(strength: number): void {
    this._brush.setStrength(strength);
  }

  setBrushFalloff(falloff: number): void {
    this._brush.setFalloff(falloff);
  }

  // --- Brush Input / 画刷输入 ---

  updateBrushTarget(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number
  ): void {
    this._brush.updateTarget(mouseX, mouseY, canvasWidth, canvasHeight, camera, heightAt);
  }

  startBrush(): void {
    this._brush.start();
  }

  endBrush(): void {
    this._brush.end();
  }

  applyBrush(dt: number): void {
    const applied = this._brush.applyStroke(dt);
    if (applied) {
      this.setDirty(true);
    }
  }

  consumePendingStrokes(): BrushStroke[] {
    return this._brush.consumePendingStrokes();
  }

  // --- Editor Camera Controls / 编辑器相机控制 ---

  startCameraControl(
    button: number,
    mouseX: number,
    mouseY: number,
    screenWidth?: number,
    screenHeight?: number,
    camera?: PerspectiveCamera,
    heightAt?: TerrainHeightAt,
    hasHeightAt?: TerrainHeightAvailability
  ): void {
    const action = this.getActionForButton(button);
    if (action === "orbit" || action === "pan") {
      this.startCameraAction(action, mouseX, mouseY, screenWidth, screenHeight, camera, heightAt, hasHeightAt);
    }
  }

  startCameraAction(
    action: EditorCameraAction,
    mouseX: number,
    mouseY: number,
    screenWidth?: number,
    screenHeight?: number,
    camera?: PerspectiveCamera,
    heightAt?: TerrainHeightAt,
    hasHeightAt?: TerrainHeightAvailability
  ): void {
    if (action === "orbit") {
      this.orbitCamera.startOrbit(mouseX, mouseY);
    } else {
      this.orbitCamera.startPan(mouseX, mouseY, screenWidth, screenHeight, camera, heightAt, hasHeightAt);
    }
  }

  frameCameraAt(targetX: number, targetY: number, targetZ: number, radius: number): void {
    this.orbitCamera.frameTarget(targetX, targetY, targetZ, radius);
  }

  endCameraControl(button: number): void {
    const action = this.getActionForButton(button);
    if (action === "orbit" || action === "pan") {
      this.endCameraAction(action);
    }
  }

  endCameraAction(action: EditorCameraAction): void {
    if (action === "orbit") {
      this.orbitCamera.stopOrbit();
    } else {
      this.orbitCamera.stopPan();
    }
  }

  /**
   * Check mouse button state and stop controls if buttons are released.
   * Used when mouse re-enters the editor area to fix "sticky" controls.
   * 检查鼠标按钮状态，如果按钮已释放则停止控制。
   * 当鼠标重新进入编辑区域时使用，修复"粘性"控制问题。
   */
  checkAndResetControls(buttons: number): void {
    if (this._stickyDrag) return; // Feature is enabled, don't reset. / 功能已启用，不重置

    // buttons is a bitmask: 1=left, 2=right, 4=middle
    // buttons 是位掩码：1=左键, 2=右键, 4=中键
    const leftPressed = (buttons & 1) !== 0;
    const rightPressed = (buttons & 2) !== 0;
    const middlePressed = (buttons & 4) !== 0;

    // Check orbit control (usually right button).
    // 检查轨道控制（通常是右键）
    if (this.orbitCamera.orbitActive) {
      const orbitButton = this.getButtonForAction("orbit");
      const shouldBeActive =
        (orbitButton === 0 && leftPressed) ||
        (orbitButton === 1 && middlePressed) ||
        (orbitButton === 2 && rightPressed);
      if (!shouldBeActive) {
        this.orbitCamera.stopOrbit();
      }
    }

    // Check pan control (usually middle button).
    // 检查平移控制（通常是中键）
    if (this.orbitCamera.panActive) {
      const panButton = this.getButtonForAction("pan");
      const shouldBeActive =
        (panButton === 0 && leftPressed) ||
        (panButton === 1 && middlePressed) ||
        (panButton === 2 && rightPressed);
      if (!shouldBeActive) {
        this.orbitCamera.stopPan();
      }
    }

    // Check brush (usually left button).
    // 检查画刷（通常是左键）
    if (this._brush.active) {
      const brushButton = this.getButtonForAction("brush");
      const shouldBeActive =
        (brushButton === 0 && leftPressed) ||
        (brushButton === 1 && middlePressed) ||
        (brushButton === 2 && rightPressed);
      if (!shouldBeActive) {
        this._brush.end();
      }
    }
  }

  /**
   * Get which button is assigned to an action.
   * 获取分配给某个动作的按钮
   */
  private getButtonForAction(action: EditorMouseAction): number {
    if (this._mouseConfig.leftButton === action) return 0;
    if (this._mouseConfig.middleButton === action) return 1;
    if (this._mouseConfig.rightButton === action) return 2;
    return -1;
  }

  updateCameraControl(
    mouseX: number,
    mouseY: number,
    screenWidth?: number,
    screenHeight?: number,
    camera?: PerspectiveCamera,
    heightAt?: TerrainHeightAt,
    hasHeightAt?: TerrainHeightAvailability
  ): void {
    this.orbitCamera.updateFromMouse(mouseX, mouseY, screenWidth, screenHeight, camera, heightAt, hasHeightAt);
  }

  zoomCamera(delta: number): void {
    this.orbitCamera.zoom(delta);
  }

  applyCameraState(camera: PerspectiveCamera, heightAt?: TerrainHeightAt, hasHeightAt?: TerrainHeightAvailability): void {
    this.orbitCamera.applyToCamera(camera, heightAt, hasHeightAt);
  }

  getCameraTarget(): { x: number; y: number; z: number } {
    return this.orbitCamera.getTarget();
  }

  // --- Map Data / 地图数据 ---

  getMapDataMut(): MapData {
    return this.mapData;
  }

  private setDirty(dirty: boolean): void {
    if (this._dirty !== dirty) {
      this._dirty = dirty;
      this.onDirtyChange?.(dirty);
    }
  }

  // Mark map as clean (saved).
  // 标记地图为干净（已保存）
  markClean(): void {
    this.setDirty(false);
  }

  newMap(name = "Untitled Map"): void {
    this.mapData = createEmptyMapData(
      this.config.height.seed,
      this.config.gpuCompute.tileResolution,
      this.config.streaming.chunkSizeMeters,
      name
    );
    this.setDirty(false);
  }

  loadMapData(mapData: MapData): void {
    this.mapData = {
      ...mapData,
      chunks: {},
      metadata: { ...mapData.metadata },
    };
    this.setDirty(false);
  }

  setMapName(name: string): void {
    this.mapData.metadata.name = name;
  }

  // --- Callbacks / 回调 ---

  setOnDirtyChange(callback: (dirty: boolean) => void): void {
    this.onDirtyChange = callback;
  }

  // --- Cleanup / 清理 ---

  dispose(): void {
    // Clean up any pending strokes.
    // 清理任何待处理的笔触
    this._brush.consumePendingStrokes();
  }
}
