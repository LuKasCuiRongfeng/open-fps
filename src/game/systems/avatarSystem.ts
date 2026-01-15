// Avatar System: syncs Three.js avatar objects with ECS state.
// Avatar 系统：将 Three.js 占位模型与 ECS 状态同步

import type { GameWorld } from "../ecs/GameEcs";

/**
 * avatarSystem: syncs avatar object transforms and visibility with ECS state.
 * avatarSystem：同步占位模型的变换与可见性
 */
export function avatarSystem(world: GameWorld): void {
  for (const [, transform, player, avatar] of world.query("transform", "player", "avatar")) {
    avatar.object.position.set(transform.x, transform.y, transform.z);
    avatar.object.rotation.set(0, transform.yawRadians, 0);

    // Hide avatar in first-person mode.
    // 第一人称模式下隐藏 avatar
    avatar.object.visible = player.cameraMode === "thirdPerson";
  }
}
