import { worldConfig } from "../../config/world";
import type { GameResources } from "../ecs/resources";
import type { ComponentStores } from "../ecs/stores";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function worldBoundsSystem(stores: ComponentStores, _resources: GameResources) {
  const inset = worldConfig.map.airWallInsetMeters;
  const halfW = worldConfig.map.widthMeters * 0.5 - inset;
  const halfD = worldConfig.map.depthMeters * 0.5 - inset;

  for (const entityId of stores.player.keys()) {
    const transform = stores.transform.get(entityId);
    if (!transform) continue;

    transform.x = clamp(transform.x, -halfW, halfW);
    transform.z = clamp(transform.z, -halfD, halfD);
  }
}
