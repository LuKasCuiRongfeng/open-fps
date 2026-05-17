// TerrainHeightData: height sidecar manifests and region pack helpers.
// TerrainHeightData：高度 sidecar 清单与 region pack 辅助函数。

import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";
import {
  formatGridCoordinate,
  normalizePageKeys,
  parsePageKey,
  sortPageKeys,
} from "./PageGrid";

export interface TerrainHeightRegionPage {
  key: string;
  offset: number;
  byteLength: number;
}

export interface TerrainHeightRegionManifest {
  key: string;
  x: number;
  z: number;
  path: string;
  mask: bigint;
}

export interface TerrainHeightManifest {
  version: typeof TERRAIN_HEIGHT_MANIFEST_VERSION;
  format: typeof MAP_HEIGHT_REGION_FORMAT;
  sampleFormat: typeof MAP_HEIGHT_SAMPLE_FORMAT;
  pageResolution: number;
  pageSizeMeters: number;
  regionSizePages: number;
  regionsDirectory: typeof MAP_HEIGHT_REGIONS_DIRECTORY;
  regions: Record<string, string>;
}

export interface TerrainHeightPageLocation {
  region: TerrainHeightRegionManifest;
  page: TerrainHeightRegionPage;
}

export const TERRAIN_HEIGHT_MANIFEST_VERSION = 1;
export const MAP_TERRAIN_HEIGHT_PATH = "terrain/height/manifest.json";
export const MAP_HEIGHT_REGION_FORMAT = "height-region-pack-v1";
export const MAP_HEIGHT_SAMPLE_FORMAT = "float32le";
export const MAP_HEIGHT_REGIONS_DIRECTORY = "terrain/height/regions";
export const DEFAULT_HEIGHT_REGION_SIZE_PAGES = 8;

export function createTerrainHeightManifest(
  pageKeys: Iterable<string>,
  pageResolution: number,
  pageSizeMeters: number,
  regionSizePages = DEFAULT_HEIGHT_REGION_SIZE_PAGES,
): TerrainHeightManifest {
  const settings = normalizeHeightManifestSettings(pageResolution, pageSizeMeters, regionSizePages);
  const normalizedPageKeys = normalizePageKeys(Array.from(pageKeys), "height page");
  const regionMasks = new Map<string, bigint>();

  for (const key of normalizedPageKeys) {
    const { px, pz } = parsePageKey(key);
    const region = getHeightRegionCoordsForPage(px, pz, settings.regionSizePages);
    const regionKey = heightRegionKey(region.x, region.z);
    const localIndex = getHeightRegionLocalPageIndex(px, pz, settings.regionSizePages);
    const bit = 1n << BigInt(localIndex);
    regionMasks.set(regionKey, (regionMasks.get(regionKey) ?? 0n) | bit);
  }

  const regions = Object.fromEntries(
    Array.from(regionMasks.entries())
      .sort(([left], [right]) => compareRegionKeys(left, right))
      .map(([key, mask]) => [key, formatRegionMask(mask)]),
  );

  return {
    version: TERRAIN_HEIGHT_MANIFEST_VERSION,
    format: MAP_HEIGHT_REGION_FORMAT,
    sampleFormat: MAP_HEIGHT_SAMPLE_FORMAT,
    pageResolution: settings.pageResolution,
    pageSizeMeters: settings.pageSizeMeters,
    regionSizePages: settings.regionSizePages,
    regionsDirectory: MAP_HEIGHT_REGIONS_DIRECTORY,
    regions,
  };
}

export function serializeTerrainHeightManifest(manifest: TerrainHeightManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function deserializeTerrainHeightManifest(json: string): TerrainHeightManifest {
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Terrain height manifest must be a JSON object");
  }

  if (parsed.version !== TERRAIN_HEIGHT_MANIFEST_VERSION) {
    throw new Error(`Terrain height manifest version ${String(parsed.version ?? "unknown")} is not supported`);
  }

  if (parsed.format !== MAP_HEIGHT_REGION_FORMAT) {
    throw new Error("Terrain height manifest has invalid region pack format");
  }

  if (parsed.sampleFormat !== MAP_HEIGHT_SAMPLE_FORMAT) {
    throw new Error("Terrain height manifest has invalid height sample format");
  }

  const settings = normalizeHeightManifestSettings(
    parsed.pageResolution,
    parsed.pageSizeMeters,
    parsed.regionSizePages,
  );

  if (parsed.regionsDirectory !== MAP_HEIGHT_REGIONS_DIRECTORY) {
    throw new Error("Terrain height manifest has invalid regions directory");
  }

  return {
    version: TERRAIN_HEIGHT_MANIFEST_VERSION,
    format: MAP_HEIGHT_REGION_FORMAT,
    sampleFormat: MAP_HEIGHT_SAMPLE_FORMAT,
    pageResolution: settings.pageResolution,
    pageSizeMeters: settings.pageSizeMeters,
    regionSizePages: settings.regionSizePages,
    regionsDirectory: MAP_HEIGHT_REGIONS_DIRECTORY,
    regions: normalizeTerrainHeightRegions(parsed.regions, settings.regionSizePages),
  };
}

export function getTerrainHeightRegions(manifest: TerrainHeightManifest): TerrainHeightRegionManifest[] {
  return Object.entries(manifest.regions)
    .map(([key, maskHex]) => {
      const { x, z } = parseRegionKey(key);
      return {
        key,
        x,
        z,
        path: getHeightRegionPath(x, z),
        mask: parseRegionMask(maskHex, key, manifest.regionSizePages),
      };
    })
    .sort((left, right) => compareRegionCoords(left.x, left.z, right.x, right.z));
}

export function getTerrainHeightPageKeys(manifest: TerrainHeightManifest): string[] {
  return sortPageKeys(getTerrainHeightRegions(manifest).flatMap((region) => (
    getHeightRegionPages(region, manifest.pageResolution, manifest.regionSizePages).map((page) => page.key)
  )));
}

export function createTerrainHeightPageIndex(
  manifest: TerrainHeightManifest,
): Map<string, TerrainHeightPageLocation> {
  const index = new Map<string, TerrainHeightPageLocation>();
  for (const region of getTerrainHeightRegions(manifest)) {
    for (const page of getHeightRegionPages(region, manifest.pageResolution, manifest.regionSizePages)) {
      index.set(page.key, { region, page });
    }
  }

  return index;
}

export function getHeightRegionPages(
  region: TerrainHeightRegionManifest,
  pageResolution: number,
  regionSizePages = DEFAULT_HEIGHT_REGION_SIZE_PAGES,
): TerrainHeightRegionPage[] {
  const pageByteLength = getExpectedHeightPageByteLength(pageResolution);
  const slotCount = getHeightRegionSlotCount(regionSizePages);
  const pages: TerrainHeightRegionPage[] = [];
  let offset = 0;

  for (let localIndex = 0; localIndex < slotCount; localIndex += 1) {
    if (!hasRegionPage(region.mask, localIndex)) {
      continue;
    }

    pages.push({
      key: getHeightRegionPageKey(region.x, region.z, localIndex, regionSizePages),
      offset,
      byteLength: pageByteLength,
    });
    offset += pageByteLength;
  }

  return pages;
}

export function getHeightRegionCoordsForPage(
  px: number,
  pz: number,
  regionSizePages = DEFAULT_HEIGHT_REGION_SIZE_PAGES,
): { x: number; z: number } {
  validateHeightRegionSize(regionSizePages);

  return {
    x: Math.floor(px / regionSizePages),
    z: Math.floor(pz / regionSizePages),
  };
}

export function getHeightRegionCoordsForPageKey(
  key: string,
  regionSizePages = DEFAULT_HEIGHT_REGION_SIZE_PAGES,
): { x: number; z: number } {
  const { px, pz } = parsePageKey(key);
  return getHeightRegionCoordsForPage(px, pz, regionSizePages);
}

export function getHeightRegionLocalPageIndex(
  px: number,
  pz: number,
  regionSizePages = DEFAULT_HEIGHT_REGION_SIZE_PAGES,
): number {
  validateHeightRegionSize(regionSizePages);

  const region = getHeightRegionCoordsForPage(px, pz, regionSizePages);
  const localX = px - region.x * regionSizePages;
  const localZ = pz - region.z * regionSizePages;
  if (localX < 0 || localX >= regionSizePages || localZ < 0 || localZ >= regionSizePages) {
    throw new Error(`Height page '${px},${pz}' is outside computed region '${heightRegionKey(region.x, region.z)}'`);
  }

  return localZ * regionSizePages + localX;
}

export function heightRegionKey(x: number, z: number): string {
  if (!Number.isInteger(x) || !Number.isInteger(z)) {
    throw new Error(`Height region coordinates must be integers: ${x},${z}`);
  }

  return `${x},${z}`;
}

export function getHeightRegionPath(x: number, z: number): string {
  return `${MAP_HEIGHT_REGIONS_DIRECTORY}/r_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.heightpack`;
}

export function getHeightRegionPackByteLength(
  region: TerrainHeightRegionManifest,
  pageResolution: number,
): number {
  return countSetBits(region.mask) * getExpectedHeightPageByteLength(pageResolution);
}

export function getHeightRegionPageBytes(
  regionBytes: Uint8Array,
  page: TerrainHeightRegionPage,
): Uint8Array {
  const end = page.offset + page.byteLength;
  if (page.offset < 0 || end > regionBytes.byteLength) {
    throw new Error(`Height region pack is missing page '${page.key}' bytes`);
  }

  return regionBytes.subarray(page.offset, end);
}

export function encodeHeightPageBytes(heights: Float32Array, pageResolution: number): Uint8Array {
  validateHeightPageLength(heights, pageResolution);

  const bytes = new Uint8Array(heights.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < heights.length; index += 1) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, heights[index], true);
  }

  return bytes;
}

export function decodeHeightPageBytes(bytes: Uint8Array, pageResolution: number): Float32Array {
  const expectedByteLength = getExpectedHeightPageByteLength(pageResolution);
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(`Invalid height page byte length: expected ${expectedByteLength}, got ${bytes.byteLength}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const heights = new Float32Array(pageResolution * pageResolution);
  for (let index = 0; index < heights.length; index += 1) {
    heights[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }

  return heights;
}

export function encodeHeightRegionPackBase64(bytes: Uint8Array): string {
  return uint8ArrayToBase64(bytes);
}

export function decodeHeightRegionPackBase64(base64: string): Uint8Array {
  return base64ToUint8Array(base64);
}

export function getExpectedHeightPageByteLength(pageResolution: number): number {
  return pageResolution * pageResolution * Float32Array.BYTES_PER_ELEMENT;
}

function normalizeTerrainHeightRegions(value: unknown, regionSizePages: number): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error("Terrain height manifest regions must be an object");
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, maskValue]) => {
        const region = parseRegionKey(key);
        const normalizedKey = heightRegionKey(region.x, region.z);
        if (key !== normalizedKey) {
          throw new Error(`Terrain height manifest has invalid region key '${key}'`);
        }

        const mask = parseRegionMask(maskValue, key, regionSizePages);
        return [key, formatRegionMask(mask)] as const;
      })
      .sort(([left], [right]) => compareRegionKeys(left, right)),
  );
}

function parseRegionKey(key: string): { x: number; z: number } {
  const { px, pz } = parsePageKey(key);
  return { x: px, z: pz };
}

function getHeightRegionPageKey(
  regionX: number,
  regionZ: number,
  localIndex: number,
  regionSizePages: number,
): string {
  const localX = localIndex % regionSizePages;
  const localZ = Math.floor(localIndex / regionSizePages);
  return `${regionX * regionSizePages + localX},${regionZ * regionSizePages + localZ}`;
}

function parseRegionMask(value: unknown, regionKeyValue: string, regionSizePages: number): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`Terrain height manifest region '${regionKeyValue}' mask must be a hex string`);
  }

  const mask = BigInt(value);
  const maxMask = getHeightRegionMaxMask(regionSizePages);
  if (mask <= 0n || mask > maxMask) {
    throw new Error(`Terrain height manifest region '${regionKeyValue}' has invalid sparse page mask`);
  }

  return mask;
}

function formatRegionMask(mask: bigint): string {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}

function hasRegionPage(mask: bigint, localIndex: number): boolean {
  return (mask & (1n << BigInt(localIndex))) !== 0n;
}

function getHeightRegionSlotCount(regionSizePages: number): number {
  validateHeightRegionSize(regionSizePages);
  return regionSizePages * regionSizePages;
}

function getHeightRegionMaxMask(regionSizePages: number): bigint {
  return (1n << BigInt(getHeightRegionSlotCount(regionSizePages))) - 1n;
}

function countSetBits(mask: bigint): number {
  let bits = mask;
  let count = 0;
  while (bits > 0n) {
    if ((bits & 1n) !== 0n) {
      count += 1;
    }
    bits >>= 1n;
  }

  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHeightManifestSettings(
  pageResolution: unknown,
  pageSizeMeters: unknown,
  regionSizePages: unknown,
): { pageResolution: number; pageSizeMeters: number; regionSizePages: number } {
  if (
    typeof pageResolution !== "number"
    || !Number.isInteger(pageResolution)
    || pageResolution <= 1
  ) {
    throw new Error("Terrain height manifest has invalid page resolution");
  }

  if (typeof pageSizeMeters !== "number" || !Number.isFinite(pageSizeMeters) || pageSizeMeters <= 0) {
    throw new Error("Terrain height manifest has invalid page size");
  }

  if (typeof regionSizePages !== "number") {
    throw new Error("Terrain height manifest has invalid region size");
  }
  validateHeightRegionSize(regionSizePages);

  return { pageResolution, pageSizeMeters, regionSizePages };
}

function validateHeightRegionSize(regionSizePages: number): void {
  if (!Number.isInteger(regionSizePages) || regionSizePages <= 0 || regionSizePages * regionSizePages > 64) {
    throw new Error("Terrain height manifest region size must fit in a 64-bit sparse page mask");
  }
}

function validateHeightPageLength(heights: Float32Array, pageResolution: number): void {
  const expectedLength = pageResolution * pageResolution;
  if (heights.length !== expectedLength) {
    throw new Error(`Invalid height page length: expected ${expectedLength}, got ${heights.length}`);
  }
}

function compareRegionKeys(left: string, right: string): number {
  const a = parseRegionKey(left);
  const b = parseRegionKey(right);
  return compareRegionCoords(a.x, a.z, b.x, b.z);
}

function compareRegionCoords(leftX: number, leftZ: number, rightX: number, rightZ: number): number {
  return leftZ - rightZ || leftX - rightX;
}