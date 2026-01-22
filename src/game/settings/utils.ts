// Game settings utility functions.
// 游戏设置工具函数

import type { GameSettings, GameSettingsPatch } from "./types";
import { createDefaultGameSettings } from "./defaults";

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
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === "object" &&
      targetVal !== null &&
      !Array.isArray(targetVal)
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
