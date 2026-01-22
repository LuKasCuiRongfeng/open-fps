// Config module - re-exports all config modules.
// 配置模块 - 重新导出所有配置模块

// Terrain (unchanged for now).
// 地形（暂不修改）
export { terrainConfig, type TerrainConfig } from "./terrain";

// Player.
// 玩家
export { playerRuntimeConfig, playerStaticConfig } from "./player";

// Camera.
// 相机
export {
  cameraRuntimeConfig,
  cameraStaticConfig,
  type CameraMode,
  type ThirdPersonStyle,
} from "./camera";

// Input (unchanged - all static).
// 输入（不变 - 全是静态）
export { inputConfig, type InputConfig, isKeyDown, isKeyJustPressed } from "./input";

// Render.
// 渲染
export { renderRuntimeConfig, renderStaticConfig } from "./render";

// Fog.
// 雾
export { fogRuntimeConfig, fogStaticConfig } from "./fog";

// Sky.
// 天空
export { skyRuntimeConfig, skyStaticConfig } from "./sky";

