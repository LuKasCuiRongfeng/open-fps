// Editor exports.
// 编辑器导出

// Common brush indicator system.
// 通用笔刷指示器系统
export * from "./common";

// Re-export from project/ (now at top level).
// 从 project/ 重新导出（现在在顶层）
export * from "../project/MapData";
export * from "../project/ProjectData";
export * from "../project/ProjectStorage";

// Terrain editing.
// 地形编辑
export * from "./terrain/TerrainEditor";
export * from "./terrain/EditorOrbitCamera";
export * from "./terrain/TerrainBrush";

// Texture editing.
// 纹理编辑
export * from "./texture/TextureData";
export * from "./texture/TextureStorage";
export * from "./texture/TextureEditor";

// Vegetation editing.
// 植被编辑
export * from "./vegetation";
