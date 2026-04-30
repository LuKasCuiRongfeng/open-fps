import { terrainConfig } from "@config/terrain";
import { getPlatform } from "@/platform";
import { GameApp, type GameBootPhase } from "@game/app";
import type { EditorAppSession } from "./types";
import { BrushIndicatorSystem, type EditorBrushInfo, type ActiveEditorType } from "@editor/runtime/common";
import { TerrainEditor } from "@editor/runtime/terrain/TerrainEditor";
import { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import { TerrainTextureArrays } from "@game/world/terrain/TerrainTextureArrays";
import type { MapData } from "@project/MapData";
import {
  applyEditorSettingsPatch,
  cloneEditorSettings,
  createDefaultEditorSettings,
  setEditorSettings,
  type EditorAppSettings,
  type EditorAppSettingsPatch,
  type EditorSettings,
} from "@editor/settings";

const platform = getPlatform();

export class EditorApp extends GameApp implements EditorAppSession {
  private readonly editorSettings = createDefaultEditorSettings();
  private readonly terrainEditor = new TerrainEditor(terrainConfig);
  private readonly textureEditor = new TextureEditor();
  private readonly brushIndicator = new BrushIndicatorSystem();
  private activeEditorType: ActiveEditorType = null;

  private getProjectDirectoryFromMapDirectory(mapDirectory: string): string {
    return mapDirectory.replace(/[\\/]maps[\\/][^\\/]+$/, "");
  }

  constructor(container: HTMLElement, onBootPhase?: (phase: GameBootPhase) => void) {
    super(container, onBootPhase);

    this.brushIndicator.attach(this.scene);
    this.terrainEditor.setOnModeChange((mode) => {
      this.inputManager.setPointerLockEnabled(mode === "play");
      if (mode === "edit") {
        const pos = this.getPlayerPosition();
        if (pos) {
          this.terrainEditor.initCameraFromPlayer(pos.x, pos.y, pos.z);
        }
      }
    });
  }

  getTerrainEditor(): TerrainEditor {
    return this.terrainEditor;
  }

  getTextureEditor(): TextureEditor {
    return this.textureEditor;
  }

  setActiveEditorType(type: ActiveEditorType): void {
    this.activeEditorType = type;
    if (type) {
      this.brushIndicator.setActiveEditor(type);
      return;
    }

    this.brushIndicator.hide();
  }

  updateEditorBrushTarget(mouseX: number, mouseY: number): void {
    const canvas = this.gameRenderer.domElement;
    this.terrainEditor.updateBrushTarget(
      mouseX,
      mouseY,
      canvas.clientWidth,
      canvas.clientHeight,
      this.camera,
      this.resources.runtime.terrain.heightAt,
    );
  }

  updateTextureBrushTarget(mouseX: number, mouseY: number): void {
    const canvas = this.gameRenderer.domElement;
    this.textureEditor.updateBrushTarget(
      mouseX,
      mouseY,
      canvas.clientWidth,
      canvas.clientHeight,
      this.camera,
      this.resources.runtime.terrain.heightAt,
    );
  }

  async loadTexturesFromMapDirectory(mapDirectory: string): Promise<void> {
    await this.textureEditor.loadFromMapDirectory(mapDirectory);
    const textureDef = this.textureEditor.textureDefinition;
    const textureArrays = await TerrainTextureArrays.getInstance().loadFromDefinition(mapDirectory, textureDef);
    const splatMapTextures = this.textureEditor.getAllSplatTextures();
    this.resources.runtime.terrain.setTextureData(textureArrays, splatMapTextures);
    await this.skySystem.loadStarTexture(
      this.getProjectDirectoryFromMapDirectory(mapDirectory),
      platform.files.readBinaryBase64,
    );
  }

  async saveTexturesToMapDirectory(mapDirectory: string): Promise<void> {
    await this.textureEditor.saveToMapDirectory(mapDirectory);
  }

  protected override async initRuntimeExtensions(): Promise<void> {
    const splatWorldSize = terrainConfig.worldBounds.halfSizeMeters * 2;
    await this.textureEditor.init(this.renderer, splatWorldSize);
  }

  override getSettingsSnapshot(): EditorAppSettings {
    this.syncEditorSettingsSnapshot(this.editorSettings);

    return {
      ...super.getSettingsSnapshot(),
      editor: cloneEditorSettings(this.editorSettings),
    };
  }

  override updateSettings(patch: EditorAppSettingsPatch): void {
    const { editor, ...gamePatch } = patch;
    super.updateSettings(gamePatch);

    if (editor) {
      applyEditorSettingsPatch(this.editorSettings, editor);
      this.applyEditorSettingsToRuntime();
    }
  }

  override applySettings(newSettings: EditorAppSettings): void {
    const { editor, ...gameSettings } = newSettings;
    super.applySettings(gameSettings);
    setEditorSettings(this.editorSettings, editor);
    this.applyEditorSettingsToRuntime();
  }

  override resetSettings(): void {
    super.resetSettings();
    setEditorSettings(this.editorSettings, createDefaultEditorSettings());
    this.applyEditorSettingsToRuntime();
  }

  private syncEditorSettingsSnapshot(settings: EditorSettings): void {
    const mouseConfig = this.terrainEditor.mouseConfig;
    settings.leftButton = mouseConfig.leftButton;
    settings.rightButton = mouseConfig.rightButton;
    settings.middleButton = mouseConfig.middleButton;
    settings.stickyDrag = this.terrainEditor.stickyDrag;
  }

  private applyEditorSettingsToRuntime(): void {
    this.terrainEditor.setMouseConfig({
      leftButton: this.editorSettings.leftButton,
      rightButton: this.editorSettings.rightButton,
      middleButton: this.editorSettings.middleButton,
    });
    this.terrainEditor.setStickyDrag(this.editorSettings.stickyDrag);
  }

  protected override getMousePositionInternal(): { x: number; y: number; z: number; valid: boolean } | null {
    if (this.terrainEditor.mode !== "edit") {
      return null;
    }

    if (this.terrainEditor.brushTargetValid) {
      const x = this.terrainEditor.brushTargetX;
      const z = this.terrainEditor.brushTargetZ;
      const y = this.resources.runtime.terrain.heightAt(x, z);
      return { x, y, z, valid: true };
    }

    if (this.textureEditor.brushTargetValid) {
      const x = this.textureEditor.brushTargetX;
      const z = this.textureEditor.brushTargetZ;
      const y = this.resources.runtime.terrain.heightAt(x, z);
      return { x, y, z, valid: true };
    }

    return { x: 0, y: 0, z: 0, valid: false };
  }

  protected override async afterLoadMapData(mapData: MapData): Promise<void> {
    this.terrainEditor.loadMapData(mapData);
  }

  protected override runSimulationStep(): void {
    if (this.terrainEditor.mode === "play") {
      super.runSimulationStep();
      return;
    }

    this.terrainEditor.applyCameraState(this.camera);
  }

  protected override afterFrame(dt: number): void {
    this.terrainEditor.applyBrush(dt);
    const strokes = this.terrainEditor.consumePendingStrokes();
    if (strokes.length > 0) {
      void this.resources.runtime.terrain.applyBrushStrokes(strokes);
    }

    void this.textureEditor.applyBrush(dt);
    this.updateBrushIndicator();
  }

  protected override resolveTerrainUpdateTarget(): { x: number; z: number } | null {
    if (this.terrainEditor.mode === "edit") {
      const target = this.terrainEditor.getCameraTarget();
      return { x: target.x, z: target.z };
    }

    return super.resolveTerrainUpdateTarget();
  }

  protected override beforeDispose(): void {
    this.terrainEditor.dispose();
    this.textureEditor.dispose();
    this.brushIndicator.dispose();
  }

  private updateBrushIndicator(): void {
    if (this.terrainEditor.mode !== "edit" || !this.activeEditorType) {
      this.brushIndicator.hide();
      return;
    }

    const heightAt = this.resources.runtime.terrain.heightAt;
    let brushInfo: EditorBrushInfo | null = null;

    switch (this.activeEditorType) {
      case "terrain":
        if (this.terrainEditor.brushTargetValid) {
          brushInfo = {
            targetValid: true,
            targetX: this.terrainEditor.brushTargetX,
            targetZ: this.terrainEditor.brushTargetZ,
            radius: this.terrainEditor.brushSettings.radiusMeters,
            falloff: this.terrainEditor.brushSettings.falloff,
            strength: this.terrainEditor.brushSettings.strength,
            active: this.terrainEditor.brushActive,
          };
        }
        break;

      case "texture":
        if (this.textureEditor.brushTargetValid) {
          brushInfo = {
            targetValid: true,
            targetX: this.textureEditor.brushTargetX,
            targetZ: this.textureEditor.brushTargetZ,
            radius: this.textureEditor.brushSettings.radius,
            falloff: this.textureEditor.brushSettings.falloff,
            strength: this.textureEditor.brushSettings.strength,
            active: this.textureEditor.brushActive,
          };
        }
        break;
    }

    this.brushIndicator.update(brushInfo, heightAt);
  }
}