// Sky configuration (atmosphere, bloom, lighting, effects).
// 天空配置（大气、泛光、光照、特效）

import { fogConfig } from "./fog";

export const skyConfig = {
  atmosphere: {
    // Sun elevation angle in degrees (0 = horizon, 90 = overhead).
    // 太阳仰角（度，0 = 地平线，90 = 头顶）
    sunElevation: 45,
    // Sun azimuth angle in degrees (0 = north, 90 = east, 180 = south).
    // 太阳方位角（度，0 = 北，90 = 东，180 = 南）
    sunAzimuth: 180,
    // Atmospheric turbidity (2 = clear sky, 10 = hazy).
    // 大气浊度（2 = 晴空，10 = 有霾）
    turbidity: 10,
    // Rayleigh scattering coefficient (blue sky effect).
    // 瑞利散射系数（蓝天效果）
    rayleigh: 2,
    // Mie scattering coefficient (haze/sun halo).
    // 米氏散射系数（霾/太阳晕）
    mieCoefficient: 0.005,
    // Mie scattering directional factor (0 = isotropic, 1 = forward).
    // 米氏散射方向因子（0 = 各向同性，1 = 前向）
    mieDirectionalG: 0.8,
    // Fog density per meter (from fogConfig).
    // 每米雾密度（来自 fogConfig）
    fogDensity: fogConfig.densityPerMeter,
  },

  lights: {
    hemi: {
      // Sky light: slightly warm blue to simulate sky dome illumination.
      // 天空光：略带暖色的蓝色，模拟天穹照明
      skyColorHex: 0x8ec8e8,
      // Ground bounce: greenish brown from grass/earth.
      // 地面反射：来自草地/土壤的绿褐色
      groundColorHex: 0x3d5c3d,
    },
    sun: {
      // Sunlight: slightly warm white (6500K daylight).
      // 阳光：略带暖色的白光（6500K 日光）
      colorHex: 0xfffaf0,
      // Sun position: high overhead angle for even lighting and less harsh side shadows.
      // 太阳位置：高顶角以获得均匀光照和更柔和的侧面阴影
      position: [30, 150, 20] as const,
    },
  },

  bloom: {
    // Enable bloom post-processing.
    // 启用泛光后处理
    enabled: true,
    // Luminance threshold for bloom (0-1).
    // 泛光亮度阈值（0-1）
    threshold: 0.85,
    // Bloom intensity strength.
    // 泛光强度
    strength: 0.4,
    // Bloom blur radius.
    // 泛光模糊半径
    radius: 0.3,
  },

  lighting: {
    // Hemisphere light intensity (ambient fill).
    // 半球光强度（环境填充）
    ambientIntensity: 1.5,
    // Sun (directional) light intensity.
    // 太阳（方向）光强度
    sunIntensity: 0.6,
    // Enable shadows.
    // 启用阴影
    shadowsEnabled: true,
  },

  terrain: {
    // Normal softness for terrain (0 = sharp normals, 1 = flat shading).
    // 地形法线柔和度（0 = 锐利法线，1 = 平面着色）
    normalSoftness: 0.4,
  },

  effects: {
    // Lens flare effect.
    // 镜头光斑效果
    lensflare: {
      enabled: true,
      size: 1.0,
    },
    // Sun disc size in meters (radius at 1500m distance).
    // 太阳圆盘大小（米，1500m 距离处的半径）
    sunSize: 15,
    // God rays (light shaft) effect.
    // 上帝光线（光束）效果
    godRays: {
      enabled: true,
      // Weight/intensity (0-1).
      // 权重/强度（0-1）
      weight: 0.5,
      // Decay factor (0-1).
      // 衰减因子（0-1）
      decay: 0.95,
      // Exposure multiplier.
      // 曝光倍数
      exposure: 3.0,
    },
    // Night sky effects.
    // 夜空效果
    stars: {
      brightness: 1.2,
    },
    milkyWay: {
      brightness: 0.8,
    },
  },
} as const;

export type SkyConfig = typeof skyConfig;
