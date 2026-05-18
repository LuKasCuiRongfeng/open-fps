import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTerrainPaintLayers, createVegetationModelDefinitions } from "../scripts/map-generation/asset-registry.mjs";
import { buildHeightConfig, generateHeight } from "../scripts/map-generation/height-field.mjs";
import { mapPresets } from "../scripts/map-generation/shared.mjs";
import {
  createSemanticArchetypes,
  createSemanticWorldObjects,
  getSemanticPathInfluence,
  sampleWorldSemantics,
} from "../scripts/map-generation/world-semantics.mjs";

const preset = mapPresets.find((entry) => entry.id === "main");
assert.ok(preset, "main map preset should exist");

const heightConfig = buildHeightConfig(preset);
const heightAt = (x, z) => generateHeight(x, z, preset, heightConfig);
const objects = createSemanticWorldObjects(heightAt);
const assetRegistry = JSON.parse(await readFile(new URL("../test_pro/assets/registry.json", import.meta.url), "utf8"));

test("shared world semantics mark road, water, and POI clearance zones", () => {
  const road = sampleWorldSemantics(-670, -990, objects);
  const water = sampleWorldSemantics(-335, -1165, objects);
  const camp = sampleWorldSemantics(-180, -240, objects);
  const farField = sampleWorldSemantics(1450, 1450, objects);

  assert.ok(road.roadCore > 0.7, "main road sample should be a strong road core");
  assert.ok(water.waterCore > 0.7, "main river sample should be a strong water core");
  assert.ok(camp.poiClearance > 0.7, "central camp should clear vegetation around the POI");
  assert.ok(farField.vegetationClearance < 0.35, "far field should not inherit road/water/POI clearing");
});

test("terrain shaping can query the same semantic path source", () => {
  assert.ok(getSemanticPathInfluence(-335, -1165, { layer: "water" }, 42, 240) > 0.8);
  assert.ok(getSemanticPathInfluence(-670, -990, { layer: "road" }, 8, 58) > 0.8);
});

test("semantic object archetypes declare render and editor metadata", () => {
  const archetypes = createSemanticArchetypes(assetRegistry);

  assert.equal(archetypes["supply-crates"].render.kind, "gltf");
  assert.match(archetypes["supply-crates"].render.path, /assets\/imported\/models\/wooden_crate_01_1k\.gltf/);
  assert.equal(archetypes["road-dirt-segment"].render.kind, "ribbon");
  assert.equal(archetypes["broken-bridge"].validation.blocksNav, true);
  assert.ok(archetypes.camp.prefab.length >= 1);
});

test("asset registry drives material and vegetation source definitions", () => {
  const paintLayers = createTerrainPaintLayers(assetRegistry);
  const vegetationModels = createVegetationModelDefinitions(assetRegistry);

  assert.equal(paintLayers.beachSand.diffuse, "assets/imported/materials/aerial_beach_01_1k/aerial_beach_01_diff_1k.jpg");
  assert.equal(paintLayers.snow.normal, "assets/imported/materials/snow_03_1k/snow_03_nor_gl_1k.png");
  assert.equal(vegetationModels.fern.path, "../../assets/imported/models/fern_02_1k.gltf/fern_02_1k.gltf");
  assert.equal(vegetationModels.quiverTree.lod2Path, "../../assets/imported/models/quiver_tree_02_1k.gltf/lod2/quiver_tree_02_lod2.gltf");
});