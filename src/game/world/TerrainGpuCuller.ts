// TerrainGpuCuller: GPU frustum culling for terrain chunks.
// TerrainGpuCuller：地形 chunk 的 GPU 视锥剔除

import type { WebGPURenderer, PerspectiveCamera } from "three/webgpu";
import type { TerrainChunk } from "./TerrainChunk";
import type { TerrainConfig } from "./terrain";

/**
 * GPU-based frustum culling for terrain chunks.
 * 基于 GPU 的地形 chunk 视锥剔除
 *
 * Uses a compute shader to test chunk bounding spheres against frustum planes,
 * outputting a visibility buffer for indirect drawing.
 * 使用 compute shader 测试 chunk 包围球与视锥平面，
 * 输出可见性缓冲区用于间接绘制。
 */
export class TerrainGpuCuller {
  private readonly config: TerrainConfig;

  // Uniforms for frustum planes.
  // 视锥平面的 uniform
  private frustumPlanes = new Float32Array(6 * 4); // 6 planes, 4 floats each (nx, ny, nz, d)

  // Statistics.
  // 统计数据
  private lastVisibleCount = 0;
  private lastTotalCount = 0;

  constructor(config: TerrainConfig) {
    this.config = config;
  }

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   */
  init(_renderer: WebGPURenderer): void {
    // Reserved for future GPU compute culling implementation.
    // 保留用于未来 GPU compute 剔除实现
  }

  /**
   * Perform frustum culling on the given chunks.
   * 对给定的 chunk 执行视锥剔除
   *
   * @returns Array of visible chunk indices.
   */
  cull(chunks: TerrainChunk[], camera: PerspectiveCamera): number[] {
    if (!this.config.culling.enabled || chunks.length === 0) {
      // Return all indices if culling is disabled.
      // 如果剔除被禁用，返回所有索引
      return chunks.map((_, i) => i);
    }

    // For now, use CPU frustum culling (GPU compute culling can be added later).
    // 目前使用 CPU 视锥剔除（GPU compute 剔除可以之后添加）
    // This is still much better than no culling at all.
    // 这仍然比完全不剔除要好得多。

    this.updateFrustumPlanes(camera);
    const visibleIndices: number[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const center = chunk.getBoundingSphereCenter();
      const radius = chunk.getBoundingSphereRadius();

      if (this.sphereInFrustum(center.x, center.y, center.z, radius)) {
        visibleIndices.push(i);
      }
    }

    this.lastVisibleCount = visibleIndices.length;
    this.lastTotalCount = chunks.length;

    return visibleIndices;
  }

  private updateFrustumPlanes(camera: PerspectiveCamera): void {
    // Extract frustum planes from camera projection-view matrix.
    // 从相机投影-视图矩阵提取视锥平面
    camera.updateMatrixWorld();
    const projScreenMatrix = camera.projectionMatrix.clone();
    projScreenMatrix.multiply(camera.matrixWorldInverse);

    const me = projScreenMatrix.elements;

    // Left plane.
    // 左平面
    this.setPlane(0, me[3] + me[0], me[7] + me[4], me[11] + me[8], me[15] + me[12]);

    // Right plane.
    // 右平面
    this.setPlane(1, me[3] - me[0], me[7] - me[4], me[11] - me[8], me[15] - me[12]);

    // Bottom plane.
    // 底平面
    this.setPlane(2, me[3] + me[1], me[7] + me[5], me[11] + me[9], me[15] + me[13]);

    // Top plane.
    // 顶平面
    this.setPlane(3, me[3] - me[1], me[7] - me[5], me[11] - me[9], me[15] - me[13]);

    // Near plane.
    // 近平面
    this.setPlane(4, me[3] + me[2], me[7] + me[6], me[11] + me[10], me[15] + me[14]);

    // Far plane.
    // 远平面
    this.setPlane(5, me[3] - me[2], me[7] - me[6], me[11] - me[10], me[15] - me[14]);
  }

  private setPlane(index: number, a: number, b: number, c: number, d: number): void {
    const len = Math.sqrt(a * a + b * b + c * c);
    const invLen = len > 0 ? 1 / len : 0;

    const base = index * 4;
    this.frustumPlanes[base + 0] = a * invLen;
    this.frustumPlanes[base + 1] = b * invLen;
    this.frustumPlanes[base + 2] = c * invLen;
    this.frustumPlanes[base + 3] = d * invLen;
  }

  private sphereInFrustum(cx: number, cy: number, cz: number, radius: number): boolean {
    for (let i = 0; i < 6; i++) {
      const base = i * 4;
      const nx = this.frustumPlanes[base + 0];
      const ny = this.frustumPlanes[base + 1];
      const nz = this.frustumPlanes[base + 2];
      const d = this.frustumPlanes[base + 3];

      const dist = nx * cx + ny * cy + nz * cz + d;

      if (dist < -radius) {
        return false; // Sphere is completely outside this plane.
      }
    }
    return true;
  }

  /**
   * Get culling statistics.
   * 获取剔除统计数据
   */
  getStats(): { visible: number; total: number; culledPercent: number } {
    const culledPercent = this.lastTotalCount > 0
      ? ((this.lastTotalCount - this.lastVisibleCount) / this.lastTotalCount) * 100
      : 0;
    return {
      visible: this.lastVisibleCount,
      total: this.lastTotalCount,
      culledPercent,
    };
  }

  dispose(): void {
    // Clean up any GPU resources when implemented.
    // 清理 GPU 资源（实现时）
  }
}
