// TerrainClipmapRenderer: fixed terrain page mesh pool for virtual height pages.
// TerrainClipmapRenderer：虚拟高度 page 的固定地形网格池。

import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Uint32BufferAttribute,
  type Scene,
  type StorageTexture,
  type Texture,
} from "three/webgpu";
import type { TerrainConfig } from "./terrain";
import type { FloatingOrigin } from "../common/FloatingOrigin";
import type { TileAtlasAllocator } from "@game/gpu";
import type { TerrainTextureArrayResult } from "./TerrainTextureArrays";
import {
  createControlledTexturedArrayTerrainMaterial,
  type TerrainMaterialUniformControls,
} from "./material/terrainMaterialTexturedArray";

export type ClipmapPageCoord = { px: number; pz: number };

const CLIPMAP_SKIRT_DEPTH_METERS = 300;
const clipmapGeometryCache = new Map<string, BufferGeometry>();

function pageKey(px: number, pz: number): string {
  return `${px},${pz}`;
}

function createPlaneWithSkirt(pageSize: number, segments: number, skirtDepth: number): BufferGeometry {
  const plane = new PlaneGeometry(pageSize, pageSize, segments, segments);
  plane.rotateX(-Math.PI / 2);

  const positions = plane.getAttribute("position");
  const uvs = plane.getAttribute("uv");
  const normals = plane.getAttribute("normal");
  const indices = plane.getIndex();

  if (!positions || !uvs || !normals || !indices) {
    return plane;
  }

  const vertsPerEdge = segments + 1;
  const skirtVerts = vertsPerEdge * 4;
  const skirtTris = segments * 4 * 2;
  const baseVertCount = positions.count;
  const baseIndexCount = indices.count;
  const newPositions = new Float32Array((baseVertCount + skirtVerts) * 3);
  const newUvs = new Float32Array((baseVertCount + skirtVerts) * 2);
  const newNormals = new Float32Array((baseVertCount + skirtVerts) * 3);
  const newIndices = new Uint32Array(baseIndexCount + skirtTris * 3);

  for (let index = 0; index < baseVertCount; index += 1) {
    newPositions[index * 3] = positions.getX(index);
    newPositions[index * 3 + 1] = positions.getY(index);
    newPositions[index * 3 + 2] = positions.getZ(index);
    newUvs[index * 2] = uvs.getX(index);
    newUvs[index * 2 + 1] = uvs.getY(index);
    newNormals[index * 3] = normals.getX(index);
    newNormals[index * 3 + 1] = normals.getY(index);
    newNormals[index * 3 + 2] = normals.getZ(index);
  }

  for (let index = 0; index < baseIndexCount; index += 1) {
    newIndices[index] = indices.getX(index);
  }

  const halfSize = pageSize / 2;
  let skirtVertIndex = baseVertCount;
  let skirtIndexOffset = baseIndexCount;

  const findEdgeVertex = (edgeX: number, edgeZ: number): number => {
    for (let index = 0; index < baseVertCount; index += 1) {
      if (Math.abs(positions.getX(index) - edgeX) < 0.001 && Math.abs(positions.getZ(index) - edgeZ) < 0.001) {
        return index;
      }
    }
    return 0;
  };

  const edges = [
    { axis: "x", fixed: -halfSize, normalX: 0, normalZ: -1 },
    { axis: "x", fixed: halfSize, normalX: 0, normalZ: 1 },
    { axis: "z", fixed: -halfSize, normalX: -1, normalZ: 0 },
    { axis: "z", fixed: halfSize, normalX: 1, normalZ: 0 },
  ] as const;

  for (const edge of edges) {
    const startVert = skirtVertIndex;

    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const x = edge.axis === "x" ? -halfSize + t * pageSize : edge.fixed;
      const z = edge.axis === "x" ? edge.fixed : -halfSize + t * pageSize;
      const u = (x + halfSize) / pageSize;
      const v = (z + halfSize) / pageSize;

      newPositions[skirtVertIndex * 3] = x;
      newPositions[skirtVertIndex * 3 + 1] = -skirtDepth;
      newPositions[skirtVertIndex * 3 + 2] = z;
      newUvs[skirtVertIndex * 2] = u;
      newUvs[skirtVertIndex * 2 + 1] = v;
      newNormals[skirtVertIndex * 3] = edge.normalX;
      newNormals[skirtVertIndex * 3 + 1] = 0;
      newNormals[skirtVertIndex * 3 + 2] = edge.normalZ;
      skirtVertIndex += 1;
    }

    for (let index = 0; index < segments; index += 1) {
      const t0 = index / segments;
      const t1 = (index + 1) / segments;
      const x0 = edge.axis === "x" ? -halfSize + t0 * pageSize : edge.fixed;
      const z0 = edge.axis === "x" ? edge.fixed : -halfSize + t0 * pageSize;
      const x1 = edge.axis === "x" ? -halfSize + t1 * pageSize : edge.fixed;
      const z1 = edge.axis === "x" ? edge.fixed : -halfSize + t1 * pageSize;
      const topLeft = findEdgeVertex(x0, z0);
      const topRight = findEdgeVertex(x1, z1);
      const bottomLeft = startVert + index;
      const bottomRight = startVert + index + 1;

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

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(newPositions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(newUvs, 2));
  geometry.setAttribute("normal", new Float32BufferAttribute(newNormals, 3));
  geometry.setIndex(new Uint32BufferAttribute(newIndices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  plane.dispose();
  return geometry;
}

function getClipmapGeometry(config: TerrainConfig, segments: number): BufferGeometry {
  const pageSize = config.streaming.pageSizeMeters;
  const key = `${pageSize}-${segments}-${CLIPMAP_SKIRT_DEPTH_METERS}`;
  const cached = clipmapGeometryCache.get(key);
  if (cached) {
    return cached;
  }

  const geometry = createPlaneWithSkirt(pageSize, segments, CLIPMAP_SKIRT_DEPTH_METERS);
  const halfPage = pageSize / 2;
  const heightRange = estimateHeightRange(config);
  const baseRadius = halfPage * Math.SQRT2;
  geometry.boundingSphere!.radius = Math.sqrt(baseRadius * baseRadius + heightRange * heightRange);
  geometry.boundingSphere!.center.set(0, config.height.baseHeightMeters, 0);
  clipmapGeometryCache.set(key, geometry);
  return geometry;
}

function estimateHeightRange(config: TerrainConfig): number {
  const height = config.height;
  return (
    (height.continental.enabled ? height.continental.amplitudeMeters : 0) +
    (height.mountain.enabled ? height.mountain.amplitudeMeters : 0) +
    (height.hills.enabled ? height.hills.amplitudeMeters : 0) +
    (height.detail.enabled ? height.detail.amplitudeMeters : 0) +
    (height.erosion.enabled ? height.erosion.detailAmplitude : 0)
  ) * 2;
}

export function disposeClipmapGeometries(): void {
  for (const geometry of clipmapGeometryCache.values()) {
    geometry.dispose();
  }
  clipmapGeometryCache.clear();
}

class TerrainClipmapPatch {
  readonly mesh: Mesh;

  private controls: TerrainMaterialUniformControls;
  private assignedPageKey: string | null = null;
  private worldCenterX = 0;
  private worldCenterZ = 0;
  private currentLodIndex = 0;
  private tileInfo = { uOffset: 0, vOffset: 0, uvScale: 1 };

  constructor(
    slotIndex: number,
    private readonly config: TerrainConfig,
    private readonly floatingOrigin: FloatingOrigin,
    private readonly heightTexture: StorageTexture,
    private readonly normalTexture: StorageTexture,
    private textureArrays: TerrainTextureArrayResult | null,
    private splatMapTextures: (Texture | null)[],
  ) {
    const geometry = getClipmapGeometry(config, config.lod.levels[0].segmentsPerSide);
    const { material, controls } = this.createMaterial();
    this.controls = controls;
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = `terrain-clipmap-patch-${slotIndex}`;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
    this.mesh.visible = false;
    this.floatingOrigin.onRebase(this.handleOriginRebase);
  }

  get pageKey(): string | null {
    return this.assignedPageKey;
  }

  setPage(
    coord: ClipmapPageCoord,
    tileInfo: { uOffset: number; vOffset: number; uvScale: number },
    lodIndex: number,
  ): void {
    const key = pageKey(coord.px, coord.pz);
    const pageSize = this.config.streaming.pageSizeMeters;
    this.assignedPageKey = key;
    this.worldCenterX = (coord.px + 0.5) * pageSize;
    this.worldCenterZ = (coord.pz + 0.5) * pageSize;
    this.tileInfo = tileInfo;
    this.controls.tileOffsetU.value = tileInfo.uOffset;
    this.controls.tileOffsetV.value = tileInfo.vOffset;
    this.controls.tileScale.value = tileInfo.uvScale;
    this.controls.pageWorldX.value = this.worldCenterX;
    this.controls.pageWorldZ.value = this.worldCenterZ;
    this.mesh.name = `terrain-clipmap-page-${coord.px}-${coord.pz}`;
    this.mesh.visible = true;
    this.setLod(lodIndex);
    this.updatePosition();
  }

  hide(): void {
    this.assignedPageKey = null;
    this.mesh.visible = false;
  }

  rebuildMaterial(textureArrays: TerrainTextureArrayResult | null, splatMapTextures: (Texture | null)[]): void {
    this.textureArrays = textureArrays;
    this.splatMapTextures = splatMapTextures;

    if (this.mesh.material instanceof MeshStandardNodeMaterial) {
      this.mesh.material.dispose();
    }

    const { material, controls } = this.createMaterial();
    this.controls = controls;
    this.mesh.material = material;

    if (this.assignedPageKey) {
      this.controls.tileOffsetU.value = this.tileInfo.uOffset;
      this.controls.tileOffsetV.value = this.tileInfo.vOffset;
      this.controls.tileScale.value = this.tileInfo.uvScale;
      this.controls.pageWorldX.value = this.worldCenterX;
      this.controls.pageWorldZ.value = this.worldCenterZ;
    }
  }

  dispose(): void {
    this.floatingOrigin.offRebase(this.handleOriginRebase);
    if (this.mesh.material instanceof MeshStandardNodeMaterial) {
      this.mesh.material.dispose();
    }
  }

  private createMaterial() {
    return createControlledTexturedArrayTerrainMaterial(this.config, {
      heightTexture: this.heightTexture,
      normalTexture: this.normalTexture,
      tileUvOffset: { x: this.tileInfo.uOffset, y: this.tileInfo.vOffset },
      tileUvScale: this.tileInfo.uvScale,
      pageWorldX: this.worldCenterX,
      pageWorldZ: this.worldCenterZ,
      pageSize: this.config.streaming.pageSizeMeters,
      textureArrays: this.textureArrays,
      splatMaps: this.splatMapTextures,
    });
  }

  private setLod(lodIndex: number): void {
    if (lodIndex === this.currentLodIndex) {
      return;
    }

    this.currentLodIndex = lodIndex;
    this.mesh.geometry = getClipmapGeometry(this.config, this.config.lod.levels[lodIndex].segmentsPerSide);
  }

  private updatePosition(): void {
    const local = this.floatingOrigin.worldToLocal(this.worldCenterX, 0, this.worldCenterZ);
    this.mesh.position.set(local.x, 0, local.z);
  }

  private handleOriginRebase = (dx: number, _dy: number, dz: number): void => {
    this.mesh.position.x -= dx;
    this.mesh.position.z -= dz;
  };
}

export class TerrainClipmapRenderer {
  private readonly patches: TerrainClipmapPatch[] = [];
  private readonly visiblePageKeys = new Set<string>();
  private textureArrays: TerrainTextureArrayResult | null = null;
  private splatMapTextures: (Texture | null)[] = [];

  constructor(
    private readonly config: TerrainConfig,
    private readonly scene: Scene,
    private readonly floatingOrigin: FloatingOrigin,
    private readonly heightTexture: StorageTexture,
    private readonly normalTexture: StorageTexture,
  ) {
    this.createPatchPool();
  }

  updateView(
    playerWorldX: number,
    playerWorldZ: number,
    allowedPageKeys: ReadonlySet<string>,
    allocator: TileAtlasAllocator,
  ): boolean {
    const pageSize = this.config.streaming.pageSizeMeters;
    const centerPx = Math.floor(playerWorldX / pageSize);
    const centerPz = Math.floor(playerWorldZ / pageSize);
    const viewDistance = this.config.streaming.viewDistancePages;
    const coords: ClipmapPageCoord[] = [];

    for (let dz = -viewDistance; dz <= viewDistance; dz += 1) {
      for (let dx = -viewDistance; dx <= viewDistance; dx += 1) {
        const px = centerPx + dx;
        const pz = centerPz + dz;
        const key = pageKey(px, pz);
        if (allowedPageKeys.has(key) && allocator.hasTile(px, pz)) {
          coords.push({ px, pz });
        }
      }
    }

    coords.sort((left, right) => {
      const leftDistance = (left.px - centerPx) ** 2 + (left.pz - centerPz) ** 2;
      const rightDistance = (right.px - centerPx) ** 2 + (right.pz - centerPz) ** 2;
      return leftDistance - rightDistance;
    });

    const nextVisible = new Set<string>();
    for (let index = 0; index < this.patches.length; index += 1) {
      const patch = this.patches[index];
      const coord = coords[index];
      if (!coord) {
        patch.hide();
        continue;
      }

      const tileInfo = allocator.getPageTileUV(coord.px, coord.pz);
      const lodIndex = this.resolveLodIndex(playerWorldX, playerWorldZ, coord);
      patch.setPage(coord, tileInfo, lodIndex);
      nextVisible.add(pageKey(coord.px, coord.pz));
    }

    const changed = !setsEqual(this.visiblePageKeys, nextVisible);
    this.visiblePageKeys.clear();
    for (const key of nextVisible) {
      this.visiblePageKeys.add(key);
    }
    return changed;
  }

  hasRenderablePage(px: number, pz: number): boolean {
    return this.visiblePageKeys.has(pageKey(px, pz));
  }

  setTextureData(textureArrays: TerrainTextureArrayResult | null, splatMapTextures: (Texture | null)[]): void {
    this.textureArrays = textureArrays;
    this.splatMapTextures = splatMapTextures;
    for (const patch of this.patches) {
      patch.rebuildMaterial(this.textureArrays, this.splatMapTextures);
    }
  }

  dispose(): void {
    for (const patch of this.patches) {
      this.scene.remove(patch.mesh);
      patch.dispose();
    }
    this.patches.length = 0;
  }

  private createPatchPool(): void {
    const side = this.config.streaming.viewDistancePages * 2 + 1;
    const patchCount = side * side;
    for (let index = 0; index < patchCount; index += 1) {
      const patch = new TerrainClipmapPatch(
        index,
        this.config,
        this.floatingOrigin,
        this.heightTexture,
        this.normalTexture,
        this.textureArrays,
        this.splatMapTextures,
      );
      this.patches.push(patch);
      this.scene.add(patch.mesh);
    }
  }

  private resolveLodIndex(playerWorldX: number, playerWorldZ: number, coord: ClipmapPageCoord): number {
    const pageSize = this.config.streaming.pageSizeMeters;
    const centerX = (coord.px + 0.5) * pageSize;
    const centerZ = (coord.pz + 0.5) * pageSize;
    const distance = Math.hypot(playerWorldX - centerX, playerWorldZ - centerZ);

    for (let index = 0; index < this.config.lod.levels.length; index += 1) {
      if (distance <= this.config.lod.levels[index].maxDistanceMeters) {
        return index;
      }
    }

    return this.config.lod.levels.length - 1;
  }
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}
