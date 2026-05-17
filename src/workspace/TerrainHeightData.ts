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
  pages: TerrainHeightRegionPage[];
}

export interface TerrainHeightManifest {
  version: typeof TERRAIN_HEIGHT_MANIFEST_VERSION;
  format: typeof MAP_HEIGHT_REGION_FORMAT;
  sampleFormat: typeof MAP_HEIGHT_SAMPLE_FORMAT;
  pageResolution: number;
  pageSizeMeters: number;
  regionSizePages: number;
  regionsDirectory: typeof MAP_HEIGHT_REGIONS_DIRECTORY;
  regions: TerrainHeightRegionManifest[];
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
  const pageByteLength = getExpectedHeightPageByteLength(settings.pageResolution);
  const regionGroups = new Map<string, { x: number; z: number; pageKeys: string[] }>();

  for (const key of normalizedPageKeys) {
    const { px, pz } = parsePageKey(key);
    const region = getHeightRegionCoordsForPage(px, pz, settings.regionSizePages);
    const regionKey = heightRegionKey(region.x, region.z);
    const group = regionGroups.get(regionKey) ?? { x: region.x, z: region.z, pageKeys: [] };
    group.pageKeys.push(key);
    regionGroups.set(regionKey, group);
  }

  const regions = Array.from(regionGroups.values())
    .sort((left, right) => compareRegionCoords(left.x, left.z, right.x, right.z))
    .map((region): TerrainHeightRegionManifest => {
      let offset = 0;
      const pages = sortPageKeys(region.pageKeys).map((key) => {
        const page = { key, offset, byteLength: pageByteLength };
        offset += pageByteLength;
        return page;
      });

      return {
        key: heightRegionKey(region.x, region.z),
        x: region.x,
        z: region.z,
        path: getHeightRegionPath(region.x, region.z),
        pages,
      };
    });

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
  const parsed = JSON.parse(json) as Partial<TerrainHeightManifest>;

  if (parsed.version !== TERRAIN_HEIGHT_MANIFEST_VERSION) {
    throw new Error(`Terrain height manifest version ${parsed.version ?? "unknown"} is not supported`);
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
    regions: normalizeTerrainHeightRegions(parsed.regions, settings.pageResolution, settings.regionSizePages),
  };
}

export function getTerrainHeightPageKeys(manifest: TerrainHeightManifest): string[] {
  return sortPageKeys(manifest.regions.flatMap((region) => region.pages.map((page) => page.key)));
}

export function createTerrainHeightPageIndex(
  manifest: TerrainHeightManifest,
): Map<string, TerrainHeightPageLocation> {
  const index = new Map<string, TerrainHeightPageLocation>();
  for (const region of manifest.regions) {
    for (const page of region.pages) {
      index.set(page.key, { region, page });
    }
  }

  return index;
}

export function getHeightRegionCoordsForPage(
  px: number,
  pz: number,
  regionSizePages = DEFAULT_HEIGHT_REGION_SIZE_PAGES,
): { x: number; z: number } {
  if (!Number.isInteger(regionSizePages) || regionSizePages <= 0) {
    throw new Error(`Height region size must be a positive integer: ${regionSizePages}`);
  }

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

export function heightRegionKey(x: number, z: number): string {
  if (!Number.isInteger(x) || !Number.isInteger(z)) {
    throw new Error(`Height region coordinates must be integers: ${x},${z}`);
  }

  return `${x},${z}`;
}

export function getHeightRegionPath(x: number, z: number): string {
  return `${MAP_HEIGHT_REGIONS_DIRECTORY}/r_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.heightpack`;
}

export function getHeightRegionPackByteLength(region: TerrainHeightRegionManifest): number {
  return region.pages.reduce((maxByteLength, page) => Math.max(maxByteLength, page.offset + page.byteLength), 0);
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

function normalizeTerrainHeightRegions(
  value: unknown,
  pageResolution: number,
  regionSizePages: number,
): TerrainHeightRegionManifest[] {
  if (!Array.isArray(value)) {
    throw new Error("Terrain height manifest regions must be an array");
  }

  const regionKeys = new Set<string>();
  const pageKeys = new Set<string>();
  const regions = value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("Terrain height manifest region must be an object");
    }

    const x = readInteger(entry.x, "height region x");
    const z = readInteger(entry.z, "height region z");
    const key = heightRegionKey(x, z);
    if (entry.key !== key) {
      throw new Error(`Terrain height manifest has invalid region key '${String(entry.key)}'`);
    }
    if (regionKeys.has(key)) {
      throw new Error(`Terrain height manifest has duplicate region key '${key}'`);
    }
    regionKeys.add(key);

    const expectedPath = getHeightRegionPath(x, z);
    if (entry.path !== expectedPath) {
      throw new Error(`Terrain height manifest has invalid region path '${String(entry.path)}'`);
    }

    return {
      key,
      x,
      z,
      path: expectedPath,
      pages: normalizeTerrainHeightRegionPages(
        entry.pages,
        pageResolution,
        regionSizePages,
        key,
        pageKeys,
      ),
    };
  });

  return regions.sort((left, right) => compareRegionCoords(left.x, left.z, right.x, right.z));
}

function normalizeTerrainHeightRegionPages(
  value: unknown,
  pageResolution: number,
  regionSizePages: number,
  regionKey: string,
  seenPageKeys: Set<string>,
): TerrainHeightRegionPage[] {
  if (!Array.isArray(value)) {
    throw new Error(`Terrain height manifest region '${regionKey}' pages must be an array`);
  }

  const expectedByteLength = getExpectedHeightPageByteLength(pageResolution);
  const pages = value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error(`Terrain height manifest region '${regionKey}' page must be an object`);
    }

    if (typeof entry.key !== "string") {
      throw new Error(`Terrain height manifest region '${regionKey}' page key must be a string`);
    }

    parsePageKey(entry.key);
    if (seenPageKeys.has(entry.key)) {
      throw new Error(`Terrain height manifest has duplicate page key '${entry.key}'`);
    }
    seenPageKeys.add(entry.key);

    const pageRegion = getHeightRegionCoordsForPageKey(entry.key, regionSizePages);
    if (heightRegionKey(pageRegion.x, pageRegion.z) !== regionKey) {
      throw new Error(`Terrain height manifest page '${entry.key}' is assigned to the wrong region`);
    }

    const offset = readNonNegativeInteger(entry.offset, `height page '${entry.key}' offset`);
    const byteLength = readNonNegativeInteger(entry.byteLength, `height page '${entry.key}' byte length`);
    if (byteLength !== expectedByteLength) {
      throw new Error(`Terrain height manifest page '${entry.key}' has invalid byte length`);
    }

    return { key: entry.key, offset, byteLength };
  }).sort((left, right) => left.offset - right.offset);

  for (let index = 0; index < pages.length; index += 1) {
    const expectedOffset = index * expectedByteLength;
    if (pages[index]!.offset !== expectedOffset) {
      throw new Error(`Terrain height manifest region '${regionKey}' pages must be tightly packed`);
    }
  }

  return pages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Map manifest has invalid ${label}`);
  }

  return value;
}

function readNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Map manifest has invalid ${label}`);
  }

  return value;
}

function normalizeHeightManifestSettings(
  pageResolution: unknown,
  pageSizeMeters: unknown,
  regionSizePages: unknown,
): { pageResolution: number; pageSizeMeters: number; regionSizePages: number } {
  if (typeof pageResolution !== "number" || !Number.isFinite(pageResolution) || pageResolution <= 1) {
    throw new Error("Terrain height manifest has invalid page resolution");
  }

  if (typeof pageSizeMeters !== "number" || !Number.isFinite(pageSizeMeters) || pageSizeMeters <= 0) {
    throw new Error("Terrain height manifest has invalid page size");
  }

  if (typeof regionSizePages !== "number" || !Number.isInteger(regionSizePages) || regionSizePages <= 0) {
    throw new Error("Terrain height manifest has invalid region size");
  }

  return { pageResolution, pageSizeMeters, regionSizePages };
}

function validateHeightPageLength(heights: Float32Array, pageResolution: number): void {
  const expectedLength = pageResolution * pageResolution;
  if (heights.length !== expectedLength) {
    throw new Error(`Invalid height page length: expected ${expectedLength}, got ${heights.length}`);
  }
}

function compareRegionCoords(leftX: number, leftZ: number, rightX: number, rightZ: number): number {
  return leftZ - rightZ || leftX - rightX;
}