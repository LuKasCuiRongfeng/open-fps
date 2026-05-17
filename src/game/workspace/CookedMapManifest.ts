// CookedMapManifest: runtime schema for cooked open-world map data.
// CookedMapManifest：开放世界 cooked 地图数据的运行时 schema。

export const COOKED_MAP_VERSION = 1;
export const COOKED_MAP_FORMAT = "open-fps-cooked-map-v1";
export const COOKED_MAPS_DIRECTORY = "cooked/maps";
export const COOKED_MAP_MANIFEST_FILE = "manifest.json";

export interface CookedSourceRef {
  path: string;
  sha256: string;
}

export interface CookedRegionRef {
  path: string;
  mask: string;
  byteLength: number;
  sha256: string;
}

export type CookedRegionTable = Record<string, CookedRegionRef>;

export interface CookedMapWorld {
  sizeMeters: number;
  pageSizeMeters: number;
  originX: 0;
  originZ: 0;
  pageBounds: CookedPageRect;
}

export interface CookedPageRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CookedMapAssets {
  terrain: CookedTerrainAsset;
  paint: CookedPaintAsset;
  vegetation: CookedVegetationAsset;
}

export interface CookedTerrainAsset {
  manifestPath: string;
  format: string;
  sampleFormat: string;
  pageResolution: number;
  pageSizeMeters: number;
  regionSizePages: number;
  regions: CookedRegionTable;
}

export interface CookedPaintAsset {
  manifestPath: string;
  format: string;
  resolution: number;
  pageResolution: number;
  pageSizeMeters: number;
  regionSizePages: number;
  indices: number[];
  layers: Record<string, unknown>;
  regions: CookedRegionTable;
}

export interface CookedVegetationAsset {
  manifestPath: string;
  format: string;
  instanceFormat: string;
  cellSizeMeters: number;
  regionSizeCells: number;
  models: Record<string, unknown>;
  modelIds: string[];
  regions: CookedRegionTable;
}

export interface CookedWorldPartition {
  cellSizePages: number;
  cellSizeMeters: number;
  cells: CookedWorldPartitionCell[];
}

export interface CookedWorldPartitionCell {
  key: string;
  x: number;
  z: number;
  pageRect: CookedPageRect;
  boundsMeters: CookedBoundsMeters;
  terrainRegions: string[];
  paintRegions: string[];
  vegetationRegions: string[];
}

export interface CookedBoundsMeters {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface CookedMapManifest {
  version: typeof COOKED_MAP_VERSION;
  format: typeof COOKED_MAP_FORMAT;
  mapId: string;
  source: {
    project: CookedSourceRef;
    map: CookedSourceRef;
    terrain: CookedSourceRef;
    paint: CookedSourceRef;
    vegetation: CookedSourceRef;
  };
  world: CookedMapWorld;
  assets: CookedMapAssets;
  partition: CookedWorldPartition;
}

type JsonRecord = Record<string, unknown>;

export function getCookedMapManifestPath(mapId: string): string {
  return `${COOKED_MAPS_DIRECTORY}/${mapId}/${COOKED_MAP_MANIFEST_FILE}`;
}

export function deserializeCookedMapManifest(json: string): CookedMapManifest {
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Cooked map manifest must be a JSON object");
  }

  if (parsed.version !== COOKED_MAP_VERSION) {
    throw new Error(`Cooked map manifest version ${String(parsed.version ?? "unknown")} is not supported`);
  }
  if (parsed.format !== COOKED_MAP_FORMAT) {
    throw new Error(`Cooked map manifest format '${String(parsed.format ?? "unknown")}' is not supported`);
  }

  return {
    version: COOKED_MAP_VERSION,
    format: COOKED_MAP_FORMAT,
    mapId: readString(parsed.mapId, "cooked map id"),
    source: normalizeCookedSource(parsed.source),
    world: normalizeCookedWorld(parsed.world),
    assets: normalizeCookedAssets(parsed.assets),
    partition: normalizeCookedPartition(parsed.partition),
  };
}

function normalizeCookedSource(value: unknown): CookedMapManifest["source"] {
  const source = readRecord(value, "cooked source metadata");
  return {
    project: normalizeSourceRef(source.project, "project"),
    map: normalizeSourceRef(source.map, "map"),
    terrain: normalizeSourceRef(source.terrain, "terrain"),
    paint: normalizeSourceRef(source.paint, "paint"),
    vegetation: normalizeSourceRef(source.vegetation, "vegetation"),
  };
}

function normalizeSourceRef(value: unknown, label: string): CookedSourceRef {
  const record = readRecord(value, `cooked ${label} source`);
  const sha256 = readSha256(record.sha256, `cooked ${label} source sha256`);
  return {
    path: readString(record.path, `cooked ${label} source path`),
    sha256,
  };
}

function normalizeCookedWorld(value: unknown): CookedMapWorld {
  const world = readRecord(value, "cooked world metadata");
  return {
    sizeMeters: readPositiveNumber(world.sizeMeters, "cooked world sizeMeters"),
    pageSizeMeters: readPositiveNumber(world.pageSizeMeters, "cooked world pageSizeMeters"),
    originX: readZero(world.originX, "cooked world originX"),
    originZ: readZero(world.originZ, "cooked world originZ"),
    pageBounds: normalizePageRect(world.pageBounds, "cooked world pageBounds"),
  };
}

function normalizeCookedAssets(value: unknown): CookedMapAssets {
  const assets = readRecord(value, "cooked asset metadata");
  return {
    terrain: normalizeTerrainAsset(assets.terrain),
    paint: normalizePaintAsset(assets.paint),
    vegetation: normalizeVegetationAsset(assets.vegetation),
  };
}

function normalizeTerrainAsset(value: unknown): CookedTerrainAsset {
  const asset = readRecord(value, "cooked terrain asset");
  return {
    manifestPath: readString(asset.manifestPath, "cooked terrain manifestPath"),
    format: readString(asset.format, "cooked terrain format"),
    sampleFormat: readString(asset.sampleFormat, "cooked terrain sampleFormat"),
    pageResolution: readPositiveInteger(asset.pageResolution, "cooked terrain pageResolution"),
    pageSizeMeters: readPositiveNumber(asset.pageSizeMeters, "cooked terrain pageSizeMeters"),
    regionSizePages: readPositiveInteger(asset.regionSizePages, "cooked terrain regionSizePages"),
    regions: normalizeRegionTable(asset.regions, "cooked terrain regions"),
  };
}

function normalizePaintAsset(value: unknown): CookedPaintAsset {
  const asset = readRecord(value, "cooked paint asset");
  return {
    manifestPath: readString(asset.manifestPath, "cooked paint manifestPath"),
    format: readString(asset.format, "cooked paint format"),
    resolution: readPositiveInteger(asset.resolution, "cooked paint resolution"),
    pageResolution: readPositiveInteger(asset.pageResolution, "cooked paint pageResolution"),
    pageSizeMeters: readPositiveNumber(asset.pageSizeMeters, "cooked paint pageSizeMeters"),
    regionSizePages: readPositiveInteger(asset.regionSizePages, "cooked paint regionSizePages"),
    indices: readIntegerArray(asset.indices, "cooked paint indices"),
    layers: readRecord(asset.layers, "cooked paint layers"),
    regions: normalizeRegionTable(asset.regions, "cooked paint regions"),
  };
}

function normalizeVegetationAsset(value: unknown): CookedVegetationAsset {
  const asset = readRecord(value, "cooked vegetation asset");
  return {
    manifestPath: readString(asset.manifestPath, "cooked vegetation manifestPath"),
    format: readString(asset.format, "cooked vegetation format"),
    instanceFormat: readString(asset.instanceFormat, "cooked vegetation instanceFormat"),
    cellSizeMeters: readPositiveNumber(asset.cellSizeMeters, "cooked vegetation cellSizeMeters"),
    regionSizeCells: readPositiveInteger(asset.regionSizeCells, "cooked vegetation regionSizeCells"),
    models: readRecord(asset.models, "cooked vegetation models"),
    modelIds: readStringArray(asset.modelIds, "cooked vegetation modelIds"),
    regions: normalizeRegionTable(asset.regions, "cooked vegetation regions"),
  };
}

function normalizeRegionTable(value: unknown, label: string): CookedRegionTable {
  const regions = readRecord(value, label);
  return Object.fromEntries(Object.entries(regions).map(([key, entry]) => {
    const region = readRecord(entry, `${label} '${key}'`);
    return [key, {
      path: readString(region.path, `${label} '${key}' path`),
      mask: readRegionMask(region.mask, `${label} '${key}' mask`),
      byteLength: readNonNegativeInteger(region.byteLength, `${label} '${key}' byteLength`),
      sha256: readSha256(region.sha256, `${label} '${key}' sha256`),
    }];
  }));
}

function normalizeCookedPartition(value: unknown): CookedWorldPartition {
  const partition = readRecord(value, "cooked world partition");
  const cellsValue = partition.cells;
  if (!Array.isArray(cellsValue)) {
    throw new Error("Cooked world partition cells must be an array");
  }

  return {
    cellSizePages: readPositiveInteger(partition.cellSizePages, "cooked partition cellSizePages"),
    cellSizeMeters: readPositiveNumber(partition.cellSizeMeters, "cooked partition cellSizeMeters"),
    cells: cellsValue.map((cell, index) => normalizePartitionCell(cell, index)),
  };
}

function normalizePartitionCell(value: unknown, index: number): CookedWorldPartitionCell {
  const cell = readRecord(value, `cooked partition cell ${index}`);
  return {
    key: readString(cell.key, `cooked partition cell ${index} key`),
    x: readInteger(cell.x, `cooked partition cell ${index} x`),
    z: readInteger(cell.z, `cooked partition cell ${index} z`),
    pageRect: normalizePageRect(cell.pageRect, `cooked partition cell ${index} pageRect`),
    boundsMeters: normalizeBoundsMeters(cell.boundsMeters, `cooked partition cell ${index} boundsMeters`),
    terrainRegions: readStringArray(cell.terrainRegions, `cooked partition cell ${index} terrainRegions`),
    paintRegions: readStringArray(cell.paintRegions, `cooked partition cell ${index} paintRegions`),
    vegetationRegions: readStringArray(cell.vegetationRegions, `cooked partition cell ${index} vegetationRegions`),
  };
}

function normalizePageRect(value: unknown, label: string): CookedPageRect {
  const rect = readRecord(value, label);
  return {
    minX: readInteger(rect.minX, `${label}.minX`),
    maxX: readInteger(rect.maxX, `${label}.maxX`),
    minZ: readInteger(rect.minZ, `${label}.minZ`),
    maxZ: readInteger(rect.maxZ, `${label}.maxZ`),
  };
}

function normalizeBoundsMeters(value: unknown, label: string): CookedBoundsMeters {
  const bounds = readRecord(value, label);
  return {
    minX: readFiniteNumber(bounds.minX, `${label}.minX`),
    minZ: readFiniteNumber(bounds.minZ, `${label}.minZ`),
    maxX: readFiniteNumber(bounds.maxX, `${label}.maxX`),
    maxZ: readFiniteNumber(bounds.maxZ, `${label}.maxZ`),
  };
}

function readRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return value;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} must be a string array`);
  }

  return [...value];
}

function readIntegerArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "number" && Number.isInteger(entry))) {
    throw new Error(`${label} must be an integer array`);
  }

  return value;
}

function readInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }

  return value;
}

function readPositiveInteger(value: unknown, label: string): number {
  const integer = readInteger(value, label);
  if (integer <= 0) {
    throw new Error(`${label} must be positive`);
  }

  return integer;
}

function readNonNegativeInteger(value: unknown, label: string): number {
  const integer = readInteger(value, label);
  if (integer < 0) {
    throw new Error(`${label} must be non-negative`);
  }

  return integer;
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
}

function readPositiveNumber(value: unknown, label: string): number {
  const number = readFiniteNumber(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be positive`);
  }

  return number;
}

function readZero(value: unknown, label: string): 0 {
  if (value !== 0) {
    throw new Error(`${label} must be 0`);
  }

  return 0;
}

function readSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }

  return value;
}

function readRegionMask(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`${label} must be a hex mask string`);
  }

  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}