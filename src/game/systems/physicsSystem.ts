// Physics System: gravity, velocity integration, and ground collision.
// 物理系统：重力、速度积分和地面碰撞

import { worldConfig } from "../../config/world";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

/**
 * physicsSystem: integrates velocity into transform, handles gravity and collisions.
 * physicsSystem：将速度积分到位置，处理重力和碰撞
 *
 * Industry best practice: physics operates on velocity component, not raw transform.
 * 业界最佳实践：物理系统操作速度组件，而不是直接改位置
 */
export function physicsSystem(world: GameWorld, res: GameResources): void {
  const dt = res.time.dt;
  const settings = res.runtime.settings;
  const terrain = res.runtime.terrain;

  const gravity = settings.player.gravity;
  const maxFall = settings.player.maxFallSpeed;
  const snap = worldConfig.player.physics.groundSnapMeters;

  for (const [, transform, velocity, physics] of world.query("transform", "velocity", "physics")) {
    // Apply gravity to vertical velocity when not grounded.
    // 不在地面时对垂直速度应用重力
    if (!physics.grounded) {
      velocity.vy -= gravity * dt;
      velocity.vy = Math.max(velocity.vy, -maxFall);
    }

    // Integrate velocity into position.
    // 将速度积分到位置
    transform.x += velocity.vx * dt;
    transform.y += velocity.vy * dt;
    transform.z += velocity.vz * dt;

    // Ground collision (terrain heightfield).
    // 地面碰撞（地形高度场）
    const groundY = terrain.heightAt(transform.x, transform.z);

    if (transform.y <= groundY + snap) {
      transform.y = groundY;
      velocity.vy = 0;
      physics.grounded = true;
    } else {
      physics.grounded = false;
    }

    // Dampen horizontal velocity when grounded (simple friction).
    // 着地时衰减水平速度（简单摩擦）
    if (physics.grounded) {
      // Clear horizontal velocity each frame - movement system sets it fresh.
      // 每帧清除水平速度 - 移动系统会重新设置
      velocity.vx = 0;
      velocity.vz = 0;
    }
  }
}

