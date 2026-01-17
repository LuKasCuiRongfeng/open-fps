// Input System: converts raw input into PlayerInput components.
// 输入系统：将原始输入转换为 PlayerInput 组件

import { inputConfig, isKeyDown, isKeyJustPressed } from "../../config/input";
import { playerConfig } from "../../config/player";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";
import { clearFrameInputState } from "../input/RawInputState";

/**
 * inputSystem: reads raw input state and writes to PlayerInput components.
 * inputSystem：读取原始输入状态并写入 PlayerInput 组件
 *
 * Industry best practice: decouple raw input from gameplay.
 * 业界最佳实践：将原始输入与游戏逻辑解耦
 */
export function inputSystem(world: GameWorld, res: GameResources): void {
  const rawInput = res.input.raw;
  const settings = res.runtime.settings;

  // Game input is only active when pointer is locked.
  // 游戏输入仅在指针锁定时有效
  const inputActive = rawInput.pointerLocked;
  const keysDown = rawInput.keysDown;

  // Default values when input is inactive.
  // 输入非激活时的默认值
  let moveX = 0, moveZ = 0, sprintDown = false, jumpPressed = false;
  let lookDeltaYaw = 0, lookDeltaPitch = 0;

  if (inputActive) {
    // Compute normalized movement direction using helper.
    // 使用辅助函数计算归一化的移动方向
    const forward = isKeyDown(keysDown, inputConfig.forward) ? 1 : 0;
    const backward = isKeyDown(keysDown, inputConfig.backward) ? 1 : 0;
    const left = isKeyDown(keysDown, inputConfig.left) ? 1 : 0;
    const right = isKeyDown(keysDown, inputConfig.right) ? 1 : 0;

    moveX = right - left;
    moveZ = forward - backward;
    const len = Math.hypot(moveX, moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    sprintDown = isKeyDown(keysDown, inputConfig.sprint);
    jumpPressed = isKeyJustPressed(rawInput.keysJustPressed, inputConfig.jump);

    // Look delta from mouse.
    // 鼠标视角增量
    const radiansPerPixel = playerConfig.look.radiansPerPixel * settings.player.mouseSensitivity;
    lookDeltaYaw = -rawInput.mouseDeltaX * radiansPerPixel;
    lookDeltaPitch = -rawInput.mouseDeltaY * radiansPerPixel;
  }

  // Toggle requests work regardless of pointer lock (for UI interactions).
  // 切换请求无论指针是否锁定都有效（用于 UI 交互）
  const toggleCameraMode = rawInput.toggleCameraModeRequested;
  const toggleThirdPersonStyle = rawInput.toggleThirdPersonStyleRequested;

  // Write to all entities with playerInput component.
  // 写入所有拥有 playerInput 组件的实体
  for (const [, playerInput] of world.query("playerInput")) {
    playerInput.moveX = moveX;
    playerInput.moveZ = moveZ;
    playerInput.sprint = sprintDown;
    playerInput.jump = jumpPressed;
    playerInput.lookDeltaYaw = lookDeltaYaw;
    playerInput.lookDeltaPitch = lookDeltaPitch;
    playerInput.toggleCameraMode = toggleCameraMode;
    playerInput.toggleThirdPersonStyle = toggleThirdPersonStyle;
  }

  // Clear per-frame input state after processing.
  // 处理后清除每帧输入状态
  clearFrameInputState(rawInput);
}
