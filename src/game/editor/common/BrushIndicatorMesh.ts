// BrushIndicatorMesh: GPU-rendered brush indicator that conforms to terrain surface.
// BrushIndicatorMesh：贴合地形表面的 GPU 渲染笔刷指示器

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  AdditiveBlending,
} from "three/webgpu";
import {
  abs,
  float,
  Fn,
  max,
  mix,
  sin,
  smoothstep,
  sub,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import type {
  BrushIndicatorState,
  BrushIndicatorStyle,
} from "./BrushIndicator";
import { BRUSH_INDICATOR_STYLES } from "./BrushIndicator";

// Geometry parameters for terrain-conforming disc.
// 贴合地形圆盘的几何参数
const RADIAL_SEGMENTS = 48; // Segments around the circle / 圆周分段数
const RING_SEGMENTS = 24; // Segments from center to edge / 从中心到边缘的分段数

/**
 * BrushIndicatorMesh: A GPU-rendered circular brush indicator that conforms to terrain.
 * BrushIndicatorMesh：贴合地形的 GPU 渲染圆形笔刷指示器
 *
 * Features / 特性:
 * - High-subdivision disc geometry that conforms to terrain height
 *   高细分圆盘几何体，贴合地形高度
 * - Outer ring shows full brush radius
 *   外圈显示完整笔刷半径
 * - Inner ring shows falloff boundary
 *   内圈显示衰减边界
 * - Strength visualization with fill opacity and pulse animation
 *   通过填充透明度和脉冲动画展示强度
 * - Animated glow and pulse effects
 *   动画发光和脉冲效果
 * - Color changes when brush is active
 *   笔刷激活时颜色变化
 */
export class BrushIndicatorMesh {
  readonly mesh: Mesh;
  private readonly geometry: BufferGeometry;

  // Uniforms for shader control.
  // 着色器控制的 uniform
  private readonly radiusUniform = uniform(10);
  private readonly falloffUniform = uniform(0.5);
  private readonly strengthUniform = uniform(0.5);
  private readonly activeUniform = uniform(0);
  private readonly opacityUniform = uniform(0.9);
  private readonly timeUniform = uniform(0);

  // Color uniforms.
  // 颜色 uniform
  private readonly outerColorUniform = uniform(vec3(1.0, 0.6, 0.0));
  private readonly innerColorUniform = uniform(vec3(1.0, 0.8, 0.2));
  private readonly activeColorUniform = uniform(vec3(1.0, 1.0, 0.4));

  // Current style reference.
  // 当前样式引用
  private currentStyle: BrushIndicatorStyle;

  // Cached position array for height updates.
  // 用于高度更新的缓存位置数组
  private readonly basePositions: Float32Array;

  // Animation time accumulator.
  // 动画时间累加器
  private animTime = 0;

  constructor(style: BrushIndicatorStyle = BRUSH_INDICATOR_STYLES.terrain) {
    this.currentStyle = style;

    // Create high-subdivision disc geometry.
    // 创建高细分圆盘几何体
    const { geometry, basePositions } = this.createDiscGeometry();
    this.geometry = geometry;
    this.basePositions = basePositions;

    // Create material with TSL shader.
    // 使用 TSL 着色器创建材质
    const mat = this.createMaterial();

    this.mesh = new Mesh(this.geometry, mat);
    this.mesh.name = "brush-indicator";
    this.mesh.frustumCulled = false; // Always render / 始终渲染
    this.mesh.renderOrder = 9999; // Render on top / 在顶层渲染

    // Apply initial style.
    // 应用初始样式
    this.setStyle(style);
  }

  /**
   * Create a high-subdivision disc geometry for terrain conforming.
   * 创建用于贴合地形的高细分圆盘几何体
   */
  private createDiscGeometry(): { geometry: BufferGeometry; basePositions: Float32Array } {
    const vertexCount = 1 + RADIAL_SEGMENTS * RING_SEGMENTS; // Center + rings / 中心 + 环
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices: number[] = [];

    // Center vertex (index 0).
    // 中心顶点（索引 0）
    positions[0] = 0;
    positions[1] = 0;
    positions[2] = 0;
    uvs[0] = 0.5;
    uvs[1] = 0.5;

    // Generate ring vertices.
    // 生成环形顶点
    let idx = 1;
    for (let ring = 0; ring < RING_SEGMENTS; ring++) {
      const ringT = (ring + 1) / RING_SEGMENTS; // 0 to 1 from center to edge / 从中心到边缘 0 到 1

      for (let seg = 0; seg < RADIAL_SEGMENTS; seg++) {
        const angle = (seg / RADIAL_SEGMENTS) * Math.PI * 2;
        const x = Math.cos(angle) * ringT;
        const z = Math.sin(angle) * ringT;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = z;

        // UV: normalized position (-1 to 1) mapped to (0 to 1).
        // UV：归一化位置（-1 到 1）映射到（0 到 1）
        uvs[idx * 2] = x * 0.5 + 0.5;
        uvs[idx * 2 + 1] = z * 0.5 + 0.5;

        idx++;
      }
    }

    // Generate triangles.
    // 生成三角形

    // Center triangles (first ring).
    // 中心三角形（第一环）
    for (let seg = 0; seg < RADIAL_SEGMENTS; seg++) {
      const next = (seg + 1) % RADIAL_SEGMENTS;
      indices.push(0, 1 + seg, 1 + next);
    }

    // Ring triangles.
    // 环形三角形
    for (let ring = 0; ring < RING_SEGMENTS - 1; ring++) {
      const ringStart = 1 + ring * RADIAL_SEGMENTS;
      const nextRingStart = 1 + (ring + 1) * RADIAL_SEGMENTS;

      for (let seg = 0; seg < RADIAL_SEGMENTS; seg++) {
        const next = (seg + 1) % RADIAL_SEGMENTS;

        const a = ringStart + seg;
        const b = ringStart + next;
        const c = nextRingStart + seg;
        const d = nextRingStart + next;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // Store base positions (normalized -1 to 1 in XZ).
    // 存储基础位置（XZ 归一化 -1 到 1）
    return { geometry, basePositions: positions.slice() };
  }

  /**
   * Create the TSL-based material for brush indicator.
   * 创建基于 TSL 的笔刷指示器材质
   */
  private createMaterial(): MeshBasicNodeMaterial {
    const mat = new MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.depthTest = true;
    mat.side = DoubleSide;
    mat.blending = AdditiveBlending;

    // Time uniform for animations.
    // 动画的时间 uniform
    const time = this.timeUniform;

    // UV is already in 0-1 range, convert to -1 to 1 for distance calculation.
    // UV 已经在 0-1 范围，转换为 -1 到 1 用于距离计算
    const uvCentered = uv().sub(0.5).mul(2.0);
    const dist = uvCentered.length();

    // Calculate inner radius based on falloff.
    // 根据衰减计算内圈半径
    const innerRadiusNorm = sub(1.0, this.falloffUniform);

    // Ring thickness (relative to radius).
    // 环的厚度（相对于半径）
    const outerThickness = float(0.04);
    const innerThickness = float(0.025);

    // === Outer Ring with glow ===
    // === 带发光的外圈 ===
    const outerRingDist = abs(sub(dist, 1.0));
    // Core ring.
    // 核心环
    const outerCore = sub(1.0, smoothstep(float(0), outerThickness, outerRingDist));
    // Glow around ring.
    // 环周围的发光
    const outerGlow = sub(1.0, smoothstep(float(0), outerThickness.mul(4.0), outerRingDist)).mul(0.3);
    // Animated pulse on outer ring.
    // 外圈的动画脉冲
    const pulse = sin(time.mul(3.0)).mul(0.5).add(0.5);
    const outerPulse = outerCore.mul(mix(float(0.7), float(1.0), pulse));
    const outerAlpha = max(outerPulse, outerGlow);

    // === Inner Ring (falloff boundary) ===
    // === 内圈（衰减边界）===
    const innerRingDist = abs(sub(dist, innerRadiusNorm));
    const innerCore = sub(1.0, smoothstep(float(0), innerThickness, innerRingDist));
    const innerGlow = sub(1.0, smoothstep(float(0), innerThickness.mul(3.0), innerRingDist)).mul(0.2);
    // Hide inner ring when falloff is near 0 or 1.
    // 当衰减接近 0 或 1 时隐藏内圈
    const falloffVisible = smoothstep(float(0.05), float(0.2), this.falloffUniform)
      .mul(sub(1.0, smoothstep(float(0.8), float(0.95), this.falloffUniform)));
    const innerAlpha = max(innerCore, innerGlow).mul(falloffVisible).mul(0.8);

    // === Strength fill visualization ===
    // === 强度填充可视化 ===
    // Radial gradient based on falloff curve.
    // 基于衰减曲线的径向渐变
    const falloffStart = innerRadiusNorm;
    const normalizedDist = dist.div(1.0); // 0 at center, 1 at edge / 中心为 0，边缘为 1
    
    // Create falloff curve: full strength inside inner radius, fade to edge.
    // 创建衰减曲线：内圈内为全强度，向边缘衰减
    const falloffCurve = Fn(() => {
      const insideInner = smoothstep(falloffStart.add(0.01), falloffStart.sub(0.01), normalizedDist);
      const inFalloff = sub(1.0, smoothstep(falloffStart, float(1.0), normalizedDist));
      return max(insideInner, inFalloff.mul(insideInner.oneMinus()));
    })();
    
    // Strength affects fill opacity and adds animated pattern.
    // 强度影响填充透明度并添加动画图案
    const strengthFactor = this.strengthUniform;
    
    // Animated concentric rings pattern.
    // 动画同心圆图案
    const ringPattern = sin(dist.mul(20.0).sub(time.mul(2.0))).mul(0.5).add(0.5);
    const patternAlpha = ringPattern.mul(0.15).mul(strengthFactor);
    
    // Base fill with strength-based opacity.
    // 基于强度的基础填充
    const baseFillAlpha = falloffCurve.mul(strengthFactor).mul(0.25);
    
    // Combine fill effects.
    // 组合填充效果
    const fillAlpha = baseFillAlpha.add(patternAlpha.mul(falloffCurve));
    
    // Clip to circle.
    // 裁剪为圆形
    const circleClip = sub(1.0, smoothstep(float(0.98), float(1.02), dist));

    // === Active state effects ===
    // === 激活状态效果 ===
    const activePulse = sin(time.mul(8.0)).mul(0.3).add(0.7);
    const activeBoost = mix(float(1.0), activePulse, this.activeUniform);

    // === Color calculation ===
    // === 颜色计算 ===
    // Gradient from inner color (center) to outer color (edge).
    // 从内部颜色（中心）到外部颜色（边缘）的渐变
    const colorT = smoothstep(float(0), float(1.0), dist);
    const baseColor = mix(this.innerColorUniform, this.outerColorUniform, colorT);
    
    // Brighten color based on strength.
    // 根据强度增亮颜色
    const strengthBrightness = mix(float(0.7), float(1.2), strengthFactor);
    const brightColor = baseColor.mul(strengthBrightness);
    
    // Active color override.
    // 激活颜色覆盖
    const finalColor = mix(brightColor, this.activeColorUniform, this.activeUniform.mul(0.5));

    // === Combine all alpha contributions ===
    // === 组合所有透明度贡献 ===
    const ringAlpha = max(outerAlpha, innerAlpha);
    const totalAlpha = max(ringAlpha, fillAlpha).mul(circleClip).mul(this.opacityUniform).mul(activeBoost);

    // === Cross-hair at center ===
    // === 中心十字准星 ===
    const crossSize = float(0.08);
    const crossThickness = float(0.008);
    const crossX = smoothstep(crossThickness, float(0), abs(uvCentered.x)).mul(
      smoothstep(crossSize, crossSize.mul(0.8), abs(uvCentered.y))
    );
    const crossY = smoothstep(crossThickness, float(0), abs(uvCentered.y)).mul(
      smoothstep(crossSize, crossSize.mul(0.8), abs(uvCentered.x))
    );
    const crossAlpha = max(crossX, crossY).mul(0.6);

    // Final alpha with crosshair.
    // 带十字准星的最终透明度
    const finalAlpha = max(totalAlpha, crossAlpha.mul(this.opacityUniform));

    mat.colorNode = vec4(finalColor, finalAlpha);

    return mat;
  }

  /**
   * Update brush indicator state and conform to terrain.
   * 更新笔刷指示器状态并贴合地形
   */
  update(state: BrushIndicatorState & { strength?: number }, heightAt: (x: number, z: number) => number): void {
    this.mesh.visible = state.visible;

    if (!state.visible) return;

    // Update animation time.
    // 更新动画时间
    this.animTime += 0.016; // ~60fps
    this.timeUniform.value = this.animTime;

    const { worldX, worldZ, radius } = state;
    const strength = state.strength ?? 0.5;

    // Update mesh position to brush center.
    // 更新网格位置到笔刷中心
    const centerY = heightAt(worldX, worldZ);
    this.mesh.position.set(worldX, centerY, worldZ);

    // Update geometry vertices to conform to terrain.
    // 更新几何体顶点以贴合地形
    const posAttr = this.geometry.getAttribute("position") as BufferAttribute;
    const positions = posAttr.array as Float32Array;

    for (let i = 0; i < positions.length / 3; i++) {
      // Get base position (normalized -1 to 1).
      // 获取基础位置（归一化 -1 到 1）
      const baseX = this.basePositions[i * 3];
      const baseZ = this.basePositions[i * 3 + 2];

      // Scale to world radius.
      // 缩放到世界半径
      const localX = baseX * radius;
      const localZ = baseZ * radius;

      // Get terrain height at this position.
      // 获取此位置的地形高度
      const terrainY = heightAt(worldX + localX, worldZ + localZ);

      // Update vertex position.
      // 更新顶点位置
      positions[i * 3] = localX;
      positions[i * 3 + 1] = terrainY - centerY + 0.15; // Offset above terrain / 在地形上方偏移
      positions[i * 3 + 2] = localZ;
    }

    posAttr.needsUpdate = true;

    // Update uniforms.
    // 更新 uniform
    this.radiusUniform.value = radius;
    this.falloffUniform.value = state.falloff;
    this.strengthUniform.value = strength;
    this.activeUniform.value = state.active ? 1 : 0;
  }

  /**
   * Set the visual style.
   * 设置视觉样式
   */
  setStyle(style: BrushIndicatorStyle): void {
    this.currentStyle = style;

    this.outerColorUniform.value.set(
      style.outerColor.r,
      style.outerColor.g,
      style.outerColor.b
    );
    this.innerColorUniform.value.set(
      style.innerColor.r,
      style.innerColor.g,
      style.innerColor.b
    );
    this.activeColorUniform.value.set(
      style.activeColor.r,
      style.activeColor.g,
      style.activeColor.b
    );
    this.opacityUniform.value = style.opacity;
  }

  /**
   * Get current style.
   * 获取当前样式
   */
  getStyle(): BrushIndicatorStyle {
    return this.currentStyle;
  }

  /**
   * Dispose resources.
   * 释放资源
   */
  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
  }
}
