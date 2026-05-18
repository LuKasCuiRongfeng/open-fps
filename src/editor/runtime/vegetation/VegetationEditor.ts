// VegetationEditor: editor coordinator for vegetation model placement.
// VegetationEditor：植被模型摆放的编辑器协调器。

import type { PerspectiveCamera } from "three/webgpu";
import {
  cloneVegetationData,
  createEmptyVegetationData,
  createVegetationModelDefinition,
  DEFAULT_VEGETATION_CELL_SIZE_METERS,
  VEGETATION_MODELS_PATH,
  getVegetationCellKey,
  getVegetationCellKeysForWorldBounds,
  getVegetationRegionKeys,
  isSupportedVegetationModelPath,
  type VegetationBrushMode,
  type VegetationInstance,
  type VegetationMapData,
  type VegetationModelStats,
  type VegetationModelDefinition,
  type VegetationScene,
} from "@game/world/vegetation";
import { VegetationBrush, type VegetationBrushSettings } from "./VegetationBrush";
import { VegetationStorage } from "./VegetationStorage";
import { sortPageKeys, type MapData } from "@project/MapData";
import type { EditorCommand } from "@editor/runtime/history/EditorCommandHistory";

type TerrainHeightAt = (x: number, z: number) => number;
type TerrainHeightAvailability = (x: number, z: number) => boolean;
type EditorCommandRecorder = (command: EditorCommand) => void;

interface VegetationBrushStrokeSession {
  beforeCells: Map<string, VegetationInstance[]>;
  cellKeys: Set<string>;
  changed: boolean;
}

interface VegetationCellSnapshot {
  cellSizeMeters: number;
  cells: Array<{ key: string; instances: VegetationInstance[] }>;
}

const MAX_PLACEMENTS_PER_FRAME = 16;
const ERASE_EPSILON_METERS = 0.0001;

export class VegetationEditor {
  private readonly brush = new VegetationBrush();
  private readonly scene: VegetationScene;
  private data: VegetationMapData = createEmptyVegetationData();
  private selectedModelId = "";
  private placementAccumulator = 0;
  private sequence = 0;
  private cellSizeMeters = DEFAULT_VEGETATION_CELL_SIZE_METERS;
  private loadedRegionKeys = new Set<string>();
  private readonly dirtyCellKeys = new Set<string>();
  private _dirty = false;
  private activeBrushStroke: VegetationBrushStrokeSession | null = null;
  private commandPlaybackInProgress = false;
  private commandRecorder: EditorCommandRecorder | null = null;
  private onDirtyChange?: (dirty: boolean) => void;
  private readonly changeSubscribers = new Set<() => void>();
  private readonly unsubscribeSceneChange: () => void;

  constructor(scene: VegetationScene) {
    this.scene = scene;
    this.unsubscribeSceneChange = scene.subscribe(() => this.notifyChanged());
  }

  get brushSettings(): Readonly<VegetationBrushSettings> {
    return this.brush.settings;
  }

  get brushActive(): boolean {
    return this.brush.active;
  }

  get brushTargetValid(): boolean {
    return this.brush.targetValid;
  }

  get brushTargetX(): number {
    return this.brush.targetX;
  }

  get brushTargetZ(): number {
    return this.brush.targetZ;
  }

  get dirty(): boolean {
    return this._dirty;
  }

  get modelDefinitions(): readonly VegetationModelDefinition[] {
    return Object.values(this.data.models);
  }

  get currentSelectedModelId(): string {
    return this.selectedModelId;
  }

  get selectedModel(): Readonly<VegetationModelDefinition> | null {
    return this.data.models[this.selectedModelId] ?? null;
  }

  get selectedModelStats(): VegetationModelStats | null {
    return this.selectedModelId ? this.scene.getModelStats(this.selectedModelId) : null;
  }

  get instanceCount(): number {
    return this.data.instances.length;
  }

  get shouldSave(): boolean {
    return this._dirty || this.modelDefinitions.length > 0 || this.data.instances.length > 0;
  }

  subscribe(callback: () => void): () => void {
    this.changeSubscribers.add(callback);
    return () => {
      this.changeSubscribers.delete(callback);
    };
  }

  async loadFromMapDirectory(mapDirectory: string, mapData?: MapData | null): Promise<void> {
    const loaded = await VegetationStorage.loadVegetationData(mapDirectory, mapData);
    this.cellSizeMeters = loaded.cellSizeMeters;
    this.loadedRegionKeys = new Set(loaded.regionKeys);
    this.dirtyCellKeys.clear();
    this.data = loaded.data;
    this.selectedModelId = this.modelDefinitions[0]?.id ?? "";
    this.placementAccumulator = 0;
    await this.scene.setData(mapDirectory, this.data);
    this.setDirty(false);
    this.notifyChanged();
  }

  async saveToMapDirectory(mapDirectory: string): Promise<void> {
    if (!this.shouldSave) return;

    await VegetationStorage.saveVegetationData(mapDirectory, this.data, this.cellSizeMeters, this.loadedRegionKeys);
    this.loadedRegionKeys = new Set(getVegetationRegionKeys(this.data, this.cellSizeMeters));
    this.dirtyCellKeys.clear();
    this.setDirty(false);
  }

  applyToMapData(mapData: MapData): void {
    mapData.vegetationPath = VEGETATION_MODELS_PATH;
  }

  getDataSnapshot(): VegetationMapData {
    return cloneVegetationData(this.data);
  }

  getDirtyCellKeys(): string[] {
    return sortPageKeys(this.dirtyCellKeys);
  }

  setSelectedModel(modelId: string): void {
    if (this.data.models[modelId]) {
      this.selectedModelId = modelId;
      this.notifyChanged();
    }
  }

  addModel(path: string, name: string): VegetationModelDefinition | null {
    if (!isSupportedVegetationModelPath(path)) {
      console.warn(`[VegetationEditor] Unsupported model path: ${path}`);
      return null;
    }

    const definition = createVegetationModelDefinition(path, name, Object.keys(this.data.models));
    this.data.models[definition.id] = definition;
    this.selectedModelId = definition.id;
    this.setDirty(true);
    this.scene.requestRebuild();
    this.notifyChanged();
    return definition;
  }

  setSelectedModelTargetHeight(heightMeters: number): void {
    const model = this.data.models[this.selectedModelId];
    if (!model) return;

    const nextHeight = Math.max(0.25, Math.min(200, heightMeters));
    if (model.targetHeightMeters === nextHeight) return;

    model.targetHeightMeters = nextHeight;
    this.setDirty(true);
    this.scene.syncInstances(this.selectedModelId);
    this.notifyChanged();
  }

  setSelectedModelLod1Path(path: string): void {
    this.setSelectedModelPathField("lod1Path", path);
  }

  setSelectedModelLod2Path(path: string): void {
    this.setSelectedModelPathField("lod2Path", path);
  }

  setSelectedModelLod1Distance(distanceMeters: number): void {
    const model = this.data.models[this.selectedModelId];
    if (!model) return;

    const nextDistance = Math.max(5, Math.min(1000, distanceMeters));
    if (model.lod1DistanceMeters === nextDistance) return;

    model.lod1DistanceMeters = nextDistance;
    model.lod2DistanceMeters = Math.max(model.lod2DistanceMeters, nextDistance);
    this.markModelVisibilityChanged();
  }

  setSelectedModelLod2Distance(distanceMeters: number): void {
    const model = this.data.models[this.selectedModelId];
    if (!model) return;

    const nextDistance = Math.max(model.lod1DistanceMeters, Math.min(1000, distanceMeters));
    if (model.lod2DistanceMeters === nextDistance) return;

    model.lod2DistanceMeters = nextDistance;
    this.markModelVisibilityChanged();
  }

  setSelectedModelMaxVisibleDistance(distanceMeters: number): void {
    const model = this.data.models[this.selectedModelId];
    if (!model) return;

    const nextDistance = Math.max(10, Math.min(2000, distanceMeters));
    if (model.maxVisibleDistanceMeters === nextDistance) return;

    model.maxVisibleDistanceMeters = nextDistance;
    model.shadowDistanceMeters = Math.min(model.shadowDistanceMeters, nextDistance);
    this.markModelVisibilityChanged();
  }

  setSelectedModelShadowDistance(distanceMeters: number): void {
    const model = this.data.models[this.selectedModelId];
    if (!model) return;

    const nextDistance = Math.max(0, Math.min(model.maxVisibleDistanceMeters, distanceMeters));
    if (model.shadowDistanceMeters === nextDistance) return;

    model.shadowDistanceMeters = nextDistance;
    this.markModelVisibilityChanged();
  }

  setBrushMode(mode: VegetationBrushMode): void {
    this.brush.setMode(mode);
    this.notifyChanged();
  }

  setBrushRadius(radius: number): void {
    this.brush.setRadius(radius);
    this.notifyChanged();
  }

  setDensityPerSecond(density: number): void {
    this.brush.setDensityPerSecond(density);
    this.notifyChanged();
  }

  setScaleMin(scale: number): void {
    this.brush.setScaleMin(scale);
    this.notifyChanged();
  }

  setScaleMax(scale: number): void {
    this.brush.setScaleMax(scale);
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
    this.brush.updateTarget(mouseX, mouseY, canvasWidth, canvasHeight, camera, heightAt, hasHeightAt);
  }

  startBrush(): void {
    this.brush.start();
    if (this.brush.active && this.brushSettings.mode === "place") {
      this.placementAccumulator = 1;
    }
  }

  endBrush(): void {
    this.brush.stop();
    this.placementAccumulator = 0;
    this.finishBrushStroke();
  }

  applyBrush(dt: number, heightAt: TerrainHeightAt, hasHeightAt?: TerrainHeightAvailability): void {
    if (this.commandPlaybackInProgress || !this.brush.active || !this.brush.targetValid) return;

    const brushCellKeys = this.getCurrentBrushCellKeys();
    const brushStroke = this.ensureBrushStrokeSession();
    this.captureBeforeCells(brushStroke, brushCellKeys);

    if (this.brushSettings.mode === "erase") {
      if (this.eraseInstancesInBrush()) {
        brushStroke.changed = true;
        this.markDirtyCells(brushCellKeys);
      }
      return;
    }

    if (!this.data.models[this.selectedModelId]) return;

    this.placementAccumulator += dt * this.brushSettings.densityPerSecond;
    const placements = Math.min(MAX_PLACEMENTS_PER_FRAME, Math.floor(this.placementAccumulator));
    if (placements <= 0) return;

    this.placementAccumulator -= placements;
    let changed = false;
    for (let index = 0; index < placements; index += 1) {
      const instance = this.createInstanceInBrush(heightAt, hasHeightAt);
      if (!instance) continue;

      this.data.instances.push(instance);
      changed = true;
    }

    if (changed) {
      brushStroke.changed = true;
      this.markDirtyCells(brushCellKeys);
      this.setDirty(true);
      this.scene.syncInstances(this.selectedModelId);
      this.notifyChanged();
    }
  }

  snapInstancesToTerrain(heightAt: TerrainHeightAt): void {
    let changed = false;
    for (const instance of this.data.instances) {
      const nextY = heightAt(instance.x, instance.z);
      if (Math.abs(instance.y - nextY) <= ERASE_EPSILON_METERS) continue;

      instance.y = nextY;
      changed = true;
    }

    if (changed) {
      this.setDirty(true);
      this.scene.syncInstances();
      this.notifyChanged();
    }
  }

  markClean(): void {
    this.dirtyCellKeys.clear();
    this.setDirty(false);
  }

  setOnDirtyChange(callback: (dirty: boolean) => void): void {
    this.onDirtyChange = callback;
  }

  setCommandRecorder(callback: EditorCommandRecorder | null): void {
    this.commandRecorder = callback;
  }

  flushPendingHistory(): void {
    this.finishBrushStroke();
  }

  reset(): void {
    this.brush.reset();
    this.finishBrushStroke();
  }

  dispose(): void {
    this.reset();
    this.commandRecorder = null;
    this.unsubscribeSceneChange();
  }

  private ensureBrushStrokeSession(): VegetationBrushStrokeSession {
    if (!this.activeBrushStroke) {
      this.activeBrushStroke = {
        beforeCells: new Map<string, VegetationInstance[]>(),
        cellKeys: new Set<string>(),
        changed: false,
      };
    }

    return this.activeBrushStroke;
  }

  private finishBrushStroke(): void {
    const session = this.activeBrushStroke;
    this.activeBrushStroke = null;
    if (!session?.changed || session.cellKeys.size === 0 || !this.commandRecorder) {
      return;
    }

    const cellKeys = sortPageKeys(session.cellKeys);
    const beforeSnapshot = this.createCellSnapshotFromMap(session.beforeCells, cellKeys);
    const afterSnapshot = this.captureCellSnapshot(cellKeys);
    if (!hasVegetationSnapshotChanges(beforeSnapshot, afterSnapshot)) {
      return;
    }

    this.commandRecorder({
      label: "Vegetation brush stroke",
      undo: () => this.applyCellSnapshot(beforeSnapshot),
      redo: () => this.applyCellSnapshot(afterSnapshot),
    });
  }

  private getCurrentBrushCellKeys(): string[] {
    const radius = this.brushSettings.radius;
    return getVegetationCellKeysForWorldBounds(
      this.cellSizeMeters,
      this.brush.targetX - radius,
      this.brush.targetZ - radius,
      this.brush.targetX + radius,
      this.brush.targetZ + radius,
    );
  }

  private captureBeforeCells(session: VegetationBrushStrokeSession, cellKeys: readonly string[]): void {
    for (const key of cellKeys) {
      session.cellKeys.add(key);
      if (!session.beforeCells.has(key)) {
        session.beforeCells.set(key, this.cloneInstancesInCell(key));
      }
    }
  }

  private captureCellSnapshot(cellKeys: readonly string[]): VegetationCellSnapshot {
    return this.createCellSnapshotFromMap(
      new Map(cellKeys.map((key) => [key, this.cloneInstancesInCell(key)])),
      cellKeys,
    );
  }

  private createCellSnapshotFromMap(
    cells: ReadonlyMap<string, readonly VegetationInstance[]>,
    cellKeys: readonly string[],
  ): VegetationCellSnapshot {
    return {
      cellSizeMeters: this.cellSizeMeters,
      cells: sortPageKeys(cellKeys).map((key) => ({
        key,
        instances: cloneVegetationInstances(cells.get(key) ?? []),
      })),
    };
  }

  private cloneInstancesInCell(cellKey: string): VegetationInstance[] {
    return cloneVegetationInstances(this.data.instances.filter((instance) => (
      getVegetationCellKey(instance.x, instance.z, this.cellSizeMeters) === cellKey
    )));
  }

  private applyCellSnapshot(snapshot: VegetationCellSnapshot): void {
    this.commandPlaybackInProgress = true;
    try {
      const cellKeys = new Set(snapshot.cells.map((cell) => cell.key));
      this.data.instances = [
        ...this.data.instances.filter((instance) => (
          !cellKeys.has(getVegetationCellKey(instance.x, instance.z, snapshot.cellSizeMeters))
        )),
        ...snapshot.cells.flatMap((cell) => cloneVegetationInstances(cell.instances)),
      ];
      this.markDirtyCells(snapshot.cells.map((cell) => cell.key));
      this.setDirty(true);
      this.scene.syncInstances();
      this.notifyChanged();
    } finally {
      this.commandPlaybackInProgress = false;
    }
  }

  private createInstanceInBrush(heightAt: TerrainHeightAt, hasHeightAt?: TerrainHeightAvailability): VegetationInstance | null {
    const radius = this.brushSettings.radius;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    const x = this.brush.targetX + Math.cos(angle) * distance;
    const z = this.brush.targetZ + Math.sin(angle) * distance;
    if (hasHeightAt && !hasHeightAt(x, z)) {
      return null;
    }

    const scaleRange = this.brushSettings.scaleMax - this.brushSettings.scaleMin;
    return {
      id: this.createInstanceId(),
      modelId: this.selectedModelId,
      x,
      y: heightAt(x, z),
      z,
      rotationY: Math.random() * Math.PI * 2,
      scale: this.brushSettings.scaleMin + Math.random() * scaleRange,
    };
  }

  private eraseInstancesInBrush(): boolean {
    const radius = this.brushSettings.radius;
    const radiusSquared = radius * radius;
    const before = this.data.instances.length;
    this.data.instances = this.data.instances.filter((instance) => {
      const dx = instance.x - this.brush.targetX;
      const dz = instance.z - this.brush.targetZ;
      return dx * dx + dz * dz > radiusSquared;
    });

    if (this.data.instances.length !== before) {
      this.setDirty(true);
      this.scene.syncInstances();
      this.notifyChanged();
      return true;
    }

    return false;
  }

  private setSelectedModelPathField(field: "lod1Path" | "lod2Path", path: string): void {
    const model = this.data.models[this.selectedModelId];
    if (!model) return;

    const normalizedPath = path.trim().replace(/\\/g, "/");
    const nextPath = normalizedPath && isSupportedVegetationModelPath(normalizedPath) ? normalizedPath : "";
    if (model[field] === nextPath) return;

    model[field] = nextPath;
    this.setDirty(true);
    this.scene.requestRebuild();
    this.notifyChanged();
  }

  private markModelVisibilityChanged(): void {
    this.setDirty(true);
    this.scene.syncInstances(this.selectedModelId);
    this.notifyChanged();
  }

  private createInstanceId(): string {
    this.sequence += 1;
    return `vegetation-${Date.now().toString(36)}-${this.sequence.toString(36)}`;
  }

  private markDirtyCells(cellKeys: readonly string[]): void {
    for (const key of cellKeys) {
      this.dirtyCellKeys.add(key);
    }
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

function cloneVegetationInstances(instances: readonly VegetationInstance[]): VegetationInstance[] {
  return instances.map((instance) => ({ ...instance }));
}

function hasVegetationSnapshotChanges(
  beforeSnapshot: VegetationCellSnapshot,
  afterSnapshot: VegetationCellSnapshot,
): boolean {
  if (beforeSnapshot.cellSizeMeters !== afterSnapshot.cellSizeMeters) {
    return true;
  }

  if (beforeSnapshot.cells.length !== afterSnapshot.cells.length) {
    return true;
  }

  for (let cellIndex = 0; cellIndex < beforeSnapshot.cells.length; cellIndex += 1) {
    const beforeCell = beforeSnapshot.cells[cellIndex];
    const afterCell = afterSnapshot.cells[cellIndex];
    if (beforeCell.key !== afterCell.key || beforeCell.instances.length !== afterCell.instances.length) {
      return true;
    }

    for (let instanceIndex = 0; instanceIndex < beforeCell.instances.length; instanceIndex += 1) {
      if (!isSameVegetationInstance(beforeCell.instances[instanceIndex], afterCell.instances[instanceIndex])) {
        return true;
      }
    }
  }

  return false;
}

function isSameVegetationInstance(left: VegetationInstance, right: VegetationInstance): boolean {
  return left.id === right.id
    && left.modelId === right.modelId
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z
    && left.rotationY === right.rotationY
    && left.scale === right.scale;
}