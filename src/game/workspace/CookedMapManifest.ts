// CookedMapManifest: runtime schema for cooked open-world map data.
// CookedMapManifest：开放世界 cooked 地图数据的运行时 schema。

export const COOKED_MAP_VERSION = 4;
export const COOKED_MAP_FORMAT = "open-fps-cooked-map-v4";
export const COOKED_MAPS_DIRECTORY = "cooked/maps";
export const COOKED_MAP_MANIFEST_FILE = "manifest.json";
export const COOKED_PACKAGE_LAYOUT = "content-addressed-sha256-v1";
export const COOKED_WORLD_PARTITION_DEPENDENCY_KINDS = [
  "terrain",
  "paint",
  "vegetation",
  "objects",
  "collision",
  "nav",
] as const;

export type CookedWorldPartitionDependencyKind = typeof COOKED_WORLD_PARTITION_DEPENDENCY_KINDS[number];
export type CookedWorldPartitionDependencies = Record<CookedWorldPartitionDependencyKind, string[]>;

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

export interface CookedCellRef {
  path: string;
  objectCount?: number;
  byteLength: number;
  sha256: string;
  shapeCount?: number;
  nodeCount?: number;
  walkableNodeCount?: number;
  linkCount?: number;
  portalLinkCount?: number;
}

export type CookedCellTable = Record<string, CookedCellRef>;

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
  objects: CookedCellAsset;
  collision: CookedCellAsset;
  nav: CookedCellAsset;
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

export interface CookedCellAsset {
  manifestPath?: string;
  format: string;
  cellSizePages: number;
  cellSizeMeters: number;
  archetypes?: Record<string, unknown>;
  cells: CookedCellTable;
}

export interface CookedWorldPartition {
  cellSizePages: number;
  cellSizeMeters: number;
  dependencyKinds: CookedWorldPartitionDependencyKind[];
  cells: CookedWorldPartitionCell[];
}

export interface CookedWorldPartitionCell {
  key: string;
  x: number;
  z: number;
  pageRect: CookedPageRect;
  boundsMeters: CookedBoundsMeters;
  dependencies: CookedWorldPartitionDependencies;
  budget?: CookedWorldPartitionCellBudget;
}

export interface CookedWorldPartitionCellBudget {
  objectCount: number;
  collisionShapeCount: number;
  navNodeCount: number;
  navLinkCount: number;
  rawBytes: number;
  compressedBytes: number;
  estimatedCost: number;
  rating: "ok" | "watch" | "over";
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
  build: CookedBuildInfo;
  map: CookedMapInfo;
  source: {
    project: CookedSourceRef;
    assetRegistry: CookedSourceRef;
    map: CookedSourceRef;
    generationGraph: CookedSourceRef;
    terrain: CookedSourceRef;
    paint: CookedSourceRef;
    vegetation: CookedSourceRef;
    objects: CookedSourceRef;
  };
  world: CookedMapWorld;
  assets: CookedMapAssets;
  partition: CookedWorldPartition;
  package: CookedPackageInfo;
}

export interface CookedBuildInfo {
  tool: string;
  toolVersion: number;
  generatedAt: string;
  inputSignature: string;
  previousInputSignature: string | null;
  packageLayout: string;
  artifactCount: number;
  rebuild: CookedRebuildInfo;
}

export interface CookedRebuildInfo {
  mode: "full" | "scoped";
  planId: string | null;
  stages: string[];
  scopes: CookedRebuildScopes | null;
  estimatedArtifacts: number | null;
}

export interface CookedRebuildScopes {
  terrainRegions: string[];
  paintRegions: string[];
  vegetationRegions: string[];
  partitionCells: string[];
}

export interface CookedPackageInfo {
  layout: typeof COOKED_PACKAGE_LAYOUT;
  blobRoot: string;
  artifactCount: number;
  streaming: CookedPackageStreamingInfo;
  artifacts: Record<string, CookedPackageArtifact>;
}

export interface CookedPackageStreamingInfo {
  locality: string;
  duplicateBlobPolicy: string;
  compression: string;
  sort?: string;
  compressedBlobRoot?: string;
  uncompressedBytes?: number;
  compressedBytes?: number;
  compressionRatio?: number;
  duplicateArtifacts?: number;
  uniqueBlobCount?: number;
}

export interface CookedPackageArtifactCompression {
  algorithm: string;
  blobPath: string;
  byteLength: number;
  sha256: string;
}

export interface CookedPackageArtifact {
  path: string;
  blobPath: string;
  kind: string;
  byteLength: number;
  sha256: string;
  sourcePath?: string;
  compression?: CookedPackageArtifactCompression;
}

export interface CookedMapInfo {
  seed: number;
  metadata: CookedMapMetadata;
}

export interface CookedMapMetadata {
  name: string;
  created: number;
  modified: number;
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
    build: normalizeCookedBuild(parsed.build),
    map: normalizeCookedMapInfo(parsed.map),
    source: normalizeCookedSource(parsed.source),
    world: normalizeCookedWorld(parsed.world),
    assets: normalizeCookedAssets(parsed.assets),
    partition: normalizeCookedPartition(parsed.partition),
    package: normalizeCookedPackage(parsed.package),
  };
}

function normalizeCookedBuild(value: unknown): CookedBuildInfo {
  const build = readRecord(value, "cooked build metadata");
  return {
    tool: readString(build.tool, "cooked build tool"),
    toolVersion: readPositiveInteger(build.toolVersion, "cooked build toolVersion"),
    generatedAt: readString(build.generatedAt, "cooked build generatedAt"),
    inputSignature: readSha256(build.inputSignature, "cooked build inputSignature"),
    previousInputSignature: readNullableSha256(build.previousInputSignature, "cooked build previousInputSignature"),
    packageLayout: readString(build.packageLayout, "cooked build packageLayout"),
    artifactCount: readNonNegativeInteger(build.artifactCount, "cooked build artifactCount"),
    rebuild: normalizeCookedRebuild(build.rebuild),
  };
}

function normalizeCookedRebuild(value: unknown): CookedRebuildInfo {
  if (value === undefined) {
    return {
      mode: "full",
      planId: null,
      stages: [],
      scopes: null,
      estimatedArtifacts: null,
    };
  }

  const rebuild = readRecord(value, "cooked rebuild metadata");
  const mode = readString(rebuild.mode, "cooked rebuild mode");
  if (mode !== "full" && mode !== "scoped") {
    throw new Error(`Cooked rebuild mode '${mode}' is not supported`);
  }

  return {
    mode,
    planId: readNullableString(rebuild.planId, "cooked rebuild planId"),
    stages: readStringArray(rebuild.stages, "cooked rebuild stages"),
    scopes: normalizeCookedRebuildScopes(rebuild.scopes),
    estimatedArtifacts: readNullableNonNegativeInteger(rebuild.estimatedArtifacts, "cooked rebuild estimatedArtifacts"),
  };
}

function normalizeCookedRebuildScopes(value: unknown): CookedRebuildScopes | null {
  if (value === null || value === undefined) {
    return null;
  }

  const scopes = readRecord(value, "cooked rebuild scopes");
  return {
    terrainRegions: readStringArray(scopes.terrainRegions, "cooked rebuild terrainRegions"),
    paintRegions: readStringArray(scopes.paintRegions, "cooked rebuild paintRegions"),
    vegetationRegions: readStringArray(scopes.vegetationRegions, "cooked rebuild vegetationRegions"),
    partitionCells: readStringArray(scopes.partitionCells, "cooked rebuild partitionCells"),
  };
}

function normalizeCookedMapInfo(value: unknown): CookedMapInfo {
  const map = readRecord(value, "cooked map metadata");
  return {
    seed: readFiniteNumber(map.seed, "cooked map seed"),
    metadata: normalizeCookedMapMetadata(map.metadata),
  };
}

function normalizeCookedMapMetadata(value: unknown): CookedMapMetadata {
  const metadata = readRecord(value, "cooked map metadata entry");
  return {
    name: readString(metadata.name, "cooked map metadata name"),
    created: readFiniteNumber(metadata.created, "cooked map metadata created"),
    modified: readFiniteNumber(metadata.modified, "cooked map metadata modified"),
  };
}

function normalizeCookedSource(value: unknown): CookedMapManifest["source"] {
  const source = readRecord(value, "cooked source metadata");
  return {
    project: normalizeSourceRef(source.project, "project"),
    assetRegistry: normalizeSourceRef(source.assetRegistry, "asset registry"),
    map: normalizeSourceRef(source.map, "map"),
    generationGraph: normalizeSourceRef(source.generationGraph, "generation graph"),
    terrain: normalizeSourceRef(source.terrain, "terrain"),
    paint: normalizeSourceRef(source.paint, "paint"),
    vegetation: normalizeSourceRef(source.vegetation, "vegetation"),
    objects: normalizeSourceRef(source.objects, "objects"),
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
    objects: normalizeCellAsset(assets.objects, "objects"),
    collision: normalizeCellAsset(assets.collision, "collision"),
    nav: normalizeCellAsset(assets.nav, "nav"),
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
    dependencyKinds: readPartitionDependencyKinds(partition.dependencyKinds, "cooked partition dependencyKinds"),
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
    dependencies: normalizePartitionDependencies(cell.dependencies, index),
    budget: normalizePartitionCellBudget(cell.budget, index),
  };
}

function normalizePartitionCellBudget(value: unknown, index: number): CookedWorldPartitionCellBudget | undefined {
  if (value === undefined) {
    return undefined;
  }

  const budget = readRecord(value, `cooked partition cell ${index} budget`);
  const rating = readString(budget.rating, `cooked partition cell ${index} budget.rating`);
  if (rating !== "ok" && rating !== "watch" && rating !== "over") {
    throw new Error(`cooked partition cell ${index} budget.rating is not supported`);
  }

  return {
    objectCount: readNonNegativeInteger(budget.objectCount, `cooked partition cell ${index} budget.objectCount`),
    collisionShapeCount: readNonNegativeInteger(budget.collisionShapeCount, `cooked partition cell ${index} budget.collisionShapeCount`),
    navNodeCount: readNonNegativeInteger(budget.navNodeCount, `cooked partition cell ${index} budget.navNodeCount`),
    navLinkCount: readNonNegativeInteger(budget.navLinkCount, `cooked partition cell ${index} budget.navLinkCount`),
    rawBytes: readNonNegativeInteger(budget.rawBytes, `cooked partition cell ${index} budget.rawBytes`),
    compressedBytes: readNonNegativeInteger(budget.compressedBytes, `cooked partition cell ${index} budget.compressedBytes`),
    estimatedCost: readNonNegativeNumber(budget.estimatedCost, `cooked partition cell ${index} budget.estimatedCost`),
    rating,
  };
}

function readPartitionDependencyKinds(value: unknown, label: string): CookedWorldPartitionDependencyKind[] {
  const kinds = readStringArray(value, label);
  if (!sameStringArray(kinds, [...COOKED_WORLD_PARTITION_DEPENDENCY_KINDS])) {
    throw new Error(`${label} must match the cooked partition dependency schema`);
  }

  return kinds as CookedWorldPartitionDependencyKind[];
}

function normalizePartitionDependencies(value: unknown, index: number): CookedWorldPartitionDependencies {
  const dependencies = readRecord(value, `cooked partition cell ${index} dependencies`);
  const expectedKeys = [...COOKED_WORLD_PARTITION_DEPENDENCY_KINDS].sort();
  const actualKeys = Object.keys(dependencies).sort();
  if (!sameStringArray(actualKeys, expectedKeys)) {
    throw new Error(`cooked partition cell ${index} dependencies must match the cooked partition dependency schema`);
  }

  const normalized: Partial<CookedWorldPartitionDependencies> = {};
  for (const kind of COOKED_WORLD_PARTITION_DEPENDENCY_KINDS) {
    normalized[kind] = readStringArray(dependencies[kind], `cooked partition cell ${index} dependencies.${kind}`);
  }

  return normalized as CookedWorldPartitionDependencies;
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

function readOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readString(value, label);
}

function readNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }

  return readString(value, label);
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

function readOptionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readNonNegativeInteger(value, label);
}

function readOptionalFiniteNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }

  return value;
}

function readNullableNonNegativeInteger(value: unknown, label: string): number | null {
  if (value === null) {
    return null;
  }

  return readNonNegativeInteger(value, label);
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

function readNonNegativeNumber(value: unknown, label: string): number {
  const number = readFiniteNumber(value, label);
  if (number < 0) {
    throw new Error(`${label} must be non-negative`);
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

function readNullableSha256(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }

  return readSha256(value, label);
}

function readPackageLayout(value: unknown, label: string): typeof COOKED_PACKAGE_LAYOUT {
  if (value !== COOKED_PACKAGE_LAYOUT) {
    throw new Error(`${label} must be ${COOKED_PACKAGE_LAYOUT}`);
  }

  return COOKED_PACKAGE_LAYOUT;
}

function readRegionMask(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`${label} must be a hex mask string`);
  }

  return value;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCellAsset(value: unknown, label: string): CookedCellAsset {
  const asset = readRecord(value, `cooked ${label} asset`);
  return {
    manifestPath: readOptionalString(asset.manifestPath, `cooked ${label} manifestPath`),
    format: readString(asset.format, `cooked ${label} format`),
    cellSizePages: readPositiveInteger(asset.cellSizePages, `cooked ${label} cellSizePages`),
    cellSizeMeters: readPositiveNumber(asset.cellSizeMeters, `cooked ${label} cellSizeMeters`),
    archetypes: asset.archetypes === undefined
      ? undefined
      : readRecord(asset.archetypes, `cooked ${label} archetypes`),
    cells: normalizeCellTable(asset.cells, `cooked ${label} cells`),
  };
}

function normalizeCellTable(value: unknown, label: string): CookedCellTable {
  const cells = readRecord(value, label);
  return Object.fromEntries(Object.entries(cells).map(([key, entry]) => {
    const cell = readRecord(entry, `${label} '${key}'`);
    return [key, {
      path: readString(cell.path, `${label} '${key}' path`),
      objectCount: readOptionalNonNegativeInteger(cell.objectCount, `${label} '${key}' objectCount`),
      byteLength: readNonNegativeInteger(cell.byteLength, `${label} '${key}' byteLength`),
      sha256: readSha256(cell.sha256, `${label} '${key}' sha256`),
      shapeCount: readOptionalNonNegativeInteger(cell.shapeCount, `${label} '${key}' shapeCount`),
      nodeCount: readOptionalNonNegativeInteger(cell.nodeCount, `${label} '${key}' nodeCount`),
      walkableNodeCount: readOptionalNonNegativeInteger(cell.walkableNodeCount, `${label} '${key}' walkableNodeCount`),
      linkCount: readOptionalNonNegativeInteger(cell.linkCount, `${label} '${key}' linkCount`),
      portalLinkCount: readOptionalNonNegativeInteger(cell.portalLinkCount, `${label} '${key}' portalLinkCount`),
    }];
  }));
}

function normalizeCookedPackage(value: unknown): CookedPackageInfo {
  const contentPackage = readRecord(value, "cooked package metadata");
  const artifacts = readRecord(contentPackage.artifacts, "cooked package artifacts");
  const artifactEntries = Object.entries(artifacts).map(([key, artifact]) => {
    const record = readRecord(artifact, `cooked package artifact '${key}'`);
    return [key, {
      path: readString(record.path, `cooked package artifact '${key}' path`),
      blobPath: readString(record.blobPath, `cooked package artifact '${key}' blobPath`),
      kind: readString(record.kind, `cooked package artifact '${key}' kind`),
      byteLength: readNonNegativeInteger(record.byteLength, `cooked package artifact '${key}' byteLength`),
      sha256: readSha256(record.sha256, `cooked package artifact '${key}' sha256`),
      sourcePath: readOptionalString(record.sourcePath, `cooked package artifact '${key}' sourcePath`),
      compression: normalizeCookedPackageArtifactCompression(record.compression, `cooked package artifact '${key}' compression`),
    }];
  });

  return {
    layout: readPackageLayout(contentPackage.layout, "cooked package layout"),
    blobRoot: readString(contentPackage.blobRoot, "cooked package blobRoot"),
    artifactCount: readNonNegativeInteger(contentPackage.artifactCount, "cooked package artifactCount"),
    streaming: normalizeCookedPackageStreaming(contentPackage.streaming),
    artifacts: Object.fromEntries(artifactEntries),
  };
}

function normalizeCookedPackageArtifactCompression(value: unknown, label: string): CookedPackageArtifactCompression | undefined {
  if (value === undefined) {
    return undefined;
  }

  const compression = readRecord(value, label);
  return {
    algorithm: readString(compression.algorithm, `${label} algorithm`),
    blobPath: readString(compression.blobPath, `${label} blobPath`),
    byteLength: readNonNegativeInteger(compression.byteLength, `${label} byteLength`),
    sha256: readSha256(compression.sha256, `${label} sha256`),
  };
}

function normalizeCookedPackageStreaming(value: unknown): CookedPackageStreamingInfo {
  if (value === undefined) {
    return {
      locality: "unspecified",
      duplicateBlobPolicy: "unspecified",
      compression: "unspecified",
    };
  }

  const streaming = readRecord(value, "cooked package streaming metadata");
  return {
    locality: readString(streaming.locality, "cooked package streaming locality"),
    duplicateBlobPolicy: readString(streaming.duplicateBlobPolicy, "cooked package streaming duplicateBlobPolicy"),
    compression: readString(streaming.compression, "cooked package streaming compression"),
    sort: readOptionalString(streaming.sort, "cooked package streaming sort"),
    compressedBlobRoot: readOptionalString(streaming.compressedBlobRoot, "cooked package streaming compressedBlobRoot"),
    uncompressedBytes: readOptionalNonNegativeInteger(streaming.uncompressedBytes, "cooked package streaming uncompressedBytes"),
    compressedBytes: readOptionalNonNegativeInteger(streaming.compressedBytes, "cooked package streaming compressedBytes"),
    compressionRatio: readOptionalFiniteNumber(streaming.compressionRatio, "cooked package streaming compressionRatio"),
    duplicateArtifacts: readOptionalNonNegativeInteger(streaming.duplicateArtifacts, "cooked package streaming duplicateArtifacts"),
    uniqueBlobCount: readOptionalNonNegativeInteger(streaming.uniqueBlobCount, "cooked package streaming uniqueBlobCount"),
  };
}