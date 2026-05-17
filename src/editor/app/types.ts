import type { RuntimeAppSession } from "@game/app";
import type { ActiveEditorType } from "@editor/runtime/common";
import type { EditorCameraAction, TerrainEditor } from "@editor/runtime/terrain/TerrainEditor";
import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { VegetationEditor } from "@editor/runtime/vegetation/VegetationEditor";
import type { EditorHistoryState } from "@editor/runtime/history/EditorCommandHistory";
import type { EditorAppSettings, EditorAppSettingsPatch } from "@editor/settings";
import type { MapData } from "@project/MapData";

export interface EditorAppSession extends RuntimeAppSession<EditorAppSettings, EditorAppSettingsPatch> {
  getTerrainEditor(): TerrainEditor;
  getTextureEditor(): TextureEditor;
  getVegetationEditor(): VegetationEditor;
  getEditorHistoryState(): EditorHistoryState;
  flushPendingEditorCommands(): Promise<void>;
  undoEditorCommand(): Promise<boolean>;
  redoEditorCommand(): Promise<boolean>;
  setActiveEditorType(type: ActiveEditorType): void;
  startEditorCameraAction(
    action: EditorCameraAction,
    mouseX: number,
    mouseY: number,
    viewportWidth: number,
    viewportHeight: number
  ): void;
  updateEditorCameraControl(mouseX: number, mouseY: number, viewportWidth: number, viewportHeight: number): void;
  zoomEditorCamera(delta: number): void;
  updateEditorBrushTarget(mouseX: number, mouseY: number): void;
  updateTextureBrushTarget(mouseX: number, mouseY: number): void;
  updateVegetationBrushTarget(mouseX: number, mouseY: number): void;
  loadTexturesFromMapDirectory(mapDirectory: string, mapData?: MapData | null): Promise<void>;
  saveTexturesToMapDirectory(mapDirectory: string, mapData: MapData): Promise<void>;
  loadVegetationFromMapDirectory(mapDirectory: string, mapData?: MapData | null): Promise<void>;
  saveVegetationToMapDirectory(mapDirectory: string): Promise<void>;
}