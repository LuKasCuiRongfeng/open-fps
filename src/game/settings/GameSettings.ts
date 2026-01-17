import { cameraConfig } from "../../config/camera";
import { playerConfig } from "../../config/player";
import { renderConfig } from "../../config/render";
import { visualsConfig } from "../../config/visuals";

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
  };
  fog: {
    density: number;
  };
  editor: {
    mouseConfig: EditorMouseConfig;
  };
};

export type GameSettingsPatch = {
  player?: {
    mouseSensitivity?: number;
    moveSpeed?: number;
    sprintBonus?: number;
    jumpVelocity?: number;
    gravity?: number;
    maxFallSpeed?: number;
    thirdPerson?: {
      chase?: {
        followDistance?: number;
        heightOffset?: number;
      };
      overShoulder?: {
        followDistance?: number;
        heightOffset?: number;
        shoulderOffset?: number;
      };
      followLerpPerSecond?: number;
    };
  };
  camera?: {
    fovDegrees?: number;
  };
  render?: {
    maxPixelRatio?: number;
  };
  fog?: {
    density?: number;
  };
  editor?: {
    mouseConfig?: Partial<EditorMouseConfig>;
  };
};

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
    },
    fog: {
      density: visualsConfig.fog.densityPerMeter,
    },
    editor: {
      mouseConfig: {
        leftButton: "brush",
        rightButton: "orbit",
        middleButton: "pan",
      },
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
