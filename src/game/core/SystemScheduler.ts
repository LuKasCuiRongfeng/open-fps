// SystemScheduler: ECS system execution with phase ordering.
// SystemScheduler：带阶段排序的 ECS 系统执行器

import type { GameWorld } from "@game/ecs/GameEcs";
import type { GameResources } from "@game/ecs/resources";

/**
 * System execution phases for explicit dependency management.
 * 系统执行阶段，用于显式依赖管理
 *
 * Industry best practice: organize systems into phases.
 * 业界最佳实践：将系统组织成阶段
 */
export type SystemPhase = "input" | "gameplay" | "physics" | "render";

export type SystemFn = (world: GameWorld, res: GameResources) => void;

export interface SystemEntry {
  name: string;
  phase: SystemPhase;
  fn: SystemFn;
}

/**
 * Manages system registration and execution.
 * 管理系统注册和执行
 */
export class SystemScheduler {
  private readonly systems: SystemEntry[] = [];

  /**
   * Register a system in the specified phase.
   * 在指定阶段注册系统
   */
  register(name: string, phase: SystemPhase, fn: SystemFn): void {
    this.systems.push({ name, phase, fn });
  }

  /**
   * Execute all systems in phase order.
   * 按阶段顺序执行所有系统
   */
  execute(world: GameWorld, resources: GameResources): void {
    for (const system of this.systems) {
      system.fn(world, resources);
    }
  }

  /**
   * Get all registered systems.
   * 获取所有已注册的系统
   */
  getSystems(): readonly SystemEntry[] {
    return this.systems;
  }

  /**
   * Get systems by phase.
   * 按阶段获取系统
   */
  getSystemsByPhase(phase: SystemPhase): SystemEntry[] {
    return this.systems.filter((s) => s.phase === phase);
  }
}
