// Input System: converts raw input into PlayerInput components.
// 输入系统：将原始输入转换为 PlayerInput 组件

import { inputConfig } from "../../config/input";
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
 *
 * Benefits:
 * - Replay: record PlayerInput, replay game exactly
 * - AI: write PlayerInput from AI instead of keyboard
 * - Network: sync PlayerInput across clients
 * 好处：
 * - 回放：记录 PlayerInput，精确重放游戏
 * - AI：用 AI 写入 PlayerInput 而非键盘
 * - 网络：跨客户端同步 PlayerInput
 */
export function inputSystem(world: GameWorld, res: GameResources): void {
  const rawInput = res.input.raw;
  const settings = res.runtime.settings;

  // Game input is only active when pointer is locked.
  // 游戏输入仅在指针锁定时有效
  const inputActive = rawInput.pointerLocked;

  // Read raw input state (data-oriented: read from RawInputState resource).
  // 读取原始输入状态（数据导向：从 RawInputState 资源读取）
  const keysDown = rawInput.keysDown;
  const keysJustPressed = rawInput.keysJustPressed;

  // Only process movement/look when pointer is locked.
  // 仅在指针锁定时处理移动/视角
  let moveX = 0;
  let moveZ = 0;
  let sprintDown = false;
  let jumpPressed = false;
  let lookDeltaYaw = 0;
  let lookDeltaPitch = 0;

  if (inputActive) {
    const forwardDown = keysDown.has(inputConfig.forward.code) || keysDown.has("ArrowUp");
    const backwardDown = keysDown.has(inputConfig.backward.code) || keysDown.has("ArrowDown");
    const leftDown = keysDown.has(inputConfig.left.code) || keysDown.has("ArrowLeft");
    const rightDown = keysDown.has(inputConfig.right.code) || keysDown.has("ArrowRight");
    sprintDown = keysDown.has(inputConfig.sprint.code) || keysDown.has("ShiftRight");

    // Compute normalized movement direction.
    // 计算归一化的移动方向
    moveX = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
    moveZ = (forwardDown ? 1 : 0) - (backwardDown ? 1 : 0);
    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    // Read one-shot inputs from raw state.
    // 从原始状态读取一次性输入
    jumpPressed = keysJustPressed.has(inputConfig.jump.code);

    // Look delta from mouse.
    // 鼠标视角增量
    const mouseDx = rawInput.mouseDeltaX;
    const mouseDy = rawInput.mouseDeltaY;
    const radiansPerPixel = playerConfig.look.radiansPerPixel * settings.player.mouseSensitivity;
    lookDeltaYaw = -mouseDx * radiansPerPixel;
    lookDeltaPitch = -mouseDy * radiansPerPixel;
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
