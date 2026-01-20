// Fog configuration (atmospheric fog / aerial perspective).
// 雾配置（大气雾 / 空气透视）

export const fogConfig = {
  // Fog color should match horizon sky for realism (slightly desaturated).
  // 雾颜色应匹配地平线天空以获得真实感（略微去饱和）
  colorHex: 0xa8c8e8,

  // Default density for clear day (~25km visibility).
  // 晴天默认浓度（~25km 能见度）
  // FogExp2 density formula: visibility ≈ 3.912 / density
  // FogExp2 浓度公式：能见度 ≈ 3.912 / density
  // Real-world visibility: clear day ~20-50km, hazy ~5-10km, foggy <1km
  // 真实能见度：晴天 ~20-50km，有霾 ~5-10km，有雾 <1km
  densityPerMeter: 0.00015,

  // Min/max for UI slider.
  // UI 滑块的最小/最大值
  minDensity: 0.00005, // ~78km visibility (very clear) / ~78km 能见度（非常清晰）
  maxDensity: 0.005,   // ~780m visibility (heavy fog) / ~780m 能见度（浓雾）
} as const;

export type FogConfig = typeof fogConfig;
