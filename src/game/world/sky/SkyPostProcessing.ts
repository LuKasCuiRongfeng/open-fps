// SkyPostProcessing: bloom, god rays, and other post-processing effects for sky.
// SkyPostProcessing：天空的泛光、上帝光线和其他后处理效果

import {
  type PerspectiveCamera,
  RenderPipeline,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import type BloomNode from "three/addons/tsl/display/BloomNode.js";

/**
 * Post-processing settings.
 * 后处理设置
 */
export interface PostProcessingSettings {
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomEnabled: boolean;
}

/**
 * SkyPostProcessing: manages bloom and god rays effects.
 * SkyPostProcessing：管理泛光和上帝光线效果
 */
export class SkyPostProcessing {
  private postProcessing: RenderPipeline | null = null;
  private bloomPass: BloomNode | null = null;

  private settings: PostProcessingSettings;

  constructor(initialSettings: PostProcessingSettings) {
    this.settings = { ...initialSettings };
  }

  /**
   * Initialize post-processing (must be called after renderer.init()).
   * 初始化后处理（必须在 renderer.init() 之后调用）
   */
  init(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera): void {
    this.postProcessing = new RenderPipeline(renderer);

    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode("output");

    // Bloom.
    // 泛光
    this.bloomPass = bloom(scenePassColor);
    this.applyBloomSettings();
    this.postProcessing.outputNode = scenePassColor.add(this.bloomPass);
  }

  /**
   * Update settings.
   * 更新设置
   */
  updateSettings(newSettings: Partial<PostProcessingSettings>): void {
    Object.assign(this.settings, newSettings);

    if (
      newSettings.bloomThreshold !== undefined ||
      newSettings.bloomStrength !== undefined ||
      newSettings.bloomRadius !== undefined
    ) {
      this.applyBloomSettings();
    }
  }

  private applyBloomSettings(): void {
    if (this.bloomPass) {
      this.bloomPass.threshold.value = this.settings.bloomThreshold;
      this.bloomPass.strength.value = this.settings.bloomStrength;
      this.bloomPass.radius.value = this.settings.bloomRadius;
    }
  }

  /**
   * Render with post-processing.
   * 使用后处理渲染
   */
  render(): void {
    if (this.postProcessing && this.settings.bloomEnabled) {
      this.postProcessing.render();
    }
  }

  /**
   * Check if post-processing should be used.
   * 检查是否应使用后处理
   */
  shouldUse(): boolean {
    return this.postProcessing !== null && this.settings.bloomEnabled;
  }

  dispose(): void {
    this.postProcessing = null;
    this.bloomPass = null;
  }
}
