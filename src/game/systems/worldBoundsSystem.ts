// World Bounds System: invisible walls at map edges.
// 世界边界系统：地图边缘的空气墙
//
// Simple hard clamp to prevent escape.
// 简单硬限制，防止逃出

import { terrainConfig } from "../../config/terrain";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

const bounds = terrainConfig.worldBounds;

export function worldBoundsSystem(world: GameWorld, _res: GameResources): void {
  const limit = bounds.halfSizeMeters;

  for (const [, transform, velocity] of world.query("transform", "velocity")) {
    // Clamp X axis.
    // 限制 X 轴
    if (transform.x > limit) {
      transform.x = limit;
      if (velocity.vx > 0) velocity.vx = 0;
    } else if (transform.x < -limit) {
      transform.x = -limit;
      if (velocity.vx < 0) velocity.vx = 0;
    }

    // Clamp Z axis.
    // 限制 Z 轴
    if (transform.z > limit) {
      transform.z = limit;
      if (velocity.vz > 0) velocity.vz = 0;
    } else if (transform.z < -limit) {
      transform.z = -limit;
      if (velocity.vz < 0) velocity.vz = 0;
    }
  }
}
