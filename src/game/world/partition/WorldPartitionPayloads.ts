// WorldPartitionPayloads: runtime payload contracts for cooked world partition cells.
// WorldPartitionPayloads：cooked 世界分区 cell 的运行时 payload 契约。

import type { WorldObjectCellPack } from "../objects";

export type { WorldObjectCellPack, WorldObjectEntry, WorldObjectLayer } from "../objects";

export interface WorldCollisionCellPack {
  version: 1;
  format: "world-collision-cell-pack-v1";
  cell: { key: string };
  shapes: WorldCollisionShape[];
}

export interface WorldCollisionShape {
  id: string;
  type: string;
  objectId?: string;
  position?: { x: number; y: number; z: number };
  boundsMeters?: WorldBoundsMeters;
  radiusMeters?: number;
  heightMeters?: number;
}

export interface WorldNavCellPack {
  version: 1;
  format: "world-nav-cell-pack-v1";
  cell: { key: string };
  nodes: WorldNavNode[];
  links: WorldNavLink[];
  crossCellLinks?: WorldNavCrossCellLink[];
}

export interface WorldNavNode {
  id: string;
  x: number;
  z: number;
  position: { x: number; y: number; z: number };
  walkable: boolean;
  cost: number;
}

export interface WorldNavLink {
  from: string;
  to: string;
  cost: number;
}

export interface WorldNavCrossCellLink {
  from: string;
  edge: "north" | "south" | "east" | "west";
  targetCell: string;
  sourceCell: string;
  cost: number;
  portalMeters: { x: number; z: number };
}

export interface WorldBoundsMeters {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function isWorldObjectCellPack(value: unknown): value is WorldObjectCellPack {
  return isRecord(value)
    && value.version === 1
    && value.format === "world-object-cell-pack-v1"
    && isRecord(value.cell)
    && typeof value.cell.key === "string"
    && Array.isArray(value.objects);
}

export function isWorldCollisionCellPack(value: unknown): value is WorldCollisionCellPack {
  return isRecord(value)
    && value.version === 1
    && value.format === "world-collision-cell-pack-v1"
    && isRecord(value.cell)
    && typeof value.cell.key === "string"
    && Array.isArray(value.shapes);
}

export function isWorldNavCellPack(value: unknown): value is WorldNavCellPack {
  return isRecord(value)
    && value.version === 1
    && value.format === "world-nav-cell-pack-v1"
    && isRecord(value.cell)
    && typeof value.cell.key === "string"
    && Array.isArray(value.nodes)
    && Array.isArray(value.links);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}