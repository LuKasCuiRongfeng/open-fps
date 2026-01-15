// TerrainChunk: GPU-first terrain chunk with shared geometry and vertex displacement.
// TerrainChunk：GPU-first 地形块，共享几何体和顶点位移

import {
  BufferGeometry,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Vector3,
  type StorageTexture,
} from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import type { FloatingOrigin } from "./FloatingOrigin";
import { createGpuTerrainMaterial, type TerrainMaterialParams } from "./terrainMaterial";

/**
 * Cache for shared LOD geometries (all chunks share the same flat planes).
 * 共享 LOD 几何体的缓存（所有 chunk 共享相同的平面）
 */
const sharedGeometryCache = new Map<string, BufferGeometry>();

function getOrCreateSharedGeometry(chunkSize: number, segments: number): BufferGeometry {
  const key = `${chunkSize}-${segments}`;
  let geo = sharedGeometryCache.get(key);

  if (!geo) {
    // Create flat plane centered at origin.
    // 创建以原点为中心的平面
    geo = new PlaneGeometry(chunkSize, chunkSize, segments, segments);
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    sharedGeometryCache.set(key, geo);
  }

  return geo;
}

/**
 * Dispose all shared geometries (call on shutdown).
 * 释放所有共享几何体（关闭时调用）
 */
export function disposeSharedGeometries(): void {
  for (const geo of sharedGeometryCache.values()) {
    geo.dispose();
  }
  sharedGeometryCache.clear();
}

/**
 * GPU-first terrain chunk using shared geometry and vertex displacement.
 * GPU-first 地形块，使用共享几何体和顶点位移
 *
 * Key differences from CPU-based chunk:
 * - Uses shared flat geometry (no per-chunk vertex data)
 * - Height displacement happens in vertex shader
 * - Normal comes from pre-computed texture
 * - LOD switches geometry only (material textures stay same)
 * 与基于 CPU 的 chunk 的关键区别：
 * - 使用共享平面几何体（无每 chunk 顶点数据）
 * - 高度位移在顶点着色器中进行
 * - 法线来自预计算纹理
 * - LOD 仅切换几何体（材质纹理保持不变）
 */
export class TerrainChunk {
  readonly cx: number;
  readonly cz: number;
  readonly mesh: Mesh;

  private readonly config: TerrainConfig;
  private readonly floatingOrigin: FloatingOrigin;
  private currentLodIndex = 0;

  // World center (true world, not local).
  // 世界中心（真实世界坐标，非本地）
  readonly worldCenterX: number;
  readonly worldCenterZ: number;

  // Atlas tile info for this chunk.
  // 此 chunk 的图集 tile 信息
  private readonly tileUvOffset: { x: number; y: number };
  private readonly tileUvScale: number;

  constructor(
    cx: number,
    cz: number,
    config: TerrainConfig,
    floatingOrigin: FloatingOrigin,
    heightTexture: StorageTexture,
    normalTexture: StorageTexture,
    tileInfo: { uOffset: number; vOffset: number; uvScale: number },
  ) {
    this.cx = cx;
    this.cz = cz;
    this.config = config;
    this.floatingOrigin = floatingOrigin;

    const chunkSize = config.streaming.chunkSizeMeters;
    this.worldCenterX = (cx + 0.5) * chunkSize;
    this.worldCenterZ = (cz + 0.5) * chunkSize;

    this.tileUvOffset = { x: tileInfo.uOffset, y: tileInfo.vOffset };
    this.tileUvScale = tileInfo.uvScale;

    // Create per-chunk geometry with correct bounding sphere for frustum culling.
    // 创建带正确包围球的每 chunk 几何体用于视锥剔除
    const segments = config.lod.levels[0].segmentsPerSide;
    const geometry = this.createChunkGeometry(segments);

    // Create GPU-displaced material.
    // 创建 GPU 位移材质
    const materialParams: TerrainMaterialParams = {
      heightTexture,
      normalTexture,
      tileUvOffset: this.tileUvOffset,
      tileUvScale: this.tileUvScale,
      chunkWorldX: this.worldCenterX,
      chunkWorldZ: this.worldCenterZ,
      chunkSize,
    };
    const material = createGpuTerrainMaterial(config, materialParams);

    this.mesh = new Mesh(geometry, material);
    this.mesh.name = `terrain-chunk-gpu-${cx}-${cz}`;

    // Enable Three.js built-in frustum culling (GPU-optimized in WebGPU renderer).
    // 启用 Three.js 内置视锥剔除（WebGPU 渲染器中已 GPU 优化）
    this.mesh.frustumCulled = true;

    // Update position based on floating origin.
    // 根据浮动原点更新位置
    this.updatePosition();

    // Register for origin rebase.
    // 注册原点重置
    this.floatingOrigin.onRebase(this.handleOriginRebase);
  }

  private updatePosition(): void {
    // Convert world center to local render coordinates.
    // 将世界中心转换为本地渲染坐标
    const local = this.floatingOrigin.worldToLocal(this.worldCenterX, 0, this.worldCenterZ);
    this.mesh.position.set(local.x, 0, local.z);
  }

  /**
   * Create per-chunk geometry with correct bounding sphere for frustum culling.
   * 为每个 chunk 创建带正确包围球的几何体用于视锥剔除
   *
   * We clone the shared geometry just to set per-chunk bounding sphere
   * (the actual vertex data is still shared via BufferAttribute references).
   * 我们仅为设置每 chunk 包围球而克隆共享几何体
   * （实际顶点数据仍通过 BufferAttribute 引用共享）
   */
  private createChunkGeometry(segments: number): BufferGeometry {
    const chunkSize = this.config.streaming.chunkSizeMeters;
    const sharedGeo = getOrCreateSharedGeometry(chunkSize, segments);

    // Clone geometry to have per-chunk bounding sphere.
    // 克隆几何体以拥有每 chunk 的包围球
    const geo = sharedGeo.clone();

    // Calculate expanded bounding sphere for GPU height displacement.
    // 计算扩展的包围球以考虑 GPU 高度位移
    const halfChunk = chunkSize / 2;
    const heightRange = this.config.height.amplitudeMeters * 2;
    const baseRadius = halfChunk * Math.SQRT2;
    const radius = Math.sqrt(baseRadius * baseRadius + heightRange * heightRange);

    // Set bounding sphere with height offset.
    // 设置带高度偏移的包围球
    geo.boundingSphere!.radius = radius;
    geo.boundingSphere!.center.set(0, this.config.height.baseHeightMeters, 0);

    return geo;
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
   * Uses hysteresis to prevent frequent LOD switches when near boundaries.
   * 使用滞后防止在边界附近频繁切换 LOD
   *
   * @param cameraWorldX Camera X in true world coordinates.
   * @param cameraWorldZ Camera Z in true world coordinates.
   */
  updateLod(cameraWorldX: number, cameraWorldZ: number): void {
    const dx = cameraWorldX - this.worldCenterX;
    const dz = cameraWorldZ - this.worldCenterZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Find appropriate LOD level with hysteresis.
    // 使用滞后找到合适的 LOD 级别
    const hysteresis = 8; // meters of hysteresis to prevent thrashing
    let newLodIndex = this.config.lod.levels.length - 1;

    for (let i = 0; i < this.config.lod.levels.length; i++) {
      const threshold = this.config.lod.levels[i].maxDistanceMeters;
      // Use hysteresis: require crossing further to switch away from current LOD.
      // 使用滞后：切换到新 LOD 需要更大的距离变化
      const adjustedThreshold = i === this.currentLodIndex
        ? threshold + hysteresis
        : threshold;

      if (dist <= adjustedThreshold) {
        newLodIndex = i;
        break;
      }
    }

    // Switch to per-chunk geometry with correct bounding sphere for new LOD.
    // 切换到带正确包围球的每 chunk 几何体用于新 LOD
    if (newLodIndex !== this.currentLodIndex) {
      // Dispose old per-chunk geometry.
      // 释放旧的每 chunk 几何体
      this.mesh.geometry.dispose();

      this.currentLodIndex = newLodIndex;
      const segments = this.config.lod.levels[newLodIndex].segmentsPerSide;
      this.mesh.geometry = this.createChunkGeometry(segments);
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
   * Get bounding sphere in world coordinates.
   * 获取世界坐标中的包围球
   */
  getWorldBoundingSphere(): { x: number; y: number; z: number; radius: number } {
    return {
      x: this.worldCenterX,
      y: this.config.height.baseHeightMeters,
      z: this.worldCenterZ,
      radius: this.getBoundingSphereRadius(),
    };
  }

  /**
   * Dispose resources.
   * 释放资源
   */
  dispose(): void {
    this.floatingOrigin.offRebase(this.handleOriginRebase);

    // Dispose per-chunk geometry (it's a clone).
    // 释放每 chunk 几何体（它是克隆的）
    this.mesh.geometry.dispose();

    // Dispose material.
    // 释放材质
    if (this.mesh.material instanceof MeshStandardNodeMaterial) {
      this.mesh.material.dispose();
    }
  }
}
