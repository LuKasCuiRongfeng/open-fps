// EditorOrbitCamera: orbit camera controls for terrain editor.
// EditorOrbitCamera：地形编辑器的轨道相机控制

import type { PerspectiveCamera } from "three/webgpu";
import { Vector3, Spherical, MathUtils, Quaternion } from "three/webgpu";
import { TerrainSurfaceRaycaster } from "../common/TerrainSurfaceRaycaster";

type TerrainHeightAt = (x: number, z: number) => number;
type TerrainHeightAvailability = (x: number, z: number) => boolean;

const MIN_PLANE_RAY_DENOMINATOR = 0.000001;

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
  private readonly currentPanHit = new Vector3();
  private readonly panStartTarget = new Vector3();
  private readonly panStartCameraPosition = new Vector3();
  private readonly panStartCameraQuaternion = new Quaternion();
  private readonly panRayDirection = new Vector3();

  // Camera drag state.
  // 相机拖拽状态
  private _orbitActive = false;
  private _panActive = false;
  private _zoomActive = false;
  private _lastMouseX = 0;
  private _lastMouseY = 0;

  // Pan: world-space anchor point for "sticky" panning.
  // 平移：用于"跟手"平移的世界空间锚点
  private readonly panAnchor = new Vector3();
  private readonly terrainRaycaster = new TerrainSurfaceRaycaster();
  private camera: PerspectiveCamera | null = null;
  private heightAt: TerrainHeightAt | null = null;
  private hasHeightAt: TerrainHeightAvailability | null = null;
  private panStartFovRadians = Math.PI / 3;
  private panStartAspect = 1;
  private panAnchorY = 0;
  private panHasAnchor = false;

  // Sensitivity settings.
  // 灵敏度设置
  private readonly orbitSensitivity = 0.01;
  private readonly zoomDragSensitivity = 0.005;

  // Angle limits.
  // 角度限制
  private readonly minPhi = 0.26; // ~15 degrees from top / 从顶部约 15 度
  private readonly maxPhi = 1.40; // ~80 degrees from top / 从顶部约 80 度
  private readonly minRadius = 10;
  private readonly maxRadius = 1000;

  get isControlActive(): boolean {
    return this._orbitActive || this._panActive || this._zoomActive;
  }

  get orbitActive(): boolean {
    return this._orbitActive;
  }

  get panActive(): boolean {
    return this._panActive;
  }

  get zoomActive(): boolean {
    return this._zoomActive;
  }

  /**
   * Frame the editor camera around a terrain target without relying on a player entity.
   * 围绕地形目标构图编辑器相机，不依赖玩家实体。
   */
  frameTarget(targetX: number, targetY: number, targetZ: number, radius: number): void {
    this.target.set(targetX, targetY, targetZ);
    this.spherical.radius = MathUtils.clamp(radius, this.minRadius, this.maxRadius);
    this.spherical.phi = Math.PI / 3;
    this.spherical.theta = Math.PI / 4;
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
  startPan(
    mouseX: number,
    mouseY: number,
    screenWidth?: number,
    screenHeight?: number,
    camera?: PerspectiveCamera,
    heightAt?: TerrainHeightAt,
    hasHeightAt?: TerrainHeightAvailability
  ): void {
    this.updateRuntimeReferences(camera, heightAt, hasHeightAt);
    this._panActive = true;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;
    this.panHasAnchor = false;

    // Calculate world-space anchor point under mouse.
    // 计算鼠标下的世界空间锚点
    if (this.camera && this.heightAt && screenWidth && screenHeight) {
      this.syncTargetToTerrain(this.heightAt);
      if (this.raycastToTerrain(mouseX, mouseY, screenWidth, screenHeight, this.currentPanHit)) {
        this.panAnchor.copy(this.currentPanHit);
      } else {
        // EN: Missing loaded terrain under the press point means pan must not start, otherwise fallback math can jump to distant chunks.
        // 中文: 按下点没有命中已加载地形时不能启动平移，否则回退解算会跳到远处 chunk。
        this._panActive = false;
        return;
      }

      // EN: Freeze the start pose for deterministic pan math; movement no longer feeds back through current terrain height.
      // 中文: 冻结起始位姿用于确定性的平移计算，移动过程不再通过当前地形高度反向反馈。
      this.panStartTarget.copy(this.target);
      this.panStartCameraPosition.copy(this.camera.position);
      this.panStartCameraQuaternion.copy(this.camera.quaternion);
      this.panStartFovRadians = MathUtils.degToRad(this.camera.fov);
      this.panStartAspect = this.camera.aspect;
      this.panAnchorY = this.panAnchor.y;
      this.panHasAnchor = true;
    }
  }

  /**
   * Stop pan control.
   * 停止平移控制
   */
  stopPan(): void {
    this._panActive = false;
    this.panHasAnchor = false;
    if (this.heightAt) {
      this.syncTargetToTerrain(this.heightAt);
    }
  }

  /**
   * Start zoom control.
   * 开始缩放控制。
   */
  startZoom(mouseX: number, mouseY: number): void {
    this._zoomActive = true;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;
  }

  /**
   * Stop zoom control.
   * 停止缩放控制。
   */
  stopZoom(): void {
    this._zoomActive = false;
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
  updateFromMouse(
    mouseX: number,
    mouseY: number,
    screenWidth?: number,
    screenHeight?: number,
    camera?: PerspectiveCamera,
    heightAt?: TerrainHeightAt,
    hasHeightAt?: TerrainHeightAvailability
  ): void {
    this.updateRuntimeReferences(camera, heightAt, hasHeightAt);
    const dx = mouseX - this._lastMouseX;
    const dy = mouseY - this._lastMouseY;
    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;

    if (this._orbitActive) {
      this.orbit(dx, dy);
    }

    if (this._panActive && screenWidth && screenHeight && this.camera && this.heightAt) {
      this.pan(mouseX, mouseY, screenWidth, screenHeight);
    }

    if (this._zoomActive) {
      this.zoomByDrag(dy);
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
    if (!this.camera || !this.heightAt || !this.panHasAnchor) return;

    if (!this.raycastStartCameraToPanPlane(mouseX, mouseY, screenWidth, screenHeight, this.currentPanHit)) return;

    const dx = this.panAnchor.x - this.currentPanHit.x;
    const dz = this.panAnchor.z - this.currentPanHit.z;

    this.target.x = this.panStartTarget.x + dx;
    this.target.z = this.panStartTarget.z + dz;
    this.syncTargetToTerrain(this.heightAt);
    this.applyToCamera(this.camera, this.heightAt);
  }

  /**
   * Raycast from the frozen pan-start camera to the fixed plane through the original terrain anchor.
   * 从冻结的平移起始相机射线投射到穿过原始地形锚点的固定平面。
   */
  private raycastStartCameraToPanPlane(
    mouseX: number,
    mouseY: number,
    screenWidth: number,
    screenHeight: number,
    out: Vector3
  ): boolean {
    const ndcX = (mouseX / screenWidth) * 2 - 1;
    const ndcY = -(mouseY / screenHeight) * 2 + 1;
    const tanHalfFov = Math.tan(this.panStartFovRadians * 0.5);

    this.panRayDirection.set(
      ndcX * this.panStartAspect * tanHalfFov,
      ndcY * tanHalfFov,
      -1
    );
    this.panRayDirection.normalize().applyQuaternion(this.panStartCameraQuaternion);

    const denominator = this.panRayDirection.y;
    if (Math.abs(denominator) < MIN_PLANE_RAY_DENOMINATOR) return false;

    const distance = (this.panAnchorY - this.panStartCameraPosition.y) / denominator;
    if (distance <= 0 || !Number.isFinite(distance)) return false;

    out.copy(this.panStartCameraPosition).addScaledVector(this.panRayDirection, distance);
    return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
  }

  /**
   * Raycast from screen position to terrain surface.
   * 从屏幕位置射线投射到地形表面
   */
  private raycastToTerrain(
    mouseX: number,
    mouseY: number,
    screenWidth: number,
    screenHeight: number,
    out: Vector3
  ): boolean {
    if (!this.camera || !this.heightAt) return false;

    const result = this.terrainRaycaster.cast(
      mouseX,
      mouseY,
      screenWidth,
      screenHeight,
      this.camera,
      this.heightAt,
      this.hasHeightAt ?? undefined
    );
    if (!result.valid) return false;

    out.set(result.x, result.y, result.z);
    return true;
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
   * Zoom from pointer drag. Positive vertical movement zooms out, negative movement zooms in.
   * 根据指针拖拽缩放。垂直正向移动拉远，负向移动拉近。
   */
  private zoomByDrag(dy: number): void {
    this.spherical.radius *= Math.exp(dy * this.zoomDragSensitivity);
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
  applyToCamera(camera: PerspectiveCamera, heightAt?: TerrainHeightAt, hasHeightAt?: TerrainHeightAvailability): void {
    this.updateRuntimeReferences(camera, heightAt, hasHeightAt);

    // Store camera reference for pan raycasting.
    // 存储相机引用用于平移射线投射
    this.camera = camera;

    if (this.heightAt && !this._panActive) {
      this.syncTargetToTerrain(this.heightAt);
    }

    this.tempVec.setFromSpherical(this.spherical);
    camera.position.copy(this.target).add(this.tempVec);

    if (this.heightAt) {
      // EN: Only lift the camera when it would enter terrain; normal orbit height remains unconstrained.
      // 中文: 仅在相机会进入地形时抬高相机，正常轨道高度不做固定约束。
      const terrainY = this.heightAt(camera.position.x, camera.position.z);
      const minCameraY = terrainY + camera.near;
      camera.position.y = Math.max(camera.position.y, minCameraY);
    }

    camera.lookAt(this.target);
  }

  private updateRuntimeReferences(
    camera?: PerspectiveCamera,
    heightAt?: TerrainHeightAt,
    hasHeightAt?: TerrainHeightAvailability
  ): void {
    if (camera) {
      this.camera = camera;
    }
    if (heightAt) {
      this.heightAt = heightAt;
    }
    if (hasHeightAt) {
      this.hasHeightAt = hasHeightAt;
    }
  }

  private syncTargetToTerrain(heightAt: TerrainHeightAt): void {
    this.target.y = heightAt(this.target.x, this.target.z);
  }
}
