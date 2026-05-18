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
  createRegionIntegrity,
  ensureMapManifestPaths,
  formatGridCoordinate,
  getMapDir,
  getPageBounds,
  paintManifestPath,
  paintPageResolution,
  paintRegionFormat,
  paintRegionsDirectory,
  paintRegionSizePages,
  pageSizeMeters,
} from "./shared.mjs";
import { createTerrainPaintLayers, readAssetRegistry } from "./asset-registry.mjs";

export async function generatePaintAssets(context, preset) {
  const mapDir = getMapDir(context, preset);
  const paintDir = path.join(mapDir, "paint");
  await ensureMapManifestPaths(context, preset, { paintPath: paintManifestPath });
  await rm(paintDir, { recursive: true, force: true });
  await mkdir(path.join(paintDir, "regions"), { recursive: true });

  const pageBounds = getPageBounds(preset);
  const pageCountX = pageBounds.maxPageX - pageBounds.minPageX + 1;
  const pageCountZ = pageBounds.maxPageZ - pageBounds.minPageZ + 1;
  if (pageCountX !== pageCountZ) {
    throw new Error(`Paint generation requires a square page grid, got ${pageCountX}x${pageCountZ}`);
  }
  const splatResolution = pageCountX * paintPageResolution;
  const heightConfig = buildHeightConfig(preset);
  const heightAt = (x, z) => generateHeight(x, z, preset, heightConfig);
  const semanticObjects = createSemanticWorldObjects(heightAt);
  const assetRegistry = await readAssetRegistry(context);
  const layers = createTerrainPaintLayers(assetRegistry);
  const manifest = {
    version: 2,
    layers,
    splatMaps: {
      format: paintRegionFormat,
      resolution: splatResolution,
      pageResolution: paintPageResolution,
      pageSizeMeters: 64,
      regionSizePages: paintRegionSizePages,
      regionsDirectory: paintRegionsDirectory,
      indices: [0],
      regions: createPaintRegionMasks(pageBounds),
      regionIntegrity: {},
    },
  };

  const pixels = createSemanticPaintPixels(pageBounds, splatResolution, preset, heightAt, semanticObjects);

  const regionByteLength = await writePaintRegionPacks(paintDir, pageBounds, pixels, splatResolution, manifest);
  await writeFile(path.join(paintDir, "layers.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    id: preset.id,
    name: preset.name,
    layerCount: Object.keys(layers).length,
    regionCount: Object.keys(manifest.splatMaps.regions).length,
    splatByteLength: regionByteLength,
  };
}

function createSemanticPaintPixels(pageBounds, splatResolution, preset, heightAt, semanticObjects) {
  const pixels = Buffer.alloc(splatResolution * splatResolution * 4);
  const metersPerPixel = pageSizeMeters / paintPageResolution;
  const minX = pageBounds.minPageX * pageSizeMeters;
  const minZ = pageBounds.minPageZ * pageSizeMeters;

  for (let z = 0; z < splatResolution; z += 1) {
    for (let x = 0; x < splatResolution; x += 1) {
      const worldX = minX + (x + 0.5) * metersPerPixel;
      const worldZ = minZ + (z + 0.5) * metersPerPixel;
      const height = heightAt(worldX, worldZ);
      const slope = estimateSlopeDegrees(worldX, worldZ, heightAt, 10);
      const semantics = sampleWorldSemantics(worldX, worldZ, semanticObjects);
      const weights = resolvePaintWeights(height, slope, semantics, preset.seed, worldX, worldZ);
      writeNormalizedRgba(pixels, (z * splatResolution + x) * 4, weights);
    }
  }

  return pixels;
}

function resolvePaintWeights(height, slopeDegrees, semantics, seed, worldX, worldZ) {
  const elevationSnow = smoothstep(118, 172, height);
  const steepRock = smoothstep(18, 42, slopeDegrees);
  const lowSand = 1 - smoothstep(14, 34, height);
  const terrainNoise = Math.sin((worldX + seed * 0.013) * 0.008) * Math.cos((worldZ - seed * 0.017) * 0.007) * 0.5 + 0.5;

  let sand = 0.28 + lowSand * 0.7 + semantics.waterBank * 1.35;
  let mud = 0.42 + semantics.waterCore * 1.25 + semantics.waterBank * 0.65 + semantics.roadShoulder * 0.2;
  let gravel = 0.2 + steepRock * 1.15 + semantics.roadCore * 3.5 + semantics.poiClearance * 0.55;
  let snow = elevationSnow * (1.2 + steepRock * 0.25);

  sand += terrainNoise * 0.08;
  mud += (1 - terrainNoise) * 0.08;
  if (semantics.waterCore > 0.1) {
    gravel *= 0.35;
    snow *= 0.25;
  }
  if (semantics.roadCore > 0.2) {
    sand *= 0.35;
    mud *= 0.55;
    snow *= 0.15;
  }

  return [sand, mud, gravel, snow].map((value) => clamp(value, 0, 6));
}

function writeNormalizedRgba(pixels, offset, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const channels = weights.map((weight) => Math.round((weight / total) * 255));
  const correction = 255 - channels.reduce((sum, channel) => sum + channel, 0);
  const strongestChannel = channels.reduce((best, channel, index) => channel > channels[best] ? index : best, 0);
  channels[strongestChannel] = clamp(channels[strongestChannel] + correction, 0, 255);
  pixels[offset] = channels[0];
  pixels[offset + 1] = channels[1];
  pixels[offset + 2] = channels[2];
  pixels[offset + 3] = channels[3];
}

function createPaintRegionMasks(pageBounds) {
  const masks = new Map();
  for (let pz = pageBounds.minPageZ; pz <= pageBounds.maxPageZ; pz += 1) {
    for (let px = pageBounds.minPageX; px <= pageBounds.maxPageX; px += 1) {
      const region = getPaintRegionCoords(px, pz);
      const key = `${region.x},${region.z}`;
      const bit = 1n << BigInt(getPaintRegionLocalIndex(px, pz));
      masks.set(key, (masks.get(key) ?? 0n) | bit);
    }
  }

  return Object.fromEntries(
    Array.from(masks.entries())
      .sort(([left], [right]) => compareRegionKeys(left, right))
      .map(([key, mask]) => [key, formatRegionMask(mask)]),
  );
}

async function writePaintRegionPacks(paintDir, pageBounds, fullPixels, fullResolution, manifest) {
  let totalByteLength = 0;
  for (const [regionKey, maskHex] of Object.entries(createPaintRegionMasks(pageBounds))) {
    const [regionX, regionZ] = regionKey.split(",").map(Number);
    const mask = BigInt(maskHex);
    const pageCount = countSetBits(mask);
    const tileByteLength = paintPageResolution * paintPageResolution * 4;
    const regionBytes = Buffer.alloc(pageCount * tileByteLength);
    let targetOffset = 0;

    for (let localIndex = 0; localIndex < paintRegionSizePages * paintRegionSizePages; localIndex += 1) {
      if ((mask & (1n << BigInt(localIndex))) === 0n) {
        continue;
      }

      const px = regionX * paintRegionSizePages + (localIndex % paintRegionSizePages);
      const pz = regionZ * paintRegionSizePages + Math.floor(localIndex / paintRegionSizePages);
      copyPaintTile(fullPixels, fullResolution, pageBounds, px, pz, regionBytes, targetOffset);
      targetOffset += tileByteLength;
    }

    await writeFile(path.join(paintDir, getPaintRegionPath(regionX, regionZ)), regionBytes);
    manifest.splatMaps.regionIntegrity[regionKey] = createRegionIntegrity(regionBytes);
    totalByteLength += regionBytes.byteLength;
  }

  return totalByteLength;
}

function copyPaintTile(fullPixels, fullResolution, pageBounds, px, pz, regionBytes, targetOffset) {
  const sourceX = (px - pageBounds.minPageX) * paintPageResolution;
  const sourceZ = (pz - pageBounds.minPageZ) * paintPageResolution;
  const rowByteLength = paintPageResolution * 4;
  for (let row = 0; row < paintPageResolution; row += 1) {
    const sourceOffset = ((sourceZ + row) * fullResolution + sourceX) * 4;
    fullPixels.copy(regionBytes, targetOffset + row * rowByteLength, sourceOffset, sourceOffset + rowByteLength);
  }
}

function getPaintRegionCoords(px, pz) {
  return {
    x: Math.floor(px / paintRegionSizePages),
    z: Math.floor(pz / paintRegionSizePages),
  };
}

function getPaintRegionLocalIndex(px, pz) {
  const region = getPaintRegionCoords(px, pz);
  const localX = px - region.x * paintRegionSizePages;
  const localZ = pz - region.z * paintRegionSizePages;
  return localZ * paintRegionSizePages + localX;
}

function getPaintRegionPath(regionX, regionZ) {
  return path.join("regions", `r_${formatGridCoordinate(regionX)}_${formatGridCoordinate(regionZ)}.paintpack`);
}

function compareRegionKeys(left, right) {
  const [leftX, leftZ] = left.split(",").map(Number);
  const [rightX, rightZ] = right.split(",").map(Number);
  return leftZ - rightZ || leftX - rightX;
}

function formatRegionMask(mask) {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}

function countSetBits(mask) {
  let value = mask;
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }

  return count;
}
