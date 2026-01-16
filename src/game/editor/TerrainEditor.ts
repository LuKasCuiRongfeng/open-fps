// TerrainEditor: terrain editing state and brush management.
// TerrainEditor：地形编辑状态和画刷管理

import type { PerspectiveCamera } from "three/webgpu";
import { Raycaster, Vector2, Vector3, Spherical, MathUtils } from "three/webgpu";
import type { TerrainConfig } from "../world/terrain";
import {
  createEmptyMapData,
  deserializeMapData,
  serializeMapData,
  type MapData,
} from "./MapData";

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
  radiusMeters: number;   // Brush radius in meters / 画刷半径（米）
  strength: number;       // Brush strength 0..1 / 画刷强度 0..1
  falloff: number;        // Edge falloff 0..1 (0=hard, 1=soft) / 边缘衰减 0..1
}

/**
 * Editor mode.
 * 编辑器模式
 */
export type EditorMode = "play" | "edit";

/**
 * Brush stroke event (for GPU processing).
 * 画刷笔触事件（用于 GPU 处理）
 */
export interface BrushStroke {
  worldX: number;
  worldZ: number;
  brush: BrushSettings;
  dt: number;  // Delta time for strength scaling / 用于强度缩放的时间增量
}

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
  leftButton: EditorMouseAction;    // Left mouse button action / 左键操作
  rightButton: EditorMouseAction;   // Right mouse button action / 右键操作
  middleButton: EditorMouseAction;  // Middle mouse button action / 中键操作
}

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

  // Brush settings.
  // 画刷设置
  private _brush: BrushSettings = {
    type: "raise",
    radiusMeters: 10,
    strength: 0.5,
    falloff: 0.7,
  };

  // Is brush currently active (mouse down).
  // 画刷是否正在激活（鼠标按下）
  private _brushActive = false;

  // Current brush target position.
  // 当前画刷目标位置
  private _brushTargetX = 0;
  private _brushTargetZ = 0;
  private _brushTargetValid = false;

  // Raycaster for terrain picking.
  // 用于地形拾取的射线投射器
  private readonly raycaster = new Raycaster();
  private readonly mouseNdc = new Vector2();

  // Pending brush strokes for GPU processing.
  // 待 GPU 处理的画刷笔触
  private readonly pendingStrokes: BrushStroke[] = [];

  // Dirty flag: map has unsaved changes.
  // 脏标志：地图有未保存的更改
  private _dirty = false;

  // --- Editor Camera State (orbit mode) / 编辑器相机状态（轨道模式） ---
  // Spherical coords for orbit camera.
  // 轨道相机的球坐标
  private readonly cameraSpherical = new Spherical(100, Math.PI / 3, 0);
  private readonly cameraTarget = new Vector3(0, 0, 0);
  private readonly cameraTempVec = new Vector3();

  // Mouse button configuration (user-configurable).
  // 鼠标按钮配置（用户可配置）
  private _mouseConfig: EditorMouseConfig = {
    leftButton: "brush",    // Default: left = brush / 默认：左键 = 画刷
    rightButton: "orbit",   // Default: right = orbit / 默认：右键 = 轨道旋转
    middleButton: "pan",    // Default: middle = pan / 默认：中键 = 平移
  };

  // Camera drag state.
  // 相机拖拽状态
  private _cameraOrbitActive = false;     // Orbit active / 轨道旋转激活
  private _cameraPanActive = false;        // Pan active / 平移激活
  private _lastMouseX = 0;
  private _lastMouseY = 0;

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

  get brush(): Readonly<BrushSettings> {
    return this._brush;
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

  get currentMapData(): Readonly<MapData> {
    return this.mapData;
  }

  get mouseConfig(): Readonly<EditorMouseConfig> {
    return this._mouseConfig;
  }

  /**
   * Set mouse button configuration.
   * 设置鼠标按钮配置
   */
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

  /**
   * Swap middle and right button actions.
   * 交换中键和右键操作
   */
  swapMouseButtons(): void {
    const temp = this._mouseConfig.rightButton;
    this._mouseConfig.rightButton = this._mouseConfig.middleButton;
    this._mouseConfig.middleButton = temp;
  }

  /**
   * Get action for a mouse button.
   * 获取鼠标按钮的操作
   */
  getActionForButton(button: number): EditorMouseAction | null {
    switch (button) {
      case 0: return this._mouseConfig.leftButton;
      case 1: return this._mouseConfig.middleButton;
      case 2: return this._mouseConfig.rightButton;
      default: return null;
    }
  }

  // --- Mode Control / 模式控制 ---

  setMode(mode: EditorMode): void {
    if (this._mode !== mode) {
      this._mode = mode;
      this.onModeChange?.(mode);

      // Reset brush state when changing mode.
      // 切换模式时重置画刷状态
      this._brushActive = false;
      this._brushTargetValid = false;
    }
  }

  toggleMode(): void {
    this.setMode(this._mode === "play" ? "edit" : "play");
  }

  // --- Brush Control / 画刷控制 ---

  setBrushType(type: BrushType): void {
    this._brush.type = type;
  }

  setBrushRadius(radius: number): void {
    this._brush.radiusMeters = Math.max(1, Math.min(100, radius));
  }

  setBrushStrength(strength: number): void {
    this._brush.strength = Math.max(0, Math.min(1, strength));
  }

  setBrushFalloff(falloff: number): void {
    this._brush.falloff = Math.max(0, Math.min(1, falloff));
  }

  // --- Brush Input / 画刷输入 ---

  /**
   * Update brush target from mouse position.
   * 从鼠标位置更新画刷目标
   */
  updateBrushTarget(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number
  ): void {
    if (this._mode !== "edit") {
      this._brushTargetValid = false;
      return;
    }

    // Convert mouse to NDC.
    // 将鼠标转换为 NDC
    this.mouseNdc.x = (mouseX / canvasWidth) * 2 - 1;
    this.mouseNdc.y = -(mouseY / canvasHeight) * 2 + 1;

    // Cast ray from camera.
    // 从相机投射射线
    this.raycaster.setFromCamera(this.mouseNdc, camera);

    // Intersect with terrain (simple ground plane approximation).
    // 与地形相交（简单地面平面近似）
    // For better accuracy, we do iterative refinement.
    // 为了更好的精度，我们做迭代细化
    const ray = this.raycaster.ray;
    const origin = ray.origin;
    const direction = ray.direction;

    // Start from camera, step along ray until we hit terrain.
    // 从相机开始，沿射线步进直到碰到地形
    let t = 0;
    const maxDist = 500;  // Max raycast distance / 最大射线距离
    const step = 2;       // Step size / 步长

    let hitX = 0;
    let hitZ = 0;
    let found = false;

    for (t = 0; t < maxDist; t += step) {
      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;

      const terrainY = heightAt(x, z);

      if (y <= terrainY) {
        // Found intersection, refine with binary search.
        // 找到相交，用二分搜索细化
        let lo = Math.max(0, t - step);
        let hi = t;

        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) * 0.5;
          const mx = origin.x + direction.x * mid;
          const my = origin.y + direction.y * mid;
          const mz = origin.z + direction.z * mid;
          const mTerrainY = heightAt(mx, mz);

          if (my <= mTerrainY) {
            hi = mid;
          } else {
            lo = mid;
          }
        }

        hitX = origin.x + direction.x * hi;
        hitZ = origin.z + direction.z * hi;
        found = true;
        break;
      }
    }

    this._brushTargetValid = found;
    if (found) {
      this._brushTargetX = hitX;
      this._brushTargetZ = hitZ;
    }
  }

  /**
   * Start brush stroke (mouse down).
   * 开始画刷笔触（鼠标按下）
   */
  startBrush(): void {
    if (this._mode === "edit" && this._brushTargetValid) {
      this._brushActive = true;
    }
  }

  /**
   * End brush stroke (mouse up).
   * 结束画刷笔触（鼠标抬起）
   */
  endBrush(): void {
    this._brushActive = false;
  }

  /**
   * Apply brush stroke this frame.
   * 本帧应用画刷笔触
   */
  applyBrush(dt: number): BrushStroke | null {
    if (!this._brushActive || !this._brushTargetValid) {
      return null;
    }

    const stroke: BrushStroke = {
      worldX: this._brushTargetX,
      worldZ: this._brushTargetZ,
      brush: { ...this._brush },
      dt,
    };

    this.pendingStrokes.push(stroke);
    this.setDirty(true);

    return stroke;
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

  // --- Editor Camera Controls / 编辑器相机控制 ---

  /**
   * Initialize camera position from current player position.
   * 从当前玩家位置初始化相机位置
   *
   * Always reinitializes to player position on mode switch.
   * 切换模式时总是重新初始化到玩家位置
   */
  initCameraFromPlayer(playerX: number, playerY: number, playerZ: number): void {
    this.cameraTarget.set(playerX, playerY, playerZ);
    // Set initial orbit distance and angles.
    // 设置初始轨道距离和角度
    this.cameraSpherical.radius = 100;
    this.cameraSpherical.phi = Math.PI / 3; // 60 degrees from top / 从顶部 60 度
    this.cameraSpherical.theta = 0;
  }

  /**
   * Handle mouse down for camera control.
   * 处理相机控制的鼠标按下
   */
  startCameraControl(button: number, mouseX: number, mouseY: number): void {
    if (this._mode !== "edit") return;

    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;

    const action = this.getActionForButton(button);
    if (action === "orbit") {
      this._cameraOrbitActive = true;
    } else if (action === "pan") {
      this._cameraPanActive = true;
    }
    // "brush" is handled separately via startBrush/endBrush
    // "brush" 通过 startBrush/endBrush 单独处理
  }

  /**
   * Handle mouse up for camera control.
   * 处理相机控制的鼠标抬起
   */
  endCameraControl(button: number): void {
    const action = this.getActionForButton(button);
    if (action === "orbit") {
      this._cameraOrbitActive = false;
    } else if (action === "pan") {
      this._cameraPanActive = false;
    }
    // "brush" is handled separately via startBrush/endBrush
    // "brush" 通过 startBrush/endBrush 单独处理
  }

  /**
   * Handle mouse move for camera control.
   * 处理相机控制的鼠标移动
   */
  updateCameraControl(mouseX: number, mouseY: number): void {
    if (this._mode !== "edit") return;

    const dx = mouseX - this._lastMouseX;
    const dy = mouseY - this._lastMouseY;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;

    const sensitivity = 0.01;

    if (this._cameraOrbitActive) {
      // Orbit: rotate around target.
      // 轨道：围绕目标旋转
      this.cameraSpherical.theta -= dx * sensitivity;
      this.cameraSpherical.phi -= dy * sensitivity;  // Inverted: drag up = look down / 反转：向上拖 = 向下看

      // Clamp phi: min ~15° from top, max ~80° from horizontal (stay above ground).
      // 限制 phi：最小从顶部约 15°，最大从水平约 80°（保持在地面上方）
      // phi=0 is straight up, phi=PI/2 is horizontal, phi=PI is straight down.
      // phi=0 是正上方，phi=PI/2 是水平，phi=PI 是正下方
      this.cameraSpherical.phi = MathUtils.clamp(
        this.cameraSpherical.phi,
        0.26,  // ~15 degrees from top / 从顶部约 15 度
        1.40   // ~80 degrees from top / 从顶部约 80 度 (not going below horizon)
      );
    }

    if (this._cameraPanActive) {
      // Pan: move target in camera plane.
      // 平移：在相机平面内移动目标
      const panSpeed = this.cameraSpherical.radius * 0.002;

      // Calculate right and forward vectors in world space.
      // 计算世界空间中的右向量和前向向量
      const sinPhi = Math.sin(this.cameraSpherical.phi);
      const sinTheta = Math.sin(this.cameraSpherical.theta);
      const cosTheta = Math.cos(this.cameraSpherical.theta);

      // Right vector (perpendicular to view direction in XZ plane).
      // 右向量（在 XZ 平面内垂直于视线方向）
      const rightX = -cosTheta;
      const rightZ = sinTheta;

      // Forward vector in XZ plane.
      // XZ 平面内的前向向量
      const forwardX = sinTheta * sinPhi;
      const forwardZ = cosTheta * sinPhi;

      // Apply pan: left/right follows drag, forward/backward inverted to match intuition.
      // 应用平移：左右跟随拖拽，前后反转以匹配直觉
      // Drag up → move target forward (into screen), drag down → move target backward.
      // 向上拖 → 目标向前（屏幕里），向下拖 → 目标向后
      this.cameraTarget.x += dx * panSpeed * rightX - dy * panSpeed * forwardX;
      this.cameraTarget.z += dx * panSpeed * rightZ - dy * panSpeed * forwardZ;
    }
  }

  /**
   * Handle scroll wheel for camera zoom.
   * 处理相机缩放的滚轮
   */
  zoomCamera(delta: number): void {
    if (this._mode !== "edit") return;

    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    this.cameraSpherical.radius *= zoomFactor;

    // Clamp zoom range.
    // 限制缩放范围
    this.cameraSpherical.radius = MathUtils.clamp(
      this.cameraSpherical.radius,
      10,
      1000
    );
  }

  /**
   * Apply camera state to actual camera.
   * 将相机状态应用到实际相机
   */
  applyCameraState(camera: PerspectiveCamera): void {
    if (this._mode !== "edit") return;

    // Convert spherical to cartesian.
    // 将球坐标转换为笛卡尔坐标
    this.cameraTempVec.setFromSpherical(this.cameraSpherical);
    camera.position.copy(this.cameraTarget).add(this.cameraTempVec);
    camera.lookAt(this.cameraTarget);
  }

  /**
   * Get camera target position for terrain streaming.
   * 获取相机目标位置用于地形流式加载
   */
  getCameraTarget(): { x: number; y: number; z: number } {
    return {
      x: this.cameraTarget.x,
      y: this.cameraTarget.y,
      z: this.cameraTarget.z,
    };
  }

  /**
   * Check if camera is being controlled.
   * 检查相机是否正在被控制
   */
  get isCameraControlActive(): boolean {
    return this._cameraOrbitActive || this._cameraPanActive;
  }

  // --- Map Data / 地图数据 ---

  /**
   * Get mutable map data for editing.
   * 获取可编辑的地图数据
   */
  getMapDataMut(): MapData {
    return this.mapData;
  }

  /**
   * Set dirty flag.
   * 设置脏标志
   */
  private setDirty(dirty: boolean): void {
    if (this._dirty !== dirty) {
      this._dirty = dirty;
      this.onDirtyChange?.(dirty);
    }
  }

  /**
   * Create new empty map.
   * 创建新的空地图
   */
  newMap(name = "Untitled Map"): void {
    this.mapData = createEmptyMapData(
      this.config.height.seed,
      this.config.gpuCompute.tileResolution,
      this.config.streaming.chunkSizeMeters,
      name
    );
    this.setDirty(false);
  }

  /**
   * Load map from JSON string.
   * 从 JSON 字符串加载地图
   */
  loadMap(json: string): void {
    this.mapData = deserializeMapData(json);
    this.setDirty(false);
  }

  /**
   * Save map to JSON string.
   * 保存地图为 JSON 字符串
   */
  saveMap(): string {
    const json = serializeMapData(this.mapData);
    this.setDirty(false);
    return json;
  }

  /**
   * Set map name (metadata only, does not trigger dirty flag).
   * 设置地图名称（仅元数据，不触发脏标志）
   */
  setMapName(name: string): void {
    this.mapData.metadata.name = name;
    // Do not set dirty - name change is not a terrain edit.
    // 不设置 dirty - 名称更改不是地形编辑
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
    this.pendingStrokes.length = 0;
  }
}
