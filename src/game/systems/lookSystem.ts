import { worldConfig } from "../../config/world";
import type { GameResources } from "../ecs/resources";
import type { ComponentStores } from "../ecs/stores";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function lookSystem(stores: ComponentStores, resources: GameResources) {
  if (!resources.input.isPointerLocked) {
    resources.input.consumeMouseDelta();
    return;
  }

  const { dx, dy } = resources.input.consumeMouseDelta();
  const s = resources.settings.player.mouseSensitivity;
  const scale = worldConfig.player.look.radiansPerPixel;

  const yawDelta = -dx * scale * s;
  const pitchDelta = -dy * scale * s;

  for (const entityId of stores.player.keys()) {
    const transform = stores.transform.get(entityId);
    if (!transform) continue;

    transform.yawRadians += yawDelta;
    transform.pitchRadians = clamp(
      transform.pitchRadians + pitchDelta,
      worldConfig.player.pitch.minRadians,
      worldConfig.player.pitch.maxRadians,
    );
  }
}
