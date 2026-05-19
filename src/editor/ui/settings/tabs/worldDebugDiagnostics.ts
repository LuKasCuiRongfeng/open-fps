// WorldDebugDiagnostics: cooked source freshness and rebuild command planning.
// WorldDebugDiagnostics：cooked source 新鲜度检查与重建命令规划。

import { getPlatform, type PlatformCookMapRequest } from "@/platform";
import { formatUnknownError } from "@/platform/errorUtils";
import type { EditorAppSession } from "@editor/app";
import { getVegetationRegionCoordsForCell, vegetationRegionKey } from "@game/world/vegetation";
import { getHeightRegionCoordsForPageKey, heightRegionKey, type MapData } from "@project/MapData";

const platform = getPlatform();

export type DiagnosticStatus = "idle" | "checking" | "ready" | "error";
export type CookedManifestStatus = "idle" | "ready" | "missing";
export type CookedSourceStatus = "fresh" | "stale" | "missing" | "unknown";
export type RebuildPlanStatus = "idle" | "checking" | "fresh" | "save-first" | "ready" | "error";
export type MetricTone = "neutral" | "success" | "warning" | "danger" | "info";
export type SourceKey = "project" | "assetRegistry" | "map" | "generationGraph" | "terrain" | "paint" | "vegetation" | "objects";

export type RebuildScopes = {
  terrainRegions: string[];
  paintRegions: string[];
  vegetationRegions: string[];
  partitionCells: string[];
};

export type RebuildBudgetLimits = {
  maxPartitionCellsPerScopedCook: number | null;
  maxEstimatedArtifactsPerScopedCook: number | null;
};

export type EditorRebuildBudget = {
  estimatedArtifacts: number;
  partitionCellCount: number;
  maxPartitionCellsPerScopedCook: number | null;
  maxEstimatedArtifactsPerScopedCook: number | null;
  exceeded: boolean;
  issues: string[];
};

export type CookedSourceDiagnostic = {
  key: SourceKey;
  label: string;
  path: string;
  status: CookedSourceStatus;
  expectedSha256: string | null;
  actualSha256: string | null;
};

export type LiveRebuildState = {
  unsaved: boolean;
  stages: string[];
  scopes: RebuildScopes;
  issues: string[];
};

export type RebuildCommand = {
  kind: "dryRun" | "cook";
  label: string;
  command: string;
};

export type EditorRebuildPlan = {
  status: RebuildPlanStatus;
  label: string;
  tone: MetricTone;
  changedStages: string[];
  sourceLabels: string[];
  liveLabels: string[];
  scopes: RebuildScopes;
  budget: EditorRebuildBudget;
  commands: RebuildCommand[];
};

export type AssetDiagnostics = {
  status: DiagnosticStatus;
  generationStages: number;
  generationRules: number;
  generationExecutors: number;
  generationLocalScopes: number;
  generationBudgets: number;
  budgetLimits: RebuildBudgetLimits;
  generationPolicy: string;
  terrainRegionSizePages: number;
  vegetationRegionSizeCells: number;
  terrainRegions: number;
  paintRegions: number;
  vegetationRegions: number;
  vegetationModels: number;
  objectCells: number;
  objectCount: number;
  checkedPacks: number;
  checkedBytes: number;
  cookedStatus: CookedManifestStatus;
  cookedGeneratedAt: string | null;
  cookedSources: CookedSourceDiagnostic[];
  issues: string[];
};

export const emptyDiagnostics: AssetDiagnostics = {
  status: "idle",
  generationStages: 0,
  generationRules: 0,
  generationExecutors: 0,
  generationLocalScopes: 0,
  generationBudgets: 0,
  budgetLimits: {
    maxPartitionCellsPerScopedCook: null,
    maxEstimatedArtifactsPerScopedCook: null,
  },
  generationPolicy: "none",
  terrainRegionSizePages: 8,
  vegetationRegionSizeCells: 8,
  terrainRegions: 0,
  paintRegions: 0,
  vegetationRegions: 0,
  vegetationModels: 0,
  objectCells: 0,
  objectCount: 0,
  checkedPacks: 0,
  checkedBytes: 0,
  cookedStatus: "idle",
  cookedGeneratedAt: null,
  cookedSources: [],
  issues: [],
};

const emptyScopes: RebuildScopes = {
  terrainRegions: [],
  paintRegions: [],
  vegetationRegions: [],
  partitionCells: [],
};

const cookedSourceDescriptors: Array<{ key: SourceKey; label: string; stage: string | null }> = [
  { key: "project", label: "Project", stage: null },
  { key: "assetRegistry", label: "Asset Registry", stage: "assetRegistry" },
  { key: "map", label: "Map", stage: null },
  { key: "generationGraph", label: "Generation Graph", stage: null },
  { key: "terrain", label: "Terrain", stage: "terrain" },
  { key: "paint", label: "Paint", stage: "paint" },
  { key: "vegetation", label: "Vegetation", stage: "vegetation" },
  { key: "objects", label: "Objects", stage: "objects" },
];

const fullRebuildSourceKeys = new Set<SourceKey>(["project", "map", "generationGraph"]);

export async function loadAssetDiagnostics(
  editorApp: EditorAppSession,
  mapDirectory: string,
  projectPath: string | null,
  mapId: string | null,
): Promise<AssetDiagnostics> {
  const issues: string[] = [];
  const mapData = editorApp.exportCurrentMapData();
  const diagnostics: AssetDiagnostics = {
    ...emptyDiagnostics,
    status: "ready",
    issues,
  };

  const generationGraph = await readJsonManifest(joinPath(mapDirectory, mapData.generationGraphPath), issues);
  const generationStages = readRecordProperty(generationGraph, "stages");
  const localRebuild = readRecordProperty(generationGraph, "localRebuild");
  const defaultPolicy = readRecordProperty(localRebuild, "defaultPolicy");
  diagnostics.generationStages = countRecordEntries(generationStages);
  diagnostics.generationRules = countGenerationGraphRules(generationStages);
  diagnostics.generationExecutors = countGenerationGraphExecutors(generationStages);
  diagnostics.generationLocalScopes = countGenerationGraphLocalScopes(generationStages);
  const generationBudgets = readRecordProperty(generationGraph, "budgets");
  diagnostics.generationBudgets = countRecordEntries(generationBudgets);
  diagnostics.budgetLimits = readBudgetLimits(generationBudgets);
  diagnostics.generationPolicy = readStringProperty(defaultPolicy, "mode") ?? "none";

  const terrainManifest = await readJsonManifest(joinPath(mapDirectory, mapData.terrainPath), issues);
  diagnostics.terrainRegionSizePages = readNumberProperty(terrainManifest, "regionSizePages") ?? diagnostics.terrainRegionSizePages;
  diagnostics.terrainRegions = countRecordEntries(readRecordProperty(terrainManifest, "regions"));
  await validateRegionPacks(mapDirectory, terrainManifest, "heightpack", issues, diagnostics);

  const paintManifest = await readJsonManifest(joinPath(mapDirectory, mapData.paintPath), issues);
  const splatMaps = readRecordProperty(paintManifest, "splatMaps");
  diagnostics.paintRegions = countRecordEntries(readRecordProperty(splatMaps, "regions"));
  await validateRegionPacks(mapDirectory, splatMaps, "paintpack", issues, diagnostics);

  const vegetationManifest = await readJsonManifest(joinPath(mapDirectory, mapData.vegetationPath), issues);
  diagnostics.vegetationModels = countRecordEntries(readRecordProperty(vegetationManifest, "models"));
  const instances = readRecordProperty(vegetationManifest, "instances");
  diagnostics.vegetationRegionSizeCells = readNumberProperty(instances, "regionSizeCells") ?? diagnostics.vegetationRegionSizeCells;
  diagnostics.vegetationRegions = countRecordEntries(readRecordProperty(instances, "regions"));
  await validateRegionPacks(mapDirectory, instances, "vegpack", issues, diagnostics);

  const objectManifest = await readJsonManifest(joinPath(mapDirectory, mapData.objectsPath ?? "objects/manifest.json"), issues);
  await validateObjectPacks(mapDirectory, objectManifest, issues, diagnostics, mapData);
  await loadCookedSourceDiagnostics(projectPath, mapId, diagnostics);

  return diagnostics;
}

export function collectLiveRebuildState(editorApp: EditorAppSession | null, diagnostics: AssetDiagnostics): LiveRebuildState {
  if (!editorApp) {
    return { unsaved: false, stages: [], scopes: emptyScopes, issues: [] };
  }

  const issues: string[] = [];
  const scopes: RebuildScopes = cloneScopes(emptyScopes);
  const stages: string[] = [];
  const terrainDirty = editorApp.getTerrainEditor().dirty;
  const textureEditor = editorApp.getTextureEditor();
  const vegetationEditor = editorApp.getVegetationEditor();
  const worldObjectEditor = editorApp.getWorldObjectEditor();

  if (terrainDirty) {
    stages.push("terrain");
    try {
      const mapData = editorApp.exportCurrentMapData();
      scopes.terrainRegions = heightPageKeysToRegionKeys(
        mapData.dirtyHeightPageKeys ?? [],
        diagnostics.terrainRegionSizePages,
      );
    } catch (error) {
      issues.push(`Terrain scope unavailable: ${formatUnknownError(error)}`);
    }
  }

  if (textureEditor.dirty) {
    stages.push("paint");
    scopes.paintRegions = uniqueGridKeys(textureEditor.getDirtyPaintRegionKeys());
  }

  if (vegetationEditor.dirty) {
    stages.push("vegetation");
    scopes.vegetationRegions = vegetationCellKeysToRegionKeys(
      vegetationEditor.getDirtyCellKeys(),
      diagnostics.vegetationRegionSizeCells,
    );
  }

  if (worldObjectEditor.dirty) {
    stages.push("objects");
    scopes.partitionCells = uniqueGridKeys(worldObjectEditor.getDirtyCellKeys());
  }

  return {
    unsaved: stages.length > 0,
    stages: uniqueStageNames(stages),
    scopes,
    issues,
  };
}

export function createEditorRebuildPlan(
  mapId: string | null,
  diagnostics: AssetDiagnostics,
  liveRebuild: LiveRebuildState,
  projectPath: string | null = null,
): EditorRebuildPlan {
  if (!mapId) {
    return createEmptyEditorRebuildPlan("No Map", "idle", "warning");
  }

  if (diagnostics.status === "checking") {
    return createEmptyEditorRebuildPlan("Checking", "checking", "info");
  }

  if (diagnostics.status === "error") {
    return createEmptyEditorRebuildPlan("Blocked", "error", "danger");
  }

  const staleSources = diagnostics.cookedSources.filter((source) => source.status === "stale" || source.status === "missing" || source.status === "unknown");
  const sourceLabels = staleSources.map((source) => `${source.label}: ${source.status}`);
  let full = diagnostics.cookedStatus === "missing";
  const changedStages: string[] = [...liveRebuild.stages];

  for (const source of staleSources) {
    if (fullRebuildSourceKeys.has(source.key)) {
      full = true;
      continue;
    }

    const descriptor = cookedSourceDescriptors.find((entry) => entry.key === source.key);
    if (descriptor?.stage) {
      changedStages.push(descriptor.stage);
    }
  }

  const scopes = full ? cloneScopes(emptyScopes) : cloneScopes(liveRebuild.scopes);
  const hasChanges = full || changedStages.length > 0 || liveRebuild.unsaved || staleSources.length > 0;
  if (!hasChanges) {
    return createEmptyEditorRebuildPlan("Fresh", "fresh", "success");
  }

  const normalizedStages = full ? [] : uniqueStageNames(changedStages);
  const budget = createEditorRebuildBudget(full, normalizedStages, scopes, diagnostics.budgetLimits);
  const commands = createRebuildCommands(projectPath, mapId, full, normalizedStages, scopes);
  return {
    status: liveRebuild.unsaved ? "save-first" : "ready",
    label: liveRebuild.unsaved ? "Save First" : "Ready",
    tone: liveRebuild.unsaved ? "warning" : "info",
    changedStages: full ? ["full"] : normalizedStages,
    sourceLabels: diagnostics.cookedStatus === "missing" ? ["Cooked manifest: missing", ...sourceLabels] : sourceLabels,
    liveLabels: createLiveRebuildLabels(liveRebuild),
    scopes,
    budget,
    commands,
  };
}

export function createEditorCookMapRequest(
  projectPath: string | null,
  mapId: string | null,
  plan: EditorRebuildPlan,
  dryRun: boolean,
): PlatformCookMapRequest | null {
  if (!projectPath || !mapId || plan.status !== "ready") {
    return null;
  }

  const full = plan.changedStages.includes("full");
  return {
    projectPath,
    mapId,
    dryRun,
    full,
    changedStages: full ? [] : [...plan.changedStages],
    scopes: full ? cloneScopes(emptyScopes) : cloneScopes(plan.scopes),
  };
}

export function formatStageList(stages: readonly string[]): string {
  if (stages.length === 0) {
    return "none";
  }

  if (stages.length <= 3) {
    return stages.map(formatStageName).join(", ");
  }

  return `${stages.length} stages`;
}

export function formatStageName(stage: string): string {
  switch (stage) {
    case "assetRegistry":
      return "asset registry";
    case "generationGraph":
      return "generation graph";
    default:
      return stage;
  }
}

export function formatShortTimestamp(value: string | null): string {
  if (!value) {
    return "none";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function countGenerationGraphRules(stages: Record<string, unknown> | null): number {
  if (!stages) {
    return 0;
  }

  let count = 0;
  for (const stage of Object.values(stages)) {
    const record = asRecord(stage);
    if (!record) {
      continue;
    }

    const operations = Array.isArray(record.operations) ? record.operations : [];
    const rules = Array.isArray(record.rules) ? record.rules : [];
    count += operations.length + rules.length;
  }

  return count;
}

async function validateRegionPacks(
  mapDirectory: string,
  manifestSection: Record<string, unknown> | null,
  extension: string,
  issues: string[],
  diagnostics: AssetDiagnostics,
): Promise<void> {
  if (!manifestSection) {
    return;
  }

  const regionsDirectory = readStringProperty(manifestSection, "regionsDirectory");
  const regionIntegrity = readRecordProperty(manifestSection, "regionIntegrity");
  if (!regionsDirectory || !regionIntegrity) {
    issues.push(`${extension} manifest is missing region integrity`);
    return;
  }

  for (const [key, integrity] of Object.entries(regionIntegrity)) {
    const regionPath = `${regionsDirectory}/r_${formatRegionFileKey(key)}.${extension}`;
    await validatePackIntegrity(joinPath(mapDirectory, regionPath), integrity, issues, diagnostics);
  }
}

async function validateObjectPacks(
  mapDirectory: string,
  manifest: Record<string, unknown> | null,
  issues: string[],
  diagnostics: AssetDiagnostics,
  mapData: MapData,
): Promise<void> {
  const cells = readRecordProperty(manifest, "cells");
  if (!cells) {
    issues.push("object manifest is missing cells");
    return;
  }

  diagnostics.objectCells = Object.keys(cells).length;
  for (const [key, value] of Object.entries(cells)) {
    const cell = asRecord(value);
    const cellPath = readStringProperty(cell, "path");
    if (!cellPath) {
      issues.push(`object cell '${key}' is missing path`);
      continue;
    }

    await validatePackIntegrity(joinPath(mapDirectory, cellPath), cell, issues, diagnostics);
    const pack = await readJsonManifest(joinPath(mapDirectory, cellPath), issues);
    const objects = Array.isArray(pack?.objects) ? pack.objects : [];
    const expectedCount = readNumberProperty(cell, "objectCount") ?? 0;
    diagnostics.objectCount += expectedCount;
    if (objects.length !== expectedCount) {
      issues.push(`object cell '${key}' count ${objects.length} != ${expectedCount}`);
    }
  }

  if (!mapData.objectsPath) {
    issues.push("map data is missing objectsPath");
  }
}

async function loadCookedSourceDiagnostics(
  projectPath: string | null,
  mapId: string | null,
  diagnostics: AssetDiagnostics,
): Promise<void> {
  if (!projectPath || !mapId) {
    diagnostics.cookedStatus = "idle";
    return;
  }

  const cookedManifest = await readOptionalJsonManifest(joinPath(projectPath, `cooked/maps/${mapId}/manifest.json`));
  if (!cookedManifest) {
    diagnostics.cookedStatus = "missing";
    return;
  }

  diagnostics.cookedStatus = "ready";
  diagnostics.cookedGeneratedAt = readStringProperty(readRecordProperty(cookedManifest, "build"), "generatedAt");
  const sourceManifest = readRecordProperty(cookedManifest, "source");
  const defaultPaths = createDefaultCookedSourcePaths(mapId);

  diagnostics.cookedSources = await Promise.all(cookedSourceDescriptors.map(async (descriptor) => {
    const sourceEntry = readRecordProperty(sourceManifest, descriptor.key);
    const path = readStringProperty(sourceEntry, "path") ?? defaultPaths[descriptor.key];
    const expectedSha256 = readStringProperty(sourceEntry, "sha256");

    if (!expectedSha256) {
      return {
        key: descriptor.key,
        label: descriptor.label,
        path,
        status: "unknown",
        expectedSha256: null,
        actualSha256: null,
      } satisfies CookedSourceDiagnostic;
    }

    try {
      const actualSha256 = await sha256Text(await platform.files.readText(joinPath(projectPath, path)));
      return {
        key: descriptor.key,
        label: descriptor.label,
        path,
        status: actualSha256 === expectedSha256 ? "fresh" : "stale",
        expectedSha256,
        actualSha256,
      } satisfies CookedSourceDiagnostic;
    } catch {
      return {
        key: descriptor.key,
        label: descriptor.label,
        path,
        status: "missing",
        expectedSha256,
        actualSha256: null,
      } satisfies CookedSourceDiagnostic;
    }
  }));
}

function createEmptyEditorRebuildPlan(label: string, status: RebuildPlanStatus, tone: MetricTone): EditorRebuildPlan {
  return {
    status,
    label,
    tone,
    changedStages: [],
    sourceLabels: [],
    liveLabels: [],
    scopes: cloneScopes(emptyScopes),
    budget: createEditorRebuildBudget(false, [], emptyScopes, emptyDiagnostics.budgetLimits),
    commands: [],
  };
}

function readBudgetLimits(budgets: Record<string, unknown> | null): RebuildBudgetLimits {
  const maxPartitionCellsPerScopedCook = readNumberProperty(budgets, "maxPartitionCellsPerScopedCook");
  const maxEstimatedArtifactsPerScopedCook = readNumberProperty(budgets, "maxEstimatedArtifactsPerScopedCook");
  return {
    maxPartitionCellsPerScopedCook: isPositiveInteger(maxPartitionCellsPerScopedCook) ? maxPartitionCellsPerScopedCook : null,
    maxEstimatedArtifactsPerScopedCook: isPositiveInteger(maxEstimatedArtifactsPerScopedCook) ? maxEstimatedArtifactsPerScopedCook : null,
  };
}

function createEditorRebuildBudget(
  full: boolean,
  changedStages: readonly string[],
  scopes: RebuildScopes,
  limits: RebuildBudgetLimits,
): EditorRebuildBudget {
  const estimatedArtifacts = countEstimatedArtifacts(changedStages, scopes);
  const partitionCellCount = scopes.partitionCells.length;
  const issues: string[] = [];

  if (!full && limits.maxPartitionCellsPerScopedCook !== null && partitionCellCount > limits.maxPartitionCellsPerScopedCook) {
    issues.push(`Partition cells ${partitionCellCount} exceeds scoped limit ${limits.maxPartitionCellsPerScopedCook}`);
  }

  if (!full && limits.maxEstimatedArtifactsPerScopedCook !== null && estimatedArtifacts > limits.maxEstimatedArtifactsPerScopedCook) {
    issues.push(`Estimated artifacts ${estimatedArtifacts} exceeds scoped limit ${limits.maxEstimatedArtifactsPerScopedCook}`);
  }

  return {
    estimatedArtifacts,
    partitionCellCount,
    maxPartitionCellsPerScopedCook: limits.maxPartitionCellsPerScopedCook,
    maxEstimatedArtifactsPerScopedCook: limits.maxEstimatedArtifactsPerScopedCook,
    exceeded: issues.length > 0,
    issues,
  };
}

function countEstimatedArtifacts(changedStages: readonly string[], scopes: RebuildScopes): number {
  let total = 0;
  for (const stage of changedStages) {
    switch (stage) {
      case "terrain":
        total += scopes.terrainRegions.length;
        break;
      case "paint":
        total += scopes.paintRegions.length;
        break;
      case "vegetation":
        total += scopes.vegetationRegions.length;
        break;
      case "semantics":
      case "objects":
      case "collision":
      case "nav":
        total += scopes.partitionCells.length;
        break;
      default:
        break;
    }
  }

  return total;
}

function createRebuildCommands(projectPath: string | null, mapId: string, full: boolean, changedStages: readonly string[], scopes: RebuildScopes): RebuildCommand[] {
  const args = createRebuildCommandArgs(projectPath, mapId, full, changedStages, scopes);
  return [
    { kind: "dryRun", label: "Dry Run", command: ["pnpm cook:map --", ...args, "--plan"].join(" ") },
    { kind: "cook", label: "Cook", command: ["pnpm cook:map --", ...args].join(" ") },
  ];
}

function createRebuildCommandArgs(projectPath: string | null, mapId: string, full: boolean, changedStages: readonly string[], scopes: RebuildScopes): string[] {
  const args = projectPath ? [quoteCommandArg(projectPath), "--map", quoteCommandArg(mapId)] : ["--map", quoteCommandArg(mapId)];
  if (full) {
    args.push("--full");
    return args;
  }

  if (changedStages.length > 0) {
    args.push("--changed-stage", quoteCommandArg(changedStages.join(",")));
  }

  appendScopeArgs(args, "--terrain-region", scopes.terrainRegions);
  appendScopeArgs(args, "--paint-region", scopes.paintRegions);
  appendScopeArgs(args, "--vegetation-region", scopes.vegetationRegions);
  appendScopeArgs(args, "--cell", scopes.partitionCells);
  return args;
}

function appendScopeArgs(args: string[], flag: string, keys: readonly string[]): void {
  for (const key of keys) {
    args.push(flag, quoteCommandArg(key));
  }
}

function quoteCommandArg(value: string): string {
  return /^[A-Za-z0-9._/-]+$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`;
}

function createLiveRebuildLabels(liveRebuild: LiveRebuildState): string[] {
  const labels = liveRebuild.stages.map((stage) => `${formatStageName(stage)}: unsaved`);
  return [...labels, ...liveRebuild.issues];
}

function heightPageKeysToRegionKeys(pageKeys: readonly string[], regionSizePages: number): string[] {
  return uniqueGridKeys(pageKeys.map((key) => {
    const region = getHeightRegionCoordsForPageKey(key, regionSizePages);
    return heightRegionKey(region.x, region.z);
  }));
}

function vegetationCellKeysToRegionKeys(cellKeys: readonly string[], regionSizeCells: number): string[] {
  return uniqueGridKeys(cellKeys.map((key) => {
    const { x, z } = parseGridKey(key);
    const region = getVegetationRegionCoordsForCell(x, z, regionSizeCells);
    return vegetationRegionKey(region.x, region.z);
  }));
}

async function validatePackIntegrity(
  filePath: string,
  integrity: unknown,
  issues: string[],
  diagnostics: AssetDiagnostics,
): Promise<void> {
  const record = asRecord(integrity);
  const expectedByteLength = readNumberProperty(record, "byteLength");
  const expectedSha256 = readStringProperty(record, "sha256");
  if (expectedByteLength === null || !expectedSha256) {
    issues.push(`${basename(filePath)} is missing integrity metadata`);
    return;
  }

  try {
    const bytes = decodeBase64(await platform.files.readBinaryBase64(filePath));
    diagnostics.checkedPacks += 1;
    diagnostics.checkedBytes += bytes.byteLength;
    if (bytes.byteLength !== expectedByteLength) {
      issues.push(`${basename(filePath)} byteLength ${bytes.byteLength} != ${expectedByteLength}`);
    }

    const actualSha256 = await sha256Hex(bytes);
    if (actualSha256 !== expectedSha256) {
      issues.push(`${basename(filePath)} sha256 mismatch`);
    }
  } catch (error) {
    issues.push(`${basename(filePath)} ${formatUnknownError(error)}`);
  }
}

async function readJsonManifest(filePath: string, issues: string[]): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await platform.files.readText(filePath)) as unknown;
    return asRecord(parsed);
  } catch (error) {
    issues.push(`${basename(filePath)} ${formatUnknownError(error)}`);
    return null;
  }
}

async function readOptionalJsonManifest(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await platform.files.readText(filePath)) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function readRecordProperty(value: Record<string, unknown> | null, property: string): Record<string, unknown> | null {
  return asRecord(value?.[property]);
}

function readStringProperty(value: Record<string, unknown> | null, property: string): string | null {
  const nextValue = value?.[property];
  return typeof nextValue === "string" ? nextValue : null;
}

function readNumberProperty(value: Record<string, unknown> | null, property: string): number | null {
  const nextValue = value?.[property];
  return typeof nextValue === "number" && Number.isFinite(nextValue) ? nextValue : null;
}

function isPositiveInteger(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function countRecordEntries(value: Record<string, unknown> | null): number {
  return value ? Object.keys(value).length : 0;
}

function createDefaultCookedSourcePaths(mapId: string): Record<SourceKey, string> {
  return {
    project: "project.json",
    assetRegistry: "assets/registry.json",
    map: `maps/${mapId}/map.json`,
    generationGraph: `maps/${mapId}/generation/graph.json`,
    terrain: `maps/${mapId}/terrain/height/manifest.json`,
    paint: `maps/${mapId}/paint/layers.json`,
    vegetation: `maps/${mapId}/vegetation/models.json`,
    objects: `maps/${mapId}/objects/manifest.json`,
  };
}

function cloneScopes(scopes: RebuildScopes): RebuildScopes {
  return {
    terrainRegions: [...scopes.terrainRegions],
    paintRegions: [...scopes.paintRegions],
    vegetationRegions: [...scopes.vegetationRegions],
    partitionCells: [...scopes.partitionCells],
  };
}

function uniqueGridKeys(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareGridKeys);
}

function uniqueStageNames(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => stageSortIndex(left) - stageSortIndex(right) || left.localeCompare(right));
}

function stageSortIndex(stage: string): number {
  const order = ["assetRegistry", "semantics", "terrain", "paint", "vegetation", "objects", "collision", "nav", "full"];
  const index = order.indexOf(stage);
  return index >= 0 ? index : order.length;
}

function compareGridKeys(left: string, right: string): number {
  const leftKey = parseGridKey(left);
  const rightKey = parseGridKey(right);
  return leftKey.z - rightKey.z || leftKey.x - rightKey.x;
}

function parseGridKey(key: string): { x: number; z: number } {
  const [xPart, zPart] = key.split(",");
  const x = Number(xPart);
  const z = Number(zPart);
  return { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 };
}

function formatRegionFileKey(key: string): string {
  const [x, z] = key.split(",").map(Number);
  return `${formatGridCoordinate(x)}_${formatGridCoordinate(z)}`;
}

function formatGridCoordinate(value: number): string {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

function joinPath(directory: string, relativePath: string): string {
  return `${directory.replace(/[\\/]$/, "")}/${relativePath}`;
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = window.atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sha256Text(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

function countGenerationGraphExecutors(stages: Record<string, unknown> | null): number {
  if (!stages) {
    return 0;
  }

  let count = 0;
  for (const stage of Object.values(stages)) {
    const execution = readRecordProperty(asRecord(stage), "execution");
    if (readStringProperty(execution, "executor")) {
      count += 1;
    }
  }

  return count;
}

function countGenerationGraphLocalScopes(stages: Record<string, unknown> | null): number {
  if (!stages) {
    return 0;
  }

  const scopes = new Set<string>();
  for (const stage of Object.values(stages)) {
    const rebuild = readRecordProperty(asRecord(stage), "rebuild");
    const scope = readStringProperty(rebuild, "scope");
    if (scope) {
      scopes.add(scope);
    }
  }

  return scopes.size;
}