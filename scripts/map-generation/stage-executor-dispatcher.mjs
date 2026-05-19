import { generateTerrainAssets } from "./terrain-assets.mjs";
import { generatePaintAssets } from "./paint-assets.mjs";
import { generateVegetationAssets } from "./vegetation-assets.mjs";
import { generateWorldObjectAssets } from "./world-object-assets.mjs";
import { generateCookedMapAssets } from "./cooked-assets.mjs";

const sourceExecutors = {
  "shared-semantics-generator": executeSemanticsStage,
  "terrain-operation-executor": executeTerrainStage,
  "material-biome-executor": executePaintStage,
  "ecology-scatter-executor": executeVegetationStage,
  "semantic-object-executor": executeObjectsStage,
  "collision-cell-executor": executeCookedStage,
  "nav-cell-executor": executeCookedStage,
};

export function validateGraphExecutors(graph) {
  const missing = [];
  for (const [stageName, stage] of Object.entries(graph.stages ?? {})) {
    const executor = stage?.execution?.executor;
    if (typeof executor !== "string" || !sourceExecutors[executor]) {
      missing.push(`${stageName}:${String(executor ?? "missing")}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`World generation graph has unmapped executors: ${missing.join(", ")}`);
  }
}

export async function dispatchWorldGenerationStages(context, preset, graph, rebuildPlan, options = {}) {
  validateGraphExecutors(graph);
  const dryRun = Boolean(options.dryRun);
  const executed = [];
  const cookedResultByPlan = new Map();

  for (const action of rebuildPlan.actions) {
    const executor = sourceExecutors[action.executor];
    if (!executor) {
      throw new Error(`World generation stage '${action.stage}' has no executor mapping for '${action.executor}'.`);
    }

    if (dryRun) {
      executed.push(createStageResult(action, "planned", null));
      continue;
    }

    const result = await executor(context, preset, rebuildPlan, action, cookedResultByPlan);
    executed.push(createStageResult(action, "executed", result));
  }

  return executed;
}

function executeSemanticsStage(_context, preset) {
  return {
    id: preset.id,
    name: preset.name,
    note: "shared semantics are evaluated by terrain, material, ecology, object, collision, and nav executors",
  };
}

function executeTerrainStage(context, preset) {
  return generateTerrainAssets(context, preset);
}

function executePaintStage(context, preset) {
  return generatePaintAssets(context, preset);
}

function executeVegetationStage(context, preset) {
  return generateVegetationAssets(context, preset);
}

function executeObjectsStage(context, preset) {
  return generateWorldObjectAssets(context, preset);
}

async function executeCookedStage(context, preset, rebuildPlan, _action, cookedResultByPlan) {
  if (!cookedResultByPlan.has(rebuildPlan.planId)) {
    cookedResultByPlan.set(rebuildPlan.planId, await generateCookedMapAssets(context, preset, { rebuildPlan }));
  }

  return cookedResultByPlan.get(rebuildPlan.planId);
}

function createStageResult(action, status, result) {
  return {
    stage: action.stage,
    executor: action.executor,
    scope: action.scope,
    keyCount: action.keys.length,
    status,
    result,
  };
}
