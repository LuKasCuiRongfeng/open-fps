import assert from "node:assert/strict";
import test from "node:test";
import { buildHeightConfig, generateHeight } from "../scripts/map-generation/height-field.mjs";
import { mapPresets } from "../scripts/map-generation/shared.mjs";
import {
  createSemanticWorldObjects,
  getSemanticPathInfluence,
  sampleWorldSemantics,
} from "../scripts/map-generation/world-semantics.mjs";

const preset = mapPresets.find((entry) => entry.id === "main");
assert.ok(preset, "main map preset should exist");

const heightConfig = buildHeightConfig(preset);
const heightAt = (x, z) => generateHeight(x, z, preset, heightConfig);
const objects = createSemanticWorldObjects(heightAt);

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