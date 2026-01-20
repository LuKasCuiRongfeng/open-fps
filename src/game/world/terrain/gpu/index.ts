// Terrain GPU compute modules index.
// 地形 GPU 计算模块索引

export { TerrainHeightCompute } from "./TerrainHeightCompute";
export { TerrainNormalCompute } from "./TerrainNormalCompute";
export { TerrainBrushCompute } from "./TerrainBrushCompute";
export { SplatMapCompute } from "./SplatMapCompute";
export { createHashTexture, buildHeightComputeShader } from "./TerrainNoiseShader";
