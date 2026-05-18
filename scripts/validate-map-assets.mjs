#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const PROJECT_FILE = "project.json";
const DEFAULT_PROJECT_DIRECTORY = "kunlun_wilds";
const ASSET_REGISTRY_PATH = "assets/registry.json";
const ASSET_REGISTRY_FORMAT = "open-fps-asset-registry-v1";
const ASSET_REGISTRY_VERSION = 1;
const IMPORTED_ASSET_ROOT = "assets/imported";
const IMPORTED_MODEL_ROOT = "assets/imported/models";
const IMPORTED_MATERIAL_ROOT = "assets/imported/materials";
const SOURCE_METADATA_ROOT = "assets/sources";
const ACCEPTED_ASSET_LICENSES = new Set(["CC0-1.0"]);
const MAP_FILE = "map.json";
const GENERATION_GRAPH_PATH = "generation/graph.json";
const GENERATION_GRAPH_FORMAT = "open-fps-world-generation-graph-v1";
const GENERATION_GRAPH_VERSION = 1;
const TERRAIN_HEIGHT_PATH = "terrain/height/manifest.json";
const TERRAIN_REGION_DIRECTORY = "terrain/height/regions";
const TERRAIN_REGION_EXTENSION = ".heightpack";
const PAINT_PATH = "paint/layers.json";
const PAINT_REGION_DIRECTORY = "paint/regions";
const PAINT_REGION_EXTENSION = ".paintpack";
const VEGETATION_PATH = "vegetation/models.json";
const VEGETATION_REGION_DIRECTORY = "vegetation/regions";
const VEGETATION_REGION_EXTENSION = ".vegpack";
const WORLD_OBJECTS_PATH = "objects/manifest.json";
const WORLD_OBJECT_CELLS_DIRECTORY = "objects/cells";
const WORLD_OBJECT_MANIFEST_FORMAT = "world-object-manifest-v1";
const WORLD_OBJECT_CELL_FORMAT = "world-object-cell-pack-v1";
const HEIGHT_SAMPLE_BYTE_LENGTH = 4;
const RGBA8_BYTE_LENGTH = 4;
const VEGETATION_REGION_HEADER_BYTE_LENGTH = 8;
const VEGETATION_REGION_ENTRY_BYTE_LENGTH = 8;
const VEGETATION_INSTANCE_BYTE_LENGTH = 24;
const COOKED_MAP_DIRECTORY = "cooked/maps";
const COOKED_MAP_MANIFEST_FILE = "manifest.json";
const COOKED_MAP_FORMAT = "open-fps-cooked-map-v4";
const COOKED_MAP_VERSION = 4;
const COOKED_CACHE_DIRECTORY = "cooked/cache/maps";
const COOKED_PACKAGE_LAYOUT = "content-addressed-sha256-v1";
const COOKED_BLOB_ROOT = "cooked/blobs/sha256";
const COOKED_WORLD_PARTITION_CELL_SIZE_PAGES = 8;
const COOKED_WORLD_PARTITION_DEPENDENCY_KINDS = ["terrain", "paint", "vegetation", "objects", "collision", "nav"];
const COOKED_OBJECT_CELL_FORMAT = WORLD_OBJECT_CELL_FORMAT;
const COOKED_COLLISION_CELL_FORMAT = "world-collision-cell-pack-v1";
const COOKED_NAV_CELL_FORMAT = "world-nav-cell-pack-v1";

const options = parseArgs(process.argv.slice(2));
const projectDirectory = path.resolve(options.projectDirectory ?? DEFAULT_PROJECT_DIRECTORY);
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

  const assetRegistry = await validateAssetRegistry(projectPath);
  const mapDirectory = path.join(projectPath, "maps", mapId);
  const mapManifest = await readJsonFile(path.join(mapDirectory, MAP_FILE), "map manifest");
  validateMapManifest(mapManifest, mapId);
  await validateGenerationGraph(mapDirectory, mapManifest, mapId);
  await validateTerrain(mapDirectory, mapManifest);
  await validatePaint(mapDirectory, mapManifest, assetRegistry);
  await validateVegetation(mapDirectory, assetRegistry);
  const objectManifest = await validateWorldObjects(mapDirectory, assetRegistry);
  await validateCookedMap(projectPath, mapId, mapManifest, objectManifest);
}

async function validateAssetRegistry(projectPath) {
  const registryPath = path.join(projectPath, ASSET_REGISTRY_PATH);
  const registry = await readJsonFile(registryPath, "asset registry");
  const label = ASSET_REGISTRY_PATH;

  if (registry.version !== ASSET_REGISTRY_VERSION) {
    addError(label, `Asset registry must use version ${ASSET_REGISTRY_VERSION}.`);
  }
  validateEqual(registry.format, ASSET_REGISTRY_FORMAT, label, "asset registry format");
  validateEqual(registry.projectId, path.basename(projectPath), label, "asset registry projectId");
  validateAssetRegistryPolicy(registry.policy, label);
  validateAssetRegistryRoots(registry.roots, label);

  if (!isRecord(registry.assets)) {
    addError(label, "Asset registry must contain an assets object.");
    return { assets: {}, importedRoots: [] };
  }

  const importedRoots = [];
  for (const [assetId, asset] of Object.entries(registry.assets).sort(([left], [right]) => left.localeCompare(right))) {
    if (!isRecord(asset)) {
      addError(label, `Asset '${assetId}' metadata must be an object.`);
      continue;
    }

    const importedRoot = await validateAssetRegistryEntry(projectPath, assetId, asset, label);
    if (importedRoot) {
      importedRoots.push(importedRoot);
    }
  }

  await validateImportedAssetCoverage(projectPath, importedRoots, label);
  validateNoLegacyAssetDirectories(projectPath);
  return { assets: registry.assets, importedRoots };
}

function validateAssetRegistryPolicy(policy, label) {
  if (!isRecord(policy)) {
    addError(label, "Asset registry policy must be an object.");
    return;
  }

  validateEqual(policy.finalContentRequiresRegistryEntry, true, label, "asset registry policy finalContentRequiresRegistryEntry");
  validateEqual(policy.simpleGeometryFinalContentAllowed, false, label, "asset registry policy simpleGeometryFinalContentAllowed");
  if (!Array.isArray(policy.acceptedLicenses) || !policy.acceptedLicenses.includes("CC0-1.0")) {
    addError(label, "Asset registry policy must accept CC0-1.0 assets.");
  }
}

function validateAssetRegistryRoots(roots, label) {
  if (!isRecord(roots)) {
    addError(label, "Asset registry roots must be an object.");
    return;
  }

  validateEqual(roots.importedModels, IMPORTED_MODEL_ROOT, label, "asset registry roots.importedModels");
  validateEqual(roots.importedMaterials, IMPORTED_MATERIAL_ROOT, label, "asset registry roots.importedMaterials");
  validateEqual(roots.sourceMetadata, SOURCE_METADATA_ROOT, label, "asset registry roots.sourceMetadata");
}

async function validateAssetRegistryEntry(projectPath, assetId, asset, label) {
  validateEqual(asset.id, assetId, label, `asset '${assetId}' id`);
  if (asset.type !== "model" && asset.type !== "material") {
    addError(label, `Asset '${assetId}' type must be model or material.`);
  }
  if (typeof asset.name !== "string" || asset.name.length === 0) {
    addError(label, `Asset '${assetId}' must declare a display name.`);
  }
  if (typeof asset.provider !== "string" || asset.provider.length === 0) {
    addError(label, `Asset '${assetId}' must declare a provider.`);
  }
  if (!isHttpUrl(asset.sourceUrl)) {
    addError(label, `Asset '${assetId}' must declare an http(s) sourceUrl.`);
  }
  if (!ACCEPTED_ASSET_LICENSES.has(asset.license)) {
    addError(label, `Asset '${assetId}' license '${String(asset.license)}' is not accepted.`);
  }
  if (!isHttpUrl(asset.licenseUrl)) {
    addError(label, `Asset '${assetId}' must declare an http(s) licenseUrl.`);
  }

  const imported = isRecord(asset.imported) ? asset.imported : null;
  if (!imported) {
    addError(label, `Asset '${assetId}' must declare imported metadata.`);
    return null;
  }

  const root = normalizeProjectAssetPath(imported.root);
  const expectedRoot = asset.type === "model" ? IMPORTED_MODEL_ROOT : IMPORTED_MATERIAL_ROOT;
  if (!root || !root.startsWith(`${expectedRoot}/`)) {
    addError(label, `Asset '${assetId}' imported root must be inside ${expectedRoot}.`);
    return null;
  }

  await validateAssetSourceMetadata(projectPath, asset, root, label);
  await validateAssetImportedFiles(projectPath, assetId, imported.files, root, label);
  return { id: assetId, type: asset.type, root };
}

async function validateAssetSourceMetadata(projectPath, asset, importedRoot, label) {
  const sourceMetadataPath = normalizeProjectAssetPath(asset.sourceMetadataPath);
  if (!sourceMetadataPath || !sourceMetadataPath.startsWith(`${SOURCE_METADATA_ROOT}/`)) {
    addError(label, `Asset '${asset.id}' sourceMetadataPath must be inside ${SOURCE_METADATA_ROOT}.`);
    return;
  }

  const source = await readJsonFile(path.join(projectPath, sourceMetadataPath), `source metadata for ${asset.id}`);
  validateEqual(source.id, asset.id, sourceMetadataPath, "source metadata id");
  validateEqual(source.provider, asset.provider, sourceMetadataPath, "source metadata provider");
  validateEqual(source.sourceUrl, asset.sourceUrl, sourceMetadataPath, "source metadata sourceUrl");
  validateEqual(source.license, asset.license, sourceMetadataPath, "source metadata license");
  validateEqual(source.licenseUrl, asset.licenseUrl, sourceMetadataPath, "source metadata licenseUrl");
  validateEqual(source.importedRoot, importedRoot, sourceMetadataPath, "source metadata importedRoot");
}

async function validateAssetImportedFiles(projectPath, assetId, files, importedRoot, label) {
  if (!isRecord(files)) {
    addError(label, `Asset '${assetId}' imported files must be an object.`);
    return;
  }

  const roles = Object.keys(files);
  if (roles.length === 0) {
    addError(label, `Asset '${assetId}' must declare at least one imported file.`);
    return;
  }

  await Promise.all(roles.map(async (role) => {
    const filePath = normalizeProjectAssetPath(files[role]);
    if (!filePath || !filePath.startsWith(`${importedRoot}/`)) {
      addError(label, `Asset '${assetId}' imported file '${role}' must be inside its imported root.`);
      return;
    }

    await readRequiredFileBytes(path.join(projectPath, filePath), `asset '${assetId}' imported file '${role}'`);
  }));
}

async function validateImportedAssetCoverage(projectPath, importedRoots, label) {
  const importedRootPath = path.join(projectPath, IMPORTED_ASSET_ROOT);
  const files = await listFilesSafe(importedRootPath);
  if (files.length === 0) {
    addError(label, "Imported asset root must contain registered assets.");
    return;
  }

  for (const filePath of files) {
    const projectRelative = relativeProjectPath(projectPath, filePath);
    const owner = importedRoots.find((entry) => projectRelative === entry.root || projectRelative.startsWith(`${entry.root}/`));
    if (!owner) {
      addError(projectRelative, "Imported asset file is not covered by any registry entry.");
    }
  }
}

function validateNoLegacyAssetDirectories(projectPath) {
  for (const legacyPath of ["assets/model", "assets/texture", "cooked/assets/model", "cooked/assets/texture"]) {
    if (existsSync(path.join(projectPath, legacyPath))) {
      addError(legacyPath, "Legacy asset directory is forbidden; use assets/imported plus assets/registry.json.");
    }
  }
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

  if (manifest.generationGraphPath !== GENERATION_GRAPH_PATH) {
    addError(MAP_FILE, `Map generationGraphPath must be '${GENERATION_GRAPH_PATH}'.`);
  }

  if (manifest.paintPath !== PAINT_PATH) {
    addError(MAP_FILE, `Map paintPath must be '${PAINT_PATH}'.`);
  }

  if (manifest.vegetationPath !== VEGETATION_PATH) {
    addError(MAP_FILE, `Map vegetationPath must be '${VEGETATION_PATH}'.`);
  }

  if (manifest.objectsPath !== WORLD_OBJECTS_PATH) {
    addError(MAP_FILE, `Map objectsPath must be '${WORLD_OBJECTS_PATH}'.`);
  }
}

async function validateGenerationGraph(mapDirectory, mapManifest, mapId) {
  const graphPath = path.join(mapDirectory, GENERATION_GRAPH_PATH);
  const graph = await readJsonFile(graphPath, "world generation graph");
  const label = relativePath(graphPath);

  validateEqual(graph.version, GENERATION_GRAPH_VERSION, label, "generation graph version");
  validateEqual(graph.format, GENERATION_GRAPH_FORMAT, label, "generation graph format");
  validateEqual(graph.mapId, mapId, label, "generation graph mapId");
  validateEqual(graph.seed, mapManifest.seed, label, "generation graph seed");
  validateGenerationGraphWorld(graph.world, mapManifest, label);
  validateGenerationGraphInputs(graph.inputs, label);
  validateGenerationGraphStages(graph.stages, label);
  validateGenerationGraphBudgets(graph.budgets, label);
}

function validateGenerationGraphWorld(world, mapManifest, label) {
  if (!isRecord(world)) {
    addError(label, "Generation graph world metadata must be an object.");
    return;
  }

  validateEqual(world.pageSizeMeters, mapManifest.world?.pageSizeMeters, label, "generation graph world.pageSizeMeters");
  validateEqual(world.partitionCellSizePages, COOKED_WORLD_PARTITION_CELL_SIZE_PAGES, label, "generation graph world.partitionCellSizePages");
  const pageBounds = world.pageBounds;
  const expectedPageBounds = getWorldPageBounds(mapManifest.world);
  if (!isRecord(pageBounds) || !expectedPageBounds) {
    addError(label, "Generation graph world.pageBounds must be an object matching the map world.");
    return;
  }

  validateEqual(pageBounds.minPageX, expectedPageBounds.minX, label, "generation graph pageBounds.minPageX");
  validateEqual(pageBounds.maxPageX, expectedPageBounds.maxX, label, "generation graph pageBounds.maxPageX");
  validateEqual(pageBounds.minPageZ, expectedPageBounds.minZ, label, "generation graph pageBounds.minPageZ");
  validateEqual(pageBounds.maxPageZ, expectedPageBounds.maxZ, label, "generation graph pageBounds.maxPageZ");
}

function validateGenerationGraphInputs(inputs, label) {
  if (!isRecord(inputs)) {
    addError(label, "Generation graph inputs must be an object.");
    return;
  }

  validateEqual(inputs.designSpec, "OPEN_WORLD_DESIGN_SPEC.md", label, "generation graph inputs.designSpec");
  validateEqual(inputs.assetRegistry, ASSET_REGISTRY_PATH, label, "generation graph inputs.assetRegistry");
  validateEqual(inputs.sharedSemantics, "scripts/map-generation/world-semantics.mjs", label, "generation graph inputs.sharedSemantics");
}

function validateGenerationGraphStages(stages, label) {
  if (!isRecord(stages)) {
    addError(label, "Generation graph stages must be an object.");
    return;
  }

  const requiredStages = ["semantics", "terrain", "paint", "vegetation", "objects", "collision", "nav"];
  for (const stageName of requiredStages) {
    validateGenerationGraphStage(stages[stageName], label, stageName);
  }
  validateStageDependencies(stages, label);
}

function validateGenerationGraphStage(stage, label, stageName) {
  if (!isRecord(stage)) {
    addError(label, `Generation graph stage '${stageName}' must be an object.`);
    return;
  }
  if (typeof stage.kind !== "string" || stage.kind.length === 0) {
    addError(label, `Generation graph stage '${stageName}' must declare a kind.`);
  }
  if (!Array.isArray(stage.dependencies) || !stage.dependencies.every((entry) => typeof entry === "string")) {
    addError(label, `Generation graph stage '${stageName}' dependencies must be a string array.`);
  }
  if (!isRecord(stage.rebuild) || typeof stage.rebuild.scope !== "string") {
    addError(label, `Generation graph stage '${stageName}' must declare a rebuild scope.`);
  }
  if (stage.execution !== undefined) {
    validateGenerationGraphExecution(stage.execution, label, stageName);
  }
}

function validateGenerationGraphExecution(execution, label, stageName) {
  if (!isRecord(execution)) {
    addError(label, `Generation graph stage '${stageName}' execution metadata must be an object.`);
    return;
  }
  if (typeof execution.executor !== "string" || execution.executor.length === 0) {
    addError(label, `Generation graph stage '${stageName}' execution.executor must be a non-empty string.`);
  }
  if (execution.localRebuild !== true) {
    addError(label, `Generation graph stage '${stageName}' execution.localRebuild must be true.`);
  }
  if (!Array.isArray(execution.invalidates) || !execution.invalidates.every((entry) => typeof entry === "string")) {
    addError(label, `Generation graph stage '${stageName}' execution.invalidates must be a string array.`);
  }
}

function validateStageDependencies(stages, label) {
  const stageNames = new Set(Object.keys(stages));
  for (const [stageName, stage] of Object.entries(stages)) {
    if (!isRecord(stage) || !Array.isArray(stage.dependencies)) {
      continue;
    }
    for (const dependency of stage.dependencies) {
      if (dependency === "assetRegistry") {
        continue;
      }
      if (!stageNames.has(dependency)) {
        addError(label, `Generation graph stage '${stageName}' references unknown dependency '${dependency}'.`);
      }
    }
  }
}

function validateGenerationGraphBudgets(budgets, label) {
  if (!isRecord(budgets)) {
    addError(label, "Generation graph budgets must be an object.");
    return;
  }

  requirePositiveNumber(budgets.targetAreaSquareKilometers, label, "generation graph budget targetAreaSquareKilometers");
  requirePositiveInteger(budgets.maxTerrainHeightRegionsPerFullRebuild, label, "generation graph budget maxTerrainHeightRegionsPerFullRebuild");
  requirePositiveInteger(budgets.maxPaintRegionsPerFullRebuild, label, "generation graph budget maxPaintRegionsPerFullRebuild");
  requirePositiveNumber(budgets.vegetationCellSizeMeters, label, "generation graph budget vegetationCellSizeMeters");
  requirePositiveNumber(budgets.partitionCellSizeMeters, label, "generation graph budget partitionCellSizeMeters");
  requireOptionalPositiveInteger(budgets.maxPartitionCellsPerScopedCook, label, "generation graph budget maxPartitionCellsPerScopedCook");
  requireOptionalPositiveInteger(budgets.targetFrameRateFps, label, "generation graph budget targetFrameRateFps");
  requireOptionalPositiveInteger(budgets.maxDrawCalls, label, "generation graph budget maxDrawCalls");
  requireOptionalPositiveInteger(budgets.maxGpuMemoryMiB, label, "generation graph budget maxGpuMemoryMiB");
  requireOptionalPositiveInteger(budgets.maxVisibleVegetationInstances, label, "generation graph budget maxVisibleVegetationInstances");
}

function validatePaintLayerAssetReferences(layers, assetRegistry, label) {
  const textureFields = ["diffuse", "normal", "displacement", "arm", "ao", "roughness", "metallic"];
  for (const [layerName, layer] of Object.entries(layers)) {
    if (!isRecord(layer)) {
      addError(label, `Paint layer '${layerName}' must be an object.`);
      continue;
    }

    for (const field of textureFields) {
      const value = layer[field];
      if (typeof value !== "string" || isExternalAssetPath(value)) {
        continue;
      }

      validateRegisteredProjectAssetPath(assetRegistry, value, "material", label, `paint layer '${layerName}' ${field}`);
    }
  }
}

function validateVegetationModelAssetReferences(mapDirectory, models, assetRegistry, label) {
  const modelFields = ["path", "lod1Path", "lod2Path"];
  for (const [modelId, model] of Object.entries(models)) {
    if (!isRecord(model)) {
      addError(label, `Vegetation model '${modelId}' must be an object.`);
      continue;
    }

    for (const field of modelFields) {
      const value = model[field];
      if (typeof value !== "string" || value.length === 0 || isExternalAssetPath(value)) {
        continue;
      }

      const projectRelativePath = resolveProjectAssetReference(projectDirectory, mapDirectory, value, label, `vegetation model '${modelId}' ${field}`);
      if (projectRelativePath) {
        validateRegisteredProjectAssetPath(assetRegistry, projectRelativePath, "model", label, `vegetation model '${modelId}' ${field}`);
      }
    }
  }
}

function validateWorldObjectArchetypeAssetReferences(mapDirectory, archetypes, assetRegistry, label) {
  for (const [archetypeId, archetype] of Object.entries(archetypes)) {
    if (!isRecord(archetype)) {
      addError(label, `World object archetype '${archetypeId}' must be an object.`);
      continue;
    }

    const render = archetype.render;
    if (!isRecord(render)) {
      continue;
    }

    if ((archetype.layer === "poi" || archetype.layer === "prop") && render.kind !== "gltf") {
      addError(label, `World object archetype '${archetypeId}' final POI/prop render must use a registered GLTF model.`);
    }

    for (const field of ["path", "lod1Path", "lod2Path"]) {
      const value = render[field];
      if (typeof value !== "string" || value.length === 0 || isExternalAssetPath(value)) {
        continue;
      }

      const projectRelativePath = resolveProjectAssetReference(projectDirectory, mapDirectory, value, label, `world object archetype '${archetypeId}' render.${field}`);
      if (projectRelativePath) {
        validateRegisteredProjectAssetPath(assetRegistry, projectRelativePath, "model", label, `world object archetype '${archetypeId}' render.${field}`);
      }
    }
  }
}

function validateRegisteredProjectAssetPath(assetRegistry, projectRelativePath, expectedType, label, fieldName) {
  const normalized = normalizeProjectAssetPath(projectRelativePath);
  if (!normalized) {
    addError(label, `${fieldName} must be a project-relative asset path.`);
    return;
  }

  const owner = assetRegistry.importedRoots.find((entry) => normalized === entry.root || normalized.startsWith(`${entry.root}/`));
  if (!owner) {
    addError(label, `${fieldName} must reference an asset declared in ${ASSET_REGISTRY_PATH}.`);
    return;
  }

  if (owner.type !== expectedType) {
    addError(label, `${fieldName} must reference a registered ${expectedType} asset, got ${owner.type}.`);
  }
}

function resolveProjectAssetReference(projectPath, baseDirectory, assetPath, label, fieldName) {
  const absolutePath = path.resolve(baseDirectory, assetPath);
  if (!isInsideDirectory(absolutePath, projectPath)) {
    addError(label, `${fieldName} must resolve inside the project directory.`);
    return null;
  }

  return relativeProjectPath(projectPath, absolutePath);
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

async function validatePaint(mapDirectory, mapManifest, assetRegistry) {
  const manifestPath = path.join(mapDirectory, PAINT_PATH);
  const manifest = await readJsonFile(manifestPath, "paint manifest");
  const label = relativePath(manifestPath);
  const splatMaps = manifest.splatMaps;

  if (manifest.version !== 2) {
    addError(label, "Paint manifest must use version 2.");
  }
  if (!isRecord(manifest.layers)) {
    addError(label, "Paint manifest must contain texture layers.");
  } else {
    validatePaintLayerAssetReferences(manifest.layers, assetRegistry, label);
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

async function validateVegetation(mapDirectory, assetRegistry) {
  const manifestPath = path.join(mapDirectory, VEGETATION_PATH);
  const manifest = await readJsonFile(manifestPath, "vegetation manifest");
  const label = relativePath(manifestPath);
  const instances = manifest.instances;

  if (manifest.version !== 5) {
    addError(label, "Vegetation manifest must use version 5.");
  }
  if (!isRecord(manifest.models)) {
    addError(label, "Vegetation manifest must contain model definitions.");
  } else {
    validateVegetationModelAssetReferences(mapDirectory, manifest.models, assetRegistry, label);
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

async function validateWorldObjects(mapDirectory, assetRegistry) {
  const manifestPath = path.join(mapDirectory, WORLD_OBJECTS_PATH);
  const manifest = await readJsonFile(manifestPath, "world object manifest");
  const label = relativePath(manifestPath);

  if (manifest.version !== 1) {
    addError(label, "World object manifest must use version 1.");
  }
  validateEqual(manifest.format, WORLD_OBJECT_MANIFEST_FORMAT, label, "world object manifest format");
  validateEqual(manifest.cellFormat, WORLD_OBJECT_CELL_FORMAT, label, "world object cellFormat");
  validateEqual(manifest.cellSizePages, COOKED_WORLD_PARTITION_CELL_SIZE_PAGES, label, "world object cellSizePages");
  validateEqual(manifest.cellsDirectory, WORLD_OBJECT_CELLS_DIRECTORY, label, "world object cellsDirectory");
  if (!isRecord(manifest.archetypes)) {
    addError(label, "World object manifest must contain archetypes.");
  } else {
    validateWorldObjectArchetypeAssetReferences(mapDirectory, manifest.archetypes, assetRegistry, label);
  }
  if (!isRecord(manifest.cells)) {
    addError(label, "World object manifest must contain cell metadata.");
    return manifest;
  }

  let objectCount = 0;
  const expectedPaths = new Set();
  for (const key of Object.keys(manifest.cells).sort(compareRegionKeyStrings)) {
    const cellRef = manifest.cells[key];
    const expectedPath = cellPathFromKey("objects", "objectpack", key);
    expectedPaths.add(expectedPath);
    if (!isRecord(cellRef)) {
      addError(label, `World object cell '${key}' metadata must be an object.`);
      continue;
    }

    validateEqual(cellRef.path, expectedPath, label, `world object cell '${key}' path`);
    const bytes = await readRequiredFileBytes(path.join(mapDirectory, expectedPath), `world object cell '${key}'`);
    if (!bytes) {
      continue;
    }

    validateArtifactBytes(bytes, cellRef, label, `world object cell '${key}'`);
    const pack = parseJsonBytes(bytes, expectedPath);
    if (!pack) {
      continue;
    }

    const objects = validateWorldObjectCellPayload(pack, key, label, `world object cell '${key}'`);
    if (objects) {
      objectCount += objects.length;
      validateEqual(cellRef.objectCount, objects.length, label, `world object cell '${key}' objectCount`);
      validateWorldObjectEntries(objects, label, `world object cell '${key}'`);
    }
  }

  if (objectCount <= 0) {
    addError(label, "World object source must contain at least one authored object.");
  }
  await validateNoOrphanRegionPacks(mapDirectory, WORLD_OBJECT_CELLS_DIRECTORY, ".objectpack", expectedPaths);
  return manifest;
}

async function validateCookedMap(projectPath, mapId, mapManifest, objectManifest) {
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
    assetRegistry: ASSET_REGISTRY_PATH,
    map: `maps/${mapId}/${MAP_FILE}`,
    generationGraph: `maps/${mapId}/${GENERATION_GRAPH_PATH}`,
    terrain: `maps/${mapId}/${TERRAIN_HEIGHT_PATH}`,
    paint: `maps/${mapId}/${PAINT_PATH}`,
    vegetation: `maps/${mapId}/${VEGETATION_PATH}`,
    objects: `maps/${mapId}/${WORLD_OBJECTS_PATH}`,
  };
  if (!isRecord(cooked.source)) {
    addError(label, "Cooked map manifest must contain source hash metadata.");
  } else {
    await validateCookedSourceReference(projectPath, cooked.source.project, sourcePaths.project, label, "project");
    await validateCookedSourceReference(projectPath, cooked.source.assetRegistry, sourcePaths.assetRegistry, label, "assetRegistry");
    await validateCookedSourceReference(projectPath, cooked.source.map, sourcePaths.map, label, "map");
    await validateCookedSourceReference(projectPath, cooked.source.generationGraph, sourcePaths.generationGraph, label, "generationGraph");
    await validateCookedSourceReference(projectPath, cooked.source.terrain, sourcePaths.terrain, label, "terrain");
    await validateCookedSourceReference(projectPath, cooked.source.paint, sourcePaths.paint, label, "paint");
    await validateCookedSourceReference(projectPath, cooked.source.vegetation, sourcePaths.vegetation, label, "vegetation");
    await validateCookedSourceReference(projectPath, cooked.source.objects, sourcePaths.objects, label, "objects");
  }
  const cookedBuild = validateCookedBuild(cooked.build, cooked.source, mapId, label);

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
    objectManifest,
    label,
  );

  if (cookedWorld && cookedAssets) {
    validateCookedPartition(cooked.partition, cookedWorld, cookedAssets, label);
  }
  await validateCookedPackage(projectPath, cooked.package, cookedBuild, label);
  await validateCookedCache(projectPath, mapId, cooked, label);
}

function validateCookedBuild(build, source, mapId, label) {
  if (!isRecord(build)) {
    addError(label, "Cooked map manifest must contain build metadata.");
    return null;
  }

  validateEqual(build.tool, "open-fps-cook-map-assets", label, "cooked build tool");
  validateEqual(build.toolVersion, COOKED_MAP_VERSION, label, "cooked build toolVersion");
  validateEqual(build.packageLayout, COOKED_PACKAGE_LAYOUT, label, "cooked build packageLayout");
  if (typeof build.generatedAt !== "string" || Number.isNaN(Date.parse(build.generatedAt))) {
    addError(label, "Cooked build generatedAt must be an ISO date string.");
  }
  if (build.previousInputSignature !== null && !isSha256(build.previousInputSignature)) {
    addError(label, "Cooked build previousInputSignature must be null or a lowercase SHA-256 digest.");
  }
  if (!Number.isInteger(build.artifactCount) || build.artifactCount < 0) {
    addError(label, "Cooked build artifactCount must be a non-negative integer.");
  }
  validateCookedRebuild(build.rebuild, label);

  const expectedInputSignature = createCookInputSignature(mapId, source);
  validateEqual(build.inputSignature, expectedInputSignature, label, "cooked build inputSignature");
  return {
    inputSignature: expectedInputSignature,
    artifactCount: Number.isInteger(build.artifactCount) ? build.artifactCount : -1,
  };
}

function validateCookedRebuild(rebuild, label) {
  if (!isRecord(rebuild)) {
    addError(label, "Cooked build must contain rebuild metadata.");
    return;
  }

  if (rebuild.mode !== "full" && rebuild.mode !== "scoped") {
    addError(label, "Cooked rebuild mode must be 'full' or 'scoped'.");
  }
  if (rebuild.planId !== null && (typeof rebuild.planId !== "string" || rebuild.planId.length === 0)) {
    addError(label, "Cooked rebuild planId must be null or a non-empty string.");
  }
  if (!Array.isArray(rebuild.stages) || !rebuild.stages.every((entry) => typeof entry === "string")) {
    addError(label, "Cooked rebuild stages must be a string array.");
  }
  if (rebuild.mode === "scoped" && !isRecord(rebuild.scopes)) {
    addError(label, "Scoped cooked rebuild must include affected scopes.");
  }
  if (rebuild.estimatedArtifacts !== null && (!Number.isInteger(rebuild.estimatedArtifacts) || rebuild.estimatedArtifacts < 0)) {
    addError(label, "Cooked rebuild estimatedArtifacts must be null or a non-negative integer.");
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

async function validateCookedAssets(projectPath, assets, mapId, terrainManifest, paintManifest, vegetationManifest, objectManifest, label) {
  if (!isRecord(assets)) {
    addError(label, "Cooked map manifest must contain asset metadata.");
    return null;
  }

  const terrain = validateCookedTerrainAsset(assets.terrain, mapId, terrainManifest, label);
  const paint = validateCookedPaintAsset(assets.paint, mapId, paintManifest, label);
  const vegetation = validateCookedVegetationAsset(assets.vegetation, mapId, vegetationManifest, label);
  const objects = validateCookedObjectCellAsset(assets.objects, mapId, objectManifest, label);
  const collision = validateCookedCellAsset(assets.collision, mapId, label, "collision", COOKED_COLLISION_CELL_FORMAT, "collisionpack");
  const nav = validateCookedCellAsset(assets.nav, mapId, label, "nav", COOKED_NAV_CELL_FORMAT, "navpack");
  if (!terrain || !paint || !vegetation || !objects || !collision || !nav) {
    return null;
  }

  await validateCookedRegionFiles(projectPath, terrain.regions, label, "terrain");
  await validateCookedRegionFiles(projectPath, paint.regions, label, "paint");
  await validateCookedRegionFiles(projectPath, vegetation.regions, label, "vegetation");
  await validateCookedCellFiles(projectPath, objects.cells, label, "objects", COOKED_OBJECT_CELL_FORMAT);
  await validateCookedCellFiles(projectPath, collision.cells, label, "collision", COOKED_COLLISION_CELL_FORMAT);
  await validateCookedCellFiles(projectPath, nav.cells, label, "nav", COOKED_NAV_CELL_FORMAT);
  await validateCookedPaintTextureFiles(projectPath, paint.layers, label);
  await validateCookedVegetationModelFiles(projectPath, mapId, vegetation.models, label);

  return { terrain, paint, vegetation, objects, collision, nav };
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

function validateCookedObjectCellAsset(asset, mapId, sourceManifest, label) {
  if (!isRecord(asset)) {
    addError(label, "Cooked objects asset metadata must be an object.");
    return null;
  }

  validateEqual(asset.manifestPath, `maps/${mapId}/${WORLD_OBJECTS_PATH}`, label, "cooked objects manifestPath");
  validateEqual(asset.format, COOKED_OBJECT_CELL_FORMAT, label, "cooked objects format");
  validateEqual(asset.cellSizePages, COOKED_WORLD_PARTITION_CELL_SIZE_PAGES, label, "cooked objects cellSizePages");
  if (!Number.isFinite(asset.cellSizeMeters) || asset.cellSizeMeters <= 0) {
    addError(label, "Cooked objects cellSizeMeters must be positive.");
  }

  const cells = validateCookedCellTable(
    asset.cells,
    (key) => mapCookedPath(mapId, cellPathFromKey("objects", "objectpack", key)),
    label,
    "objects",
  );
  if (!cells || !isRecord(sourceManifest?.cells)) {
    return cells ? { ...asset, cells } : null;
  }

  const sourceKeys = Object.keys(sourceManifest.cells).sort(compareRegionKeyStrings);
  const cookedKeys = Object.keys(cells).sort(compareRegionKeyStrings);
  if (!sameStringArray(sourceKeys, cookedKeys)) {
    addError(label, "Cooked object cells must match source object cells.");
  }

  for (const key of sourceKeys) {
    const sourceCell = sourceManifest.cells[key];
    const cookedCell = cells[key];
    if (!isRecord(sourceCell) || !isRecord(cookedCell)) {
      continue;
    }

    validateEqual(cookedCell.objectCount, sourceCell.objectCount, label, `cooked object cell '${key}' objectCount`);
    validateEqual(cookedCell.byteLength, sourceCell.byteLength, label, `cooked object cell '${key}' byteLength`);
    validateEqual(cookedCell.sha256, sourceCell.sha256, label, `cooked object cell '${key}' sha256`);
  }

  return { ...asset, cells };
}

function validateCookedCellAsset(asset, mapId, label, assetName, expectedFormat, extension) {
  if (!isRecord(asset)) {
    addError(label, `Cooked ${assetName} asset metadata must be an object.`);
    return null;
  }

  validateEqual(asset.format, expectedFormat, label, `cooked ${assetName} format`);
  validateEqual(asset.cellSizePages, COOKED_WORLD_PARTITION_CELL_SIZE_PAGES, label, `cooked ${assetName} cellSizePages`);
  if (!Number.isFinite(asset.cellSizeMeters) || asset.cellSizeMeters <= 0) {
    addError(label, `Cooked ${assetName} cellSizeMeters must be positive.`);
  }

  const cells = validateCookedCellTable(
    asset.cells,
    (key) => mapCookedPath(mapId, cellPathFromKey(assetName, extension, key)),
    label,
    assetName,
  );

  return cells ? { ...asset, cells } : null;
}

function validateCookedCellTable(cells, resolvePath, label, assetName) {
  if (!isRecord(cells)) {
    addError(label, `Cooked ${assetName} cells must be a JSON object.`);
    return null;
  }

  for (const key of Object.keys(cells).sort(compareRegionKeyStrings)) {
    const cell = cells[key];
    if (!isRecord(cell)) {
      addError(label, `Cooked ${assetName} cell '${key}' metadata is invalid.`);
      continue;
    }

    validateEqual(cell.path, resolvePath(key), label, `cooked ${assetName} cell '${key}' path`);
    if (!Number.isInteger(cell.byteLength) || cell.byteLength < 0) {
      addError(label, `Cooked ${assetName} cell '${key}' byteLength must be a non-negative integer.`);
    }
    if (!isSha256(cell.sha256)) {
      addError(label, `Cooked ${assetName} cell '${key}' sha256 must be a lowercase SHA-256 digest.`);
    }
  }

  return cells;
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

async function validateCookedCellFiles(projectPath, cells, label, assetName, expectedFormat) {
  await Promise.all(Object.entries(cells).map(async ([key, cell]) => {
    if (!isRecord(cell)) {
      return;
    }

    const bytes = await readRequiredFileBytes(path.join(projectPath, cell.path), `cooked ${assetName} cell '${key}'`);
    if (bytes) {
      validateArtifactBytes(bytes, cell, label, `cooked ${assetName} cell '${key}'`);
      const pack = parseJsonBytes(bytes, cell.path);
      if (pack) {
        validateCookedCellPayload(pack, key, label, `cooked ${assetName} cell '${key}'`, expectedFormat, assetName, cell);
      }
    }
  }));
}

function validateCookedCellPayload(pack, key, label, fieldName, expectedFormat, assetName, cellMetadata) {
  if (!isRecord(pack)) {
    addError(label, `${fieldName} must contain a JSON object.`);
    return;
  }

  validateEqual(pack.version, 1, label, `${fieldName} version`);
  validateEqual(pack.format, expectedFormat, label, `${fieldName} format`);
  if (pack.cell?.key !== key) {
    addError(label, `${fieldName} cell key must be '${key}'.`);
  }

  if (assetName === "objects") {
    const objects = validateWorldObjectCellPayload(pack, key, label, fieldName);
    if (objects) {
      validateEqual(cellMetadata.objectCount, objects.length, label, `${fieldName} objectCount`);
      validateWorldObjectEntries(objects, label, fieldName);
    }
    return;
  }

  if (assetName === "collision") {
    if (!Array.isArray(pack.shapes) || pack.shapes.length === 0) {
      addError(label, `${fieldName} must contain derived collision shapes.`);
      return;
    }
    if (!pack.shapes.some((shape) => isRecord(shape) && shape.type === "terrain-heightfield")) {
      addError(label, `${fieldName} must include a terrain-heightfield shape.`);
    }
    return;
  }

  if (assetName === "nav") {
    if (!Array.isArray(pack.nodes) || pack.nodes.length === 0) {
      addError(label, `${fieldName} must contain nav nodes.`);
    }
    if (!Array.isArray(pack.links)) {
      addError(label, `${fieldName} must contain nav links.`);
    }
    if (!Array.isArray(pack.crossCellLinks)) {
      addError(label, `${fieldName} must contain cross-cell nav links.`);
    }
    if (Array.isArray(pack.nodes) && !pack.nodes.some((node) => isRecord(node) && node.walkable === true)) {
      addError(label, `${fieldName} must contain at least one walkable nav node.`);
    }
  }
}

function validateWorldObjectCellPayload(pack, key, label, fieldName) {
  if (!isRecord(pack)) {
    addError(label, `${fieldName} must contain a JSON object.`);
    return null;
  }

  validateEqual(pack.version, 1, label, `${fieldName} version`);
  validateEqual(pack.format, WORLD_OBJECT_CELL_FORMAT, label, `${fieldName} format`);
  if (pack.cell?.key !== key) {
    addError(label, `${fieldName} cell key must be '${key}'.`);
  }
  if (!Array.isArray(pack.objects)) {
    addError(label, `${fieldName} objects must be an array.`);
    return null;
  }

  return pack.objects;
}

function validateWorldObjectEntries(objects, label, fieldName) {
  const ids = new Set();
  for (const object of objects) {
    if (!isRecord(object)) {
      addError(label, `${fieldName} contains an invalid object entry.`);
      continue;
    }
    if (typeof object.id !== "string" || object.id.length === 0) {
      addError(label, `${fieldName} contains an object without an id.`);
    } else if (ids.has(object.id)) {
      addError(label, `${fieldName} contains duplicate object id '${object.id}'.`);
    } else {
      ids.add(object.id);
    }
    if (!isRecord(object.position) || !Number.isFinite(object.position.x) || !Number.isFinite(object.position.y) || !Number.isFinite(object.position.z)) {
      addError(label, `${fieldName} object '${String(object.id)}' must contain a finite position.`);
    }
    if (!isRecord(object.boundsMeters)) {
      addError(label, `${fieldName} object '${String(object.id)}' must contain boundsMeters.`);
    }
    if (typeof object.layer !== "string" || typeof object.archetype !== "string") {
      addError(label, `${fieldName} object '${String(object.id)}' must contain layer and archetype.`);
    }
  }
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
  validateCookedCellAssetCoverage(partition.cells, assets.objects.cells, label, "objects");
  validateCookedCellAssetCoverage(partition.cells, assets.collision.cells, label, "collision");
  validateCookedCellAssetCoverage(partition.cells, assets.nav.cells, label, "nav");
}

function validateCookedCellAssetCoverage(partitionCells, assetCells, label, assetName) {
  const partitionKeys = partitionCells.map((cell) => cell.key).sort(compareRegionKeyStrings);
  const assetKeys = Object.keys(assetCells).sort(compareRegionKeyStrings);
  if (!sameStringArray(partitionKeys, assetKeys)) {
    addError(label, `Cooked ${assetName} cells must match world partition cell keys.`);
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
    Object.hasOwn(assets.objects.cells, cell.key) ? [cell.key] : [],
    label,
    `cooked partition cell '${cell.key}' dependencies.objects`,
  );
  validateExactStringArray(
    dependencies.collision,
    Object.hasOwn(assets.collision.cells, cell.key) ? [cell.key] : [],
    label,
    `cooked partition cell '${cell.key}' dependencies.collision`,
  );
  validateExactStringArray(
    dependencies.nav,
    Object.hasOwn(assets.nav.cells, cell.key) ? [cell.key] : [],
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

async function validateCookedPackage(projectPath, contentPackage, cookedBuild, label) {
  if (!isRecord(contentPackage)) {
    addError(label, "Cooked map manifest must contain package metadata.");
    return;
  }

  validateEqual(contentPackage.layout, COOKED_PACKAGE_LAYOUT, label, "cooked package layout");
  validateEqual(contentPackage.blobRoot, COOKED_BLOB_ROOT, label, "cooked package blobRoot");
  if (!Number.isInteger(contentPackage.artifactCount) || contentPackage.artifactCount < 0) {
    addError(label, "Cooked package artifactCount must be a non-negative integer.");
  }
  if (cookedBuild && contentPackage.artifactCount !== cookedBuild.artifactCount) {
    addError(label, "Cooked package artifactCount must match build metadata.");
  }
  validateCookedPackageStreaming(contentPackage.streaming, label);
  if (!isRecord(contentPackage.artifacts)) {
    addError(label, "Cooked package artifacts must be a JSON object.");
    return;
  }

  const artifacts = Object.entries(contentPackage.artifacts);
  if (artifacts.length !== contentPackage.artifactCount) {
    addError(label, `Cooked package declares ${contentPackage.artifactCount} artifacts, got ${artifacts.length}.`);
  }

  await Promise.all(artifacts.map(async ([key, artifact]) => {
    if (!isRecord(artifact)) {
      addError(label, `Cooked package artifact '${key}' must be an object.`);
      return;
    }

    validateEqual(artifact.path, key, label, `cooked package artifact '${key}' path`);
    if (typeof artifact.kind !== "string" || artifact.kind.length === 0) {
      addError(label, `Cooked package artifact '${key}' kind must be a non-empty string.`);
    }
    if (!Number.isInteger(artifact.byteLength) || artifact.byteLength < 0) {
      addError(label, `Cooked package artifact '${key}' byteLength must be a non-negative integer.`);
    }
    if (!isSha256(artifact.sha256)) {
      addError(label, `Cooked package artifact '${key}' sha256 must be a lowercase SHA-256 digest.`);
    }
    if (typeof artifact.blobPath !== "string" || !artifact.blobPath.startsWith(`${COOKED_BLOB_ROOT}/${artifact.sha256?.slice?.(0, 2) ?? ""}/`)) {
      addError(label, `Cooked package artifact '${key}' blobPath must point inside the content-addressed blob root.`);
    }

    const runtimeBytes = await readRequiredFileBytes(path.join(projectPath, key), `cooked package runtime artifact '${key}'`);
    if (runtimeBytes) {
      validateArtifactBytes(runtimeBytes, artifact, label, `cooked package runtime artifact '${key}'`);
    }
    if (typeof artifact.blobPath === "string") {
      const blobBytes = await readRequiredFileBytes(path.join(projectPath, artifact.blobPath), `cooked package blob artifact '${key}'`);
      if (blobBytes) {
        validateArtifactBytes(blobBytes, artifact, label, `cooked package blob artifact '${key}'`);
      }
    }
  }));

  await validateCookedImportedAssetCoverage(projectPath, contentPackage.artifacts);
}

function validateCookedPackageStreaming(streaming, label) {
  if (!isRecord(streaming)) {
    addError(label, "Cooked package must contain streaming metadata.");
    return;
  }
  validateEqual(streaming.locality, "world-partition-cell-runtime-path-v1", label, "cooked package streaming.locality");
  validateEqual(streaming.duplicateBlobPolicy, "content-addressed-sha256", label, "cooked package streaming.duplicateBlobPolicy");
  if (typeof streaming.compression !== "string" || streaming.compression.length === 0) {
    addError(label, "Cooked package streaming.compression must be a non-empty string.");
  }
}

async function validateCookedImportedAssetCoverage(projectPath, artifacts) {
  const cookedImportedRoot = path.join(projectPath, "cooked", IMPORTED_ASSET_ROOT);
  const files = await listFilesSafe(cookedImportedRoot);
  const artifactPaths = new Set(Object.keys(artifacts ?? {}));

  for (const filePath of files) {
    const projectRelative = relativeProjectPath(projectPath, filePath);
    if (!artifactPaths.has(projectRelative)) {
      addError(projectRelative, "Cooked imported asset file is not covered by the cooked package artifact index.");
    }
  }
}

async function validateCookedCache(projectPath, mapId, cooked, label) {
  const cachePath = path.join(projectPath, COOKED_CACHE_DIRECTORY, `${mapId}.json`);
  const cache = await readJsonFile(cachePath, "cooked cache metadata");
  const cacheLabel = relativePath(cachePath);
  if (!isRecord(cache)) {
    addError(cacheLabel, "Cooked cache metadata must be a JSON object.");
    return;
  }

  validateEqual(cache.version, 1, cacheLabel, "cooked cache version");
  validateEqual(cache.format, "open-fps-cook-cache-v1", cacheLabel, "cooked cache format");
  validateEqual(cache.mapId, mapId, cacheLabel, "cooked cache mapId");
  validateEqual(cache.manifestPath, `${COOKED_MAP_DIRECTORY}/${mapId}/${COOKED_MAP_MANIFEST_FILE}`, cacheLabel, "cooked cache manifestPath");
  validateEqual(cache.inputSignature, cooked.build?.inputSignature, cacheLabel, "cooked cache inputSignature");
  validateEqual(cache.packageLayout, cooked.package?.layout, cacheLabel, "cooked cache packageLayout");
  validateEqual(cache.artifactCount, cooked.package?.artifactCount, cacheLabel, "cooked cache artifactCount");

  const expectedArtifacts = Object.values(cooked.package?.artifacts ?? {})
    .flatMap((artifact) => isRecord(artifact) ? [artifact.path, artifact.blobPath] : [])
    .sort();
  validateExactStringArray(cache.artifacts, expectedArtifacts, cacheLabel, "cooked cache artifacts");
  if (cache.inputSignature !== cooked.build?.inputSignature) {
    addError(label, "Cooked cache is stale for the current cooked manifest.");
  }
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

function validateArtifactBytes(bytes, artifact, label, fieldName) {
  if (!isRecord(artifact)) {
    addError(label, `${fieldName} artifact metadata is invalid.`);
    return;
  }

  if (artifact.byteLength !== bytes.byteLength) {
    addError(label, `${fieldName} byteLength ${artifact.byteLength} does not match ${bytes.byteLength}.`);
  }
  if (!isSha256(artifact.sha256)) {
    addError(label, `${fieldName} sha256 must be a lowercase SHA-256 digest.`);
    return;
  }

  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (artifact.sha256 !== actualSha256) {
    addError(label, `${fieldName} sha256 mismatch.`);
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

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    addError(label, `Failed to parse JSON payload: ${error.message}`);
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

function cellPathFromKey(directory, extension, key) {
  const [x, z] = parseGridKey(key, directory);
  return `${directory}/cells/c_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.${extension}`;
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

function createCookInputSignature(mapId, source) {
  return createHash("sha256").update(JSON.stringify({
    format: COOKED_MAP_FORMAT,
    version: COOKED_MAP_VERSION,
    mapId,
    source,
    partition: {
      cellSizePages: COOKED_WORLD_PARTITION_CELL_SIZE_PAGES,
      dependencyKinds: COOKED_WORLD_PARTITION_DEPENDENCY_KINDS,
    },
    generatedAssets: {
      objects: COOKED_OBJECT_CELL_FORMAT,
      collision: COOKED_COLLISION_CELL_FORMAT,
      nav: COOKED_NAV_CELL_FORMAT,
    },
  })).digest("hex");
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

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
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
  console.log(`Usage: pnpm validate:map [--project ${DEFAULT_PROJECT_DIRECTORY}] [--map main]`);
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

function requireOptionalPositiveInteger(value, label, fieldName) {
  if (value === undefined) {
    return null;
  }

  return requirePositiveInteger(value, label, fieldName);
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

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isInsideDirectory(filePath, directory) {
  const relative = path.relative(directory, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeProjectAssetPath(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\")) {
    return null;
  }

  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    return null;
  }

  return normalized;
}

async function listFilesSafe(directoryPath) {
  try {
    return await listFiles(directoryPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function listFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    if (entry.isFile()) {
      return [entryPath];
    }

    return [];
  }));

  return files.flat();
}

function relativeProjectPath(projectPath, filePath) {
  return path.relative(projectPath, filePath).replaceAll(path.sep, "/");
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
