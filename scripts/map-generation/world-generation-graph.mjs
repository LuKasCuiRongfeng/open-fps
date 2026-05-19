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
    localRebuild: {
      planner: "scripts/map-generation/world-rebuild-planner.mjs",
      planFormat: "open-fps-world-rebuild-plan-v1",
      defaultPolicy: {
        mode: "scoped-first",
        fullRebuildRequiresExplicitFlag: true,
        staleCookAction: "plan-affected-scopes",
      },
      editorDiagnostics: ["stage-closure", "affected-scopes", "stale-cooked-cells", "budget-warnings"],
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
      maxPartitionCellsPerScopedCook: 9,
      maxEstimatedArtifactsPerScopedCook: 64,
      targetFrameRateFps: 60,
      maxDrawCalls: 1800,
      maxGpuMemoryMiB: 1536,
      maxVisibleVegetationInstances: 120000,
      packageLayout: "content-addressed-sha256-v1",
      packageCompression: "brotli-sidecar-v1",
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
    execution: {
      executor: "shared-semantics-generator",
      localRebuild: true,
      invalidates: ["terrain", "paint", "vegetation", "objects", "collision", "nav"],
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
    execution: {
      executor: "terrain-operation-executor",
      localRebuild: true,
      invalidates: ["paint", "vegetation", "objects", "collision", "nav"],
    },
    operations: [
      { id: "base-height", type: "constant", parameters: { heightMeters: preset.overrides.baseHeightMeters } },
      { id: "continental-shape", type: "domain-noise", parameters: preset.overrides.continental },
      { id: "mountain-ridges", type: "ridged-noise", parameters: preset.overrides.mountain },
      { id: "rolling-hills", type: "fractal-noise", parameters: preset.overrides.hills },
      { id: "valley-carve", type: "semantic-valley", parameters: preset.overrides.valleys },
      { id: "road-grade", type: "semantic-road-cut", parameters: { maxSlopeDegrees: 18, shoulderMeters: 16, blendMeters: 22 } },
      { id: "river-bed", type: "semantic-water-carve", parameters: { bankBlendMeters: 28, minDepthMeters: 1.2, maxDepthMeters: 3.8 } },
      { id: "poi-platforms", type: "semantic-platform", parameters: { radiusMultiplier: 1.2, maxSlopeDegrees: 10, blendMeters: 18 } },
      { id: "warp", type: "domain-warp", parameters: preset.overrides.warp },
      { id: "erosion-detail", type: "erosion-detail", parameters: preset.overrides.erosion },
      { id: "micro-detail", type: "detail-noise", parameters: preset.overrides.detail },
      { id: "manual-height-override", type: "authoring-layer", parameters: { blendMode: "replace", defaultEnabled: true } },
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
    execution: {
      executor: "material-biome-executor",
      localRebuild: true,
      invalidates: [],
    },
    rules: [
      "height-snowline",
      "slope-rock",
      "aspect-dryness",
      "basin-grassland-biome",
      "forest-floor-litter",
      "water-bank-wetness",
      "road-core-gravel",
      "road-shoulder-dirt",
      "road-rut-decal-mask",
      "poi-clearance-gravel",
      "macro-noise-variation",
      "manual-paint-override",
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
    execution: {
      executor: "ecology-scatter-executor",
      localRebuild: true,
      invalidates: ["collision", "nav"],
    },
    rules: [
      "slope-exclusion",
      "snowline-exclusion",
      "basin-grass-clusters",
      "forest-edge-falloff",
      "water-bank-boost",
      "road-clearance",
      "poi-clearance",
      "manual-protected-zone",
      "manual-exclusion-zone",
      "tree-cluster-understory",
      "impostor-distance-budget",
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
    execution: {
      executor: "semantic-object-executor",
      localRebuild: true,
      invalidates: ["collision", "nav"],
    },
    rules: [
      "spline-roads",
      "spline-rivers",
      "spline-fences",
      "poi-prefabs",
      "road-props",
      "poi-props",
      "rock-scatter",
      "collision-shape-authoring",
      "lod-instancing-budget",
    ],
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
    execution: {
      executor: "collision-cell-executor",
      localRebuild: true,
      invalidates: ["nav"],
    },
    strategies: ["terrain-heightfield", "water-volume", "object-blockers", "vegetation-query-clearance"],
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
    execution: {
      executor: "nav-cell-executor",
      localRebuild: true,
      invalidates: [],
    },
    strategies: ["slope-cost", "road-preference", "water-cost", "object-blockers", "cross-cell-portals"],
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