import { worldConfig } from "../../config/world";
import type { GameResources } from "../ecs/resources";
import type { ComponentStores } from "../ecs/stores";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function physicsSystem(stores: ComponentStores, _resources: GameResources, dt: number) {
  const gravity = _resources.settings.player.gravity;
  const maxFall = _resources.settings.player.maxFallSpeed;
  const snap = worldConfig.player.physics.groundSnapMeters;

  for (const [entityId, physics] of stores.physics.entries()) {
    const transform = stores.transform.get(entityId);
    if (!transform) continue;

    // Integrate vertical velocity.
    // 积分竖直速度
    if (!physics.grounded) {
      physics.vy -= gravity * dt;
      physics.vy = clamp(physics.vy, -maxFall, Number.POSITIVE_INFINITY);
    }

    transform.y += physics.vy * dt;

    const groundY = _resources.terrain.heightAt(transform.x, transform.z);

    // Ground collision (terrain heightfield).
    // 地面碰撞（地形高度场）
    if (transform.y <= groundY + snap) {
      transform.y = groundY;
      physics.vy = 0;
      physics.grounded = true;
    } else {
      physics.grounded = false;
    }
  }
}
