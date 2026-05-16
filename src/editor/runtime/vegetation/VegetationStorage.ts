// VegetationStorage: load and save vegetation model manifests plus binary instance cells.
// VegetationStorage：加载与保存植被模型清单及二进制实例 cell。

import { getPlatform } from "@/platform";
import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import {
  VEGETATION_MODELS_PATH,
  createVegetationDataFromManifest,
  createVegetationStoragePayload,
  createEmptyVegetationData,
  deserializeVegetationManifest,
  getVegetationCellPathForKey,
  serializeVegetationManifest,
  type VegetationMapData,
} from "@game/world/vegetation";
import { sortPageKeys, type MapData } from "@project/MapData";

const platform = getPlatform();

export class VegetationStorage {
  static async loadVegetationData(mapDirectory: string, mapData?: MapData | null): Promise<VegetationMapData> {
    const jsonPath = `${mapDirectory}/${VEGETATION_MODELS_PATH}`;
    let manifestText: string;

    try {
      manifestText = await platform.files.readText(jsonPath);
    } catch (error) {
      if (isMissingFileSystemResourceError(error)) {
        console.warn(`[VegetationStorage] Vegetation data not found: ${jsonPath}`, error);
        return createEmptyVegetationData();
      }

      console.error(
        `[VegetationStorage] Failed to load vegetation data: ${jsonPath}: ${formatUnknownError(error)}`,
        error,
      );
      throw error;
    }

    try {
      const manifest = deserializeVegetationManifest(manifestText);
      const cellKeys = mapData?.vegetation.cellKeys ?? [];
      const cellEntries = await Promise.all(
        sortPageKeys(cellKeys).map(async (key) => {
          const base64 = await platform.files.readBinaryBase64(`${mapDirectory}/${getVegetationCellPathForKey(key)}`);
          return [key, base64ToUint8Array(base64)] as const;
        }),
      );
      return createVegetationDataFromManifest(manifest, Object.fromEntries(cellEntries));
    } catch (error) {
      console.error(
        `[VegetationStorage] Failed to load vegetation data: ${jsonPath}: ${formatUnknownError(error)}`,
        error,
      );
      throw error;
    }
  }

  static async saveVegetationData(
    mapDirectory: string,
    data: VegetationMapData,
    cellSizeMeters: number,
    previousCellKeys: Iterable<string> = [],
  ): Promise<void> {
    const jsonPath = `${mapDirectory}/${VEGETATION_MODELS_PATH}`;
    const previousCellPaths = new Set(sortPageKeys(previousCellKeys).map(getVegetationCellPathForKey));
    const { manifest, cells } = createVegetationStoragePayload(data, cellSizeMeters);

    // EN: Instance cell files are written before the manifest so the manifest never points at missing binary data.
    // 中文: 先写入实例 cell 文件，再写清单，避免清单指向尚未写好的二进制数据。
    await Promise.all(cells.map(async (cell) => {
      await platform.files.writeBinaryBase64(`${mapDirectory}/${cell.path}`, uint8ArrayToBase64(cell.bytes));
    }));

    await platform.files.writeText(jsonPath, serializeVegetationManifest(manifest));

    const nextCellPaths = new Set(cells.map((cell) => cell.path));
    await removeStaleCells(mapDirectory, previousCellPaths, nextCellPaths);
  }
}

async function removeStaleCells(
  mapDirectory: string,
  previousCellPaths: ReadonlySet<string>,
  nextCellPaths: ReadonlySet<string>,
): Promise<void> {
  await Promise.all(Array.from(previousCellPaths).map(async (path) => {
    if (nextCellPaths.has(path)) {
      return;
    }

    try {
      await platform.files.deleteFile(`${mapDirectory}/${path}`);
    } catch (error) {
      console.warn(`[VegetationStorage] Failed to delete stale vegetation cell: ${path}`, error);
    }
  }));
}