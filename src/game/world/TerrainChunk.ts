// TerrainChunk: GPU-first terrain chunk with shared geometry and vertex displacement.
// TerrainChunk：GPU-first 地形块，共享几何体和顶点位移

import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Uint32BufferAttribute,
  Vector3,
  type StorageTexture,
  type Texture,
} from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import type { FloatingOrigin } from "./FloatingOrigin";
import { createGpuTerrainMaterial, type TerrainMaterialParams } from "./terrainMaterial";
import { createTexturedTerrainMaterial, type TerrainMaterialParams as TexturedMaterialParams } from "./terrainMaterialTextured";
import type { TerrainTextureResult } from "./TerrainTextures";

// Skirt depth in meters (how far down the skirt extends).
// 裙边深度（米）（裙边向下延伸多远）
// Must be large enough to cover max terrain height difference between adjacent chunks.
// With LOD, adjacent chunks may sample different positions, causing height mismatch.
// Max terrain height ~ continental(120) + mountain(200) + hills(25) + detail(8) ≈ 350m
// 必须足够大以覆盖相邻 chunk 之间的最大地形高度差
// 使用 LOD 时，相邻 chunk 可能采样不同位置，导致高度不匹配
// 最大地形高度 ~ continental(120) + mountain(200) + hills(25) + detail(8) ≈ 350m
const SKIRT_DEPTH_METERS = 300;

/**
 * Cache for shared LOD geometries with skirts (all chunks share the same flat planes).
 * 带裙边的共享 LOD 几何体缓存（所有 chunk 共享相同的平面）
 */
const sharedGeometryCache = new Map<string, BufferGeometry>();

/**
 * Create a plane geometry with skirts to hide LOD cracks.
 * 创建带裙边的平面几何体以隐藏 LOD 裂缝
 *
 * Skirts are vertical strips hanging down from the chunk edges.
 * They fill gaps between chunks at different LOD levels.
 * 裙边是从 chunk 边缘向下悬挂的垂直条带。
 * 它们填充不同 LOD 级别 chunk 之间的缝隙。
 */
function createPlaneWithSkirt(chunkSize: number, segments: number, skirtDepth: number): BufferGeometry {
  // Create base plane.
  // 创建基础平面
  const plane = new PlaneGeometry(chunkSize, chunkSize, segments, segments);
  plane.rotateX(-Math.PI / 2);

  const positions = plane.getAttribute("position");
  const uvs = plane.getAttribute("uv");
  const normals = plane.getAttribute("normal");
  const indices = plane.getIndex();

  if (!positions || !uvs || !normals || !indices) {
    return plane;
  }

  // Count edge vertices (4 edges, each has segments+1 vertices, corners shared).
  // 计算边缘顶点数（4条边，每条有 segments+1 个顶点，角点共享）
  const vertsPerEdge = segments + 1;
  const skirtVerts = vertsPerEdge * 4; // One row of skirt verts per edge
  const skirtTris = segments * 4 * 2; // 2 triangles per skirt quad, 4 edges

  const baseVertCount = positions.count;
  const baseIndexCount = indices.count;

  // Create new arrays with space for skirt.
  // 创建带裙边空间的新数组
  const newPositions = new Float32Array((baseVertCount + skirtVerts) * 3);
  const newUvs = new Float32Array((baseVertCount + skirtVerts) * 2);
  const newNormals = new Float32Array((baseVertCount + skirtVerts) * 3);
  const newIndices = new Uint32Array(baseIndexCount + skirtTris * 3);

  // Copy base geometry data.
  // 复制基础几何体数据
  for (let i = 0; i < baseVertCount; i++) {
    newPositions[i * 3] = positions.getX(i);
    newPositions[i * 3 + 1] = positions.getY(i);
    newPositions[i * 3 + 2] = positions.getZ(i);
    newUvs[i * 2] = uvs.getX(i);
    newUvs[i * 2 + 1] = uvs.getY(i);
    newNormals[i * 3] = normals.getX(i);
    newNormals[i * 3 + 1] = normals.getY(i);
    newNormals[i * 3 + 2] = normals.getZ(i);
  }
  for (let i = 0; i < baseIndexCount; i++) {
    newIndices[i] = indices.getX(i);
  }

  const half = chunkSize / 2;
  let skirtVertIndex = baseVertCount;
  let skirtIndexOffset = baseIndexCount;

  // Helper to find edge vertex index in original plane.
  // 辅助函数：在原始平面中找到边缘顶点索引
  const getEdgeVertIndex = (edgeX: number, edgeZ: number): number => {
    // PlaneGeometry vertices are laid out in a grid.
    // PlaneGeometry 顶点按网格排列
    for (let i = 0; i < baseVertCount; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      if (Math.abs(x - edgeX) < 0.001 && Math.abs(z - edgeZ) < 0.001) {
        return i;
      }
    }
    return 0;
  };

  // Add skirt for each edge.
  // 为每条边添加裙边
  const edges = [
    { axis: "x", fixed: -half, dir: 1, normalX: 0, normalZ: -1 },  // -Z edge
    { axis: "x", fixed: half, dir: 1, normalX: 0, normalZ: 1 },    // +Z edge
    { axis: "z", fixed: -half, dir: 1, normalX: -1, normalZ: 0 },  // -X edge
    { axis: "z", fixed: half, dir: 1, normalX: 1, normalZ: 0 },    // +X edge
  ];

  for (const edge of edges) {
    const startVert = skirtVertIndex;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let x: number, z: number;

      if (edge.axis === "x") {
        x = -half + t * chunkSize;
        z = edge.fixed;
      } else {
        x = edge.fixed;
        z = -half + t * chunkSize;
      }

      // Skirt vertex (same UV as edge vertex, but offset Y for skirt depth).
      // 裙边顶点（与边缘顶点相同的 UV，但 Y 偏移用于裙边深度）
      const u = (x + half) / chunkSize;
      const v = (z + half) / chunkSize;

      newPositions[skirtVertIndex * 3] = x;
      newPositions[skirtVertIndex * 3 + 1] = -skirtDepth; // Skirt hangs down / 裙边向下悬挂
      newPositions[skirtVertIndex * 3 + 2] = z;
      newUvs[skirtVertIndex * 2] = u;
      newUvs[skirtVertIndex * 2 + 1] = v;
      // Skirt normal points outward.
      // 裙边法线朝外
      newNormals[skirtVertIndex * 3] = edge.normalX;
      newNormals[skirtVertIndex * 3 + 1] = 0;
      newNormals[skirtVertIndex * 3 + 2] = edge.normalZ;

      skirtVertIndex++;
    }

    // Create triangles connecting edge vertices to skirt vertices.
    // 创建连接边缘顶点和裙边顶点的三角形
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      let x0: number, z0: number, x1: number, z1: number;

      if (edge.axis === "x") {
        x0 = -half + t0 * chunkSize;
        z0 = edge.fixed;
        x1 = -half + t1 * chunkSize;
        z1 = edge.fixed;
      } else {
        x0 = edge.fixed;
        z0 = -half + t0 * chunkSize;
        x1 = edge.fixed;
        z1 = -half + t1 * chunkSize;
      }

      const topLeft = getEdgeVertIndex(x0, z0);
      const topRight = getEdgeVertIndex(x1, z1);
      const bottomLeft = startVert + i;
      const bottomRight = startVert + i + 1;

      // Two triangles per quad (winding order for front-facing).
      // 每个四边形两个三角形（正面朝向的绕序）
      // Flip winding based on edge direction to ensure correct facing.
      // 根据边缘方向翻转绕序以确保正确朝向
      if (edge.fixed < 0 || edge.axis === "z") {
        newIndices[skirtIndexOffset++] = topLeft;
        newIndices[skirtIndexOffset++] = bottomLeft;
        newIndices[skirtIndexOffset++] = topRight;
        newIndices[skirtIndexOffset++] = topRight;
        newIndices[skirtIndexOffset++] = bottomLeft;
        newIndices[skirtIndexOffset++] = bottomRight;
      } else {
        newIndices[skirtIndexOffset++] = topLeft;
        newIndices[skirtIndexOffset++] = topRight;
        newIndices[skirtIndexOffset++] = bottomLeft;
        newIndices[skirtIndexOffset++] = topRight;
        newIndices[skirtIndexOffset++] = bottomRight;
        newIndices[skirtIndexOffset++] = bottomLeft;
      }
    }
  }

  // Create new geometry with skirt.
  // 创建带裙边的新几何体
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(newPositions, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(newUvs, 2));
  geo.setAttribute("normal", new Float32BufferAttribute(newNormals, 3));
  geo.setIndex(new Uint32BufferAttribute(newIndices, 1));

  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  // Clean up temporary plane.
  // 清理临时平面
  plane.dispose();

  return geo;
}

function getOrCreateSharedGeometry(chunkSize: number, segments: number, skirtDepth: number): BufferGeometry {
  const key = `${chunkSize}-${segments}-${skirtDepth}`;
  let geo = sharedGeometryCache.get(key);

  if (!geo) {
    geo = createPlaneWithSkirt(chunkSize, segments, skirtDepth);
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

  // Store texture references for material rebuilding.
  // 存储纹理引用用于材质重建
  private heightTexture: StorageTexture;
  private normalTexture: StorageTexture;

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
    this.heightTexture = heightTexture;
    this.normalTexture = normalTexture;

    const chunkSize = config.streaming.chunkSizeMeters;
    this.worldCenterX = (cx + 0.5) * chunkSize;
    this.worldCenterZ = (cz + 0.5) * chunkSize;

    this.tileUvOffset = { x: tileInfo.uOffset, y: tileInfo.vOffset };
    this.tileUvScale = tileInfo.uvScale;

    // Create per-chunk geometry with correct bounding sphere for frustum culling.
    // 创建带正确包围球的每 chunk 几何体用于视锥剔除
    const segments = config.lod.levels[0].segmentsPerSide;
    const geometry = this.createChunkGeometry(segments);

    // Create GPU-displaced material (textured or procedural based on config).
    // 创建 GPU 位移材质（根据配置选择纹理或程序化）
    const materialParams: TerrainMaterialParams = {
      heightTexture,
      normalTexture,
      tileUvOffset: this.tileUvOffset,
      tileUvScale: this.tileUvScale,
      chunkWorldX: this.worldCenterX,
      chunkWorldZ: this.worldCenterZ,
      chunkSize,
    };

    // Use textured material for better visuals, fallback to procedural.
    // 使用纹理材质获得更好的视觉效果，回退到程序化
    const material = config.material.useTextures
      ? createTexturedTerrainMaterial(config, materialParams)
      : createGpuTerrainMaterial(config, materialParams);

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
   * Geometry includes skirt to hide LOD cracks between chunks.
   * 几何体包含裙边以隐藏 chunk 之间的 LOD 裂缝
   *
   * We clone the shared geometry just to set per-chunk bounding sphere
   * (the actual vertex data is still shared via BufferAttribute references).
   * 我们仅为设置每 chunk 包围球而克隆共享几何体
   * （实际顶点数据仍通过 BufferAttribute 引用共享）
   */
  private createChunkGeometry(segments: number): BufferGeometry {
    const chunkSize = this.config.streaming.chunkSizeMeters;
    const sharedGeo = getOrCreateSharedGeometry(chunkSize, segments, SKIRT_DEPTH_METERS);

    // Clone geometry to have per-chunk bounding sphere.
    // 克隆几何体以拥有每 chunk 的包围球
    const geo = sharedGeo.clone();

    // Calculate expanded bounding sphere for GPU height displacement.
    // 计算扩展的包围球以考虑 GPU 高度位移
    const halfChunk = chunkSize / 2;
    // Total height range from all terrain layers.
    // 所有地形层的总高度范围
    const hcfg = this.config.height;
    const heightRange = (
      (hcfg.continental.enabled ? hcfg.continental.amplitudeMeters : 0) +
      (hcfg.mountain.enabled ? hcfg.mountain.amplitudeMeters : 0) +
      (hcfg.hills.enabled ? hcfg.hills.amplitudeMeters : 0) +
      (hcfg.detail.enabled ? hcfg.detail.amplitudeMeters : 0) +
      (hcfg.erosion.enabled ? hcfg.erosion.detailAmplitude : 0)
    ) * 2;
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
    // Total height range from all terrain layers.
    // 所有地形层的总高度范围
    const hcfg = this.config.height;
    const heightRange = (
      (hcfg.continental.enabled ? hcfg.continental.amplitudeMeters : 0) +
      (hcfg.mountain.enabled ? hcfg.mountain.amplitudeMeters : 0) +
      (hcfg.hills.enabled ? hcfg.hills.amplitudeMeters : 0) +
      (hcfg.detail.enabled ? hcfg.detail.amplitudeMeters : 0) +
      (hcfg.erosion.enabled ? hcfg.erosion.detailAmplitude : 0)
    ) * 2;
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
   * Rebuild material with new texture data.
   * 使用新的纹理数据重建材质
   *
   * Called when textures are loaded or splat map changes.
   * 在加载纹理或 splat map 变化时调用
   */
  rebuildMaterial(
    textureResult: TerrainTextureResult | null,
    splatMapTexture: Texture | null,
  ): void {
    // Dispose old material.
    // 释放旧材质
    if (this.mesh.material instanceof MeshStandardNodeMaterial) {
      this.mesh.material.dispose();
    }

    const chunkSize = this.config.streaming.chunkSizeMeters;

    // Create new material with texture params.
    // 使用纹理参数创建新材质
    const materialParams: TexturedMaterialParams = {
      heightTexture: this.heightTexture,
      normalTexture: this.normalTexture,
      tileUvOffset: this.tileUvOffset,
      tileUvScale: this.tileUvScale,
      chunkWorldX: this.worldCenterX,
      chunkWorldZ: this.worldCenterZ,
      chunkSize,
      textureResult: textureResult ?? undefined,
      splatMap: splatMapTexture ?? undefined,
    };

    // Always use textured material when rebuilding (it handles fallback internally).
    // 重建时总是使用纹理材质（它内部处理回退）
    this.mesh.material = createTexturedTerrainMaterial(this.config, materialParams);
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
