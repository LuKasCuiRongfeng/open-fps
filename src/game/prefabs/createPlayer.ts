// Player Prefab: creates a player entity with all required components.
// 玩家预制件：创建带有所有必需组件的玩家实体

import { defaultsConfig } from "../../config/defaults";
import { playerConfig } from "../../config/player";
import type { GameResources } from "../ecs/resources";
import type { EntityId } from "../ecs/EcsWorld";
import type { GameEcs } from "../ecs/GameEcs";
import { createHumanoidAvatar } from "./createHumanoidAvatar";

/**
 * createPlayer: spawns a player entity with all components.
 * createPlayer：生成带有所有组件的玩家实体
 *
 * Components:
 * - transform: position and orientation
 * - velocity: movement speed
 * - physics: grounded state
 * - playerInput: input buffer
 * - player: camera mode state
 * - avatar: visual representation
 */
export function createPlayer(ecs: GameEcs, resources: GameResources): EntityId {
  const playerId = ecs.createEntity();
  const world = ecs.world;

  const spawnX = playerConfig.spawn.xMeters;
  const spawnZ = playerConfig.spawn.zMeters;
  const spawnY = resources.runtime.terrain.heightAt(spawnX, spawnZ);

  // Transform: position and orientation.
  // Transform：位置和朝向
  world.add(playerId, "transform", {
    x: spawnX,
    y: spawnY,
    z: spawnZ,
    yawRadians: 0,
    pitchRadians: 0,
  });

  // Velocity: movement speed (physics will integrate).
  // Velocity：移动速度（物理系统会积分）
  world.add(playerId, "velocity", {
    vx: 0,
    vy: 0,
    vz: 0,
  });

  // Physics: grounded state.
  // Physics：着地状态
  world.add(playerId, "physics", {
    grounded: true,
  });

  // PlayerInput: input buffer (written by inputSystem).
  // PlayerInput：输入缓冲（由 inputSystem 写入）
  world.add(playerId, "playerInput", {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
    toggleCameraMode: false,
    toggleThirdPersonStyle: false,
  });

  // Player: camera mode state.
  // Player：相机模式状态
  world.add(playerId, "player", {
    cameraMode: defaultsConfig.cameraMode,
    thirdPersonStyle: defaultsConfig.thirdPersonStyle,
  });

  // Avatar: visual representation.
  // Avatar：视觉表示
  const avatar = createHumanoidAvatar();
  resources.singletons.scene.add(avatar.root);
  world.add(playerId, "avatar", { object: avatar.root });

  return playerId;
}
