// GameApp: main game application with system scheduler.
// GameApp：主游戏应用，带系统调度器

import {
  Clock,
  FogExp2,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
} from "three/webgpu";
import { cameraConfig } from "../config/camera";
import { renderConfig } from "../config/render";
import { visualsConfig } from "../config/visuals";
import { terrainConfig } from "../config/terrain";
import { createWorld } from "./createWorld";
import { GameEcs, type GameWorld } from "./ecs/GameEcs";
import { createTimeResource, type GameResources } from "./ecs/resources";
import { TerrainEditor } from "./editor/TerrainEditor";
import { InputManager } from "./input/InputManager";
import { createRawInputState } from "./input/RawInputState";
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
  private readonly inputManager: InputManager;
  private readonly resources: GameResources;
  private readonly settings = createDefaultGameSettings();
  private readonly marker: Mesh;
  private readonly terrainEditor: TerrainEditor;
  readonly ready: Promise<void>;
  private disposed = false;

  // FPS tracking (based on actual render loop).
  // FPS 追踪（基于实际渲染循环）
  private fpsFrameCount = 0;
  private fpsLastTime = 0;
  private fpsValue = 0;

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
      Math.min(window.devicePixelRatio, renderConfig.maxPixelRatio),
    );

    this.scene = new Scene();

    this.camera = new PerspectiveCamera(
      cameraConfig.fovDegrees,
      1,
      cameraConfig.nearMeters,
      cameraConfig.farMeters,
    );

    onBootPhase?.("creating-world");
    const world = createWorld(this.scene);
    this.marker = world.marker;

    // Create raw input state as ECS resource (data-oriented).
    // 创建原始输入状态作为 ECS 资源（数据导向）
    const rawInputState = createRawInputState();
    this.inputManager = new InputManager(this.renderer.domElement, rawInputState);

    // Initialize resources with new structure.
    // 使用新结构初始化资源
    this.resources = {
      time: createTimeResource(),
      singletons: {
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
        inputManager: this.inputManager,
      },
      input: {
        raw: rawInputState,
      },
      runtime: {
        terrain: world.terrain,
        settings: this.settings,
      },
    };

    onBootPhase?.("creating-ecs");

    // Create terrain editor.
    // 创建地形编辑器
    this.terrainEditor = new TerrainEditor(terrainConfig);

    // Connect editor mode changes to pointer lock control.
    // 连接编辑器模式变化到指针锁定控制
    this.terrainEditor.setOnModeChange((mode) => {
      // Disable pointer lock in edit mode, enable in play mode.
      // 编辑模式禁用指针锁定，游戏模式启用
      this.inputManager.setPointerLockEnabled(mode === "play");

      // Initialize editor camera when entering edit mode.
      // 进入编辑模式时初始化编辑器相机
      if (mode === "edit") {
        const pos = this.getPlayerPosition();
        if (pos) {
          this.terrainEditor.initCameraFromPlayer(pos.x, pos.y, pos.z);
        }
      }
    });

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

    // NOTE: Player creation moved to initRendererAndStart() after terrain.initGpu()
    // to ensure heightAt() returns correct spawn height.
    // 注意：玩家创建移动到 initRendererAndStart()，在 terrain.initGpu() 之后，
    // 以确保 heightAt() 返回正确的生成高度

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

    // Get spawn position from player config.
    // 从玩家配置获取出生位置
    const { spawn } = await import("../config/player").then((m) => m.playerConfig);
    const spawnX = spawn.xMeters;
    const spawnZ = spawn.zMeters;

    // Initialize streaming terrain system with spawn position.
    // 使用出生位置初始化流式地形系统
    await this.resources.runtime.terrain.initGpu(this.renderer, spawnX, spawnZ);
    if (this.disposed) return;

    // Reposition marker now that terrain is initialized.
    // 地形初始化后重新定位 marker
    const markerX = spawnX + 3;
    const markerZ = spawnZ;
    const markerY = this.resources.runtime.terrain.heightAt(markerX, markerZ);
    const markerSize = visualsConfig.debug.originMarkerSizeMeters;
    this.marker.position.set(markerX, markerY + markerSize * 0.5, markerZ);

    // Create player AFTER terrain GPU init so heightAt() works correctly.
    // 在地形 GPU 初始化后创建玩家，确保 heightAt() 正确工作
    createPlayer(this.ecs, this.resources);

    // WebGPU backends may finalize internal render targets during init; re-apply sizing.
    // WebGPU 后端可能在 init 时最终确定内部渲染目标：此处重新应用尺寸
    this.onResize();

    // Warm up shaders by rendering multiple frames from different angles.
    // This compiles all shader variants to prevent stutter on first camera rotation.
    // 通过从不同角度渲染多帧来预热着色器
    // 编译所有着色器变体，防止首次旋转相机时卡顿
    await this.warmUpShaders();

    // Use renderer animation loop for consistent pacing.
    // 使用 renderer 的动画循环，保证节奏稳定
    this.clock.start();
    this.renderer.setAnimationLoop(this.onFrame);

    onBootPhase?.("ready");
  }

  /**
   * Warm up GPU shaders by rendering from multiple camera angles.
   * 通过从多个相机角度渲染来预热 GPU 着色器
   *
   * WebGPU compiles shader variants on first use. By rendering from many angles,
   * we force compilation of all variants during loading instead of gameplay.
   * WebGPU 在首次使用时编译着色器变体。通过从多个角度渲染，
   * 我们强制在加载期间而非游戏过程中编译所有变体。
   */
  private async warmUpShaders(): Promise<void> {
    const { Euler } = await import("three/webgpu");

    this.resources.time.dt = 0;

    // Save original camera state.
    // 保存原始相机状态
    const originalPos = this.camera.position.clone();
    const originalQuat = this.camera.quaternion.clone();

    // Render from multiple yaw angles and pitch angles.
    // 从多个水平角和俯仰角渲染
    const yawAngles = [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI, -Math.PI * 3 / 4, -Math.PI / 2, -Math.PI / 4];
    const pitchAngles = [-0.5, 0, 0.5]; // Look down, straight, up

    for (const pitch of pitchAngles) {
      for (const yaw of yawAngles) {
        // Update camera to look in different directions.
        // 更新相机朝向不同方向
        this.camera.quaternion.setFromEuler(new Euler(pitch, yaw, 0, "YXZ"));

        // Render frame to compile shaders.
        // 渲染帧以编译着色器
        this.renderer.render(this.scene, this.camera);
      }
    }

    // Restore original camera state.
    // 恢复原始相机状态
    this.camera.position.copy(originalPos);
    this.camera.quaternion.copy(originalQuat);

    // Update systems and final render.
    // 更新系统并最终渲染
    cameraSystem(this.ecs.world, this.resources);
    avatarSystem(this.ecs.world);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener("resize", this.onResize);
    this.renderer.setAnimationLoop(null);

    this.inputManager.dispose();

    // Dispose terrain system.
    // 释放地形系统
    this.resources.runtime.terrain.dispose();

    // Detach canvas.
    // 移除画布
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.renderer.dispose();
  }

  getSettingsSnapshot(): GameSettings {
    // Sync editor mouse config from terrain editor before returning.
    // 返回前从地形编辑器同步鼠标配置
    const mc = this.terrainEditor.mouseConfig;
    this.settings.editor.mouseConfig.leftButton = mc.leftButton;
    this.settings.editor.mouseConfig.rightButton = mc.rightButton;
    this.settings.editor.mouseConfig.middleButton = mc.middleButton;
    
    return cloneSettings(this.settings);
  }

  /**
   * Get player position for debug display.
   * 获取玩家位置用于调试显示
   */
  getPlayerPosition(): { x: number; y: number; z: number } | null {
    for (const [entityId] of this.ecs.world.query("transform", "player")) {
      const transform = this.ecs.world.get(entityId, "transform");
      if (transform) {
        return { x: transform.x, y: transform.y, z: transform.z };
      }
    }
    return null;
  }

  /**
   * Get current FPS based on actual render loop.
   * 获取基于实际渲染循环的当前 FPS
   */
  getFps(): number {
    return this.fpsValue;
  }

  /**
   * Get terrain editor instance.
   * 获取地形编辑器实例
   */
  getTerrainEditor(): TerrainEditor {
    return this.terrainEditor;
  }

  /**
   * Update editor brush target from mouse position.
   * 从鼠标位置更新编辑器画刷目标
   */
  updateEditorBrushTarget(mouseX: number, mouseY: number): void {
    const canvas = this.renderer.domElement;
    this.terrainEditor.updateBrushTarget(
      mouseX,
      mouseY,
      canvas.clientWidth,
      canvas.clientHeight,
      this.camera,
      this.resources.runtime.terrain.heightAt
    );
  }

  // --- Map Save/Load API / 地图保存/加载 API ---

  /**
   * Export current terrain as map data (for saving).
   * 导出当前地形为地图数据（用于保存）
   */
  exportCurrentMapData(): import("./editor/MapData").MapData {
    return this.resources.runtime.terrain.exportCurrentMapData();
  }

  /**
   * Load terrain from map data.
   * 从地图数据加载地形
   */
  async loadMapData(mapData: import("./editor/MapData").MapData): Promise<void> {
    await this.resources.runtime.terrain.loadMapData(mapData);
    // Update editor's map data reference.
    // 更新编辑器的地图数据引用
    this.terrainEditor.loadMap(JSON.stringify({
      version: mapData.version,
      seed: mapData.seed,
      tileResolution: mapData.tileResolution,
      chunkSizeMeters: mapData.chunkSizeMeters,
      chunks: {}, // Don't duplicate chunks in editor, they're in TerrainHeightSampler
      metadata: mapData.metadata,
    }));
  }

  /**
   * Reset terrain to original loaded data (discard all edits).
   * 重置地形为原始加载数据（丢弃所有编辑）
   */
  async resetTerrain(): Promise<void> {
    await this.resources.runtime.terrain.resetToOriginal();
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

    // Apply fog settings immediately.
    // 立即应用雾设置
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.density = this.settings.fog.density;
    }

    // Apply editor mouse config.
    // 应用编辑器鼠标配置
    if (patch.editor?.mouseConfig) {
      this.terrainEditor.setMouseConfig(this.settings.editor.mouseConfig);
    }
  }

  /**
   * Apply complete settings (for loading from project).
   * 应用完整设置（用于从项目加载）
   */
  applySettings(newSettings: GameSettings) {
    setSettings(this.settings, newSettings);

    // Apply render settings immediately.
    // 立即应用渲染设置
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.settings.render.maxPixelRatio),
    );

    // Apply camera settings immediately.
    // 立即应用相机设置
    this.camera.fov = this.settings.camera.fovDegrees;
    this.camera.updateProjectionMatrix();

    // Apply fog settings immediately.
    // 立即应用雾设置
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.density = this.settings.fog.density;
    }

    // Apply editor mouse config.
    // 应用编辑器鼠标配置
    this.terrainEditor.setMouseConfig(this.settings.editor.mouseConfig);
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

    // Apply fog settings immediately.
    // 立即应用雾设置
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.density = this.settings.fog.density;
    }

    // Reset editor mouse config.
    // 重置编辑器鼠标配置
    this.terrainEditor.setMouseConfig(this.settings.editor.mouseConfig);
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
    const dt = Math.min(renderConfig.maxDeltaSeconds, rawDt);
    this.resources.time.dt = dt;
    this.resources.time.elapsed += dt;
    this.resources.time.frame++;

    // Update FPS counter (based on actual render loop).
    // 更新 FPS 计数器（基于实际渲染循环）
    this.fpsFrameCount++;
    const now = performance.now();
    const fpsDelta = now - this.fpsLastTime;
    if (fpsDelta >= 500) {
      this.fpsValue = Math.round((this.fpsFrameCount * 1000) / fpsDelta);
      this.fpsFrameCount = 0;
      this.fpsLastTime = now;
    }

    // Keep camera fov synced even if settings change without calling updateSettings.
    // 即使 UI 没走 updateSettings，也保持 fov 同步
    if (this.camera.fov !== this.settings.camera.fovDegrees) {
      this.camera.fov = this.settings.camera.fovDegrees;
      this.camera.updateProjectionMatrix();
    }

    // Run all systems in order (only in play mode).
    // 按顺序运行所有系统（仅在游戏模式）
    if (this.terrainEditor.mode === "play") {
      for (const system of this.systems) {
        system.fn(this.ecs.world, this.resources);
      }
    } else {
      // In edit mode: apply editor camera state.
      // 编辑模式：应用编辑器相机状态
      this.terrainEditor.applyCameraState(this.camera);
    }

    // Update terrain streaming system (chunk loading/unloading, LOD, culling).
    // 更新地形流式系统（chunk 加载/卸载、LOD、剔除）
    this.updateTerrainStreaming();

    // Process terrain editor brush strokes.
    // 处理地形编辑器画刷笔触
    this.updateTerrainEditor(dt);

    // Flush destroyed entities at end of frame.
    // 在帧末刷新已销毁的实体
    this.ecs.flushDestroyed();

    // Render the scene.
    // 渲染场景
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Update terrain streaming based on player/camera position.
   * 根据玩家/相机位置更新地形流式加载
   */
  private updateTerrainStreaming(): void {
    const terrain = this.resources.runtime.terrain;

    // In edit mode, stream terrain around camera target.
    // 编辑模式下，围绕相机目标流式加载地形
    if (this.terrainEditor.mode === "edit") {
      const target = this.terrainEditor.getCameraTarget();
      terrain.update(target.x, target.z, this.camera);
      return;
    }

    // In play mode, stream around player position.
    // 游戏模式下，围绕玩家位置流式加载
    for (const [entityId] of this.ecs.world.query("transform", "player")) {
      const transform = this.ecs.world.get(entityId, "transform");
      if (transform) {
        terrain.update(transform.x, transform.z, this.camera);
        break; // Only need first player. / 只需第一个玩家
      }
    }
  }

  /**
   * Update terrain editor: apply pending brush strokes using GPU compute shaders.
   * 更新地形编辑器：使用 GPU 计算着色器应用待处理的画刷笔触
   *
   * GPU-first workflow:
   * 1. TerrainEditor collects brush strokes
   * 2. TerrainBrushCompute applies them via ping-pong compute shader
   * 3. TerrainNormalCompute regenerates normals on GPU
   *
   * GPU-first 工作流程：
   * 1. TerrainEditor 收集画刷笔触
   * 2. TerrainBrushCompute 通过乒乓计算着色器应用它们
   * 3. TerrainNormalCompute 在 GPU 上重新生成法线
   */
  private updateTerrainEditor(dt: number): void {
    // Generate brush stroke if brush is active this frame.
    // 如果本帧画刷激活，则生成画刷笔触
    this.terrainEditor.applyBrush(dt);

    // Collect pending strokes from editor.
    // 从编辑器收集待处理的笔触
    const strokes = this.terrainEditor.consumePendingStrokes();

    // Apply strokes on GPU (async, non-blocking).
    // 在 GPU 上应用笔触（异步，非阻塞）
    if (strokes.length > 0) {
      void this.resources.runtime.terrain.applyBrushStrokes(strokes);
    }
  }
}
