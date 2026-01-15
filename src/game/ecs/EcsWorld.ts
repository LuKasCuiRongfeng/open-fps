export type EntityId = number;

export class EcsWorld {
  private nextEntityId: EntityId = 1;

  createEntity(): EntityId {
    return this.nextEntityId++;
  }
}
