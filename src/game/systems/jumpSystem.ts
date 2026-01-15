import { worldConfig } from "../../config/world";
import type { GameResources } from "../ecs/resources";
import type { ComponentStores } from "../ecs/stores";

export function jumpSystem(stores: ComponentStores, resources: GameResources) {
  // Jump is edge-triggered (just-pressed).
  // 跳跃使用边沿触发（按下瞬间）
  if (!resources.input.consumeJustPressed(worldConfig.input.jump.code)) return;

  // Single-player prototype: jump the controlled player.
  // 单人原型：让本地玩家起跳
  const firstPlayerEntry = stores.player.keys().next();
  if (firstPlayerEntry.done) return;

  const entityId = firstPlayerEntry.value;
  const physics = stores.physics.get(entityId);
  if (!physics || !physics.grounded) return;

  physics.vy = resources.settings.player.jumpVelocity;
  physics.grounded = false;
}
