import { terrainConfig } from "@config/terrain";
import { GameApp } from "./GameApp";
import type { EditorAppSession } from "./types";
import { BrushIndicatorSystem, type EditorBrushInfo, type ActiveEditorType } from "@game/editor/common";
import { TerrainEditor } from "@game/editor/terrain/TerrainEditor";
import { TextureEditor } from "@game/editor/texture/TextureEditor";
import { TerrainTextureArrays } from "@game/world/terrain/TerrainTextureArrays";
import type { MapData } from "@project/MapData";
import type { GameSettings, GameSettingsPatch } from "@game/settings";

export class EditorApp extends GameApp implements EditorAppSession {
  private readonly terrainEditor = new TerrainEditor(terrainConfig);
  private readonly textureEditor = new TextureEditor();
  private readonly brushIndicator = new BrushIndicatorSystem();
  private activeEditorType: ActiveEditorType = null;

  constructor(container: HTMLElement, onBootPhase?: (phase: import("./types").GameBootPhase) => void) {
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

  getActiveEditorType(): ActiveEditorType {
    return this.activeEditorType;
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

  async loadTexturesFromProject(projectPath: string): Promise<void> {
    await this.textureEditor.loadFromProject(projectPath);
    const textureDef = this.textureEditor.textureDefinition;
    const textureArrays = await TerrainTextureArrays.getInstance().loadFromDefinition(projectPath, textureDef);
    const splatMapTextures = this.textureEditor.getAllSplatTextures();
    this.resources.runtime.terrain.setTextureData(textureArrays, splatMapTextures);
    await this.skySystem.loadStarTexture(projectPath);
  }

  async saveTexturesToProject(projectPath: string): Promise<void> {
    await this.textureEditor.saveToProject(projectPath);
  }

  async resetTerrain(): Promise<void> {
    await this.resources.runtime.terrain.resetToOriginal();
  }

  protected override async initRuntimeExtensions(): Promise<void> {
    const splatWorldSize = terrainConfig.worldBounds.halfSizeMeters * 2;
    await this.textureEditor.init(this.renderer, splatWorldSize);
  }

  protected override syncSettingsSnapshot(settings: GameSettings): void {
    const mouseConfig = this.terrainEditor.mouseConfig;
    settings.editor.leftButton = mouseConfig.leftButton;
    settings.editor.rightButton = mouseConfig.rightButton;
    settings.editor.middleButton = mouseConfig.middleButton;
  }

  protected override applySettingsExtension(patch: GameSettingsPatch): void {
    if (
      patch.editor?.leftButton !== undefined ||
      patch.editor?.rightButton !== undefined ||
      patch.editor?.middleButton !== undefined
    ) {
      this.terrainEditor.setMouseConfig({
        leftButton: this.settings.editor.leftButton,
        rightButton: this.settings.editor.rightButton,
        middleButton: this.settings.editor.middleButton,
      });
    }
  }

  protected override applyAllSettingsExtension(): void {
    this.terrainEditor.setMouseConfig({
      leftButton: this.settings.editor.leftButton,
      rightButton: this.settings.editor.rightButton,
      middleButton: this.settings.editor.middleButton,
    });
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
    this.terrainEditor.loadMap(JSON.stringify({
      version: mapData.version,
      seed: mapData.seed,
      tileResolution: mapData.tileResolution,
      chunkSizeMeters: mapData.chunkSizeMeters,
      chunks: {},
      metadata: mapData.metadata,
    }));
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