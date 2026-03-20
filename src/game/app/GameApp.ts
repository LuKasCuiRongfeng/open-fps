// GameApp: main game application coordinator.
// GameApp：主游戏应用协调器

import {
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { terrainConfig } from "@config/terrain";
import { renderStaticConfig } from "@config/render";
import { playerStaticConfig } from "@config/player";
import { createWorld } from "./createWorld";
import { FpsCounter, GameRenderer } from "../rendering";
import { SystemScheduler } from "../scheduling";
import { GameEcs } from "../ecs/GameEcs";
import { createTimeResource, type GameResources } from "../ecs/resources";
import { BrushIndicatorSystem, type EditorBrushInfo, type ActiveEditorType } from "../editor/common";
import { TerrainEditor } from "../editor/terrain/TerrainEditor";
import { TextureEditor } from "../editor/texture/TextureEditor";
import { InputManager } from "../input/InputManager";
import { createRawInputState } from "../input/RawInputState";
import { createPlayer } from "../prefabs/createPlayer";
import {
  avatarSystem,
  cameraModeSystem,
  cameraSystem,
  inputSystem,
  jumpSystem,
  lookSystem,
  movementSystem,
  physicsSystem,
  worldBoundsSystem,
} from "../systems";
import {
  cloneSettings,
  createDefaultGameSettings,
  setSettings,
  applySettingsPatch,
  type GameSettings,
  type GameSettingsPatch,
} from "../settings";
import { TerrainTextureArrays } from "../world/terrain/TerrainTextureArrays";
import { setTerrainNormalSoftness } from "../world/terrain/material/terrainMaterialTexturedArray";
import { timeToSunPosition, type SkySystem } from "../world/sky/SkySystem";
import type { MapData } from "../project/MapData";

export type GameBootPhase =
  | "checking-webgpu"
  | "creating-renderer"
  | "creating-world"
  | "creating-ecs"
  | "loading-map"
  | "ready";

/**
 * GameApp: coordinates game systems and lifecycle.
 * GameApp：协调游戏系统和生命周期
 */
export class GameApp {
  private readonly gameRenderer: GameRenderer;
  private readonly ecs = new GameEcs();
  private readonly scheduler = new SystemScheduler();
  private readonly inputManager: InputManager;
  private readonly resources: GameResources;
  private readonly settings = createDefaultGameSettings();
  private readonly fpsCounter = new FpsCounter();
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly skySystem: SkySystem;
  private readonly terrainEditor: TerrainEditor;
  private readonly textureEditor: TextureEditor;
  private readonly brushIndicator: BrushIndicatorSystem;
  private activeEditorType: ActiveEditorType = null;
  readonly ready: Promise<void>;
  private disposed = false;

  private onTimeUpdateCallback: ((timeOfDay: number) => void) | null = null;

  constructor(container: HTMLElement, onBootPhase?: (phase: GameBootPhase) => void) {
    onBootPhase?.("checking-webgpu");
    onBootPhase?.("creating-renderer");

    this.gameRenderer = new GameRenderer(container);

    onBootPhase?.("creating-world");
    const world = createWorld(this.gameRenderer.scene);
    this.sun = world.sun;
    this.hemi = world.hemi;
    this.skySystem = world.skySystem;

    const rawInputState = createRawInputState();
    this.inputManager = new InputManager(this.gameRenderer.domElement, rawInputState);

    this.resources = {
      time: createTimeResource(),
      singletons: {
        scene: this.gameRenderer.scene,
        camera: this.gameRenderer.camera,
        renderer: this.gameRenderer.renderer,
        inputManager: this.inputManager,
      },
      input: { raw: rawInputState },
      runtime: {
        terrain: world.terrain,
        settings: this.settings,
      },
    };

    onBootPhase?.("creating-ecs");

    this.terrainEditor = new TerrainEditor(terrainConfig);
    this.textureEditor = new TextureEditor();

    this.brushIndicator = new BrushIndicatorSystem();
    this.brushIndicator.attach(this.gameRenderer.scene);

    this.terrainEditor.setOnModeChange((mode) => {
      this.inputManager.setPointerLockEnabled(mode === "play");
      if (mode === "edit") {
        const pos = this.getPlayerPosition();
        if (pos) {
          this.terrainEditor.initCameraFromPlayer(pos.x, pos.y, pos.z);
        }
      }
    });

    this.registerSystems();

    this.ecs.world.onDestroy((entityId) => {
      const avatar = this.ecs.world.get(entityId, "avatar");
      if (avatar) {
        this.gameRenderer.scene.remove(avatar.object);
      }
    });

    this.ready = this.initRendererAndStart(onBootPhase);
  }

  private registerSystems(): void {
    this.scheduler.register("input", "input", inputSystem);
    this.scheduler.register("cameraMode", "gameplay", cameraModeSystem);
    this.scheduler.register("look", "gameplay", lookSystem);
    this.scheduler.register("movement", "gameplay", movementSystem);
    this.scheduler.register("jump", "gameplay", jumpSystem);
    this.scheduler.register("physics", "physics", physicsSystem);
    this.scheduler.register("worldBounds", "physics", worldBoundsSystem);
    this.scheduler.register("camera", "render", cameraSystem);
    this.scheduler.register("avatar", "render", avatarSystem);
  }

  private async initRendererAndStart(onBootPhase?: (phase: GameBootPhase) => void) {
    await this.gameRenderer.init();
    if (this.disposed) return;

    await this.resources.runtime.terrain.initGpu(
      this.gameRenderer.renderer,
      playerStaticConfig.spawnX,
      playerStaticConfig.spawnZ,
    );
    if (this.disposed) return;

    const splatWorldSize = terrainConfig.worldBounds.halfSizeMeters * 2;
    await this.textureEditor.init(this.gameRenderer.renderer, splatWorldSize);
    if (this.disposed) return;

    createPlayer(this.ecs, this.resources);

    this.skySystem.initPostProcessing(
      this.gameRenderer.renderer,
      this.gameRenderer.scene,
      this.gameRenderer.camera,
    );
    this.skySystem.setDirectionalLight(this.sun);

    this.gameRenderer.updateSize();

    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes('Vertex attribute "normal" not found')) {
        return;
      }
      originalWarn.apply(console, args);
    };
    await this.warmUpShaders();
    console.warn = originalWarn;

    this.gameRenderer.startLoop(this.onFrame);

    onBootPhase?.("ready");
  }

  private async warmUpShaders(): Promise<void> {
    const { Euler } = await import("three/webgpu");
    this.resources.time.dt = 0;

    const originalPos = this.gameRenderer.camera.position.clone();
    const originalQuat = this.gameRenderer.camera.quaternion.clone();

    const yawAngles = [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI, -Math.PI * 3 / 4, -Math.PI / 2, -Math.PI / 4];
    const pitchAngles = [-0.5, 0, 0.5];

    for (const pitch of pitchAngles) {
      for (const yaw of yawAngles) {
        this.gameRenderer.camera.quaternion.setFromEuler(new Euler(pitch, yaw, 0, "YXZ"));
        this.gameRenderer.renderer.render(this.gameRenderer.scene, this.gameRenderer.camera);
      }
    }

    this.gameRenderer.camera.position.copy(originalPos);
    this.gameRenderer.camera.quaternion.copy(originalQuat);
    cameraSystem(this.ecs.world, this.resources);
    avatarSystem(this.ecs.world);
    this.gameRenderer.renderer.render(this.gameRenderer.scene, this.gameRenderer.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.inputManager.dispose();
    this.resources.runtime.terrain.dispose();
    this.textureEditor.dispose();
    this.brushIndicator.dispose();
    this.gameRenderer.dispose();
  }

  get renderer(): WebGPURenderer {
    return this.gameRenderer.renderer;
  }

  get scene(): Scene {
    return this.gameRenderer.scene;
  }

  get camera(): PerspectiveCamera {
    return this.gameRenderer.camera;
  }

  getSettingsSnapshot(): GameSettings {
    const mc = this.terrainEditor.mouseConfig;
    this.settings.editor.leftButton = mc.leftButton;
    this.settings.editor.rightButton = mc.rightButton;
    this.settings.editor.middleButton = mc.middleButton;
    return cloneSettings(this.settings);
  }

  setOnTimeUpdate(callback: ((timeOfDay: number) => void) | null): void {
    this.onTimeUpdateCallback = callback;
  }

  getPlayerPosition(): { x: number; y: number; z: number } | null {
    for (const [entityId] of this.ecs.world.query("transform", "player")) {
      const transform = this.ecs.world.get(entityId, "transform");
      if (transform) {
        return { x: transform.x, y: transform.y, z: transform.z };
      }
    }
    return null;
  }

  getFps(): number {
    return this.fpsCounter.fps;
  }

  getMousePosition(): { x: number; y: number; z: number; valid: boolean } | null {
    if (this.terrainEditor.mode !== "edit") return null;

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
    }
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
      this.gameRenderer.camera,
      this.resources.runtime.terrain.heightAt,
    );
  }

  exportCurrentMapData(): MapData {
    return this.resources.runtime.terrain.exportCurrentMapData();
  }

  async loadMapData(mapData: MapData): Promise<void> {
    await this.resources.runtime.terrain.loadMapData(mapData);
    this.terrainEditor.loadMap(JSON.stringify({
      version: mapData.version,
      seed: mapData.seed,
      tileResolution: mapData.tileResolution,
      chunkSizeMeters: mapData.chunkSizeMeters,
      chunks: {},
      metadata: mapData.metadata,
    }));
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

  updateTextureBrushTarget(mouseX: number, mouseY: number): void {
    const canvas = this.gameRenderer.domElement;
    this.textureEditor.updateBrushTarget(
      mouseX,
      mouseY,
      canvas.clientWidth,
      canvas.clientHeight,
      this.gameRenderer.camera,
      this.resources.runtime.terrain.heightAt,
    );
  }

  async resetTerrain(): Promise<void> {
    await this.resources.runtime.terrain.resetToOriginal();
  }

  updateSettings(patch: GameSettingsPatch): void {
    applySettingsPatch(this.settings, patch);
    this.applySettingsChanges(patch);
  }

  applySettings(newSettings: GameSettings): void {
    setSettings(this.settings, newSettings);
    this.applyAllSettings();
  }

  resetSettings(): void {
    setSettings(this.settings, createDefaultGameSettings());
    this.applyAllSettings();
  }

  private applySettingsChanges(patch: GameSettingsPatch): void {
    const effectivePixelRatio =
      Math.min(window.devicePixelRatio, this.settings.render.maxPixelRatio) *
      this.settings.render.renderScale;
    this.gameRenderer.renderer.setPixelRatio(effectivePixelRatio);
    this.gameRenderer.setFov(this.settings.camera.fovDegrees);

    if (this.gameRenderer.scene.fog instanceof FogExp2) {
      this.gameRenderer.scene.fog.density = this.settings.sky.fogDensity;
    }

    if (patch.sky) {
      if (patch.sky.sunElevation !== undefined || patch.sky.sunAzimuth !== undefined) {
        this.settings.time.timeDrivenSun = false;
      }
      this.applySkySettings();
    }

    if (patch.editor?.leftButton !== undefined || patch.editor?.rightButton !== undefined || patch.editor?.middleButton !== undefined) {
      this.terrainEditor.setMouseConfig({
        leftButton: this.settings.editor.leftButton,
        rightButton: this.settings.editor.rightButton,
        middleButton: this.settings.editor.middleButton,
      });
    }
  }

  private applyAllSettings(): void {
    const effectivePixelRatio =
      Math.min(window.devicePixelRatio, this.settings.render.maxPixelRatio) *
      this.settings.render.renderScale;
    this.gameRenderer.renderer.setPixelRatio(effectivePixelRatio);
    this.gameRenderer.setFov(this.settings.camera.fovDegrees);

    if (this.gameRenderer.scene.fog instanceof FogExp2) {
      this.gameRenderer.scene.fog.density = this.settings.sky.fogDensity;
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
    this.skySystem.updateSettings(sky);
    this.hemi.intensity = sky.ambientIntensity;
    this.sun.intensity = sky.sunIntensity;
    this.sun.castShadow = sky.shadowsEnabled;
    setTerrainNormalSoftness(sky.normalSoftness);

    if (this.gameRenderer.scene.fog instanceof FogExp2) {
      this.gameRenderer.scene.fog.density = sky.fogDensity;
    }
  }

  private readonly onFrame = (): void => {
    if (this.disposed) return;

    const rawDt = this.gameRenderer.clock.getDelta();
    const dt = Math.min(renderStaticConfig.maxDeltaSeconds, rawDt);
    this.resources.time.dt = dt;
    this.resources.time.elapsed += dt;
    this.resources.time.frame++;

    this.updateWorldTime(dt);
    this.fpsCounter.tick();
    this.gameRenderer.setFov(this.settings.camera.fovDegrees);

    if (this.terrainEditor.mode === "play") {
      this.scheduler.execute(this.ecs.world, this.resources);
    } else {
      this.terrainEditor.applyCameraState(this.gameRenderer.camera);
    }

    this.updateTerrainStreaming();
    this.updateTerrainEditor(dt);
    this.ecs.flushDestroyed();
    this.skySystem.update();

    if (this.skySystem.shouldUsePostProcessing()) {
      this.skySystem.render();
    } else {
      this.gameRenderer.renderer.render(this.gameRenderer.scene, this.gameRenderer.camera);
    }
  };

  private updateWorldTime(dt: number): void {
    const time = this.settings.time;

    if (!time.timePaused && time.timeSpeed > 0) {
      const hoursElapsed = (dt * time.timeSpeed) / 3600;
      time.timeOfDay = (time.timeOfDay + hoursElapsed) % 24;
      this.onTimeUpdateCallback?.(time.timeOfDay);
    }

    if (time.timeDrivenSun) {
      const sunPos = timeToSunPosition(time.timeOfDay);

      if (
        Math.abs(this.settings.sky.sunElevation - sunPos.elevation) > 0.1 ||
        Math.abs(this.settings.sky.sunAzimuth - sunPos.azimuth) > 0.1
      ) {
        this.settings.sky.sunElevation = sunPos.elevation;
        this.settings.sky.sunAzimuth = sunPos.azimuth;

        const dayFactor = Math.max(0, sunPos.elevation / 45);
        this.settings.sky.ambientIntensity = 0.1 + 0.5 * dayFactor;
        this.settings.sky.sunIntensity = 1.2 * dayFactor;

        this.applySkySettings();
      }
    }
  }

  private updateTerrainStreaming(): void {
    const terrain = this.resources.runtime.terrain;

    if (this.terrainEditor.mode === "edit") {
      const target = this.terrainEditor.getCameraTarget();
      terrain.update(target.x, target.z, this.gameRenderer.camera);
      return;
    }

    for (const [entityId] of this.ecs.world.query("transform", "player")) {
      const transform = this.ecs.world.get(entityId, "transform");
      if (transform) {
        terrain.update(transform.x, transform.z, this.gameRenderer.camera);
        break;
      }
    }
  }

  private updateTerrainEditor(dt: number): void {
    this.terrainEditor.applyBrush(dt);
    const strokes = this.terrainEditor.consumePendingStrokes();
    if (strokes.length > 0) {
      void this.resources.runtime.terrain.applyBrushStrokes(strokes);
    }
    void this.textureEditor.applyBrush(dt);
    this.updateBrushIndicator();
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