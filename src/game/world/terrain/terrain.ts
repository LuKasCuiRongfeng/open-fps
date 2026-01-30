// Terrain module - exports GPU-first streaming terrain system.
// 地形模块 - 导出 GPU-first 流式地形系统

import type { terrainConfig } from "@config/terrain";

export type TerrainConfig = typeof terrainConfig;

// Export GPU-first system components.
// 导出 GPU-first 系统组件
export { createTerrainSystem, type TerrainSystemResource } from "./TerrainSystem";
export { ChunkManager } from "./ChunkManager";
export { FloatingOrigin } from "../common/FloatingOrigin";
export { TerrainChunk } from "./TerrainChunk";
export { TerrainHeightSampler } from "./TerrainHeightSampler";
export { createGpuTerrainMaterial } from "./material/terrainMaterial";

// Export GPU compute modules.
// 导出 GPU 计算模块
export * from "./gpu";
