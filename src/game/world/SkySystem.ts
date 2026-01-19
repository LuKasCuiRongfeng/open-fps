// SkySystem: Physical sky with sun, clouds, and atmosphere.
// SkySystem：带太阳、云和大气的物理天空

import {
  Color,
  FrontSide,
  MathUtils,
  Mesh,
  MeshBasicNodeMaterial,
  PostProcessing,
  SphereGeometry,
  TextureLoader,
  Vector3,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
  type DirectionalLight,
} from "three/webgpu";
import { pass, uniform, vec3, vec2 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { radialBlur } from "three/addons/tsl/display/radialBlur.js";
import { SkyMesh } from "three/addons/objects/SkyMesh.js";
import { LensflareMesh, LensflareElement } from "three/addons/objects/LensflareMesh.js";

/**
 * Sky system settings for runtime adjustment.
 * 天空系统运行时调整设置
 */
export interface SkySettings {
  /** Sun elevation angle in degrees (0 = horizon, 90 = overhead). / 太阳仰角（度，0=地平线，90=头顶） */
  sunElevation: number;
  /** Sun azimuth angle in degrees (0 = north, 90 = east, 180 = south). / 太阳方位角（度，0=北，90=东，180=南） */
  sunAzimuth: number;
  /** Atmospheric turbidity (2 = clear, 10 = hazy). / 大气浊度（2=清澈，10=雾霾） */
  turbidity: number;
  /** Rayleigh scattering coefficient (affects blue sky color). / 瑞利散射系数（影响蓝天颜色） */
  rayleigh: number;
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
}

/**
 * Default sky settings for a clear midday sky.
 * 晴朗正午天空的默认设置
 */
export function createDefaultSkySettings(): SkySettings {
  return {
    sunElevation: 45,
    sunAzimuth: 180,
    turbidity: 10,
    rayleigh: 2,
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
export function timeToSunPosition(timeOfDay: number, latitude: number = 45): { elevation: number; azimuth: number } {
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
  const clampedElevation = Math.max(-10, elevation); // Allow slight negative for twilight

  return {
    elevation: clampedElevation,
    azimuth,
  };
}

/**
 * Sky system with physical atmosphere, sun, clouds, and bloom effects.
 * 带物理大气、太阳、云和泛光效果的天空系统
 */
export class SkySystem {
  private sky: SkyMesh;
  private sunDisc: Mesh;
  private sunMaterial: MeshBasicNodeMaterial;
  private sunColorUniform = uniform(new Color(1.0, 0.95, 0.8));
  private postProcessing: PostProcessing | null = null;
  private bloomPass: ReturnType<typeof bloom> | null = null;
  private sunPosition = new Vector3();
  private settings: SkySettings;
  private directionalLight: DirectionalLight | null = null;
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

    // Create sky mesh with massive scale to encompass the world.
    // 创建超大比例的天空网格以包围世界
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(50000);
    this.sky.name = "sky-mesh";

    // Create a visible sun disc that follows the sun position.
    // 创建跟随太阳位置的可见太阳圆盘
    // Sun disc at 1500m (within camera far plane of 2000m).
    // 太阳圆盘在 1500m 处（在相机远平面 2000m 内）
    const sunGeometry = new SphereGeometry(this.settings.sunSize, 32, 32);
    this.sunMaterial = new MeshBasicNodeMaterial({
      side: FrontSide,
    });
    // Bright emissive sun color for bloom effect.
    // 用于泛光效果的明亮发光太阳颜色
    this.sunMaterial.colorNode = vec3(this.sunColorUniform).mul(5.0);
    this.sunDisc = new Mesh(sunGeometry, this.sunMaterial);
    this.sunDisc.name = "sun-disc";

    // Create lens flare for sun (sprite-based, realistic camera effect).
    // 为太阳创建镜头光斑（基于 sprite，真实的相机效果）
    this.initLensflare();

    // Apply initial settings.
    // 应用初始设置
    this.applyAtmosphereSettings();
    this.updateSunPosition();

    scene.add(this.sky);
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
    this.lensflare.addElement(new LensflareElement(ghostTexture, 60, 0.3, new Color(0.7, 0.8, 1.0)));
    this.lensflare.addElement(new LensflareElement(ghostTexture, 80, 0.5, new Color(0.6, 0.7, 1.0)));
    this.lensflare.addElement(new LensflareElement(ghostTexture, 100, 0.7, new Color(0.5, 0.6, 1.0)));
    this.lensflare.addElement(new LensflareElement(ghostTexture, 50, 0.9, new Color(0.4, 0.5, 0.8)));
    this.lensflare.addElement(new LensflareElement(ghostTexture, 70, 1.0, new Color(0.3, 0.4, 0.7)));
    
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
  initPostProcessing(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera): void {
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
    this.postProcessing.outputNode = scenePassColor.add(this.bloomPass).add(godRaysContribution);

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
      newSettings.turbidity !== undefined ||
      newSettings.rayleigh !== undefined ||
      newSettings.mieCoefficient !== undefined ||
      newSettings.mieDirectionalG !== undefined
    ) {
      this.applyAtmosphereSettings();
    }

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

  private applyAtmosphereSettings(): void {
    this.sky.turbidity.value = this.settings.turbidity;
    this.sky.rayleigh.value = this.settings.rayleigh;
    this.sky.mieCoefficient.value = this.settings.mieCoefficient;
    this.sky.mieDirectionalG.value = this.settings.mieDirectionalG;
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
    this.sky.sunPosition.value.copy(this.sunPosition);

    // Position sun disc at 1500m (within camera far plane).
    // 将太阳圆盘放置在 1500m 处（在相机远平面内）
    this.sunDisc.position.copy(this.sunPosition).multiplyScalar(1500);

    // Update sun color based on elevation (redder at horizon).
    // 根据仰角更新太阳颜色（地平线附近更红）
    const elevationFactor = Math.max(0, this.settings.sunElevation / 90);
    const r = 1.0;
    const g = 0.7 + elevationFactor * 0.25;
    const b = 0.4 + elevationFactor * 0.5;
    this.sunColorUniform.value.setRGB(r, g, b);

    // Update directional light position if linked.
    // 如果链接了方向光则更新其位置
    if (this.directionalLight) {
      // Scale sun position for world-space light direction.
      // 缩放太阳位置用于世界空间光方向
      this.directionalLight.position.copy(this.sunPosition).multiplyScalar(1000);
    }

    // Update god rays center to follow sun.
    // 更新上帝光线中心以跟随太阳
    this.updateGodRaysCenter();
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

  dispose(): void {
    this.sky.geometry.dispose();
    if (this.sky.material) {
      // SkyMesh material disposal.
      // SkyMesh 材质释放
      if ("dispose" in this.sky.material) {
        (this.sky.material as { dispose: () => void }).dispose();
      }
    }
    this.sunDisc.geometry.dispose();
    this.sunMaterial.dispose();
    if (this.lensflare) {
      this.lensflare.dispose();
    }
    this.scene.remove(this.sunDisc);
    this.postProcessing = null;
    this.bloomPass = null;
    this.godRaysPass = null;
    this.camera = null;
  }
}
