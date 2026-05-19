import { createHash } from "node:crypto";
import path from "node:path";
import {
  cookedWorldPartitionCellSizePages,
  generationGraphPath,
  getMapDir,
  heightRegionSizePages,
  pageSizeMeters,
  paintRegionSizePages,
  readJsonFile,
  vegetationCellSizeMeters,
  vegetationRegionSizeCells,
} from "./shared.mjs";

const externalStageDependencies = new Set(["assetRegistry"]);
const stageScopeFields = {
  semantics: "partitionCells",
  terrain: "terrainRegions",
  paint: "paintRegions",
  vegetation: "vegetationRegions",
  objects: "partitionCells",
  collision: "partitionCells",
  nav: "partitionCells",
};

export function createRebuildRequestFromArgs(args) {
  return {
    dryRun: args.includes("--plan") || args.includes("--dry-run"),
    full: args.includes("--full"),
    allowBudgetOverrun: args.includes("--allow-budget-overrun"),
    targetStages: readStageFlags(args, "--stage"),
    changedStages: readStageFlags(args, "--changed-stage"),
    scopes: {
      terrainRegions: readGridKeyFlags(args, "--terrain-region"),
      paintRegions: readGridKeyFlags(args, "--paint-region"),
      vegetationRegions: readGridKeyFlags(args, "--vegetation-region"),
      partitionCells: [
        ...readGridKeyFlags(args, "--cell"),
        ...readGridKeyFlags(args, "--partition-cell"),
      ],
    },
  };
}

export function hasRebuildRequest(request) {
  return Boolean(
    request.full
      || request.dryRun
      || request.targetStages.length > 0
      || request.changedStages.length > 0
      || Object.values(request.scopes).some((entries) => entries.length > 0),
  );
}

export async function readWorldGenerationGraph(context, preset) {
  const graph = await readJsonFile(path.join(getMapDir(context, preset), generationGraphPath));
  if (!graph) {
    throw new Error(`World generation graph is missing for map '${preset.id}'. Run pnpm gen:all -- --map ${preset.id} first.`);
  }

  return graph;
}

export async function createWorldRebuildPlanFromContext(context, preset, request) {
  const graph = await readWorldGenerationGraph(context, preset);
  return createWorldRebuildPlan(graph, request);
}

export function createWorldRebuildPlan(graph, request = createEmptyRequest()) {
  const stageNames = getStageNames(graph);
  const topology = sortStagesByDependencies(graph, stageNames);
  const allScopes = createAllScopes(graph);
  const scopeInputProvided = hasScopeInput(request.scopes);
  const stageInputProvided = request.targetStages.length > 0 || request.changedStages.length > 0;
  const full = request.full || (!scopeInputProvided && !stageInputProvided);
  const selectedStages = full
    ? topology
    : resolveSelectedStages(graph, topology, request);
  const selectedScopes = full
    ? allScopes
    : resolveSelectedScopes(graph, allScopes, request);
  const actions = selectedStages.map((stageName) => createRebuildAction(graph, stageName, selectedScopes));
  const plan = {
    version: 1,
    format: "open-fps-world-rebuild-plan-v1",
    mode: full ? "full" : "scoped",
    mapId: graph.mapId,
    planId: "",
    request: normalizeRequest(request),
    stages: selectedStages,
    scopes: selectedScopes,
    actions,
    budget: createPlanBudget(graph, full ? "full" : "scoped", selectedStages, selectedScopes),
  };

  plan.planId = createPlanId(plan);
  return plan;
}

export function formatRebuildPlanForConsole(plan) {
  const lines = [
    `${plan.mapId}: ${plan.mode} rebuild plan ${plan.planId}`,
    `  Stages: ${plan.stages.join(" -> ") || "none"}`,
    `  Terrain regions: ${formatScope(plan.scopes.terrainRegions)}`,
    `  Paint regions: ${formatScope(plan.scopes.paintRegions)}`,
    `  Vegetation regions: ${formatScope(plan.scopes.vegetationRegions)}`,
    `  Partition cells: ${formatScope(plan.scopes.partitionCells)}`,
    `  Estimated artifacts: ${plan.budget.estimatedArtifacts}`,
    `  Budget: ${plan.budget.exceeded ? "blocked" : "within limits"}`,
  ];

  if (plan.budget.errors.length > 0) {
    lines.push("  Budget blockers:");
    for (const error of plan.budget.errors) {
      lines.push(`    - ${error}`);
    }
  }

  if (plan.budget.warnings.length > 0) {
    lines.push("  Warnings:");
    for (const warning of plan.budget.warnings) {
      lines.push(`    - ${warning}`);
    }
  }

  return lines.join("\n");
}

export function assertRebuildPlanWithinBudget(plan, request = {}) {
  if (!plan.budget.exceeded || request.allowBudgetOverrun) {
    return;
  }

  throw new Error(`Scoped rebuild budget exceeded for '${plan.mapId}': ${plan.budget.errors.join("; ")}. Use --allow-budget-overrun after review to bypass.`);
}

function createEmptyRequest() {
  return {
    dryRun: false,
    full: false,
    allowBudgetOverrun: false,
    targetStages: [],
    changedStages: [],
    scopes: {
      terrainRegions: [],
      paintRegions: [],
      vegetationRegions: [],
      partitionCells: [],
    },
  };
}

function readStageFlags(args, flag) {
  return uniqueStringSorted(readFlagValues(args, flag).flatMap((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean)));
}

function readGridKeyFlags(args, flag) {
  return uniqueSorted(readFlagValues(args, flag).map(normalizeGridKey));
}

function readFlagValues(args, flag) {
  const values = [];
  const inlinePrefix = `${flag}=`;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument.startsWith(inlinePrefix)) {
      values.push(argument.slice(inlinePrefix.length));
      continue;
    }
    if (argument === flag && index + 1 < args.length) {
      values.push(args[index + 1]);
      index += 1;
    }
  }

  return values;
}

function normalizeGridKey(value) {
  const normalized = value.trim().replace(/\s+/, ",");
  if (!/^-?\d+,-?\d+$/.test(normalized)) {
    throw new Error(`Invalid rebuild scope key '${value}'. Expected '<x>,<z>'.`);
  }

  const { x, z } = parseGridKey(normalized);
  return `${x},${z}`;
}

function normalizeRequest(request) {
  return {
    dryRun: Boolean(request.dryRun),
    full: Boolean(request.full),
    allowBudgetOverrun: Boolean(request.allowBudgetOverrun),
    targetStages: uniqueStringSorted(request.targetStages ?? []),
    changedStages: uniqueStringSorted(request.changedStages ?? []),
    scopes: {
      terrainRegions: uniqueSorted(request.scopes?.terrainRegions ?? []),
      paintRegions: uniqueSorted(request.scopes?.paintRegions ?? []),
      vegetationRegions: uniqueSorted(request.scopes?.vegetationRegions ?? []),
      partitionCells: uniqueSorted(request.scopes?.partitionCells ?? []),
    },
  };
}

function getStageNames(graph) {
  if (!graph?.stages || typeof graph.stages !== "object" || Array.isArray(graph.stages)) {
    throw new Error("World generation graph must contain stage metadata before planning a rebuild.");
  }

  return Object.keys(graph.stages);
}

function sortStagesByDependencies(graph, stageNames) {
  const remaining = new Set(stageNames);
  const sorted = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((stageName) => getStageDependencies(graph, stageName).every((dependency) => !remaining.has(dependency)))
      .sort((left, right) => stageNames.indexOf(left) - stageNames.indexOf(right));
    if (ready.length === 0) {
      throw new Error("World generation graph contains a dependency cycle.");
    }
    for (const stageName of ready) {
      remaining.delete(stageName);
      sorted.push(stageName);
    }
  }

  return sorted;
}

function resolveSelectedStages(graph, topology, request) {
  const normalizedRequest = normalizeRequest(request);
  if (normalizedRequest.targetStages.length > 0 && normalizedRequest.changedStages.length === 0) {
    validateStageList(graph, normalizedRequest.targetStages);
    return topology.filter((stageName) => normalizedRequest.targetStages.includes(stageName));
  }

  const seeds = normalizedRequest.changedStages.length > 0
    ? normalizedRequest.changedStages
    : inferChangedStagesFromScopes(normalizedRequest.scopes);
  validateStageList(graph, seeds.filter((stageName) => !externalStageDependencies.has(stageName)));
  const affectedStages = collectDownstreamStages(graph, seeds);
  const targetFilter = normalizedRequest.targetStages.length > 0
    ? new Set(normalizedRequest.targetStages)
    : null;
  if (targetFilter) {
    validateStageList(graph, normalizedRequest.targetStages);
  }

  return topology.filter((stageName) => affectedStages.has(stageName) && (!targetFilter || targetFilter.has(stageName)));
}

function validateStageList(graph, stageNames) {
  const knownStages = new Set(Object.keys(graph.stages ?? {}));
  for (const stageName of stageNames) {
    if (!knownStages.has(stageName)) {
      throw new Error(`Unknown world generation stage '${stageName}'. Known stages: ${[...knownStages].sort().join(", ")}`);
    }
  }
}

function inferChangedStagesFromScopes(scopes) {
  const stages = [];
  if (scopes.terrainRegions.length > 0) {
    stages.push("terrain");
  }
  if (scopes.paintRegions.length > 0) {
    stages.push("paint");
  }
  if (scopes.vegetationRegions.length > 0) {
    stages.push("vegetation");
  }
  if (scopes.partitionCells.length > 0) {
    stages.push("objects");
  }

  return stages;
}

function collectDownstreamStages(graph, seedStages) {
  const affectedStages = new Set(seedStages.filter((stageName) => !externalStageDependencies.has(stageName)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const stageName of Object.keys(graph.stages)) {
      if (affectedStages.has(stageName)) {
        continue;
      }

      const dependencies = getRawStageDependencies(graph, stageName);
      if (dependencies.some((dependency) => affectedStages.has(dependency) || seedStages.includes(dependency))) {
        affectedStages.add(stageName);
        changed = true;
      }
    }
  }

  return affectedStages;
}

function getStageDependencies(graph, stageName) {
  return getRawStageDependencies(graph, stageName).filter((dependency) => !externalStageDependencies.has(dependency));
}

function getRawStageDependencies(graph, stageName) {
  const dependencies = graph.stages?.[stageName]?.dependencies;
  return Array.isArray(dependencies) ? dependencies : [];
}

function createAllScopes(graph) {
  const pageRect = getWorldPageRect(graph);
  return {
    terrainRegions: collectPageRegionKeys(pageRect, heightRegionSizePages),
    paintRegions: collectPageRegionKeys(pageRect, paintRegionSizePages),
    vegetationRegions: collectVegetationRegionKeys(pageRect),
    partitionCells: collectPartitionCellKeys(pageRect, cookedWorldPartitionCellSizePages),
  };
}

function resolveSelectedScopes(graph, allScopes, request) {
  const normalizedRequest = normalizeRequest(request);
  if (!hasScopeInput(normalizedRequest.scopes)) {
    return allScopes;
  }

  const pageRects = [
    ...normalizedRequest.scopes.terrainRegions.map((key) => regionKeyToPageRect(key, heightRegionSizePages)),
    ...normalizedRequest.scopes.paintRegions.map((key) => regionKeyToPageRect(key, paintRegionSizePages)),
    ...normalizedRequest.scopes.vegetationRegions.map(vegetationRegionKeyToPageRect),
    ...normalizedRequest.scopes.partitionCells.map((key) => regionKeyToPageRect(key, cookedWorldPartitionCellSizePages)),
  ].map((pageRect) => clampPageRect(pageRect, getWorldPageRect(graph))).filter(Boolean);

  const selected = {
    terrainRegions: new Set(normalizedRequest.scopes.terrainRegions),
    paintRegions: new Set(normalizedRequest.scopes.paintRegions),
    vegetationRegions: new Set(normalizedRequest.scopes.vegetationRegions),
    partitionCells: new Set(normalizedRequest.scopes.partitionCells),
  };

  for (const pageRect of pageRects) {
    addMatchingKeys(selected.terrainRegions, allScopes.terrainRegions, (key) => pageRectsIntersect(regionKeyToPageRect(key, heightRegionSizePages), pageRect));
    addMatchingKeys(selected.paintRegions, allScopes.paintRegions, (key) => pageRectsIntersect(regionKeyToPageRect(key, paintRegionSizePages), pageRect));
    addMatchingKeys(selected.vegetationRegions, allScopes.vegetationRegions, (key) => pageRectsIntersect(vegetationRegionKeyToPageRect(key), pageRect));
    addMatchingKeys(selected.partitionCells, allScopes.partitionCells, (key) => pageRectsIntersect(regionKeyToPageRect(key, cookedWorldPartitionCellSizePages), pageRect));
  }

  return {
    terrainRegions: sortGridKeys([...selected.terrainRegions]),
    paintRegions: sortGridKeys([...selected.paintRegions]),
    vegetationRegions: sortGridKeys([...selected.vegetationRegions]),
    partitionCells: sortGridKeys([...selected.partitionCells]),
  };
}

function hasScopeInput(scopes) {
  return Object.values(scopes ?? {}).some((entries) => entries.length > 0);
}

function addMatchingKeys(target, sourceKeys, predicate) {
  for (const key of sourceKeys) {
    if (predicate(key)) {
      target.add(key);
    }
  }
}

function createRebuildAction(graph, stageName, scopes) {
  const stage = graph.stages[stageName];
  const scopeField = stageScopeFields[stageName] ?? "partitionCells";
  const keys = scopes[scopeField] ?? [];
  return {
    stage: stageName,
    kind: stage.kind,
    executor: stage.execution?.executor ?? `${stageName}-executor`,
    scope: stage.rebuild?.scope ?? scopeField,
    keys,
    invalidates: Array.isArray(stage.execution?.invalidates) ? stage.execution.invalidates : [],
  };
}

function createPlanBudget(graph, mode, stages, scopes) {
  const warnings = [];
  const errors = [];
  const estimatedArtifacts = countStageArtifacts(stages, scopes);
  const maxPartitionCellsPerScopedCook = readPositiveInteger(graph.budgets?.maxPartitionCellsPerScopedCook);
  const maxEstimatedArtifactsPerScopedCook = readPositiveInteger(graph.budgets?.maxEstimatedArtifactsPerScopedCook);
  if (scopes.terrainRegions.length === graph.budgets?.maxTerrainHeightRegionsPerFullRebuild) {
    warnings.push("terrain rebuild touches every height region");
  }
  if (scopes.paintRegions.length === graph.budgets?.maxPaintRegionsPerFullRebuild) {
    warnings.push("paint rebuild touches every paint region");
  }

  if (mode === "scoped" && maxPartitionCellsPerScopedCook !== null && scopes.partitionCells.length > maxPartitionCellsPerScopedCook) {
    errors.push(`partition cells ${scopes.partitionCells.length} exceeds scoped limit ${maxPartitionCellsPerScopedCook}`);
  }

  if (mode === "scoped" && maxEstimatedArtifactsPerScopedCook !== null && estimatedArtifacts > maxEstimatedArtifactsPerScopedCook) {
    errors.push(`estimated artifacts ${estimatedArtifacts} exceeds scoped limit ${maxEstimatedArtifactsPerScopedCook}`);
  }

  return {
    estimatedArtifacts,
    terrainRegionCount: scopes.terrainRegions.length,
    paintRegionCount: scopes.paintRegions.length,
    vegetationRegionCount: scopes.vegetationRegions.length,
    partitionCellCount: scopes.partitionCells.length,
    maxPartitionCellsPerScopedCook,
    maxEstimatedArtifactsPerScopedCook,
    exceeded: errors.length > 0,
    errors,
    warnings,
  };
}

function readPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function countStageArtifacts(stages, scopes) {
  let count = 0;
  for (const stageName of stages) {
    const scopeField = stageScopeFields[stageName];
    count += scopes[scopeField]?.length ?? 0;
  }

  return count;
}

function getWorldPageRect(graph) {
  const pageBounds = graph.world?.pageBounds;
  if (!pageBounds) {
    throw new Error("World generation graph must contain page bounds before planning a rebuild.");
  }

  return {
    minX: pageBounds.minPageX,
    maxX: pageBounds.maxPageX,
    minZ: pageBounds.minPageZ,
    maxZ: pageBounds.maxPageZ,
  };
}

function collectPartitionCellKeys(pageRect, cellSizePages) {
  return collectPageRegionKeys(pageRect, cellSizePages);
}

function collectPageRegionKeys(pageRect, regionSizePages) {
  const keys = [];
  const minRegionX = Math.floor(pageRect.minX / regionSizePages);
  const maxRegionX = Math.floor(pageRect.maxX / regionSizePages);
  const minRegionZ = Math.floor(pageRect.minZ / regionSizePages);
  const maxRegionZ = Math.floor(pageRect.maxZ / regionSizePages);
  for (let regionZ = minRegionZ; regionZ <= maxRegionZ; regionZ += 1) {
    for (let regionX = minRegionX; regionX <= maxRegionX; regionX += 1) {
      keys.push(`${regionX},${regionZ}`);
    }
  }

  return sortGridKeys(keys);
}

function collectVegetationRegionKeys(pageRect) {
  const cellsPerPage = pageSizeMeters / vegetationCellSizeMeters;
  const minCellX = pageRect.minX * cellsPerPage;
  const maxCellX = (pageRect.maxX + 1) * cellsPerPage - 1;
  const minCellZ = pageRect.minZ * cellsPerPage;
  const maxCellZ = (pageRect.maxZ + 1) * cellsPerPage - 1;
  const keys = [];
  for (let regionZ = Math.floor(minCellZ / vegetationRegionSizeCells); regionZ <= Math.floor(maxCellZ / vegetationRegionSizeCells); regionZ += 1) {
    for (let regionX = Math.floor(minCellX / vegetationRegionSizeCells); regionX <= Math.floor(maxCellX / vegetationRegionSizeCells); regionX += 1) {
      keys.push(`${regionX},${regionZ}`);
    }
  }

  return sortGridKeys(keys);
}

function regionKeyToPageRect(key, regionSizePages) {
  const { x: regionX, z: regionZ } = parseGridKey(key);
  return {
    minX: regionX * regionSizePages,
    maxX: regionX * regionSizePages + regionSizePages - 1,
    minZ: regionZ * regionSizePages,
    maxZ: regionZ * regionSizePages + regionSizePages - 1,
  };
}

function vegetationRegionKeyToPageRect(key) {
  const { x: regionX, z: regionZ } = parseGridKey(key);
  const cellsPerPage = pageSizeMeters / vegetationCellSizeMeters;
  const minCellX = regionX * vegetationRegionSizeCells;
  const maxCellX = minCellX + vegetationRegionSizeCells - 1;
  const minCellZ = regionZ * vegetationRegionSizeCells;
  const maxCellZ = minCellZ + vegetationRegionSizeCells - 1;
  return {
    minX: Math.floor(minCellX / cellsPerPage),
    maxX: Math.floor(maxCellX / cellsPerPage),
    minZ: Math.floor(minCellZ / cellsPerPage),
    maxZ: Math.floor(maxCellZ / cellsPerPage),
  };
}

function clampPageRect(pageRect, worldPageRect) {
  const clamped = {
    minX: Math.max(pageRect.minX, worldPageRect.minX),
    maxX: Math.min(pageRect.maxX, worldPageRect.maxX),
    minZ: Math.max(pageRect.minZ, worldPageRect.minZ),
    maxZ: Math.min(pageRect.maxZ, worldPageRect.maxZ),
  };

  return clamped.minX <= clamped.maxX && clamped.minZ <= clamped.maxZ ? clamped : null;
}

function pageRectsIntersect(left, right) {
  return left.minX <= right.maxX
    && left.maxX >= right.minX
    && left.minZ <= right.maxZ
    && left.maxZ >= right.minZ;
}

function createPlanId(plan) {
  return createHash("sha256").update(JSON.stringify({
    mapId: plan.mapId,
    mode: plan.mode,
    request: plan.request,
    stages: plan.stages,
    scopes: plan.scopes,
  })).digest("hex").slice(0, 16);
}

function formatScope(keys) {
  if (keys.length === 0) {
    return "none";
  }
  if (keys.length <= 8) {
    return keys.join(", ");
  }

  return `${keys.length} keys (${keys.slice(0, 4).join(", ")} ... ${keys.slice(-2).join(", ")})`;
}

function uniqueSorted(values) {
  return sortGridKeys([...new Set(values)]);
}

function uniqueStringSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sortGridKeys(values) {
  return [...values].sort(compareGridKeys);
}

function compareGridKeys(left, right) {
  const leftKey = parseGridKey(left);
  const rightKey = parseGridKey(right);
  return leftKey.z - rightKey.z || leftKey.x - rightKey.x;
}

function parseGridKey(key) {
  const [xPart, zPart] = key.split(",");
  const x = Number(xPart);
  const z = Number(zPart);
  return { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 };
}