// TerrainSurfaceRaycaster: shared screen-to-terrain surface picking.
// TerrainSurfaceRaycaster：共享的屏幕点到地形表面拾取工具

import { Raycaster, Vector2 } from "three/webgpu";
import type { PerspectiveCamera } from "three/webgpu";

const MAX_RAY_DISTANCE_FALLBACK_METERS = 1000;
const MIN_STEP_METERS = 0.5;
const MAX_STEP_METERS = 5.0;
const REFINEMENT_STEPS = 12;

export interface TerrainSurfaceRaycastResult {
  /** Whether a terrain surface intersection was found. / 是否找到地形表面交点 */
  valid: boolean;
  /** World X coordinate of intersection. / 交点的世界 X 坐标 */
  x: number;
  /** World Y coordinate of intersection. / 交点的世界 Y 坐标 */
  y: number;
  /** World Z coordinate of intersection. / 交点的世界 Z 坐标 */
  z: number;
}

/**
 * TerrainSurfaceRaycaster: ray marches against the sampled height field.
 * TerrainSurfaceRaycaster：基于采样高度场进行射线行进。
 */
export class TerrainSurfaceRaycaster {
  private readonly raycaster = new Raycaster();
  private readonly mouseNdc = new Vector2();

  /**
   * Cast a screen-space point onto the terrain surface.
   * 将屏幕空间点投射到地形表面。
   */
  cast(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number,
    isValidAt?: (x: number, z: number) => boolean
  ): TerrainSurfaceRaycastResult {
    this.mouseNdc.x = (mouseX / canvasWidth) * 2 - 1;
    this.mouseNdc.y = -(mouseY / canvasHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseNdc, camera);

    const ray = this.raycaster.ray;
    const origin = ray.origin;
    const direction = ray.direction;
    const maxDistance = Math.max(camera.far, MAX_RAY_DISTANCE_FALLBACK_METERS);

    let t = 0;
    let prevAboveGround = true;

    {
      const terrainY = heightAt(origin.x, origin.z);
      prevAboveGround = origin.y > terrainY;
      if (!prevAboveGround) {
        if (isValidAt && !isValidAt(origin.x, origin.z)) {
          return { valid: false, x: 0, y: 0, z: 0 };
        }

        return { valid: true, x: origin.x, y: terrainY, z: origin.z };
      }
    }

    while (t < maxDistance) {
      const prevT = t;
      const step = Math.min(
        MAX_STEP_METERS,
        Math.max(MIN_STEP_METERS, t * 0.02 + MIN_STEP_METERS)
      );
      t += step;

      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      const terrainY = heightAt(x, z);
      const aboveGround = y > terrainY;

      if (prevAboveGround && !aboveGround) {
        let lo = prevT;
        let hi = t;

        // EN: Refine the first crossing so camera panning does not drift on steep terrain.
        // 中文: 细化第一个穿越点，避免相机平移在陡峭地形上漂移。
        for (let i = 0; i < REFINEMENT_STEPS; i++) {
          const mid = (lo + hi) * 0.5;
          const midX = origin.x + direction.x * mid;
          const midY = origin.y + direction.y * mid;
          const midZ = origin.z + direction.z * mid;
          const midTerrainY = heightAt(midX, midZ);

          if (midY > midTerrainY) {
            lo = mid;
          } else {
            hi = mid;
          }
        }

        const finalT = (lo + hi) * 0.5;
        const finalX = origin.x + direction.x * finalT;
        const finalZ = origin.z + direction.z * finalT;
        if (isValidAt && !isValidAt(finalX, finalZ)) {
          return { valid: false, x: 0, y: 0, z: 0 };
        }

        const finalY = heightAt(finalX, finalZ);
        return { valid: true, x: finalX, y: finalY, z: finalZ };
      }

      prevAboveGround = aboveGround;
    }

    return { valid: false, x: 0, y: 0, z: 0 };
  }
}
