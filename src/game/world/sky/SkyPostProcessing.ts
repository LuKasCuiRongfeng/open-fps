// SkyPostProcessing: bloom, god rays, and other post-processing effects for sky.
// SkyPostProcessing：天空的泛光、上帝光线和其他后处理效果

import {
  PostProcessing,
  Vector2,
  type Node,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { pass, uniform, vec2 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import type BloomNode from "three/addons/tsl/display/BloomNode.js";
import { radialBlur } from "three/addons/tsl/display/radialBlur.js";

/**
 * Post-processing settings.
 * 后处理设置
 */
export interface PostProcessingSettings {
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomEnabled: boolean;
  godRaysEnabled: boolean;
  godRaysWeight: number;
  godRaysDecay: number;
  godRaysExposure: number;
}

/**
 * SkyPostProcessing: manages bloom and god rays effects.
 * SkyPostProcessing：管理泛光和上帝光线效果
 */
export class SkyPostProcessing {
  private postProcessing: PostProcessing | null = null;
  private bloomPass: BloomNode | null = null;
  private godRaysPass: Node | null = null;

  // God rays uniforms.
  // 上帝光线 uniform
  private readonly godRaysCenterUniform = uniform(vec2(0.5, 0.5));
  private readonly godRaysWeightUniform = uniform(0.5);
  private readonly godRaysDecayUniform = uniform(0.95);
  private readonly godRaysExposureUniform = uniform(3.0);
  private readonly godRaysEnabledUniform = uniform(1.0);

  private camera: PerspectiveCamera | null = null;
  private settings: PostProcessingSettings;

  constructor(initialSettings: PostProcessingSettings) {
    this.settings = { ...initialSettings };
  }

  /**
   * Initialize post-processing (must be called after renderer.init()).
   * 初始化后处理（必须在 renderer.init() 之后调用）
   */
  init(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera): void {
    this.postProcessing = new PostProcessing(renderer);
    this.camera = camera;

    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode("output");

    // Bloom.
    // 泛光
    this.bloomPass = bloom(scenePassColor);
    this.applyBloomSettings();

    // God rays.
    // 上帝光线
    this.godRaysWeightUniform.value = this.settings.godRaysWeight;
    this.godRaysDecayUniform.value = this.settings.godRaysDecay;
    this.godRaysExposureUniform.value = this.settings.godRaysExposure;
    this.godRaysEnabledUniform.value = this.settings.godRaysEnabled ? 1.0 : 0.0;

    this.godRaysPass = radialBlur(this.bloomPass, {
      center: this.godRaysCenterUniform,
      weight: this.godRaysWeightUniform,
      decay: this.godRaysDecayUniform,
      exposure: this.godRaysExposureUniform,
    });

    const godRaysContribution = this.godRaysPass.mul(this.godRaysEnabledUniform);
    this.postProcessing.outputNode = scenePassColor
      .add(this.bloomPass)
      .add(godRaysContribution);
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

    if (newSettings.godRaysEnabled !== undefined) {
      this.godRaysEnabledUniform.value = newSettings.godRaysEnabled ? 1.0 : 0.0;
    }
    if (newSettings.godRaysWeight !== undefined) {
      this.godRaysWeightUniform.value = newSettings.godRaysWeight;
    }
    if (newSettings.godRaysDecay !== undefined) {
      this.godRaysDecayUniform.value = newSettings.godRaysDecay;
    }
    if (newSettings.godRaysExposure !== undefined) {
      this.godRaysExposureUniform.value = newSettings.godRaysExposure;
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
   * Update god rays center based on sun screen position.
   * 根据太阳屏幕位置更新上帝光线中心
   */
  updateGodRaysCenter(sunWorldPosition: { x: number; y: number; z: number }): void {
    if (!this.camera) return;

    const projected = new Vector2();
    const pos = { x: sunWorldPosition.x, y: sunWorldPosition.y, z: sunWorldPosition.z };

    // Manual projection to avoid Vector3 import.
    // 手动投影以避免导入 Vector3
    const e = this.camera.matrixWorldInverse.elements;
    const p = this.camera.projectionMatrix.elements;

    const x = pos.x * e[0] + pos.y * e[4] + pos.z * e[8] + e[12];
    const y = pos.x * e[1] + pos.y * e[5] + pos.z * e[9] + e[13];
    const z = pos.x * e[2] + pos.y * e[6] + pos.z * e[10] + e[14];
    const w = pos.x * e[3] + pos.y * e[7] + pos.z * e[11] + e[15];

    const px = x * p[0] + y * p[4] + z * p[8] + w * p[12];
    const py = x * p[1] + y * p[5] + z * p[9] + w * p[13];
    const pw = x * p[3] + y * p[7] + z * p[11] + w * p[15];

    projected.x = (px / pw + 1) / 2;
    projected.y = (py / pw + 1) / 2;

    this.godRaysCenterUniform.value.x = projected.x;
    this.godRaysCenterUniform.value.y = projected.y;
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
    this.godRaysPass = null;
    this.camera = null;
  }
}
