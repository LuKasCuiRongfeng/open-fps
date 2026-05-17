// Terrain module - exports GPU-first streaming terrain system.
// 地形模块 - 导出 GPU-first 流式地形系统

export type { TerrainConfig } from "@config/terrain";

// Export GPU-first system components.
// 导出 GPU-first 系统组件
export {
	createTerrainSystem,
	type TerrainHeightPageSnapshot,
	type TerrainHeightPageSnapshotPage,
	type TerrainSystemResource,
} from "./TerrainSystem";
export { TerrainPageManager } from "./TerrainPageManager";
export { FloatingOrigin } from "../common/FloatingOrigin";
export { TerrainClipmapRenderer } from "./TerrainClipmapRenderer";
export { TerrainHeightSampler } from "./TerrainHeightSampler";

// Export GPU compute modules.
// 导出 GPU 计算模块
export * from "./gpu";
