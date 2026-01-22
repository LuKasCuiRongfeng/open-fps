// Sky configuration.
// 天空配置

import { fogRuntimeConfig } from "./fog";

// ============================================================================
// Runtime config - can be modified at runtime via UI.
// 运行时配置 - 可通过 UI 在运行时修改
// ============================================================================
export const skyRuntimeConfig = {
  // Sun position.
  // 太阳位置
  sunElevation: 45, // degrees (0 = horizon, 90 = overhead) / 度（0 = 地平线，90 = 头顶）
  sunAzimuth: 180, // degrees (0 = north, 90 = east) / 度（0 = 北，90 = 东）
  sunSize: 15, // meters (radius at 1500m distance) / 米（1500m 距离处的半径）

  // Lighting.
  // 光照
  ambientIntensity: 1.5, // hemisphere light intensity / 半球光强度
  sunIntensity: 0.6, // directional light intensity / 方向光强度
  shadowsEnabled: true,
  normalSoftness: 0.4, // terrain normal softness (0 = sharp, 1 = flat) / 地形法线柔和度

  // Fog.
  // 雾
  fogDensity: fogRuntimeConfig.densityPerMeter,

  // Bloom post-processing.
  // 泛光后处理
  bloomEnabled: true,
  bloomThreshold: 0.85,
  bloomStrength: 0.4,
  bloomRadius: 0.3,

  // Effects.
  // 特效
  lensflareEnabled: true,
  godRaysEnabled: true,
  godRaysWeight: 0.5,
  godRaysDecay: 0.95,
  godRaysExposure: 3.0,

  // Night sky.
  // 夜空
  starBrightness: 1.2,
  nightLightIntensity: 1.0,
};

// ============================================================================
// Static config - fixed at compile time, not exposed to UI.
// 静态配置 - 编译时固定，不暴露给 UI
// ============================================================================
export const skyStaticConfig = {
  // Hemisphere light colors.
  // 半球光颜色
  hemiSkyColorHex: 0x8ec8e8, // slightly warm blue / 略带暖色的蓝色
  hemiGroundColorHex: 0x3d5c3d, // greenish brown / 绿褐色

  // Sun light.
  // 太阳光
  sunColorHex: 0xfffaf0, // slightly warm white (6500K daylight) / 略带暖色的白光
  sunPosition: [30, 150, 20] as const, // initial position / 初始位置
} as const;
