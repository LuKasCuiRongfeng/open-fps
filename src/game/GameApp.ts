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

export class GameApp {
  private readonly container: HTMLElement;
  private readonly renderer: WebGPURenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly clock = new Clock();
  private readonly ecs = new GameEcs();
  private readonly input!: InputManager;
  private readonly resources!: GameResources;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;

    // WebGPU-only by design (no WebGL fallback).
    // 本项目只支持 WebGPU（不做 WebGL 兼容/降级）
    const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    if (!gpu) {
      throw new Error("WebGPU is not available in this environment.");
    }

    this.renderer = new WebGPURenderer({ antialias: true });
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

    createWorld(this.scene);

    this.input = new InputManager(this.renderer.domElement);
    this.resources = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      input: this.input,
    };

    // ECS: create a single player entity.
    // ECS：创建一个玩家实体
    createPlayer(this.ecs, this.resources);

    this.container.appendChild(this.renderer.domElement);
    this.onResize();

    window.addEventListener("resize", this.onResize);

    // Use renderer animation loop for consistent pacing.
    // 使用 renderer 的动画循环，保证节奏稳定
    this.clock.start();
    this.renderer.setAnimationLoop(this.onFrame);

    // Initialize camera/visibility once.
    // 初始化一次相机/可见性
    cameraSystem(this.ecs.stores, this.resources, 0);
    avatarSystem(this.ecs.stores, this.resources);
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

    cameraModeSystem(this.ecs.stores, this.resources);
    lookSystem(this.ecs.stores, this.resources);
    movementSystem(this.ecs.stores, this.resources, dt);
    cameraSystem(this.ecs.stores, this.resources, dt);
    avatarSystem(this.ecs.stores, this.resources);

    this.renderer.render(this.scene, this.camera);
  };
}
