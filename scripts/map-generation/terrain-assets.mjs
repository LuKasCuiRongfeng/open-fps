import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHeightConfig, createHeightPage } from "./height-field.mjs";
import {
  compareRegionCoords,
  createRegionIntegrity,
  formatGridCoordinate,
  getMapDir,
  getMapPath,
  getPageBounds,
  heightPageResolution,
  heightRegionFormat,
  heightRegionSizePages,
  heightRegionsDirectory,
  heightSampleFormat,
  mapVersion,
  pageSizeMeters,
  paintManifestPath,
  readMapManifest,
  terrainHeightManifestVersion,
  terrainHeightPath,
  vegetationModelsPath,
  worldObjectsPath,
  writeJsonFile,
} from "./shared.mjs";

export async function generateTerrainAssets(context, preset) {
  const now = Date.now();
  const mapDir = getMapDir(context, preset);
  const mapPath = getMapPath(context, preset);
  const heightRootDir = path.join(mapDir, "terrain", "height");
  const heightConfig = buildHeightConfig(preset);
  const bounds = getPageBounds(preset);
  const pageKeys = [];
  const regionGroups = new Map();
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  await Promise.all([
    rm(path.join(mapDir, "terrain", "chunks"), { recursive: true, force: true }),
    rm(heightRootDir, { recursive: true, force: true }),
  ]);

  for (let pz = bounds.minPageZ; pz <= bounds.maxPageZ; pz += 1) {
    for (let px = bounds.minPageX; px <= bounds.maxPageX; px += 1) {
      const heights = createHeightPage(px, pz, preset, heightConfig);
      for (const value of heights) {
        minHeight = Math.min(minHeight, value);
        maxHeight = Math.max(maxHeight, value);
      }

      const key = `${px},${pz}`;
      const region = heightRegionCoordsForPage(px, pz);
      const regionKey = heightRegionKey(region.x, region.z);
      const group = regionGroups.get(regionKey) ?? { x: region.x, z: region.z, pages: [] };
      group.pages.push({ key, px, pz, bytes: Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength) });
      regionGroups.set(regionKey, group);
      pageKeys.push(key);
    }
  }

  const terrainHeightManifest = {
    version: terrainHeightManifestVersion,
    format: heightRegionFormat,
    sampleFormat: heightSampleFormat,
    pageResolution: heightPageResolution,
    pageSizeMeters,
    regionSizePages: heightRegionSizePages,
    regionsDirectory: heightRegionsDirectory,
    regions: {},
    regionIntegrity: {},
  };

  for (const region of Array.from(regionGroups.values()).sort(compareRegionCoords)) {
    const pages = region.pages.sort(comparePageKeys);
    const packBytes = Buffer.concat(pages.map((page) => page.bytes));
    let regionMask = 0n;
    for (const page of pages) {
      regionMask |= 1n << BigInt(heightRegionLocalPageIndex(page.px, page.pz));
    }

    const regionFilePath = path.join(mapDir, heightRegionPathFor(region.x, region.z));
    await mkdir(path.dirname(regionFilePath), { recursive: true });
    await writeFile(regionFilePath, packBytes);
    terrainHeightManifest.regions[heightRegionKey(region.x, region.z)] = formatHeightRegionMask(regionMask);
    terrainHeightManifest.regionIntegrity[heightRegionKey(region.x, region.z)] = createRegionIntegrity(packBytes);
  }

  const existingMap = await readMapManifest(context, preset);
  const pageCountX = bounds.maxPageX - bounds.minPageX + 1;
  const pageCountZ = bounds.maxPageZ - bounds.minPageZ + 1;
  const worldSizeMeters = Math.max(pageCountX, pageCountZ) * pageSizeMeters;
  const mapData = {
    version: mapVersion,
    seed: preset.seed,
    world: {
      sizeMeters: worldSizeMeters,
      pageSizeMeters,
      originX: 0,
      originZ: 0,
    },
    terrainPath: terrainHeightPath,
    paintPath: existingMap?.paintPath ?? paintManifestPath,
    vegetationPath: existingMap?.vegetationPath ?? vegetationModelsPath,
    objectsPath: existingMap?.objectsPath ?? worldObjectsPath,
    metadata: {
      name: preset.name,
      created: existingMap?.metadata?.created ?? now,
      modified: now,
    },
  };

  await mkdir(mapDir, { recursive: true });
  await mkdir(path.dirname(path.join(mapDir, terrainHeightPath)), { recursive: true });
  await writeJsonFile(mapPath, mapData);
  await writeJsonFile(path.join(mapDir, terrainHeightPath), terrainHeightManifest);

  return {
    id: preset.id,
    name: preset.name,
    mapPath,
    minHeight,
    maxHeight,
    pageCount: pageKeys.length,
    regionCount: Object.keys(terrainHeightManifest.regions).length,
    areaSquareKilometers: pageKeys.length * pageSizeMeters * pageSizeMeters / 1_000_000,
  };
}

function heightRegionKey(rx, rz) {
  return `${rx},${rz}`;
}

function heightRegionPathFor(rx, rz) {
  return `${heightRegionsDirectory}/r_${formatGridCoordinate(rx)}_${formatGridCoordinate(rz)}.heightpack`;
}

function heightRegionCoordsForPage(px, pz) {
  return {
    x: Math.floor(px / heightRegionSizePages),
    z: Math.floor(pz / heightRegionSizePages),
  };
}

function comparePageKeys(left, right) {
  return heightRegionLocalPageIndex(left.px, left.pz) - heightRegionLocalPageIndex(right.px, right.pz);
}

function heightRegionLocalPageIndex(px, pz) {
  const region = heightRegionCoordsForPage(px, pz);
  const localX = px - region.x * heightRegionSizePages;
  const localZ = pz - region.z * heightRegionSizePages;
  return localZ * heightRegionSizePages + localX;
}

function formatHeightRegionMask(mask) {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}
