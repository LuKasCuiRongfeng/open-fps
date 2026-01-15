// Config module - re-exports all config modules.
// 配置模块 - 重新导出所有配置模块

export { terrainConfig, type TerrainConfig } from "./terrain";
export { playerConfig, type PlayerConfig } from "./player";
export { cameraConfig, type CameraConfig, type CameraMode, type ThirdPersonStyle } from "./camera";
export { inputConfig, type InputConfig } from "./input";
export { renderConfig, type RenderConfig } from "./render";
export { visualsConfig, type VisualsConfig } from "./visuals";
export { defaultsConfig, type DefaultsConfig } from "./defaults";
