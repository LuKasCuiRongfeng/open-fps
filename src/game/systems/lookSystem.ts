// Look System: applies look input to transform orientation with smoothing.
// 视角系统：将视角输入应用到变换朝向，带平滑处理

import { playerStaticConfig } from "../../config/player";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Play mode pitch limits (prevents looking too far up/down).
// 游戏模式俯仰角限制（防止视角过度上下）
const PITCH_MIN_RAD = -1.40;  // ~-80 degrees (looking up)
const PITCH_MAX_RAD = 1.40;   // ~80 degrees (looking down)

/**
 * lookSystem: reads look delta from PlayerInput and updates Transform orientation.
 * lookSystem：从 PlayerInput 读取视角增量并更新 Transform 朝向
 *
 * Uses exponential smoothing for silky camera rotation.
 * 使用指数平滑实现丝滑的相机旋转
 */
export function lookSystem(world: GameWorld, res: GameResources): void {
  // Only apply look when pointer is locked.
  // 只有指针锁定时才应用视角
  if (!res.input.raw.pointerLocked) {
    return;
  }

  const dt = res.time.dt;
  const smoothFactor = playerStaticConfig.lookSmoothingFactor;

  // Calculate interpolation factor using exponential smoothing.
  // 使用指数平滑计算插值因子
  // alpha approaches 1 as dt increases, ensuring responsiveness.
  // alpha 随 dt 增大趋近于 1，确保响应性
  const alpha = 1 - Math.pow(smoothFactor, dt);

  for (const [, transform, playerInput] of world.query("transform", "playerInput")) {
    // Update target orientation from input.
    // 从输入更新目标朝向
    transform.targetYawRadians += playerInput.lookDeltaYaw;
    
    // Clamp pitch to prevent looking too far up/down.
    // 限制俯仰角以防止视角过度上下
    transform.targetPitchRadians = clamp(
      transform.targetPitchRadians + playerInput.lookDeltaPitch,
      PITCH_MIN_RAD,
      PITCH_MAX_RAD,
    );

    // Smoothly interpolate current orientation toward target.
    // 将当前朝向平滑插值到目标
    transform.yawRadians += (transform.targetYawRadians - transform.yawRadians) * alpha;
    transform.pitchRadians += (transform.targetPitchRadians - transform.pitchRadians) * alpha;
  }
}
