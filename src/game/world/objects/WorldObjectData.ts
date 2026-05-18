// WorldObjectData: shared source/cooked world-object schemas.
// WorldObjectData：source/cooked 世界对象共享结构。

export type WorldObjectLayer = "road" | "water" | "poi" | "prop" | string;

export type WorldObjectRenderKind = "none" | "ribbon" | "gltf";

export interface WorldObjectVector2 {
  x: number;
  z: number;
}

export interface WorldObjectVector3 extends WorldObjectVector2 {
  y: number;
}

export interface WorldObjectBoundsMeters {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface WorldObjectSpline {
  widthMeters?: number;
  points?: WorldObjectVector2[];
}

export interface WorldObjectCollisionDefinition {
  type?: "box" | "cylinder" | string;
  radiusMeters?: number;
  heightMeters?: number;
}

export interface WorldObjectEntry {
  id: string;
  layer: WorldObjectLayer;
  archetype: string;
  position: WorldObjectVector3;
  rotationY?: number;
  scale?: number;
  radiusMeters?: number;
  boundsMeters?: WorldObjectBoundsMeters;
  spline?: WorldObjectSpline;
  tags?: string[];
  collision?: WorldObjectCollisionDefinition | false;
}

export interface WorldObjectCellInfo {
  key: string;
  x: number;
  z: number;
  pageRect?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  boundsMeters?: WorldObjectBoundsMeters;
}

export interface WorldObjectCellPack {
  version?: number;
  format?: string;
  cell?: WorldObjectCellInfo;
  objects: WorldObjectEntry[];
}

export interface WorldObjectCellRef {
  path: string;
  objectCount: number;
  byteLength?: number;
  sha256?: string;
}

export interface WorldObjectRenderDefinition {
  kind?: WorldObjectRenderKind;
  path?: string;
  lod1Path?: string;
  lod1DistanceMeters?: number;
  lod2Path?: string;
  lod2DistanceMeters?: number;
  targetHeightMeters?: number;
  baseScale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  maxVisibleDistanceMeters?: number;
  shadowDistanceMeters?: number;
  ribbonMaterial?: "road" | "water" | string;
}

export interface WorldObjectEditorDefinition {
  icon?: string;
  color?: string;
  defaultRadiusMeters?: number;
  defaultScale?: number;
  placement?: "single" | "spline" | "prefab" | "scatter";
}

export interface WorldObjectScatterRuleDefinition {
  mode?: "manual" | "path" | "biome" | "prefab";
  densityPerSquareMeter?: number;
  minSpacingMeters?: number;
  alignToTerrain?: boolean;
  avoidLayers?: string[];
}

export interface WorldObjectValidationDefinition {
  maxSlopeDegrees?: number;
  requiresTerrain?: boolean;
  blocksNav?: boolean;
  clearsVegetation?: boolean;
}

export interface WorldObjectArchetypeDefinition {
  id?: string;
  layer: WorldObjectLayer;
  navCost?: number;
  clearsVegetation?: boolean;
  collision?: boolean | WorldObjectCollisionDefinition;
  render?: WorldObjectRenderDefinition;
  editor?: WorldObjectEditorDefinition;
  scatter?: WorldObjectScatterRuleDefinition;
  validation?: WorldObjectValidationDefinition;
  prefab?: Array<{
    archetype: string;
    offsetX?: number;
    offsetZ?: number;
    rotationY?: number;
    scale?: number;
  }>;
}

export interface WorldObjectManifest {
  version?: number;
  format?: string;
  cellFormat?: string;
  cellSizePages?: number;
  cellSizeMeters?: number;
  cellsDirectory?: string;
  designSource?: string;
  archetypes?: Record<string, WorldObjectArchetypeDefinition>;
  cells: Record<string, WorldObjectCellRef>;
}

export function cloneWorldObjectEntry(entry: WorldObjectEntry): WorldObjectEntry {
  return {
    ...entry,
    position: { ...entry.position },
    boundsMeters: entry.boundsMeters ? { ...entry.boundsMeters } : undefined,
    spline: entry.spline ? {
      ...entry.spline,
      points: entry.spline.points?.map((point) => ({ ...point })),
    } : undefined,
    tags: entry.tags ? [...entry.tags] : undefined,
    collision: entry.collision && typeof entry.collision === "object" ? { ...entry.collision } : entry.collision,
  };
}

export function cloneWorldObjectCellPack(pack: WorldObjectCellPack): WorldObjectCellPack {
  return {
    ...pack,
    cell: pack.cell ? {
      ...pack.cell,
      pageRect: pack.cell.pageRect ? { ...pack.cell.pageRect } : undefined,
      boundsMeters: pack.cell.boundsMeters ? { ...pack.cell.boundsMeters } : undefined,
    } : undefined,
    objects: pack.objects.map(cloneWorldObjectEntry),
  };
}

export function isGltfWorldObjectArchetype(
  archetype: WorldObjectArchetypeDefinition | undefined,
): archetype is WorldObjectArchetypeDefinition & { render: WorldObjectRenderDefinition & { path: string } } {
  return archetype?.render?.kind === "gltf" && typeof archetype.render.path === "string" && archetype.render.path.length > 0;
}

export function objectRadiusFromBounds(object: Pick<WorldObjectEntry, "boundsMeters" | "radiusMeters">, fallback = 2): number {
  const bounds = object.boundsMeters;
  if (!bounds) {
    return object.radiusMeters ?? fallback;
  }

  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.5;
}
