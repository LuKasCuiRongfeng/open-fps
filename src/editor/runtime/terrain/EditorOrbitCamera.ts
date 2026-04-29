// EditorOrbitCamera: orbit camera controls for terrain editor.
// EditorOrbitCamera：地形编辑器的轨道相机控制

import type { PerspectiveCamera } from "three/webgpu";
import { Vector3, Spherical, MathUtils, Raycaster, Vector2, Plane } from "three/webgpu";

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

  // Pan: world-space anchor point for "sticky" panning.
  // 平移：用于"跟手"平移的世界空间锚点
  private readonly panAnchor = new Vector3();
  private readonly raycaster = new Raycaster();
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly mouseNDC = new Vector2();
  private camera: PerspectiveCamera | null = null;

  // Sensitivity settings.
  // 灵敏度设置
  private readonly orbitSensitivity = 0.01;

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
   * Start pan control with world-space anchor.
   * 使用世界空间锚点开始平移控制
   *
   * @param mouseX Screen X coordinate
   * @param mouseY Screen Y coordinate
   * @param screenWidth Viewport width
   * @param screenHeight Viewport height
   */
  startPan(mouseX: number, mouseY: number, screenWidth?: number, screenHeight?: number): void {
    this._panActive = true;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;

    // Calculate world-space anchor point under mouse.
    // 计算鼠标下的世界空间锚点
    if (this.camera && screenWidth && screenHeight) {
      // Update ground plane to pass through current target Y.
      // 更新地面平面使其通过当前目标 Y
      this.groundPlane.constant = -this.target.y;

      const hitPoint = this.raycastToGround(mouseX, mouseY, screenWidth, screenHeight);
      if (hitPoint) {
        this.panAnchor.copy(hitPoint);
      } else {
        // Fallback: use target as anchor.
        // 后备：使用目标作为锚点
        this.panAnchor.copy(this.target);
      }
    }
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
   *
   * @param mouseX Screen X coordinate
   * @param mouseY Screen Y coordinate
   * @param screenWidth Viewport width (needed for pan)
   * @param screenHeight Viewport height (needed for pan)
   */
  updateFromMouse(mouseX: number, mouseY: number, screenWidth?: number, screenHeight?: number): void {
    const dx = mouseX - this._lastMouseX;
    const dy = mouseY - this._lastMouseY;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;

    if (this._orbitActive) {
      this.orbit(dx, dy);
    }

    if (this._panActive && screenWidth && screenHeight) {
      this.pan(mouseX, mouseY, screenWidth, screenHeight);
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
   * Pan: move target so the anchor point stays under the mouse.
   * 平移：移动目标使锚点保持在鼠标下
   *
   * This creates a "sticky" feel where the world point under the mouse
   * when pan started stays under the mouse throughout the drag.
   * 这创造了一种"跟手"的感觉，平移开始时鼠标下的世界点
   * 在整个拖动过程中保持在鼠标下
   */
  private pan(mouseX: number, mouseY: number, screenWidth: number, screenHeight: number): void {
    if (!this.camera) return;

    // Raycast current mouse position to ground plane.
    // 将当前鼠标位置射线投射到地面平面
    const currentHit = this.raycastToGround(mouseX, mouseY, screenWidth, screenHeight);
    if (!currentHit) return;

    // Move target so that panAnchor would be at currentHit.
    // 移动目标使 panAnchor 位于 currentHit
    // target_new = target_old + (panAnchor - currentHit)
    this.target.x += this.panAnchor.x - currentHit.x;
    this.target.z += this.panAnchor.z - currentHit.z;
  }

  /**
   * Raycast from screen position to ground plane.
   * 从屏幕位置射线投射到地面平面
   */
  private raycastToGround(mouseX: number, mouseY: number, screenWidth: number, screenHeight: number): Vector3 | null {
    if (!this.camera) return null;

    // Convert to NDC [-1, 1].
    // 转换为 NDC [-1, 1]
    this.mouseNDC.x = (mouseX / screenWidth) * 2 - 1;
    this.mouseNDC.y = -(mouseY / screenHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseNDC, this.camera);

    const hitPoint = new Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint);
    return hit ? hitPoint : null;
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
    // Store camera reference for pan raycasting.
    // 存储相机引用用于平移射线投射
    this.camera = camera;

    this.tempVec.setFromSpherical(this.spherical);
    camera.position.copy(this.target).add(this.tempVec);
    camera.lookAt(this.target);
  }
}
