// Movement System: converts movement input into velocity.
// 移动系统：将移动输入转换为速度

import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

/**
 * movementSystem: reads PlayerInput and writes to Velocity.
 * movementSystem：读取 PlayerInput 并写入 Velocity
 *
 * Industry best practice: movement sets velocity, physics integrates it.
 * 业界最佳实践：移动系统设置速度，物理系统积分它
 */
export function movementSystem(world: GameWorld, res: GameResources): void {
  const settings = res.runtime.settings;

  for (const [, transform, velocity, playerInput] of world.query("transform", "velocity", "playerInput")) {
    const speed = playerInput.sprint
      ? settings.player.sprintSpeed
      : settings.player.moveSpeed;

    const moveX = playerInput.moveX;
    const moveZ = playerInput.moveZ;

    if (Math.abs(moveX) > 0.001 || Math.abs(moveZ) > 0.001) {
      // Build yaw-aligned basis and project the input vector.
      // 根据 yaw 构建基底，并将输入向量投影到世界空间
      const yaw = transform.yawRadians;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);

      // right = (cos, 0, -sin)
      // forward = (-sin, 0, -cos)
      const worldDx = cos * moveX + -sin * moveZ;
      const worldDz = -sin * moveX + -cos * moveZ;

      // Set horizontal velocity (physics will integrate and apply friction).
      // 设置水平速度（物理系统会积分并应用摩擦）
      velocity.vx = worldDx * speed;
      velocity.vz = worldDz * speed;
    }
  }
}

