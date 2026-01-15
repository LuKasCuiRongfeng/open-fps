import type { EntityId } from "./EcsWorld";
import type { AvatarComponent, PlayerComponent, TransformComponent } from "./components";

export type ComponentStores = {
  transform: Map<EntityId, TransformComponent>;
  player: Map<EntityId, PlayerComponent>;
  avatar: Map<EntityId, AvatarComponent>;
};

export function createStores(): ComponentStores {
  return {
    transform: new Map(),
    player: new Map(),
    avatar: new Map(),
  };
}
