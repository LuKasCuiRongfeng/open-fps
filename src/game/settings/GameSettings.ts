import { cameraConfig } from "../../config/camera";
import { playerConfig } from "../../config/player";
import { renderConfig } from "../../config/render";
import { visualsConfig } from "../../config/visuals";

// --- Type utilities / 类型工具 ---

/** DeepPartial: recursively makes all fields optional. / 递归使所有字段可选 */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Editor mouse action type.
// 编辑器鼠标动作类型
export type EditorMouseAction = "brush" | "orbit" | "pan";

// Editor mouse button configuration.
// 编辑器鼠标按钮配置
export type EditorMouseConfig = {
  leftButton: EditorMouseAction;
  rightButton: EditorMouseAction;
  middleButton: EditorMouseAction;
};

export type GameSettings = {
  player: {
    mouseSensitivity: number;
    moveSpeed: number;
    sprintBonus: number;
    jumpVelocity: number;
    gravity: number;
    maxFallSpeed: number;
    thirdPerson: {
      chase: {
        followDistance: number;
        heightOffset: number;
      };
      overShoulder: {
        followDistance: number;
        heightOffset: number;
        shoulderOffset: number;
      };
      followLerpPerSecond: number;
    };
  };
  camera: {
    fovDegrees: number;
  };
  render: {
    maxPixelRatio: number;
    /** Render scale (0.5-1.0). Lower = better performance, worse quality. / 渲染缩放 (0.5-1.0)。越低性能越好，画质越差 */
    renderScale: number;
  };
  sky: {
    /** Sun elevation angle in degrees (0 = horizon, 90 = overhead). / 太阳仰角（度） */
    sunElevation: number;
    /** Sun azimuth angle in degrees (0 = north, 90 = east). / 太阳方位角（度） */
    sunAzimuth: number;
    /** Atmospheric turbidity (2 = clear, 10 = hazy). / 大气浊度 */
    turbidity: number;
    /** Rayleigh scattering coefficient. / 瑞利散射系数 */
    rayleigh: number;
    /** Mie scattering coefficient. / 米氏散射系数 */
    mieCoefficient: number;
    /** Mie scattering directional factor. / 米氏散射方向因子 */
    mieDirectionalG: number;
    /** Enable bloom post-processing. / 启用泛光后处理 */
    bloomEnabled: boolean;
    /** Bloom threshold. / 泛光阈值 */
    bloomThreshold: number;
    /** Bloom strength. / 泛光强度 */
    bloomStrength: number;
    /** Bloom radius. / 泛光半径 */
    bloomRadius: number;
    /** Hemisphere light intensity (ambient fill). / 半球光强度（环境填充） */
    ambientIntensity: number;
    /** Sun (directional) light intensity. / 太阳（方向）光强度 */
    sunIntensity: number;
    /** Enable shadows. / 启用阴影 */
    shadowsEnabled: boolean;
    /** Normal softness for terrain (0=sharp, 1=flat). / 地形法线柔和度 */
    normalSoftness: number;
    /** Fog density per meter. / 每米雾密度 */
    fogDensity: number;
    /** Enable lens flare effect. / 启用镜头光斑效果 */
    lensflareEnabled: boolean;
    /** Lens flare size multiplier. / 镜头光斑大小倍数 */
    lensflareSize: number;
    /** Sun disc size in meters (radius at 1500m distance). / 太阳圆盘大小（米） */
    sunSize: number;
    /** Enable god rays (light shaft) effect. / 启用上帝光线（光束）效果 */
    godRaysEnabled: boolean;
    /** God rays weight/intensity (0-1). / 上帝光线权重/强度 (0-1) */
    godRaysWeight: number;
    /** God rays decay factor (0-1). / 上帝光线衰减因子 (0-1) */
    godRaysDecay: number;
    /** God rays exposure multiplier. / 上帝光线曝光倍数 */
    godRaysExposure: number;
    /** Star brightness (0-2). / 星星亮度 (0-2) */
    starBrightness: number;
    /** Milky Way brightness (0-2). / 银河亮度 (0-2) */
    milkyWayBrightness: number;
  };
  editor: {
    mouseConfig: EditorMouseConfig;
    /** When true, drag operations continue even if mouse leaves window. / 为 true 时，拖拽操作在鼠标离开窗口后继续 */
    stickyDrag: boolean;
  };
  time: {
    /** Current time of day in hours (0-24). / 当前时间（小时，0-24） */
    timeOfDay: number;
    /** Time flow speed multiplier (0 = paused, 1 = realtime, 60 = 1 min/sec). / 时间流逝速度倍数 */
    timeSpeed: number;
    /** Whether time is paused. / 是否暂停时间 */
    timePaused: boolean;
    /** Whether sun position is driven by time. / 太阳位置是否由时间驱动 */
    timeDrivenSun: boolean;
  };
};

/** Partial settings patch type (all fields optional). / 部分设置补丁类型（所有字段可选） */
export type GameSettingsPatch = DeepPartial<GameSettings>;

export function createDefaultGameSettings(): GameSettings {
  return {
    player: {
      mouseSensitivity: playerConfig.mouseSensitivity,
      moveSpeed: playerConfig.moveSpeed,
      sprintBonus: playerConfig.sprintBonus,
      jumpVelocity: playerConfig.jump.velocityMetersPerSecond,
      gravity: playerConfig.physics.gravityMetersPerSecond2,
      maxFallSpeed: playerConfig.physics.maxFallSpeedMetersPerSecond,
      thirdPerson: {
        chase: {
          followDistance: playerConfig.thirdPerson.chase.followDistanceMeters,
          heightOffset: playerConfig.thirdPerson.chase.heightOffsetMeters,
        },
        overShoulder: {
          followDistance: playerConfig.thirdPerson.overShoulder.followDistanceMeters,
          heightOffset: playerConfig.thirdPerson.overShoulder.heightOffsetMeters,
          shoulderOffset: playerConfig.thirdPerson.overShoulder.shoulderOffsetMeters,
        },
        followLerpPerSecond: playerConfig.thirdPerson.followLerpPerSecond,
      },
    },
    camera: {
      fovDegrees: cameraConfig.fovDegrees,
    },
    render: {
      maxPixelRatio: renderConfig.maxPixelRatio,
      renderScale: 1.0,
    },
    sky: {
      sunElevation: 45,
      sunAzimuth: 180,
      turbidity: 10,
      rayleigh: 2,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.8,
      bloomEnabled: true,
      bloomThreshold: 0.85,
      bloomStrength: 0.4,
      bloomRadius: 0.3,
      ambientIntensity: visualsConfig.lights.hemi.intensity,
      sunIntensity: visualsConfig.lights.sun.intensity,
      shadowsEnabled: true,
      normalSoftness: 0.4,
      fogDensity: visualsConfig.fog.densityPerMeter,
      lensflareEnabled: true,
      lensflareSize: 1.0,
      sunSize: 15,
      godRaysEnabled: true,
      godRaysWeight: 0.5,
      godRaysDecay: 0.95,
      godRaysExposure: 3.0,
      starBrightness: 1.2,
      milkyWayBrightness: 0.8,
    },
    editor: {
      mouseConfig: {
        leftButton: "brush",
        rightButton: "orbit",
        middleButton: "pan",
      },
      stickyDrag: false,
    },
    time: {
      timeOfDay: 12, // Noon / 正午
      timeSpeed: 60, // 1 game minute per real second / 每真实秒1游戏分钟
      timePaused: false,
      timeDrivenSun: true,
    },
  };
}

// --- Utility functions / 工具函数 ---

/**
 * Deep merge source into target (mutates target).
 * 深度合并 source 到 target（修改 target）
 */
function deepMerge<T extends object>(target: T, source: object): T {
  for (const key in source) {
    const sourceVal = (source as Record<string, unknown>)[key];
    if (sourceVal === undefined || sourceVal === null) continue;
    
    const targetVal = (target as Record<string, unknown>)[key];
    if (
      typeof sourceVal === "object" && !Array.isArray(sourceVal) &&
      typeof targetVal === "object" && targetVal !== null && !Array.isArray(targetVal)
    ) {
      deepMerge(targetVal as object, sourceVal as object);
    } else {
      (target as Record<string, unknown>)[key] = sourceVal;
    }
  }
  return target;
}

/**
 * Apply a partial settings patch to existing settings (mutates settings).
 * 应用部分设置补丁到现有设置（修改 settings）
 */
export function applySettingsPatch(settings: GameSettings, patch: GameSettingsPatch): void {
  deepMerge(settings, patch);
}

/**
 * Clone settings (deep copy).
 * 克隆设置（深拷贝）
 */
export function cloneSettings(settings: GameSettings): GameSettings {
  return structuredClone(settings);
}

/**
 * Replace all settings values (mutates target).
 * 替换所有设置值（修改 target）
 */
export function setSettings(target: GameSettings, source: GameSettings): void {
  deepMerge(target, source);
}

/**
 * Merge partial settings JSON with defaults.
 * 将部分设置 JSON 与默认设置合并
 *
 * @param json Settings JSON string (may be partial or malformed).
 * @returns Complete GameSettings with defaults for missing fields.
 */
export function mergeSettingsWithDefaults(json: string | null): GameSettings {
  const defaults = createDefaultGameSettings();
  if (!json) return defaults;
  
  try {
    const parsed = JSON.parse(json) as Partial<GameSettings>;
    return deepMerge(defaults, parsed);
  } catch {
    return defaults;
  }
}
