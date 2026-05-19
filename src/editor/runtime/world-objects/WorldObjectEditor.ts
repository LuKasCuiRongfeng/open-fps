// WorldObjectEditor: placement and validation coordinator for authored world objects.
// WorldObjectEditor：世界对象摆放与校验协调器。

import type { PerspectiveCamera } from "three/webgpu";
import { MAP_WORLD_OBJECTS_PATH, sortPageKeys, type MapData } from "@project/MapData";
import {
  cloneWorldObjectCellPack,
  type WorldObjectArchetypeDefinition,
  type WorldObjectCellPack,
  type WorldObjectEntry,
  type WorldObjectManifest,
} from "@game/world/objects";
import type { EditorCommand } from "@editor/runtime/history/EditorCommandHistory";
import { TerrainSurfaceRaycaster } from "@editor/runtime/common";
import { WorldObjectStorage, getWorldObjectCellKey } from "./WorldObjectStorage";
import { WorldObjectOverlay } from "./WorldObjectOverlay";

type TerrainHeightAt = (x: number, z: number) => number;
type TerrainHeightAvailability = (x: number, z: number) => boolean;
type EditorCommandRecorder = (command: EditorCommand) => void;

export type WorldObjectEditMode = "place" | "erase" | "spline";

export interface WorldObjectEditorTarget {
  valid: boolean;
  x: number;
  y: number;
  z: number;
}

interface WorldObjectDataSnapshot {
  manifest: WorldObjectManifest;
  packs: Map<string, WorldObjectCellPack>;
}

const DEFAULT_PLACE_RADIUS_METERS = 4;
const DEFAULT_ERASE_RADIUS_METERS = 8;

export class WorldObjectEditor {
  private readonly raycaster = new TerrainSurfaceRaycaster();
  private readonly overlay: WorldObjectOverlay;
  private manifest: WorldObjectManifest | null = null;
  private packs = new Map<string, WorldObjectCellPack>();
  private previousRegionPaths = new Set<string>();
  private selectedArchetypeId = "";
  private mode: WorldObjectEditMode = "place";
  private activeSplineObjectId: string | null = null;
  private target: WorldObjectEditorTarget = { valid: false, x: 0, y: 0, z: 0 };
  private mapDirectory = "";
  private sequence = 0;
  private _dirty = false;
  private readonly dirtyCellKeys = new Set<string>();
  private commandRecorder: EditorCommandRecorder | null = null;
  private onDirtyChange?: (dirty: boolean) => void;
  private readonly changeSubscribers = new Set<() => void>();

  constructor(overlay: WorldObjectOverlay) {
    this.overlay = overlay;
  }

  get dirty(): boolean {
    return this._dirty;
  }

  get shouldSave(): boolean {
    return this._dirty || this.instanceCount > 0;
  }

  get currentMode(): WorldObjectEditMode {
    return this.mode;
  }

  get currentTarget(): WorldObjectEditorTarget {
    return { ...this.target };
  }

  get brushTargetValid(): boolean {
    return this.target.valid;
  }

  get brushTargetX(): number {
    return this.target.x;
  }

  get brushTargetZ(): number {
    return this.target.z;
  }

  get brushActive(): boolean {
    return false;
  }

  get brushRadius(): number {
    return this.mode === "erase" ? DEFAULT_ERASE_RADIUS_METERS : this.selectedArchetype?.editor?.defaultRadiusMeters ?? DEFAULT_PLACE_RADIUS_METERS;
  }

  get archetypes(): readonly [string, WorldObjectArchetypeDefinition][] {
    return Object.entries(this.manifest?.archetypes ?? {});
  }

  get currentSelectedArchetypeId(): string {
    return this.selectedArchetypeId;
  }

  get selectedArchetype(): WorldObjectArchetypeDefinition | null {
    return this.manifest?.archetypes?.[this.selectedArchetypeId] ?? null;
  }

  get canEditSpline(): boolean {
    return isSplineArchetype(this.selectedArchetype);
  }

  get splineDraftPointCount(): number {
    const object = this.activeSplineObjectId ? this.findObjectById(this.activeSplineObjectId)?.object : null;
    return object?.spline?.points?.length ?? 0;
  }

  get instanceCount(): number {
    let count = 0;
    for (const pack of this.packs.values()) {
      count += pack.objects.length;
    }
    return count;
  }

  getDirtyCellKeys(): string[] {
    return sortPageKeys(this.dirtyCellKeys);
  }

  subscribe(callback: () => void): () => void {
    this.changeSubscribers.add(callback);
    return () => {
      this.changeSubscribers.delete(callback);
    };
  }

  async loadFromMapDirectory(mapDirectory: string, mapData?: MapData | null): Promise<void> {
    const loaded = await WorldObjectStorage.loadWorldObjectData(mapDirectory);
    this.mapDirectory = mapDirectory;
    this.manifest = loaded.manifest;
    this.packs = loaded.packs;
    this.previousRegionPaths = loaded.previousRegionPaths;
    this.dirtyCellKeys.clear();
    this.selectedArchetypeId = this.resolveInitialArchetypeId();
    this.activeSplineObjectId = null;
    this.setDirty(false);
    this.refreshOverlay();
    this.notifyChanged();

    if (mapData && !mapData.objectsPath) {
      mapData.objectsPath = MAP_WORLD_OBJECTS_PATH;
    }
  }

  async saveToMapDirectory(mapDirectory = this.mapDirectory): Promise<void> {
    if (!this.manifest || !this.shouldSave) return;

    this.manifest = await WorldObjectStorage.saveWorldObjectData(
      mapDirectory,
      this.manifest,
      this.packs,
      this.previousRegionPaths,
    );
    this.previousRegionPaths = new Set(Object.values(this.manifest.cells).map((cell) => cell.path));
    this.mapDirectory = mapDirectory;
    this.dirtyCellKeys.clear();
    this.setDirty(false);
    this.notifyChanged();
  }

  applyToMapData(mapData: MapData): void {
    mapData.objectsPath = MAP_WORLD_OBJECTS_PATH;
  }

  setSelectedArchetype(archetypeId: string): void {
    if (!this.manifest?.archetypes?.[archetypeId]) return;

    this.selectedArchetypeId = archetypeId;
    this.activeSplineObjectId = null;
    this.notifyChanged();
  }

  setMode(mode: WorldObjectEditMode): void {
    this.mode = mode;
    this.notifyChanged();
  }

  updateBrushTarget(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: TerrainHeightAt,
    hasHeightAt?: TerrainHeightAvailability,
  ): void {
    const result = this.raycaster.cast(mouseX, mouseY, canvasWidth, canvasHeight, camera, heightAt, hasHeightAt);
    this.target = result.valid
      ? { valid: true, x: result.x, y: result.y, z: result.z }
      : { valid: false, x: 0, y: 0, z: 0 };
    this.notifyChanged();
  }

  startBrush(): void {
    if (!this.target.valid || !this.manifest) return;

    const before = this.captureSnapshot();
    const changed = this.mode === "erase"
      ? this.eraseNearestObject()
      : this.mode === "spline"
        ? this.placeSplinePoint()
        : this.placeSelectedObject();
    if (!changed) return;

    const after = this.captureSnapshot();
    this.recordSnapshotCommand(before, after);
    this.setDirty(true);
    this.refreshOverlay();
    this.notifyChanged();
  }

  endBrush(): void {}

  finishSpline(): void {
    this.activeSplineObjectId = null;
    this.notifyChanged();
  }

  clearSplineDraft(): void {
    if (!this.activeSplineObjectId) return;

    const before = this.captureSnapshot();
    const changed = this.deleteObjectById(this.activeSplineObjectId);
    if (!changed) {
      this.activeSplineObjectId = null;
      this.notifyChanged();
      return;
    }

    const after = this.captureSnapshot();
    this.recordSnapshotCommand(before, after);
    this.activeSplineObjectId = null;
    this.setDirty(true);
    this.refreshOverlay();
    this.notifyChanged();
  }

  deleteNearestSplinePoint(): void {
    if (!this.target.valid || !this.manifest) return;

    const before = this.captureSnapshot();
    const changed = this.removeNearestSplinePoint();
    if (!changed) return;

    const after = this.captureSnapshot();
    this.recordSnapshotCommand(before, after);
    this.setDirty(true);
    this.refreshOverlay();
    this.notifyChanged();
  }

  flushPendingHistory(): void {}

  setOnDirtyChange(callback: (dirty: boolean) => void): void {
    this.onDirtyChange = callback;
  }

  setCommandRecorder(callback: EditorCommandRecorder | null): void {
    this.commandRecorder = callback;
  }

  dispose(): void {
    this.commandRecorder = null;
    this.changeSubscribers.clear();
  }

  private resolveInitialArchetypeId(): string {
    const archetypes = Object.entries(this.manifest?.archetypes ?? {});
    return archetypes.find(([, archetype]) => archetype.layer === "prop")?.[0]
      ?? archetypes.find(([, archetype]) => archetype.render?.kind === "gltf")?.[0]
      ?? archetypes[0]?.[0]
      ?? "";
  }

  private placeSelectedObject(): boolean {
    const archetype = this.selectedArchetype;
    if (!this.manifest || !archetype || !this.selectedArchetypeId) return false;

    const radiusMeters = archetype.editor?.defaultRadiusMeters ?? DEFAULT_PLACE_RADIUS_METERS;
    const object: WorldObjectEntry = {
      id: this.createObjectId(this.selectedArchetypeId),
      layer: archetype.layer,
      archetype: this.selectedArchetypeId,
      position: { x: round(this.target.x), y: round(this.target.y), z: round(this.target.z) },
      rotationY: 0,
      scale: archetype.editor?.defaultScale ?? 1,
      radiusMeters,
      boundsMeters: createBounds(this.target.x, this.target.z, radiusMeters),
      tags: [archetype.layer, "manual"],
      collision: archetype.collision && typeof archetype.collision === "object"
        ? { ...archetype.collision }
        : archetype.collision === true
          ? { type: "box", radiusMeters, heightMeters: Math.max(2, radiusMeters * 0.75) }
          : undefined,
    };

    const cellKey = getWorldObjectCellKey(this.target.x, this.target.z, this.manifest.cellSizeMeters);
    const pack = this.ensureCellPack(cellKey);
    pack.objects.push(object);
    pack.objects.sort((left, right) => left.id.localeCompare(right.id));
    this.dirtyCellKeys.add(cellKey);
    return true;
  }

  private placeSplinePoint(): boolean {
    const archetype = this.selectedArchetype;
    if (!this.manifest || !archetype || !this.selectedArchetypeId || !isSplineArchetype(archetype)) return false;

    const point = { x: round(this.target.x), z: round(this.target.z) };
    const active = this.activeSplineObjectId ? this.findObjectById(this.activeSplineObjectId) : null;
    if (active) {
      const points = active.object.spline?.points ?? [];
      active.object.spline = {
        widthMeters: active.object.spline?.widthMeters ?? createSplineWidth(archetype),
        points: [...points, point],
      };
      active.object.boundsMeters = createSplineBounds(active.object.spline.points ?? [point], active.object.spline.widthMeters ?? createSplineWidth(archetype));
      active.object.radiusMeters = active.object.spline.widthMeters;
      this.dirtyCellKeys.add(active.key);
      return true;
    }

    const widthMeters = createSplineWidth(archetype);
    const object: WorldObjectEntry = {
      id: this.createObjectId(this.selectedArchetypeId),
      layer: archetype.layer,
      archetype: this.selectedArchetypeId,
      position: { x: point.x, y: round(this.target.y), z: point.z },
      rotationY: 0,
      scale: archetype.editor?.defaultScale ?? 1,
      radiusMeters: widthMeters,
      boundsMeters: createSplineBounds([point], widthMeters),
      spline: { widthMeters, points: [point] },
      tags: [archetype.layer, "manual", "spline"],
      collision: archetype.collision && typeof archetype.collision === "object"
        ? { ...archetype.collision }
        : archetype.collision === true
          ? { type: "box", radiusMeters: widthMeters, heightMeters: Math.max(1, widthMeters * 0.25) }
          : undefined,
    };

    const cellKey = getWorldObjectCellKey(this.target.x, this.target.z, this.manifest.cellSizeMeters);
    const pack = this.ensureCellPack(cellKey);
    pack.objects.push(object);
    pack.objects.sort((left, right) => left.id.localeCompare(right.id));
    this.activeSplineObjectId = object.id;
    this.dirtyCellKeys.add(cellKey);
    return true;
  }

  private eraseNearestObject(): boolean {
    let nearest: { key: string; object: WorldObjectEntry; distance: number } | null = null;
    const radius = DEFAULT_ERASE_RADIUS_METERS;

    for (const [key, pack] of this.packs) {
      for (const object of pack.objects) {
        if (object.layer === "road" || object.layer === "water") continue;

        const distance = Math.hypot(object.position.x - this.target.x, object.position.z - this.target.z);
        if (distance <= radius && (!nearest || distance < nearest.distance)) {
          nearest = { key, object, distance };
        }
      }
    }

    if (!nearest) return false;

    const pack = this.packs.get(nearest.key);
    if (!pack) return false;

    pack.objects = pack.objects.filter((object) => object.id !== nearest?.object.id);
    this.dirtyCellKeys.add(nearest.key);
    return true;
  }

  private removeNearestSplinePoint(): boolean {
    let nearest: { key: string; object: WorldObjectEntry; pointIndex: number; distance: number } | null = null;
    const radius = DEFAULT_ERASE_RADIUS_METERS;

    for (const [key, pack] of this.packs) {
      for (const object of pack.objects) {
        const points = object.spline?.points;
        if (!points || points.length === 0) continue;

        for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
          const point = points[pointIndex];
          const distance = Math.hypot(point.x - this.target.x, point.z - this.target.z);
          if (distance <= radius && (!nearest || distance < nearest.distance)) {
            nearest = { key, object, pointIndex, distance };
          }
        }
      }
    }

    if (!nearest) return false;

    const points = nearest.object.spline?.points ?? [];
    if (points.length <= 2) {
      if (this.activeSplineObjectId === nearest.object.id) {
        this.activeSplineObjectId = null;
      }
      return this.deleteObjectById(nearest.object.id);
    }

    const nextPoints = points.filter((_point, index) => index !== nearest.pointIndex);
    nearest.object.spline = {
      ...nearest.object.spline,
      points: nextPoints,
    };
    nearest.object.boundsMeters = createSplineBounds(nextPoints, nearest.object.spline.widthMeters ?? nearest.object.radiusMeters ?? DEFAULT_PLACE_RADIUS_METERS);
    this.dirtyCellKeys.add(nearest.key);
    return true;
  }

  private findObjectById(objectId: string): { key: string; pack: WorldObjectCellPack; object: WorldObjectEntry } | null {
    for (const [key, pack] of this.packs) {
      const object = pack.objects.find((entry) => entry.id === objectId);
      if (object) {
        return { key, pack, object };
      }
    }

    return null;
  }

  private deleteObjectById(objectId: string): boolean {
    const found = this.findObjectById(objectId);
    if (!found) return false;

    found.pack.objects = found.pack.objects.filter((object) => object.id !== objectId);
    this.dirtyCellKeys.add(found.key);
    return true;
  }

  private ensureCellPack(cellKey: string): WorldObjectCellPack {
    let pack = this.packs.get(cellKey);
    if (pack) {
      return pack;
    }

    pack = {
      version: 1,
      format: "world-object-cell-pack-v1",
      cell: createCellInfo(cellKey, this.manifest?.cellSizeMeters ?? 512),
      objects: [],
    };
    this.packs.set(cellKey, pack);
    return pack;
  }

  private refreshOverlay(): void {
    if (!this.manifest || !this.mapDirectory) return;

    this.overlay.setLoadedData(this.mapDirectory, this.manifest, this.packs);
  }

  private captureSnapshot(): WorldObjectDataSnapshot {
    return {
      manifest: this.manifest ? {
        ...this.manifest,
        cells: { ...this.manifest.cells },
        archetypes: this.manifest.archetypes ? { ...this.manifest.archetypes } : undefined,
      } : { cells: {} },
      packs: new Map(Array.from(this.packs.entries()).map(([key, pack]) => [key, cloneWorldObjectCellPack(pack)])),
    };
  }

  private applySnapshot(snapshot: WorldObjectDataSnapshot): void {
    this.manifest = {
      ...snapshot.manifest,
      cells: { ...snapshot.manifest.cells },
      archetypes: snapshot.manifest.archetypes ? { ...snapshot.manifest.archetypes } : undefined,
    };
    this.packs = new Map(Array.from(snapshot.packs.entries()).map(([key, pack]) => [key, cloneWorldObjectCellPack(pack)]));
    for (const key of snapshot.packs.keys()) {
      this.dirtyCellKeys.add(key);
    }
    this.setDirty(true);
    this.refreshOverlay();
    this.notifyChanged();
  }

  private recordSnapshotCommand(before: WorldObjectDataSnapshot, after: WorldObjectDataSnapshot): void {
    this.commandRecorder?.({
      label: this.mode === "erase" ? "Erase world object" : this.mode === "spline" ? "Edit world object spline" : "Place world object",
      undo: () => this.applySnapshot(before),
      redo: () => this.applySnapshot(after),
    });
  }

  private createObjectId(archetypeId: string): string {
    this.sequence += 1;
    const safeArchetypeId = archetypeId.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    return `${safeArchetypeId}-${Date.now().toString(36)}-${this.sequence.toString(36)}`;
  }

  private setDirty(dirty: boolean): void {
    if (this._dirty !== dirty) {
      this._dirty = dirty;
      this.onDirtyChange?.(dirty);
    }
  }

  private notifyChanged(): void {
    for (const subscriber of this.changeSubscribers) {
      subscriber();
    }
  }
}

function createCellInfo(key: string, cellSizeMeters: number) {
  const [x, z] = key.split(",").map(Number);
  return {
    key,
    x,
    z,
    boundsMeters: {
      minX: x * cellSizeMeters,
      minZ: z * cellSizeMeters,
      maxX: (x + 1) * cellSizeMeters,
      maxZ: (z + 1) * cellSizeMeters,
    },
  };
}

function createBounds(x: number, z: number, radiusMeters: number) {
  return {
    minX: round(x - radiusMeters),
    minZ: round(z - radiusMeters),
    maxX: round(x + radiusMeters),
    maxZ: round(z + radiusMeters),
  };
}

function isSplineArchetype(archetype: WorldObjectArchetypeDefinition | null): archetype is WorldObjectArchetypeDefinition {
  return Boolean(archetype && (archetype.editor?.placement === "spline" || archetype.render?.kind === "ribbon" || archetype.layer === "road" || archetype.layer === "water"));
}

function createSplineWidth(archetype: WorldObjectArchetypeDefinition): number {
  return Math.max(3, archetype.editor?.defaultRadiusMeters ?? DEFAULT_PLACE_RADIUS_METERS);
}

function createSplineBounds(points: readonly { x: number; z: number }[], widthMeters: number) {
  const radius = Math.max(1, widthMeters * 0.5);
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    minX: round(Math.min(...xs) - radius),
    minZ: round(Math.min(...zs) - radius),
    maxX: round(Math.max(...xs) + radius),
    maxZ: round(Math.max(...zs) + radius),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
