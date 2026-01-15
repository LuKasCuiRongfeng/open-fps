import type { GameResources } from "../ecs/resources";
import type { ComponentStores } from "../ecs/stores";

export function cameraModeSystem(stores: ComponentStores, resources: GameResources) {
  const firstPlayerEntry = stores.player.entries().next();
  if (firstPlayerEntry.done) return;
  const [, player] = firstPlayerEntry.value;

  if (resources.input.consumeToggleCameraMode()) {
    player.cameraMode = player.cameraMode === "firstPerson" ? "thirdPerson" : "firstPerson";
  }

  if (resources.input.consumeToggleThirdPersonStyle()) {
    player.thirdPersonStyle = player.thirdPersonStyle === "overShoulder" ? "chase" : "overShoulder";
  }
}
