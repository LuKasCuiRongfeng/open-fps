import type { RuntimeAppSession } from "@game/app";
import type { ActiveEditorType } from "@editor/runtime/common";
import type { EditorCameraAction, TerrainEditor } from "@editor/runtime/terrain/TerrainEditor";
import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { EditorAppSettings, EditorAppSettingsPatch } from "@editor/settings";

export interface EditorAppSession extends RuntimeAppSession<EditorAppSettings, EditorAppSettingsPatch> {
  getTerrainEditor(): TerrainEditor;
  getTextureEditor(): TextureEditor;
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
  loadTexturesFromMapDirectory(mapDirectory: string): Promise<void>;
  saveTexturesToMapDirectory(mapDirectory: string): Promise<void>;
}