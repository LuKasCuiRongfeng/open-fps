// RuntimeWorldObjectScene: visible runtime instantiation for cooked world object cells.
// RuntimeWorldObjectScene：cooked 世界对象 cell 的可见运行时实例化。

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  type Object3D,
  type Scene,
} from "three/webgpu";
import { color } from "three/tsl";
import type { WorldObjectCellPack, WorldObjectEntry } from "./WorldPartitionPayloads";
import {
  WorldObjectGltfModelLibrary,
  isGltfWorldObjectArchetype,
  objectRadiusFromBounds,
  type WorldObjectArchetypeDefinition,
} from "../objects";

const ROAD_RIBBON_HEIGHT_METERS = 0.32;
const WATER_RIBBON_HEIGHT_METERS = 0.16;
const SURFACE_OFFSET_METERS = 0.18;
const MARKER_HEIGHT_METERS = 3.5;
const MARKER_RADIUS_METERS = 2.2;
const RIBBON_CHUNK_LENGTH_METERS = 96;

type RuntimeWorldObjectTerrainAvailability = (xMeters: number, zMeters: number) => boolean;

type RuntimeWorldObjectEntry = {
  object: Object3D;
  sampleX: number;
  sampleZ: number;
  kind: "ribbon" | "model" | "fallback";
};

export interface RuntimeWorldObjectProfilerSnapshot {
  activeCells: number;
  objects: number;
  meshes: number;
  modelInstances: number;
  fallbackMeshes: number;
  pendingModels: number;
}

export class RuntimeWorldObjectScene {
  private readonly root = new Group();
  private readonly ribbonGeometry = new BoxGeometry(1, 1, 1);
  private readonly markerGeometry = new CylinderGeometry(1, 1, 1, 12, 1, false);
  private readonly roadMaterial = createMaterial(0.72, 0.46, 0.25, 0.72);
  private readonly waterMaterial = createMaterial(0.18, 0.52, 0.9, 0.64);
  private readonly poiMaterial = createMaterial(0.98, 0.72, 0.25, 0.9);
  private readonly propMaterial = createMaterial(0.72, 0.74, 0.78, 0.78);
  private readonly modelLibrary = new WorldObjectGltfModelLibrary();
  private readonly cells = new Map<string, Group>();
  private readonly entriesByCell = new Map<string, RuntimeWorldObjectEntry[]>();
  private readonly objectCountsByCell = new Map<string, number>();
  private readonly pendingModelLoadsByCell = new Map<string, number>();
  private terrainAvailability: RuntimeWorldObjectTerrainAvailability | null = null;
  private archetypes: Record<string, WorldObjectArchetypeDefinition> = {};
  private assetBaseDirectory = "";
  private scene: Scene | null = null;
  private objectCount = 0;

  constructor() {
    this.root.name = "runtime-world-object-scene";
    this.root.renderOrder = 20;
  }

  attach(scene: Scene): void {
    if (this.scene === scene) {
      return;
    }

    this.detach();
    this.scene = scene;
    scene.add(this.root);
  }

  detach(): void {
    if (!this.scene) {
      return;
    }

    this.scene.remove(this.root);
    this.scene = null;
  }

  setTerrainAvailability(predicate: RuntimeWorldObjectTerrainAvailability | null): void {
    this.terrainAvailability = predicate;
    this.updateTerrainVisibility();
  }

  setAssetContext(baseDirectory: string, archetypes: Record<string, WorldObjectArchetypeDefinition> | null | undefined): void {
    this.assetBaseDirectory = baseDirectory;
    this.archetypes = archetypes ?? {};
    this.clear();
  }

  setCellPayload(key: string, pack: WorldObjectCellPack): void {
    this.removeCell(key);

    const group = new Group();
    group.name = `runtime-world-object-cell-${key}`;
    const entries: RuntimeWorldObjectEntry[] = [];
    for (const object of pack.objects) {
      this.addObject(group, entries, object);
    }

    this.root.add(group);
    this.cells.set(key, group);
    this.entriesByCell.set(key, entries);
    this.objectCountsByCell.set(key, pack.objects.length);
    this.objectCount += pack.objects.length;
    this.updateEntriesTerrainVisibility(entries);
  }

  retainCells(activeKeys: ReadonlySet<string>): void {
    for (const key of this.cells.keys()) {
      if (!activeKeys.has(key)) {
        this.removeCell(key);
      }
    }
  }

  clear(): void {
    for (const key of this.cells.keys()) {
      this.removeCell(key);
    }
    this.objectCount = 0;
  }

  updateTerrainVisibility(): void {
    for (const entries of this.entriesByCell.values()) {
      this.updateEntriesTerrainVisibility(entries);
    }
  }

  getProfilerSnapshot(): RuntimeWorldObjectProfilerSnapshot {
    let meshes = 0;
    let modelInstances = 0;
    let fallbackMeshes = 0;
    for (const entries of this.entriesByCell.values()) {
      meshes += entries.length;
      for (const entry of entries) {
        if (entry.kind === "model") {
          modelInstances += 1;
        } else if (entry.kind === "fallback") {
          fallbackMeshes += 1;
        }
      }
    }

    let pendingModels = 0;
    for (const pending of this.pendingModelLoadsByCell.values()) {
      pendingModels += pending;
    }

    return {
      activeCells: this.cells.size,
      objects: this.objectCount,
      meshes,
      modelInstances,
      fallbackMeshes,
      pendingModels,
    };
  }

  dispose(): void {
    this.detach();
    this.clear();
    this.ribbonGeometry.dispose();
    this.markerGeometry.dispose();
    this.roadMaterial.dispose();
    this.waterMaterial.dispose();
    this.poiMaterial.dispose();
    this.propMaterial.dispose();
    this.modelLibrary.dispose();
  }

  private removeCell(key: string): void {
    const group = this.cells.get(key);
    if (!group) {
      return;
    }

    this.objectCount -= this.objectCountsByCell.get(key) ?? 0;
    group.removeFromParent();
    group.clear();
    this.cells.delete(key);
    this.entriesByCell.delete(key);
    this.objectCountsByCell.delete(key);
    this.pendingModelLoadsByCell.delete(key);
  }

  private addObject(group: Group, entries: RuntimeWorldObjectEntry[], object: WorldObjectEntry): void {
    if (object.layer === "road" || object.layer === "water") {
      this.addRibbonObject(group, entries, object);
      return;
    }

    const archetype = this.archetypes[object.archetype];
    if (isGltfWorldObjectArchetype(archetype) && this.assetBaseDirectory) {
      this.addModelObject(group, entries, object, archetype);
      return;
    }

    this.addMarkerObject(group, entries, object);
  }

  private addModelObject(
    group: Group,
    entries: RuntimeWorldObjectEntry[],
    object: WorldObjectEntry,
    archetype: WorldObjectArchetypeDefinition & { render: NonNullable<WorldObjectArchetypeDefinition["render"]> & { path: string } },
  ): void {
    const cellKey = group.name.replace("runtime-world-object-cell-", "");
    this.pendingModelLoadsByCell.set(cellKey, (this.pendingModelLoadsByCell.get(cellKey) ?? 0) + 1);
    void this.modelLibrary.loadModel(this.assetBaseDirectory, archetype.render)
      .then((model) => {
        if (this.cells.get(cellKey) !== group) {
          return;
        }

        const modelObject = this.modelLibrary.createInstance(model, archetype.render, object);
        modelObject.traverse((child) => {
          child.frustumCulled = true;
        });
        group.add(modelObject);
        entries.push({ object: modelObject, sampleX: object.position.x, sampleZ: object.position.z, kind: "model" });
        this.updateEntriesTerrainVisibility([entries[entries.length - 1]]);
      })
      .catch((error: unknown) => {
        console.warn(`[RuntimeWorldObjectScene] Failed to load model for '${object.archetype}'`, error);
        if (this.cells.get(cellKey) === group) {
          this.addMarkerObject(group, entries, object);
        }
      })
      .finally(() => {
        const pending = (this.pendingModelLoadsByCell.get(cellKey) ?? 1) - 1;
        if (pending > 0) {
          this.pendingModelLoadsByCell.set(cellKey, pending);
        } else {
          this.pendingModelLoadsByCell.delete(cellKey);
        }
      });
  }

  private addRibbonObject(group: Group, entries: RuntimeWorldObjectEntry[], object: WorldObjectEntry): void {
    const widthMeters = Math.max(3, object.spline?.widthMeters ?? objectRadiusFromBounds(object) * 0.5);
    const points = object.spline?.points;
    if (!points || points.length < 2) {
      this.addRibbonChunk(group, entries, object, object.position.x, object.position.y, object.position.z, object.rotationY ?? 0, Math.max(widthMeters, objectRadiusFromBounds(object) * 2), widthMeters, 0);
      return;
    }

    let chunkIndex = 0;
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      const start = points[pointIndex];
      const end = points[pointIndex + 1];
      const segmentLength = Math.hypot(end.x - start.x, end.z - start.z);
      const chunkCount = Math.max(1, Math.ceil(segmentLength / RIBBON_CHUNK_LENGTH_METERS));
      for (let index = 0; index < chunkCount; index += 1) {
        const t0 = index / chunkCount;
        const t1 = (index + 1) / chunkCount;
        const centerT = (t0 + t1) * 0.5;
        const centerX = start.x + (end.x - start.x) * centerT;
        const centerZ = start.z + (end.z - start.z) * centerT;
        const rotationY = Math.atan2(end.x - start.x, end.z - start.z);
        this.addRibbonChunk(group, entries, object, centerX, object.position.y, centerZ, rotationY, segmentLength / chunkCount, widthMeters, chunkIndex);
        chunkIndex += 1;
      }
    }
  }

  private addRibbonChunk(
    group: Group,
    entries: RuntimeWorldObjectEntry[],
    object: WorldObjectEntry,
    x: number,
    y: number,
    z: number,
    rotationY: number,
    lengthMeters: number,
    widthMeters: number,
    chunkIndex: number,
  ): void {
    const mesh = new Mesh(this.ribbonGeometry, object.layer === "water" ? this.waterMaterial : this.roadMaterial);
    const heightMeters = object.layer === "water" ? WATER_RIBBON_HEIGHT_METERS : ROAD_RIBBON_HEIGHT_METERS;

    mesh.name = `runtime-world-object-${object.layer}-${object.id}-${chunkIndex}`;
    mesh.position.set(x, y + SURFACE_OFFSET_METERS, z);
    mesh.rotation.y = rotationY;
    mesh.scale.set(widthMeters, heightMeters, lengthMeters);
    mesh.frustumCulled = true;
    mesh.renderOrder = this.root.renderOrder;
    group.add(mesh);
    entries.push({ object: mesh, sampleX: x, sampleZ: z, kind: "ribbon" });
  }

  private addMarkerObject(group: Group, entries: RuntimeWorldObjectEntry[], object: WorldObjectEntry): void {
    const mesh = new Mesh(this.markerGeometry, object.layer === "poi" ? this.poiMaterial : this.propMaterial);
    const markerRadius = Math.max(1.25, Math.min(MARKER_RADIUS_METERS, object.radiusMeters ?? objectRadiusFromBounds(object) * 0.18));
    const markerHeight = object.layer === "poi" ? MARKER_HEIGHT_METERS : MARKER_HEIGHT_METERS * 0.55;

    mesh.name = `runtime-world-object-${object.layer}-${object.id}`;
    mesh.position.set(object.position.x, object.position.y + markerHeight * 0.5 + SURFACE_OFFSET_METERS, object.position.z);
    mesh.scale.set(markerRadius, markerHeight, markerRadius);
    mesh.frustumCulled = true;
    mesh.renderOrder = this.root.renderOrder;
    group.add(mesh);
    entries.push({ object: mesh, sampleX: object.position.x, sampleZ: object.position.z, kind: "fallback" });
  }

  private updateEntriesTerrainVisibility(entries: readonly RuntimeWorldObjectEntry[]): void {
    for (const entry of entries) {
      entry.object.visible = this.terrainAvailability?.(entry.sampleX, entry.sampleZ) ?? true;
    }
  }
}

function createMaterial(red: number, green: number, blue: number, opacity: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = color(red, green, blue);
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = false;
  material.depthTest = true;
  material.fog = true;
  return material;
}
