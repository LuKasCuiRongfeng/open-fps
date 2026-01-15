// ECS Resources: shared runtime data and singletons.
// ECS 资源：共享的运行时数据和单例

import type { PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu";
import type { InputManager } from "../input/InputManager";
import type { GameSettings } from "../settings/GameSettings";
import type { TerrainResource } from "../world/terrain";

// --- Time Resource / 时间资源 ---

/**
 * Time resource: frame timing information.
 * 时间资源：帧时间信息
 *
 * Industry best practice: centralize time data instead of passing dt everywhere.
 * 业界最佳实践：集中时间数据，而不是到处传递 dt
 */
export type TimeResource = {
  /** Delta time in seconds (clamped). / 帧间隔（秒，已钳制） */
  dt: number;
  /** Total elapsed time in seconds. / 总运行时间（秒） */
  elapsed: number;
  /** Frame number (monotonic). / 帧序号（单调递增） */
  frame: number;
};

// --- Singletons / 单例 ---

/**
 * Singletons: unique system instances with lifecycle.
 * 单例：有生命周期的唯一系统实例
 *
 * These are NOT ECS components - they are global services.
 * 这些不是 ECS 组件 - 它们是全局服务
 */
export type Singletons = {
  /** Three.js scene graph root. / Three.js 场景图根节点 */
  scene: Scene;
  /** Main camera. / 主相机 */
  camera: PerspectiveCamera;
  /** WebGPU renderer. / WebGPU 渲染器 */
  renderer: WebGPURenderer;
  /** Raw input manager. / 原始输入管理器 */
  input: InputManager;
};

// --- Runtime Resources / 运行时资源 ---

/**
 * Runtime resources: shared data that systems read/write.
 * 运行时资源：系统读写的共享数据
 */
export type RuntimeResources = {
  /** Terrain height/sampling. / 地形高度/采样 */
  terrain: TerrainResource;
  /** Player-configurable settings. / 玩家可配置的设置 */
  settings: GameSettings;
};

// --- Combined GameResources / 合并的 GameResources ---

/**
 * GameResources: all resources available to systems.
 * GameResources：系统可用的所有资源
 *
 * Structure:
 * - time: frame timing (updated each frame)
 * - singletons: global service instances
 * - runtime: shared game data
 *
 * 结构：
 * - time：帧时间（每帧更新）
 * - singletons：全局服务实例
 * - runtime：共享游戏数据
 */
export type GameResources = {
  time: TimeResource;
  singletons: Singletons;
  runtime: RuntimeResources;
};

/**
 * Create initial time resource.
 * 创建初始时间资源
 */
export function createTimeResource(): TimeResource {
  return {
    dt: 0,
    elapsed: 0,
    frame: 0,
  };
}

