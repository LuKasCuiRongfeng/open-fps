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
export type WorldObjectSplineOperation = "append" | "insert" | "move";

export interface WorldObjectPlacementBudgetStatus {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
  blocked: boolean;
}

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
  private splineOperation: WorldObjectSplineOperation = "append";
  private activeSplineObjectId: string | null = null;
  private lastBudgetBlock: string | null = null;
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

  get currentSplineOperation(): WorldObjectSplineOperation {
    return this.splineOperation;
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

  get activeSplineWidthMeters(): number {
    const object = this.activeSplineObjectId ? this.findObjectById(this.activeSplineObjectId)?.object : null;
    return object?.spline?.widthMeters ?? createSplineWidth(this.selectedArchetype ?? undefined);
  }

  get placementBudgetStatus(): WorldObjectPlacementBudgetStatus {
    return this.createPlacementBudgetStatus();
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
    this.lastBudgetBlock = null;
    this.notifyChanged();
  }

  setMode(mode: WorldObjectEditMode): void {
    this.mode = mode;
    this.lastBudgetBlock = null;
    this.notifyChanged();
  }

  setSplineOperation(operation: WorldObjectSplineOperation): void {
    this.splineOperation = operation;
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
    if (this.lastBudgetBlock) {
      this.lastBudgetBlock = null;
    }
    this.notifyChanged();
  }

  startBrush(): void {
    if (!this.target.valid || !this.manifest) return;

    const before = this.captureSnapshot();
    const changed = this.mode === "erase"
      ? this.eraseNearestObject()
      : this.mode === "spline"
        ? this.editSplineObject()
        : this.placeSelectedObjectWithPlacementRules();
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

  selectNearestSpline(): void {
    if (!this.target.valid) return;

    const nearest = this.findNearestSplinePoint(DEFAULT_ERASE_RADIUS_METERS) ?? this.findNearestSplineSegment(DEFAULT_ERASE_RADIUS_METERS);
    if (!nearest) return;

    this.activeSplineObjectId = nearest.object.id;
    this.notifyChanged();
  }

  nudgeActiveSplineWidth(deltaMeters: number): void {
    const target = this.activeSplineObjectId ? this.findObjectById(this.activeSplineObjectId) : this.findNearestSplinePoint(DEFAULT_ERASE_RADIUS_METERS);
    if (!target?.object.spline?.points?.length) return;

    const before = this.captureSnapshot();
    const currentWidth = target.object.spline.widthMeters ?? target.object.radiusMeters ?? createSplineWidth(this.selectedArchetype ?? undefined);
    updateSplineObjectGeometry(target.object, target.object.spline.points, Math.max(2, currentWidth + deltaMeters));
    this.activeSplineObjectId = target.object.id;
    this.dirtyCellKeys.add(target.key);
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

  private placeSelectedObjectWithPlacementRules(): boolean {
    const budget = this.createPlacementBudgetStatus();
    if (budget.blocked) {
      this.lastBudgetBlock = budget.label;
      this.notifyChanged();
      return false;
    }

    const archetype = this.selectedArchetype;
    if (archetype?.editor?.placement === "prefab" && archetype.prefab?.length) {
      return this.placePrefabObject();
    }

    if (archetype?.editor?.placement === "scatter") {
      return this.placeScatterObjects();
    }

    return this.placeSelectedObject();
  }

  private placeSelectedObject(): boolean {
    const archetype = this.selectedArchetype;
    if (!this.manifest || !archetype || !this.selectedArchetypeId) return false;

    return this.addObjectToTargetCell(createObjectEntry(
      this.createObjectId(this.selectedArchetypeId),
      this.selectedArchetypeId,
      archetype,
      this.target.x,
      this.target.y,
      this.target.z,
      [archetype.layer, "manual"],
    ));
  }

  private placePrefabObject(): boolean {
    const archetype = this.selectedArchetype;
    if (!this.manifest || !archetype || !this.selectedArchetypeId) return false;

    const rootId = this.createObjectId(this.selectedArchetypeId);
    const objects: WorldObjectEntry[] = [createObjectEntry(
      rootId,
      this.selectedArchetypeId,
      archetype,
      this.target.x,
      this.target.y,
      this.target.z,
      [archetype.layer, "manual", "prefab-root"],
    )];

    for (const child of archetype.prefab ?? []) {
      const childArchetype = this.manifest.archetypes?.[child.archetype];
      if (!childArchetype) continue;

      objects.push(createObjectEntry(
        this.createObjectId(child.archetype),
        child.archetype,
        childArchetype,
        this.target.x + (child.offsetX ?? 0),
        this.target.y,
        this.target.z + (child.offsetZ ?? 0),
        [childArchetype.layer, "manual", "prefab-child", rootId],
        child.rotationY ?? 0,
        child.scale,
      ));
    }

    return this.addObjects(objects);
  }

  private placeScatterObjects(): boolean {
    const archetype = this.selectedArchetype;
    if (!this.manifest || !archetype || !this.selectedArchetypeId) return false;

    const count = estimateScatterPlacementCount(archetype);
    const radius = archetype.editor?.defaultRadiusMeters ?? DEFAULT_PLACE_RADIUS_METERS;
    const objects: WorldObjectEntry[] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399963229728653;
      const distance = radius * Math.sqrt((index + 0.5) / count) * 0.88;
      const x = this.target.x + Math.cos(angle) * distance;
      const z = this.target.z + Math.sin(angle) * distance;
      objects.push(createObjectEntry(
        this.createObjectId(this.selectedArchetypeId),
        this.selectedArchetypeId,
        archetype,
        x,
        this.target.y,
        z,
        [archetype.layer, "manual", "scatter"],
        angle,
      ));
    }

    return this.addObjects(objects);
  }

  private addObjectToTargetCell(object: WorldObjectEntry): boolean {
    return this.addObjects([object]);
  }

  private addObjects(objects: WorldObjectEntry[]): boolean {
    if (!this.manifest || objects.length === 0) return false;

    for (const object of objects) {
      const cellKey = getWorldObjectCellKey(object.position.x, object.position.z, this.manifest.cellSizeMeters);
      const pack = this.ensureCellPack(cellKey);
      pack.objects.push(object);
      pack.objects.sort((left, right) => left.id.localeCompare(right.id));
      this.dirtyCellKeys.add(cellKey);
    }

    return true;
  }

  private editSplineObject(): boolean {
    switch (this.splineOperation) {
      case "insert":
        return this.insertSplinePoint();
      case "move":
        return this.moveNearestSplinePoint();
      default:
        return this.placeSplinePoint();
    }
  }

  private placeSplinePoint(): boolean {
    const archetype = this.selectedArchetype;
    if (!this.manifest || !archetype || !this.selectedArchetypeId || !isSplineArchetype(archetype)) return false;

    const point = { x: round(this.target.x), z: round(this.target.z) };
    const active = this.activeSplineObjectId ? this.findObjectById(this.activeSplineObjectId) : null;
    if (active) {
      const points = active.object.spline?.points ?? [];
      updateSplineObjectGeometry(active.object, [...points, point], active.object.spline?.widthMeters ?? createSplineWidth(archetype));
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

  private insertSplinePoint(): boolean {
    const archetype = this.selectedArchetype;
    if (!this.manifest || !archetype || !isSplineArchetype(archetype)) return false;

    const nearest = this.findNearestSplineSegment(DEFAULT_ERASE_RADIUS_METERS);
    if (!nearest) {
      return this.placeSplinePoint();
    }

    const points = nearest.object.spline?.points ?? [];
    const point = { x: round(this.target.x), z: round(this.target.z) };
    const nextPoints = [
      ...points.slice(0, nearest.segmentIndex + 1),
      point,
      ...points.slice(nearest.segmentIndex + 1),
    ];
    updateSplineObjectGeometry(nearest.object, nextPoints, nearest.object.spline?.widthMeters ?? createSplineWidth(archetype));
    this.activeSplineObjectId = nearest.object.id;
    this.dirtyCellKeys.add(nearest.key);
    return true;
  }

  private moveNearestSplinePoint(): boolean {
    const nearest = this.findNearestSplinePoint(DEFAULT_ERASE_RADIUS_METERS);
    if (!nearest) return false;

    const points = nearest.object.spline?.points ?? [];
    const nextPoints = points.map((point, index) => index === nearest.pointIndex ? { x: round(this.target.x), z: round(this.target.z) } : point);
    updateSplineObjectGeometry(nearest.object, nextPoints, nearest.object.spline?.widthMeters ?? nearest.object.radiusMeters ?? DEFAULT_PLACE_RADIUS_METERS);
    this.activeSplineObjectId = nearest.object.id;
    this.dirtyCellKeys.add(nearest.key);
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
    const nearest = this.findNearestSplinePoint(DEFAULT_ERASE_RADIUS_METERS);
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

  private findNearestSplinePoint(radiusMeters: number): { key: string; object: WorldObjectEntry; pointIndex: number; distance: number } | null {
    let nearest: { key: string; object: WorldObjectEntry; pointIndex: number; distance: number } | null = null;

    for (const [key, pack] of this.packs) {
      for (const object of pack.objects) {
        const points = object.spline?.points;
        if (!points || points.length === 0) continue;

        for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
          const point = points[pointIndex];
          const distance = Math.hypot(point.x - this.target.x, point.z - this.target.z);
          if (distance <= radiusMeters && (!nearest || distance < nearest.distance)) {
            nearest = { key, object, pointIndex, distance };
          }
        }
      }
    }

    return nearest;
  }

  private findNearestSplineSegment(radiusMeters: number): { key: string; object: WorldObjectEntry; segmentIndex: number; distance: number } | null {
    let nearest: { key: string; object: WorldObjectEntry; segmentIndex: number; distance: number } | null = null;

    for (const [key, pack] of this.packs) {
      for (const object of pack.objects) {
        const points = object.spline?.points;
        if (!points || points.length < 2) continue;

        for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
          const distance = distancePointToSegment(this.target.x, this.target.z, points[segmentIndex], points[segmentIndex + 1]);
          if (distance <= radiusMeters && (!nearest || distance < nearest.distance)) {
            nearest = { key, object, segmentIndex, distance };
          }
        }
      }
    }

    return nearest;
  }

  private createPlacementBudgetStatus(): WorldObjectPlacementBudgetStatus {
    if (this.lastBudgetBlock) {
      return { label: this.lastBudgetBlock, tone: "danger", blocked: true };
    }

    const archetype = this.selectedArchetype;
    const cap = archetype?.budget?.maxInstancesPerCell;
    if (!this.manifest || !archetype || !this.selectedArchetypeId || !this.target.valid || !Number.isFinite(cap)) {
      return { label: "No per-cell cap", tone: "neutral", blocked: false };
    }

    const maxInstances = Math.max(0, Math.floor(cap ?? 0));
    const cellKey = getWorldObjectCellKey(this.target.x, this.target.z, this.manifest.cellSizeMeters);
    const group = archetype.budget?.lodGroup ?? this.selectedArchetypeId;
    const currentCount = this.countBudgetGroupObjects(cellKey, group);
    const nextCount = currentCount + estimatePlacementObjectCount(archetype);
    const label = `${nextCount}/${maxInstances} ${group}`;
    return {
      label,
      tone: nextCount > maxInstances ? "danger" : nextCount >= maxInstances * 0.85 ? "warning" : "success",
      blocked: nextCount > maxInstances,
    };
  }

  private countBudgetGroupObjects(cellKey: string, group: string): number {
    const pack = this.packs.get(cellKey);
    if (!pack) return 0;

    return pack.objects.filter((object) => {
      const archetype = this.manifest?.archetypes?.[object.archetype];
      return (archetype?.budget?.lodGroup ?? object.archetype) === group;
    }).length;
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

function isSplineArchetype(archetype: WorldObjectArchetypeDefinition | null | undefined): archetype is WorldObjectArchetypeDefinition {
  return Boolean(archetype && (archetype.editor?.placement === "spline" || archetype.render?.kind === "ribbon" || archetype.layer === "road" || archetype.layer === "water"));
}

function createObjectEntry(
  id: string,
  archetypeId: string,
  archetype: WorldObjectArchetypeDefinition,
  x: number,
  y: number,
  z: number,
  tags: string[],
  rotationY = 0,
  scale = archetype.editor?.defaultScale ?? 1,
): WorldObjectEntry {
  const radiusMeters = archetype.editor?.defaultRadiusMeters ?? DEFAULT_PLACE_RADIUS_METERS;
  return {
    id,
    layer: archetype.layer,
    archetype: archetypeId,
    position: { x: round(x), y: round(y), z: round(z) },
    rotationY,
    scale,
    radiusMeters,
    boundsMeters: createBounds(x, z, radiusMeters),
    tags,
    collision: archetype.collision && typeof archetype.collision === "object"
      ? { ...archetype.collision }
      : archetype.collision === true
        ? { type: "box", radiusMeters, heightMeters: Math.max(2, radiusMeters * 0.75) }
        : undefined,
  };
}

function estimatePlacementObjectCount(archetype: WorldObjectArchetypeDefinition): number {
  if (archetype.editor?.placement === "prefab" && archetype.prefab?.length) {
    return 1 + archetype.prefab.length;
  }

  if (archetype.editor?.placement === "scatter") {
    return estimateScatterPlacementCount(archetype);
  }

  return 1;
}

function estimateScatterPlacementCount(archetype: WorldObjectArchetypeDefinition): number {
  const radius = archetype.editor?.defaultRadiusMeters ?? DEFAULT_PLACE_RADIUS_METERS;
  const density = archetype.scatter?.densityPerSquareMeter ?? 0.003;
  const spacing = Math.max(1, archetype.scatter?.minSpacingMeters ?? radius * 0.35);
  const areaCount = Math.floor(Math.PI * radius * radius * density);
  const spacingCount = Math.floor((Math.PI * radius * radius) / (spacing * spacing * 1.8));
  const cap = Math.max(1, Math.floor(archetype.budget?.maxInstancesPerCell ?? 12));
  return Math.max(1, Math.min(cap, Math.max(3, Math.min(areaCount, spacingCount))));
}

function createSplineWidth(archetype: WorldObjectArchetypeDefinition | null | undefined): number {
  return Math.max(3, archetype?.editor?.defaultRadiusMeters ?? DEFAULT_PLACE_RADIUS_METERS);
}

function updateSplineObjectGeometry(object: WorldObjectEntry, points: readonly { x: number; z: number }[], widthMeters: number): void {
  const nextPoints = points.map((point) => ({ x: round(point.x), z: round(point.z) }));
  object.spline = {
    ...object.spline,
    widthMeters: round(widthMeters),
    points: nextPoints,
  };
  object.boundsMeters = createSplineBounds(nextPoints, widthMeters);
  object.radiusMeters = widthMeters;
  const center = createSplineCenter(nextPoints);
  object.position = {
    ...object.position,
    x: center.x,
    z: center.z,
  };
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

function createSplineCenter(points: readonly { x: number; z: number }[]) {
  if (points.length === 0) {
    return { x: 0, z: 0 };
  }

  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  return { x: round(total.x / points.length), z: round(total.z / points.length) };
}

function distancePointToSegment(x: number, z: number, start: { x: number; z: number }, end: { x: number; z: number }): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) {
    return Math.hypot(x - start.x, z - start.z);
  }

  const t = Math.min(1, Math.max(0, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared));
  return Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
