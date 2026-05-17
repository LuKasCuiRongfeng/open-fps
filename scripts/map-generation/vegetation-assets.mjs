import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHeightConfig, generateHeight } from "./height-field.mjs";
import {
  compareRegionCoords,
  ensureMapManifestPaths,
  formatGridCoordinate,
  getMapDir,
  hash2i,
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
  const instances = createPreviewVegetationInstances(preset, heightConfig);
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
  const sortedRegions = Array.from(groupedRegions.values()).sort(compareRegionCoords);
  for (const region of sortedRegions) {
    region.cells.sort((left, right) => left.localIndex - right.localIndex);
    let mask = 0n;
    for (const cell of region.cells) {
      mask |= 1n << BigInt(cell.localIndex);
    }

    await writeFile(
      path.join(mapDir, vegetationRegionPath(region.x, region.z)),
      encodeVegetationRegionPack(region.cells),
    );
    regionMasks[vegetationRegionKey(region.x, region.z)] = formatVegetationRegionMask(mask);
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

function createPreviewVegetationInstances(preset, heightConfig) {
  const treePoints = [
    [-220, -140], [-170, -70], [-120, 95], [-65, -180], [-30, 145], [38, -120],
    [85, 58], [140, -35], [190, 125], [235, -160], [-255, 90], [265, 40],
  ];
  const instances = [];

  for (let index = 0; index < treePoints.length; index += 1) {
    const [worldX, worldZ] = treePoints[index];
    instances.push({
      id: `tree-${index}`,
      modelId: "quiverTree",
      x: worldX,
      y: generateHeight(worldX, worldZ, preset, heightConfig),
      z: worldZ,
      rotationY: hash2i(index, 17, 9201, preset.seed) * Math.PI * 2,
      scale: 0.85 + hash2i(index, 29, 9202, preset.seed) * 0.55,
    });
  }

  let fernIndex = 0;
  for (const [baseX, baseZ] of treePoints.slice(0, 9)) {
    for (let ringIndex = 0; ringIndex < 5; ringIndex += 1) {
      const angle = hash2i(fernIndex, 41, 9301, preset.seed) * Math.PI * 2;
      const radius = 9 + hash2i(fernIndex, 53, 9302, preset.seed) * 24;
      const worldX = baseX + Math.cos(angle) * radius;
      const worldZ = baseZ + Math.sin(angle) * radius;
      instances.push({
        id: `fern-${fernIndex}`,
        modelId: "fern",
        x: worldX,
        y: generateHeight(worldX, worldZ, preset, heightConfig),
        z: worldZ,
        rotationY: angle + Math.PI * 0.5,
        scale: 0.55 + hash2i(fernIndex, 67, 9303, preset.seed) * 0.7,
      });
      fernIndex += 1;
    }
  }

  return instances;
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

