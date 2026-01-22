// SunRenderer: sun disc mesh with dynamic color and brightness.
// SunRenderer：带动态颜色和亮度的太阳圆盘网格

import {
  Color,
  FrontSide,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  TextureLoader,
  Vector3,
} from "three/webgpu";
import { uniform, vec3, float } from "three/tsl";
import { LensflareMesh, LensflareElement } from "three/addons/objects/LensflareMesh.js";
import { calculateSunColor } from "./DayNightCycle";

/**
 * SunRenderer: manages sun disc and lens flare visuals.
 * SunRenderer：管理太阳圆盘和镜头光斑视觉效果
 */
export class SunRenderer {
  readonly mesh: Mesh;
  private readonly material: MeshBasicNodeMaterial;
  private readonly colorUniform = uniform(new Color(1.0, 0.95, 0.8));
  private readonly brightnessUniform = uniform(1.0);
  private lensflare: LensflareMesh | null = null;

  constructor(initialSize = 15) {
    const geometry = new SphereGeometry(initialSize, 32, 32);
    this.material = new MeshBasicNodeMaterial({ side: FrontSide });
    this.material.colorNode = vec3(this.colorUniform).mul(float(this.brightnessUniform));
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = "sun-disc";

    this.initLensflare();
  }

  private initLensflare(): void {
    const textureLoader = new TextureLoader();

    // Create procedural ghost flare texture.
    // 创建程序化鬼影光斑纹理
    const ghostCanvas = document.createElement("canvas");
    ghostCanvas.width = 64;
    ghostCanvas.height = 64;
    const ctx = ghostCanvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(100, 150, 255, 0.4)");
    gradient.addColorStop(0.5, "rgba(100, 150, 255, 0.1)");
    gradient.addColorStop(1, "rgba(100, 150, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const ghostTexture = textureLoader.load(ghostCanvas.toDataURL());

    this.lensflare = new LensflareMesh();
    this.lensflare.addElement(new LensflareElement(ghostTexture, 60, 0.3, new Color(0.7, 0.8, 1.0)));
    this.lensflare.addElement(new LensflareElement(ghostTexture, 80, 0.5, new Color(0.6, 0.7, 1.0)));
    this.lensflare.addElement(new LensflareElement(ghostTexture, 100, 0.7, new Color(0.5, 0.6, 1.0)));
    this.lensflare.addElement(new LensflareElement(ghostTexture, 50, 0.9, new Color(0.4, 0.5, 0.8)));
    this.lensflare.addElement(new LensflareElement(ghostTexture, 70, 1.0, new Color(0.3, 0.4, 0.7)));

    this.mesh.add(this.lensflare);
  }

  /**
   * Update sun position from direction vector.
   * 从方向向量更新太阳位置
   */
  updatePosition(direction: Vector3, distance = 1500): void {
    this.mesh.position.copy(direction).multiplyScalar(distance);
  }

  /**
   * Update sun appearance based on elevation.
   * 根据仰角更新太阳外观
   */
  updateAppearance(sunElevation: number, baseSize: number): void {
    // Update color.
    // 更新颜色
    const sunColor = calculateSunColor(sunElevation);
    this.colorUniform.value.copy(sunColor);

    // Update scale.
    // 更新缩放
    const scale = baseSize / 15;
    this.mesh.scale.setScalar(scale);

    // Calculate brightness.
    // 计算亮度
    let brightness: number;
    if (sunElevation >= 20) {
      brightness = 8.0;
    } else if (sunElevation >= 5) {
      brightness = 5.0 + ((sunElevation - 5) / 15) * 3.0;
    } else if (sunElevation >= 0) {
      brightness = 3.0 + (sunElevation / 5) * 2.0;
    } else {
      brightness = Math.max(0.5, 3.0 + sunElevation * 0.5);
    }
    this.brightnessUniform.value = brightness;

    // Visibility.
    // 可见性
    this.mesh.visible = sunElevation > -0.5;
  }

  /**
   * Update lens flare visibility.
   * 更新镜头光斑可见性
   */
  setLensflareEnabled(enabled: boolean, sunElevation: number): void {
    if (this.lensflare) {
      this.lensflare.visible = enabled && sunElevation > -2;
    }
  }

  /**
   * Follow camera position (keep sun at fixed distance from camera).
   * 跟随相机位置（保持太阳与相机的固定距离）
   */
  followCamera(cameraPosition: Vector3, sunDirection: Vector3, distance = 1500): void {
    this.mesh.position.copy(cameraPosition).add(sunDirection.clone().multiplyScalar(distance));
    if (this.lensflare) {
      this.lensflare.position.copy(this.mesh.position);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    if (this.lensflare) {
      this.lensflare.dispose();
    }
  }
}
