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
import { pass, uniform, vec3 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
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
    // Sun disc at 1500m (within camera far plane of 2000m), radius ~15m for proper angular size.
    // 太阳圆盘在 1500m 处（在相机远平面 2000m 内），半径约 15m 以获得合适的视角大小
    const sunGeometry = new SphereGeometry(15, 32, 32);
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
    
    // Create procedural flare textures (gradients).
    // 创建程序化光斑纹理（渐变）
    const flareCanvas = document.createElement("canvas");
    flareCanvas.width = 256;
    flareCanvas.height = 256;
    const ctx = flareCanvas.getContext("2d")!;
    
    // Main sun flare (large bright center).
    // 主太阳光斑（大亮中心）
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "rgba(255, 255, 220, 1)");
    gradient.addColorStop(0.1, "rgba(255, 240, 180, 0.8)");
    gradient.addColorStop(0.3, "rgba(255, 200, 100, 0.3)");
    gradient.addColorStop(0.6, "rgba(255, 150, 50, 0.1)");
    gradient.addColorStop(1, "rgba(255, 100, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    
    // Create texture from canvas.
    // 从 canvas 创建纹理
    const flareTexture = textureLoader.load(flareCanvas.toDataURL());
    
    // Secondary flare (smaller, for ghost effect).
    // 次级光斑（较小，用于鬼影效果）
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
    
    // Main sun flare at the light source.
    // 光源处的主太阳光斑
    this.lensflare.addElement(new LensflareElement(flareTexture, 512, 0, new Color(1.0, 0.95, 0.8)));
    
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

    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode("output");

    // Bloom for sun glare effect.
    // 太阳光晕的泛光效果
    this.bloomPass = bloom(scenePassColor);
    this.applyBloomSettings();

    // Combine scene with bloom only (lens flare/anamorphic disabled for now - need tuning).
    // 仅合成场景与泛光（镜头光斑/变形暂时禁用 - 需要调优）
    this.postProcessing.outputNode = scenePassColor.add(this.bloomPass);
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
  }
}
