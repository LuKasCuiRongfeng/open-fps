import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHeightConfig, generateHeight } from "./height-field.mjs";
import { createSemanticArchetypes, createSemanticWorldObjects } from "./world-semantics.mjs";
import {
  cookedWorldPartitionCellSizePages,
  createRegionIntegrity,
  ensureMapManifestPaths,
  formatGridCoordinate,
  getMapDir,
  getPageBounds,
  pageSizeMeters,
  worldObjectCellFormat,
  worldObjectCellsDirectory,
  worldObjectManifestFormat,
  worldObjectManifestVersion,
  worldObjectsPath,
  writeJsonFile,
} from "./shared.mjs";

export async function generateWorldObjectAssets(context, preset) {
  const mapDir = getMapDir(context, preset);
  const objectDir = path.join(mapDir, "objects");
  await ensureMapManifestPaths(context, preset, { objectsPath: worldObjectsPath });
  await rm(objectDir, { recursive: true, force: true });
  await mkdir(path.join(objectDir, "cells"), { recursive: true });

  const pageBounds = getPageBounds(preset);
  const heightConfig = buildHeightConfig(preset);
  const partitionCells = createPartitionCells(pageBounds);
  const objects = createSemanticWorldObjects((x, z) => generateHeight(x, z, preset, heightConfig));
  const objectsByCell = new Map(partitionCells.map((cell) => [cell.key, []]));

  for (const object of objects) {
    const cellKey = cellKeyForMeters(object.position.x, object.position.z);
    const bucket = objectsByCell.get(cellKey);
    if (bucket) {
      bucket.push(object);
    }
  }

  const manifest = {
    version: worldObjectManifestVersion,
    format: worldObjectManifestFormat,
    cellFormat: worldObjectCellFormat,
    cellSizePages: cookedWorldPartitionCellSizePages,
    cellSizeMeters: cookedWorldPartitionCellSizePages * pageSizeMeters,
    cellsDirectory: worldObjectCellsDirectory,
    designSource: "OPEN_WORLD_DESIGN_SPEC.md",
    archetypes: createSemanticArchetypes(),
    cells: {},
  };

  let objectCount = 0;
  for (const cell of partitionCells) {
    const cellObjects = (objectsByCell.get(cell.key) ?? []).sort((left, right) => left.id.localeCompare(right.id));
    objectCount += cellObjects.length;
    const pack = {
      version: 1,
      format: worldObjectCellFormat,
      cell,
      objects: cellObjects,
    };
    const bytes = Buffer.from(`${JSON.stringify(pack, null, 2)}\n`, "utf8");
    const objectPath = cellPackPath(cell.key);
    await writeFile(path.join(mapDir, objectPath), bytes);
    manifest.cells[cell.key] = {
      path: objectPath,
      objectCount: cellObjects.length,
      ...createRegionIntegrity(bytes),
    };
  }

  await writeJsonFile(path.join(mapDir, worldObjectsPath), manifest);

  return {
    id: preset.id,
    name: preset.name,
    objectCount,
    cellCount: partitionCells.length,
  };
}

function createPartitionCells(pageBounds) {
  const minCellX = Math.floor(pageBounds.minPageX / cookedWorldPartitionCellSizePages);
  const maxCellX = Math.floor(pageBounds.maxPageX / cookedWorldPartitionCellSizePages);
  const minCellZ = Math.floor(pageBounds.minPageZ / cookedWorldPartitionCellSizePages);
  const maxCellZ = Math.floor(pageBounds.maxPageZ / cookedWorldPartitionCellSizePages);
  const cells = [];

  for (let z = minCellZ; z <= maxCellZ; z += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      const pageRect = {
        minX: Math.max(x * cookedWorldPartitionCellSizePages, pageBounds.minPageX),
        maxX: Math.min(x * cookedWorldPartitionCellSizePages + cookedWorldPartitionCellSizePages - 1, pageBounds.maxPageX),
        minZ: Math.max(z * cookedWorldPartitionCellSizePages, pageBounds.minPageZ),
        maxZ: Math.min(z * cookedWorldPartitionCellSizePages + cookedWorldPartitionCellSizePages - 1, pageBounds.maxPageZ),
      };
      cells.push({
        key: `${x},${z}`,
        x,
        z,
        pageRect,
        boundsMeters: {
          minX: pageRect.minX * pageSizeMeters,
          minZ: pageRect.minZ * pageSizeMeters,
          maxX: (pageRect.maxX + 1) * pageSizeMeters,
          maxZ: (pageRect.maxZ + 1) * pageSizeMeters,
        },
      });
    }
  }

  return cells;
}

function cellKeyForMeters(xMeters, zMeters) {
  const cellSizeMeters = cookedWorldPartitionCellSizePages * pageSizeMeters;
  return `${Math.floor(xMeters / cellSizeMeters)},${Math.floor(zMeters / cellSizeMeters)}`;
}

function cellPackPath(key) {
  const [x, z] = key.split(",").map(Number);
  return `${worldObjectCellsDirectory}/c_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.objectpack`;
}
