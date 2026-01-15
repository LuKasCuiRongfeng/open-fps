// Camera Mode System: handles camera mode toggling from input.
// 相机模式系统：处理输入切换相机模式

import type { GameWorld } from "../ecs/GameEcs";

/**
 * cameraModeSystem: toggles camera mode based on PlayerInput.
 * cameraModeSystem：根据 PlayerInput 切换相机模式
 */
export function cameraModeSystem(world: GameWorld): void {
  for (const [, player, playerInput] of world.query("player", "playerInput")) {
    if (playerInput.toggleCameraMode) {
      player.cameraMode = player.cameraMode === "firstPerson" ? "thirdPerson" : "firstPerson";
      playerInput.toggleCameraMode = false;
    }

    if (playerInput.toggleThirdPersonStyle) {
      player.thirdPersonStyle = player.thirdPersonStyle === "overShoulder" ? "chase" : "overShoulder";
      playerInput.toggleThirdPersonStyle = false;
    }
  }
}
