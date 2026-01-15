// TerrainChunk: single chunk of terrain with LOD support.
// TerrainChunk：支持 LOD 的单个地形块

import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Vector3,
} from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import type { FloatingOrigin } from "./FloatingOrigin";
import { createChunkMaterial } from "./terrainMaterial";
import { TerrainHeightSampler } from "./TerrainHeightSampler";

/**
 * A single terrain chunk with multi-LOD geometry.
 * 单个地形 chunk，支持多 LOD 几何体
 */
export class TerrainChunk {
  readonly cx: number;
  readonly cz: number;
  readonly mesh: Mesh;

  private readonly config: TerrainConfig;
  private readonly floatingOrigin: FloatingOrigin;
  private readonly lodGeometries: BufferGeometry[] = [];
  private currentLodIndex = 0;

  // World center (true world, not local).
  // 世界中心（真实世界坐标，非本地）
  private readonly worldCenterX: number;
  private readonly worldCenterZ: number;

  constructor(
    cx: number,
    cz: number,
    config: TerrainConfig,
    floatingOrigin: FloatingOrigin,
  ) {
    this.cx = cx;
    this.cz = cz;
    this.config = config;
    this.floatingOrigin = floatingOrigin;

    const chunkSize = config.streaming.chunkSizeMeters;
    this.worldCenterX = (cx + 0.5) * chunkSize;
    this.worldCenterZ = (cz + 0.5) * chunkSize;

    // Create LOD geometries.
    // 创建 LOD 几何体
    for (const level of config.lod.levels) {
      const geo = this.createChunkGeometry(level.segmentsPerSide);
      this.lodGeometries.push(geo);
    }

    // Create material.
    // 创建材质
    const material = createChunkMaterial(config);

    // Start with highest LOD.
    // 从最高 LOD 开始
    this.mesh = new Mesh(this.lodGeometries[0], material);
    this.mesh.name = `terrain-chunk-${cx}-${cz}`;

    // Update position based on floating origin.
    // 根据浮动原点更新位置
    this.updatePosition();

    // Register for origin rebase.
    // 注册原点重置
    this.floatingOrigin.onRebase(this.handleOriginRebase);
  }

  private createChunkGeometry(segments: number): BufferGeometry {
    const chunkSize = this.config.streaming.chunkSizeMeters;

    // Create plane geometry and rotate to XZ plane.
    // 创建平面几何体并旋转到 XZ 平面
    const geo = new PlaneGeometry(chunkSize, chunkSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    // Apply height displacement using CPU heightAt (for initial geometry).
    // 使用 CPU heightAt 应用高度位移（用于初始几何体）
    // Note: GPU bake will override this in the shader.
    // 注意：GPU 烘焙会在 shader 中覆盖这个
    const pos = geo.getAttribute("position") as BufferAttribute;
    const normal = geo.getAttribute("normal") as BufferAttribute;

    const step = this.config.height.normalSampleStepMeters;

    for (let i = 0; i < pos.count; i++) {
      const localX = pos.getX(i);
      const localZ = pos.getZ(i);

      // Convert to true world coordinates.
      // 转换为真实世界坐标
      const worldX = this.worldCenterX + localX;
      const worldZ = this.worldCenterZ + localZ;

      // Sample height.
      // 采样高度
      const y = TerrainHeightSampler.heightAt(worldX, worldZ, this.config);
      pos.setY(i, y);

      // Compute normal from height gradients.
      // 从高度梯度计算法线
      const hL = TerrainHeightSampler.heightAt(worldX - step, worldZ, this.config);
      const hR = TerrainHeightSampler.heightAt(worldX + step, worldZ, this.config);
      const hD = TerrainHeightSampler.heightAt(worldX, worldZ - step, this.config);
      const hU = TerrainHeightSampler.heightAt(worldX, worldZ + step, this.config);

      const dhdx = (hR - hL) / (2 * step);
      const dhdz = (hU - hD) / (2 * step);

      let nx = -dhdx;
      let ny = 1;
      let nz = -dhdz;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      normal.setXYZ(i, nx, ny, nz);
    }

    pos.needsUpdate = true;
    normal.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    return geo;
  }

  private updatePosition(): void {
    // Convert world center to local render coordinates.
    // 将世界中心转换为本地渲染坐标
    const local = this.floatingOrigin.worldToLocal(this.worldCenterX, 0, this.worldCenterZ);
    this.mesh.position.set(local.x, 0, local.z);
  }

  private handleOriginRebase = (dx: number, _dy: number, dz: number): void => {
    // Shift mesh position by negative delta (content moves opposite to origin shift).
    // 将 mesh 位置移动负增量（内容移动方向与原点移动相反）
    this.mesh.position.x -= dx;
    this.mesh.position.z -= dz;
  };

  /**
   * Update LOD based on camera distance.
   * 根据相机距离更新 LOD
   *
   * @param cameraWorldX Camera X in true world coordinates.
   * @param cameraWorldZ Camera Z in true world coordinates.
   */
  updateLod(cameraWorldX: number, cameraWorldZ: number): void {
    if (!this.config.lod.enabled) return;

    const dx = cameraWorldX - this.worldCenterX;
    const dz = cameraWorldZ - this.worldCenterZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Find appropriate LOD level.
    // 找到合适的 LOD 级别
    let newLodIndex = this.config.lod.levels.length - 1;
    for (let i = 0; i < this.config.lod.levels.length; i++) {
      if (dist <= this.config.lod.levels[i].maxDistanceMeters) {
        newLodIndex = i;
        break;
      }
    }

    // Switch geometry if LOD changed.
    // 如果 LOD 改变则切换几何体
    if (newLodIndex !== this.currentLodIndex) {
      this.currentLodIndex = newLodIndex;
      this.mesh.geometry = this.lodGeometries[newLodIndex];
    }
  }

  /**
   * Get chunk's bounding sphere center in local coordinates (for frustum culling).
   * 获取 chunk 在本地坐标中的包围球中心（用于视锥剔除）
   */
  getBoundingSphereCenter(): Vector3 {
    return this.mesh.position.clone();
  }

  /**
   * Get chunk's bounding sphere radius.
   * 获取 chunk 的包围球半径
   */
  getBoundingSphereRadius(): number {
    // Approximate: half diagonal of chunk + max height amplitude.
    // 近似：chunk 半对角线 + 最大高度振幅
    const chunkSize = this.config.streaming.chunkSizeMeters;
    const halfDiag = (chunkSize * Math.SQRT2) / 2;
    const heightRange = this.config.height.amplitudeMeters * 2;
    return Math.sqrt(halfDiag * halfDiag + heightRange * heightRange);
  }

  /**
   * Dispose all resources.
   * 释放所有资源
   */
  dispose(): void {
    this.floatingOrigin.offRebase(this.handleOriginRebase);

    for (const geo of this.lodGeometries) {
      geo.dispose();
    }
    this.lodGeometries.length = 0;

    if (this.mesh.material instanceof MeshStandardNodeMaterial) {
      this.mesh.material.dispose();
    }
  }
}
