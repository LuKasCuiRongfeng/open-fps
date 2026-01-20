// SkyShader: GPU sky with texture-based starfield and procedural atmosphere.
// SkyShader：GPU 天空，带纹理星空和程序化大气

import {
  BackSide,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
  type Texture,
} from "three/webgpu";
import {
  Fn,
  atan,
  dot,
  float,
  max,
  mix,
  normalize,
  positionLocal,
  pow,
  smoothstep,
  uniform,
  vec3,
  vec4,
  vec2,
  add,
  mul,
  texture,
  asin,
} from "three/tsl";

/**
 * Sky dome mesh with texture-based starfield and procedural atmosphere.
 * 天空穹顶网格，带纹理星空和程序化大气
 */
export class SkyDome {
  readonly mesh: Mesh;
  private material: MeshBasicNodeMaterial;

  // Uniforms for runtime control.
  // 运行时控制的 uniforms
  private sunDirUniform = uniform(new Vector3(0, 1, 0));
  private dayFactorUniform = uniform(1.0);
  private starBrightnessUniform = uniform(1.2);
  
  // Star texture (stored for material rebuild).
  // 星空纹理（存储用于材质重建）
  private starTexture: Texture | null = null;

  constructor() {
    this.material = this.createMaterial();

    // Create sky sphere. Radius must be less than camera far plane (2000m).
    // 创建天空球。半径必须小于相机远平面（2000m）
    const geometry = new SphereGeometry(1800, 64, 32);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = "sky-dome";
    this.mesh.frustumCulled = false;
  }
  
  /**
   * Set the star texture (equirectangular HDR).
   * 设置星空纹理（等距柱状投影 HDR）
   */
  setStarTexture(tex: Texture): void {
    this.starTexture = tex;
    // Rebuild material to use the texture.
    // 重建材质以使用纹理
    this.material.dispose();
    this.material = this.createMaterial();
    this.mesh.material = this.material;
  }

  private createMaterial(): MeshBasicNodeMaterial {
    const material = new MeshBasicNodeMaterial({
      side: BackSide,
      depthWrite: false,
    });

    // Capture uniforms and texture for use in shader.
    // 捕获 uniforms 和纹理供着色器使用
    const sunDirUniform = this.sunDirUniform;
    const dayFactorUniform = this.dayFactorUniform;
    const starBrightnessUniform = this.starBrightnessUniform;
    const starTex = this.starTexture;

    material.colorNode = Fn(() => {
      // Get view direction from local position (sky sphere centered at origin).
      // 从本地位置获取视线方向（天空球以原点为中心）
      const viewDir = normalize(positionLocal);

      // Get uniform values.
      // 获取 uniform 值
      const sunDir = normalize(vec3(sunDirUniform));
      const dayFactor = float(dayFactorUniform);
      const starBrightness = float(starBrightnessUniform);

      // Zenith factor (0 at horizon, 1 at top).
      // 天顶因子（地平线处为0，顶部为1）
      const zenith = max(0.0, viewDir.y);

      // ==========================================
      // NIGHT SKY: Texture-based starfield or gradient fallback
      // 夜空：基于纹理的星空或渐变后备
      // ==========================================
      
      // Fallback: simple dark sky gradient when no texture.
      // 后备：没有纹理时使用简单的深色天空渐变
      const nightHorizon = vec3(0.01, 0.015, 0.03);
      const nightZenith = vec3(0.02, 0.03, 0.06);
      const nightGradient = mix(nightHorizon, nightZenith, pow(zenith, 0.5));
      
      // Night sky: use texture if available, otherwise gradient.
      // 夜空：如果有纹理则使用，否则使用渐变
      let nightSky;
      if (starTex) {
        // Convert view direction to equirectangular UV coordinates.
        // 将视线方向转换为等距柱状投影 UV 坐标
        // u = atan(z, x) / (2*PI) + 0.5  (0-1, wraps around)
        // v = asin(y) / PI + 0.5  (0-1, bottom to top)
        const u = add(mul(atan(viewDir.z, viewDir.x), 1.0 / (2.0 * Math.PI)), 0.5);
        const v = add(mul(asin(viewDir.y), 1.0 / Math.PI), 0.5);
        const starUV = vec2(u, v);
        const starSample = texture(starTex, starUV);
        // HDR star color with brightness control.
        // HDR 星星颜色，带亮度控制
        nightSky = mul(starSample.rgb, starBrightness);
      } else {
        nightSky = nightGradient;
      }

      // ==========================================
      // DAY SKY
      // 白天天空
      // ==========================================
      const horizonDay = vec3(0.55, 0.7, 0.9);
      const zenithDay = vec3(0.2, 0.4, 0.8);
      const daySky = mix(horizonDay, zenithDay, pow(zenith, 0.4));

      // Sun glow only during day (controlled by dayFactor).
      // 太阳光晕仅在白天（由 dayFactor 控制）
      const sunDot = max(0.0, dot(viewDir, sunDir));
      const sunGlow = mul(pow(sunDot, 6.0), dayFactor, 0.15);
      const daySkyWithGlow = add(daySky, mul(vec3(1.0, 0.95, 0.9), sunGlow));

      // ==========================================
      // SUNSET / SUNRISE (only when dayFactor > 0)
      // 日落 / 日出（仅当 dayFactor > 0）
      // ==========================================
      const sunElev = sunDir.y;
      const sunsetBlend = mul(
        smoothstep(-0.05, 0.2, sunElev),
        smoothstep(0.35, 0.1, sunElev)
      );

      const sunsetHorizon = vec3(1.0, 0.4, 0.15);
      const sunsetZenith = vec3(0.35, 0.25, 0.45);
      const sunsetGrad = mix(sunsetHorizon, sunsetZenith, pow(zenith, 0.6));
      
      // Sunset glow near sun, scaled by dayFactor.
      // 太阳附近的日落光晕，由 dayFactor 缩放
      const sunsetGlow = mul(vec3(1.0, 0.5, 0.2), pow(sunDot, 3.0), sunsetBlend, dayFactor, 0.3);
      const sunsetSky = add(sunsetGrad, sunsetGlow);

      // Blend day sky with sunset.
      // 将白天天空与日落混合
      const dayWithSunset = mix(daySkyWithGlow, sunsetSky, sunsetBlend);

      // ==========================================
      // FINAL: blend night and day
      // 最终：混合夜晚和白天
      // ==========================================
      const finalColor = mix(nightSky, dayWithSunset, dayFactor);

      return vec4(finalColor, 1.0);
    })();

    return material;
  }

  /**
   * Add to scene.
   * 添加到场景
   */
  addToScene(scene: Scene): void {
    scene.add(this.mesh);
  }

  /**
   * Remove from scene.
   * 从场景移除
   */
  removeFromScene(scene: Scene): void {
    scene.remove(this.mesh);
  }

  /**
   * Update sun direction.
   * 更新太阳方向
   */
  setSunDirection(x: number, y: number, z: number): void {
    this.sunDirUniform.value.set(x, y, z);
  }

  /**
   * Set day/night factor (0 = night, 1 = day).
   * 设置日/夜因子（0=夜晚，1=白天）
   */
  setDayFactor(factor: number): void {
    this.dayFactorUniform.value = factor;
  }

  /**
   * Set star brightness.
   * 设置星星亮度
   */
  setStarBrightness(value: number): void {
    this.starBrightnessUniform.value = value;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
