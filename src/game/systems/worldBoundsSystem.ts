// World Bounds System: safety net for extreme cases.
// 世界边界系统：极端情况的安全网
//
// Note: Primary ground collision is handled by physicsSystem.
// This system is a fallback for edge cases (e.g., teleportation, respawn).
// 注意：主要的地面碰撞由 physicsSystem 处理。
// 此系统是边缘情况的后备（例如，传送、重生）。n
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

export function worldBoundsSystem(world: GameWorld, _res: GameResources): void {
  // Currently a no-op. Ground collision is handled by physicsSystem.
  // physicsSystem already uses terrain.heightAt() for ground detection.
  // 当前为空操作。地面碰撞由 physicsSystem 处理。
  // physicsSystem 已经使用 terrain.heightAt() 进行地面检测。
  void world;
}
