// World Bounds System: constrains entities within map boundaries.
// 世界边界系统：将实体限制在地图边界内

import { worldConfig } from "../../config/world";
import type { GameWorld } from "../ecs/GameEcs";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * worldBoundsSystem: clamps player positions to stay within map bounds.
 * worldBoundsSystem：将玩家位置限制在地图范围内
 */
export function worldBoundsSystem(world: GameWorld): void {
  const inset = worldConfig.map.airWallInsetMeters;
  const halfW = worldConfig.map.widthMeters * 0.5 - inset;
  const halfD = worldConfig.map.depthMeters * 0.5 - inset;

  for (const [, transform] of world.query("transform", "player")) {
    transform.x = clamp(transform.x, -halfW, halfW);
    transform.z = clamp(transform.z, -halfD, halfD);
  }
}
