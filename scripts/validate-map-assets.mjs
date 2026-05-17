#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PROJECT_FILE = "project.json";
const MAP_FILE = "map.json";
const TERRAIN_HEIGHT_PATH = "terrain/height/manifest.json";
const TERRAIN_REGION_DIRECTORY = "terrain/height/regions";
const TERRAIN_REGION_EXTENSION = ".heightpack";
const PAINT_PATH = "paint/layers.json";
const PAINT_REGION_DIRECTORY = "paint/regions";
const PAINT_REGION_EXTENSION = ".paintpack";
const VEGETATION_PATH = "vegetation/models.json";
const VEGETATION_REGION_DIRECTORY = "vegetation/regions";
const VEGETATION_REGION_EXTENSION = ".vegpack";
const HEIGHT_SAMPLE_BYTE_LENGTH = 4;
const RGBA8_BYTE_LENGTH = 4;
const VEGETATION_REGION_HEADER_BYTE_LENGTH = 8;
const VEGETATION_REGION_ENTRY_BYTE_LENGTH = 8;
const VEGETATION_INSTANCE_BYTE_LENGTH = 24;

const options = parseArgs(process.argv.slice(2));
const projectDirectory = path.resolve(options.projectDirectory ?? "test_pro");
const requestedMapId = options.mapId;
const diagnostics = [];
let checkedFiles = 0;

await validateProject(projectDirectory, requestedMapId);
printDiagnostics(diagnostics);

if (hasErrors(diagnostics)) {
  process.exitCode = 1;
} else {
  console.log(`[validate-map-assets] OK: ${checkedFiles} files checked.`);
}

async function validateProject(projectPath, mapIdOverride) {
  const projectJson = await readJsonFile(path.join(projectPath, PROJECT_FILE), "project metadata");
  const mapIds = Array.isArray(projectJson.maps) ? projectJson.maps : [];
  const mapId = mapIdOverride ?? projectJson.currentMapId;
  if (typeof mapId !== "string" || mapId.length === 0) {
    addError(PROJECT_FILE, "Project metadata must declare a current map id or receive --map.");
    return;
  }

  if (!mapIds.includes(mapId)) {
    addWarning(PROJECT_FILE, `Map '${mapId}' is not listed in project metadata maps.`);
  }

  const mapDirectory = path.join(projectPath, "maps", mapId);
  const mapManifest = await readJsonFile(path.join(mapDirectory, MAP_FILE), "map manifest");
  validateMapManifest(mapManifest, mapId);
  await validateTerrain(mapDirectory, mapManifest);
  await validatePaint(mapDirectory, mapManifest);
  await validateVegetation(mapDirectory);
}

function validateMapManifest(manifest, mapId) {
  if (manifest.version !== 8) {
    addError(MAP_FILE, `Map '${mapId}' must use map manifest version 8.`);
  }

  const world = manifest.world;
  if (!isRecord(world)) {
    addError(MAP_FILE, "Map manifest must contain world settings.");
    return;
  }

  if (!isPositiveFiniteNumber(world.sizeMeters) || !isPositiveFiniteNumber(world.pageSizeMeters)) {
    addError(MAP_FILE, "Map world size and page size must be positive finite numbers.");
    return;
  }

  const pageCount = world.sizeMeters / world.pageSizeMeters;
  if (!Number.isInteger(pageCount)) {
    addError(MAP_FILE, `World size ${world.sizeMeters}m must be divisible by page size ${world.pageSizeMeters}m.`);
  }

  if (world.originX !== 0 || world.originZ !== 0) {
    addError(MAP_FILE, "Map origin must remain 0,0 for the current page coordinate system.");
  }

  if (manifest.terrainPath !== TERRAIN_HEIGHT_PATH) {
    addError(MAP_FILE, `Map terrainPath must be '${TERRAIN_HEIGHT_PATH}'.`);
  }

  if (manifest.paintPath !== PAINT_PATH) {
    addError(MAP_FILE, `Map paintPath must be '${PAINT_PATH}'.`);
  }

  if (manifest.vegetationPath !== VEGETATION_PATH) {
    addError(MAP_FILE, `Map vegetationPath must be '${VEGETATION_PATH}'.`);
  }
}

async function validateTerrain(mapDirectory, mapManifest) {
  const manifestPath = path.join(mapDirectory, TERRAIN_HEIGHT_PATH);
  const manifest = await readJsonFile(manifestPath, "terrain height manifest");
  const label = relativePath(manifestPath);

  if (manifest.version !== 1) {
    addError(label, "Terrain height manifest must use version 1.");
  }
  if (manifest.format !== "height-region-pack-v1") {
    addError(label, "Terrain height manifest has invalid format.");
  }
  if (manifest.sampleFormat !== "float32le") {
    addError(label, "Terrain height manifest has invalid sample format.");
  }
  if (manifest.pageSizeMeters !== mapManifest.world?.pageSizeMeters) {
    addError(label, "Terrain height page size must match map page size.");
  }

  const pageResolution = requirePositiveInteger(manifest.pageResolution, label, "pageResolution");
  const regionSizePages = requireSparseRegionSize(manifest.regionSizePages, label, "regionSizePages");
  if (manifest.regionsDirectory !== TERRAIN_REGION_DIRECTORY) {
    addError(label, `Terrain height regionsDirectory must be '${TERRAIN_REGION_DIRECTORY}'.`);
  }

  const expectedPaths = new Set();
  for (const region of readRegionMasks(manifest.regions, regionSizePages, label)) {
    const regionPath = `${TERRAIN_REGION_DIRECTORY}/r_${formatGridCoordinate(region.x)}_${formatGridCoordinate(region.z)}${TERRAIN_REGION_EXTENSION}`;
    expectedPaths.add(regionPath);
    const expectedByteLength = countSetBits(region.mask) * pageResolution * pageResolution * HEIGHT_SAMPLE_BYTE_LENGTH;
    await validateFileSize(path.join(mapDirectory, regionPath), expectedByteLength, regionPath);
  }

  await validateNoOrphanRegionPacks(mapDirectory, TERRAIN_REGION_DIRECTORY, TERRAIN_REGION_EXTENSION, expectedPaths);
}

async function validatePaint(mapDirectory, mapManifest) {
  const manifestPath = path.join(mapDirectory, PAINT_PATH);
  const manifest = await readJsonFile(manifestPath, "paint manifest");
  const label = relativePath(manifestPath);
  const splatMaps = manifest.splatMaps;

  if (manifest.version !== 2) {
    addError(label, "Paint manifest must use version 2.");
  }
  if (!isRecord(manifest.layers)) {
    addError(label, "Paint manifest must contain texture layers.");
  }
  if (!isRecord(splatMaps)) {
    addError(label, "Paint manifest must contain splat map metadata.");
    return;
  }
  if (splatMaps.format !== "rgba8-splat-region-pack-v1") {
    addError(label, "Paint manifest has invalid splat map format.");
  }
  if (splatMaps.pageSizeMeters !== mapManifest.world?.pageSizeMeters) {
    addError(label, "Paint page size must match map page size.");
  }

  const resolution = requirePositiveInteger(splatMaps.resolution, label, "resolution");
  const pageResolution = requirePositiveInteger(splatMaps.pageResolution, label, "pageResolution");
  const regionSizePages = requireSparseRegionSize(splatMaps.regionSizePages, label, "regionSizePages");
  const indices = Array.isArray(splatMaps.indices) ? splatMaps.indices : [];
  const worldPageCount = mapManifest.world?.sizeMeters / mapManifest.world?.pageSizeMeters;
  if (Number.isInteger(worldPageCount) && resolution !== pageResolution * worldPageCount) {
    addError(label, `Paint resolution ${resolution} must equal pageResolution ${pageResolution} * world page count ${worldPageCount}.`);
  }
  if (!indices.every((index) => Number.isInteger(index) && index >= 0)) {
    addError(label, "Paint splat map indices must be non-negative integers.");
  }
  if (splatMaps.regionsDirectory !== PAINT_REGION_DIRECTORY) {
    addError(label, `Paint regionsDirectory must be '${PAINT_REGION_DIRECTORY}'.`);
  }

  const expectedPaths = new Set();
  for (const region of readRegionMasks(splatMaps.regions, regionSizePages, label)) {
    const regionPath = `${PAINT_REGION_DIRECTORY}/r_${formatGridCoordinate(region.x)}_${formatGridCoordinate(region.z)}${PAINT_REGION_EXTENSION}`;
    expectedPaths.add(regionPath);
    const expectedByteLength = countSetBits(region.mask) * pageResolution * pageResolution * RGBA8_BYTE_LENGTH * indices.length;
    await validateFileSize(path.join(mapDirectory, regionPath), expectedByteLength, regionPath);
  }

  await validateNoOrphanRegionPacks(mapDirectory, PAINT_REGION_DIRECTORY, PAINT_REGION_EXTENSION, expectedPaths);
}

async function validateVegetation(mapDirectory) {
  const manifestPath = path.join(mapDirectory, VEGETATION_PATH);
  const manifest = await readJsonFile(manifestPath, "vegetation manifest");
  const label = relativePath(manifestPath);
  const instances = manifest.instances;

  if (manifest.version !== 5) {
    addError(label, "Vegetation manifest must use version 5.");
  }
  if (!isRecord(manifest.models)) {
    addError(label, "Vegetation manifest must contain model definitions.");
  }
  if (!isRecord(instances)) {
    addError(label, "Vegetation manifest must contain instance metadata.");
    return;
  }
  if (instances.format !== "vegetation-region-pack-v1") {
    addError(label, "Vegetation manifest has invalid region format.");
  }
  if (instances.instanceFormat !== "instanced-f32le-v1") {
    addError(label, "Vegetation manifest has invalid instance format.");
  }
  requirePositiveNumber(instances.cellSizeMeters, label, "cellSizeMeters");
  const regionSizeCells = requireSparseRegionSize(instances.regionSizeCells, label, "regionSizeCells");
  if (instances.regionsDirectory !== VEGETATION_REGION_DIRECTORY) {
    addError(label, `Vegetation regionsDirectory must be '${VEGETATION_REGION_DIRECTORY}'.`);
  }

  const expectedPaths = new Set();
  for (const region of readRegionMasks(instances.regions, regionSizeCells, label)) {
    const regionPath = `${VEGETATION_REGION_DIRECTORY}/r_${formatGridCoordinate(region.x)}_${formatGridCoordinate(region.z)}${VEGETATION_REGION_EXTENSION}`;
    expectedPaths.add(regionPath);
    await validateVegetationRegionPack(path.join(mapDirectory, regionPath), region, regionSizeCells, regionPath);
  }

  await validateNoOrphanRegionPacks(mapDirectory, VEGETATION_REGION_DIRECTORY, VEGETATION_REGION_EXTENSION, expectedPaths);
}

async function validateVegetationRegionPack(filePath, region, regionSizeCells, label) {
  if (!existsSync(filePath)) {
    addError(label, "Region pack is missing.");
    return;
  }

  checkedFiles += 1;
  const bytes = await readFile(filePath);
  if (bytes.byteLength < VEGETATION_REGION_HEADER_BYTE_LENGTH) {
    addError(label, "Vegetation region pack is shorter than its header.");
    return;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x31475256) {
    addError(label, "Vegetation region pack has invalid magic.");
  }
  if (view.getUint16(4, true) !== 1) {
    addError(label, "Vegetation region pack has unsupported version.");
  }

  const cellCount = view.getUint16(6, true);
  const expectedCellCount = countSetBits(region.mask);
  if (cellCount !== expectedCellCount) {
    addError(label, `Vegetation region pack declares ${cellCount} cells, expected ${expectedCellCount}.`);
  }

  const indexByteLength = VEGETATION_REGION_HEADER_BYTE_LENGTH + cellCount * VEGETATION_REGION_ENTRY_BYTE_LENGTH;
  if (bytes.byteLength < indexByteLength) {
    addError(label, "Vegetation region pack has a truncated cell index.");
    return;
  }

  let entryMask = 0n;
  let previousLocalIndex = -1;
  let expectedByteLength = indexByteLength;
  for (let index = 0; index < cellCount; index += 1) {
    const entryOffset = VEGETATION_REGION_HEADER_BYTE_LENGTH + index * VEGETATION_REGION_ENTRY_BYTE_LENGTH;
    const localIndex = view.getUint16(entryOffset, true);
    const instanceCount = view.getUint32(entryOffset + 4, true);
    const localBit = 1n << BigInt(localIndex);

    if (localIndex >= regionSizeCells * regionSizeCells) {
      addError(label, `Vegetation region pack contains out-of-range cell ${localIndex}.`);
    }
    if ((region.mask & localBit) === 0n) {
      addError(label, `Vegetation region pack contains undeclared cell ${localIndex}.`);
    }
    if (localIndex <= previousLocalIndex) {
      addError(label, "Vegetation region pack cell index is not strictly sorted.");
    }
    if ((entryMask & localBit) !== 0n) {
      addError(label, `Vegetation region pack contains duplicate cell ${localIndex}.`);
    }

    previousLocalIndex = localIndex;
    entryMask |= localBit;
    expectedByteLength += instanceCount * VEGETATION_INSTANCE_BYTE_LENGTH;
  }

  if (entryMask !== region.mask) {
    addError(label, "Vegetation region pack cell mask does not match manifest mask.");
  }
  if (bytes.byteLength !== expectedByteLength) {
    addError(label, `Vegetation region pack requires ${expectedByteLength} bytes, got ${bytes.byteLength}.`);
  }
}

async function validateFileSize(filePath, expectedByteLength, label) {
  try {
    const fileStat = await stat(filePath);
    checkedFiles += 1;
    if (fileStat.size !== expectedByteLength) {
      addError(label, `Expected ${expectedByteLength} bytes, got ${fileStat.size}.`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      addError(label, "Region pack is missing.");
      return;
    }

    throw error;
  }
}

async function validateNoOrphanRegionPacks(mapDirectory, regionDirectory, extension, expectedPaths) {
  const absoluteDirectory = path.join(mapDirectory, regionDirectory);
  let entries = [];
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      if (expectedPaths.size > 0) {
        addError(regionDirectory, "Region directory is missing.");
      }
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(extension)) {
      continue;
    }

    const regionPath = `${regionDirectory}/${entry.name}`;
    if (!expectedPaths.has(regionPath)) {
      addWarning(regionPath, "Region pack is not referenced by its manifest.");
    }
  }
}

function readRegionMasks(value, regionSize, label) {
  if (!isRecord(value)) {
    addError(label, "Region masks must be a JSON object.");
    return [];
  }

  return Object.entries(value).map(([key, maskValue]) => {
    const [x, z] = parseGridKey(key, label);
    const mask = parseRegionMask(maskValue, key, regionSize, label);
    return { key, x, z, mask };
  });
}

function parseGridKey(key, label) {
  const parts = key.split(",");
  const x = Number(parts[0]);
  const z = Number(parts[1]);
  if (parts.length !== 2 || !Number.isInteger(x) || !Number.isInteger(z)) {
    addError(label, `Invalid region key '${key}'.`);
    return [0, 0];
  }

  return [x, z];
}

function parseRegionMask(value, key, regionSize, label) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    addError(label, `Region '${key}' mask must be a hex string.`);
    return 0n;
  }

  const mask = BigInt(value);
  const maxMask = (1n << BigInt(regionSize * regionSize)) - 1n;
  if (mask <= 0n || mask > maxMask) {
    addError(label, `Region '${key}' mask does not fit its sparse region size.`);
  }

  return mask;
}

async function readJsonFile(filePath, label) {
  try {
    checkedFiles += 1;
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    addError(relativePath(filePath), `Failed to read ${label}: ${error.message}`);
    return {};
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--project") {
      parsed.projectDirectory = args[index + 1];
      index += 1;
    } else if (arg === "--map") {
      parsed.mapId = args[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      addError("arguments", `Unknown argument '${arg}'.`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log("Usage: pnpm validate:map [--project test_pro] [--map main]");
}

function printDiagnostics(items) {
  for (const item of items) {
    console[item.level === "error" ? "error" : "warn"](`[${item.level}] ${item.path}: ${item.message}`);
  }
}

function addError(filePath, message) {
  diagnostics.push({ level: "error", path: filePath, message });
}

function addWarning(filePath, message) {
  diagnostics.push({ level: "warning", path: filePath, message });
}

function hasErrors(items) {
  return items.some((item) => item.level === "error");
}

function requirePositiveInteger(value, label, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    addError(label, `${fieldName} must be a positive integer.`);
    return 1;
  }

  return value;
}

function requirePositiveNumber(value, label, fieldName) {
  if (!isPositiveFiniteNumber(value)) {
    addError(label, `${fieldName} must be a positive finite number.`);
    return 1;
  }

  return value;
}

function requireSparseRegionSize(value, label, fieldName) {
  const size = requirePositiveInteger(value, label, fieldName);
  if (size * size > 64) {
    addError(label, `${fieldName} must fit in a 64-bit sparse mask.`);
  }

  return size;
}

function countSetBits(mask) {
  let bits = mask;
  let count = 0;
  while (bits > 0n) {
    if ((bits & 1n) !== 0n) {
      count += 1;
    }
    bits >>= 1n;
  }

  return count;
}

function formatGridCoordinate(value) {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function relativePath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}
