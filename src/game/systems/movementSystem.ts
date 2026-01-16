// Movement System: converts movement input into velocity.
// 移动系统：将移动输入转换为速度

import { playerConfig } from "../../config/player";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

/**
 * movementSystem: reads PlayerInput and Physics, writes to Velocity.
 * movementSystem：读取 PlayerInput 和 Physics，写入 Velocity
 *
 * Industry best practice: movement sets velocity differently based on grounded state.
 * 业界最佳实践：根据着地状态不同地设置速度
 *
 * - Grounded: instant velocity change (responsive control)
 * - Airborne: acceleration-based air control (realistic inertia)
 *
 * - 着地：瞬时速度改变（响应式控制）
 * - 空中：基于加速度的空中控制（真实惯性）
 */
export function movementSystem(world: GameWorld, res: GameResources): void {
  const dt = res.time.dt;
  const settings = res.runtime.settings;
  const airControl = playerConfig.physics.airControl;

  for (const [, transform, velocity, playerInput, physics] of world.query(
    "transform",
    "velocity",
    "playerInput",
    "physics",
  )) {
    const moveX = playerInput.moveX;
    const moveZ = playerInput.moveZ;
    const hasInput = Math.abs(moveX) > 0.001 || Math.abs(moveZ) > 0.001;

    // Build yaw-aligned basis.
    // 根据 yaw 构建基底
    const yaw = transform.yawRadians;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    // right = (cos, 0, -sin), forward = (-sin, 0, -cos)
    const worldDx = hasInput ? cos * moveX + -sin * moveZ : 0;
    const worldDz = hasInput ? -sin * moveX + -cos * moveZ : 0;

    if (physics.grounded) {
      // Grounded: instant velocity (responsive control).
      // 着地：瞬时速度（响应式控制）
      if (hasInput) {
        // Sprint speed = base move speed + sprint bonus.
        // 奔跑速度 = 基础移动速度 + 奔跑加成
        const speed = playerInput.sprint
          ? settings.player.moveSpeed + settings.player.sprintBonus
          : settings.player.moveSpeed;
        velocity.vx = worldDx * speed;
        velocity.vz = worldDz * speed;
      }
      // Note: friction is handled in physicsSystem when no input.
      // 注意：无输入时的摩擦在 physicsSystem 中处理
    } else {
      // Airborne: acceleration-based air control (preserves momentum).
      // 空中：基于加速度的空中控制（保持惯性）
      if (hasInput) {
        const accel = airControl.accelerationMetersPerSecond2;
        const maxAirSpeed = airControl.maxSpeedMetersPerSecond;

        // Only accelerate if below max air speed or decelerating.
        // 只有在低于最大空中速度或减速时才加速
        // Sprint speed = base move speed + sprint bonus.
        // 奔跑速度 = 基础移动速度 + 奔跑加成
        const baseSpeed = playerInput.sprint
          ? settings.player.moveSpeed + settings.player.sprintBonus
          : settings.player.moveSpeed;
        const wishSpeed = Math.min(baseSpeed, maxAirSpeed);

        // Project current velocity onto wish direction.
        // 将当前速度投影到期望方向
        const wishDirLen = Math.sqrt(worldDx * worldDx + worldDz * worldDz);
        if (wishDirLen > 0.001) {
          const wishDirX = worldDx / wishDirLen;
          const wishDirZ = worldDz / wishDirLen;

          const currentProj = velocity.vx * wishDirX + velocity.vz * wishDirZ;
          const addSpeed = wishSpeed - currentProj;

          if (addSpeed > 0) {
            const accelAmount = Math.min(accel * dt, addSpeed);
            velocity.vx += wishDirX * accelAmount;
            velocity.vz += wishDirZ * accelAmount;
          }
        }
      }

      // Apply air drag.
      // 应用空气阻力
      const drag = airControl.dragPerSecond;
      const dragFactor = Math.max(0, 1 - drag * dt);
      velocity.vx *= dragFactor;
      velocity.vz *= dragFactor;
    }
  }
}
