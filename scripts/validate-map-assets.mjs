#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
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
const COOKED_MAP_DIRECTORY = "cooked/maps";
const COOKED_MAP_MANIFEST_FILE = "manifest.json";
const COOKED_MAP_FORMAT = "open-fps-cooked-map-v2";
const COOKED_MAP_VERSION = 2;
const COOKED_WORLD_PARTITION_CELL_SIZE_PAGES = 8;
const COOKED_WORLD_PARTITION_DEPENDENCY_KINDS = ["terrain", "paint", "vegetation", "objects", "collision", "nav"];

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
  await validateCookedMap(projectPath, mapId, mapManifest);
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

  const regions = readRegionMasks(manifest.regions, regionSizePages, label);
  const integrityMap = readRegionIntegrityMap(manifest.regionIntegrity, regions.map((region) => region.key), label);
  const expectedPaths = new Set();
  for (const region of regions) {
    const regionPath = `${TERRAIN_REGION_DIRECTORY}/r_${formatGridCoordinate(region.x)}_${formatGridCoordinate(region.z)}${TERRAIN_REGION_EXTENSION}`;
    expectedPaths.add(regionPath);
    const expectedByteLength = countSetBits(region.mask) * pageResolution * pageResolution * HEIGHT_SAMPLE_BYTE_LENGTH;
    const bytes = await validateRegionPackFile(path.join(mapDirectory, regionPath), expectedByteLength, regionPath);
    if (bytes) {
      validateRegionPackIntegrity(bytes, integrityMap[region.key], region.key, regionPath);
    }
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

  const regions = readRegionMasks(splatMaps.regions, regionSizePages, label);
  const integrityMap = readRegionIntegrityMap(splatMaps.regionIntegrity, regions.map((region) => region.key), label);
  const expectedPaths = new Set();
  for (const region of regions) {
    const regionPath = `${PAINT_REGION_DIRECTORY}/r_${formatGridCoordinate(region.x)}_${formatGridCoordinate(region.z)}${PAINT_REGION_EXTENSION}`;
    expectedPaths.add(regionPath);
    const expectedByteLength = countSetBits(region.mask) * pageResolution * pageResolution * RGBA8_BYTE_LENGTH * indices.length;
    const bytes = await validateRegionPackFile(path.join(mapDirectory, regionPath), expectedByteLength, regionPath);
    if (bytes) {
      validateRegionPackIntegrity(bytes, integrityMap[region.key], region.key, regionPath);
    }
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

  const regions = readRegionMasks(instances.regions, regionSizeCells, label);
  const integrityMap = readRegionIntegrityMap(instances.regionIntegrity, regions.map((region) => region.key), label);
  const expectedPaths = new Set();
  for (const region of regions) {
    const regionPath = `${VEGETATION_REGION_DIRECTORY}/r_${formatGridCoordinate(region.x)}_${formatGridCoordinate(region.z)}${VEGETATION_REGION_EXTENSION}`;
    expectedPaths.add(regionPath);
    const bytes = await validateVegetationRegionPack(path.join(mapDirectory, regionPath), region, regionSizeCells, regionPath);
    if (bytes) {
      validateRegionPackIntegrity(bytes, integrityMap[region.key], region.key, regionPath);
    }
  }

  await validateNoOrphanRegionPacks(mapDirectory, VEGETATION_REGION_DIRECTORY, VEGETATION_REGION_EXTENSION, expectedPaths);
}

async function validateCookedMap(projectPath, mapId, mapManifest) {
  const cookedPath = path.join(projectPath, COOKED_MAP_DIRECTORY, mapId, COOKED_MAP_MANIFEST_FILE);
  const cooked = await readJsonFile(cookedPath, "cooked map manifest");
  const label = relativePath(cookedPath);

  if (cooked.version !== COOKED_MAP_VERSION) {
    addError(label, `Cooked map manifest must use version ${COOKED_MAP_VERSION}.`);
  }
  if (cooked.format !== COOKED_MAP_FORMAT) {
    addError(label, `Cooked map manifest format must be '${COOKED_MAP_FORMAT}'.`);
  }
  if (cooked.mapId !== mapId) {
    addError(label, `Cooked map manifest must target map '${mapId}'.`);
  }
  validateCookedMapInfo(cooked.map, mapManifest, label);

  const sourcePaths = {
    project: PROJECT_FILE,
    map: `maps/${mapId}/${MAP_FILE}`,
    terrain: `maps/${mapId}/${TERRAIN_HEIGHT_PATH}`,
    paint: `maps/${mapId}/${PAINT_PATH}`,
    vegetation: `maps/${mapId}/${VEGETATION_PATH}`,
  };
  if (!isRecord(cooked.source)) {
    addError(label, "Cooked map manifest must contain source hash metadata.");
  } else {
    await validateCookedSourceReference(projectPath, cooked.source.project, sourcePaths.project, label, "project");
    await validateCookedSourceReference(projectPath, cooked.source.map, sourcePaths.map, label, "map");
    await validateCookedSourceReference(projectPath, cooked.source.terrain, sourcePaths.terrain, label, "terrain");
    await validateCookedSourceReference(projectPath, cooked.source.paint, sourcePaths.paint, label, "paint");
    await validateCookedSourceReference(projectPath, cooked.source.vegetation, sourcePaths.vegetation, label, "vegetation");
  }

  const terrainManifest = await readJsonFile(path.join(projectPath, sourcePaths.terrain), "terrain height manifest for cooked map");
  const paintManifest = await readJsonFile(path.join(projectPath, sourcePaths.paint), "paint manifest for cooked map");
  const vegetationManifest = await readJsonFile(path.join(projectPath, sourcePaths.vegetation), "vegetation manifest for cooked map");
  const cookedWorld = validateCookedWorld(cooked.world, mapManifest, label);
  const cookedAssets = await validateCookedAssets(
    projectPath,
    cooked.assets,
    mapId,
    terrainManifest,
    paintManifest,
    vegetationManifest,
    label,
  );

  if (cookedWorld && cookedAssets) {
    validateCookedPartition(cooked.partition, cookedWorld, cookedAssets, label);
  }
}

function validateCookedMapInfo(mapInfo, mapManifest, label) {
  if (!isRecord(mapInfo)) {
    addError(label, "Cooked map manifest must contain map metadata.");
    return;
  }

  validateEqual(mapInfo.seed, mapManifest.seed, label, "cooked map seed");
  validateJsonEqual(mapInfo.metadata, mapManifest.metadata, label, "cooked map metadata");
}

async function validateCookedSourceReference(projectPath, reference, expectedPath, label, sourceName) {
  if (!isRecord(reference)) {
    addError(label, `Cooked source '${sourceName}' must be an object.`);
    return;
  }

  if (reference.path !== expectedPath) {
    addError(label, `Cooked source '${sourceName}' must point to '${expectedPath}'.`);
  }
  if (typeof reference.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(reference.sha256)) {
    addError(label, `Cooked source '${sourceName}' must contain a lowercase SHA-256 digest.`);
    return;
  }

  const bytes = await readRequiredFileBytes(path.join(projectPath, expectedPath), `${sourceName} source for cooked map`);
  if (!bytes) {
    return;
  }

  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (reference.sha256 !== actualSha256) {
    addError(label, `Cooked source '${sourceName}' is stale.`);
  }
}

function validateCookedWorld(world, mapManifest, label) {
  if (!isRecord(world)) {
    addError(label, "Cooked map manifest must contain world metadata.");
    return null;
  }

  const sourceWorld = mapManifest.world;
  const pageBounds = isRecord(world.pageBounds) ? world.pageBounds : null;
  const expectedPageBounds = getWorldPageBounds(sourceWorld);
  if (!expectedPageBounds) {
    return null;
  }

  validateEqual(world.sizeMeters, sourceWorld.sizeMeters, label, "cooked world sizeMeters");
  validateEqual(world.pageSizeMeters, sourceWorld.pageSizeMeters, label, "cooked world pageSizeMeters");
  validateEqual(world.originX, sourceWorld.originX, label, "cooked world originX");
  validateEqual(world.originZ, sourceWorld.originZ, label, "cooked world originZ");

  if (!pageBounds) {
    addError(label, "Cooked world must contain pageBounds.");
    return null;
  }

  validateEqual(pageBounds.minX, expectedPageBounds.minX, label, "cooked world pageBounds.minX");
  validateEqual(pageBounds.maxX, expectedPageBounds.maxX, label, "cooked world pageBounds.maxX");
  validateEqual(pageBounds.minZ, expectedPageBounds.minZ, label, "cooked world pageBounds.minZ");
  validateEqual(pageBounds.maxZ, expectedPageBounds.maxZ, label, "cooked world pageBounds.maxZ");

  return {
    sizeMeters: sourceWorld.sizeMeters,
    pageSizeMeters: sourceWorld.pageSizeMeters,
    pageBounds: expectedPageBounds,
  };
}

async function validateCookedAssets(projectPath, assets, mapId, terrainManifest, paintManifest, vegetationManifest, label) {
  if (!isRecord(assets)) {
    addError(label, "Cooked map manifest must contain asset metadata.");
    return null;
  }

  const terrain = validateCookedTerrainAsset(assets.terrain, mapId, terrainManifest, label);
  const paint = validateCookedPaintAsset(assets.paint, mapId, paintManifest, label);
  const vegetation = validateCookedVegetationAsset(assets.vegetation, mapId, vegetationManifest, label);
  if (!terrain || !paint || !vegetation) {
    return null;
  }

  await validateCookedRegionFiles(projectPath, terrain.regions, label, "terrain");
  await validateCookedRegionFiles(projectPath, paint.regions, label, "paint");
  await validateCookedRegionFiles(projectPath, vegetation.regions, label, "vegetation");
  await validateCookedPaintTextureFiles(projectPath, paint.layers, label);
  await validateCookedVegetationModelFiles(projectPath, mapId, vegetation.models, label);

  return { terrain, paint, vegetation };
}

function validateCookedTerrainAsset(asset, mapId, manifest, label) {
  if (!isRecord(asset)) {
    addError(label, "Cooked terrain asset metadata must be an object.");
    return null;
  }

  validateEqual(asset.manifestPath, `maps/${mapId}/${TERRAIN_HEIGHT_PATH}`, label, "cooked terrain manifestPath");
  validateEqual(asset.format, manifest.format, label, "cooked terrain format");
  validateEqual(asset.sampleFormat, manifest.sampleFormat, label, "cooked terrain sampleFormat");
  validateEqual(asset.pageResolution, manifest.pageResolution, label, "cooked terrain pageResolution");
  validateEqual(asset.pageSizeMeters, manifest.pageSizeMeters, label, "cooked terrain pageSizeMeters");
  validateEqual(asset.regionSizePages, manifest.regionSizePages, label, "cooked terrain regionSizePages");
  const regions = validateCookedRegionTable(
    asset.regions,
    manifest.regions,
    manifest.regionIntegrity,
    (key) => mapCookedPath(mapId, regionPathFromKey(TERRAIN_REGION_DIRECTORY, TERRAIN_REGION_EXTENSION, key)),
    label,
    "terrain",
  );

  return regions ? { ...asset, regions } : null;
}

function validateCookedPaintAsset(asset, mapId, manifest, label) {
  if (!isRecord(asset) || !isRecord(manifest.splatMaps)) {
    addError(label, "Cooked paint asset metadata must be an object.");
    return null;
  }

  validateEqual(asset.manifestPath, `maps/${mapId}/${PAINT_PATH}`, label, "cooked paint manifestPath");
  validateEqual(asset.format, manifest.splatMaps.format, label, "cooked paint format");
  validateEqual(asset.resolution, manifest.splatMaps.resolution, label, "cooked paint resolution");
  validateEqual(asset.pageResolution, manifest.splatMaps.pageResolution, label, "cooked paint pageResolution");
  validateEqual(asset.pageSizeMeters, manifest.splatMaps.pageSizeMeters, label, "cooked paint pageSizeMeters");
  validateEqual(asset.regionSizePages, manifest.splatMaps.regionSizePages, label, "cooked paint regionSizePages");
  validateJsonEqual(asset.indices, manifest.splatMaps.indices, label, "cooked paint indices");
  validateCookedPaintLayers(asset.layers, manifest.layers, label);
  const regions = validateCookedRegionTable(
    asset.regions,
    manifest.splatMaps.regions,
    manifest.splatMaps.regionIntegrity,
    (key) => mapCookedPath(mapId, regionPathFromKey(PAINT_REGION_DIRECTORY, PAINT_REGION_EXTENSION, key)),
    label,
    "paint",
  );

  return regions ? { ...asset, regions } : null;
}

function validateCookedPaintLayers(cookedLayers, sourceLayers, label) {
  if (!isRecord(cookedLayers) || !isRecord(sourceLayers)) {
    addError(label, "Cooked paint layers must be JSON objects.");
    return;
  }

  const sourceLayerNames = Object.keys(sourceLayers).sort();
  const cookedLayerNames = Object.keys(cookedLayers).sort();
  if (!sameStringArray(sourceLayerNames, cookedLayerNames)) {
    addError(label, "Cooked paint layer keys must match source layer keys.");
    return;
  }

  for (const layerName of sourceLayerNames) {
    validateCookedPaintLayer(cookedLayers[layerName], sourceLayers[layerName], label, layerName);
  }
}

function validateCookedPaintLayer(cookedLayer, sourceLayer, label, layerName) {
  if (!isRecord(cookedLayer) || !isRecord(sourceLayer)) {
    addError(label, `Cooked paint layer '${layerName}' must match source shape.`);
    return;
  }

  const textureFields = new Set(["diffuse", "normal", "displacement", "arm", "ao", "roughness", "metallic"]);
  const sourceKeys = Object.keys(sourceLayer).sort();
  const cookedKeys = Object.keys(cookedLayer).sort();
  if (!sameStringArray(sourceKeys, cookedKeys)) {
    addError(label, `Cooked paint layer '${layerName}' keys must match source layer keys.`);
    return;
  }

  for (const key of sourceKeys) {
    if (textureFields.has(key) && typeof sourceLayer[key] === "string" && !isExternalAssetPath(sourceLayer[key])) {
      validateEqual(cookedLayer[key], `cooked/${sourceLayer[key]}`, label, `cooked paint layer '${layerName}' ${key}`);
      continue;
    }

    validateJsonEqual(cookedLayer[key], sourceLayer[key], label, `cooked paint layer '${layerName}' ${key}`);
  }
}

function validateCookedVegetationAsset(asset, mapId, manifest, label) {
  if (!isRecord(asset) || !isRecord(manifest.instances)) {
    addError(label, "Cooked vegetation asset metadata must be an object.");
    return null;
  }

  validateEqual(asset.manifestPath, `maps/${mapId}/${VEGETATION_PATH}`, label, "cooked vegetation manifestPath");
  validateEqual(asset.format, manifest.instances.format, label, "cooked vegetation format");
  validateEqual(asset.instanceFormat, manifest.instances.instanceFormat, label, "cooked vegetation instanceFormat");
  validateEqual(asset.cellSizeMeters, manifest.instances.cellSizeMeters, label, "cooked vegetation cellSizeMeters");
  validateEqual(asset.regionSizeCells, manifest.instances.regionSizeCells, label, "cooked vegetation regionSizeCells");
  validateJsonEqual(asset.models, manifest.models, label, "cooked vegetation models");
  validateJsonEqual(asset.modelIds, manifest.instances.modelIds, label, "cooked vegetation modelIds");
  const regions = validateCookedRegionTable(
    asset.regions,
    manifest.instances.regions,
    manifest.instances.regionIntegrity,
    (key) => mapCookedPath(mapId, regionPathFromKey(VEGETATION_REGION_DIRECTORY, VEGETATION_REGION_EXTENSION, key)),
    label,
    "vegetation",
  );

  return regions ? { ...asset, regions } : null;
}

function validateCookedRegionTable(regions, sourceRegions, sourceIntegrity, resolvePath, label, assetName) {
  if (!isRecord(regions)) {
    addError(label, `Cooked ${assetName} regions must be a JSON object.`);
    return null;
  }
  if (!isRecord(sourceRegions) || !isRecord(sourceIntegrity)) {
    addError(label, `Cooked ${assetName} source metadata is invalid.`);
    return null;
  }

  const sourceKeys = Object.keys(sourceRegions).sort(compareRegionKeyStrings);
  const cookedKeys = Object.keys(regions).sort(compareRegionKeyStrings);
  if (!sameStringArray(sourceKeys, cookedKeys)) {
    addError(label, `Cooked ${assetName} region keys must match source region keys.`);
  }

  for (const key of sourceKeys) {
    const region = regions[key];
    const integrity = sourceIntegrity[key];
    if (!isRecord(region) || !isRecord(integrity)) {
      addError(label, `Cooked ${assetName} region '${key}' metadata is invalid.`);
      continue;
    }

    validateEqual(region.path, resolvePath(key), label, `cooked ${assetName} region '${key}' path`);
    validateEqual(region.mask, sourceRegions[key], label, `cooked ${assetName} region '${key}' mask`);
    validateEqual(region.byteLength, integrity.byteLength, label, `cooked ${assetName} region '${key}' byteLength`);
    validateEqual(region.sha256, integrity.sha256, label, `cooked ${assetName} region '${key}' sha256`);
  }

  return regions;
}

async function validateCookedRegionFiles(projectPath, regions, label, assetName) {
  await Promise.all(Object.entries(regions).map(async ([key, region]) => {
    if (!isRecord(region)) {
      return;
    }

    const bytes = await validateRegionPackFile(path.join(projectPath, region.path), region.byteLength, region.path);
    if (bytes) {
      validateRegionPackIntegrity(bytes, region, key, `${label} ${assetName} region ${key}`);
    }
  }));
}

async function validateCookedPaintTextureFiles(projectPath, layers, label) {
  if (!isRecord(layers)) {
    return;
  }

  const textureFields = ["diffuse", "normal", "displacement", "arm", "ao", "roughness", "metallic"];
  await Promise.all(Object.entries(layers).flatMap(([layerName, layer]) => {
    if (!isRecord(layer)) {
      return [];
    }

    return textureFields.map(async (field) => {
      const value = layer[field];
      if (typeof value !== "string" || isExternalAssetPath(value)) {
        return;
      }

      if (!value.startsWith("cooked/assets/")) {
        addError(label, `Cooked paint layer '${layerName}' ${field} must point to cooked/assets.`);
      }
      await readRequiredFileBytes(path.join(projectPath, value), `cooked paint layer '${layerName}' ${field}`);
    });
  }));
}

async function validateCookedVegetationModelFiles(projectPath, mapId, models, label) {
  if (!isRecord(models)) {
    return;
  }

  const cookedMapDirectory = path.join(projectPath, COOKED_MAP_DIRECTORY, mapId);
  const modelFields = ["path", "lod1Path", "lod2Path"];
  await Promise.all(Object.entries(models).flatMap(([modelId, model]) => {
    if (!isRecord(model)) {
      return [];
    }

    return modelFields.map(async (field) => {
      const value = model[field];
      if (typeof value !== "string" || isExternalAssetPath(value)) {
        return;
      }

      const filePath = path.resolve(cookedMapDirectory, value);
      if (!isInsideDirectory(filePath, path.join(projectPath, "cooked"))) {
        addError(label, `Cooked vegetation model '${modelId}' ${field} must resolve inside cooked assets.`);
        return;
      }
      await readRequiredFileBytes(filePath, `cooked vegetation model '${modelId}' ${field}`);
    });
  }));
}

function validateCookedPartition(partition, world, assets, label) {
  if (!isRecord(partition)) {
    addError(label, "Cooked map manifest must contain world partition metadata.");
    return;
  }

  validateEqual(partition.cellSizePages, COOKED_WORLD_PARTITION_CELL_SIZE_PAGES, label, "cooked partition cellSizePages");
  validateEqual(
    partition.cellSizeMeters,
    COOKED_WORLD_PARTITION_CELL_SIZE_PAGES * world.pageSizeMeters,
    label,
    "cooked partition cellSizeMeters",
  );
  validateExactStringArray(
    partition.dependencyKinds,
    COOKED_WORLD_PARTITION_DEPENDENCY_KINDS,
    label,
    "cooked partition dependencyKinds",
  );

  if (!Array.isArray(partition.cells)) {
    addError(label, "Cooked partition cells must be an array.");
    return;
  }

  const coveredPages = new Set();
  for (const cell of partition.cells) {
    validateCookedPartitionCell(cell, world, assets, coveredPages, label);
  }

  const pageCount = world.sizeMeters / world.pageSizeMeters;
  const expectedPageCount = pageCount * pageCount;
  if (coveredPages.size !== expectedPageCount) {
    addError(label, `Cooked partition covers ${coveredPages.size} pages, expected ${expectedPageCount}.`);
  }
}

function validateCookedPartitionCell(cell, world, assets, coveredPages, label) {
  if (!isRecord(cell)) {
    addError(label, "Cooked partition cell must be an object.");
    return;
  }

  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.z)) {
    addError(label, "Cooked partition cell coordinates must be integers.");
    return;
  }
  validateEqual(cell.key, `${cell.x},${cell.z}`, label, `cooked partition cell '${String(cell.key)}' key`);

  const pageRect = readCookedPageRect(cell.pageRect, world, label, `cooked partition cell '${cell.key}'`);
  if (!pageRect) {
    return;
  }

  validateCookedCellBounds(cell.boundsMeters, pageRect, world.pageSizeMeters, label, `cooked partition cell '${cell.key}'`);
  for (let z = pageRect.minZ; z <= pageRect.maxZ; z += 1) {
    for (let x = pageRect.minX; x <= pageRect.maxX; x += 1) {
      const pageKey = `${x},${z}`;
      if (coveredPages.has(pageKey)) {
        addError(label, `Cooked partition page '${pageKey}' is covered by multiple cells.`);
      }
      coveredPages.add(pageKey);
    }
  }

  const dependencies = readCookedPartitionDependencies(cell.dependencies, label, `cooked partition cell '${cell.key}' dependencies`);
  if (!dependencies) {
    return;
  }

  validateRegionKeyArrayMatches(
    dependencies.terrain,
    collectPageRegionKeys(pageRect, assets.terrain.regionSizePages, assets.terrain.regions),
    label,
    `cooked partition cell '${cell.key}' dependencies.terrain`,
  );
  validateRegionKeyArrayMatches(
    dependencies.paint,
    collectPageRegionKeys(pageRect, assets.paint.regionSizePages, assets.paint.regions),
    label,
    `cooked partition cell '${cell.key}' dependencies.paint`,
  );
  validateRegionKeyArrayMatches(
    dependencies.vegetation,
    collectVegetationRegionKeys(
      pageRect,
      world.pageSizeMeters,
      assets.vegetation.cellSizeMeters,
      assets.vegetation.regionSizeCells,
      assets.vegetation.regions,
    ),
    label,
    `cooked partition cell '${cell.key}' dependencies.vegetation`,
  );
  validateExactStringArray(
    dependencies.objects,
    [],
    label,
    `cooked partition cell '${cell.key}' dependencies.objects`,
  );
  validateExactStringArray(
    dependencies.collision,
    [],
    label,
    `cooked partition cell '${cell.key}' dependencies.collision`,
  );
  validateExactStringArray(
    dependencies.nav,
    [],
    label,
    `cooked partition cell '${cell.key}' dependencies.nav`,
  );
}

function readCookedPartitionDependencies(value, label, fieldName) {
  if (!isRecord(value)) {
    addError(label, `${fieldName} must be an object.`);
    return null;
  }

  const expectedKeys = [...COOKED_WORLD_PARTITION_DEPENDENCY_KINDS].sort();
  const actualKeys = Object.keys(value).sort();
  if (!sameStringArray(actualKeys, expectedKeys)) {
    addError(label, `${fieldName} keys must match the cooked partition dependency schema.`);
  }

  const dependencies = {};
  for (const kind of COOKED_WORLD_PARTITION_DEPENDENCY_KINDS) {
    const entries = value[kind];
    if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === "string")) {
      addError(label, `${fieldName}.${kind} must be a string array.`);
      dependencies[kind] = [];
    } else {
      dependencies[kind] = entries;
    }
  }

  return dependencies;
}

async function validateVegetationRegionPack(filePath, region, regionSizeCells, label) {
  if (!existsSync(filePath)) {
    addError(label, "Region pack is missing.");
    return null;
  }

  checkedFiles += 1;
  const bytes = await readFile(filePath);
  if (bytes.byteLength < VEGETATION_REGION_HEADER_BYTE_LENGTH) {
    addError(label, "Vegetation region pack is shorter than its header.");
    return bytes;
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
    return bytes;
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

  return bytes;
}

async function validateRegionPackFile(filePath, expectedByteLength, label) {
  try {
    const bytes = await readFile(filePath);
    checkedFiles += 1;
    if (bytes.byteLength !== expectedByteLength) {
      addError(label, `Expected ${expectedByteLength} bytes, got ${bytes.byteLength}.`);
    }
    return bytes;
  } catch (error) {
    if (error?.code === "ENOENT") {
      addError(label, "Region pack is missing.");
      return null;
    }

    throw error;
  }
}

function readRegionIntegrityMap(value, regionKeys, label) {
  if (!isRecord(value)) {
    addError(label, "Region integrity must be a JSON object.");
    return {};
  }

  const expectedKeys = new Set(regionKeys);
  for (const key of regionKeys) {
    if (!Object.hasOwn(value, key)) {
      addError(label, `Region '${key}' is missing integrity metadata.`);
    }
  }

  for (const key of Object.keys(value)) {
    if (!expectedKeys.has(key)) {
      addError(label, `Region integrity contains unknown region '${key}'.`);
    }
  }

  return value;
}

function validateRegionPackIntegrity(bytes, integrity, regionKey, label) {
  if (!isRecord(integrity)) {
    addError(label, `Region '${regionKey}' integrity metadata is invalid.`);
    return;
  }

  if (!Number.isInteger(integrity.byteLength) || integrity.byteLength < 0) {
    addError(label, `Region '${regionKey}' integrity byteLength must be a non-negative integer.`);
  } else if (integrity.byteLength !== bytes.byteLength) {
    addError(label, `Region '${regionKey}' integrity byteLength ${integrity.byteLength} does not match ${bytes.byteLength}.`);
  }

  if (typeof integrity.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(integrity.sha256)) {
    addError(label, `Region '${regionKey}' integrity sha256 must be a lowercase hex SHA-256 digest.`);
    return;
  }

  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (integrity.sha256 !== actualSha256) {
    addError(label, `Region '${regionKey}' sha256 mismatch.`);
  }
}

async function readRequiredFileBytes(filePath, label) {
  try {
    checkedFiles += 1;
    return await readFile(filePath);
  } catch (error) {
    addError(relativePath(filePath), `Failed to read ${label}: ${error.message}`);
    return null;
  }
}

function readCookedPageRect(value, world, label, fieldName) {
  if (!isRecord(value)) {
    addError(label, `${fieldName} pageRect must be an object.`);
    return null;
  }

  const pageRect = {
    minX: value.minX,
    maxX: value.maxX,
    minZ: value.minZ,
    maxZ: value.maxZ,
  };
  if (!Object.values(pageRect).every(Number.isInteger)) {
    addError(label, `${fieldName} pageRect values must be integers.`);
    return null;
  }

  if (pageRect.minX > pageRect.maxX || pageRect.minZ > pageRect.maxZ) {
    addError(label, `${fieldName} pageRect min values must not exceed max values.`);
  }
  if (
    pageRect.minX < world.pageBounds.minX
    || pageRect.maxX > world.pageBounds.maxX
    || pageRect.minZ < world.pageBounds.minZ
    || pageRect.maxZ > world.pageBounds.maxZ
  ) {
    addError(label, `${fieldName} pageRect is outside world page bounds.`);
  }

  return pageRect;
}

function validateCookedCellBounds(value, pageRect, pageSizeMeters, label, fieldName) {
  if (!isRecord(value)) {
    addError(label, `${fieldName} boundsMeters must be an object.`);
    return;
  }

  const expected = {
    minX: pageRect.minX * pageSizeMeters,
    minZ: pageRect.minZ * pageSizeMeters,
    maxX: (pageRect.maxX + 1) * pageSizeMeters,
    maxZ: (pageRect.maxZ + 1) * pageSizeMeters,
  };
  validateEqual(value.minX, expected.minX, label, `${fieldName} boundsMeters.minX`);
  validateEqual(value.minZ, expected.minZ, label, `${fieldName} boundsMeters.minZ`);
  validateEqual(value.maxX, expected.maxX, label, `${fieldName} boundsMeters.maxX`);
  validateEqual(value.maxZ, expected.maxZ, label, `${fieldName} boundsMeters.maxZ`);
}

function collectPageRegionKeys(pageRect, regionSizePages, regions) {
  if (!Number.isInteger(regionSizePages) || regionSizePages <= 0 || !isRecord(regions)) {
    return [];
  }

  const keys = new Set();
  const minRegionX = Math.floor(pageRect.minX / regionSizePages);
  const maxRegionX = Math.floor(pageRect.maxX / regionSizePages);
  const minRegionZ = Math.floor(pageRect.minZ / regionSizePages);
  const maxRegionZ = Math.floor(pageRect.maxZ / regionSizePages);
  for (let z = minRegionZ; z <= maxRegionZ; z += 1) {
    for (let x = minRegionX; x <= maxRegionX; x += 1) {
      const key = `${x},${z}`;
      if (Object.hasOwn(regions, key)) {
        keys.add(key);
      }
    }
  }

  return Array.from(keys).sort(compareRegionKeyStrings);
}

function collectVegetationRegionKeys(pageRect, pageSizeMeters, cellSizeMeters, regionSizeCells, regions) {
  if (!isPositiveFiniteNumber(cellSizeMeters) || !Number.isInteger(regionSizeCells) || regionSizeCells <= 0 || !isRecord(regions)) {
    return [];
  }

  const cellsPerPage = pageSizeMeters / cellSizeMeters;
  if (!Number.isInteger(cellsPerPage)) {
    return [];
  }

  const minCellX = pageRect.minX * cellsPerPage;
  const maxCellX = (pageRect.maxX + 1) * cellsPerPage - 1;
  const minCellZ = pageRect.minZ * cellsPerPage;
  const maxCellZ = (pageRect.maxZ + 1) * cellsPerPage - 1;
  const keys = new Set();
  for (let z = Math.floor(minCellZ / regionSizeCells); z <= Math.floor(maxCellZ / regionSizeCells); z += 1) {
    for (let x = Math.floor(minCellX / regionSizeCells); x <= Math.floor(maxCellX / regionSizeCells); x += 1) {
      const key = `${x},${z}`;
      if (Object.hasOwn(regions, key)) {
        keys.add(key);
      }
    }
  }

  return Array.from(keys).sort(compareRegionKeyStrings);
}

function regionPathFromKey(directory, extension, key) {
  const [x, z] = parseGridKey(key, directory);
  return `${directory}/r_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}${extension}`;
}

function getWorldPageBounds(world) {
  if (!isRecord(world) || !isPositiveFiniteNumber(world.sizeMeters) || !isPositiveFiniteNumber(world.pageSizeMeters)) {
    return null;
  }

  const pageCount = world.sizeMeters / world.pageSizeMeters;
  if (!Number.isInteger(pageCount)) {
    return null;
  }

  const minPage = -Math.floor(pageCount / 2);
  const maxPage = minPage + pageCount - 1;
  return {
    minX: minPage,
    maxX: maxPage,
    minZ: minPage,
    maxZ: maxPage,
  };
}

function validateRegionKeyArrayMatches(value, expected, label, fieldName) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    addError(label, `${fieldName} must be a string array.`);
    return;
  }

  if (!sameStringArray(value, expected)) {
    addError(label, `${fieldName} must match intersecting asset regions.`);
  }
}

function validateExactStringArray(value, expected, label, fieldName) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    addError(label, `${fieldName} must be a string array.`);
    return;
  }

  if (!sameStringArray(value, expected)) {
    addError(label, `${fieldName} must be ${JSON.stringify(expected)}, got ${JSON.stringify(value)}.`);
  }
}

function validateEqual(actual, expected, label, fieldName) {
  if (actual !== expected) {
    addError(label, `${fieldName} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function validateJsonEqual(actual, expected, label, fieldName) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    addError(label, `${fieldName} must match source metadata.`);
  }
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function compareRegionKeyStrings(left, right) {
  const [leftX, leftZ] = parseGridKey(left, "region key");
  const [rightX, rightZ] = parseGridKey(right, "region key");
  return leftZ - rightZ || leftX - rightX;
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

function mapCookedPath(mapId, relativePath) {
  return `${COOKED_MAP_DIRECTORY}/${mapId}/${relativePath}`;
}

function isExternalAssetPath(assetPath) {
  return /^[a-z]+:\/\//i.test(assetPath) || assetPath.startsWith("data:");
}

function isInsideDirectory(filePath, directory) {
  const relative = path.relative(directory, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
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
