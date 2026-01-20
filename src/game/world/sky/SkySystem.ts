// SkySystem: Physical sky with sun, stars, Milky Way, atmosphere, and post-processing.
// SkySystem：带太阳、星星、银河、大气和后处理的物理天空

import {
  AmbientLight,
  Color,
  FrontSide,
  MathUtils,
  Mesh,
  MeshBasicNodeMaterial,
  PostProcessing,
  SphereGeometry,
  TextureLoader,
  Vector3,
  LinearFilter,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
  type DirectionalLight,
} from "three/webgpu";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { pass, uniform, vec3, vec2, float } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { radialBlur } from "three/addons/tsl/display/radialBlur.js";
import { LensflareMesh, LensflareElement } from "three/addons/objects/LensflareMesh.js";
import { SkyDome } from "./SkyShader";

/**
 * Sky system settings for runtime adjustment.
 * 天空系统运行时调整设置
 */
export interface SkySettings {
  /** Sun elevation angle in degrees (0 = horizon, 90 = overhead). / 太阳仰角（度，0=地平线，90=头顶） */
  sunElevation: number;
  /** Sun azimuth angle in degrees (0 = north, 90 = east, 180 = south). / 太阳方位角（度，0=北，90=东，180=南） */
  sunAzimuth: number;
  /** Mie scattering coefficient (affects sun halo). / 米氏散射系数（影响太阳光晕） */
  mieCoefficient: number;
  /** Mie scattering directional factor (-1 to 1, affects sun disc size). / 米氏散射方向因子（-1到1，影响太阳盘大小） */
  mieDirectionalG: number;
  /** Bloom threshold for sun glare. / 太阳光晕的泛光阈值 */
  bloomThreshold: number;
  /** Bloom strength/intensity. / 泛光强度 */
  bloomStrength: number;
  /** Bloom radius/spread. / 泛光半径/扩散 */
  bloomRadius: number;
  /** Enable bloom post-processing. / 启用泛光后处理 */
  bloomEnabled: boolean;
  /** Enable lens flare effect (sprite-based). / 启用镜头光斑效果（基于 sprite） */
  lensflareEnabled: boolean;
  /** Lens flare size multiplier. / 镜头光斑大小倍数 */
  lensflareSize: number;
  /** Sun disc size in meters (radius at 1500m distance). / 太阳圆盘大小（米，在 1500m 距离处的半径） */
  sunSize: number;
  /** Enable god rays (light shaft) effect. / 启用上帝光线（光束）效果 */
  godRaysEnabled: boolean;
  /** God rays weight/intensity (0-1). / 上帝光线权重/强度 (0-1) */
  godRaysWeight: number;
  /** God rays decay factor (0-1). / 上帝光线衰减因子 (0-1) */
  godRaysDecay: number;
  /** God rays exposure multiplier. / 上帝光线曝光倍数 */
  godRaysExposure: number;
  /** Star brightness (0-2). / 星星亮度 (0-2) */
  starBrightness: number;
  /** Night light intensity (0-2). Cool-toned moonlight for night visibility. / 夜光强度 (0-2)，冷色调月光用于夜间可见度 */
  nightLightIntensity: number;
}

/**
 * Default sky settings for a clear midday sky.
 * 晴朗正午天空的默认设置
 */
export function createDefaultSkySettings(): SkySettings {
  return {
    sunElevation: 45,
    sunAzimuth: 180,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    bloomThreshold: 0.85,
    bloomStrength: 0.4,
    bloomRadius: 0.3,
    bloomEnabled: true,
    lensflareEnabled: true,
    lensflareSize: 1.0,
    sunSize: 15,
    godRaysEnabled: true,
    godRaysWeight: 0.5,
    godRaysDecay: 0.95,
    godRaysExposure: 3.0,
    starBrightness: 1.2,
    nightLightIntensity: 1.0,
  };
}

/**
 * Calculate sun position from time of day.
 * 根据一天中的时间计算太阳位置
 *
 * @param timeOfDay - Hours (0-24), where 12 = noon (sun at highest).
 * @param latitude - Latitude in degrees (default 45° for temperate zone).
 * @returns Sun elevation and azimuth angles in degrees.
 */
export function timeToSunPosition(
  timeOfDay: number,
  latitude: number = 45
): { elevation: number; azimuth: number } {
  // Normalize time to 0-24 range.
  // 将时间标准化到 0-24 范围
  const t = ((timeOfDay % 24) + 24) % 24;

  // Solar hour angle: 0 at noon, -180 at midnight, +/-90 at 6am/6pm.
  // 太阳时角：正午为0，午夜为-180，早6点/晚6点为 +/-90
  const hourAngle = (t - 12) * 15; // 15° per hour

  // Simplified sun position calculation (assumes equinox, declination = 0).
  // 简化的太阳位置计算（假设春分/秋分，赤纬 = 0）
  const latRad = (latitude * Math.PI) / 180;
  const haRad = (hourAngle * Math.PI) / 180;

  // Calculate elevation (altitude) angle.
  // 计算仰角（高度角）
  // sin(elevation) = sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(ha)
  // At equinox, dec = 0, so: sin(elevation) = cos(lat) * cos(ha)
  const sinElevation = Math.cos(latRad) * Math.cos(haRad);
  const elevation = Math.asin(sinElevation) * (180 / Math.PI);

  // Calculate azimuth using a simpler approach:
  // Sun travels from east (90°) through south (180°) to west (270°).
  // At noon (t=12), sun is at south (180°).
  // Linear interpolation: azimuth = 90 + (t / 24) * 360, wrapped.
  // 使用更简单的方法计算方位角：
  // 太阳从东(90°)经南(180°)到西(270°)移动
  // 正午(t=12)太阳在南方(180°)
  // 线性插值: azimuth = 90 + (t / 24) * 360
  const azimuth = (90 + (t / 24) * 360) % 360;

  // Clamp elevation (sun below horizon = night).
  // 限制仰角（太阳在地平线下 = 夜晚）
  const clampedElevation = Math.max(-90, elevation); // Allow full negative for night

  return {
    elevation: clampedElevation,
    azimuth,
  };
}

/**
 * Calculate day factor from sun elevation.
 * 根据太阳仰角计算白天因子
 *
 * @param sunElevation - Sun elevation in degrees.
 * @returns Day factor (0 = full night, 1 = full day).
 */
function calculateDayFactor(sunElevation: number): number {
  // Civil twilight: sun at -6° to 0°
  // Nautical twilight: sun at -12° to -6°
  // Astronomical twilight: sun at -18° to -12°
  // Night: sun below -18°
  // 民用曙暮光：太阳在 -6° 到 0°
  // 航海曙暮光：太阳在 -12° 到 -6°
  // 天文曙暮光：太阳在 -18° 到 -12°
  // 夜晚：太阳在 -18° 以下

  if (sunElevation >= 10) {
    // Full daylight.
    // 完全白天
    return 1.0;
  } else if (sunElevation >= 0) {
    // Dawn/dusk transition.
    // 黎明/黄昏过渡
    return 0.7 + (sunElevation / 10) * 0.3;
  } else if (sunElevation >= -6) {
    // Civil twilight.
    // 民用曙暮光
    return 0.3 + ((sunElevation + 6) / 6) * 0.4;
  } else if (sunElevation >= -12) {
    // Nautical twilight.
    // 航海曙暮光
    return 0.1 + ((sunElevation + 12) / 6) * 0.2;
  } else if (sunElevation >= -18) {
    // Astronomical twilight.
    // 天文曙暮光
    return ((sunElevation + 18) / 6) * 0.1;
  } else {
    // Full night.
    // 完全夜晚
    return 0.0;
  }
}

/**
 * Calculate sun color based on elevation (redder at horizon).
 * 根据仰角计算太阳颜色（地平线更红）
 */
function calculateSunColor(sunElevation: number): Color {
  const color = new Color();

  if (sunElevation < -6) {
    // Night: dim blue-white (moonlight-ish).
    // 夜晚：暗淡的蓝白色（类似月光）
    color.setRGB(0.3, 0.35, 0.5);
  } else if (sunElevation < 0) {
    // Deep twilight: purple-orange.
    // 深曙暮光：紫橙色
    const t = (sunElevation + 6) / 6;
    color.setRGB(
      0.3 + t * 0.7, // R: 0.3 → 1.0
      0.35 + t * 0.15, // G: 0.35 → 0.5
      0.5 - t * 0.3 // B: 0.5 → 0.2
    );
  } else if (sunElevation < 10) {
    // Sunrise/sunset: deep red-orange to orange.
    // 日出/日落：深红橙到橙色
    const t = sunElevation / 10;
    color.setRGB(
      1.0, // R: always max
      0.5 + t * 0.35, // G: 0.5 → 0.85
      0.2 + t * 0.5 // B: 0.2 → 0.7
    );
  } else if (sunElevation < 30) {
    // Morning/evening: orange to warm white.
    // 早晨/傍晚：橙色到暖白色
    const t = (sunElevation - 10) / 20;
    color.setRGB(
      1.0, // R: always max
      0.85 + t * 0.1, // G: 0.85 → 0.95
      0.7 + t * 0.2 // B: 0.7 → 0.9
    );
  } else {
    // Midday: warm white.
    // 正午：暖白色
    color.setRGB(1.0, 0.95, 0.9);
  }

  return color;
}

/**
 * Calculate directional light color and intensity based on sun elevation.
 * 根据太阳仰角计算方向光颜色和强度
 */
function calculateLightSettings(sunElevation: number): {
  color: Color;
  intensity: number;
} {
  const color = new Color();
  let intensity: number;

  if (sunElevation < -12) {
    // Deep night: very dim blue.
    // 深夜：非常暗的蓝色
    color.setRGB(0.1, 0.12, 0.2);
    intensity = 0.02;
  } else if (sunElevation < -6) {
    // Nautical twilight.
    // 航海曙暮光
    const t = (sunElevation + 12) / 6;
    color.setRGB(0.1 + t * 0.3, 0.12 + t * 0.2, 0.2 + t * 0.1);
    intensity = 0.02 + t * 0.05;
  } else if (sunElevation < 0) {
    // Civil twilight: dim orange-pink.
    // 民用曙暮光：暗淡的橙粉色
    const t = (sunElevation + 6) / 6;
    color.setRGB(0.4 + t * 0.5, 0.32 + t * 0.18, 0.3 - t * 0.1);
    intensity = 0.07 + t * 0.15;
  } else if (sunElevation < 10) {
    // Golden hour: warm orange.
    // 黄金时刻：暖橙色
    const t = sunElevation / 10;
    color.setRGB(0.9 + t * 0.1, 0.5 + t * 0.35, 0.2 + t * 0.4);
    intensity = 0.22 + t * 0.25;
  } else if (sunElevation < 30) {
    // Morning/afternoon: warming up.
    // 上午/下午：变暖
    const t = (sunElevation - 10) / 20;
    color.setRGB(1.0, 0.85 + t * 0.1, 0.6 + t * 0.25);
    intensity = 0.47 + t * 0.15;
  } else {
    // Midday: bright warm white.
    // 正午：明亮的暖白色
    const t = Math.min(1, (sunElevation - 30) / 60);
    color.setRGB(1.0, 0.95 + t * 0.05, 0.85 + t * 0.1);
    intensity = 0.62 + t * 0.08;
  }

  return { color, intensity };
}

/**
 * Sky system with physical atmosphere, stars, Milky Way, and post-processing.
 * 带物理大气、星星、银河和后处理的天空系统
 */
export class SkySystem {
  private skyDome: SkyDome;
  private sunDisc: Mesh;
  private sunMaterial: MeshBasicNodeMaterial;
  private sunColorUniform = uniform(new Color(1.0, 0.95, 0.8));
  private sunBrightnessUniform = uniform(1.0);
  private postProcessing: PostProcessing | null = null;
  private bloomPass: ReturnType<typeof bloom> | null = null;
  private sunPosition = new Vector3();
  private settings: SkySettings;
  private directionalLight: DirectionalLight | null = null;
  private nightLight: AmbientLight; // Cool-toned night light / 冷色调夜光
  private scene: Scene;
  private lensflare: LensflareMesh | null = null;
  private camera: PerspectiveCamera | null = null;
  // God rays uniforms for runtime updates.
  // 上帝光线 uniform 用于运行时更新
  private godRaysCenterUniform = uniform(vec2(0.5, 0.5));
  private godRaysWeightUniform = uniform(0.5);
  private godRaysDecayUniform = uniform(0.95);
  private godRaysExposureUniform = uniform(3.0);
  private godRaysEnabledUniform = uniform(1.0);
  private godRaysPass: ReturnType<typeof radialBlur> | null = null;

  constructor(scene: Scene, settings?: Partial<SkySettings>) {
    this.settings = { ...createDefaultSkySettings(), ...settings };
    this.scene = scene;

    // Create cool-toned night light (moonlight/starlight ambient).
    // 创建冷色调夜光（月光/星光环境光）
    // Color: cool blue-white like moonlight (approximate 4100K color temperature).
    // 颜色：像月光一样的冷蓝白色（约 4100K 色温）
    this.nightLight = new AmbientLight(0x4466aa, 0);
    scene.add(this.nightLight);

    // Create procedural sky dome with stars and atmosphere.
    // 创建带星星和大气的程序化天空穹顶
    this.skyDome = new SkyDome();
    this.skyDome.addToScene(scene);

    // Create a visible sun disc that follows the sun position.
    // 创建跟随太阳位置的可见太阳圆盘
    // Sun disc at 1500m (within camera far plane of 2000m).
    // 太阳圆盘在 1500m 处（在相机远平面 2000m 内）
    const sunGeometry = new SphereGeometry(this.settings.sunSize, 32, 32);
    this.sunMaterial = new MeshBasicNodeMaterial({
      side: FrontSide,
    });
    // Sun color multiplied by brightness uniform for dynamic control.
    // 太阳颜色乘以亮度 uniform 以实现动态控制
    this.sunMaterial.colorNode = vec3(this.sunColorUniform).mul(float(this.sunBrightnessUniform));
    this.sunDisc = new Mesh(sunGeometry, this.sunMaterial);
    this.sunDisc.name = "sun-disc";

    // Create lens flare for sun (sprite-based, realistic camera effect).
    // 为太阳创建镜头光斑（基于 sprite，真实的相机效果）
    this.initLensflare();

    // Apply initial settings.
    // 应用初始设置
    this.updateSunPosition();

    scene.add(this.sunDisc);
  }

  /**
   * Initialize lens flare effect.
   * 初始化镜头光斑效果
   */
  private initLensflare(): void {
    const textureLoader = new TextureLoader();

    // Create procedural ghost flare texture (for secondary flares).
    // 创建程序化鬼影光斑纹理（用于次级光斑）
    const ghostCanvas = document.createElement("canvas");
    ghostCanvas.width = 64;
    ghostCanvas.height = 64;
    const ghostCtx = ghostCanvas.getContext("2d")!;
    const ghostGradient = ghostCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    ghostGradient.addColorStop(0, "rgba(100, 150, 255, 0.4)");
    ghostGradient.addColorStop(0.5, "rgba(100, 150, 255, 0.1)");
    ghostGradient.addColorStop(1, "rgba(100, 150, 255, 0)");
    ghostCtx.fillStyle = ghostGradient;
    ghostCtx.fillRect(0, 0, 64, 64);

    const ghostTexture = textureLoader.load(ghostCanvas.toDataURL());

    // Create lensflare mesh.
    // 创建镜头光斑网格
    this.lensflare = new LensflareMesh();

    // Note: We skip adding element at position 0 since sunDisc already provides the sun visual.
    // 注意：不在位置 0 添加元素，因为 sunDisc 已经提供了太阳视觉效果

    // Secondary flares (ghosts) at various distances from center.
    // 次级光斑（鬼影）在不同距离处
    this.lensflare.addElement(
      new LensflareElement(ghostTexture, 60, 0.3, new Color(0.7, 0.8, 1.0))
    );
    this.lensflare.addElement(
      new LensflareElement(ghostTexture, 80, 0.5, new Color(0.6, 0.7, 1.0))
    );
    this.lensflare.addElement(
      new LensflareElement(ghostTexture, 100, 0.7, new Color(0.5, 0.6, 1.0))
    );
    this.lensflare.addElement(
      new LensflareElement(ghostTexture, 50, 0.9, new Color(0.4, 0.5, 0.8))
    );
    this.lensflare.addElement(
      new LensflareElement(ghostTexture, 70, 1.0, new Color(0.3, 0.4, 0.7))
    );

    // Add to sun disc so it follows sun position.
    // 添加到太阳圆盘以跟随太阳位置
    this.sunDisc.add(this.lensflare);

    // Apply initial visibility.
    // 应用初始可见性
    this.lensflare.visible = this.settings.lensflareEnabled;
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
    this.postProcessing = new PostProcessing(renderer);
    this.camera = camera;

    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode("output");

    // Bloom for sun glare effect.
    // 太阳光晕的泛光效果
    this.bloomPass = bloom(scenePassColor);
    this.applyBloomSettings();

    // God rays (radial blur from sun position).
    // 上帝光线（从太阳位置的径向模糊）
    this.godRaysWeightUniform.value = this.settings.godRaysWeight;
    this.godRaysDecayUniform.value = this.settings.godRaysDecay;
    this.godRaysExposureUniform.value = this.settings.godRaysExposure;
    this.godRaysEnabledUniform.value = this.settings.godRaysEnabled ? 1.0 : 0.0;

    // Apply radial blur to bloom pass (blurs the bright sun glow outward).
    // 对泛光 pass 应用径向模糊（将明亮的太阳光晕向外模糊）
    this.godRaysPass = radialBlur(this.bloomPass, {
      center: this.godRaysCenterUniform,
      weight: this.godRaysWeightUniform,
      decay: this.godRaysDecayUniform,
      exposure: this.godRaysExposureUniform,
    });

    // Combine: scene + bloom + god rays (when enabled).
    // 合成：场景 + 泛光 + 上帝光线（启用时）
    const godRaysContribution = this.godRaysPass.mul(this.godRaysEnabledUniform);
    this.postProcessing.outputNode = scenePassColor
      .add(this.bloomPass)
      .add(godRaysContribution);

    // Update sun screen position for god rays center.
    // 更新太阳屏幕位置作为上帝光线中心
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

    // Check what changed and update accordingly.
    // 检查变化并相应更新
    if (
      newSettings.sunElevation !== undefined ||
      newSettings.sunAzimuth !== undefined
    ) {
      this.updateSunPosition();
    }

    if (
      newSettings.bloomThreshold !== undefined ||
      newSettings.bloomStrength !== undefined ||
      newSettings.bloomRadius !== undefined ||
      newSettings.bloomEnabled !== undefined
    ) {
      this.applyBloomSettings();
    }

    // Update lens flare visibility.
    // 更新镜头光斑可见性
    if (newSettings.lensflareEnabled !== undefined && this.lensflare) {
      this.lensflare.visible = newSettings.lensflareEnabled;
    }

    // Update sun disc size via scale.
    // 通过缩放更新太阳圆盘大小
    if (newSettings.sunSize !== undefined) {
      const scale = newSettings.sunSize / 15; // Base geometry is radius 15
      this.sunDisc.scale.setScalar(scale);
    }

    // Update god rays settings.
    // 更新上帝光线设置
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

    // Update star brightness.
    // 更新星星亮度
    if (newSettings.starBrightness !== undefined) {
      this.skyDome.setStarBrightness(newSettings.starBrightness);
    }

    // Update night light intensity.
    // 更新夜光强度
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
   * Render with post-processing (call this instead of renderer.render()).
   * 使用后处理渲染（调用此方法而非 renderer.render()）
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
  shouldUsePostProcessing(): boolean {
    return this.postProcessing !== null && this.settings.bloomEnabled;
  }

  private applyBloomSettings(): void {
    if (this.bloomPass) {
      this.bloomPass.threshold.value = this.settings.bloomThreshold;
      this.bloomPass.strength.value = this.settings.bloomStrength;
      this.bloomPass.radius.value = this.settings.bloomRadius;
    }
  }

  private updateSunPosition(): void {
    // Convert elevation/azimuth to spherical coordinates.
    // 将仰角/方位角转换为球面坐标
    const phi = MathUtils.degToRad(90 - this.settings.sunElevation);
    const theta = MathUtils.degToRad(this.settings.sunAzimuth);

    this.sunPosition.setFromSphericalCoords(1, phi, theta);

    // Update sky dome sun direction.
    // 更新天空穹顶太阳方向
    this.skyDome.setSunDirection(
      this.sunPosition.x,
      this.sunPosition.y,
      this.sunPosition.z
    );

    // Calculate and set day factor based on sun elevation.
    // 根据太阳仰角计算并设置白天因子
    const dayFactor = calculateDayFactor(this.settings.sunElevation);
    this.skyDome.setDayFactor(dayFactor);

    // Position sun disc at 1500m (within camera far plane).
    // 将太阳圆盘放置在 1500m 处（在相机远平面内）
    this.sunDisc.position.copy(this.sunPosition).multiplyScalar(1500);

    // Scale and brightness based on elevation.
    // 根据仰角调整大小和亮度
    const elev = this.settings.sunElevation;
    const baseScale = this.settings.sunSize / 15;
    
    // Sun scale: constant size for realistic appearance.
    // 太阳大小：保持恒定大小以获得真实外观
    this.sunDisc.scale.setScalar(baseScale);

    // Brightness: HDR values for bloom effect.
    // 亮度：HDR 值用于泛光效果
    // High above horizon: very bright (bloom). Near horizon: still bright but warmer.
    // 地平线上方高处：非常亮（泛光）。接近地平线：仍然亮但更暖
    let brightnessFactor: number;
    if (elev >= 20) {
      brightnessFactor = 8.0;
    } else if (elev >= 5) {
      // Transition zone: still very bright.
      // 过渡区：仍然非常亮
      brightnessFactor = 5.0 + ((elev - 5) / 15) * 3.0;
    } else if (elev >= 0) {
      // Near horizon: bright orange/red sun.
      // 接近地平线：明亮的橙红色太阳
      brightnessFactor = 3.0 + (elev / 5) * 2.0;
    } else {
      // Below horizon: fade out.
      // 地平线以下：淡出
      brightnessFactor = Math.max(0.5, 3.0 + elev * 0.5);
    }
    this.sunBrightnessUniform.value = brightnessFactor;

    // Hide sun disc only when below horizon.
    // 仅当在地平线以下时隐藏太阳圆盘
    this.sunDisc.visible = elev > -0.5;

    // Update sun color based on elevation (redder at horizon).
    // 根据仰角更新太阳颜色（地平线附近更红）
    const sunColor = calculateSunColor(this.settings.sunElevation);
    this.sunColorUniform.value.copy(sunColor);

    // Update directional light position and color if linked.
    // 如果链接了方向光则更新其位置和颜色
    if (this.directionalLight) {
      // Scale sun position for world-space light direction.
      // 缩放太阳位置用于世界空间光方向
      this.directionalLight.position.copy(this.sunPosition).multiplyScalar(1000);

      // Update light color and intensity.
      // 更新光照颜色和强度
      const lightSettings = calculateLightSettings(this.settings.sunElevation);
      this.directionalLight.color.copy(lightSettings.color);
      this.directionalLight.intensity = lightSettings.intensity;
    }

    // Update lens flare visibility based on sun elevation.
    // 根据太阳仰角更新镜头光斑可见性
    if (this.lensflare) {
      this.lensflare.visible =
        this.settings.lensflareEnabled && this.settings.sunElevation > -2;
    }

    // Update god rays center to follow sun.
    // 更新上帝光线中心以跟随太阳
    this.updateGodRaysCenter();

    // Update night light for day/night cycle.
    // 更新夜光以适应昼夜循环
    this.updateNightLight();
  }

  /**
   * Update god rays center based on sun screen position.
   * 根据太阳屏幕位置更新上帝光线中心
   */
  private updateGodRaysCenter(): void {
    if (!this.camera) return;

    // Project sun position to screen space (NDC).
    // 将太阳位置投影到屏幕空间 (NDC)
    const sunWorldPos = this.sunDisc.position.clone();
    sunWorldPos.project(this.camera);

    // Convert from NDC (-1 to 1) to UV (0 to 1).
    // 从 NDC (-1 到 1) 转换到 UV (0 到 1)
    const screenX = (sunWorldPos.x + 1) / 2;
    const screenY = (sunWorldPos.y + 1) / 2;

    this.godRaysCenterUniform.value.x = screenX;
    this.godRaysCenterUniform.value.y = screenY;
  }

  /**
   * Update per-frame state (call in render loop).
   * 更新每帧状态（在渲染循环中调用）
   */
  update(): void {
    // Keep sky dome centered on camera so it always surrounds the viewer.
    // 保持天空穹顶以相机为中心，始终包围观察者
    if (this.camera) {
      this.skyDome.mesh.position.copy(this.camera.position);
      // Also move sun disc with camera.
      // 太阳圆盘也跟随相机移动
      this.sunDisc.position.copy(this.camera.position).add(
        this.sunPosition.clone().multiplyScalar(1500)
      );
      // Update lens flare position.
      // 更新镜头光斑位置
      if (this.lensflare) {
        this.lensflare.position.copy(this.sunDisc.position);
      }
    }

    // Update god rays center to track sun position on screen.
    // 更新上帝光线中心以跟踪太阳在屏幕上的位置
    this.updateGodRaysCenter();
  }

  /**
   * Get the current sun direction vector (normalized).
   * 获取当前太阳方向向量（归一化）
   */
  getSunDirection(): Vector3 {
    return this.sunPosition.clone();
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
   * @param projectPath - Path to the project folder.
   */
  async loadStarTexture(projectPath: string): Promise<void> {
    const texturePath = `${projectPath}/assets/textures/starry_4k.exr`;
    
    // Use Tauri's convertFileSrc to get proper URL for local files.
    // 使用 Tauri 的 convertFileSrc 获取本地文件的正确 URL
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const fileUrl = convertFileSrc(texturePath);
    
    return new Promise((resolve) => {
      const loader = new EXRLoader();
      loader.load(
        fileUrl,
        (tex) => {
          // Configure texture for equirectangular mapping.
          // 配置纹理用于等距柱状投影映射
          tex.minFilter = LinearFilter;
          tex.magFilter = LinearFilter;
          // EXR is already linear, no color space conversion needed for HDR.
          // EXR 已经是线性的，HDR 不需要颜色空间转换
          
          this.skyDome.setStarTexture(tex);
          console.log("Star texture loaded:", texturePath);
          resolve();
        },
        undefined,
        (error) => {
          console.warn("Failed to load star texture:", texturePath, error);
          // Don't reject - just use fallback gradient sky.
          // 不拒绝 - 只使用后备渐变天空
          resolve();
        }
      );
    });
  }

  /**
   * Update night light intensity based on time of day.
   * 根据一天中的时间更新夜光强度
   */
  private updateNightLight(): void {
    const elev = this.settings.sunElevation;
    const maxIntensity = this.settings.nightLightIntensity;
    
    // Night light: off during day, gradually on at night.
    // 夜光：白天关闭，夜晚逐渐开启
    // Day (elev > 5): off (0)
    // 白天 (elev > 5): 关闭 (0)
    // Twilight (elev -15 to 5): smooth transition
    // 黄昏 (elev -15 到 5): 平滑过渡
    // Night (elev < -15): full intensity
    // 夜晚 (elev < -15): 完整强度
    let intensity: number;
    if (elev > 5) {
      intensity = 0;
    } else if (elev > -15) {
      // Smooth transition from 0 to maxIntensity.
      // 从 0 平滑过渡到最大强度
      const t = (5 - elev) / 20; // 0 at 5, 1 at -15
      intensity = maxIntensity * t;
    } else {
      // Full night.
      // 深夜
      intensity = maxIntensity;
    }

    this.nightLight.intensity = intensity;
  }

  dispose(): void {
    this.skyDome.dispose();
    this.skyDome.removeFromScene(this.scene);
    this.sunDisc.geometry.dispose();
    this.sunMaterial.dispose();
    if (this.lensflare) {
      this.lensflare.dispose();
    }
    this.scene.remove(this.sunDisc);
    this.scene.remove(this.nightLight);
    this.postProcessing = null;
    this.bloomPass = null;
    this.godRaysPass = null;
    this.camera = null;
  }
}
