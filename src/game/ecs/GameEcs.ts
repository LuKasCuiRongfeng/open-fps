// GameEcs: typed ECS world instance for this game.
// GameEcs：本游戏的类型化 ECS 世界实例

import { EcsWorld, type EntityId } from "./EcsWorld";
import { COMPONENT_KEYS, type ComponentTypes } from "./components";

export type { EntityId };

/**
 * GameWorld: EcsWorld specialized for our component types.
 * GameWorld：针对我们组件类型特化的 EcsWorld
 */
export type GameWorld = EcsWorld<ComponentTypes>;

/**
 * GameEcs: the main ECS instance for the game.
 * GameEcs：游戏的主 ECS 实例
 *
 * Usage:
 *   const ecs = new GameEcs();
 *   const id = ecs.world.createEntity();
 *   ecs.world.add(id, "transform", { x: 0, y: 0, z: 0, yawRadians: 0, pitchRadians: 0 });
 *   for (const [id, t, v] of ecs.world.query("transform", "velocity")) { ... }
 */
export class GameEcs {
  readonly world: GameWorld;

  constructor() {
    this.world = new EcsWorld<ComponentTypes>(COMPONENT_KEYS);
  }

  /**
   * Shorthand for creating an entity.
   * 创建实体的简写
   */
  createEntity(): EntityId {
    return this.world.createEntity();
  }

  /**
   * Shorthand for destroying an entity (deferred).
   * 销毁实体的简写（延迟执行）
   */
  destroyEntity(entityId: EntityId): void {
    this.world.destroyEntity(entityId);
  }

  /**
   * Flush destroyed entities at end of frame.
   * 在帧末刷新已销毁的实体
   */
  flushDestroyed(): void {
    this.world.flushDestroyed();
  }
}

