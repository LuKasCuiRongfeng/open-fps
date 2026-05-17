import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  compareRegionCoords,
  cookedBuildCacheDirectory,
  cookedCollisionCellFormat,
  cookedMapFormat,
  cookedMapManifestFile,
  cookedMapsDirectory,
  cookedMapVersion,
  cookedNavCellFormat,
  cookedObjectCellFormat,
  cookedWorldPartitionCellSizePages,
  cookedWorldPartitionDependencyKinds,
  createSha256Hex,
  getMapDir,
  getMapPath,
  paintManifestPath,
  terrainHeightPath,
  vegetationModelsPath,
  writeJsonFile,
} from "./shared.mjs";
import { createCookedPackageBuilder } from "./cooked-package.mjs";

export async function generateCookedMapAssets(context, preset) {
  const mapId = preset.id;
  const mapDir = getMapDir(context, preset);
  const cookedDir = path.join(context.projectDir, cookedMapsDirectory, mapId);

  const projectSource = await readSourceJson(context.projectPath, context);
  const mapSource = await readSourceJson(getMapPath(context, preset), context);
  const terrainSource = await readSourceJson(path.join(mapDir, terrainHeightPath), context);
  const paintSource = await readSourceJson(path.join(mapDir, paintManifestPath), context);
  const vegetationSource = await readSourceJson(path.join(mapDir, vegetationModelsPath), context);
  const source = {
    project: createSourceRef(projectSource),
    map: createSourceRef(mapSource),
    terrain: createSourceRef(terrainSource),
    paint: createSourceRef(paintSource),
    vegetation: createSourceRef(vegetationSource),
  };
  const inputSignature = createCookInputSignature(mapId, source);
  const cache = await readCookCache(context, mapId);
  if (await isCookCacheUsable(context, cookedDir, cache, inputSignature)) {
    return createCookResult(context, cookedDir, mapId, true);
  }

  await rm(cookedDir, { recursive: true, force: true });
  await mkdir(cookedDir, { recursive: true });

  const world = createCookedWorld(mapSource.json.world);
  const packageBuilder = createCookedPackageBuilder(context);
  const coreAssets = await createCookedAssets(
    context,
    mapId,
    mapDir,
    cookedDir,
    packageBuilder,
    terrainSource.json,
    paintSource.json,
    vegetationSource.json,
  );
  const basePartition = createWorldPartition(world, coreAssets);
  const partitionAssets = await createCookedPartitionCellAssets(context, mapId, basePartition, packageBuilder);
  const assets = { ...coreAssets, ...partitionAssets };
  const partition = attachPartitionCellAssetDependencies(basePartition, partitionAssets);
  const contentPackage = packageBuilder.createPackage();
  const build = createCookedBuildMetadata(inputSignature, contentPackage, cache);

  const manifest = {
    version: cookedMapVersion,
    format: cookedMapFormat,
    mapId,
    build,
    map: {
      seed: mapSource.json.seed,
      metadata: mapSource.json.metadata,
    },
    source,
    world,
    assets,
    partition,
    package: contentPackage,
  };

  const outputPath = path.join(cookedDir, cookedMapManifestFile);
  await writeJsonFile(outputPath, manifest);
  await writeCookCache(context, mapId, manifest);

  return createCookResultFromManifest(context, outputPath, manifest, false);
}

async function readSourceJson(filePath, context) {
  const bytes = await readFile(filePath);
  return {
    path: projectRelativePath(filePath, context),
    sha256: createSha256Hex(bytes),
    json: JSON.parse(bytes.toString("utf8")),
  };
}

function createSourceRef(source) {
  return {
    path: source.path,
    sha256: source.sha256,
  };
}

async function readCookCache(context, mapId) {
  try {
    return JSON.parse(await readFile(getCookCachePath(context, mapId), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function isCookCacheUsable(context, cookedDir, cache, inputSignature) {
  if (context.args.includes("--force") || !cache || cache.inputSignature !== inputSignature) {
    return false;
  }

  const manifestPath = path.join(cookedDir, cookedMapManifestFile);
  if (!existsSync(manifestPath)) {
    return false;
  }

  const artifacts = Array.isArray(cache.artifacts) ? cache.artifacts : [];
  return artifacts.every((artifactPath) => typeof artifactPath === "string" && existsSync(path.join(context.projectDir, artifactPath)));
}

function createCookInputSignature(mapId, source) {
  return createSha256Hex(Buffer.from(JSON.stringify({
    format: cookedMapFormat,
    version: cookedMapVersion,
    mapId,
    source,
    partition: {
      cellSizePages: cookedWorldPartitionCellSizePages,
      dependencyKinds: cookedWorldPartitionDependencyKinds,
    },
    generatedAssets: {
      objects: cookedObjectCellFormat,
      collision: cookedCollisionCellFormat,
      nav: cookedNavCellFormat,
    },
  }), "utf8"));
}

function createCookedBuildMetadata(inputSignature, contentPackage, cache) {
  return {
    tool: "open-fps-cook-map-assets",
    toolVersion: cookedMapVersion,
    generatedAt: new Date().toISOString(),
    inputSignature,
    previousInputSignature: typeof cache?.inputSignature === "string" ? cache.inputSignature : null,
    packageLayout: contentPackage.layout,
    artifactCount: contentPackage.artifactCount,
  };
}

async function writeCookCache(context, mapId, manifest) {
  const artifacts = Object.values(manifest.package.artifacts)
    .flatMap((artifact) => [artifact.path, artifact.blobPath])
    .sort();
  const cachePath = getCookCachePath(context, mapId);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeJsonFile(cachePath, {
    version: 1,
    format: "open-fps-cook-cache-v1",
    mapId,
    manifestPath: projectRelativePath(path.join(context.projectDir, cookedMapsDirectory, mapId, cookedMapManifestFile), context),
    inputSignature: manifest.build.inputSignature,
    generatedAt: manifest.build.generatedAt,
    packageLayout: manifest.package.layout,
    artifactCount: manifest.package.artifactCount,
    artifacts,
  });
}

async function createCookResult(context, cookedDir, mapId, cacheHit) {
  const outputPath = path.join(cookedDir, cookedMapManifestFile);
  const manifest = JSON.parse(await readFile(outputPath, "utf8"));
  return createCookResultFromManifest(context, outputPath, manifest, cacheHit);
}

function createCookResultFromManifest(context, outputPath, manifest, cacheHit) {
  return {
    mapId: manifest.mapId,
    path: projectRelativePath(outputPath, context),
    cacheHit,
    cellCount: manifest.partition.cells.length,
    artifactCount: manifest.package.artifactCount,
    terrainRegionCount: Object.keys(manifest.assets.terrain.regions).length,
    paintRegionCount: Object.keys(manifest.assets.paint.regions).length,
    vegetationRegionCount: Object.keys(manifest.assets.vegetation.regions).length,
    objectCellCount: Object.keys(manifest.assets.objects.cells).length,
    collisionCellCount: Object.keys(manifest.assets.collision.cells).length,
    navCellCount: Object.keys(manifest.assets.nav.cells).length,
  };
}

function getCookCachePath(context, mapId) {
  return path.join(context.projectDir, cookedBuildCacheDirectory, `${mapId}.json`);
}

function createCookedWorld(world) {
  if (!world || typeof world !== "object") {
    throw new Error("Map manifest must contain world settings before cooking");
  }

  const pageCount = world.sizeMeters / world.pageSizeMeters;
  if (!Number.isInteger(pageCount)) {
    throw new Error("World size must be divisible by page size before cooking");
  }

  const minPage = -Math.floor(pageCount / 2);
  const maxPage = minPage + pageCount - 1;
  return {
    sizeMeters: world.sizeMeters,
    pageSizeMeters: world.pageSizeMeters,
    originX: world.originX,
    originZ: world.originZ,
    pageBounds: {
      minX: minPage,
      maxX: maxPage,
      minZ: minPage,
      maxZ: maxPage,
    },
  };
}

async function createCookedAssets(context, mapId, mapDir, cookedDir, packageBuilder, terrain, paint, vegetation) {
  const layers = await createCookedPaintLayers(context, packageBuilder, paint.layers);
  const models = await createCookedVegetationModels(context, mapDir, cookedDir, packageBuilder, vegetation.models);
  return {
    terrain: {
      manifestPath: mapSourcePath(mapId, terrainHeightPath),
      format: terrain.format,
      sampleFormat: terrain.sampleFormat,
      pageResolution: terrain.pageResolution,
      pageSizeMeters: terrain.pageSizeMeters,
      regionSizePages: terrain.regionSizePages,
      regions: await createCookedRegions(
        context,
        mapDir,
        mapId,
        terrain.regions,
        terrain.regionIntegrity,
        terrainRegionPath,
        packageBuilder,
        "terrain",
      ),
    },
    paint: {
      manifestPath: mapSourcePath(mapId, paintManifestPath),
      format: paint.splatMaps.format,
      resolution: paint.splatMaps.resolution,
      pageResolution: paint.splatMaps.pageResolution,
      pageSizeMeters: paint.splatMaps.pageSizeMeters,
      regionSizePages: paint.splatMaps.regionSizePages,
      indices: paint.splatMaps.indices,
      layers,
      regions: await createCookedRegions(
        context,
        mapDir,
        mapId,
        paint.splatMaps.regions,
        paint.splatMaps.regionIntegrity,
        paintRegionPath,
        packageBuilder,
        "paint",
      ),
    },
    vegetation: {
      manifestPath: mapSourcePath(mapId, vegetationModelsPath),
      format: vegetation.instances.format,
      instanceFormat: vegetation.instances.instanceFormat,
      cellSizeMeters: vegetation.instances.cellSizeMeters,
      regionSizeCells: vegetation.instances.regionSizeCells,
      models,
      modelIds: vegetation.instances.modelIds,
      regions: await createCookedRegions(
        context,
        mapDir,
        mapId,
        vegetation.instances.regions,
        vegetation.instances.regionIntegrity,
        vegetationRegionPath,
        packageBuilder,
        "vegetation",
      ),
    },
  };
}

async function createCookedRegions(context, mapDir, mapId, regions, integrityMap, resolveSourcePath, packageBuilder, label) {
  if (!regions || typeof regions !== "object" || !integrityMap || typeof integrityMap !== "object") {
    throw new Error(`Cannot cook ${label} regions without masks and integrity metadata`);
  }

  const entries = await Promise.all(
    Object.entries(regions)
      .sort(([left], [right]) => compareRegionKeyStrings(left, right))
      .map(async ([key, mask]) => {
        const integrity = integrityMap[key];
        if (!integrity) {
          throw new Error(`Cannot cook ${label} region '${key}' without integrity metadata`);
        }

        const sourcePath = resolveSourcePath(key);
        const cookedPath = mapCookedPath(mapId, sourcePath);
        await packageBuilder.copyFile(path.join(mapDir, sourcePath), cookedPath, `${label}-region`, mapSourcePath(mapId, sourcePath));

        return [key, {
          path: cookedPath,
          mask,
          byteLength: integrity.byteLength,
          sha256: integrity.sha256,
        }];
      }),
  );
  return Object.fromEntries(entries);
}

async function createCookedPaintLayers(context, packageBuilder, layers) {
  const cookedLayers = {};
  for (const [name, layer] of Object.entries(layers ?? {})) {
    cookedLayers[name] = await copyCookedPaintLayerAssets(context, packageBuilder, layer);
  }

  return cookedLayers;
}

async function copyCookedPaintLayerAssets(context, packageBuilder, layer) {
  const nextLayer = { ...layer };
  const textureFields = ["diffuse", "normal", "displacement", "arm", "ao", "roughness", "metallic"];
  await Promise.all(textureFields.map(async (field) => {
    const value = nextLayer[field];
    if (typeof value !== "string" || isExternalAssetPath(value)) {
      return;
    }

    nextLayer[field] = await copyProjectAssetToCooked(context, packageBuilder, value);
  }));

  return nextLayer;
}

async function createCookedVegetationModels(context, mapDir, cookedDir, packageBuilder, models) {
  const cookedModels = {};
  for (const [id, model] of Object.entries(models ?? {})) {
    cookedModels[id] = await copyCookedVegetationModelAssets(context, mapDir, cookedDir, packageBuilder, model);
  }

  return cookedModels;
}

async function copyCookedVegetationModelAssets(context, mapDir, cookedDir, packageBuilder, model) {
  const nextModel = { ...model };
  const modelFields = ["path", "lod1Path", "lod2Path"];
  for (const field of modelFields) {
    const value = nextModel[field];
    if (typeof value !== "string" || isExternalAssetPath(value)) {
      continue;
    }

    nextModel[field] = await copyMapRelativeAssetToCooked(context, mapDir, cookedDir, packageBuilder, value);
  }

  return nextModel;
}

async function copyProjectAssetToCooked(context, packageBuilder, projectRelativeAssetPath) {
  const sourcePath = path.resolve(context.projectDir, projectRelativeAssetPath);
  ensureInsideProject(context, sourcePath, projectRelativeAssetPath);
  const cookedPath = `cooked/${projectRelativePath(sourcePath, context)}`;
  await packageBuilder.copyFile(sourcePath, cookedPath, "terrain-texture", projectRelativeAssetPath);
  return cookedPath;
}

async function copyMapRelativeAssetToCooked(context, mapDir, cookedDir, packageBuilder, mapRelativeAssetPath) {
  const sourcePath = path.resolve(mapDir, mapRelativeAssetPath);
  ensureInsideProject(context, sourcePath, mapRelativeAssetPath);
  const sourceRoot = getCookedAssetCopyRoot(context, sourcePath);
  const cookedRoot = path.join(context.projectDir, "cooked", projectRelativePath(sourceRoot, context));
  await cp(sourceRoot, cookedRoot, { recursive: true, force: true });
  await packageBuilder.addCopiedTree(projectRelativePath(cookedRoot, context), "vegetation-model", sourceRoot);
  const cookedAssetPath = path.join(context.projectDir, "cooked", projectRelativePath(sourcePath, context));
  return path.relative(cookedDir, cookedAssetPath).replaceAll(path.sep, "/");
}

function getCookedAssetCopyRoot(context, sourcePath) {
  const relativePath = projectRelativePath(sourcePath, context);
  const parts = relativePath.split("/");
  if (parts[0] === "assets" && parts[1] === "model" && parts[2]) {
    return path.join(context.projectDir, parts[0], parts[1], parts[2]);
  }

  return sourcePath;
}

function ensureInsideProject(context, filePath, label) {
  const relativePath = path.relative(context.projectDir, filePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Cooked asset '${label}' must stay inside the project directory`);
  }
}

async function createCookedPartitionCellAssets(context, mapId, partition, packageBuilder) {
  const [objects, collision, nav] = await Promise.all([
    createCookedCellAsset(context, mapId, partition, packageBuilder, {
      directory: "objects",
      extension: "objectpack",
      format: cookedObjectCellFormat,
      kind: "world-object-cell",
      payloadKey: "objects",
    }),
    createCookedCellAsset(context, mapId, partition, packageBuilder, {
      directory: "collision",
      extension: "collisionpack",
      format: cookedCollisionCellFormat,
      kind: "world-collision-cell",
      payloadKey: "shapes",
    }),
    createCookedCellAsset(context, mapId, partition, packageBuilder, {
      directory: "nav",
      extension: "navpack",
      format: cookedNavCellFormat,
      kind: "world-nav-cell",
      payloadKey: "nodes",
    }),
  ]);

  return { objects, collision, nav };
}

async function createCookedCellAsset(context, mapId, partition, packageBuilder, options) {
  const cells = await Promise.all(partition.cells.map(async (cell) => {
    const runtimePath = mapCookedPath(mapId, cellPackPath(options.directory, options.extension, cell.key));
    const bytes = Buffer.from(JSON.stringify({
      version: 1,
      format: options.format,
      cell: {
        key: cell.key,
        x: cell.x,
        z: cell.z,
        pageRect: cell.pageRect,
        boundsMeters: cell.boundsMeters,
      },
      [options.payloadKey]: [],
    }) + "\n", "utf8");
    const artifact = await packageBuilder.writeGeneratedFile(runtimePath, bytes, options.kind);
    return [cell.key, {
      path: runtimePath,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
    }];
  }));

  return {
    format: options.format,
    cellSizePages: partition.cellSizePages,
    cellSizeMeters: partition.cellSizeMeters,
    cells: Object.fromEntries(cells.sort(([left], [right]) => compareRegionKeyStrings(left, right))),
  };
}

function attachPartitionCellAssetDependencies(partition, assets) {
  return {
    ...partition,
    cells: partition.cells.map((cell) => ({
      ...cell,
      dependencies: {
        ...cell.dependencies,
        objects: Object.hasOwn(assets.objects.cells, cell.key) ? [cell.key] : [],
        collision: Object.hasOwn(assets.collision.cells, cell.key) ? [cell.key] : [],
        nav: Object.hasOwn(assets.nav.cells, cell.key) ? [cell.key] : [],
      },
    })),
  };
}

function isExternalAssetPath(assetPath) {
  return /^[a-z]+:\/\//i.test(assetPath) || assetPath.startsWith("data:");
}

function createWorldPartition(world, assets) {
  const cellSizePages = cookedWorldPartitionCellSizePages;
  const cellSizeMeters = cellSizePages * world.pageSizeMeters;
  const minCellX = Math.floor(world.pageBounds.minX / cellSizePages);
  const maxCellX = Math.floor(world.pageBounds.maxX / cellSizePages);
  const minCellZ = Math.floor(world.pageBounds.minZ / cellSizePages);
  const maxCellZ = Math.floor(world.pageBounds.maxZ / cellSizePages);
  const cells = [];

  for (let z = minCellZ; z <= maxCellZ; z += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      const pageRect = {
        minX: Math.max(x * cellSizePages, world.pageBounds.minX),
        maxX: Math.min(x * cellSizePages + cellSizePages - 1, world.pageBounds.maxX),
        minZ: Math.max(z * cellSizePages, world.pageBounds.minZ),
        maxZ: Math.min(z * cellSizePages + cellSizePages - 1, world.pageBounds.maxZ),
      };

      cells.push({
        key: `${x},${z}`,
        x,
        z,
        pageRect,
        boundsMeters: pageRectToBoundsMeters(pageRect, world.pageSizeMeters),
        dependencies: createPartitionDependencies(pageRect, world, assets),
      });
    }
  }

  return {
    cellSizePages,
    cellSizeMeters,
    dependencyKinds: cookedWorldPartitionDependencyKinds,
    cells,
  };
}

function createPartitionDependencies(pageRect, world, assets) {
  return {
    terrain: collectPageRegionKeys(pageRect, assets.terrain.regionSizePages, assets.terrain.regions),
    paint: collectPageRegionKeys(pageRect, assets.paint.regionSizePages, assets.paint.regions),
    vegetation: collectVegetationRegionKeys(
      pageRect,
      world.pageSizeMeters,
      assets.vegetation.cellSizeMeters,
      assets.vegetation.regionSizeCells,
      assets.vegetation.regions,
    ),
    objects: [],
    collision: [],
    nav: [],
  };
}

function pageRectToBoundsMeters(pageRect, pageSizeMeters) {
  return {
    minX: pageRect.minX * pageSizeMeters,
    minZ: pageRect.minZ * pageSizeMeters,
    maxX: (pageRect.maxX + 1) * pageSizeMeters,
    maxZ: (pageRect.maxZ + 1) * pageSizeMeters,
  };
}

function collectPageRegionKeys(pageRect, regionSizePages, regions) {
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

  return sortRegionKeys(keys);
}

function collectVegetationRegionKeys(pageRect, pageSizeMeters, cellSizeMeters, regionSizeCells, regions) {
  const cellsPerPage = pageSizeMeters / cellSizeMeters;
  if (!Number.isInteger(cellsPerPage)) {
    throw new Error("Vegetation cell size must divide page size before cooking");
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

  return sortRegionKeys(keys);
}

function mapSourcePath(mapId, relativePath) {
  return `maps/${mapId}/${relativePath}`;
}

function mapCookedPath(mapId, relativePath) {
  return `${cookedMapsDirectory}/${mapId}/${relativePath}`;
}

function cellPackPath(directory, extension, key) {
  const { x, z } = parseRegionKey(key);
  return `${directory}/cells/c_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.${extension}`;
}

function terrainRegionPath(key) {
  const { x, z } = parseRegionKey(key);
  return `terrain/height/regions/r_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.heightpack`;
}

function paintRegionPath(key) {
  const { x, z } = parseRegionKey(key);
  return `paint/regions/r_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.paintpack`;
}

function vegetationRegionPath(key) {
  const { x, z } = parseRegionKey(key);
  return `vegetation/regions/r_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.vegpack`;
}

function parseRegionKey(key) {
  const [x, z] = key.split(",").map((part) => Number(part));
  return { x, z };
}

function compareRegionKeyStrings(left, right) {
  const leftRegion = parseRegionKey(left);
  const rightRegion = parseRegionKey(right);
  return compareRegionCoords(leftRegion, rightRegion);
}

function sortRegionKeys(keys) {
  return Array.from(keys).sort(compareRegionKeyStrings);
}

function formatGridCoordinate(value) {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

function projectRelativePath(filePath, context) {
  return path.relative(context.projectDir, filePath).replaceAll(path.sep, "/");
}
