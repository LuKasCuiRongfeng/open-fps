// Game settings module.
// 游戏设置模块

export type {
  DeepPartial,
  EditorMouseAction,
  EditorSettings,
  TimeSettings,
  GameSettings,
  GameSettingsPatch,
  // Re-export config-derived types for convenience.
  // 为方便起见重新导出 config 派生的类型
  PlayerSettings,
  CameraSettings,
  RenderSettings,
  SkySettings,
} from "./types";

export { createDefaultGameSettings } from "./defaults";

export {
  applySettingsPatch,
  cloneSettings,
  setSettings,
  mergeSettingsWithDefaults,
} from "./utils";
