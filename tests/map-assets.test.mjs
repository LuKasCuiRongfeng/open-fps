import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  heightPageResolution,
  paintPageResolution,
  vegetationInstanceRecordByteLength,
  vegetationRegionPackEntryByteLength,
  vegetationRegionPackHeaderByteLength,
  vegetationRegionPackMagic,
  vegetationRegionPackVersion,
} from "../scripts/map-generation/shared.mjs";

const rootDirectory = path.resolve(import.meta.dirname, "..");
const defaultAssetProjectDirectory = "kunlun_wilds";
const projectDirectory = path.join(rootDirectory, defaultAssetProjectDirectory);
const mapDirectory = path.join(projectDirectory, "maps", "main");

test("source region pack byte layouts match their manifests", async () => {
  const terrain = await readJson(path.join(mapDirectory, "terrain/height/manifest.json"));
  for (const [key, mask] of Object.entries(terrain.regions)) {
    const packPath = path.join(mapDirectory, "terrain/height/regions", regionFileName("r", key, "heightpack"));
    const bytes = await readFile(packPath);
    const expected = countSetBits(BigInt(mask)) * heightPageResolution * heightPageResolution * 4;
    assert.equal(bytes.byteLength, expected, `height region ${key}`);
  }

  const paint = await readJson(path.join(mapDirectory, "paint/layers.json"));
  for (const [key, mask] of Object.entries(paint.splatMaps.regions)) {
    const packPath = path.join(mapDirectory, "paint/regions", regionFileName("r", key, "paintpack"));
    const bytes = await readFile(packPath);
    const expected = countSetBits(BigInt(mask)) * paintPageResolution * paintPageResolution * 4 * paint.splatMaps.indices.length;
    assert.equal(bytes.byteLength, expected, `paint region ${key}`);
  }

  const vegetation = await readJson(path.join(mapDirectory, "vegetation/models.json"));
  for (const [key, mask] of Object.entries(vegetation.instances.regions)) {
    const packPath = path.join(mapDirectory, "vegetation/regions", regionFileName("r", key, "vegpack"));
    const bytes = await readFile(packPath);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const cellCount = view.getUint16(6, true);
    assert.equal(view.getUint32(0, true), vegetationRegionPackMagic, `vegetation region ${key} magic`);
    assert.equal(view.getUint16(4, true), vegetationRegionPackVersion, `vegetation region ${key} version`);
    assert.equal(cellCount, countSetBits(BigInt(mask)), `vegetation region ${key} cell count`);

    let expectedLength = vegetationRegionPackHeaderByteLength + cellCount * vegetationRegionPackEntryByteLength;
    for (let index = 0; index < cellCount; index += 1) {
      const entryOffset = vegetationRegionPackHeaderByteLength + index * vegetationRegionPackEntryByteLength;
      expectedLength += view.getUint32(entryOffset + 4, true) * vegetationInstanceRecordByteLength;
    }
    assert.equal(bytes.byteLength, expectedLength, `vegetation region ${key} byte length`);
  }
});

test("map validator rejects a truncated source pack", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "open-fps-map-"));
  const tempProject = path.join(tempRoot, defaultAssetProjectDirectory);
  try {
    await cp(projectDirectory, tempProject, { recursive: true });
    const terrain = await readJson(path.join(tempProject, "maps/main/terrain/height/manifest.json"));
    const [key] = Object.keys(terrain.regions);
    const packPath = path.join(tempProject, "maps/main/terrain/height/regions", regionFileName("r", key, "heightpack"));
    const bytes = await readFile(packPath);
    await writeFile(packPath, bytes.subarray(0, bytes.byteLength - 4));

    await assert.rejects(
      () => runNode(["scripts/validate-map-assets.mjs", "--project", tempProject, "--map", "main"]),
      (error) => {
        const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
        assert.match(output, /Expected \d+ bytes, got \d+/);
        assert.match(output, /heightpack/);
        return true;
      },
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function regionFileName(prefix, key, extension) {
  const [x, z] = key.split(",").map(Number);
  return `${prefix}_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.${extension}`;
}

function formatGridCoordinate(value) {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

function countSetBits(mask) {
  let value = mask;
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: rootDirectory, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}