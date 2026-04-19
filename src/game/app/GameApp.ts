// GameApp: shared gameplay runtime without editor-only orchestration.
// GameApp：不包含编辑器编排的共享游戏运行时

import {
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { renderStaticConfig } from "@config/render";
import { playerStaticConfig } from "@config/player";
import { createWorld } from "./createWorld";
import type { GameBootPhase, RuntimeAppSession } from "./types";
import { FpsCounter, GameRenderer } from "../rendering";
import { SystemScheduler } from "../scheduling";
import { GameEcs } from "../ecs/GameEcs";
import { createTimeResource, type GameResources } from "../ecs/resources";
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
import { setTerrainNormalSoftness } from "../world/terrain/material/terrainMaterialTexturedArray";
import { timeToSunPosition, type SkySystem } from "../world/sky/SkySystem";
import type { MapData } from "@project/MapData";

/**
 * GameApp: coordinates game systems and lifecycle.
 * GameApp：协调游戏系统和生命周期
 */
export class GameApp implements RuntimeAppSession {
  protected readonly gameRenderer: GameRenderer;
  protected readonly ecs = new GameEcs();
  protected readonly scheduler = new SystemScheduler();
  protected readonly inputManager: InputManager;
  protected readonly resources: GameResources;
  protected readonly settings = createDefaultGameSettings();
  protected readonly fpsCounter = new FpsCounter();
  protected readonly sun: DirectionalLight;
  protected readonly hemi: HemisphereLight;
  protected readonly skySystem: SkySystem;
  readonly ready: Promise<void>;
  protected disposed = false;

  protected onTimeUpdateCallback: ((timeOfDay: number) => void) | null = null;

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

    this.registerSystems();

    this.ecs.world.onDestroy((entityId) => {
      const avatar = this.ecs.world.get(entityId, "avatar");
      if (avatar) {
        this.gameRenderer.scene.remove(avatar.object);
      }
    });

    this.ready = this.initRendererAndStart(onBootPhase);
  }

  protected registerSystems(): void {
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

  protected async initRendererAndStart(onBootPhase?: (phase: GameBootPhase) => void) {
    await this.gameRenderer.init();
    if (this.disposed) return;

    await this.resources.runtime.terrain.initGpu(
      this.gameRenderer.renderer,
      playerStaticConfig.spawnX,
      playerStaticConfig.spawnZ,
    );
    if (this.disposed) return;

    createPlayer(this.ecs, this.resources);

    await this.initRuntimeExtensions();
    if (this.disposed) return;

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

  protected async initRuntimeExtensions(): Promise<void> {}

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

    this.beforeDispose();
    this.inputManager.dispose();
    this.resources.runtime.terrain.dispose();
    this.gameRenderer.dispose();
  }

  protected beforeDispose(): void {}

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
    this.syncSettingsSnapshot(this.settings);
    return cloneSettings(this.settings);
  }

  protected syncSettingsSnapshot(_settings: GameSettings): void {}

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
    return this.getMousePositionInternal();
  }

  protected getMousePositionInternal(): { x: number; y: number; z: number; valid: boolean } | null {
    return null;
  }

  exportCurrentMapData(): MapData {
    return this.resources.runtime.terrain.exportCurrentMapData();
  }

  async loadMapData(mapData: MapData): Promise<void> {
    await this.resources.runtime.terrain.loadMapData(mapData);
    await this.afterLoadMapData(mapData);
  }

  protected async afterLoadMapData(_mapData: MapData): Promise<void> {}

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

    this.applySettingsExtension(patch);
  }

  protected applySettingsExtension(_patch: GameSettingsPatch): void {}

  private applyAllSettings(): void {
    const effectivePixelRatio =
      Math.min(window.devicePixelRatio, this.settings.render.maxPixelRatio) *
      this.settings.render.renderScale;
    this.gameRenderer.renderer.setPixelRatio(effectivePixelRatio);
    this.gameRenderer.setFov(this.settings.camera.fovDegrees);

    if (this.gameRenderer.scene.fog instanceof FogExp2) {
      this.gameRenderer.scene.fog.density = this.settings.sky.fogDensity;
    }

    this.applySkySettings();
    this.applyAllSettingsExtension();
  }

  protected applyAllSettingsExtension(): void {}

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

  protected readonly onFrame = (): void => {
    if (this.disposed) return;

    this.gameRenderer.clock.update();
    const rawDt = this.gameRenderer.clock.getDelta();
    const dt = Math.min(renderStaticConfig.maxDeltaSeconds, rawDt);
    this.resources.time.dt = dt;
    this.resources.time.elapsed += dt;
    this.resources.time.frame++;

    this.updateWorldTime(dt);
    this.fpsCounter.tick();
    this.gameRenderer.setFov(this.settings.camera.fovDegrees);

    this.runSimulationStep();
    this.updateTerrainStreaming();
    this.afterFrame(dt);
    this.ecs.flushDestroyed();
    this.skySystem.update();

    if (this.skySystem.shouldUsePostProcessing()) {
      this.skySystem.render();
    } else {
      this.gameRenderer.renderer.render(this.gameRenderer.scene, this.gameRenderer.camera);
    }
  };

  protected runSimulationStep(): void {
    this.scheduler.execute(this.ecs.world, this.resources);
  }

  protected afterFrame(_dt: number): void {}

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

    const target = this.resolveTerrainUpdateTarget();
    if (target) {
      terrain.update(target.x, target.z, this.gameRenderer.camera);
    }
  }

  protected resolveTerrainUpdateTarget(): { x: number; z: number } | null {
    for (const [entityId] of this.ecs.world.query("transform", "player")) {
      const transform = this.ecs.world.get(entityId, "transform");
      if (transform) {
        return { x: transform.x, z: transform.z };
      }
    }
    return null;
  }
}