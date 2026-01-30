// BrushRaycaster: shared ray-terrain intersection utility for brush editors.
// BrushRaycaster：画刷编辑器共享的射线-地形相交工具

import { Raycaster, Vector2 } from "three/webgpu";
import type { PerspectiveCamera } from "three/webgpu";

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
  private readonly raycaster = new Raycaster();
  private readonly mouseNdc = new Vector2();

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
        return {
          valid: true,
          x: origin.x + direction.x * finalT,
          z: origin.z + direction.z * finalT,
        };
      }

      prevT = t - step;
      prevAboveGround = aboveGround;
    }

    return { valid: false, x: 0, z: 0 };
  }
}
