// Input System: converts raw input into PlayerInput components.
// 输入系统：将原始输入转换为 PlayerInput 组件

import { worldConfig } from "../../config/world";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

/**
 * inputSystem: reads raw input and writes to PlayerInput components.
 * inputSystem：读取原始输入并写入 PlayerInput 组件
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
  const input = res.singletons.input;
  const settings = res.runtime.settings;

  // Read raw input state.
  // 读取原始输入状态
  const forwardDown = input.isDown("KeyW") || input.isDown("ArrowUp");
  const backwardDown = input.isDown("KeyS") || input.isDown("ArrowDown");
  const leftDown = input.isDown("KeyA") || input.isDown("ArrowLeft");
  const rightDown = input.isDown("KeyD") || input.isDown("ArrowRight");
  const sprintDown = input.isDown("ShiftLeft") || input.isDown("ShiftRight");

  // Compute normalized movement direction.
  // 计算归一化的移动方向
  let moveX = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
  let moveZ = (forwardDown ? 1 : 0) - (backwardDown ? 1 : 0);
  const len = Math.hypot(moveX, moveZ);
  if (len > 0) {
    moveX /= len;
    moveZ /= len;
  }

  // Consume one-shot inputs.
  // 消费一次性输入
  const jumpPressed = input.consumeJustPressed(worldConfig.input.jump.code);
  const toggleCameraMode = input.consumeToggleCameraMode();
  const toggleThirdPersonStyle = input.consumeToggleThirdPersonStyle();

  // Look delta from mouse.
  // 鼠标视角增量
  const { dx: mouseDx, dy: mouseDy } = input.consumeMouseDelta();
  const radiansPerPixel = worldConfig.player.look.radiansPerPixel * settings.player.mouseSensitivity;
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
}
