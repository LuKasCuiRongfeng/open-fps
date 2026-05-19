// PaintData: paint sidecar manifest and region pack helpers.
// PaintData：纹理绘制 sidecar 清单与 region pack 辅助函数。

import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";
import {
  normalizeSidecarRegionIntegrityMap,
  type SidecarRegionIntegrity,
  type SidecarRegionIntegrityMap,
} from "./SidecarAssetIntegrity";
import { createDefaultSidecarPatchLayers, normalizeSidecarPatchLayers, type SidecarPatchLayerManifest } from "./SidecarPatchLayers";
import {
  formatGridCoordinate,
  pageKey,
  parsePageKey,
  sortPageKeys,
} from "./PageGrid";

export interface MapPaintData {
  splatMaps: {
    format: typeof MAP_PAINT_REGION_FORMAT;
    resolution: number;
    pageResolution: number;
    pageSizeMeters: number;
    regionSizePages: number;
    regionsDirectory: typeof MAP_PAINT_REGIONS_DIRECTORY;
    indices: number[];
    regions: Record<string, string>;
    regionIntegrity: SidecarRegionIntegrityMap;
    patchLayers: SidecarPatchLayerManifest;
  };
}

export interface PaintRegionManifest {
  key: string;
  x: number;
  z: number;
  path: string;
  mask: bigint;
  integrity?: SidecarRegionIntegrity;
}

export interface PaintRegionPage {
  key: string;
  px: number;
  pz: number;
  localIndex: number;
  offset: number;
  byteLength: number;
}

export interface PaintSplatMapPixels {
  splatMapIndex?: number;
  resolution: number;
  pixels: Uint8Array;
}

export interface PaintRegionPackPayload {
  key: string;
  path: string;
  bytes: Uint8Array;
}

export const MAP_PAINT_PATH = "paint/layers.json";
export const MAP_PAINT_REGION_FORMAT = "rgba8-splat-region-pack-v1";
export const MAP_PAINT_REGIONS_DIRECTORY = "paint/regions";
export const DEFAULT_PAINT_TEXTURE_RESOLUTION = 1024;
export const DEFAULT_PAINT_PAGE_RESOLUTION = 32;
export const DEFAULT_PAINT_REGION_SIZE_PAGES = 8;

export function createEmptyPaintData(): MapPaintData {
  return {
    splatMaps: {
      format: MAP_PAINT_REGION_FORMAT,
      resolution: DEFAULT_PAINT_TEXTURE_RESOLUTION,
      pageResolution: DEFAULT_PAINT_PAGE_RESOLUTION,
      pageSizeMeters: 64,
      regionSizePages: DEFAULT_PAINT_REGION_SIZE_PAGES,
      regionsDirectory: MAP_PAINT_REGIONS_DIRECTORY,
      indices: [],
      regions: {},
      regionIntegrity: {},
      patchLayers: createDefaultSidecarPatchLayers([], "Base Paint"),
    },
  };
}

export function createPaintDataForMap(
  worldSizeMeters: number,
  pageSizeMeters: number,
  splatMapIndices: Iterable<number>,
  resolution: number,
  pageResolution = getPaintPageResolutionForMap(resolution, worldSizeMeters, pageSizeMeters),
  regionSizePages = DEFAULT_PAINT_REGION_SIZE_PAGES,
): MapPaintData {
  const indices = normalizeSplatMapIndices(Array.from(splatMapIndices));
  const pageKeys = indices.length > 0 ? getPaintPageKeysForWorld(worldSizeMeters, pageSizeMeters) : [];
  const regions = createPaintRegionMaskMap(pageKeys, regionSizePages);
  return {
    splatMaps: {
      format: MAP_PAINT_REGION_FORMAT,
      resolution: readPositiveInteger(resolution, "paint splat map resolution"),
      pageResolution: readPositiveInteger(pageResolution, "paint page resolution"),
      pageSizeMeters: readPositiveNumber(pageSizeMeters, "paint page size"),
      regionSizePages: normalizePaintRegionSize(regionSizePages),
      regionsDirectory: MAP_PAINT_REGIONS_DIRECTORY,
      indices,
      regions,
      regionIntegrity: {},
      patchLayers: createDefaultSidecarPatchLayers(Object.keys(regions), "Base Paint"),
    },
  };
}

export function clonePaintData(paintData: MapPaintData): MapPaintData {
  const normalized = normalizePaintData(paintData);
  const regionIntegrity = normalizeSidecarRegionIntegrityMap(
    normalized.splatMaps.regionIntegrity,
    Object.keys(normalized.splatMaps.regions),
    "Paint manifest regionIntegrity",
  );
  return {
    splatMaps: {
      ...normalized.splatMaps,
      indices: [...normalized.splatMaps.indices],
      regions: { ...normalized.splatMaps.regions },
      regionIntegrity,
      patchLayers: normalizeSidecarPatchLayers(normalized.splatMaps.patchLayers, Object.keys(normalized.splatMaps.regions), "Base Paint"),
    },
  };
}

export function normalizePaintData(value: unknown): MapPaintData {
  const record = isRecord(value) ? value : {};
  const splatMaps = isRecord(record.splatMaps) ? record.splatMaps : {};
  const regionSizePages = normalizePaintRegionSize(splatMaps.regionSizePages ?? DEFAULT_PAINT_REGION_SIZE_PAGES);
  const regions = normalizePaintRegions(splatMaps.regions ?? {}, regionSizePages);
  return {
    splatMaps: {
      format: normalizePaintRegionFormat(splatMaps.format),
      resolution: readOptionalPositiveInteger(
        splatMaps.resolution,
        DEFAULT_PAINT_TEXTURE_RESOLUTION,
        "paint splat map resolution",
      ),
      pageResolution: readOptionalPositiveInteger(
        splatMaps.pageResolution,
        DEFAULT_PAINT_PAGE_RESOLUTION,
        "paint page resolution",
      ),
      pageSizeMeters: readOptionalPositiveNumber(splatMaps.pageSizeMeters, 64, "paint page size"),
      regionSizePages,
      regionsDirectory: normalizePaintRegionsDirectory(splatMaps.regionsDirectory),
      indices: normalizeSplatMapIndices(splatMaps.indices ?? []),
      regions,
      regionIntegrity: isRecord(splatMaps.regionIntegrity) ? (splatMaps.regionIntegrity as SidecarRegionIntegrityMap) : {},
      patchLayers: normalizeSidecarPatchLayers(splatMaps.patchLayers, Object.keys(regions), "Base Paint"),
    },
  };
}

export function getPaintPageKeysForWorld(worldSizeMeters: number, pageSizeMeters: number): string[] {
  const pageCount = getPaintWorldPageCount(worldSizeMeters, pageSizeMeters);
  const minPage = -Math.floor(pageCount / 2);
  const maxPage = minPage + pageCount - 1;
  const keys: string[] = [];
  for (let pz = minPage; pz <= maxPage; pz += 1) {
    for (let px = minPage; px <= maxPage; px += 1) {
      keys.push(pageKey(px, pz));
    }
  }

  return keys;
}

export function getPaintPageResolutionForMap(
  resolution: number,
  worldSizeMeters: number,
  pageSizeMeters: number,
): number {
  const pageCount = getPaintWorldPageCount(worldSizeMeters, pageSizeMeters);
  const normalizedResolution = readPositiveInteger(resolution, "paint splat map resolution");
  if (normalizedResolution % pageCount !== 0) {
    throw new Error(`Paint splat map resolution ${normalizedResolution} must be divisible by ${pageCount} world pages`);
  }

  return normalizedResolution / pageCount;
}

export function getPaintRegions(paintData: MapPaintData): PaintRegionManifest[] {
  const normalized = normalizePaintData(paintData);
  return Object.entries(normalized.splatMaps.regions)
    .map(([key, maskHex]) => {
      const { x, z } = parseRegionKey(key);
      return {
        key,
        x,
        z,
        path: getPaintRegionPath(x, z),
        mask: parseRegionMask(maskHex, key, normalized.splatMaps.regionSizePages),
        integrity: normalized.splatMaps.regionIntegrity[key] ?? undefined,
      };
    })
    .sort((left, right) => compareRegionCoords(left.x, left.z, right.x, right.z));
}

export function getPaintRegionKeys(paintData: MapPaintData): string[] {
  return getPaintRegions(paintData).map((region) => region.key);
}

export function getPaintRegionPages(
  region: PaintRegionManifest,
  pageResolution: number,
  splatMapCount: number,
  regionSizePages = DEFAULT_PAINT_REGION_SIZE_PAGES,
): PaintRegionPage[] {
  const pageByteLength = getExpectedPaintRegionPageByteLength(pageResolution, splatMapCount);
  const slotCount = getPaintRegionSlotCount(regionSizePages);
  const pages: PaintRegionPage[] = [];
  let offset = 0;

  for (let localIndex = 0; localIndex < slotCount; localIndex += 1) {
    if (!hasRegionPage(region.mask, localIndex)) {
      continue;
    }

    const { px, pz } = getPaintRegionPageCoords(region.x, region.z, localIndex, regionSizePages);
    pages.push({
      key: pageKey(px, pz),
      px,
      pz,
      localIndex,
      offset,
      byteLength: pageByteLength,
    });
    offset += pageByteLength;
  }

  return pages;
}

export function getPaintRegionPath(x: number, z: number): string {
  return `${MAP_PAINT_REGIONS_DIRECTORY}/r_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.paintpack`;
}

export function getPaintRegionPathForKey(key: string): string {
  const { x, z } = parseRegionKey(key);
  return getPaintRegionPath(x, z);
}

export function createPaintRegionPackPayload(
  paintData: MapPaintData,
  worldSizeMeters: number,
  pageSizeMeters: number,
  splatMaps: readonly PaintSplatMapPixels[],
  regionKeys?: Iterable<string>,
): PaintRegionPackPayload[] {
  const normalized = normalizePaintData(paintData);
  const splatMapOrder = normalized.splatMaps.indices;
  const splatMapByIndex = new Map<number, PaintSplatMapPixels>();
  splatMaps.forEach((splatMap, fallbackIndex) => {
    const splatMapIndex = splatMap.splatMapIndex ?? fallbackIndex;
    splatMapByIndex.set(splatMapIndex, splatMap);
  });

  for (const index of splatMapOrder) {
    const splatMap = splatMapByIndex.get(index);
    if (!splatMap) {
      throw new Error(`Paint splat map ${index} is missing from region pack payload`);
    }

    validateFullSplatMap(splatMap.pixels, splatMap.resolution, normalized.splatMaps.resolution);
  }

  const selectedRegionKeys = regionKeys ? new Set(regionKeys) : null;
  const regions = getPaintRegions(normalized).filter((region) => !selectedRegionKeys || selectedRegionKeys.has(region.key));
  const pageResolution = normalized.splatMaps.pageResolution;
  const pageByteLength = getExpectedPaintRegionPageByteLength(pageResolution, splatMapOrder.length);
  return regions.map((region) => {
    const pages = getPaintRegionPages(
      region,
      pageResolution,
      splatMapOrder.length,
      normalized.splatMaps.regionSizePages,
    );
    const bytes = new Uint8Array(pages.length * pageByteLength);
    for (const page of pages) {
      splatMapOrder.forEach((splatMapIndex, orderIndex) => {
        const splatMap = splatMapByIndex.get(splatMapIndex);
        if (!splatMap) {
          throw new Error(`Paint splat map ${splatMapIndex} is missing from region pack payload`);
        }

        copyFullSplatMapPageToRegion(
          splatMap.pixels,
          normalized.splatMaps.resolution,
          worldSizeMeters,
          pageSizeMeters,
          page,
          pageResolution,
          bytes,
          page.offset + orderIndex * getExpectedPaintTileByteLength(pageResolution),
        );
      });
    }

    return { key: region.key, path: region.path, bytes };
  });
}

export function assemblePaintSplatMapPixels(
  paintData: MapPaintData,
  worldSizeMeters: number,
  pageSizeMeters: number,
  splatMapIndex: number,
  regionBytesByKey: Readonly<Record<string, Uint8Array>>,
): Uint8Array {
  const normalized = normalizePaintData(paintData);
  const orderIndex = normalized.splatMaps.indices.indexOf(splatMapIndex);
  if (orderIndex < 0) {
    throw new Error(`Paint splat map ${splatMapIndex} is not declared in the paint manifest`);
  }

  const pixels = new Uint8Array(getExpectedPaintSplatMapByteLength(normalized.splatMaps.resolution));
  const pageResolution = normalized.splatMaps.pageResolution;
  const tileByteLength = getExpectedPaintTileByteLength(pageResolution);
  for (const region of getPaintRegions(normalized)) {
    const regionBytes = regionBytesByKey[region.key];
    if (!regionBytes) {
      throw new Error(`Paint region pack '${region.key}' is missing`);
    }

    const pages = getPaintRegionPages(
      region,
      pageResolution,
      normalized.splatMaps.indices.length,
      normalized.splatMaps.regionSizePages,
    );
    const expectedRegionByteLength = pages.length * getExpectedPaintRegionPageByteLength(
      pageResolution,
      normalized.splatMaps.indices.length,
    );
    if (regionBytes.byteLength !== expectedRegionByteLength) {
      throw new Error(
        `Paint region pack '${region.key}' requires ${expectedRegionByteLength} bytes, got ${regionBytes.byteLength}`,
      );
    }

    for (const page of pages) {
      copyRegionPageToFullSplatMap(
        regionBytes,
        page.offset + orderIndex * tileByteLength,
        pixels,
        normalized.splatMaps.resolution,
        worldSizeMeters,
        pageSizeMeters,
        page,
        pageResolution,
      );
    }
  }

  return pixels;
}

export function applyPaintRegionPacksToSplatMapPixels(
  paintData: MapPaintData,
  worldSizeMeters: number,
  pageSizeMeters: number,
  splatMapIndex: number,
  regionBytesByKey: Readonly<Record<string, Uint8Array>>,
  targetPixels: Uint8Array,
): void {
  const normalized = normalizePaintData(paintData);
  const orderIndex = normalized.splatMaps.indices.indexOf(splatMapIndex);
  if (orderIndex < 0) {
    throw new Error(`Paint splat map ${splatMapIndex} is not declared in the paint manifest`);
  }

  const expectedByteLength = getExpectedPaintSplatMapByteLength(normalized.splatMaps.resolution);
  if (targetPixels.byteLength !== expectedByteLength) {
    throw new Error(`Paint splat map requires ${expectedByteLength} RGBA8 bytes, got ${targetPixels.byteLength}`);
  }

  const pageResolution = normalized.splatMaps.pageResolution;
  const tileByteLength = getExpectedPaintTileByteLength(pageResolution);
  for (const region of getPaintRegions(normalized)) {
    const regionBytes = regionBytesByKey[region.key];
    if (!regionBytes) {
      continue;
    }

    const pages = getPaintRegionPages(
      region,
      pageResolution,
      normalized.splatMaps.indices.length,
      normalized.splatMaps.regionSizePages,
    );
    const expectedRegionByteLength = pages.length * getExpectedPaintRegionPageByteLength(
      pageResolution,
      normalized.splatMaps.indices.length,
    );
    if (regionBytes.byteLength !== expectedRegionByteLength) {
      throw new Error(
        `Paint region pack '${region.key}' requires ${expectedRegionByteLength} bytes, got ${regionBytes.byteLength}`,
      );
    }

    for (const page of pages) {
      copyRegionPageToFullSplatMap(
        regionBytes,
        page.offset + orderIndex * tileByteLength,
        targetPixels,
        normalized.splatMaps.resolution,
        worldSizeMeters,
        pageSizeMeters,
        page,
        pageResolution,
      );
    }
  }
}

export function getPaintRegionKeysForWorldBounds(
  worldSizeMeters: number,
  pageSizeMeters: number,
  regionSizePages: number,
  minWorldX: number,
  minWorldZ: number,
  maxWorldX: number,
  maxWorldZ: number,
): string[] {
  const worldSize = readPositiveNumber(worldSizeMeters, "paint world size");
  const pageSize = readPositiveNumber(pageSizeMeters, "paint page size");
  const regionSize = normalizePaintRegionSize(regionSizePages);
  const halfSize = worldSize / 2;
  const clippedMinX = Math.max(-halfSize, Math.min(minWorldX, maxWorldX));
  const clippedMaxX = Math.min(halfSize, Math.max(minWorldX, maxWorldX));
  const clippedMinZ = Math.max(-halfSize, Math.min(minWorldZ, maxWorldZ));
  const clippedMaxZ = Math.min(halfSize, Math.max(minWorldZ, maxWorldZ));

  if (clippedMaxX < -halfSize || clippedMinX > halfSize || clippedMaxZ < -halfSize || clippedMinZ > halfSize) {
    return [];
  }

  const minPageX = getPaintPageCoordForWorldCoordinate(clippedMinX, worldSize, pageSize);
  const maxPageX = getPaintPageCoordForWorldCoordinate(clippedMaxX, worldSize, pageSize);
  const minPageZ = getPaintPageCoordForWorldCoordinate(clippedMinZ, worldSize, pageSize);
  const maxPageZ = getPaintPageCoordForWorldCoordinate(clippedMaxZ, worldSize, pageSize);
  const keys = new Set<string>();

  for (let pz = minPageZ; pz <= maxPageZ; pz += 1) {
    for (let px = minPageX; px <= maxPageX; px += 1) {
      const region = getPaintRegionCoordsForPage(px, pz, regionSize);
      keys.add(paintRegionKey(region.x, region.z));
    }
  }

  return Array.from(keys).sort(compareRegionKeys);
}

export function encodePaintRegionPackBase64(bytes: Uint8Array | ArrayLike<number>): string {
  return uint8ArrayToBase64(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
}

export function decodePaintRegionPackBase64(base64: string): Uint8Array {
  return base64ToUint8Array(base64);
}

export function getExpectedPaintTileByteLength(pageResolution: number): number {
  return readPositiveInteger(pageResolution, "paint page resolution") ** 2 * 4;
}

export function getExpectedPaintRegionPageByteLength(pageResolution: number, splatMapCount: number): number {
  return getExpectedPaintTileByteLength(pageResolution) * readPositiveInteger(splatMapCount, "paint splat map count");
}

export function getExpectedPaintSplatMapByteLength(resolution: number): number {
  return readPositiveInteger(resolution, "paint splat map resolution") ** 2 * 4;
}

function createPaintRegionMaskMap(pageKeys: Iterable<string>, regionSizePages: number): Record<string, string> {
  const normalizedRegionSize = normalizePaintRegionSize(regionSizePages);
  const regionMasks = new Map<string, bigint>();
  for (const key of sortPageKeys(pageKeys)) {
    const { px, pz } = parsePageKey(key);
    const region = getPaintRegionCoordsForPage(px, pz, normalizedRegionSize);
    const regionKey = paintRegionKey(region.x, region.z);
    const localIndex = getPaintRegionLocalPageIndex(px, pz, normalizedRegionSize);
    regionMasks.set(regionKey, (regionMasks.get(regionKey) ?? 0n) | (1n << BigInt(localIndex)));
  }

  return Object.fromEntries(
    Array.from(regionMasks.entries())
      .sort(([left], [right]) => compareRegionKeys(left, right))
      .map(([key, mask]) => [key, formatRegionMask(mask)]),
  );
}

function copyFullSplatMapPageToRegion(
  sourcePixels: Uint8Array,
  sourceResolution: number,
  worldSizeMeters: number,
  pageSizeMeters: number,
  page: PaintRegionPage,
  pageResolution: number,
  targetBytes: Uint8Array,
  targetOffset: number,
): void {
  const bounds = getPaintWorldPageBounds(worldSizeMeters, pageSizeMeters);
  const sourceX = (page.px - bounds.minPage) * pageResolution;
  const sourceZ = (page.pz - bounds.minPage) * pageResolution;
  const rowByteLength = pageResolution * 4;
  for (let row = 0; row < pageResolution; row += 1) {
    const sourceOffset = ((sourceZ + row) * sourceResolution + sourceX) * 4;
    targetBytes.set(sourcePixels.subarray(sourceOffset, sourceOffset + rowByteLength), targetOffset + row * rowByteLength);
  }
}

function copyRegionPageToFullSplatMap(
  regionBytes: Uint8Array,
  regionOffset: number,
  targetPixels: Uint8Array,
  targetResolution: number,
  worldSizeMeters: number,
  pageSizeMeters: number,
  page: PaintRegionPage,
  pageResolution: number,
): void {
  const bounds = getPaintWorldPageBounds(worldSizeMeters, pageSizeMeters);
  const targetX = (page.px - bounds.minPage) * pageResolution;
  const targetZ = (page.pz - bounds.minPage) * pageResolution;
  const rowByteLength = pageResolution * 4;
  for (let row = 0; row < pageResolution; row += 1) {
    const sourceOffset = regionOffset + row * rowByteLength;
    const targetOffset = ((targetZ + row) * targetResolution + targetX) * 4;
    targetPixels.set(regionBytes.subarray(sourceOffset, sourceOffset + rowByteLength), targetOffset);
  }
}

function validateFullSplatMap(pixels: Uint8Array, resolution: number, expectedResolution: number): void {
  if (resolution !== expectedResolution) {
    throw new Error(`Paint splat map resolution ${resolution} does not match manifest resolution ${expectedResolution}`);
  }

  const expectedByteLength = getExpectedPaintSplatMapByteLength(expectedResolution);
  if (pixels.byteLength !== expectedByteLength) {
    throw new Error(`Paint splat map requires ${expectedByteLength} RGBA8 bytes, got ${pixels.byteLength}`);
  }
}

function getPaintWorldPageCount(worldSizeMeters: number, pageSizeMeters: number): number {
  const worldSize = readPositiveNumber(worldSizeMeters, "paint world size");
  const pageSize = readPositiveNumber(pageSizeMeters, "paint page size");
  const pageCount = worldSize / pageSize;
  if (!Number.isInteger(pageCount)) {
    throw new Error(`Paint world size ${worldSize} must be divisible by page size ${pageSize}`);
  }

  return pageCount;
}

function getPaintWorldPageBounds(worldSizeMeters: number, pageSizeMeters: number): { minPage: number; maxPage: number } {
  const pageCount = getPaintWorldPageCount(worldSizeMeters, pageSizeMeters);
  const minPage = -Math.floor(pageCount / 2);
  return { minPage, maxPage: minPage + pageCount - 1 };
}

function getPaintPageCoordForWorldCoordinate(worldCoordinate: number, worldSizeMeters: number, pageSizeMeters: number): number {
  const bounds = getPaintWorldPageBounds(worldSizeMeters, pageSizeMeters);
  const normalizedPage = Math.floor((worldCoordinate + worldSizeMeters / 2) / pageSizeMeters) + bounds.minPage;
  return Math.min(bounds.maxPage, Math.max(bounds.minPage, normalizedPage));
}

function getPaintRegionCoordsForPage(
  px: number,
  pz: number,
  regionSizePages = DEFAULT_PAINT_REGION_SIZE_PAGES,
): { x: number; z: number } {
  const size = normalizePaintRegionSize(regionSizePages);
  return {
    x: Math.floor(px / size),
    z: Math.floor(pz / size),
  };
}

function getPaintRegionLocalPageIndex(
  px: number,
  pz: number,
  regionSizePages = DEFAULT_PAINT_REGION_SIZE_PAGES,
): number {
  const size = normalizePaintRegionSize(regionSizePages);
  const region = getPaintRegionCoordsForPage(px, pz, size);
  const localX = px - region.x * size;
  const localZ = pz - region.z * size;
  if (localX < 0 || localX >= size || localZ < 0 || localZ >= size) {
    throw new Error(`Paint page '${px},${pz}' is outside computed region '${paintRegionKey(region.x, region.z)}'`);
  }

  return localZ * size + localX;
}

function getPaintRegionPageCoords(
  regionX: number,
  regionZ: number,
  localIndex: number,
  regionSizePages = DEFAULT_PAINT_REGION_SIZE_PAGES,
): { px: number; pz: number } {
  const size = normalizePaintRegionSize(regionSizePages);
  if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= getPaintRegionSlotCount(size)) {
    throw new Error(`Paint region local index is out of bounds: ${localIndex}`);
  }

  return {
    px: regionX * size + (localIndex % size),
    pz: regionZ * size + Math.floor(localIndex / size),
  };
}

function paintRegionKey(x: number, z: number): string {
  if (!Number.isInteger(x) || !Number.isInteger(z)) {
    throw new Error(`Paint region coordinates must be integers: ${x},${z}`);
  }

  return `${x},${z}`;
}

function parseRegionKey(key: string): { x: number; z: number } {
  const match = key.match(/^(-?\d+),(-?\d+)$/);
  if (!match) {
    throw new Error(`Invalid paint region key '${key}'`);
  }

  return { x: Number(match[1]), z: Number(match[2]) };
}

function normalizePaintRegions(value: unknown, regionSizePages: number): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error("Paint manifest regions must be a JSON object");
  }

  const size = normalizePaintRegionSize(regionSizePages);
  const regions = Object.entries(value).map(([key, maskHex]) => {
    parseRegionKey(key);
    if (typeof maskHex !== "string") {
      throw new Error(`Paint region '${key}' mask must be a string`);
    }

    const mask = parseRegionMask(maskHex, key, size);
    return [key, formatRegionMask(mask)] as const;
  });

  return Object.fromEntries(regions.sort(([left], [right]) => compareRegionKeys(left, right)));
}

function parseRegionMask(maskHex: string, regionKey: string, regionSizePages: number): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(maskHex)) {
    throw new Error(`Paint region '${regionKey}' has invalid mask '${maskHex}'`);
  }

  const mask = BigInt(maskHex);
  const slotCount = getPaintRegionSlotCount(regionSizePages);
  if (mask < 0n || mask >= (1n << BigInt(slotCount))) {
    throw new Error(`Paint region '${regionKey}' mask exceeds ${slotCount} pages`);
  }

  return mask;
}

function formatRegionMask(mask: bigint): string {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}

function hasRegionPage(mask: bigint, localIndex: number): boolean {
  return (mask & (1n << BigInt(localIndex))) !== 0n;
}

function getPaintRegionSlotCount(regionSizePages: number): number {
  const size = normalizePaintRegionSize(regionSizePages);
  return size * size;
}

function normalizePaintRegionSize(value: unknown): number {
  const size = readPositiveInteger(value, "paint region size");
  if (size > 8) {
    throw new Error("Paint region size cannot exceed 8 pages because masks are stored as 64-bit values");
  }

  return size;
}

function normalizePaintRegionFormat(value: unknown): typeof MAP_PAINT_REGION_FORMAT {
  if (value === undefined || value === MAP_PAINT_REGION_FORMAT) {
    return MAP_PAINT_REGION_FORMAT;
  }

  throw new Error("Paint manifest has invalid splat map format");
}

function normalizePaintRegionsDirectory(value: unknown): typeof MAP_PAINT_REGIONS_DIRECTORY {
  if (value === undefined || value === MAP_PAINT_REGIONS_DIRECTORY) {
    return MAP_PAINT_REGIONS_DIRECTORY;
  }

  throw new Error("Paint manifest has invalid regions directory");
}

function normalizeSplatMapIndices(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("Paint manifest splat map indices must be an array");
  }

  const indices = new Set<number>();
  for (const index of value) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Paint manifest has invalid splat map index '${String(index)}'`);
    }

    if (indices.has(index)) {
      throw new Error(`Paint manifest has duplicate splat map index '${index}'`);
    }

    indices.add(index);
  }

  return Array.from(indices).sort((left, right) => left - right);
}

function compareRegionKeys(left: string, right: string): number {
  const a = parseRegionKey(left);
  const b = parseRegionKey(right);
  return compareRegionCoords(a.x, a.z, b.x, b.z);
}

function compareRegionCoords(leftX: number, leftZ: number, rightX: number, rightZ: number): number {
  return leftZ - rightZ || leftX - rightX;
}

function readOptionalPositiveInteger(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  return readPositiveInteger(value, label);
}

function readOptionalPositiveNumber(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  return readPositiveNumber(value, label);
}

function readPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Paint manifest has invalid ${label}`);
  }

  return value;
}

function readPositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Paint manifest has invalid ${label}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}