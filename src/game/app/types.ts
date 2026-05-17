import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { VegetationProfilerSnapshot } from "../world/vegetation";
import type { MapData } from "@project/MapData";

export type GameBootPhase =
  | "checking-webgpu"
  | "creating-renderer"
  | "creating-world"
  | "creating-ecs"
  | "loading-map"
  | "ready";

export interface RuntimeProfilerSnapshot {
  fps: number;
  frameMs: number;
  updateMs: number;
  renderMs: number;
  renderer: {
    drawCalls: number;
    triangles: number;
    lines: number;
    points: number;
    geometries: number;
    textures: number;
  };
  vegetation: VegetationProfilerSnapshot;
}

export interface RuntimeAppSession<
  TSettings extends GameSettings = GameSettings,
  TPatch extends GameSettingsPatch = GameSettingsPatch,
> {
  readonly ready: Promise<void>;
  dispose(): void;
  getSettingsSnapshot(): TSettings;
  setOnTimeUpdate(callback: ((timeOfDay: number) => void) | null): void;
  getPlayerPosition(): { x: number; y: number; z: number } | null;
  getFps(): number;
  getProfilerSnapshot(): RuntimeProfilerSnapshot;
  getMousePosition(): { x: number; y: number; z: number; valid: boolean } | null;
  exportCurrentMapData(): MapData;
  loadMapData(mapData: MapData): Promise<void>;
  warmUpRuntimeShaders(): Promise<void>;
  markMapDataSaved(): void;
  updateSettings(patch: TPatch): void;
  applySettings(newSettings: TSettings): void;
  resetSettings(): void;
}
