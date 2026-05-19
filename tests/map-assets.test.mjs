import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { brotliDecompress } from "node:zlib";
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
const brotliDecompressAsync = promisify(brotliDecompress);

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

test("cooked package declares sorted Brotli sidecar artifacts", async () => {
  const manifest = await readJson(path.join(projectDirectory, "cooked/maps/main/manifest.json"));
  assert.equal(manifest.package.streaming.locality, "kind-cell-runtime-path-v2");
  assert.equal(manifest.package.streaming.compression, "brotli-sidecar-v1");
  const entries = Object.entries(manifest.package.artifacts);
  assert.ok(entries.length > 0);
  assert.deepEqual(entries.map(([key]) => key), [...entries].sort(compareArtifactEntries).map(([key]) => key));

  const [runtimePath, artifact] = entries.find(([, entry]) => entry.compression?.algorithm === "brotli") ?? [];
  assert.ok(runtimePath, "expected at least one compressed artifact");
  const compressedBytes = await readFile(path.join(projectDirectory, artifact.compression.blobPath));
  assert.equal(createHash("sha256").update(compressedBytes).digest("hex"), artifact.compression.sha256);
  const decompressedBytes = await brotliDecompressAsync(compressedBytes);
  assert.equal(createHash("sha256").update(decompressedBytes).digest("hex"), artifact.sha256);
});

test("cooked partition cells declare performance budget reports", async () => {
  const manifest = await readJson(path.join(projectDirectory, "cooked/maps/main/manifest.json"));
  assert.ok(manifest.partition.cells.length > 0);

  for (const cell of manifest.partition.cells) {
    const objectCell = manifest.assets.objects.cells[cell.key];
    const collisionCell = manifest.assets.collision.cells[cell.key];
    const navCell = manifest.assets.nav.cells[cell.key];
    assert.ok(cell.budget, `partition cell ${cell.key} budget`);
    assert.equal(cell.budget.objectCount, objectCell.objectCount);
    assert.equal(cell.budget.collisionShapeCount, collisionCell.shapeCount);
    assert.equal(cell.budget.navNodeCount, navCell.nodeCount);
    assert.equal(cell.budget.navLinkCount, navCell.linkCount + navCell.portalLinkCount);
    assert.equal(cell.budget.rawBytes, objectCell.byteLength + collisionCell.byteLength + navCell.byteLength);
    assert.equal(
      cell.budget.compressedBytes,
      compressedByteLength(manifest, objectCell) + compressedByteLength(manifest, collisionCell) + compressedByteLength(manifest, navCell),
    );
    assert.match(cell.budget.rating, /^(ok|watch|over)$/);
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

function compareArtifactEntries([leftPath, leftArtifact], [rightPath, rightArtifact]) {
  const leftOrder = artifactKindOrder(leftArtifact.kind);
  const rightOrder = artifactKindOrder(rightArtifact.kind);
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftCell = readCellCoordinates(leftPath);
  const rightCell = readCellCoordinates(rightPath);
  if (leftCell && rightCell) {
    return leftCell.z - rightCell.z || leftCell.x - rightCell.x || leftPath.localeCompare(rightPath);
  }
  if (leftCell) {
    return -1;
  }
  if (rightCell) {
    return 1;
  }

  return leftPath.localeCompare(rightPath);
}

function artifactKindOrder(kind) {
  return { metadata: 0, terrain: 10, paint: 20, vegetation: 30, objects: 40, collision: 50, nav: 60 }[kind] ?? 100;
}

function readCellCoordinates(runtimePath) {
  const match = /\/c_(-?\d+)_(-?\d+)\.[^.]+$/.exec(runtimePath);
  if (!match) {
    return null;
  }

  return { x: Number(match[1]), z: Number(match[2]) };
}

function compressedByteLength(manifest, cell) {
  return manifest.package.artifacts[cell.path]?.compression?.byteLength ?? cell.byteLength;
}