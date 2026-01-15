import {
  Clock,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
} from "three/webgpu";
import { worldConfig } from "../config/world";
import { createWorld } from "./createWorld";
import { GameEcs } from "./ecs/GameEcs";
import type { GameResources } from "./ecs/resources";
import { InputManager } from "./input/InputManager";
import { createPlayer } from "./prefabs/createPlayer";
import { avatarSystem } from "./systems/avatarSystem";
import { cameraSystem } from "./systems/cameraSystem";
import { cameraModeSystem } from "./systems/cameraModeSystem";
import { lookSystem } from "./systems/lookSystem";
import { movementSystem } from "./systems/movementSystem";
import { jumpSystem } from "./systems/jumpSystem";
import { physicsSystem } from "./systems/physicsSystem";
import { worldBoundsSystem } from "./systems/worldBoundsSystem";
import {
  applySettingsPatch,
  cloneSettings,
  createDefaultGameSettings,
  type GameSettings,
  type GameSettingsPatch,
  setSettings,
} from "./settings/GameSettings";

export type GameBootPhase =
  | "checking-webgpu"
  | "creating-renderer"
  | "creating-world"
  | "creating-ecs"
  | "ready";

export class GameApp {
  private readonly container: HTMLElement;
  private readonly renderer: WebGPURenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly clock = new Clock();
  private readonly ecs = new GameEcs();
  private readonly input!: InputManager;
  private readonly resources!: GameResources;
  private readonly settings = createDefaultGameSettings();
  readonly ready: Promise<void>;
  private disposed = false;

  constructor(container: HTMLElement, onBootPhase?: (phase: GameBootPhase) => void) {
    this.container = container;

    onBootPhase?.("checking-webgpu");

    // WebGPU-only by design (no WebGL fallback).
    // 本项目只支持 WebGPU（不做 WebGL 兼容/降级）
    const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    if (!gpu) {
      throw new Error("WebGPU is not available in this environment.");
    }

    onBootPhase?.("creating-renderer");
    this.renderer = new WebGPURenderer({ antialias: true });
    // Make it obvious the canvas is rendering even before world content appears.
    // 设一个非纯黑的清屏色，便于判断是否在正常渲染
    this.renderer.setClearColor(0x10151f, 1);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, worldConfig.render.maxPixelRatio),
    );

    this.scene = new Scene();

    this.camera = new PerspectiveCamera(
      worldConfig.camera.fovDegrees,
      1,
      worldConfig.camera.nearMeters,
      worldConfig.camera.farMeters,
    );

    onBootPhase?.("creating-world");
    const world = createWorld(this.scene);

    this.input = new InputManager(this.renderer.domElement);
    this.resources = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      input: this.input,
      settings: this.settings,
      terrain: world.terrain,
    };

    onBootPhase?.("creating-ecs");

    // ECS: create a single player entity.
    // ECS：创建一个玩家实体
    createPlayer(this.ecs, this.resources);

    this.container.appendChild(this.renderer.domElement);
    this.onResize();

    window.addEventListener("resize", this.onResize);

    // WebGPU renderer requires async initialization; start the loop only after init.
    // WebGPU 渲染器需要异步初始化：init 完成后再启动主循环
    this.ready = this.initRendererAndStart(onBootPhase);
  }

  private async initRendererAndStart(onBootPhase?: (phase: GameBootPhase) => void) {
    await this.renderer.init();
    if (this.disposed) return;

		// GPU-first: bake terrain height/normal via compute before the first frame.
		// GPU-first：在第一帧前用 compute 烘焙地形高度/法线
		await this.resources.terrain.initGpu?.(this.renderer);
    if (this.disposed) return;

    // WebGPU backends may finalize internal render targets during init; re-apply sizing.
    // WebGPU 后端可能在 init 时最终确定内部渲染目标：此处重新应用尺寸
    this.onResize();

    // Use renderer animation loop for consistent pacing.
    // 使用 renderer 的动画循环，保证节奏稳定
    this.clock.start();
    this.renderer.setAnimationLoop(this.onFrame);

    // Initialize camera/visibility once.
    // 初始化一次相机/可见性
    cameraSystem(this.ecs.stores, this.resources, 0);
    avatarSystem(this.ecs.stores, this.resources);

    onBootPhase?.("ready");
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener("resize", this.onResize);
    this.renderer.setAnimationLoop(null);

    this.input.dispose();

    // Detach canvas.
    // 移除画布
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.renderer.dispose();
  }

  getSettingsSnapshot(): GameSettings {
    return cloneSettings(this.settings);
  }

  updateSettings(patch: GameSettingsPatch) {
    applySettingsPatch(this.settings, patch);

    // Apply render settings immediately.
    // 立即应用渲染设置
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.settings.render.maxPixelRatio),
    );

    // Apply camera settings immediately.
    // 立即应用相机设置
    this.camera.fov = this.settings.camera.fovDegrees;
    this.camera.updateProjectionMatrix();
  }

  resetSettings() {
    setSettings(this.settings, createDefaultGameSettings());

    // Apply render settings immediately.
    // 立即应用渲染设置
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.settings.render.maxPixelRatio),
    );

    // Apply camera settings immediately.
    // 立即应用相机设置
    this.camera.fov = this.settings.camera.fovDegrees;
    this.camera.updateProjectionMatrix();
  }

  private readonly onResize = () => {
    if (this.disposed) return;

    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  };

  private readonly onFrame = () => {
    if (this.disposed) return;

    const dt = Math.min(worldConfig.render.maxDeltaSeconds, this.clock.getDelta());

    // Keep camera fov synced even if settings change without calling updateSettings.
    // 即使 UI 没走 updateSettings，也保持 fov 同步
    if (this.camera.fov !== this.settings.camera.fovDegrees) {
      this.camera.fov = this.settings.camera.fovDegrees;
      this.camera.updateProjectionMatrix();
    }

    cameraModeSystem(this.ecs.stores, this.resources);
    lookSystem(this.ecs.stores, this.resources);
    movementSystem(this.ecs.stores, this.resources, dt);
    jumpSystem(this.ecs.stores, this.resources);
    physicsSystem(this.ecs.stores, this.resources, dt);
    worldBoundsSystem(this.ecs.stores, this.resources);
    cameraSystem(this.ecs.stores, this.resources, dt);
    avatarSystem(this.ecs.stores, this.resources);

    this.renderer.render(this.scene, this.camera);
  };
}
