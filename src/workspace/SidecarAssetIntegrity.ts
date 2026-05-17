// SidecarAssetIntegrity: content metadata for region-pack sidecar assets.
// SidecarAssetIntegrity：region pack sidecar 资产的内容完整性元数据。

export interface SidecarRegionPayloadForIntegrity {
  key: string;
  bytes: Uint8Array;
}

export interface SidecarRegionIntegrity {
  byteLength: number;
  sha256: string;
}

export type SidecarRegionIntegrityMap = Record<string, SidecarRegionIntegrity>;

export async function createSidecarRegionIntegrityMap(
  regions: readonly SidecarRegionPayloadForIntegrity[],
  baseIntegrity: SidecarRegionIntegrityMap = {},
): Promise<SidecarRegionIntegrityMap> {
  const entries = await Promise.all(regions.map(async (region) => [
    region.key,
    {
      byteLength: region.bytes.byteLength,
      sha256: await createSha256Hex(region.bytes),
    },
  ] as const));

  return Object.fromEntries(
    Object.entries({ ...baseIntegrity, ...Object.fromEntries(entries) })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export async function validateSidecarRegionIntegrity(
  label: string,
  regionKey: string,
  bytes: Uint8Array,
  integrity: SidecarRegionIntegrity,
): Promise<void> {
  if (bytes.byteLength !== integrity.byteLength) {
    throw new Error(
      `${label} '${regionKey}' requires ${integrity.byteLength} bytes, got ${bytes.byteLength}`,
    );
  }

  const sha256 = await createSha256Hex(bytes);
  if (sha256 !== integrity.sha256) {
    throw new Error(`${label} '${regionKey}' content hash mismatch`);
  }
}

export function normalizeSidecarRegionIntegrityMap(
  value: unknown,
  regionKeys: readonly string[],
  label: string,
): SidecarRegionIntegrityMap {
  if (!isRecord(value)) {
    throw new Error(`${label} must contain region integrity metadata`);
  }

  const expectedKeys = [...regionKeys].sort((left, right) => left.localeCompare(right));
  const actualKeys = Object.keys(value).sort((left, right) => left.localeCompare(right));
  if (expectedKeys.length !== actualKeys.length || expectedKeys.some((key, index) => key !== actualKeys[index])) {
    throw new Error(`${label} region integrity keys must match region masks`);
  }

  return Object.fromEntries(expectedKeys.map((key) => [key, normalizeSidecarRegionIntegrity(value[key], key, label)]));
}

async function createSha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 hashing requires Web Crypto support");
  }

  const source = bytes.buffer instanceof ArrayBuffer
    && bytes.byteOffset === 0
    && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeSidecarRegionIntegrity(
  value: unknown,
  regionKey: string,
  label: string,
): SidecarRegionIntegrity {
  if (!isRecord(value)) {
    throw new Error(`${label} for region '${regionKey}' must be an object`);
  }

  const byteLength = value.byteLength;
  if (!Number.isInteger(byteLength) || typeof byteLength !== "number" || byteLength < 0) {
    throw new Error(`${label} for region '${regionKey}' must contain a non-negative byteLength`);
  }

  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(value.sha256)) {
    throw new Error(`${label} for region '${regionKey}' must contain a SHA-256 hex digest`);
  }

  return {
    byteLength,
    sha256: value.sha256.toLowerCase(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}