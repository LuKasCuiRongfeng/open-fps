// Fog configuration.
// 雾配置

// ============================================================================
// Runtime config - can be modified at runtime via UI.
// 运行时配置 - 可通过 UI 在运行时修改
// ============================================================================
export const fogRuntimeConfig = {
  // FogExp2 density formula: visibility ≈ 3.912 / density
  // Real-world visibility: clear day ~20-50km, hazy ~5-10km, foggy <1km
  densityPerMeter: 0.00015, // ~25km visibility (clear day) / ~25km 能见度（晴天）
};

// ============================================================================
// Static config - fixed at compile time, not exposed to UI.
// 静态配置 - 编译时固定，不暴露给 UI
// ============================================================================
export const fogStaticConfig = {
  colorHex: 0xa8c8e8, // match horizon sky for realism / 匹配地平线天空颜色
  minDensity: 0.00005, // ~78km visibility (very clear) / ~78km 能见度
  maxDensity: 0.005, // ~780m visibility (heavy fog) / ~780m 能见度
} as const;
