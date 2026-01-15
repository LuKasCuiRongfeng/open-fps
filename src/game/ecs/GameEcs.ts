import { EcsWorld, type EntityId } from "./EcsWorld";
import { createStores, type ComponentStores } from "./stores";

export class GameEcs {
  readonly world = new EcsWorld();
  readonly stores: ComponentStores = createStores();

  createEntity(): EntityId {
    return this.world.createEntity();
  }
}
