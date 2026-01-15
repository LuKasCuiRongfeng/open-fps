// Jump System: applies jump input to velocity.
// 跳跃系统：将跳跃输入应用到速度

import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

/**
 * jumpSystem: reads jump from PlayerInput and applies vertical velocity.
 * jumpSystem：从 PlayerInput 读取跳跃并应用垂直速度
 */
export function jumpSystem(world: GameWorld, res: GameResources): void {
  const jumpVelocity = res.runtime.settings.player.jumpVelocity;

  for (const [, velocity, physics, playerInput] of world.query("velocity", "physics", "playerInput")) {
    // Jump only when grounded and jump input is active.
    // 只有在地面上且跳跃输入激活时才跳
    if (playerInput.jump && physics.grounded) {
      velocity.vy = jumpVelocity;
      physics.grounded = false;
    }

    // Consume the jump input.
    // 消耗跳跃输入
    playerInput.jump = false;
  }
}
