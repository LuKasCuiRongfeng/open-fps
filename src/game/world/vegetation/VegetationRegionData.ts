// VegetationRegionData: compact vegetation region pack helpers.
// VegetationRegionData：紧凑植被 region pack 辅助函数。

import { pageKey, parsePageKey } from "@project/MapData";

export const VEGETATION_REGIONS_DIRECTORY = "vegetation/regions";
export const VEGETATION_REGION_FORMAT = "vegetation-region-pack-v1";
export const VEGETATION_INSTANCE_FORMAT = "instanced-f32le-v1";
export const DEFAULT_VEGETATION_CELL_SIZE_METERS = 32;
export const DEFAULT_VEGETATION_REGION_SIZE_CELLS = 8;
export const VEGETATION_INSTANCE_RECORD_BYTE_LENGTH = 24;

const VEGETATION_REGION_PACK_MAGIC = 0x31475256;
const VEGETATION_REGION_PACK_VERSION = 1;
const VEGETATION_REGION_PACK_HEADER_BYTE_LENGTH = 8;
const VEGETATION_REGION_PACK_ENTRY_BYTE_LENGTH = 8;

export interface VegetationInstanceManifest {
  format: typeof VEGETATION_REGION_FORMAT;
  instanceFormat: typeof VEGETATION_INSTANCE_FORMAT;
  cellSizeMeters: number;
  regionSizeCells: number;
  regionsDirectory: typeof VEGETATION_REGIONS_DIRECTORY;
  regions: Record<string, string>;
  modelIds: string[];
}

export interface VegetationRegionPayload {
  key: string;
  path: string;
  bytes: Uint8Array;
}

export interface VegetationRegionManifest {
  key: string;
  x: number;
  z: number;
  path: string;
  mask: bigint;
}

export interface VegetationCellPayload {
  key: string;
  localIndex: number;
  bytes: Uint8Array;
}

export interface VegetationManifestWithRegions {
  instances: VegetationInstanceManifest;
}

export function getVegetationRegions(manifest: VegetationManifestWithRegions): VegetationRegionManifest[] {
  return Object.entries(manifest.instances.regions)
    .map(([key, maskHex]) => {
      const { x, z } = parseRegionKey(key);
      return {
        key,
        x,
        z,
        path: getVegetationRegionPath(x, z),
        mask: parseRegionMask(maskHex, key, manifest.instances.regionSizeCells),
      };
    })
    .sort((left, right) => compareRegionCoords(left, right));
}

export function getVegetationRegionPathForKey(key: string): string {
  const { x, z } = parseRegionKey(key);
  return getVegetationRegionPath(x, z);
}

export function getVegetationRegionPath(rx: number, rz: number): string {
  return `${VEGETATION_REGIONS_DIRECTORY}/r_${formatCellCoordinate(rx)}_${formatCellCoordinate(rz)}.vegpack`;
}

export function getVegetationRegionCoordsForCell(
  cx: number,
  cz: number,
  regionSizeCells: number,
): { x: number; z: number } {
  validateVegetationRegionSize(regionSizeCells);
  return {
    x: Math.floor(cx / regionSizeCells),
    z: Math.floor(cz / regionSizeCells),
  };
}

export function getVegetationRegionLocalCellIndex(cx: number, cz: number, regionSizeCells: number): number {
  const region = getVegetationRegionCoordsForCell(cx, cz, regionSizeCells);
  const localX = cx - region.x * regionSizeCells;
  const localZ = cz - region.z * regionSizeCells;
  return localZ * regionSizeCells + localX;
}

export function vegetationRegionKey(x: number, z: number): string {
  return pageKey(x, z);
}

export function normalizeVegetationRegions(value: unknown, regionSizeCells: number): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error("Vegetation instance manifest must contain region masks");
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, maskValue]) => {
        const { x, z } = parseRegionKey(key);
        const normalizedKey = vegetationRegionKey(x, z);
        if (key !== normalizedKey) {
          throw new Error(`Vegetation instance manifest has invalid region key '${key}'`);
        }

        return [key, formatRegionMask(parseRegionMask(maskValue, key, regionSizeCells))] as const;
      })
      .sort(([left], [right]) => compareRegionKeys(left, right)),
  );
}

export function parseRegionKey(key: string): { x: number; z: number } {
  const { px, pz } = parsePageKey(key);
  return { x: px, z: pz };
}

export function parseRegionMask(value: unknown, regionKeyValue: string, regionSizeCells: number): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`Vegetation region '${regionKeyValue}' mask must be a hex string`);
  }

  const mask = BigInt(value);
  if (mask <= 0n || mask > getVegetationRegionMaxMask(regionSizeCells)) {
    throw new Error(`Vegetation region '${regionKeyValue}' has invalid sparse cell mask`);
  }

  return mask;
}

export function formatRegionMask(mask: bigint): string {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}

export function validateVegetationRegionSize(regionSizeCells: number): void {
  if (!Number.isInteger(regionSizeCells) || regionSizeCells <= 0 || regionSizeCells * regionSizeCells > 64) {
    throw new Error("Vegetation region size must fit in a 64-bit sparse cell mask");
  }
}

export function compareRegionKeys(left: string, right: string): number {
  return compareRegionCoords(parseRegionKey(left), parseRegionKey(right));
}

export function compareRegionCoords(
  left: { x: number; z: number },
  right: { x: number; z: number },
): number {
  return left.z - right.z || left.x - right.x;
}

export function encodeVegetationRegionPack(cells: readonly VegetationCellPayload[]): Uint8Array {
  const payloadByteLength = cells.reduce((total, cell) => {
    if (cell.bytes.byteLength % VEGETATION_INSTANCE_RECORD_BYTE_LENGTH !== 0) {
      throw new Error(`Vegetation cell '${cell.key}' has invalid byte length ${cell.bytes.byteLength}`);
    }

    return total + cell.bytes.byteLength;
  }, 0);
  const indexByteLength = VEGETATION_REGION_PACK_HEADER_BYTE_LENGTH
    + cells.length * VEGETATION_REGION_PACK_ENTRY_BYTE_LENGTH;
  const bytes = new Uint8Array(indexByteLength + payloadByteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, VEGETATION_REGION_PACK_MAGIC, true);
  view.setUint16(4, VEGETATION_REGION_PACK_VERSION, true);
  view.setUint16(6, cells.length, true);

  let payloadOffset = indexByteLength;
  cells.forEach((cell, index) => {
    const entryOffset = VEGETATION_REGION_PACK_HEADER_BYTE_LENGTH
      + index * VEGETATION_REGION_PACK_ENTRY_BYTE_LENGTH;
    view.setUint16(entryOffset, cell.localIndex, true);
    view.setUint16(entryOffset + 2, 0, true);
    view.setUint32(entryOffset + 4, cell.bytes.byteLength / VEGETATION_INSTANCE_RECORD_BYTE_LENGTH, true);
    bytes.set(cell.bytes, payloadOffset);
    payloadOffset += cell.bytes.byteLength;
  });

  return bytes;
}

export function decodeVegetationRegionPack(
  region: VegetationRegionManifest,
  regionSizeCells: number,
  bytes: Uint8Array,
): Array<{ key: string; bytes: Uint8Array }> {
  if (bytes.byteLength < VEGETATION_REGION_PACK_HEADER_BYTE_LENGTH) {
    throw new Error(`Vegetation region '${region.key}' pack is too short`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== VEGETATION_REGION_PACK_MAGIC) {
    throw new Error(`Vegetation region '${region.key}' has invalid pack magic`);
  }

  if (view.getUint16(4, true) !== VEGETATION_REGION_PACK_VERSION) {
    throw new Error(`Vegetation region '${region.key}' has unsupported pack version`);
  }

  const cellCount = view.getUint16(6, true);
  if (cellCount !== countSetBits(region.mask)) {
    throw new Error(`Vegetation region '${region.key}' cell count does not match its sparse mask`);
  }

  const indexByteLength = VEGETATION_REGION_PACK_HEADER_BYTE_LENGTH
    + cellCount * VEGETATION_REGION_PACK_ENTRY_BYTE_LENGTH;
  if (bytes.byteLength < indexByteLength) {
    throw new Error(`Vegetation region '${region.key}' pack has a truncated cell index`);
  }

  const entries: Array<{ key: string; localIndex: number; byteLength: number }> = [];
  let entryMask = 0n;
  let previousLocalIndex = -1;
  for (let index = 0; index < cellCount; index += 1) {
    const entryOffset = VEGETATION_REGION_PACK_HEADER_BYTE_LENGTH
      + index * VEGETATION_REGION_PACK_ENTRY_BYTE_LENGTH;
    const localIndex = view.getUint16(entryOffset, true);
    const instanceCount = view.getUint32(entryOffset + 4, true);
    if (!hasRegionCell(region.mask, localIndex)) {
      throw new Error(`Vegetation region '${region.key}' pack contains undeclared cell ${localIndex}`);
    }

    if (localIndex <= previousLocalIndex) {
      throw new Error(`Vegetation region '${region.key}' pack cell index is not sorted`);
    }
    previousLocalIndex = localIndex;

    const localBit = 1n << BigInt(localIndex);
    if ((entryMask & localBit) !== 0n) {
      throw new Error(`Vegetation region '${region.key}' pack has duplicate cell ${localIndex}`);
    }

    entryMask |= localBit;
    entries.push({
      key: getVegetationRegionCellKey(region.x, region.z, localIndex, regionSizeCells),
      localIndex,
      byteLength: instanceCount * VEGETATION_INSTANCE_RECORD_BYTE_LENGTH,
    });
  }

  if (entryMask !== region.mask) {
    throw new Error(`Vegetation region '${region.key}' pack cells do not match its sparse mask`);
  }

  let payloadOffset = indexByteLength;
  const cells = entries.map((entry) => {
    const nextOffset = payloadOffset + entry.byteLength;
    if (nextOffset > bytes.byteLength) {
      throw new Error(`Vegetation region '${region.key}' pack is missing bytes for cell '${entry.key}'`);
    }

    const cellBytes = bytes.subarray(payloadOffset, nextOffset);
    payloadOffset = nextOffset;
    return { key: entry.key, bytes: cellBytes };
  });

  if (payloadOffset !== bytes.byteLength) {
    throw new Error(`Vegetation region '${region.key}' pack has trailing bytes`);
  }

  return cells;
}

function getVegetationRegionCellKey(
  regionX: number,
  regionZ: number,
  localIndex: number,
  regionSizeCells: number,
): string {
  const localX = localIndex % regionSizeCells;
  const localZ = Math.floor(localIndex / regionSizeCells);
  return pageKey(regionX * regionSizeCells + localX, regionZ * regionSizeCells + localZ);
}

function getVegetationRegionMaxMask(regionSizeCells: number): bigint {
  return (1n << BigInt(regionSizeCells * regionSizeCells)) - 1n;
}

function hasRegionCell(mask: bigint, localIndex: number): boolean {
  return (mask & (1n << BigInt(localIndex))) !== 0n;
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

function formatCellCoordinate(value: number): string {
  if (!Number.isInteger(value)) {
    throw new Error(`Vegetation cell coordinate must be an integer: ${value}`);
  }

  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
