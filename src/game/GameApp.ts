// GameApp: main game application with system scheduler.
// GameApp：主游戏应用，带系统调度器

import {
  Clock,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
} from "three/webgpu";
import { worldConfig } from "../config/world";
import { createWorld } from "./createWorld";
import { GameEcs, type GameWorld } from "./ecs/GameEcs";
import { createTimeResource, type GameResources } from "./ecs/resources";
import { InputManager } from "./input/InputManager";
import { createPlayer } from "./prefabs/createPlayer";
import { avatarSystem } from "./systems/avatarSystem";
import { cameraSystem } from "./systems/cameraSystem";
import { cameraModeSystem } from "./systems/cameraModeSystem";
import { inputSystem } from "./systems/inputSystem";
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

/**
 * System execution phases for explicit dependency management.
 * 系统执行阶段，用于显式依赖管理
 *
 * Industry best practice: organize systems into phases.
 * 业界最佳实践：将系统组织成阶段
 */
type SystemPhase = "input" | "gameplay" | "physics" | "render";

type SystemEntry = {
  name: string;
  phase: SystemPhase;
  fn: (world: GameWorld, res: GameResources) => void;
};

export class GameApp {
  private readonly container: HTMLElement;
  private readonly renderer: WebGPURenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly clock = new Clock();
  private readonly ecs = new GameEcs();
  private readonly input: InputManager;
  private readonly resources: GameResources;
  private readonly settings = createDefaultGameSettings();
  readonly ready: Promise<void>;
  private disposed = false;

  /**
   * System scheduler: ordered list of systems per phase.
   * 系统调度器：按阶段排序的系统列表
   */
  private readonly systems: SystemEntry[] = [];

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

    // Initialize resources with new structure.
    // 使用新结构初始化资源
    this.resources = {
      time: createTimeResource(),
      singletons: {
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
        input: this.input,
      },
      runtime: {
        terrain: world.terrain,
        settings: this.settings,
      },
    };

    onBootPhase?.("creating-ecs");

    // Register systems in execution order.
    // 按执行顺序注册系统
    this.registerSystems();

    // Register cleanup callback for avatar objects.
    // 注册 avatar 对象的清理回调
    this.ecs.world.onDestroy((entityId) => {
      const avatar = this.ecs.world.get(entityId, "avatar");
      if (avatar) {
        this.scene.remove(avatar.object);
        // Dispose geometry/materials if needed.
        // 如需要可释放几何体/材质
      }
    });

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

  /**
   * Register all systems in their execution phases.
   * 按执行阶段注册所有系统
   *
   * Phase order: input -> gameplay -> physics -> render
   * 阶段顺序：input -> gameplay -> physics -> render
   */
  private registerSystems(): void {
    // Input phase: read raw input, write to components.
    // Input 阶段：读取原始输入，写入组件
    this.systems.push({ name: "input", phase: "input", fn: inputSystem });

    // Gameplay phase: process input, apply game logic.
    // Gameplay 阶段：处理输入，应用游戏逻辑
    this.systems.push({ name: "cameraMode", phase: "gameplay", fn: cameraModeSystem });
    this.systems.push({ name: "look", phase: "gameplay", fn: lookSystem });
    this.systems.push({ name: "movement", phase: "gameplay", fn: movementSystem });
    this.systems.push({ name: "jump", phase: "gameplay", fn: jumpSystem });

    // Physics phase: integrate velocity, handle collisions.
    // Physics 阶段：积分速度，处理碰撞
    this.systems.push({ name: "physics", phase: "physics", fn: physicsSystem });
    this.systems.push({ name: "worldBounds", phase: "physics", fn: worldBoundsSystem });

    // Render phase: sync scene objects, update camera.
    // Render 阶段：同步场景对象，更新相机
    this.systems.push({ name: "camera", phase: "render", fn: cameraSystem });
    this.systems.push({ name: "avatar", phase: "render", fn: avatarSystem });
  }

  private async initRendererAndStart(onBootPhase?: (phase: GameBootPhase) => void) {
    await this.renderer.init();
    if (this.disposed) return;

    // GPU-first: bake terrain height/normal via compute before the first frame.
    // GPU-first：在第一帧前用 compute 烘焙地形高度/法线
    await this.resources.runtime.terrain.initGpu?.(this.renderer);
    if (this.disposed) return;

    // WebGPU backends may finalize internal render targets during init; re-apply sizing.
    // WebGPU 后端可能在 init 时最终确定内部渲染目标：此处重新应用尺寸
    this.onResize();

    // Use renderer animation loop for consistent pacing.
    // 使用 renderer 的动画循环，保证节奏稳定
    this.clock.start();
    this.renderer.setAnimationLoop(this.onFrame);

    // Initialize camera/visibility once with zero dt.
    // 用零 dt 初始化一次相机/可见性
    this.resources.time.dt = 0;
    cameraSystem(this.ecs.world, this.resources);
    avatarSystem(this.ecs.world);

    onBootPhase?.("ready");
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener("resize", this.onResize);
    this.renderer.setAnimationLoop(null);

    this.input.dispose();

    // Dispose terrain system.
    // 释放地形系统
    this.resources.runtime.terrain.dispose?.();

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

    // Update time resource.
    // 更新时间资源
    const rawDt = this.clock.getDelta();
    const dt = Math.min(worldConfig.render.maxDeltaSeconds, rawDt);
    this.resources.time.dt = dt;
    this.resources.time.elapsed += dt;
    this.resources.time.frame++;

    // Keep camera fov synced even if settings change without calling updateSettings.
    // 即使 UI 没走 updateSettings，也保持 fov 同步
    if (this.camera.fov !== this.settings.camera.fovDegrees) {
      this.camera.fov = this.settings.camera.fovDegrees;
      this.camera.updateProjectionMatrix();
    }

    // Run all systems in order.
    // 按顺序运行所有系统
    for (const system of this.systems) {
      system.fn(this.ecs.world, this.resources);
    }

    // Update terrain streaming system (chunk loading/unloading, LOD, culling).
    // 更新地形流式系统（chunk 加载/卸载、LOD、剔除）
    this.updateTerrainStreaming();

    // Flush destroyed entities at end of frame.
    // 在帧末刷新已销毁的实体
    this.ecs.flushDestroyed();

    // Render the scene.
    // 渲染场景
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Update terrain streaming based on player position.
   * 根据玩家位置更新地形流式加载
   */
  private updateTerrainStreaming(): void {
    const terrain = this.resources.runtime.terrain;
    if (!terrain.update) return;

    // Find player position.
    // 找到玩家位置
    for (const [entityId] of this.ecs.world.query("transform", "player")) {
      const transform = this.ecs.world.get(entityId, "transform");
      if (transform) {
        terrain.update(transform.x, transform.z, this.camera);
        break; // Only need first player.
      }
    }
  }
}
