// GPU terrain compute modules index.
// GPU 地形计算模块索引

export { TerrainHeightCompute } from "./TerrainHeightCompute";
export { TerrainNormalCompute } from "./TerrainNormalCompute";
export { TerrainBrushCompute } from "./TerrainBrushCompute";
export { SplatMapCompute } from "./SplatMapCompute";
export { TileAtlasAllocator } from "./TileAtlasAllocator";
export { GpuTextureIO } from "./GpuTextureIO";
export { WebGpuBackend } from "./WebGpuBackend";
export type { WebGpuBackendHandle } from "./WebGpuBackend";
export { createHashTexture, buildHeightComputeShader } from "./TerrainNoiseShader";
