// World Bounds System: constrains entities within loaded terrain area.
// 世界边界系统：将实体限制在已加载地形区域内

import { worldConfig } from "../../config/world";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

/**
 * worldBoundsSystem: clamps player Y position to terrain surface.
 * worldBoundsSystem：将玩家 Y 位置限制在地形表面
 *
 * With streaming terrain, XZ bounds are effectively infinite.
 * Only Y is constrained to prevent falling through the world.
 * 流式地形下，XZ 边界实际上是无限的。
 * 只有 Y 被限制以防止穿透世界。
 */
export function worldBoundsSystem(world: GameWorld, res: GameResources): void {
  const terrain = res.runtime.terrain;
  const minY = worldConfig.terrain.groundPlane.minYMeters;

  for (const [, transform] of world.query("transform", "player")) {
    // Query terrain height at player position.
    // 查询玩家位置的地形高度
    const terrainY = terrain.heightAt(transform.x, transform.z);

    // Clamp Y to be above terrain surface.
    // 将 Y 限制在地形表面以上
    if (transform.y < terrainY + minY) {
      transform.y = terrainY + minY;
    }
  }
}
