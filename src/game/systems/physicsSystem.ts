// Physics System: gravity, velocity integration, and ground collision.
// 物理系统：重力、速度积分和地面碰撞

import { playerStaticConfig } from "../../config/player";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

/**
 * physicsSystem: integrates velocity into transform, handles gravity and collisions.
 * physicsSystem：将速度积分到位置，处理重力和碰撞
 *
 * Key behavior: when grounded, player Y is continuously snapped to terrain.
 * This ensures the player follows terrain contours while walking.
 * 关键行为：着地时，玩家 Y 持续吸附到地形。
 * 这确保玩家行走时跟随地形轮廓。
 */
export function physicsSystem(world: GameWorld, res: GameResources): void {
  const dt = res.time.dt;
  const settings = res.runtime.settings;
  const terrain = res.runtime.terrain;

  const gravity = settings.player.gravity;
  const maxFall = settings.player.maxFallSpeed;

  // Max height above terrain to still be considered "grounded" (for slopes/small bumps).
  // 仍被视为"着地"的地形以上最大高度（用于坡度/小凸起）
  const groundThreshold = 0.5;

  for (const [, transform, velocity, physics, playerInput] of world.query(
    "transform",
    "velocity",
    "physics",
    "playerInput",
  )) {
    // Integrate horizontal velocity into position.
    // 将水平速度积分到位置
    transform.x += velocity.vx * dt;
    transform.z += velocity.vz * dt;

    // Query terrain height at new XZ position.
    // 查询新 XZ 位置的地形高度
    const groundY = terrain.heightAt(transform.x, transform.z);

    if (physics.grounded) {
      // When grounded: snap Y to terrain surface (follow terrain contours).
      // 着地时：将 Y 吸附到地形表面（跟随地形轮廓）
      transform.y = groundY;
      velocity.vy = 0;
    } else {
      // Airborne: apply gravity and integrate vertical velocity.
      // 空中：应用重力并积分垂直速度
      velocity.vy -= gravity * dt;
      velocity.vy = Math.max(velocity.vy, -maxFall);
      transform.y += velocity.vy * dt;

      // Check for landing.
      // 检查是否落地
      if (transform.y <= groundY) {
        transform.y = groundY;
        velocity.vy = 0;
        physics.grounded = true;
      }
    }

    // Check if player should start falling (walked off edge or terrain dropped).
    // 检查玩家是否应该开始下落（走出边缘或地形下降）
    if (physics.grounded && transform.y > groundY + groundThreshold) {
      physics.grounded = false;
    }

    // Ground friction: decelerate when grounded with no input.
    // 地面摩擦：着地且无输入时减速
    if (physics.grounded) {
      const hasInput =
        Math.abs(playerInput.moveX) > 0.001 || Math.abs(playerInput.moveZ) > 0.001;

      if (!hasInput) {
        // Apply friction deceleration.
        // 应用摩擦减速
        const decel = playerStaticConfig.groundFrictionDeceleration;
        const currentSpeed = Math.sqrt(velocity.vx * velocity.vx + velocity.vz * velocity.vz);

        if (currentSpeed > 0.001) {
          const newSpeed = Math.max(0, currentSpeed - decel * dt);
          const factor = newSpeed / currentSpeed;
          velocity.vx *= factor;
          velocity.vz *= factor;
        } else {
          velocity.vx = 0;
          velocity.vz = 0;
        }
      }
    }
  }
}

