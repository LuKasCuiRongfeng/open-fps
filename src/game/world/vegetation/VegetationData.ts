// VegetationData: editable vegetation model and placement data.
// VegetationData：可编辑植被模型与摆放数据。

import {
  MAP_VEGETATION_MODELS_PATH,
  pageKey,
  parsePageKey,
  sortPageKeys,
} from "@project/MapData";
import {
  DEFAULT_VEGETATION_REGION_SIZE_CELLS,
  VEGETATION_INSTANCE_FORMAT,
  VEGETATION_INSTANCE_RECORD_BYTE_LENGTH,
  VEGETATION_REGIONS_DIRECTORY,
  VEGETATION_REGION_FORMAT,
  compareRegionCoords,
  compareRegionKeys,
  decodeVegetationRegionPack,
  encodeVegetationRegionPack,
  formatRegionMask,
  getVegetationRegionCoordsForCell,
  getVegetationRegionLocalCellIndex,
  getVegetationRegionPath,
  getVegetationRegions,
  normalizeVegetationRegionIntegrity,
  normalizeVegetationRegions,
  validateVegetationRegionSize,
  vegetationRegionKey,
  type VegetationCellPayload,
  type VegetationInstanceManifest,
  type VegetationRegionPayload,
} from "./VegetationRegionData";

export const VEGETATION_MODELS_PATH = MAP_VEGETATION_MODELS_PATH;
export const VEGETATION_DATA_VERSION = 5;

// EN: v5 keeps sparse vegetation cell indices in JSON and stores variable-size cell payloads in region packs.
// 中文: v5 在 JSON 中保存稀疏植被 cell 索引，并把变长 cell 数据写入 region pack。
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

export interface VegetationManifest {
  version: typeof VEGETATION_DATA_VERSION;
  models: Record<string, VegetationModelDefinition>;
  instances: VegetationInstanceManifest;
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
  regionSizeCells = DEFAULT_VEGETATION_REGION_SIZE_CELLS,
): { manifest: VegetationManifest; regions: VegetationRegionPayload[] } {
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) {
    throw new Error("Vegetation cell size must be a positive finite number");
  }
  validateVegetationRegionSize(regionSizeCells);

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

  const regionGroups = new Map<string, { x: number; z: number; cells: VegetationCellPayload[] }>();
  for (const key of sortPageKeys(groupedInstances.keys())) {
    const instances = groupedInstances.get(key) ?? [];
    const { px: cx, pz: cz } = parsePageKey(key);
    const region = getVegetationRegionCoordsForCell(cx, cz, regionSizeCells);
    const regionKey = vegetationRegionKey(region.x, region.z);
    const group = regionGroups.get(regionKey) ?? { x: region.x, z: region.z, cells: [] };
    const bytes = encodeVegetationCellInstances(instances, modelIndexById);
    group.cells.push({ key, localIndex: getVegetationRegionLocalCellIndex(cx, cz, regionSizeCells), bytes });
    regionGroups.set(regionKey, group);
  }

  const regions: VegetationRegionPayload[] = [];
  const regionMasks = new Map<string, bigint>();
  for (const group of Array.from(regionGroups.values()).sort(compareRegionCoords)) {
    const cells = group.cells.sort((left, right) => left.localIndex - right.localIndex);
    let mask = 0n;
    for (const cell of cells) {
      mask |= 1n << BigInt(cell.localIndex);
    }

    const key = vegetationRegionKey(group.x, group.z);
    regionMasks.set(key, mask);
    regions.push({
      key,
      path: getVegetationRegionPath(group.x, group.z),
      bytes: encodeVegetationRegionPack(cells),
    });
  }

  return {
    manifest: {
      version: VEGETATION_DATA_VERSION,
      models,
      instances: {
        format: VEGETATION_REGION_FORMAT,
        instanceFormat: VEGETATION_INSTANCE_FORMAT,
        cellSizeMeters,
        regionSizeCells,
        regionsDirectory: VEGETATION_REGIONS_DIRECTORY,
        regions: Object.fromEntries(
          Array.from(regionMasks.entries())
            .sort(([left], [right]) => compareRegionKeys(left, right))
            .map(([key, mask]) => [key, formatRegionMask(mask)]),
        ),
        regionIntegrity: {},
        modelIds,
      },
    },
    regions,
  };
}

export function getVegetationCellKeys(data: VegetationMapData, cellSizeMeters: number): string[] {
  validateVegetationCellSize(cellSizeMeters);

  return sortPageKeys(new Set(data.instances.map((instance) => getVegetationCellKey(instance.x, instance.z, cellSizeMeters))));
}

export function getVegetationCellKeysForWorldBounds(
  cellSizeMeters: number,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): string[] {
  validateVegetationCellSize(cellSizeMeters);

  const minCellX = Math.floor(minX / cellSizeMeters);
  const maxCellX = Math.floor(maxX / cellSizeMeters);
  const minCellZ = Math.floor(minZ / cellSizeMeters);
  const maxCellZ = Math.floor(maxZ / cellSizeMeters);
  const keys: string[] = [];
  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
      keys.push(pageKey(cx, cz));
    }
  }

  return sortPageKeys(keys);
}

export function getVegetationCellKey(x: number, z: number, cellSizeMeters: number): string {
  validateVegetationCellSize(cellSizeMeters);
  return pageKey(Math.floor(x / cellSizeMeters), Math.floor(z / cellSizeMeters));
}

export function getVegetationRegionKeys(
  data: VegetationMapData,
  cellSizeMeters: number,
  regionSizeCells = DEFAULT_VEGETATION_REGION_SIZE_CELLS,
): string[] {
  return sortPageKeys(new Set(getVegetationCellKeys(data, cellSizeMeters).map((key) => {
    const { px: cx, pz: cz } = parsePageKey(key);
    const region = getVegetationRegionCoordsForCell(cx, cz, regionSizeCells);
    return vegetationRegionKey(region.x, region.z);
  })));
}

export function createVegetationDataFromManifest(
  manifest: VegetationManifest,
  regions: Record<string, Uint8Array>,
): VegetationMapData {
  const instances: VegetationInstance[] = [];
  const modelIds = manifest.instances.modelIds;

  for (const region of getVegetationRegions(manifest)) {
    const bytes = regions[region.key];
    if (!bytes) {
      throw new Error(`Vegetation region '${region.key}' is missing binary data`);
    }

    for (const cell of decodeVegetationRegionPack(region, manifest.instances.regionSizeCells, bytes)) {
      instances.push(...decodeVegetationCellInstances(cell.key, modelIds, cell.bytes));
    }
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
  if (value.format !== VEGETATION_REGION_FORMAT) {
    throw new Error(`Vegetation instance format '${String(value.format ?? "unknown")}' is not supported`);
  }

  if (value.instanceFormat !== VEGETATION_INSTANCE_FORMAT) {
    throw new Error(`Vegetation instance record format '${String(value.instanceFormat ?? "unknown")}' is not supported`);
  }

  const cellSizeMeters = readFiniteNumber(value.cellSizeMeters, Number.NaN);
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) {
    throw new Error("Vegetation instance manifest has invalid cell size");
  }

  const regionSizeCells = readFiniteNumber(value.regionSizeCells, Number.NaN);
  validateVegetationRegionSize(regionSizeCells);

  if (value.regionsDirectory !== VEGETATION_REGIONS_DIRECTORY) {
    throw new Error("Vegetation instance manifest has invalid regions directory");
  }

  const regions = normalizeVegetationRegions(value.regions, regionSizeCells);

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
    format: VEGETATION_REGION_FORMAT,
    instanceFormat: VEGETATION_INSTANCE_FORMAT,
    cellSizeMeters,
    regionSizeCells,
    regionsDirectory: VEGETATION_REGIONS_DIRECTORY,
    regions,
    regionIntegrity: normalizeVegetationRegionIntegrity(value.regionIntegrity, regions),
    modelIds,
  };
}

function cloneVegetationModels(
  models: Record<string, VegetationModelDefinition>,
): Record<string, VegetationModelDefinition> {
  return Object.fromEntries(
    Object.entries(models).map(([id, model]) => [id, { ...model }]),
  );
}

function validateVegetationCellSize(cellSizeMeters: number): void {
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) {
    throw new Error("Vegetation cell size must be a positive finite number");
  }
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

