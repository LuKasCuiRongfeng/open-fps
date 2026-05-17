import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  compareRegionCoords,
  cookedMapFormat,
  cookedMapManifestFile,
  cookedMapsDirectory,
  cookedMapVersion,
  cookedWorldPartitionCellSizePages,
  createSha256Hex,
  getMapDir,
  getMapPath,
  paintManifestPath,
  terrainHeightPath,
  vegetationModelsPath,
  writeJsonFile,
} from "./shared.mjs";

export async function generateCookedMapAssets(context, preset) {
  const mapId = preset.id;
  const mapDir = getMapDir(context, preset);
  const cookedDir = path.join(context.projectDir, cookedMapsDirectory, mapId);
  await mkdir(cookedDir, { recursive: true });

  const projectSource = await readSourceJson(context.projectPath, context);
  const mapSource = await readSourceJson(getMapPath(context, preset), context);
  const terrainSource = await readSourceJson(path.join(mapDir, terrainHeightPath), context);
  const paintSource = await readSourceJson(path.join(mapDir, paintManifestPath), context);
  const vegetationSource = await readSourceJson(path.join(mapDir, vegetationModelsPath), context);
  const world = createCookedWorld(mapSource.json.world);
  const assets = createCookedAssets(mapId, terrainSource.json, paintSource.json, vegetationSource.json);
  const partition = createWorldPartition(world, assets);

  const manifest = {
    version: cookedMapVersion,
    format: cookedMapFormat,
    mapId,
    source: {
      project: createSourceRef(projectSource),
      map: createSourceRef(mapSource),
      terrain: createSourceRef(terrainSource),
      paint: createSourceRef(paintSource),
      vegetation: createSourceRef(vegetationSource),
    },
    world,
    assets,
    partition,
  };

  const outputPath = path.join(cookedDir, cookedMapManifestFile);
  await writeJsonFile(outputPath, manifest);

  return {
    mapId,
    path: projectRelativePath(outputPath, context),
    cellCount: partition.cells.length,
    terrainRegionCount: Object.keys(assets.terrain.regions).length,
    paintRegionCount: Object.keys(assets.paint.regions).length,
    vegetationRegionCount: Object.keys(assets.vegetation.regions).length,
  };
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

function createCookedAssets(mapId, terrain, paint, vegetation) {
  return {
    terrain: {
      manifestPath: mapSourcePath(mapId, terrainHeightPath),
      format: terrain.format,
      sampleFormat: terrain.sampleFormat,
      pageResolution: terrain.pageResolution,
      pageSizeMeters: terrain.pageSizeMeters,
      regionSizePages: terrain.regionSizePages,
      regions: createCookedRegions(
        terrain.regions,
        terrain.regionIntegrity,
        (key) => mapSourcePath(mapId, terrainRegionPath(key)),
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
      layers: paint.layers,
      regions: createCookedRegions(
        paint.splatMaps.regions,
        paint.splatMaps.regionIntegrity,
        (key) => mapSourcePath(mapId, paintRegionPath(key)),
        "paint",
      ),
    },
    vegetation: {
      manifestPath: mapSourcePath(mapId, vegetationModelsPath),
      format: vegetation.instances.format,
      instanceFormat: vegetation.instances.instanceFormat,
      cellSizeMeters: vegetation.instances.cellSizeMeters,
      regionSizeCells: vegetation.instances.regionSizeCells,
      models: vegetation.models,
      modelIds: vegetation.instances.modelIds,
      regions: createCookedRegions(
        vegetation.instances.regions,
        vegetation.instances.regionIntegrity,
        (key) => mapSourcePath(mapId, vegetationRegionPath(key)),
        "vegetation",
      ),
    },
  };
}

function createCookedRegions(regions, integrityMap, resolvePath, label) {
  if (!regions || typeof regions !== "object" || !integrityMap || typeof integrityMap !== "object") {
    throw new Error(`Cannot cook ${label} regions without masks and integrity metadata`);
  }

  return Object.fromEntries(
    Object.entries(regions)
      .sort(([left], [right]) => compareRegionKeyStrings(left, right))
      .map(([key, mask]) => {
        const integrity = integrityMap[key];
        if (!integrity) {
          throw new Error(`Cannot cook ${label} region '${key}' without integrity metadata`);
        }

        return [key, {
          path: resolvePath(key),
          mask,
          byteLength: integrity.byteLength,
          sha256: integrity.sha256,
        }];
      }),
  );
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
        terrainRegions: collectPageRegionKeys(pageRect, assets.terrain.regionSizePages, assets.terrain.regions),
        paintRegions: collectPageRegionKeys(pageRect, assets.paint.regionSizePages, assets.paint.regions),
        vegetationRegions: collectVegetationRegionKeys(
          pageRect,
          world.pageSizeMeters,
          assets.vegetation.cellSizeMeters,
          assets.vegetation.regionSizeCells,
          assets.vegetation.regions,
        ),
      });
    }
  }

  return {
    cellSizePages,
    cellSizeMeters,
    cells,
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
