// SidecarPatchLayers: non-destructive patch-layer metadata shared by region-pack assets.
// SidecarPatchLayers：region-pack 资产共用的非破坏 patch layer 元数据。

export type SidecarPatchLayerKind = "base" | "manual" | "generated" | "procedural";

export interface SidecarPatchLayer {
  id: string;
  label: string;
  kind: SidecarPatchLayerKind;
  order: number;
  enabled: boolean;
  regions: string[];
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SidecarPatchLayerManifest {
  mode: typeof SIDECAR_PATCH_LAYER_MODE;
  activeLayerId: string;
  layers: SidecarPatchLayer[];
}

export const SIDECAR_PATCH_LAYER_MODE = "ordered-nondestructive-v1";

export function createDefaultSidecarPatchLayers(regionKeys: Iterable<string>, label = "Base"): SidecarPatchLayerManifest {
  return {
    mode: SIDECAR_PATCH_LAYER_MODE,
    activeLayerId: "base",
    layers: [{
      id: "base",
      label,
      kind: "base",
      order: 0,
      enabled: true,
      regions: sortGridKeys(regionKeys),
    }],
  };
}

export function normalizeSidecarPatchLayers(
  value: unknown,
  regionKeys: Iterable<string>,
  label: string,
): SidecarPatchLayerManifest {
  const availableRegions = new Set(sortGridKeys(regionKeys));
  if (!isRecord(value)) {
    return createDefaultSidecarPatchLayers(availableRegions, label);
  }

  if (value.mode !== SIDECAR_PATCH_LAYER_MODE || !Array.isArray(value.layers)) {
    return createDefaultSidecarPatchLayers(availableRegions, label);
  }

  const layers = value.layers.flatMap((entry, index): SidecarPatchLayer[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = readSafeId(entry.id) ?? `layer-${index}`;
    const kind = normalizeLayerKind(entry.kind);
    const regions = Array.isArray(entry.regions)
      ? sortGridKeys(entry.regions.filter((region) => typeof region === "string" && availableRegions.has(region)))
      : [];

    return [{
      id,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label : id,
      kind,
      order: Number.isFinite(entry.order) ? Number(entry.order) : index,
      enabled: entry.enabled !== false,
      regions,
      source: typeof entry.source === "string" ? entry.source : undefined,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : undefined,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
    }];
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  if (!layers.some((layer) => layer.kind === "base")) {
    layers.unshift(createDefaultSidecarPatchLayers(availableRegions, label).layers[0]);
  }

  const activeLayerId = typeof value.activeLayerId === "string" && layers.some((layer) => layer.id === value.activeLayerId)
    ? value.activeLayerId
    : layers[0]?.id ?? "base";

  return {
    mode: SIDECAR_PATCH_LAYER_MODE,
    activeLayerId,
    layers,
  };
}

function normalizeLayerKind(value: unknown): SidecarPatchLayerKind {
  return value === "manual" || value === "generated" || value === "procedural" ? value : "base";
}

function readSafeId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]*$/i.test(value) ? value : null;
}

function sortGridKeys(keys: Iterable<string>): string[] {
  return [...new Set(keys)].sort((left, right) => {
    const leftKey = parseGridKey(left);
    const rightKey = parseGridKey(right);
    return leftKey.z - rightKey.z || leftKey.x - rightKey.x;
  });
}

function parseGridKey(key: string): { x: number; z: number } {
  const [xPart, zPart] = key.split(",");
  const x = Number(xPart);
  const z = Number(zPart);
  return { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}