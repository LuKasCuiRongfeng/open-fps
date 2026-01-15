// TerrainSystem: facade for the streaming terrain system.
// TerrainSystem：流式地形系统的门面

import { Group } from "three/webgpu";
import type { Scene, WebGPURenderer, PerspectiveCamera } from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import { ChunkManager } from "./ChunkManager";
import { FloatingOrigin } from "./FloatingOrigin";
import { TerrainGpuCuller } from "./TerrainGpuCuller";
import { TerrainHeightSampler } from "./TerrainHeightSampler";

export type TerrainSystemResource = {
  root: Group;
  heightAt: (xMeters: number, zMeters: number) => number;
  floatingOrigin: FloatingOrigin;
  initGpu?: (renderer: WebGPURenderer) => Promise<void>;
  update: (playerWorldX: number, playerWorldZ: number, camera: PerspectiveCamera) => void;
  dispose: () => void;
};

/**
 * Create the streaming terrain system.
 * 创建流式地形系统
 */
export function createTerrainSystem(
  config: TerrainConfig,
  scene: Scene,
): TerrainSystemResource {
  const root = new Group();
  root.name = "terrain-system";

  const floatingOrigin = new FloatingOrigin(config);
  const culler = new TerrainGpuCuller(config);

  let chunkManager: ChunkManager | null = null;

  const heightAt = (xMeters: number, zMeters: number): number => {
    return TerrainHeightSampler.heightAt(xMeters, zMeters, config);
  };

  const initGpu = async (r: WebGPURenderer): Promise<void> => {
    culler.init(r);

    // Create chunk manager after renderer is ready.
    // 渲染器就绪后创建 chunk 管理器
    if (config.streaming.enabled) {
      chunkManager = new ChunkManager(config, scene, floatingOrigin);

      // Force load chunks around spawn point.
      // 强制加载出生点周围的 chunk
      const spawnX = 0;
      const spawnZ = 5;
      chunkManager.forceLoadAround(spawnX, spawnZ);
    }
  };

  const update = (playerWorldX: number, playerWorldZ: number, camera: PerspectiveCamera): void => {
    if (!config.streaming.enabled || !chunkManager) return;

    // Update chunk streaming based on player position.
    // 根据玩家位置更新 chunk 流式加载
    chunkManager.update(playerWorldX, playerWorldZ);

    // Get camera world position for LOD and culling.
    // 获取相机世界位置用于 LOD 和剔除
    const cameraWorld = floatingOrigin.localToWorld(
      camera.position.x,
      camera.position.y,
      camera.position.z,
    );

    // Update LOD for all active chunks.
    // 更新所有活跃 chunk 的 LOD
    const chunks = chunkManager.getActiveChunks();
    for (const chunk of chunks) {
      chunk.updateLod(cameraWorld.x, cameraWorld.z);
    }

    // Perform frustum culling.
    // 执行视锥剔除
    const visibleIndices = culler.cull(chunks, camera);

    // Update chunk visibility.
    // 更新 chunk 可见性
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].mesh.visible = visibleIndices.includes(i);
    }

    // Check for floating origin rebase.
    // 检查浮动原点重置
    const playerLocal = floatingOrigin.worldToLocal(playerWorldX, 0, playerWorldZ);
    floatingOrigin.checkAndRebase(playerLocal.x, playerLocal.z);
  };

  const dispose = (): void => {
    chunkManager?.dispose();
    culler.dispose();
    TerrainHeightSampler.clearCache();
  };

  return {
    root,
    heightAt,
    floatingOrigin,
    initGpu,
    update,
    dispose,
  };
}
