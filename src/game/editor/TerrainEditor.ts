// TerrainEditor: terrain editing state and brush management.
// TerrainEditor：地形编辑状态和画刷管理

import type { PerspectiveCamera } from "three/webgpu";
import type { TerrainConfig } from "../world/terrain";
import {
  createEmptyMapData,
  deserializeMapData,
  serializeMapData,
  type MapData,
} from "./MapData";
import { EditorOrbitCamera } from "./EditorOrbitCamera";
import { TerrainBrush, type BrushType, type BrushStroke, type BrushSettings } from "./TerrainBrush";

/**
 * Editor mode.
 * 编辑器模式
 */
export type EditorMode = "play" | "edit";

/**
 * Mouse button actions in edit mode.
 * 编辑模式下的鼠标按钮操作
 */
export type EditorMouseAction = "brush" | "orbit" | "pan";

/**
 * Editor mouse button configuration.
 * 编辑器鼠标按钮配置
 */
export interface EditorMouseConfig {
  leftButton: EditorMouseAction;
  rightButton: EditorMouseAction;
  middleButton: EditorMouseAction;
}

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

  // Editor mode.
  // 编辑器模式
  private _mode: EditorMode = "play";

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

  // Callbacks.
  // 回调
  private onModeChange?: (mode: EditorMode) => void;
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
      this.onModeChange?.(mode);
      this._brush.reset();
    }
  }

  toggleMode(): void {
    this.setMode(this._mode === "play" ? "edit" : "play");
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
    if (this._mode !== "edit") {
      this._brush.invalidateTarget();
      return;
    }
    this._brush.updateTarget(mouseX, mouseY, canvasWidth, canvasHeight, camera, heightAt);
  }

  startBrush(): void {
    if (this._mode === "edit") {
      this._brush.start();
    }
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

  initCameraFromPlayer(playerX: number, playerY: number, playerZ: number): void {
    this.orbitCamera.initFromPlayer(playerX, playerY, playerZ);
  }

  startCameraControl(button: number, mouseX: number, mouseY: number): void {
    if (this._mode !== "edit") return;

    const action = this.getActionForButton(button);
    if (action === "orbit") {
      this.orbitCamera.startOrbit(mouseX, mouseY);
    } else if (action === "pan") {
      this.orbitCamera.startPan(mouseX, mouseY);
    }
  }

  endCameraControl(button: number): void {
    const action = this.getActionForButton(button);
    if (action === "orbit") {
      this.orbitCamera.stopOrbit();
    } else if (action === "pan") {
      this.orbitCamera.stopPan();
    }
  }

  updateCameraControl(mouseX: number, mouseY: number): void {
    if (this._mode !== "edit") return;
    this.orbitCamera.updateFromMouse(mouseX, mouseY);
  }

  zoomCamera(delta: number): void {
    if (this._mode !== "edit") return;
    this.orbitCamera.zoom(delta);
  }

  applyCameraState(camera: PerspectiveCamera): void {
    if (this._mode !== "edit") return;
    this.orbitCamera.applyToCamera(camera);
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

  newMap(name = "Untitled Map"): void {
    this.mapData = createEmptyMapData(
      this.config.height.seed,
      this.config.gpuCompute.tileResolution,
      this.config.streaming.chunkSizeMeters,
      name
    );
    this.setDirty(false);
  }

  loadMap(json: string): void {
    this.mapData = deserializeMapData(json);
    this.setDirty(false);
  }

  saveMap(): string {
    const json = serializeMapData(this.mapData);
    this.setDirty(false);
    return json;
  }

  setMapName(name: string): void {
    this.mapData.metadata.name = name;
  }

  // --- Callbacks / 回调 ---

  setOnModeChange(callback: (mode: EditorMode) => void): void {
    this.onModeChange = callback;
  }

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
