// FloatingOrigin: origin rebasing system for large world precision.
// FloatingOrigin：大世界精度的浮动原点系统

import { Vector3 } from "three/webgpu";
import type { TerrainConfig } from "./terrain/terrain";

/**
 * Manages floating origin to prevent precision issues in large worlds.
 * 管理浮动原点以防止大世界中的精度问题
 *
 * When the player moves far from (0,0,0), we shift all world content
 * to keep the player near the origin. This prevents float precision issues
 * that cause jittering at large coordinates.
 * 当玩家远离 (0,0,0) 时，我们移动所有世界内容以保持玩家在原点附近。
 * 这可以防止大坐标下的浮点精度问题导致的抖动。
 */
export class FloatingOrigin {
  // Accumulated origin offset in world space.
  // 世界空间中累积的原点偏移
  private readonly offset = new Vector3(0, 0, 0);

  private readonly config: TerrainConfig;

  // Callbacks to notify when origin shifts.
  // 原点移动时的回调通知
  private readonly onRebaseCallbacks: Array<(dx: number, dy: number, dz: number) => void> = [];

  constructor(config: TerrainConfig) {
    this.config = config;
  }

  /**
   * Get the current origin offset.
   * 获取当前原点偏移
   */
  getOffset(): Readonly<Vector3> {
    return this.offset;
  }

  /**
   * Get the total accumulated X offset.
   * 获取累积的 X 偏移总量
   */
  get offsetX(): number {
    return this.offset.x;
  }

  /**
   * Get the total accumulated Z offset.
   * 获取累积的 Z 偏移总量
   */
  get offsetZ(): number {
    return this.offset.z;
  }

  /**
   * Convert local (render) position to true world position.
   * 将本地（渲染）位置转换为真实世界位置
   */
  localToWorld(localX: number, localY: number, localZ: number): { x: number; y: number; z: number } {
    return {
      x: localX + this.offset.x,
      y: localY + this.offset.y,
      z: localZ + this.offset.z,
    };
  }

  /**
   * Convert true world position to local (render) position.
   * 将真实世界位置转换为本地（渲染）位置
   */
  worldToLocal(worldX: number, worldY: number, worldZ: number): { x: number; y: number; z: number } {
    return {
      x: worldX - this.offset.x,
      y: worldY - this.offset.y,
      z: worldZ - this.offset.z,
    };
  }

  /**
   * Check if player position requires origin rebasing.
   * 检查玩家位置是否需要原点重置
   *
   * @param localPlayerX Player X in local/render space.
   * @param localPlayerZ Player Z in local/render space.
   * @returns True if rebase was performed.
   */
  checkAndRebase(localPlayerX: number, localPlayerZ: number): boolean {
    const threshold = this.config.floatingOrigin.rebaseThresholdMeters;
    const distSq = localPlayerX * localPlayerX + localPlayerZ * localPlayerZ;

    if (distSq > threshold * threshold) {
      // Rebase: shift origin to player's current local position.
      // 重置：将原点移动到玩家当前本地位置
      const dx = localPlayerX;
      const dz = localPlayerZ;

      this.offset.x += dx;
      this.offset.z += dz;

      // Notify all listeners to shift their content.
      // 通知所有监听器移动其内容
      for (const cb of this.onRebaseCallbacks) {
        cb(dx, 0, dz);
      }

      return true;
    }

    return false;
  }

  /**
   * Register a callback to be notified when origin shifts.
   * 注册回调以在原点移动时收到通知
   *
   * The callback receives the shift delta (dx, dy, dz).
   * All scene objects should subtract this from their position.
   * 回调接收移动增量 (dx, dy, dz)。
   * 所有场景对象应从其位置中减去此值。
   */
  onRebase(callback: (dx: number, dy: number, dz: number) => void): void {
    this.onRebaseCallbacks.push(callback);
  }

  /**
   * Unregister a rebase callback.
   * 注销重置回调
   */
  offRebase(callback: (dx: number, dy: number, dz: number) => void): void {
    const idx = this.onRebaseCallbacks.indexOf(callback);
    if (idx >= 0) {
      this.onRebaseCallbacks.splice(idx, 1);
    }
  }

  /**
   * Reset offset (e.g., when respawning).
   * 重置偏移（例如重生时）
   */
  reset(): void {
    this.offset.set(0, 0, 0);
  }
}
