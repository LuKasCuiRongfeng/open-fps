import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  cookedWorldPartitionCellSizePages,
  generationGraphFormat,
  generationGraphPath,
  generationGraphVersion,
  getMapDir,
  getPageBounds,
  heightRegionSizePages,
  pageSizeMeters,
  paintRegionSizePages,
  terrainHeightPath,
  vegetationCellSizeMeters,
  vegetationModelsPath,
  vegetationRegionSizeCells,
  worldObjectsPath,
  writeJsonFile,
} from "./shared.mjs";
import { assetRegistryPath } from "./asset-registry.mjs";

export function createWorldGenerationGraph(preset) {
  const pageBounds = getPageBounds(preset);
  return {
    version: generationGraphVersion,
    format: generationGraphFormat,
    mapId: preset.id,
    name: preset.name,
    seed: preset.seed,
    shaper: preset.shaper,
    world: {
      pageSizeMeters,
      pageBounds,
      partitionCellSizePages: cookedWorldPartitionCellSizePages,
    },
    inputs: {
      designSpec: "OPEN_WORLD_DESIGN_SPEC.md",
      assetRegistry: assetRegistryPath,
      sharedSemantics: "scripts/map-generation/world-semantics.mjs",
    },
    stages: {
      semantics: createSemanticsStage(),
      terrain: createTerrainStage(preset),
      paint: createPaintStage(),
      vegetation: createVegetationStage(),
      objects: createObjectsStage(),
      collision: createCollisionStage(),
      nav: createNavStage(),
    },
    budgets: {
      targetAreaSquareKilometers: roundAreaSquareKilometers(pageBounds),
      maxTerrainHeightRegionsPerFullRebuild: countRegions(pageBounds, heightRegionSizePages),
      maxPaintRegionsPerFullRebuild: countRegions(pageBounds, paintRegionSizePages),
      vegetationCellSizeMeters,
      partitionCellSizeMeters: cookedWorldPartitionCellSizePages * pageSizeMeters,
    },
  };
}

export async function writeWorldGenerationGraph(context, preset) {
  const graph = createWorldGenerationGraph(preset);
  const graphPath = path.join(getMapDir(context, preset), generationGraphPath);
  await mkdir(path.dirname(graphPath), { recursive: true });
  await writeJsonFile(graphPath, graph);
  return graph;
}

function createSemanticsStage() {
  return {
    kind: "shared-semantic-foundation",
    dependencies: [],
    outputs: ["roads", "water", "poi", "clearance", "object-archetypes"],
    rebuild: {
      scope: "world-partition-cell",
      cellSizePages: cookedWorldPartitionCellSizePages,
    },
  };
}

function createTerrainStage(preset) {
  return {
    kind: "terrain-operation-graph",
    output: terrainHeightPath,
    dependencies: ["semantics"],
    rebuild: {
      scope: "height-region",
      regionSizePages: heightRegionSizePages,
    },
    operations: [
      { id: "base-height", type: "constant", parameters: { heightMeters: preset.overrides.baseHeightMeters } },
      { id: "continental-shape", type: "domain-noise", parameters: preset.overrides.continental },
      { id: "mountain-ridges", type: "ridged-noise", parameters: preset.overrides.mountain },
      { id: "rolling-hills", type: "fractal-noise", parameters: preset.overrides.hills },
      { id: "valley-carve", type: "semantic-valley", parameters: preset.overrides.valleys },
      { id: "warp", type: "domain-warp", parameters: preset.overrides.warp },
      { id: "erosion-detail", type: "erosion-detail", parameters: preset.overrides.erosion },
      { id: "micro-detail", type: "detail-noise", parameters: preset.overrides.detail },
    ],
  };
}

function createPaintStage() {
  return {
    kind: "material-biome-graph",
    output: "paint/layers.json",
    dependencies: ["semantics", "terrain", "assetRegistry"],
    rebuild: {
      scope: "paint-region",
      regionSizePages: paintRegionSizePages,
    },
    rules: [
      "height-snowline",
      "slope-rock",
      "water-bank-wetness",
      "road-core-gravel",
      "poi-clearance-gravel",
      "macro-noise-variation",
    ],
  };
}

function createVegetationStage() {
  return {
    kind: "ecology-scatter-graph",
    output: vegetationModelsPath,
    dependencies: ["semantics", "terrain", "assetRegistry"],
    rebuild: {
      scope: "vegetation-region",
      cellSizeMeters: vegetationCellSizeMeters,
      regionSizeCells: vegetationRegionSizeCells,
    },
    rules: [
      "slope-exclusion",
      "snowline-exclusion",
      "water-bank-boost",
      "road-clearance",
      "poi-clearance",
      "tree-cluster-understory",
    ],
  };
}

function createObjectsStage() {
  return {
    kind: "semantic-object-placement-graph",
    output: worldObjectsPath,
    dependencies: ["semantics", "terrain", "assetRegistry"],
    rebuild: {
      scope: "world-partition-cell",
      cellSizePages: cookedWorldPartitionCellSizePages,
    },
    rules: ["roads", "water", "poi", "road-props", "poi-props"],
  };
}

function createCollisionStage() {
  return {
    kind: "derived-collision-build",
    output: "cooked/maps/<mapId>/collision/cells",
    dependencies: ["terrain", "objects"],
    rebuild: {
      scope: "world-partition-cell",
      cellSizePages: cookedWorldPartitionCellSizePages,
    },
  };
}

function createNavStage() {
  return {
    kind: "derived-nav-build",
    output: "cooked/maps/<mapId>/nav/cells",
    dependencies: ["semantics", "terrain", "objects", "collision"],
    rebuild: {
      scope: "world-partition-cell",
      cellSizePages: cookedWorldPartitionCellSizePages,
    },
  };
}

function countRegions(pageBounds, regionSizePages) {
  const minRegionX = Math.floor(pageBounds.minPageX / regionSizePages);
  const maxRegionX = Math.floor(pageBounds.maxPageX / regionSizePages);
  const minRegionZ = Math.floor(pageBounds.minPageZ / regionSizePages);
  const maxRegionZ = Math.floor(pageBounds.maxPageZ / regionSizePages);
  return (maxRegionX - minRegionX + 1) * (maxRegionZ - minRegionZ + 1);
}

function roundAreaSquareKilometers(pageBounds) {
  const pageCountX = pageBounds.maxPageX - pageBounds.minPageX + 1;
  const pageCountZ = pageBounds.maxPageZ - pageBounds.minPageZ + 1;
  return Math.round(pageCountX * pageCountZ * pageSizeMeters * pageSizeMeters / 10_000) / 100;
}