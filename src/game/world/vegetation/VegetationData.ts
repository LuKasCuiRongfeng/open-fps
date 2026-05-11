// VegetationData: editable vegetation model and placement data.
// VegetationData：可编辑植被模型与摆放数据。

export const VEGETATION_DATA_VERSION = 1;
export const VEGETATION_FILE_NAME = "vegetation.json";
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

export function serializeVegetationData(data: VegetationMapData): string {
  return `${JSON.stringify(cloneVegetationData(data), null, 2)}\n`;
}

export function deserializeVegetationData(json: string): VegetationMapData {
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Vegetation data must be a JSON object");
  }

  if (parsed.version !== VEGETATION_DATA_VERSION) {
    throw new Error(`Vegetation data version ${String(parsed.version ?? "unknown")} is not supported`);
  }

  if (!isRecord(parsed.models)) {
    throw new Error("Vegetation data must contain model definitions");
  }

  if (!Array.isArray(parsed.instances)) {
    throw new Error("Vegetation data must contain instances");
  }

  const models: Record<string, VegetationModelDefinition> = {};
  for (const [id, value] of Object.entries(parsed.models)) {
    models[id] = normalizeModelDefinition(id, value);
  }

  const instances = parsed.instances.map((value, index) => normalizeInstance(value, index));
  return { version: VEGETATION_DATA_VERSION, models, instances };
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

function normalizeInstance(value: unknown, index: number): VegetationInstance {
  if (!isRecord(value)) {
    throw new Error(`Vegetation instance ${index} must be an object`);
  }

  const id = normalizeName(readString(value.id), `vegetation-${index + 1}`);
  const modelId = normalizeName(readString(value.modelId), "");
  if (!modelId) {
    throw new Error(`Vegetation instance '${id}' is missing modelId`);
  }

  return {
    id,
    modelId,
    x: readFiniteNumber(value.x, 0),
    y: readFiniteNumber(value.y, 0),
    z: readFiniteNumber(value.z, 0),
    rotationY: readFiniteNumber(value.rotationY, 0),
    scale: clampNumber(value.scale, 0.001, 1000, 1),
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