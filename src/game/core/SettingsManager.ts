// SettingsManager: Game settings management with change notifications.
// SettingsManager：游戏设置管理，带变化通知

import { FogExp2, type Scene } from "three/webgpu";
import {
  applySettingsPatch,
  cloneSettings,
  createDefaultGameSettings,
  setSettings,
  type GameSettings,
  type GameSettingsPatch,
  type SkySettings,
} from "@game/settings";
import type { SkySystem } from "@game/world/sky/SkySystem";
import { setTerrainNormalSoftness } from "@game/world/terrain/material/terrainMaterialTextured";
import type { TerrainEditor } from "@game/editor/terrain/TerrainEditor";
import type { GameRenderer } from "./GameRenderer";

export type SettingsChangeCallback = (settings: GameSettings, patch: Partial<GameSettingsPatch>) => void;

/**
 * Manages game settings with immediate application and change tracking.
 * 管理游戏设置，支持即时应用和变化跟踪
 */
export class SettingsManager {
  private readonly settings: GameSettings;
  private readonly renderer: GameRenderer;
  private readonly scene: Scene;
  private readonly skySystem: SkySystem;
  private readonly terrainEditor: TerrainEditor;
  private onChangeCallbacks: SettingsChangeCallback[] = [];

  // Callback for time updates (used by React UI to sync sundial).
  // 时间更新回调（用于 React UI 同步日晷）
  private onTimeUpdateCallback: ((timeOfDay: number) => void) | null = null;

  constructor(
    renderer: GameRenderer,
    scene: Scene,
    skySystem: SkySystem,
    terrainEditor: TerrainEditor
  ) {
    this.settings = createDefaultGameSettings();
    this.renderer = renderer;
    this.scene = scene;
    this.skySystem = skySystem;
    this.terrainEditor = terrainEditor;
  }

  /**
   * Get current settings snapshot.
   * 获取当前设置快照
   */
  getSnapshot(): GameSettings {
    // Sync editor mouse config from terrain editor before returning.
    // 返回前从地形编辑器同步鼠标配置
    const mc = this.terrainEditor.mouseConfig;
    this.settings.editor.leftButton = mc.leftButton;
    this.settings.editor.rightButton = mc.rightButton;
    this.settings.editor.middleButton = mc.middleButton;

    return cloneSettings(this.settings);
  }

  /**
   * Get raw settings reference (for systems that need direct access).
   * 获取原始设置引用（供需要直接访问的系统使用）
   */
  get current(): GameSettings {
    return this.settings;
  }

  /**
   * Update settings with a partial patch.
   * 使用部分补丁更新设置
   */
  update(patch: GameSettingsPatch): void {
    applySettingsPatch(this.settings, patch);
    this.applyChanges(patch);
    this.notifyChange(patch);
  }

  /**
   * Apply complete settings (for loading from project).
   * 应用完整设置（用于从项目加载）
   */
  applyFull(newSettings: GameSettings): void {
    setSettings(this.settings, newSettings);
    this.applyAll();
    this.notifyChange({});
  }

  /**
   * Reset to default settings.
   * 重置为默认设置
   */
  reset(): void {
    setSettings(this.settings, createDefaultGameSettings());
    this.applyAll();
    this.notifyChange({});
  }

  /**
   * Set callback for time updates.
   * 设置时间更新回调
   */
  setOnTimeUpdate(callback: ((timeOfDay: number) => void) | null): void {
    this.onTimeUpdateCallback = callback;
  }

  /**
   * Update world time and sync sun position when time-driven.
   * 更新世界时间，并在时间驱动时同步太阳位置
   */
  updateWorldTime(dt: number): void {
    const time = this.settings.time;

    if (!time.timePaused && time.timeSpeed > 0) {
      const hoursElapsed = (dt * time.timeSpeed) / 3600;
      time.timeOfDay = (time.timeOfDay + hoursElapsed) % 24;
      this.onTimeUpdateCallback?.(time.timeOfDay);
    }

    if (time.timeDrivenSun) {
      const { timeToSunPosition } = require("@game/world/sky/SkySystem");
      const sunPos = timeToSunPosition(time.timeOfDay);

      if (
        Math.abs(this.settings.sky.sunElevation - sunPos.elevation) > 0.1 ||
        Math.abs(this.settings.sky.sunAzimuth - sunPos.azimuth) > 0.1
      ) {
        this.settings.sky.sunElevation = sunPos.elevation;
        this.settings.sky.sunAzimuth = sunPos.azimuth;

        const dayFactor = Math.max(0, sunPos.elevation / 45);
        const nightAmbient = 0.1;
        const dayAmbient = 0.6;
        const nightSun = 0.0;
        const daySun = 1.2;

        this.settings.sky.ambientIntensity = nightAmbient + (dayAmbient - nightAmbient) * dayFactor;
        this.settings.sky.sunIntensity = nightSun + (daySun - nightSun) * dayFactor;

        this.applySkySettings();
      }
    }
  }

  /**
   * Register a callback for settings changes.
   * 注册设置变化回调
   */
  onChange(callback: SettingsChangeCallback): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      const index = this.onChangeCallbacks.indexOf(callback);
      if (index !== -1) {
        this.onChangeCallbacks.splice(index, 1);
      }
    };
  }

  private applyChanges(patch: GameSettingsPatch): void {
    // Apply render settings immediately.
    // 立即应用渲染设置
    if (patch.render) {
      this.renderer.setPixelRatio(this.settings.render.renderScale);
    }

    // Apply camera settings immediately.
    // 立即应用相机设置
    if (patch.camera) {
      this.renderer.setFov(this.settings.camera.fovDegrees);
    }

    // Apply fog settings immediately.
    // 立即应用雾设置
    if (patch.sky?.fogDensity !== undefined) {
      if (this.scene.fog instanceof FogExp2) {
        this.scene.fog.density = this.settings.sky.fogDensity;
      }
    }

    // Apply sky settings immediately.
    // 立即应用天空设置
    if (patch.sky) {
      if (patch.sky.sunElevation !== undefined || patch.sky.sunAzimuth !== undefined) {
        this.settings.time.timeDrivenSun = false;
      }
      this.applySkySettings();
    }

    // Apply editor mouse config.
    // 应用编辑器鼠标配置
    if (patch.editor?.leftButton !== undefined || patch.editor?.rightButton !== undefined || patch.editor?.middleButton !== undefined) {
      this.terrainEditor.setMouseConfig({
        leftButton: this.settings.editor.leftButton,
        rightButton: this.settings.editor.rightButton,
        middleButton: this.settings.editor.middleButton,
      });
    }
  }

  private applyAll(): void {
    this.renderer.setPixelRatio(this.settings.render.renderScale);
    this.renderer.setFov(this.settings.camera.fovDegrees);

    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.density = this.settings.sky.fogDensity;
    }

    this.terrainEditor.setMouseConfig({
      leftButton: this.settings.editor.leftButton,
      rightButton: this.settings.editor.rightButton,
      middleButton: this.settings.editor.middleButton,
    });
    this.applySkySettings();
  }

  private applySkySettings(): void {
    const sky = this.settings.sky;
    this.skySystem.updateSettings(sky as Partial<SkySettings>);
    setTerrainNormalSoftness(sky.normalSoftness);

    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.density = sky.fogDensity;
    }
  }

  private notifyChange(patch: Partial<GameSettingsPatch>): void {
    for (const callback of this.onChangeCallbacks) {
      callback(this.settings, patch);
    }
  }
}
