// Core ECS World with entity lifecycle and query API.
// ECS 核心：实体生命周期管理 + 查询 API

export type EntityId = number & { readonly __brand: unique symbol };

type ComponentMap<T> = Map<EntityId, T>;

export type ComponentStoreDefinition = Record<string, unknown>;

/**
 * ECS World: manages entities, component stores, and queries.
 * ECS World：管理实体、组件存储和查询
 *
 * Industry best practice:
 * - Entities are just IDs (no classes)
 * - Components are plain data (no methods)
 * - Systems are functions that query and transform data
 * 业界最佳实践：
 * - 实体只是 ID（没有类）
 * - 组件是纯数据（没有方法）
 * - 系统是查询并转换数据的函数
 */
export class EcsWorld<TStores extends ComponentStoreDefinition> {
  private nextEntityId = 1;
  private readonly alive = new Set<EntityId>();
  private readonly pendingDestroy = new Set<EntityId>();
  private readonly stores: { [K in keyof TStores]: ComponentMap<TStores[K]> };

  /**
   * Callbacks invoked when an entity is destroyed (for cleanup).
   * 实体销毁时调用的回调（用于清理）
   */
  private readonly destroyCallbacks: Array<(entityId: EntityId) => void> = [];

  constructor(storeKeys: (keyof TStores)[]) {
    // Initialize empty Maps for each component type.
    // 为每种组件类型初始化空 Map
    this.stores = {} as { [P in keyof TStores]: ComponentMap<TStores[P]> };
    for (const key of storeKeys) {
      (this.stores as Record<keyof TStores, ComponentMap<unknown>>)[key] = new Map();
    }
  }

  // --- Entity Lifecycle / 实体生命周期 ---

  createEntity(): EntityId {
    const id = this.nextEntityId++ as EntityId;
    this.alive.add(id);
    return id;
  }

  /**
   * Mark an entity for destruction. Actual removal happens in flushDestroyed().
   * 标记实体待销毁。实际移除在 flushDestroyed() 中进行。
   */
  destroyEntity(entityId: EntityId): void {
    if (this.alive.has(entityId)) {
      this.pendingDestroy.add(entityId);
    }
  }

  /**
   * Immediately destroy an entity (use with caution during iteration).
   * 立即销毁实体（迭代时慎用）
   */
  destroyEntityImmediate(entityId: EntityId): void {
    if (!this.alive.has(entityId)) return;

    // Invoke cleanup callbacks.
    // 调用清理回调
    for (const cb of this.destroyCallbacks) {
      cb(entityId);
    }

    // Remove from all stores.
    // 从所有存储中移除
    for (const key of Object.keys(this.stores) as (keyof TStores)[]) {
      this.stores[key].delete(entityId);
    }

    this.alive.delete(entityId);
    this.pendingDestroy.delete(entityId);
  }

  /**
   * Flush all pending destroys. Call at end of frame.
   * 刷新所有待销毁实体。在帧末调用。
   */
  flushDestroyed(): void {
    for (const entityId of this.pendingDestroy) {
      this.destroyEntityImmediate(entityId);
    }
    this.pendingDestroy.clear();
  }

  isAlive(entityId: EntityId): boolean {
    return this.alive.has(entityId) && !this.pendingDestroy.has(entityId);
  }

  entityCount(): number {
    return this.alive.size - this.pendingDestroy.size;
  }

  /**
   * Register a callback for entity destruction (e.g., cleanup Three.js objects).
   * 注册实体销毁回调（如清理 Three.js 对象）
   */
  onDestroy(callback: (entityId: EntityId) => void): void {
    this.destroyCallbacks.push(callback);
  }

  // --- Component Access / 组件访问 ---

  getStore<K extends keyof TStores>(key: K): ComponentMap<TStores[K]> {
    return this.stores[key];
  }

  add<K extends keyof TStores>(entityId: EntityId, key: K, component: TStores[K]): void {
    if (!this.alive.has(entityId)) {
      console.warn(`Cannot add component to dead entity ${entityId}`);
      return;
    }
    this.stores[key].set(entityId, component);
  }

  get<K extends keyof TStores>(entityId: EntityId, key: K): TStores[K] | undefined {
    return this.stores[key].get(entityId);
  }

  has<K extends keyof TStores>(entityId: EntityId, key: K): boolean {
    return this.stores[key].has(entityId);
  }

  remove<K extends keyof TStores>(entityId: EntityId, key: K): void {
    this.stores[key].delete(entityId);
  }

  // --- Query API / 查询 API ---
  // Simplified overloads for common arities (1-5 components).
  // 简化的重载，支持常见的组件数量（1-5个）

  /**
   * Query entities with all specified components.
   * 查询拥有所有指定组件的实体
   *
   * @example
   * for (const [id, transform, velocity] of world.query("transform", "velocity")) {
   *   transform.x += velocity.vx * dt;
   * }
   */
  query<K1 extends keyof TStores>(
    k1: K1
  ): IterableIterator<[EntityId, TStores[K1]]>;

  query<K1 extends keyof TStores, K2 extends keyof TStores>(
    k1: K1, k2: K2
  ): IterableIterator<[EntityId, TStores[K1], TStores[K2]]>;

  query<K1 extends keyof TStores, K2 extends keyof TStores, K3 extends keyof TStores>(
    k1: K1, k2: K2, k3: K3
  ): IterableIterator<[EntityId, TStores[K1], TStores[K2], TStores[K3]]>;

  query<K1 extends keyof TStores, K2 extends keyof TStores, K3 extends keyof TStores, K4 extends keyof TStores>(
    k1: K1, k2: K2, k3: K3, k4: K4
  ): IterableIterator<[EntityId, TStores[K1], TStores[K2], TStores[K3], TStores[K4]]>;

  query<K1 extends keyof TStores, K2 extends keyof TStores, K3 extends keyof TStores, K4 extends keyof TStores, K5 extends keyof TStores>(
    k1: K1, k2: K2, k3: K3, k4: K4, k5: K5
  ): IterableIterator<[EntityId, TStores[K1], TStores[K2], TStores[K3], TStores[K4], TStores[K5]]>;

  *query(...keys: (keyof TStores)[]): IterableIterator<[EntityId, ...unknown[]]> {
    if (keys.length === 0) return;

    // Use smallest store as base for iteration (optimization).
    // 以最小的存储作为迭代基础（优化）
    let baseStore = this.stores[keys[0]];
    for (const key of keys) {
      if (this.stores[key].size < baseStore.size) {
        baseStore = this.stores[key];
      }
    }

    outer: for (const entityId of baseStore.keys()) {
      if (this.pendingDestroy.has(entityId)) continue;

      const components: unknown[] = [];
      for (const key of keys) {
        const component = this.stores[key].get(entityId);
        if (component === undefined) continue outer;
        components.push(component);
      }

      yield [entityId, ...components];
    }
  }

  /**
   * Query for a single entity with specified components.
   * 查询单个拥有指定组件的实体（常用于单例实体如 player）
   */
  queryOne<K1 extends keyof TStores>(
    k1: K1
  ): [EntityId, TStores[K1]] | null;

  queryOne<K1 extends keyof TStores, K2 extends keyof TStores>(
    k1: K1, k2: K2
  ): [EntityId, TStores[K1], TStores[K2]] | null;

  queryOne<K1 extends keyof TStores, K2 extends keyof TStores, K3 extends keyof TStores>(
    k1: K1, k2: K2, k3: K3
  ): [EntityId, TStores[K1], TStores[K2], TStores[K3]] | null;

  queryOne<K1 extends keyof TStores, K2 extends keyof TStores, K3 extends keyof TStores, K4 extends keyof TStores>(
    k1: K1, k2: K2, k3: K3, k4: K4
  ): [EntityId, TStores[K1], TStores[K2], TStores[K3], TStores[K4]] | null;

  queryOne(...keys: (keyof TStores)[]): [EntityId, ...unknown[]] | null {
    for (const result of this.query(...(keys as [keyof TStores]))) {
      return result as [EntityId, ...unknown[]];
    }
    return null;
  }

  /**
   * Query entities with all required components and optionally some components.
   * 查询拥有所有必需组件的实体，并可选地获取某些组件
   */
  *queryWith<
    TRequired extends keyof TStores,
    TOptional extends keyof TStores,
  >(
    required: TRequired[],
    optional: TOptional[],
  ): IterableIterator<{
    id: EntityId;
    required: { [K in TRequired]: TStores[K] };
    optional: { [K in TOptional]?: TStores[K] };
  }> {
    if (required.length === 0) return;

    let baseStore = this.stores[required[0]];
    for (const key of required) {
      if (this.stores[key].size < baseStore.size) {
        baseStore = this.stores[key];
      }
    }

    outer: for (const entityId of baseStore.keys()) {
      if (this.pendingDestroy.has(entityId)) continue;

      const req = {} as { [K in TRequired]: TStores[K] };
      for (const key of required) {
        const component = this.stores[key].get(entityId);
        if (component === undefined) continue outer;
        req[key] = component;
      }

      const opt = {} as { [K in TOptional]?: TStores[K] };
      for (const key of optional) {
        const component = this.stores[key].get(entityId);
        if (component !== undefined) {
          opt[key] = component;
        }
      }

      yield { id: entityId, required: req, optional: opt };
    }
  }
}
