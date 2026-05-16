// VegetationData: editable vegetation model and placement data.
// VegetationData：可编辑植被模型与摆放数据。

import {
  MAP_VEGETATION_MODELS_PATH,
  pageKey,
  parsePageKey,
  sortPageKeys,
} from "@project/MapData";

export const VEGETATION_DATA_VERSION = 4;
export const VEGETATION_MODELS_PATH = MAP_VEGETATION_MODELS_PATH;
export const VEGETATION_CELLS_DIRECTORY = "vegetation/cells";
export const VEGETATION_INSTANCE_FORMAT = "instanced-f32le-v1";
export const DEFAULT_VEGETATION_CELL_SIZE_METERS = 32;

// EN: v4 keeps all vegetation storage metadata in vegetation/models.json and stores sparse cells as binary records.
// 中文: v4 将所有植被存储元数据保存在 vegetation/models.json，并把稀疏 cell 保存为二进制记录。
export const VEGETATION_INSTANCE_RECORD_BYTE_LENGTH = 24;
export const DEFAULT_VEGETATION_TARGET_HEIGHT_METERS = 8;
export const DEFAULT_VEGETATION_LOD1_DISTANCE_METERS = 70;
export const DEFAULT_VEGETATION_LOD2_DISTANCE_METERS = 130;
export const DEFAULT_VEGETATION_MAX_VISIBLE_DISTANCE_METERS = 220;
export const DEFAULT_VEGETATION_SHADOW_DISTANCE_METERS = 55;

export type VegetationBrushMode = "place" | "erase";

export interface VegetationModelDefinition {
  id: string;
  name: string;
  path: string;
  lod1Path: string;
  lod1DistanceMeters: number;
  lod2Path: string;
  lod2DistanceMeters: number;
  targetHeightMeters: number;
  baseScale: number;
  castShadow: boolean;
  receiveShadow: boolean;
  maxVisibleDistanceMeters: number;
  shadowDistanceMeters: number;
}

export interface VegetationModelLevelStats {
  level: number;
  label: string;
  path: string;
  loaded: boolean;
  vertices: number;
  triangles: number;
  primitives: number;
  drawCalls: number;
  sourceHeightMeters: number;
}

export interface VegetationModelStats {
  modelId: string;
  levels: VegetationModelLevelStats[];
  totalVertices: number;
  totalTriangles: number;
}

export interface VegetationInstance {
  id: string;
  modelId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
}

export interface VegetationMapData {
  version: typeof VEGETATION_DATA_VERSION;
  models: Record<string, VegetationModelDefinition>;
  instances: VegetationInstance[];
}

export interface VegetationInstanceManifest {
  format: typeof VEGETATION_INSTANCE_FORMAT;
  cellSizeMeters: number;
  cellsDirectory: typeof VEGETATION_CELLS_DIRECTORY;
  cellKeys: string[];
  modelIds: string[];
}

export interface VegetationManifest {
  version: typeof VEGETATION_DATA_VERSION;
  models: Record<string, VegetationModelDefinition>;
  instances: VegetationInstanceManifest;
}

export interface VegetationCellPayload {
  key: string;
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = Record<string, unknown>;

export function createEmptyVegetationData(): VegetationMapData {
  return {
    version: VEGETATION_DATA_VERSION,
    models: {},
    instances: [],
  };
}

export function cloneVegetationData(data: VegetationMapData): VegetationMapData {
  return {
    version: VEGETATION_DATA_VERSION,
    models: Object.fromEntries(
      Object.entries(data.models).map(([id, model]) => [id, { ...model }]),
    ),
    instances: data.instances.map((instance) => ({ ...instance })),
  };
}

export function serializeVegetationManifest(manifest: VegetationManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function deserializeVegetationManifest(json: string): VegetationManifest {
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Vegetation manifest must be a JSON object");
  }

  if (parsed.version !== VEGETATION_DATA_VERSION) {
    throw new Error(`Vegetation manifest version ${String(parsed.version ?? "unknown")} is not supported`);
  }

  if (!isRecord(parsed.models)) {
    throw new Error("Vegetation manifest must contain model definitions");
  }

  if (!isRecord(parsed.instances)) {
    throw new Error("Vegetation manifest must contain cell instance metadata");
  }

  const models: Record<string, VegetationModelDefinition> = {};
  for (const [id, value] of Object.entries(parsed.models)) {
    models[id] = normalizeModelDefinition(id, value);
  }

  const instances = normalizeInstanceManifest(parsed.instances, models);
  return { version: VEGETATION_DATA_VERSION, models, instances };
}

export function createVegetationStoragePayload(
  data: VegetationMapData,
  cellSizeMeters: number,
): { manifest: VegetationManifest; cells: VegetationCellPayload[] } {
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) {
    throw new Error("Vegetation cell size must be a positive finite number");
  }

  const models = cloneVegetationModels(data.models);
  const modelIds = Object.keys(models).sort();
  if (modelIds.length > 0xffff) {
    throw new Error("Vegetation model count exceeds binary format capacity");
  }

  const modelIndexById = new Map(modelIds.map((id, index) => [id, index]));
  const groupedInstances = new Map<string, VegetationInstance[]>();

  // EN: Vegetation cells are independent from terrain pages so foliage can stream at its own density and LOD cadence.
  // 中文: 植被 cell 独立于地形 page，使植被可以按自己的密度和 LOD 节奏流式加载。
  for (const instance of data.instances) {
    if (!modelIndexById.has(instance.modelId)) {
      throw new Error(`Vegetation instance '${instance.id}' references unknown model '${instance.modelId}'`);
    }

    const key = getVegetationCellKey(instance.x, instance.z, cellSizeMeters);
    const group = groupedInstances.get(key);
    if (group) {
      group.push(instance);
    } else {
      groupedInstances.set(key, [instance]);
    }
  }

  const cells: VegetationCellPayload[] = [];
  for (const key of sortPageKeys(groupedInstances.keys())) {
    const instances = groupedInstances.get(key) ?? [];
    const { px: cx, pz: cz } = parsePageKey(key);
    const path = getVegetationCellPath(cx, cz);
    const bytes = encodeVegetationCellInstances(instances, modelIndexById);
    cells.push({ key, path, bytes });
  }

  return {
    manifest: {
      version: VEGETATION_DATA_VERSION,
      models,
      instances: {
        format: VEGETATION_INSTANCE_FORMAT,
        cellSizeMeters,
        cellsDirectory: VEGETATION_CELLS_DIRECTORY,
        cellKeys: cells.map((cell) => cell.key),
        modelIds,
      },
    },
    cells,
  };
}

export function getVegetationCellKeys(data: VegetationMapData, cellSizeMeters: number): string[] {
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) {
    throw new Error("Vegetation cell size must be a positive finite number");
  }

  return sortPageKeys(new Set(data.instances.map((instance) => getVegetationCellKey(instance.x, instance.z, cellSizeMeters))));
}

export function createVegetationDataFromManifest(
  manifest: VegetationManifest,
  cells: Record<string, Uint8Array>,
): VegetationMapData {
  const instances: VegetationInstance[] = [];
  const modelIds = manifest.instances.modelIds;

  for (const key of manifest.instances.cellKeys) {
    const bytes = cells[key];
    if (!bytes) {
      throw new Error(`Vegetation cell '${key}' is missing binary data`);
    }

    instances.push(...decodeVegetationCellInstances(key, modelIds, bytes));
  }

  return {
    version: VEGETATION_DATA_VERSION,
    models: cloneVegetationModels(manifest.models),
    instances,
  };
}

export function createVegetationModelDefinition(
  path: string,
  name: string,
  existingIds: Iterable<string>,
): VegetationModelDefinition {
  const normalizedName = normalizeName(name, inferModelNameFromPath(path));
  const id = createUniqueVegetationModelId(normalizedName, existingIds);
  return {
    id,
    name: normalizedName,
    path: normalizePath(path),
    lod1Path: "",
    lod1DistanceMeters: DEFAULT_VEGETATION_LOD1_DISTANCE_METERS,
    lod2Path: "",
    lod2DistanceMeters: DEFAULT_VEGETATION_LOD2_DISTANCE_METERS,
    targetHeightMeters: DEFAULT_VEGETATION_TARGET_HEIGHT_METERS,
    baseScale: 1,
    castShadow: true,
    receiveShadow: true,
    maxVisibleDistanceMeters: DEFAULT_VEGETATION_MAX_VISIBLE_DISTANCE_METERS,
    shadowDistanceMeters: DEFAULT_VEGETATION_SHADOW_DISTANCE_METERS,
  };
}

export function isSupportedVegetationModelPath(path: string): boolean {
  return /\.(gltf|glb)$/i.test(path.trim());
}

function normalizeModelDefinition(id: string, value: unknown): VegetationModelDefinition {
  if (!isRecord(value)) {
    throw new Error(`Vegetation model '${id}' must be an object`);
  }

  const modelId = normalizeName(readString(value.id), id);
  const name = normalizeName(readString(value.name), modelId);
  const path = normalizePath(readString(value.path));
  if (!path) {
    throw new Error(`Vegetation model '${id}' is missing path`);
  }

  const lod1DistanceMeters = clampNumber(value.lod1DistanceMeters, 5, 1000, DEFAULT_VEGETATION_LOD1_DISTANCE_METERS);
  const lod2DistanceMeters = Math.max(
    lod1DistanceMeters,
    clampNumber(value.lod2DistanceMeters, 5, 1000, DEFAULT_VEGETATION_LOD2_DISTANCE_METERS),
  );
  const maxVisibleDistanceMeters = clampNumber(
    value.maxVisibleDistanceMeters,
    10,
    2000,
    DEFAULT_VEGETATION_MAX_VISIBLE_DISTANCE_METERS,
  );

  return {
    id: modelId,
    name,
    path,
    lod1Path: normalizeOptionalModelPath(readString(value.lod1Path)),
    lod1DistanceMeters,
    lod2Path: normalizeOptionalModelPath(readString(value.lod2Path)),
    lod2DistanceMeters,
    targetHeightMeters: clampNumber(value.targetHeightMeters, 0.25, 200, DEFAULT_VEGETATION_TARGET_HEIGHT_METERS),
    baseScale: clampNumber(value.baseScale, 0.001, 1000, 1),
    castShadow: readBoolean(value.castShadow, true),
    receiveShadow: readBoolean(value.receiveShadow, true),
    maxVisibleDistanceMeters,
    shadowDistanceMeters: clampNumber(
      value.shadowDistanceMeters,
      0,
      maxVisibleDistanceMeters,
      DEFAULT_VEGETATION_SHADOW_DISTANCE_METERS,
    ),
  };
}

function createUniqueVegetationModelId(name: string, existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  const base = sanitizeId(name) || "vegetation-model";
  if (!existing.has(base)) {
    return base;
  }

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function inferModelNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").filter(Boolean).pop() ?? "Vegetation Model";
  return fileName.replace(/\.(gltf|glb)$/i, "").replace(/[-_]+/g, " ");
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(value: string | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizePath(value: string | null): string {
  return value?.trim().replace(/\\/g, "/") ?? "";
}

function normalizeOptionalModelPath(value: string | null): string {
  const path = normalizePath(value);
  return path && isSupportedVegetationModelPath(path) ? path : "";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, readFiniteNumber(value, fallback)));
}

function normalizeInstanceManifest(
  value: JsonRecord,
  models: Record<string, VegetationModelDefinition>,
): VegetationInstanceManifest {
  if (value.format !== VEGETATION_INSTANCE_FORMAT) {
    throw new Error(`Vegetation instance format '${String(value.format ?? "unknown")}' is not supported`);
  }

  const cellSizeMeters = readFiniteNumber(value.cellSizeMeters, Number.NaN);
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) {
    throw new Error("Vegetation instance manifest has invalid cell size");
  }

  if (value.cellsDirectory !== VEGETATION_CELLS_DIRECTORY) {
    throw new Error("Vegetation instance manifest has invalid cells directory");
  }

  const cellKeys = normalizeVegetationCellKeys(value.cellKeys);

  if (!Array.isArray(value.modelIds) || !value.modelIds.every((id) => typeof id === "string")) {
    throw new Error("Vegetation instance manifest must contain model id order");
  }

  const modelIds = [...value.modelIds];
  const uniqueModelIds = new Set(modelIds);
  if (uniqueModelIds.size !== modelIds.length) {
    throw new Error("Vegetation instance manifest contains duplicate model ids");
  }

  for (const modelId of modelIds) {
    if (!models[modelId]) {
      throw new Error(`Vegetation instance manifest references unknown model '${modelId}'`);
    }
  }

  return {
    format: VEGETATION_INSTANCE_FORMAT,
    cellSizeMeters,
    cellsDirectory: VEGETATION_CELLS_DIRECTORY,
    cellKeys,
    modelIds,
  };
}

function normalizeVegetationCellKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("Vegetation instance manifest must contain cell keys");
  }

  const keys = new Set<string>();
  for (const key of value) {
    if (typeof key !== "string") {
      throw new Error("Vegetation instance manifest cell keys must be strings");
    }

    parsePageKey(key);
    if (keys.has(key)) {
      throw new Error(`Vegetation instance manifest has duplicate cell key '${key}'`);
    }

    keys.add(key);
  }

  return sortPageKeys(keys);
}

function cloneVegetationModels(
  models: Record<string, VegetationModelDefinition>,
): Record<string, VegetationModelDefinition> {
  return Object.fromEntries(
    Object.entries(models).map(([id, model]) => [id, { ...model }]),
  );
}

function getVegetationCellKey(x: number, z: number, cellSizeMeters: number): string {
  return pageKey(Math.floor(x / cellSizeMeters), Math.floor(z / cellSizeMeters));
}

export function getVegetationCellPath(cx: number, cz: number): string {
  return `${VEGETATION_CELLS_DIRECTORY}/c_${formatCellCoordinate(cx)}_${formatCellCoordinate(cz)}.instances.f32`;
}

export function getVegetationCellPathForKey(key: string): string {
  const { px, pz } = parsePageKey(key);
  return getVegetationCellPath(px, pz);
}

function encodeVegetationCellInstances(
  instances: readonly VegetationInstance[],
  modelIndexById: ReadonlyMap<string, number>,
): Uint8Array {
  const bytes = new Uint8Array(instances.length * VEGETATION_INSTANCE_RECORD_BYTE_LENGTH);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    const modelIndex = modelIndexById.get(instance.modelId);
    if (modelIndex === undefined) {
      throw new Error(`Vegetation instance '${instance.id}' references unknown model '${instance.modelId}'`);
    }

    const offset = index * VEGETATION_INSTANCE_RECORD_BYTE_LENGTH;
    view.setUint16(offset, modelIndex, true);
    view.setUint16(offset + 2, 0, true);
    view.setFloat32(offset + 4, instance.x, true);
    view.setFloat32(offset + 8, instance.y, true);
    view.setFloat32(offset + 12, instance.z, true);
    view.setFloat32(offset + 16, instance.rotationY, true);
    view.setFloat32(offset + 20, instance.scale, true);
  }

  return bytes;
}

function decodeVegetationCellInstances(
  cellKeyValue: string,
  modelIds: readonly string[],
  bytes: Uint8Array,
): VegetationInstance[] {
  if (bytes.byteLength % VEGETATION_INSTANCE_RECORD_BYTE_LENGTH !== 0) {
    throw new Error(`Vegetation cell '${cellKeyValue}' has invalid byte length ${bytes.byteLength}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const instances: VegetationInstance[] = [];
  const count = bytes.byteLength / VEGETATION_INSTANCE_RECORD_BYTE_LENGTH;
  for (let index = 0; index < count; index += 1) {
    const offset = index * VEGETATION_INSTANCE_RECORD_BYTE_LENGTH;
    const modelIndex = view.getUint16(offset, true);
    const modelId = modelIds[modelIndex];
    if (!modelId) {
      throw new Error(`Vegetation cell '${cellKeyValue}' references unknown model index ${modelIndex}`);
    }

    instances.push({
      id: createLoadedInstanceId(cellKeyValue, index),
      modelId,
      x: readCellFloat(view, offset + 4, cellKeyValue),
      y: readCellFloat(view, offset + 8, cellKeyValue),
      z: readCellFloat(view, offset + 12, cellKeyValue),
      rotationY: readCellFloat(view, offset + 16, cellKeyValue),
      scale: Math.max(0.001, readCellFloat(view, offset + 20, cellKeyValue)),
    });
  }

  return instances;
}

function readCellFloat(view: DataView, offset: number, cellKeyValue: string): number {
  const value = view.getFloat32(offset, true);
  if (!Number.isFinite(value)) {
    throw new Error(`Vegetation cell '${cellKeyValue}' contains a non-finite instance value`);
  }

  return value;
}

function createLoadedInstanceId(cellKeyValue: string, index: number): string {
  const safeCellKey = cellKeyValue.replace(/-/g, "m").replace(/,/g, "_");
  return `vegetation-${safeCellKey}-${index.toString(36)}`;
}

function formatCellCoordinate(value: number): string {
  if (!Number.isInteger(value)) {
    throw new Error(`Vegetation cell coordinate must be an integer: ${value}`);
  }

  return value < 0 ? `m${Math.abs(value)}` : String(value);
}