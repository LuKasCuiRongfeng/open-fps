// SkySystem: Physical sky coordinator with sun, stars, atmosphere, and post-processing.
// SkySystem：物理天空协调器，包含太阳、星星、大气和后处理

import {
  AmbientLight,
  Vector3,
  LinearFilter,
  type DirectionalLight,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { SkyDome } from "./SkyShader";
import { SunRenderer } from "./SunRenderer";
import { SkyPostProcessing, type PostProcessingSettings } from "./SkyPostProcessing";
import {
  calculateDayFactor,
  calculateLightSettings,
  sunPositionToDirection,
} from "./DayNightCycle";
import type { SkySettings } from "../../settings";
import { createDefaultGameSettings } from "../../settings";

// Re-export for external use.
// 重新导出供外部使用
export { timeToSunPosition } from "./DayNightCycle";

/**
 * SkySystem: coordinates sky rendering components.
 * SkySystem：协调天空渲染组件
 */
export class SkySystem {
  private readonly skyDome: SkyDome;
  private readonly sunRenderer: SunRenderer;
  private readonly postProcessing: SkyPostProcessing;
  private readonly nightLight: AmbientLight;
  private readonly scene: Scene;
  private readonly sunDirection = new Vector3();

  private settings: SkySettings;
  private directionalLight: DirectionalLight | null = null;
  private camera: PerspectiveCamera | null = null;

  constructor(scene: Scene, settings?: Partial<SkySettings>) {
    const defaults = createDefaultGameSettings().sky;
    this.settings = { ...defaults, ...settings };
    this.scene = scene;

    // Create cool-toned night light.
    // 创建冷色调夜光
    this.nightLight = new AmbientLight(0x4466aa, 0);
    scene.add(this.nightLight);

    // Create procedural sky dome.
    // 创建程序化天空穹顶
    this.skyDome = new SkyDome();
    this.skyDome.addToScene(scene);

    // Create sun renderer.
    // 创建太阳渲染器
    this.sunRenderer = new SunRenderer(this.settings.sunSize);
    scene.add(this.sunRenderer.mesh);

    // Create post-processing.
    // 创建后处理
    this.postProcessing = new SkyPostProcessing(this.extractPostProcessingSettings());

    // Apply initial settings.
    // 应用初始设置
    this.updateSunPosition();
  }

  /**
   * Initialize post-processing (must be called after renderer.init()).
   * 初始化后处理（必须在 renderer.init() 之后调用）
   */
  initPostProcessing(
    renderer: WebGPURenderer,
    scene: Scene,
    camera: PerspectiveCamera
  ): void {
    this.camera = camera;
    this.postProcessing.init(renderer, scene, camera);
    this.updateGodRaysCenter();
  }

  /**
   * Link to directional light for synchronized sun position.
   * 链接方向光以同步太阳位置
   */
  setDirectionalLight(light: DirectionalLight): void {
    this.directionalLight = light;
    this.updateSunPosition();
  }

  /**
   * Update sky settings.
   * 更新天空设置
   */
  updateSettings(newSettings: Partial<SkySettings>): void {
    Object.assign(this.settings, newSettings);

    if (
      newSettings.sunElevation !== undefined ||
      newSettings.sunAzimuth !== undefined
    ) {
      this.updateSunPosition();
    }

    // Update post-processing.
    // 更新后处理
    this.postProcessing.updateSettings(this.extractPostProcessingSettings());

    // Update lens flare.
    // 更新镜头光斑
    if (newSettings.lensflareEnabled !== undefined) {
      this.sunRenderer.setLensflareEnabled(
        newSettings.lensflareEnabled,
        this.settings.sunElevation
      );
    }

    // Update sun size.
    // 更新太阳大小
    if (newSettings.sunSize !== undefined) {
      this.sunRenderer.updateAppearance(this.settings.sunElevation, newSettings.sunSize);
    }

    // Update star brightness.
    // 更新星星亮度
    if (newSettings.starBrightness !== undefined) {
      this.skyDome.setStarBrightness(newSettings.starBrightness);
    }

    // Update night light.
    // 更新夜光
    if (newSettings.nightLightIntensity !== undefined) {
      this.updateNightLight();
    }
  }

  /**
   * Get current sky settings.
   * 获取当前天空设置
   */
  getSettings(): SkySettings {
    return { ...this.settings };
  }

  /**
   * Render with post-processing.
   * 使用后处理渲染
   */
  render(): void {
    this.postProcessing.render();
  }

  /**
   * Check if post-processing should be used.
   * 检查是否应使用后处理
   */
  shouldUsePostProcessing(): boolean {
    return this.postProcessing.shouldUse();
  }

  /**
   * Update per-frame state.
   * 更新每帧状态
   */
  update(): void {
    if (this.camera) {
      this.skyDome.mesh.position.copy(this.camera.position);
      this.sunRenderer.followCamera(this.camera.position, this.sunDirection);
    }
    this.updateGodRaysCenter();
  }

  /**
   * Get the current sun direction vector (normalized).
   * 获取当前太阳方向向量（归一化）
   */
  getSunDirection(): Vector3 {
    return this.sunDirection.clone();
  }

  /**
   * Get the current day factor (0 = night, 1 = day).
   * 获取当前白天因子（0=夜晚，1=白天）
   */
  getDayFactor(): number {
    return calculateDayFactor(this.settings.sunElevation);
  }

  /**
   * Load star texture from project assets folder.
   * 从项目资源文件夹加载星空纹理
   */
  async loadStarTexture(projectPath: string): Promise<void> {
    const texturePath = `${projectPath}/assets/textures/starry_4k.exr`;

    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const fileUrl = convertFileSrc(texturePath);

    return new Promise((resolve) => {
      const loader = new EXRLoader();
      loader.load(
        fileUrl,
        (tex) => {
          tex.minFilter = LinearFilter;
          tex.magFilter = LinearFilter;
          this.skyDome.setStarTexture(tex);
          resolve();
        },
        undefined,
        (error) => {
          console.warn("Failed to load star texture:", texturePath, error);
          resolve();
        }
      );
    });
  }

  private updateSunPosition(): void {
    // Convert to direction vector.
    // 转换为方向向量
    const dir = sunPositionToDirection(this.settings.sunElevation, this.settings.sunAzimuth);
    this.sunDirection.set(dir.x, dir.y, dir.z);

    // Update sky dome.
    // 更新天空穹顶
    this.skyDome.setSunDirection(dir.x, dir.y, dir.z);

    // Update day factor.
    // 更新白天因子
    const dayFactor = calculateDayFactor(this.settings.sunElevation);
    this.skyDome.setDayFactor(dayFactor);

    // Update sun renderer.
    // 更新太阳渲染器
    this.sunRenderer.updatePosition(this.sunDirection);
    this.sunRenderer.updateAppearance(this.settings.sunElevation, this.settings.sunSize);
    this.sunRenderer.setLensflareEnabled(
      this.settings.lensflareEnabled,
      this.settings.sunElevation
    );

    // Update directional light.
    // 更新方向光
    if (this.directionalLight) {
      this.directionalLight.position.copy(this.sunDirection).multiplyScalar(1000);
      const lightSettings = calculateLightSettings(this.settings.sunElevation);
      this.directionalLight.color.copy(lightSettings.color);
      this.directionalLight.intensity = lightSettings.intensity;
    }

    // Update god rays center.
    // 更新上帝光线中心
    this.updateGodRaysCenter();

    // Update night light.
    // 更新夜光
    this.updateNightLight();
  }

  private updateGodRaysCenter(): void {
    if (!this.camera) return;
    const sunPos = this.sunRenderer.mesh.position;
    this.postProcessing.updateGodRaysCenter({ x: sunPos.x, y: sunPos.y, z: sunPos.z });
  }

  private updateNightLight(): void {
    const elev = this.settings.sunElevation;
    const maxIntensity = this.settings.nightLightIntensity;

    let intensity: number;
    if (elev > 5) {
      intensity = 0;
    } else if (elev > -15) {
      const t = (5 - elev) / 20;
      intensity = maxIntensity * t;
    } else {
      intensity = maxIntensity;
    }

    this.nightLight.intensity = intensity;
  }

  private extractPostProcessingSettings(): PostProcessingSettings {
    return {
      bloomThreshold: this.settings.bloomThreshold,
      bloomStrength: this.settings.bloomStrength,
      bloomRadius: this.settings.bloomRadius,
      bloomEnabled: this.settings.bloomEnabled,
      godRaysEnabled: this.settings.godRaysEnabled,
      godRaysWeight: this.settings.godRaysWeight,
      godRaysDecay: this.settings.godRaysDecay,
      godRaysExposure: this.settings.godRaysExposure,
    };
  }

  dispose(): void {
    this.skyDome.dispose();
    this.skyDome.removeFromScene(this.scene);
    this.sunRenderer.dispose();
    this.scene.remove(this.sunRenderer.mesh);
    this.scene.remove(this.nightLight);
    this.postProcessing.dispose();
    this.camera = null;
  }
}
