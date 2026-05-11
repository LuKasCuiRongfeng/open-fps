// BrushRaycaster: shared ray-terrain intersection utility for brush editors.
// BrushRaycaster：画刷编辑器共享的射线-地形相交工具

import type { PerspectiveCamera } from "three/webgpu";
import { TerrainSurfaceRaycaster } from "./TerrainSurfaceRaycaster";

/**
 * Result of a brush raycast operation.
 * 画刷射线投射操作的结果
 */
export interface BrushRaycastResult {
  /** Whether a valid intersection was found. / 是否找到有效交点 */
  valid: boolean;
  /** World X coordinate of intersection. / 交点的世界 X 坐标 */
  x: number;
  /** World Z coordinate of intersection. / 交点的世界 Z 坐标 */
  z: number;
}

/**
 * BrushRaycaster: utility for raycasting against terrain for brush positioning.
 * BrushRaycaster：用于画刷定位的地形射线投射工具
 *
 * Uses adaptive step ray marching for accurate terrain intersection,
 * properly handling complex terrain with peaks and valleys.
 * 使用自适应步长射线行进来精确地形交点，正确处理有山峰和山谷的复杂地形
 */
export class BrushRaycaster {
  private readonly terrainRaycaster = new TerrainSurfaceRaycaster();

  /**
   * Cast a ray from screen coordinates and find terrain intersection.
   * 从屏幕坐标投射射线并找到地形交点
   *
   * @param mouseX - Mouse X in pixels / 鼠标 X 坐标（像素）
   * @param mouseY - Mouse Y in pixels / 鼠标 Y 坐标（像素）
   * @param canvasWidth - Canvas width in pixels / 画布宽度（像素）
   * @param canvasHeight - Canvas height in pixels / 画布高度（像素）
   * @param camera - Perspective camera / 透视相机
   * @param heightAt - Function to get terrain height at (x, z) / 获取 (x, z) 处地形高度的函数
   * @returns Raycast result with intersection point / 包含交点的射线投射结果
   */
  cast(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number
  ): BrushRaycastResult {
    const result = this.terrainRaycaster.cast(mouseX, mouseY, canvasWidth, canvasHeight, camera, heightAt);
    return { valid: result.valid, x: result.x, z: result.z };
  }
}
