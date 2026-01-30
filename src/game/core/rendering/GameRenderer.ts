// GameRenderer: WebGPU renderer management and canvas handling.
// GameRenderer：WebGPU 渲染器管理和画布处理

import {
  Clock,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
} from "three/webgpu";
import { cameraRuntimeConfig, cameraStaticConfig } from "@config/camera";
import { renderRuntimeConfig } from "@config/render";

/**
 * Encapsulates WebGPU renderer creation and lifecycle.
 * 封装 WebGPU 渲染器的创建和生命周期
 */
export class GameRenderer {
  readonly renderer: WebGPURenderer;
  readonly camera: PerspectiveCamera;
  readonly scene: Scene;
  readonly clock: Clock;
  private readonly container: HTMLElement;
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0x10151f, 1);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, renderRuntimeConfig.maxPixelRatio)
    );

    this.scene = new Scene();

    this.camera = new PerspectiveCamera(
      cameraRuntimeConfig.fovDegrees,
      1,
      cameraStaticConfig.nearMeters,
      cameraStaticConfig.farMeters
    );

    this.clock = new Clock();

    container.appendChild(this.renderer.domElement);
    this.updateSize();

    window.addEventListener("resize", this.handleResize);
  }

  /**
   * Initialize WebGPU renderer (async required).
   * 初始化 WebGPU 渲染器（需要异步）
   */
  async init(): Promise<void> {
    await this.renderer.init();
  }

  /**
   * Update renderer size to match container.
   * 更新渲染器尺寸以匹配容器
   */
  updateSize(): void {
    if (this.disposed) return;

    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Update pixel ratio based on settings.
   * 根据设置更新像素比
   */
  setPixelRatio(ratio: number): void {
    const effectiveRatio = Math.min(window.devicePixelRatio, renderRuntimeConfig.maxPixelRatio) * ratio;
    this.renderer.setPixelRatio(effectiveRatio);
  }

  /**
   * Update camera FOV.
   * 更新相机视场角
   */
  setFov(fovDegrees: number): void {
    if (this.camera.fov !== fovDegrees) {
      this.camera.fov = fovDegrees;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Start the render loop.
   * 启动渲染循环
   */
  startLoop(callback: () => void): void {
    this.clock.start();
    this.renderer.setAnimationLoop(callback);
  }

  /**
   * Stop the render loop.
   * 停止渲染循环
   */
  stopLoop(): void {
    this.renderer.setAnimationLoop(null);
  }

  /**
   * Get the DOM element.
   * 获取 DOM 元素
   */
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private readonly handleResize = (): void => {
    this.updateSize();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener("resize", this.handleResize);
    this.stopLoop();

    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.renderer.dispose();
  }
}
