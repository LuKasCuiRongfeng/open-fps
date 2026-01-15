import { worldConfig } from "../../config/world";
import type { GameResources } from "../ecs/resources";
import type { EntityId } from "../ecs/EcsWorld";
import type { GameEcs } from "../ecs/GameEcs";
import { createHumanoidAvatar } from "./createHumanoidAvatar";

export function createPlayer(ecs: GameEcs, resources: GameResources): EntityId {
  const playerId = ecs.createEntity();

  const spawnX = worldConfig.player.spawn.xMeters;
  const spawnZ = worldConfig.player.spawn.zMeters;
  const spawnY = resources.terrain.heightAt(spawnX, spawnZ);

  ecs.stores.transform.set(playerId, {
    x: spawnX,
    y: spawnY,
    z: spawnZ,
    yawRadians: 0,
    pitchRadians: 0,
  });

  ecs.stores.player.set(playerId, {
    cameraMode: worldConfig.defaults.cameraMode,
    thirdPersonStyle: worldConfig.defaults.thirdPersonStyle,
  });

  ecs.stores.physics.set(playerId, {
    vy: 0,
    grounded: true,
  });

  const avatar = createHumanoidAvatar();
  resources.scene.add(avatar.root);
  ecs.stores.avatar.set(playerId, { object: avatar.root });

  return playerId;
}
