// Look System: applies look input to transform orientation.
// 视角系统：将视角输入应用到变换朝向

import { worldConfig } from "../../config/world";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * lookSystem: reads look delta from PlayerInput and updates Transform orientation.
 * lookSystem：从 PlayerInput 读取视角增量并更新 Transform 朝向
 */
export function lookSystem(world: GameWorld, res: GameResources): void {
  // Only apply look when pointer is locked.
  // 只有指针锁定时才应用视角
  if (!res.singletons.input.isPointerLocked) {
    return;
  }

  for (const [, transform, playerInput] of world.query("transform", "playerInput")) {
    transform.yawRadians += playerInput.lookDeltaYaw;
    transform.pitchRadians = clamp(
      transform.pitchRadians + playerInput.lookDeltaPitch,
      worldConfig.player.pitch.minRadians,
      worldConfig.player.pitch.maxRadians,
    );
  }
}
