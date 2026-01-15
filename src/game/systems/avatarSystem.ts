import type { GameResources } from "../ecs/resources";
import type { ComponentStores } from "../ecs/stores";

export function avatarSystem(stores: ComponentStores, _resources: GameResources) {
  // Sync avatar object transforms and visibility.
  // 同步占位模型的变换与可见性
  for (const [entityId, avatar] of stores.avatar.entries()) {
    const transform = stores.transform.get(entityId);
    const player = stores.player.get(entityId);
    if (!transform || !player) continue;

    avatar.object.position.set(transform.x, transform.y, transform.z);
    avatar.object.rotation.set(0, transform.yawRadians, 0);

    avatar.object.visible = player.cameraMode === "thirdPerson";
  }
}
