// FarTerrainSystem: render-only GPU clipmaps for distant terrain vistas.
// FarTerrainSystem：用于远景地形视野的仅渲染 GPU clipmap。

import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  Uint32BufferAttribute,
  type DataTexture,
  type UniformNode,
} from "three/webgpu";
import {
  clamp,
  color,
  float,
  max,
  mix,
  mx_fractal_noise_float,
  positionLocal,
  smoothstep,
  uniform,
  vec3,
} from "three/tsl";
import type { TerrainConfig } from "./terrain";
import type { FloatingOrigin } from "../common/FloatingOrigin";
import { buildTerrainHeightNode, createHashTexture } from "./gpu/TerrainNoiseShader";

type FarTerrainUniforms = {
  centerWorldX: UniformNode<"float", number>;
  centerWorldZ: UniformNode<"float", number>;
};

type FarTerrainStrip = {
  mesh: Mesh;
  uniforms: FarTerrainUniforms;
  offsetX: number;
  offsetZ: number;
};

function estimateHeightRange(config: TerrainConfig): number {
  const hcfg = config.height;
  return (
    (hcfg.continental.enabled ? hcfg.continental.amplitudeMeters : 0) +
    (hcfg.mountain.enabled ? hcfg.mountain.amplitudeMeters : 0) +
    (hcfg.hills.enabled ? hcfg.hills.amplitudeMeters : 0) +
    (hcfg.detail.enabled ? hcfg.detail.amplitudeMeters : 0) +
    (hcfg.erosion.enabled ? hcfg.erosion.detailAmplitude : 0)
  ) * 2;
}

function createGridGeometry(
  widthMeters: number,
  depthMeters: number,
  cellSizeMeters: number,
  heightRangeMeters: number,
): BufferGeometry {
  const segmentsX = Math.max(1, Math.ceil(widthMeters / cellSizeMeters));
  const segmentsZ = Math.max(1, Math.ceil(depthMeters / cellSizeMeters));
  const vertexCount = (segmentsX + 1) * (segmentsZ + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(segmentsX * segmentsZ * 6);

  let vertex = 0;
  for (let z = 0; z <= segmentsZ; z++) {
    const v = z / segmentsZ;
    const localZ = (v - 0.5) * depthMeters;

    for (let x = 0; x <= segmentsX; x++) {
      const u = x / segmentsX;
      const localX = (u - 0.5) * widthMeters;
      const positionOffset = vertex * 3;
      const uvOffset = vertex * 2;

      positions[positionOffset] = localX;
      positions[positionOffset + 1] = 0;
      positions[positionOffset + 2] = localZ;
      uvs[uvOffset] = u;
      uvs[uvOffset + 1] = v;
      vertex += 1;
    }
  }

  let index = 0;
  const row = segmentsX + 1;
  for (let z = 0; z < segmentsZ; z++) {
    for (let x = 0; x < segmentsX; x++) {
      const topLeft = z * row + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + row;
      const bottomRight = bottomLeft + 1;

      indices[index++] = topLeft;
      indices[index++] = bottomLeft;
      indices[index++] = topRight;
      indices[index++] = topRight;
      indices[index++] = bottomLeft;
      indices[index++] = bottomRight;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  if (geometry.boundingSphere) {
    const halfWidth = widthMeters / 2;
    const halfDepth = depthMeters / 2;
    geometry.boundingSphere.radius = Math.sqrt(
      halfWidth * halfWidth + halfDepth * halfDepth + heightRangeMeters * heightRangeMeters,
    );
    geometry.boundingSphere.center.set(0, 0, 0);
  }

  return geometry;
}

function createFarTerrainMaterial(config: TerrainConfig, hashTexture: DataTexture): {
  material: MeshStandardNodeMaterial;
  uniforms: FarTerrainUniforms;
} {
  const material = new MeshStandardNodeMaterial();
  material.name = "far-terrain-gpu-material";
  material.fog = true;
  material.side = DoubleSide;
  material.polygonOffset = true;
  material.polygonOffsetFactor = 2;
  material.polygonOffsetUnits = 2;

  const centerWorldX = uniform(0) as UniformNode<"float", number>;
  const centerWorldZ = uniform(0) as UniformNode<"float", number>;
  const worldX = centerWorldX.add(positionLocal.x);
  const worldZ = centerWorldZ.add(positionLocal.z);
  const height = buildTerrainHeightNode(config, hashTexture, worldX, worldZ);

  material.positionNode = vec3(positionLocal.x, height, positionLocal.z);

  const grass = color(...config.material.grassColorRgb);
  const rock = color(...config.material.rockColorRgb);
  const snow = color(...config.material.snowColorRgb);

  const macroNoise = mx_fractal_noise_float(
    vec3(worldX, float(0), worldZ).mul(float(config.material.macro.frequencyPerMeter)),
    config.material.macro.octaves,
    config.material.macro.lacunarity,
    config.material.macro.diminish,
    config.material.macro.amplitude,
  );
  const macroShift = macroNoise.mul(2).sub(1).mul(float(config.material.macro.heightShiftMeters));
  const grassToRock = smoothstep(
    float(config.material.grassToRockStartMeters).add(macroShift),
    float(config.material.grassToRockEndMeters).add(macroShift),
    height,
  );
  const rockBySlope = smoothstep(
    float(config.material.rockSlopeStart),
    float(config.material.rockSlopeEnd),
    float(0),
  );
  const rockMask = max(grassToRock, rockBySlope);
  const snowMask = smoothstep(
    float(config.material.rockToSnowStartMeters).add(macroShift),
    float(config.material.rockToSnowEndMeters).add(macroShift),
    height,
  );
  const variation = float(0.9).add(clamp(macroNoise, float(0), float(1)).mul(float(0.18)));
  const baseColor = mix(grass.mul(variation), rock.mul(variation), rockMask);

  material.colorNode = mix(baseColor, snow, snowMask);
  material.roughnessNode = float(config.material.roughness);
  material.metalnessNode = float(config.material.metalness);

  return {
    material,
    uniforms: { centerWorldX, centerWorldZ },
  };
}

function disposeMaterial(material: Mesh["material"]): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
  } else {
    material.dispose();
  }
}

export class FarTerrainSystem {
  readonly root = new Group();

  private readonly config: TerrainConfig;
  private readonly floatingOrigin: FloatingOrigin;
  private readonly hashTexture: DataTexture;
  private readonly strips: FarTerrainStrip[] = [];
  private lastCenterWorldX = Number.NaN;
  private lastCenterWorldZ = Number.NaN;
  private lastOriginOffsetX = Number.NaN;
  private lastOriginOffsetZ = Number.NaN;

  constructor(config: TerrainConfig, floatingOrigin: FloatingOrigin) {
    this.config = config;
    this.floatingOrigin = floatingOrigin;
    this.hashTexture = createHashTexture(config.height.seed);
    this.root.name = "far-terrain-clipmaps";

    if (config.farTerrain.enabled) {
      this.buildRings();
    }
  }

  update(playerWorldX: number, playerWorldZ: number): void {
    if (!this.config.farTerrain.enabled || this.strips.length === 0) return;

    const chunkSize = this.config.streaming.chunkSizeMeters;
    const centerWorldX = (Math.floor(playerWorldX / chunkSize) + 0.5) * chunkSize;
    const centerWorldZ = (Math.floor(playerWorldZ / chunkSize) + 0.5) * chunkSize;
    const origin = this.floatingOrigin.getOffset();

    if (
      centerWorldX === this.lastCenterWorldX &&
      centerWorldZ === this.lastCenterWorldZ &&
      origin.x === this.lastOriginOffsetX &&
      origin.z === this.lastOriginOffsetZ
    ) {
      return;
    }

    this.lastCenterWorldX = centerWorldX;
    this.lastCenterWorldZ = centerWorldZ;
    this.lastOriginOffsetX = origin.x;
    this.lastOriginOffsetZ = origin.z;

    for (const strip of this.strips) {
      const stripWorldX = centerWorldX + strip.offsetX;
      const stripWorldZ = centerWorldZ + strip.offsetZ;
      const local = this.floatingOrigin.worldToLocal(stripWorldX, 0, stripWorldZ);

      strip.mesh.position.set(local.x, 0, local.z);
      strip.uniforms.centerWorldX.value = stripWorldX;
      strip.uniforms.centerWorldZ.value = stripWorldZ;
    }
  }

  dispose(): void {
    for (const strip of this.strips) {
      this.root.remove(strip.mesh);
      strip.mesh.geometry.dispose();
      disposeMaterial(strip.mesh.material);
    }

    this.strips.length = 0;
    this.root.clear();
    this.hashTexture.dispose();
  }

  private buildRings(): void {
    const chunkSize = this.config.streaming.chunkSizeMeters;
    // EN: Start slightly under the high-detail chunk edge so the vista never opens a gap while streaming catches up.
    // 中文: 从高精度 chunk 边缘下方轻微重叠开始，避免流式加载追赶时露出空带。
    const nearHalfExtent = (this.config.streaming.viewDistanceChunks + 0.25) * chunkSize;
    let innerHalfExtent = nearHalfExtent;
    const heightRange = estimateHeightRange(this.config);

    for (let ringIndex = 0; ringIndex < this.config.farTerrain.rings.length; ringIndex++) {
      const ring = this.config.farTerrain.rings[ringIndex];
      const outerHalfExtent = innerHalfExtent + ring.widthMeters;

      this.addRingStrip(
        ringIndex,
        "north",
        outerHalfExtent * 2,
        ring.widthMeters,
        ring.cellSizeMeters,
        0,
        innerHalfExtent + ring.widthMeters / 2,
        heightRange,
      );
      this.addRingStrip(
        ringIndex,
        "south",
        outerHalfExtent * 2,
        ring.widthMeters,
        ring.cellSizeMeters,
        0,
        -innerHalfExtent - ring.widthMeters / 2,
        heightRange,
      );
      this.addRingStrip(
        ringIndex,
        "east",
        ring.widthMeters,
        innerHalfExtent * 2,
        ring.cellSizeMeters,
        innerHalfExtent + ring.widthMeters / 2,
        0,
        heightRange,
      );
      this.addRingStrip(
        ringIndex,
        "west",
        ring.widthMeters,
        innerHalfExtent * 2,
        ring.cellSizeMeters,
        -innerHalfExtent - ring.widthMeters / 2,
        0,
        heightRange,
      );

      innerHalfExtent = outerHalfExtent;
    }
  }

  private addRingStrip(
    ringIndex: number,
    sideName: string,
    widthMeters: number,
    depthMeters: number,
    cellSizeMeters: number,
    offsetX: number,
    offsetZ: number,
    heightRangeMeters: number,
  ): void {
    const geometry = createGridGeometry(widthMeters, depthMeters, cellSizeMeters, heightRangeMeters);
    const { material, uniforms } = createFarTerrainMaterial(this.config, this.hashTexture);
    const mesh = new Mesh(geometry, material);
    mesh.name = `far-terrain-ring-${ringIndex}-${sideName}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    this.root.add(mesh);
    this.strips.push({ mesh, uniforms, offsetX, offsetZ });
  }
}