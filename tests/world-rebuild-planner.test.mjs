import assert from "node:assert/strict";
import test from "node:test";
import { mapPresets } from "../scripts/map-generation/shared.mjs";
import { createWorldGenerationGraph } from "../scripts/map-generation/world-generation-graph.mjs";
import { assertRebuildPlanWithinBudget, createWorldRebuildPlan } from "../scripts/map-generation/world-rebuild-planner.mjs";

const preset = mapPresets.find((entry) => entry.id === "main");
assert.ok(preset, "main map preset should exist");

test("world rebuild planner expands terrain edits into downstream local scopes", () => {
  const graph = createWorldGenerationGraph(preset);
  const plan = createWorldRebuildPlan(graph, {
    full: false,
    targetStages: [],
    changedStages: ["terrain"],
    scopes: {
      terrainRegions: ["0,0"],
      paintRegions: [],
      vegetationRegions: [],
      partitionCells: [],
    },
  });

  assert.equal(plan.mode, "scoped");
  assert.deepEqual(plan.stages, ["terrain", "paint", "vegetation", "objects", "collision", "nav"]);
  assert.deepEqual(plan.scopes.terrainRegions, ["0,0"]);
  assert.deepEqual(plan.scopes.paintRegions, ["0,0"]);
  assert.deepEqual(plan.scopes.vegetationRegions, ["0,0", "1,0", "0,1", "1,1"]);
  assert.deepEqual(plan.scopes.partitionCells, ["0,0"]);
  assert.equal(plan.actions.find((action) => action.stage === "collision")?.executor, "collision-cell-executor");
});

test("world rebuild planner can target one derived partition stage", () => {
  const graph = createWorldGenerationGraph(preset);
  const plan = createWorldRebuildPlan(graph, {
    full: false,
    targetStages: ["collision"],
    changedStages: [],
    scopes: {
      terrainRegions: [],
      paintRegions: [],
      vegetationRegions: [],
      partitionCells: ["0,0"],
    },
  });

  assert.deepEqual(plan.stages, ["collision"]);
  assert.deepEqual(plan.scopes.partitionCells, ["0,0"]);
  assert.equal(plan.budget.estimatedArtifacts, 1);
});

test("world rebuild planner treats asset registry changes as graph inputs", () => {
  const graph = createWorldGenerationGraph(preset);
  const plan = createWorldRebuildPlan(graph, {
    full: false,
    targetStages: [],
    changedStages: ["assetRegistry"],
    scopes: {
      terrainRegions: [],
      paintRegions: [],
      vegetationRegions: [],
      partitionCells: ["0,0"],
    },
  });

  assert.deepEqual(plan.stages, ["paint", "vegetation", "objects", "collision", "nav"]);
  assert.deepEqual(plan.scopes.partitionCells, ["0,0"]);
  assert.ok(plan.planId.length > 0);
});

test("world rebuild planner blocks oversized scoped cooks", () => {
  const graph = createWorldGenerationGraph(preset);
  const plan = createWorldRebuildPlan(graph, {
    full: false,
    targetStages: ["collision"],
    changedStages: [],
    scopes: {
      terrainRegions: [],
      paintRegions: [],
      vegetationRegions: [],
      partitionCells: ["0,0", "1,0", "2,0", "3,0", "4,0", "5,0", "6,0", "7,0", "8,0", "9,0"],
    },
  });

  assert.equal(plan.budget.exceeded, true);
  assert.match(plan.budget.errors[0], /partition cells 10 exceeds scoped limit 9/);
  assert.throws(() => assertRebuildPlanWithinBudget(plan), /budget exceeded/);
  assert.doesNotThrow(() => assertRebuildPlanWithinBudget(plan, { allowBudgetOverrun: true }));
});