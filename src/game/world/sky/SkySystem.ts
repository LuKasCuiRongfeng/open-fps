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
    scene.userData.mainDirectionalLight = this.directionalLight;
    this.postProcessing.init(renderer, scene, camera);
  }

  /**
   * Link to directional light for synchronized sun position.
   * 链接方向光以同步太阳位置
   */
  setDirectionalLight(light: DirectionalLight): void {
    this.directionalLight = light;
    this.scene.userData.mainDirectionalLight = light;
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
  async loadStarTexture(projectPath: string): Promise<boolean> {
    const { getPlatformBridge } = await import("@/platform");
    const platform = getPlatformBridge();
    const candidatePaths = [
      `${projectPath}/assets/textures/starry_4k.exr`,
      `${projectPath}/assets/texture/starry_4k.exr`,
    ];
    const failures: Array<{ path: string; stage: "read" | "decode"; error: unknown }> = [];

    const formatError = (error: unknown): string => {
      if (error instanceof Error) {
        return error.message;
      }

      return typeof error === "string" ? error : JSON.stringify(error);
    };

    const reportCandidateFailure = (
      texturePath: string,
      stage: "read" | "decode",
      error: unknown,
    ): void => {
      failures.push({ path: texturePath, stage, error });
      console.warn("[SkySystem] Star texture candidate failed", error);
    };

    const decodeBase64 = (value: string): Uint8Array => {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    };

    const tryLoadTexture = async (texturePath: string): Promise<boolean> => {
      let objectUrl: string | null = null;

      try {
        const base64 = await platform.invoke<string>("read_binary_file_base64", {
          path: texturePath,
        });
        const bytes = decodeBase64(base64);
        const blobBuffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(blobBuffer).set(bytes);
        objectUrl = URL.createObjectURL(new Blob([blobBuffer], { type: "image/x-exr" }));
      } catch (error) {
        reportCandidateFailure(texturePath, "read", error);
        return false;
      }

      return new Promise((resolve) => {
        const loader = new EXRLoader();
        loader.load(
          objectUrl,
          (tex) => {
            tex.minFilter = LinearFilter;
            tex.magFilter = LinearFilter;
            this.skyDome.setStarTexture(tex);
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
            }
            resolve(true);
          },
          undefined,
          (error) => {
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
            }
            reportCandidateFailure(texturePath, "decode", error);
            resolve(false);
          }
        );
      });
    };

    for (const candidatePath of candidatePaths) {
      if (await tryLoadTexture(candidatePath)) {
        return true;
      }
    }

    console.warn("[SkySystem] Star texture unavailable, continuing without night sky texture", {
      projectPath,
      candidatePaths,
      failures: failures.map((failure) => ({
        path: failure.path,
        stage: failure.stage,
        reason: formatError(failure.error),
      })),
    });

    return false;
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

    // Update night light.
    // 更新夜光
    this.updateNightLight();
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
