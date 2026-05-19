import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { transpileTsModule } from "./helpers/transpile-ts.mjs";

const rootDirectory = path.resolve(import.meta.dirname, "..");
const dependencyKinds = ["terrain", "paint", "vegetation", "objects", "collision", "nav"];

test("cooked world partition planner creates load, keep, unload, and dependency plans", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "open-fps-partition-"));
  try {
    await transpileTsModule(
      path.join(rootDirectory, "src/game/workspace/CookedMapManifest.ts"),
      tempRoot,
    );
    const runtimePath = await transpileTsModule(
      path.join(rootDirectory, "src/game/workspace/CookedWorldPartitionRuntime.ts"),
      tempRoot,
      (source) => source.replace('} from "./CookedMapManifest";', '} from "./CookedMapManifest.js";'),
    );

    const { CookedWorldPartitionRuntime } = await import(pathToFileURL(runtimePath).href);
    const runtime = new CookedWorldPartitionRuntime(createPartition());

    const firstPlan = runtime.createPlan(50, 50, { loadRadiusCells: 0, unloadRadiusCells: 1 });
    assert.equal(firstPlan.centerCell?.key, "0,0");
    assert.deepEqual(firstPlan.loadCells.map((cell) => cell.key), ["0,0"]);
    assert.deepEqual(firstPlan.keepCells.map((cell) => cell.key), []);
    assert.deepEqual(firstPlan.unloadCellKeys, []);
    assert.deepEqual(firstPlan.dependencies.objects, ["0,0"]);

    runtime.applyPlan(firstPlan);
    const secondPlan = runtime.createPlan(150, 50, { loadRadiusCells: 0, unloadRadiusCells: 1 });
    assert.equal(secondPlan.centerCell?.key, "1,0");
    assert.deepEqual(secondPlan.loadCells.map((cell) => cell.key), ["1,0"]);
    assert.deepEqual(secondPlan.keepCells.map((cell) => cell.key), ["0,0"]);
    assert.deepEqual(secondPlan.unloadCellKeys, []);
    assert.deepEqual(secondPlan.dependencies.nav, ["0,0", "1,0"]);

    runtime.applyPlan(secondPlan);
    const outsidePlan = runtime.createPlan(1000, 1000, { loadRadiusCells: 0 });
    assert.equal(outsidePlan.centerCell, null);
    assert.deepEqual(outsidePlan.unloadCellKeys, ["0,0", "1,0"]);
    assert.deepEqual(outsidePlan.dependencies.collision, []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("world nav query resolves paths across loaded cell portals", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "open-fps-nav-query-"));
  try {
    const navQueryPath = await transpileTsModule(
      path.join(rootDirectory, "src/game/world/partition/WorldNavQuery.ts"),
      tempRoot,
      (source) => source.replace('} from "./WorldPartitionPayloads";', '} from "./WorldPartitionPayloads.js";'),
    );
    await transpileTsModule(
      path.join(rootDirectory, "src/game/world/partition/WorldPartitionPayloads.ts"),
      tempRoot,
    );
    const { createWorldNavGraph, findWorldNavPath } = await import(pathToFileURL(navQueryPath).href);
    const graph = createWorldNavGraph(createNavCells());
    const pathResult = findWorldNavPath(graph, { x: 1, z: 1 }, { x: 65, z: 1 }, 128);

    assert.equal(pathResult.status, "ok");
    assert.deepEqual(pathResult.nodes.map((node) => node.id), ["0,0:0,0", "0,0:1,0", "1,0:0,0"]);
    assert.equal(graph.cellKeys.join("|"), "0,0|1,0");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

function createPartition() {
  const cells = [];
  for (let z = -1; z <= 1; z += 1) {
    for (let x = -1; x <= 1; x += 1) {
      const key = `${x},${z}`;
      cells.push({
        key,
        x,
        z,
        pageRect: { minX: x, maxX: x, minZ: z, maxZ: z },
        boundsMeters: {
          minX: x * 100,
          minZ: z * 100,
          maxX: (x + 1) * 100,
          maxZ: (z + 1) * 100,
        },
        dependencies: Object.fromEntries(dependencyKinds.map((kind) => [kind, [key]])),
      });
    }
  }

  return {
    cellSizePages: 1,
    cellSizeMeters: 100,
    dependencyKinds,
    cells,
  };
}

function createNavCells() {
  return [
    {
      version: 1,
      format: "world-nav-cell-pack-v1",
      cell: { key: "0,0" },
      nodes: [
        createNavNode("0,0:0,0", 0, 0, 0, 0),
        createNavNode("0,0:1,0", 1, 0, 32, 0),
      ],
      links: [{ from: "0,0:0,0", to: "0,0:1,0", cost: 1 }],
      crossCellLinks: [{ from: "0,0:1,0", edge: "east", targetCell: "1,0", sourceCell: "0,0", cost: 1, portalMeters: { x: 32, z: 0 } }],
    },
    {
      version: 1,
      format: "world-nav-cell-pack-v1",
      cell: { key: "1,0" },
      nodes: [createNavNode("1,0:0,0", 0, 0, 64, 0)],
      links: [],
      crossCellLinks: [],
    },
  ];
}

function createNavNode(id, x, z, worldX, worldZ) {
  return {
    id,
    x,
    z,
    position: { x: worldX, y: 0, z: worldZ },
    walkable: true,
    cost: 1,
  };
}