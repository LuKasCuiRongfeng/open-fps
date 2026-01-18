// Visuals configuration (sky, fog, lighting, debug).
// 视觉配置（天空、雾、光照、调试）

export const visualsConfig = {
  sky: {
    // Realistic sky gradient - clear day sky blue (based on Rayleigh scattering).
    // 真实天空渐变 - 晴天天空蓝（基于瑞利散射）
    // Typical clear sky at noon: ~0x87CEEB (sky blue) to ~0x4A90D9 (deeper blue)
    // 典型正午晴空：~0x87CEEB（天蓝色）到 ~0x4A90D9（深蓝色）
    colorHex: 0x87ceeb,
  },

  fog: {
    // Realistic atmospheric fog / aerial perspective.
    // 真实大气雾 / 空气透视
    // Real-world visibility: clear day ~20-50km, hazy ~5-10km, foggy <1km
    // 真实能见度：晴天 ~20-50km，有霾 ~5-10km，有雾 <1km
    // FogExp2 density formula: visibility ≈ 3.912 / density
    // FogExp2 浓度公式：能见度 ≈ 3.912 / density
    // density 0.00015 → ~26km visibility (clear day)
    // density 0.00015 → ~26km 能见度（晴天）
    //
    // Fog color should match horizon sky for realism (slightly desaturated).
    // 雾颜色应匹配地平线天空以获得真实感（略微去饱和）
    colorHex: 0xa8c8e8,
    // Default density for clear day (~25km visibility).
    // 晴天默认浓度（~25km 能见度）
    densityPerMeter: 0.00015,
    // Min/max for UI slider.
    // UI 滑块的最小/最大值
    minDensity: 0.00005, // ~78km visibility (very clear)
    maxDensity: 0.005,   // ~780m visibility (heavy fog)
  },

  lights: {
    hemi: {
      // Sky light: slightly warm blue to simulate sky dome illumination.
      // 天空光：略带暖色的蓝色，模拟天穹照明
      skyColorHex: 0x8ec8e8,
      // Ground bounce: greenish brown from grass/earth.
      // 地面反射：来自草地/土壤的绿褐色
      groundColorHex: 0x3d5c3d,
      // High intensity for soft ambient fill on all surfaces.
      // 高强度以在所有表面提供柔和的环境光填充
      intensity: 1.5,
    },
    sun: {
      // Sunlight: slightly warm white (6500K daylight).
      // 阳光：略带暖色的白光（6500K 日光）
      colorHex: 0xfffaf0,
      // Reduced intensity for balanced lighting with strong ambient.
      // 降低强度以与强环境光平衡
      intensity: 0.6,
      // Sun position: high overhead angle for even lighting and less harsh side shadows.
      // 太阳位置：高顶角以获得均匀光照和更柔和的侧面阴影
      position: [30, 150, 20] as const,
    },
  },

  debug: {
    originMarkerSizeMeters: 0.3,
  },
} as const;

export type VisualsConfig = typeof visualsConfig;
