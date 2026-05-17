import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHeightConfig, generateHeight } from "./height-field.mjs";
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
  const objects = createWorldObjects(preset, heightConfig);
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
    archetypes: createArchetypes(),
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

function createWorldObjects(preset, heightConfig) {
  return [
    ...createPolylineObjects("main-road", "road", "road-dirt-segment", 9, [
      [-1080, -900], [-260, -1080], [760, -760], [1120, -40], [640, 860], [-620, 820], [-1120, -120], [-1080, -900],
    ], preset, heightConfig),
    ...createPolylineObjects("ridge-road", "road", "road-rocky-segment", 6, [
      [-260, -420], [-460, -780], [-650, -1120], [-420, -1380],
    ], preset, heightConfig),
    ...createPolylineObjects("forest-path", "road", "road-forest-path", 5, [
      [260, -140], [700, -260], [1160, -430],
    ], preset, heightConfig),
    ...createPolylineObjects("main-river", "water", "river-segment", 18, [
      [-420, -1510], [-250, -820], [-80, -280], [160, 360], [420, 900], [560, 1460],
    ], preset, heightConfig),
    ...createPolylineObjects("forest-stream", "water", "stream-segment", 7, [
      [930, -900], [650, -520], [320, -120], [120, 260],
    ], preset, heightConfig),
    ...createPointsOfInterest(preset, heightConfig),
    ...createRoadProps(preset, heightConfig),
  ];
}

function createPolylineObjects(prefix, layer, archetype, widthMeters, points, preset, heightConfig) {
  const objects = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [startX, startZ] = points[index];
    const [endX, endZ] = points[index + 1];
    const centerX = (startX + endX) * 0.5;
    const centerZ = (startZ + endZ) * 0.5;
    const lengthMeters = Math.hypot(endX - startX, endZ - startZ);
    const y = generateHeight(centerX, centerZ, preset, heightConfig);
    objects.push({
      id: `${prefix}-${index.toString().padStart(2, "0")}`,
      layer,
      archetype,
      position: { x: round(centerX), y: round(y), z: round(centerZ) },
      rotationY: round(Math.atan2(endX - startX, endZ - startZ)),
      boundsMeters: createBounds(centerX, centerZ, Math.max(widthMeters, lengthMeters * 0.5)),
      spline: {
        widthMeters,
        points: [
          { x: startX, z: startZ },
          { x: endX, z: endZ },
        ],
      },
      tags: layer === "water" ? ["water", "nav-cost", "vegetation-clear"] : ["road", "nav-preferred", "vegetation-clear"],
    });
  }

  return objects;
}

function createPointsOfInterest(preset, heightConfig) {
  const definitions = [
    ["central-camp", "camp", -180, -240, 34, ["spawn-adjacent", "poi", "camp"]],
    ["north-lookout", "lookout-tower", -420, -1320, 28, ["poi", "vista", "ridge"]],
    ["south-bridge", "broken-bridge", 430, 980, 38, ["poi", "bridge", "water-crossing"]],
    ["west-homestead", "abandoned-homestead", -1040, 420, 46, ["poi", "building", "cover"]],
    ["forest-clearing", "forest-clearing", 980, -360, 42, ["poi", "clearing", "encounter-space"]],
  ];

  return definitions.map(([id, archetype, x, z, radiusMeters, tags]) => ({
    id,
    layer: "poi",
    archetype,
    position: { x, y: round(generateHeight(x, z, preset, heightConfig)), z },
    rotationY: 0,
    boundsMeters: createBounds(x, z, radiusMeters),
    radiusMeters,
    tags,
    collision: {
      type: archetype.includes("bridge") ? "box" : "cylinder",
      radiusMeters: Math.max(4, radiusMeters * 0.45),
      heightMeters: archetype.includes("tower") ? 12 : 4,
    },
  }));
}

function createRoadProps(preset, heightConfig) {
  const definitions = [
    ["sign-central-north", "road-sign", -260, -520, 5],
    ["sign-forest", "road-sign", 610, -250, 5],
    ["fence-west-01", "split-rail-fence", -900, 340, 18],
    ["fence-west-02", "split-rail-fence", -980, 500, 18],
    ["camp-crates", "supply-crates", -145, -220, 8],
    ["bridge-planks", "bridge-debris", 390, 930, 12],
  ];

  return definitions.map(([id, archetype, x, z, radiusMeters]) => ({
    id,
    layer: "prop",
    archetype,
    position: { x, y: round(generateHeight(x, z, preset, heightConfig)), z },
    rotationY: 0,
    boundsMeters: createBounds(x, z, radiusMeters),
    radiusMeters,
    tags: ["prop", "collision"],
    collision: {
      type: "box",
      radiusMeters,
      heightMeters: 2,
    },
  }));
}

function createArchetypes() {
  return {
    "road-dirt-segment": { layer: "road", navCost: 0.45, clearsVegetation: true },
    "road-rocky-segment": { layer: "road", navCost: 0.65, clearsVegetation: true },
    "road-forest-path": { layer: "road", navCost: 0.55, clearsVegetation: true },
    "river-segment": { layer: "water", navCost: 3.5, clearsVegetation: true },
    "stream-segment": { layer: "water", navCost: 2.5, clearsVegetation: true },
    camp: { layer: "poi", navCost: 0.8, collision: true },
    "lookout-tower": { layer: "poi", navCost: 1.1, collision: true },
    "broken-bridge": { layer: "poi", navCost: 1.4, collision: true },
    "abandoned-homestead": { layer: "poi", navCost: 1.0, collision: true },
    "forest-clearing": { layer: "poi", navCost: 0.7, collision: false },
    "road-sign": { layer: "prop", collision: true },
    "split-rail-fence": { layer: "prop", collision: true },
    "supply-crates": { layer: "prop", collision: true },
    "bridge-debris": { layer: "prop", collision: true },
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

function createBounds(x, z, radiusMeters) {
  return {
    minX: round(x - radiusMeters),
    minZ: round(z - radiusMeters),
    maxX: round(x + radiusMeters),
    maxZ: round(z + radiusMeters),
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
