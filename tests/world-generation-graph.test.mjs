import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  generationGraphFormat,
  generationGraphPath,
  generationGraphVersion,
  mapPresets,
} from "../scripts/map-generation/shared.mjs";
import { createWorldGenerationGraph } from "../scripts/map-generation/world-generation-graph.mjs";

const rootDirectory = path.resolve(import.meta.dirname, "..");
const projectDirectory = path.join(rootDirectory, "kunlun_wilds");
const preset = mapPresets.find((entry) => entry.id === "main");
assert.ok(preset, "main map preset should exist");

test("world generation graph declares stage dependencies and rebuild scopes", () => {
  const graph = createWorldGenerationGraph(preset);

  assert.equal(graph.version, generationGraphVersion);
  assert.equal(graph.format, generationGraphFormat);
  assert.equal(graph.mapId, "main");
  assert.equal(graph.inputs.assetRegistry, "assets/registry.json");
  assert.deepEqual(graph.stages.paint.dependencies, ["semantics", "terrain", "assetRegistry"]);
  assert.deepEqual(graph.stages.vegetation.dependencies, ["semantics", "terrain", "assetRegistry"]);
  assert.deepEqual(graph.stages.nav.dependencies, ["semantics", "terrain", "objects", "collision"]);
  assert.equal(graph.stages.terrain.rebuild.scope, "height-region");
  assert.equal(graph.stages.objects.rebuild.scope, "world-partition-cell");
  assert.equal(graph.localRebuild.planFormat, "open-fps-world-rebuild-plan-v1");
  assert.equal(graph.stages.terrain.execution.executor, "terrain-operation-executor");
  assert.ok(graph.stages.objects.rules.includes("spline-roads"));
  assert.ok(graph.stages.nav.strategies.includes("cross-cell-portals"));
});

test("default cooked map hashes generation graph and rebuild metadata", async () => {
  const [mapManifest, graph, cooked, navCell] = await Promise.all([
    readJson(path.join(projectDirectory, "maps/main/map.json")),
    readJson(path.join(projectDirectory, "maps/main", generationGraphPath)),
    readJson(path.join(projectDirectory, "cooked/maps/main/manifest.json")),
    readJson(path.join(projectDirectory, "cooked/maps/main/nav/cells/c_0_0.navpack")),
  ]);

  assert.equal(mapManifest.generationGraphPath, generationGraphPath);
  assert.equal(graph.format, generationGraphFormat);
  assert.equal(cooked.source.generationGraph.path, `maps/main/${generationGraphPath}`);
  assert.match(cooked.source.generationGraph.sha256, /^[0-9a-f]{64}$/);
  if (cooked.build.rebuild.mode === "scoped") {
    assert.match(cooked.build.rebuild.planId, /^[0-9a-f]{16}$/);
  } else {
    assert.equal(cooked.build.rebuild.planId, null);
  }
  assert.equal(cooked.package.streaming.locality, "world-partition-cell-runtime-path-v1");
  assert.ok(Array.isArray(navCell.crossCellLinks));
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}