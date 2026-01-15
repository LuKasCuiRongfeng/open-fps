import { worldConfig } from "../../config/world";
import type { GameResources } from "../ecs/resources";
import type { EntityId } from "../ecs/EcsWorld";
import type { GameEcs } from "../ecs/GameEcs";
import { createHumanoidAvatar } from "./createHumanoidAvatar";

export function createPlayer(ecs: GameEcs, resources: GameResources): EntityId {
  const playerId = ecs.createEntity();

  ecs.stores.transform.set(playerId, {
    x: worldConfig.player.spawn.xMeters,
    y: worldConfig.map.groundY,
    z: worldConfig.player.spawn.zMeters,
    yawRadians: 0,
    pitchRadians: 0,
  });

  ecs.stores.player.set(playerId, {
    cameraMode: worldConfig.defaults.cameraMode,
    thirdPersonStyle: worldConfig.defaults.thirdPersonStyle,
  });

  const avatar = createHumanoidAvatar();
  resources.scene.add(avatar.root);
  ecs.stores.avatar.set(playerId, { object: avatar.root });

  return playerId;
}
