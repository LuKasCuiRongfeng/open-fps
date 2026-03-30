import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { MapData } from "@project/MapData";
import type { ActiveEditorType } from "@game/editor/common";
import type { TerrainEditor } from "@game/editor/terrain/TerrainEditor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";

export type GameBootPhase =
  | "checking-webgpu"
  | "creating-renderer"
  | "creating-world"
  | "creating-ecs"
  | "loading-map"
  | "ready";

export interface RuntimeAppSession {
  readonly ready: Promise<void>;
  dispose(): void;
  getSettingsSnapshot(): GameSettings;
  setOnTimeUpdate(callback: ((timeOfDay: number) => void) | null): void;
  getPlayerPosition(): { x: number; y: number; z: number } | null;
  getFps(): number;
  getMousePosition(): { x: number; y: number; z: number; valid: boolean } | null;
  exportCurrentMapData(): MapData;
  loadMapData(mapData: MapData): Promise<void>;
  updateSettings(patch: GameSettingsPatch): void;
  applySettings(newSettings: GameSettings): void;
  resetSettings(): void;
}

export interface EditorAppSession extends RuntimeAppSession {
  getTerrainEditor(): TerrainEditor;
  getTextureEditor(): TextureEditor;
  setActiveEditorType(type: ActiveEditorType): void;
  updateEditorBrushTarget(mouseX: number, mouseY: number): void;
  updateTextureBrushTarget(mouseX: number, mouseY: number): void;
  loadTexturesFromMapDirectory(mapDirectory: string): Promise<void>;
  saveTexturesToMapDirectory(mapDirectory: string): Promise<void>;
}