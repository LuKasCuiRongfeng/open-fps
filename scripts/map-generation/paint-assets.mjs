import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clamp,
  createRegionIntegrity,
  ensureMapManifestPaths,
  formatGridCoordinate,
  getMapDir,
  getPageBounds,
  hash2i,
  paintManifestPath,
  paintPageResolution,
  paintRegionFormat,
  paintRegionsDirectory,
  paintRegionSizePages,
} from "./shared.mjs";

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

  const layers = {
    beachSand: {
      diffuse: "assets/texture/aerial_beach_01_diff_1k.jpg",
      normal: "assets/texture/aerial_beach_01_nor_gl_1k.png",
      arm: "assets/texture/aerial_beach_01_arm_1k.png",
      displacement: "assets/texture/aerial_beach_01_disp_1k.png",
      scale: 7,
      splatMapIndex: 0,
    },
    mudLeaves: {
      diffuse: "assets/texture/brown_mud_leaves_01_diff_1k.jpg",
      normal: "assets/texture/brown_mud_leaves_01_nor_gl_1k.png",
      arm: "assets/texture/brown_mud_leaves_01_arm_1k.png",
      displacement: "assets/texture/brown_mud_leaves_01_disp_1k.png",
      scale: 5,
      splatMapIndex: 0,
    },
  };
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

  const pixels = Buffer.alloc(splatResolution * splatResolution * 4);
  for (let pixelZ = 0; pixelZ < splatResolution; pixelZ += 1) {
    for (let pixelX = 0; pixelX < splatResolution; pixelX += 1) {
      const normalizedX = pixelX / (splatResolution - 1);
      const normalizedZ = pixelZ / (splatResolution - 1);
      const grain = hash2i(Math.floor(normalizedX * 96), Math.floor(normalizedZ * 96), 8123, 918273);
      const broad = 0.5 + 0.5 * Math.sin(normalizedX * 18 + Math.cos(normalizedZ * 9) * 1.6);
      const mudWeight = clamp(0.18 + broad * 0.28 + grain * 0.22, 0, 1);
      const mudByte = Math.round(mudWeight * 255);
      const offset = (pixelZ * splatResolution + pixelX) * 4;
      pixels[offset] = 255 - mudByte;
      pixels[offset + 1] = mudByte;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0;
    }
  }

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
