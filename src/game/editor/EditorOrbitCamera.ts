// EditorOrbitCamera: orbit camera controls for terrain editor.
// EditorOrbitCamera：地形编辑器的轨道相机控制

import type { PerspectiveCamera } from "three/webgpu";
import { Vector3, Spherical, MathUtils } from "three/webgpu";

/**
 * Orbit camera state and controls for editor mode.
 * 编辑器模式的轨道相机状态和控制
 */
export class EditorOrbitCamera {
  // Spherical coords for orbit camera.
  // 轨道相机的球坐标
  private readonly spherical = new Spherical(100, Math.PI / 3, 0);
  private readonly target = new Vector3(0, 0, 0);
  private readonly tempVec = new Vector3();

  // Camera drag state.
  // 相机拖拽状态
  private _orbitActive = false;
  private _panActive = false;
  private _lastMouseX = 0;
  private _lastMouseY = 0;

  // Sensitivity settings.
  // 灵敏度设置
  private readonly orbitSensitivity = 0.01;
  private readonly panSpeedFactor = 0.002;

  // Angle limits.
  // 角度限制
  private readonly minPhi = 0.26; // ~15 degrees from top / 从顶部约 15 度
  private readonly maxPhi = 1.40; // ~80 degrees from top / 从顶部约 80 度
  private readonly minRadius = 10;
  private readonly maxRadius = 1000;

  get isControlActive(): boolean {
    return this._orbitActive || this._panActive;
  }

  get orbitActive(): boolean {
    return this._orbitActive;
  }

  get panActive(): boolean {
    return this._panActive;
  }

  /**
   * Initialize camera position from player position.
   * 从玩家位置初始化相机位置
   */
  initFromPlayer(playerX: number, playerY: number, playerZ: number): void {
    this.target.set(playerX, playerY, playerZ);
    this.spherical.radius = 100;
    this.spherical.phi = Math.PI / 3;
    this.spherical.theta = 0;
  }

  /**
   * Get camera target position.
   * 获取相机目标位置
   */
  getTarget(): { x: number; y: number; z: number } {
    return {
      x: this.target.x,
      y: this.target.y,
      z: this.target.z,
    };
  }

  /**
   * Start orbit control.
   * 开始轨道控制
   */
  startOrbit(mouseX: number, mouseY: number): void {
    this._orbitActive = true;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;
  }

  /**
   * Stop orbit control.
   * 停止轨道控制
   */
  stopOrbit(): void {
    this._orbitActive = false;
  }

  /**
   * Start pan control.
   * 开始平移控制
   */
  startPan(mouseX: number, mouseY: number): void {
    this._panActive = true;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;
  }

  /**
   * Stop pan control.
   * 停止平移控制
   */
  stopPan(): void {
    this._panActive = false;
  }

  /**
   * Update camera from mouse movement.
   * 从鼠标移动更新相机
   */
  updateFromMouse(mouseX: number, mouseY: number): void {
    const dx = mouseX - this._lastMouseX;
    const dy = mouseY - this._lastMouseY;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;

    if (this._orbitActive) {
      this.orbit(dx, dy);
    }

    if (this._panActive) {
      this.pan(dx, dy);
    }
  }

  /**
   * Orbit: rotate around target.
   * 轨道：围绕目标旋转
   */
  private orbit(dx: number, dy: number): void {
    this.spherical.theta -= dx * this.orbitSensitivity;
    this.spherical.phi -= dy * this.orbitSensitivity;

    // Clamp phi.
    // 限制 phi
    this.spherical.phi = MathUtils.clamp(this.spherical.phi, this.minPhi, this.maxPhi);
  }

  /**
   * Pan: move target in camera plane.
   * 平移：在相机平面内移动目标
   */
  private pan(dx: number, dy: number): void {
    const panSpeed = this.spherical.radius * this.panSpeedFactor;

    const sinPhi = Math.sin(this.spherical.phi);
    const sinTheta = Math.sin(this.spherical.theta);
    const cosTheta = Math.cos(this.spherical.theta);

    // Right vector (perpendicular to view direction in XZ plane).
    // 右向量（在 XZ 平面内垂直于视线方向）
    const rightX = -cosTheta;
    const rightZ = sinTheta;

    // Forward vector in XZ plane.
    // XZ 平面内的前向向量
    const forwardX = sinTheta * sinPhi;
    const forwardZ = cosTheta * sinPhi;

    this.target.x += dx * panSpeed * rightX - dy * panSpeed * forwardX;
    this.target.z += dx * panSpeed * rightZ - dy * panSpeed * forwardZ;
  }

  /**
   * Zoom camera (change radius).
   * 缩放相机（改变半径）
   */
  zoom(delta: number): void {
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    this.spherical.radius *= zoomFactor;
    this.spherical.radius = MathUtils.clamp(
      this.spherical.radius,
      this.minRadius,
      this.maxRadius
    );
  }

  /**
   * Apply camera state to actual camera.
   * 将相机状态应用到实际相机
   */
  applyToCamera(camera: PerspectiveCamera): void {
    this.tempVec.setFromSpherical(this.spherical);
    camera.position.copy(this.target).add(this.tempVec);
    camera.lookAt(this.target);
  }
}
