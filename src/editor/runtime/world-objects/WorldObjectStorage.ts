// WorldObjectStorage: safe source sidecar load/save for authored world objects.
// WorldObjectStorage：世界对象 source sidecar 的安全读写。

import { getPlatform } from "@/platform";
import { base64ToUint8Array } from "@/lib/base64";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import { commitSidecarAsset } from "@workspace/SidecarAssetCommit";
import { createSidecarRegionIntegrityMap, validateSidecarRegionIntegrity } from "@workspace/SidecarAssetIntegrity";
import { MAP_WORLD_OBJECTS_PATH } from "@project/MapData";
import type { WorldObjectCellPack, WorldObjectManifest } from "@game/world/objects";
import { parseWorldObjectCellPack, parseWorldObjectManifest } from "./WorldObjectOverlay";

const platform = getPlatform();
const DEFAULT_CELL_SIZE_PAGES = 8;
const DEFAULT_CELL_SIZE_METERS = 512;
const DEFAULT_CELLS_DIRECTORY = "objects/cells";
const WORLD_OBJECT_MANIFEST_FORMAT = "world-object-manifest-v1";
const WORLD_OBJECT_CELL_FORMAT = "world-object-cell-pack-v1";

export interface WorldObjectStorageLoadResult {
  manifest: WorldObjectManifest;
  packs: Map<string, WorldObjectCellPack>;
  previousRegionPaths: Set<string>;
}

export class WorldObjectStorage {
  static async loadWorldObjectData(mapDirectory: string): Promise<WorldObjectStorageLoadResult> {
    const manifestPath = `${mapDirectory}/${MAP_WORLD_OBJECTS_PATH}`;
    let manifestText: string;

    try {
      manifestText = await platform.files.readText(manifestPath);
    } catch (error) {
      if (isMissingFileSystemResourceError(error)) {
        return {
          manifest: createEmptyWorldObjectManifest(),
          packs: new Map(),
          previousRegionPaths: new Set(),
        };
      }

      console.error(`[WorldObjectStorage] Failed to load world object manifest: ${formatUnknownError(error)}`, error);
      throw error;
    }

    const manifest = parseWorldObjectManifest(manifestText, manifestPath);
    const packs = new Map<string, WorldObjectCellPack>();
    const previousRegionPaths = new Set<string>();

    await Promise.all(Object.entries(manifest.cells).map(async ([key, cell]) => {
      previousRegionPaths.add(cell.path);
      const base64 = await platform.files.readBinaryBase64(`${mapDirectory}/${cell.path}`);
      const bytes = base64ToUint8Array(base64);
      if (cell.byteLength !== undefined && cell.sha256) {
        await validateSidecarRegionIntegrity("World object cell", key, bytes, {
          byteLength: cell.byteLength,
          sha256: cell.sha256,
        });
      }

      const pack = parseWorldObjectCellPack(new TextDecoder().decode(bytes), cell.path);
      if (pack.objects.length !== cell.objectCount) {
        throw new Error(`World object cell '${key}' object count is stale`);
      }
      packs.set(key, pack);
    }));

    return { manifest, packs, previousRegionPaths };
  }

  static async saveWorldObjectData(
    mapDirectory: string,
    manifest: WorldObjectManifest,
    packs: ReadonlyMap<string, WorldObjectCellPack>,
    previousRegionPaths: Iterable<string> = [],
  ): Promise<WorldObjectManifest> {
    const nextManifest: WorldObjectManifest = {
      ...manifest,
      version: manifest.version ?? 1,
      format: manifest.format ?? WORLD_OBJECT_MANIFEST_FORMAT,
      cellFormat: manifest.cellFormat ?? WORLD_OBJECT_CELL_FORMAT,
      cellSizePages: manifest.cellSizePages ?? DEFAULT_CELL_SIZE_PAGES,
      cellSizeMeters: manifest.cellSizeMeters ?? DEFAULT_CELL_SIZE_METERS,
      cellsDirectory: manifest.cellsDirectory ?? DEFAULT_CELLS_DIRECTORY,
      cells: {},
    };

    const regions = Array.from(packs.entries())
      .sort(([left], [right]) => compareCellKeys(left, right))
      .map(([key, pack]) => {
        const path = manifest.cells[key]?.path ?? getWorldObjectCellPackPath(key, nextManifest.cellsDirectory ?? DEFAULT_CELLS_DIRECTORY);
        const normalizedPack: WorldObjectCellPack = {
          ...pack,
          version: pack.version ?? 1,
          format: pack.format ?? WORLD_OBJECT_CELL_FORMAT,
          cell: pack.cell ?? createCellInfoFromKey(key, nextManifest.cellSizeMeters ?? DEFAULT_CELL_SIZE_METERS),
        };
        const bytes = new TextEncoder().encode(`${JSON.stringify(normalizedPack, null, 2)}\n`);
        return { key, path, bytes };
      });

    const integrity = await createSidecarRegionIntegrityMap(regions);
    for (const region of regions) {
      nextManifest.cells[region.key] = {
        path: region.path,
        objectCount: packs.get(region.key)?.objects.length ?? 0,
        ...integrity[region.key],
      };
    }

    await commitSidecarAsset({
      mapDirectory,
      manifestPath: MAP_WORLD_OBJECTS_PATH,
      manifestText: `${JSON.stringify(nextManifest, null, 2)}\n`,
      regions,
      staleRegionPaths: previousRegionPaths,
      staleDeleteLabel: "world object cell",
    });

    return nextManifest;
  }
}

export function createEmptyWorldObjectManifest(): WorldObjectManifest {
  return {
    version: 1,
    format: WORLD_OBJECT_MANIFEST_FORMAT,
    cellFormat: WORLD_OBJECT_CELL_FORMAT,
    cellSizePages: DEFAULT_CELL_SIZE_PAGES,
    cellSizeMeters: DEFAULT_CELL_SIZE_METERS,
    cellsDirectory: DEFAULT_CELLS_DIRECTORY,
    archetypes: {},
    cells: {},
  };
}

export function getWorldObjectCellKey(xMeters: number, zMeters: number, cellSizeMeters = DEFAULT_CELL_SIZE_METERS): string {
  return `${Math.floor(xMeters / cellSizeMeters)},${Math.floor(zMeters / cellSizeMeters)}`;
}

function getWorldObjectCellPackPath(key: string, cellsDirectory: string): string {
  const [x, z] = key.split(",").map(Number);
  return `${cellsDirectory}/c_${formatGridCoordinate(x)}_${formatGridCoordinate(z)}.objectpack`;
}

function formatGridCoordinate(value: number): string {
  return value < 0 ? `m${Math.abs(value)}` : `${value}`;
}

function createCellInfoFromKey(key: string, cellSizeMeters: number) {
  const [x, z] = key.split(",").map(Number);
  return {
    key,
    x,
    z,
    boundsMeters: {
      minX: x * cellSizeMeters,
      minZ: z * cellSizeMeters,
      maxX: (x + 1) * cellSizeMeters,
      maxZ: (z + 1) * cellSizeMeters,
    },
  };
}

function compareCellKeys(left: string, right: string): number {
  const [leftX, leftZ] = left.split(",").map(Number);
  const [rightX, rightZ] = right.split(",").map(Number);
  return leftZ - rightZ || leftX - rightX;
}
