import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHeightConfig, generateHeight } from "./height-field.mjs";
import {
  createSemanticWorldObjects,
  estimateSlopeDegrees,
  sampleWorldSemantics,
  smoothstep,
} from "./world-semantics.mjs";
import {
  clamp,
  compareRegionCoords,
  createRegionIntegrity,
  ensureMapManifestPaths,
  formatGridCoordinate,
  getMapDir,
  getPageBounds,
  hash2i,
  pageSizeMeters,
  vegetationCellSizeMeters,
  vegetationInstanceFormat,
  vegetationInstanceRecordByteLength,
  vegetationModelsPath,
  vegetationRegionFormat,
  vegetationRegionPackEntryByteLength,
  vegetationRegionPackHeaderByteLength,
  vegetationRegionPackMagic,
  vegetationRegionPackVersion,
  vegetationRegionSizeCells,
  vegetationRegionsDirectory,
} from "./shared.mjs";

export async function generateVegetationAssets(context, preset) {
  const mapDir = getMapDir(context, preset);
  const vegetationDir = path.join(mapDir, "vegetation");
  await ensureMapManifestPaths(context, preset, { vegetationPath: vegetationModelsPath });
  await rm(vegetationDir, { recursive: true, force: true });
  await mkdir(path.join(vegetationDir, "regions"), { recursive: true });

  const heightConfig = buildHeightConfig(preset);
  const models = createPreviewVegetationModels();
  const modelIds = ["fern", "quiverTree"];
  const heightAt = (x, z) => generateHeight(x, z, preset, heightConfig);
  const semanticObjects = createSemanticWorldObjects(heightAt);
  const instances = createPreviewVegetationInstances(preset, heightAt, semanticObjects);
  const groupedCells = new Map();

  for (const instance of instances) {
    const cellX = Math.floor(instance.x / vegetationCellSizeMeters);
    const cellZ = Math.floor(instance.z / vegetationCellSizeMeters);
    const key = vegetationCellKey(cellX, cellZ);
    const group = groupedCells.get(key) ?? { cellX, cellZ, instances: [] };
    group.instances.push(instance);
    groupedCells.set(key, group);
  }

  const sortedCells = Array.from(groupedCells.values()).sort((left, right) => left.cellZ - right.cellZ || left.cellX - right.cellX);
  const groupedRegions = new Map();
  for (const cell of sortedCells) {
    const region = vegetationRegionCoordsForCell(cell.cellX, cell.cellZ);
    const key = vegetationRegionKey(region.x, region.z);
    const group = groupedRegions.get(key) ?? { x: region.x, z: region.z, cells: [] };
    group.cells.push({
      key: vegetationCellKey(cell.cellX, cell.cellZ),
      localIndex: vegetationRegionLocalCellIndex(cell.cellX, cell.cellZ),
      bytes: encodeVegetationInstances(cell.instances, modelIds),
    });
    groupedRegions.set(key, group);
  }

  const regionMasks = {};
  const regionIntegrity = {};
  const sortedRegions = Array.from(groupedRegions.values()).sort(compareRegionCoords);
  for (const region of sortedRegions) {
    region.cells.sort((left, right) => left.localIndex - right.localIndex);
    let mask = 0n;
    for (const cell of region.cells) {
      mask |= 1n << BigInt(cell.localIndex);
    }

    const regionBytes = encodeVegetationRegionPack(region.cells);
    const regionKey = vegetationRegionKey(region.x, region.z);
    await writeFile(path.join(mapDir, vegetationRegionPath(region.x, region.z)), regionBytes);
    regionMasks[regionKey] = formatVegetationRegionMask(mask);
    regionIntegrity[regionKey] = createRegionIntegrity(regionBytes);
  }

  const manifest = {
    version: 5,
    models,
    instances: {
      format: vegetationRegionFormat,
      instanceFormat: vegetationInstanceFormat,
      cellSizeMeters: vegetationCellSizeMeters,
      regionSizeCells: vegetationRegionSizeCells,
      regionsDirectory: vegetationRegionsDirectory,
      regions: regionMasks,
      regionIntegrity,
      modelIds,
    },
  };
  await writeFile(path.join(vegetationDir, "models.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    id: preset.id,
    name: preset.name,
    modelCount: Object.keys(models).length,
    instanceCount: instances.length,
    cellCount: sortedCells.length,
    regionCount: sortedRegions.length,
  };
}

function createPreviewVegetationModels() {
  return {
    quiverTree: {
      id: "quiverTree",
      name: "Quiver Tree",
      path: "../../assets/model/quiver_tree_02_1k.gltf/quiver_tree_02_1k.gltf",
      lod1Path: "../../assets/model/quiver_tree_02_1k.gltf/lod1/quiver_tree_02_lod1.gltf",
      lod1DistanceMeters: 70,
      lod2Path: "../../assets/model/quiver_tree_02_1k.gltf/lod2/quiver_tree_02_lod2.gltf",
      lod2DistanceMeters: 135,
      targetHeightMeters: 7.5,
      baseScale: 1.2,
      castShadow: true,
      receiveShadow: true,
      maxVisibleDistanceMeters: 260,
      shadowDistanceMeters: 70,
    },
    fern: {
      id: "fern",
      name: "Fern",
      path: "../../assets/model/fern_02_1k.gltf/fern_02_1k.gltf",
      lod1Path: "../../assets/model/fern_02_1k.gltf/lod1/fern_02_lod1.gltf",
      lod1DistanceMeters: 35,
      lod2Path: "../../assets/model/fern_02_1k.gltf/lod2/fern_02_lod2.gltf",
      lod2DistanceMeters: 75,
      targetHeightMeters: 0.9,
      baseScale: 0.85,
      castShadow: true,
      receiveShadow: true,
      maxVisibleDistanceMeters: 120,
      shadowDistanceMeters: 35,
    },
  };
}

function createPreviewVegetationInstances(preset, heightAt, semanticObjects) {
  const instances = [];
  const trees = [];
  const pageBounds = getPageBounds(preset);
  const minX = pageBounds.minPageX * pageSizeMeters;
  const maxX = (pageBounds.maxPageX + 1) * pageSizeMeters;
  const minZ = pageBounds.minPageZ * pageSizeMeters;
  const maxZ = (pageBounds.maxPageZ + 1) * pageSizeMeters;
  const spacing = 86;
  let treeIndex = 0;

  for (let z = minZ + spacing * 0.5; z < maxZ; z += spacing) {
    for (let x = minX + spacing * 0.5; x < maxX; x += spacing) {
      const gridX = Math.floor((x - minX) / spacing);
      const gridZ = Math.floor((z - minZ) / spacing);
      const jitterX = (hash2i(gridX, gridZ, 9101, preset.seed) - 0.5) * spacing * 0.62;
      const jitterZ = (hash2i(gridX, gridZ, 9102, preset.seed) - 0.5) * spacing * 0.62;
      const worldX = x + jitterX;
      const worldZ = z + jitterZ;
      const height = heightAt(worldX, worldZ);
      const slope = estimateSlopeDegrees(worldX, worldZ, heightAt, 10);
      const semantics = sampleWorldSemantics(worldX, worldZ, semanticObjects);
      const density = resolveTreeDensity(height, slope, semantics, worldX, worldZ, preset.seed);
      if (hash2i(gridX, gridZ, 9103, preset.seed) > density) {
        continue;
      }

      const tree = {
        id: `tree-${treeIndex}`,
        modelId: "quiverTree",
        x: round(worldX),
        y: round(height),
        z: round(worldZ),
        rotationY: hash2i(gridX, gridZ, 9201, preset.seed) * Math.PI * 2,
        scale: round(0.82 + hash2i(gridX, gridZ, 9202, preset.seed) * 0.62),
      };
      instances.push(tree);
      trees.push(tree);
      treeIndex += 1;
    }
  }

  let fernIndex = 0;
  for (const tree of trees) {
    if (fernIndex > 780) {
      break;
    }

    const ringCount = 2 + Math.floor(hash2i(Math.floor(tree.x), Math.floor(tree.z), 9300, preset.seed) * 4);
    for (let ringIndex = 0; ringIndex < 5; ringIndex += 1) {
      if (ringIndex >= ringCount) {
        continue;
      }

      const angle = hash2i(fernIndex, ringIndex, 9301, preset.seed) * Math.PI * 2;
      const radius = 8 + hash2i(fernIndex, ringIndex, 9302, preset.seed) * 28;
      const worldX = tree.x + Math.cos(angle) * radius;
      const worldZ = tree.z + Math.sin(angle) * radius;
      const height = heightAt(worldX, worldZ);
      const slope = estimateSlopeDegrees(worldX, worldZ, heightAt, 6);
      const semantics = sampleWorldSemantics(worldX, worldZ, semanticObjects);
      if (resolveFernDensity(height, slope, semantics) < hash2i(fernIndex, ringIndex, 9304, preset.seed)) {
        continue;
      }

      instances.push({
        id: `fern-${fernIndex}`,
        modelId: "fern",
        x: round(worldX),
        y: round(height),
        z: round(worldZ),
        rotationY: angle + Math.PI * 0.5,
        scale: round(0.55 + hash2i(fernIndex, ringIndex, 9303, preset.seed) * 0.7),
      });
      fernIndex += 1;
    }
  }

  return instances;
}

function resolveTreeDensity(height, slopeDegrees, semantics, worldX, worldZ, seed) {
  const tooSteep = smoothstep(28, 42, slopeDegrees);
  const snowline = smoothstep(132, 182, height);
  const lowWetEdge = semantics.waterBank * (1 - semantics.waterCore) * 0.22;
  const roadPenalty = semantics.roadShoulder * 0.55 + semantics.roadCore;
  const clearPenalty = semantics.vegetationClearance * 1.15;
  const basinNoise = Math.sin((worldX + seed * 0.01) * 0.004) * Math.cos((worldZ - seed * 0.02) * 0.005) * 0.5 + 0.5;
  return clamp(0.18 + basinNoise * 0.32 + lowWetEdge - tooSteep * 0.65 - snowline * 0.65 - roadPenalty - clearPenalty, 0, 0.82);
}

function resolveFernDensity(height, slopeDegrees, semantics) {
  const wetBank = semantics.waterBank * (1 - semantics.waterCore);
  const clearPenalty = Math.max(semantics.vegetationClearance, semantics.roadShoulder * 0.75);
  return clamp(0.46 + wetBank * 0.35 - smoothstep(24, 38, slopeDegrees) * 0.55 - smoothstep(116, 166, height) * 0.35 - clearPenalty, 0, 0.9);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function vegetationCellKey(cellX, cellZ) {
  return `${cellX},${cellZ}`;
}

function vegetationRegionKey(regionX, regionZ) {
  return `${regionX},${regionZ}`;
}

function vegetationRegionCoordsForCell(cellX, cellZ) {
  return {
    x: Math.floor(cellX / vegetationRegionSizeCells),
    z: Math.floor(cellZ / vegetationRegionSizeCells),
  };
}

function vegetationRegionLocalCellIndex(cellX, cellZ) {
  const region = vegetationRegionCoordsForCell(cellX, cellZ);
  const localX = cellX - region.x * vegetationRegionSizeCells;
  const localZ = cellZ - region.z * vegetationRegionSizeCells;
  return localZ * vegetationRegionSizeCells + localX;
}

function vegetationRegionPath(regionX, regionZ) {
  return `${vegetationRegionsDirectory}/r_${formatGridCoordinate(regionX)}_${formatGridCoordinate(regionZ)}.vegpack`;
}

function formatVegetationRegionMask(mask) {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}

function encodeVegetationInstances(instances, modelIds) {
  const bytes = Buffer.alloc(instances.length * vegetationInstanceRecordByteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    const modelIndex = modelIds.indexOf(instance.modelId);
    if (modelIndex < 0) {
      throw new Error(`Vegetation instance '${instance.id}' references unknown model '${instance.modelId}'`);
    }

    const offset = index * vegetationInstanceRecordByteLength;
    view.setUint16(offset, modelIndex, true);
    view.setUint16(offset + 2, 0, true);
    view.setFloat32(offset + 4, instance.x, true);
    view.setFloat32(offset + 8, instance.y, true);
    view.setFloat32(offset + 12, instance.z, true);
    view.setFloat32(offset + 16, instance.rotationY, true);
    view.setFloat32(offset + 20, instance.scale, true);
  }

  return bytes;
}

function encodeVegetationRegionPack(cells) {
  const payloadByteLength = cells.reduce((total, cell) => total + cell.bytes.byteLength, 0);
  const indexByteLength = vegetationRegionPackHeaderByteLength + cells.length * vegetationRegionPackEntryByteLength;
  const bytes = Buffer.alloc(indexByteLength + payloadByteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(0, vegetationRegionPackMagic, true);
  view.setUint16(4, vegetationRegionPackVersion, true);
  view.setUint16(6, cells.length, true);

  let payloadOffset = indexByteLength;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (cell.bytes.byteLength % vegetationInstanceRecordByteLength !== 0) {
      throw new Error(`Vegetation cell '${cell.key}' has invalid byte length ${cell.bytes.byteLength}`);
    }

    const entryOffset = vegetationRegionPackHeaderByteLength + index * vegetationRegionPackEntryByteLength;
    view.setUint16(entryOffset, cell.localIndex, true);
    view.setUint16(entryOffset + 2, 0, true);
    view.setUint32(entryOffset + 4, cell.bytes.byteLength / vegetationInstanceRecordByteLength, true);
    bytes.set(cell.bytes, payloadOffset);
    payloadOffset += cell.bytes.byteLength;
  }

  return bytes;
}

