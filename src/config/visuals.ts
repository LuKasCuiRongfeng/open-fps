// Visuals configuration (sky, fog, lighting, debug).
// 视觉配置（天空、雾、光照、调试）

export const visualsConfig = {
  sky: {
    // Simple sky background (fallback); later can be replaced with procedural sky.
    // 简单天空背景色（兜底）；后续可替换为程序化天空
    colorHex: 0x7fb7ff,
  },

  fog: {
    // Atmospheric fog for large maps.
    // 大地图的大气雾（模拟薄雾/轻霾）
    // density units: 1/m (FogExp2)
    // density 单位：1/米（FogExp2）
    colorHex: 0xb7d9ff,
    densityPerMeter: 0.0025,
  },

  lights: {
    hemi: {
      skyColorHex: 0xbdd7ff,
      groundColorHex: 0x223322,
      intensity: 0.8,
    },
    sun: {
      colorHex: 0xffffff,
      intensity: 1.0,
      position: [20, 30, 10] as const,
    },
  },

  debug: {
    originMarkerSizeMeters: 0.3,
  },
} as const;

export type VisualsConfig = typeof visualsConfig;
