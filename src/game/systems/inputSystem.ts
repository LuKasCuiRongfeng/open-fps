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

  // Read raw input state (data-oriented: read from RawInputState resource).
  // 读取原始输入状态（数据导向：从 RawInputState 资源读取）
  const keysDown = rawInput.keysDown;
  const keysJustPressed = rawInput.keysJustPressed;

  const forwardDown = keysDown.has(inputConfig.forward.code) || keysDown.has("ArrowUp");
  const backwardDown = keysDown.has(inputConfig.backward.code) || keysDown.has("ArrowDown");
  const leftDown = keysDown.has(inputConfig.left.code) || keysDown.has("ArrowLeft");
  const rightDown = keysDown.has(inputConfig.right.code) || keysDown.has("ArrowRight");
  const sprintDown = keysDown.has(inputConfig.sprint.code) || keysDown.has("ShiftRight");

  // Compute normalized movement direction.
  // 计算归一化的移动方向
  let moveX = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
  let moveZ = (forwardDown ? 1 : 0) - (backwardDown ? 1 : 0);
  const len = Math.hypot(moveX, moveZ);
  if (len > 0) {
    moveX /= len;
    moveZ /= len;
  }

  // Read one-shot inputs from raw state.
  // 从原始状态读取一次性输入
  const jumpPressed = keysJustPressed.has(inputConfig.jump.code);
  const toggleCameraMode = rawInput.toggleCameraModeRequested;
  const toggleThirdPersonStyle = rawInput.toggleThirdPersonStyleRequested;

  // Look delta from mouse.
  // 鼠标视角增量
  const mouseDx = rawInput.mouseDeltaX;
  const mouseDy = rawInput.mouseDeltaY;
  const radiansPerPixel = playerConfig.look.radiansPerPixel * settings.player.mouseSensitivity;
  const lookDeltaYaw = -mouseDx * radiansPerPixel;
  const lookDeltaPitch = -mouseDy * radiansPerPixel;

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
