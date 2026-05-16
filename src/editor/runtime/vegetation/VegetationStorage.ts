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
  serializeVegetationManifest,
  type VegetationManifest,
  type VegetationMapData,
} from "@game/world/vegetation";

const platform = getPlatform();

export class VegetationStorage {
  static async loadVegetationData(mapDirectory: string): Promise<VegetationMapData> {
    const jsonPath = `${mapDirectory}/${VEGETATION_MODELS_PATH}`;

    try {
      const manifest = deserializeVegetationManifest(await platform.files.readText(jsonPath));
      const cellEntries = await Promise.all(
        Object.entries(manifest.instances.cells).map(async ([key, reference]) => {
          const base64 = await platform.files.readBinaryBase64(`${mapDirectory}/${reference.path}`);
          return [key, base64ToUint8Array(base64)] as const;
        }),
      );
      return createVegetationDataFromManifest(manifest, Object.fromEntries(cellEntries));
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
  }

  static async saveVegetationData(
    mapDirectory: string,
    data: VegetationMapData,
    cellSizeMeters: number,
  ): Promise<void> {
    const jsonPath = `${mapDirectory}/${VEGETATION_MODELS_PATH}`;
    const previousCellPaths = await loadPreviousCellPaths(jsonPath);
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

async function loadPreviousCellPaths(jsonPath: string): Promise<Set<string>> {
  try {
    const manifest = deserializeVegetationManifest(await platform.files.readText(jsonPath));
    return getManifestCellPaths(manifest);
  } catch (error) {
    if (!isMissingFileSystemResourceError(error)) {
      console.warn(`[VegetationStorage] Ignoring previous vegetation manifest during cleanup: ${jsonPath}`, error);
    }

    return new Set();
  }
}

function getManifestCellPaths(manifest: VegetationManifest): Set<string> {
  return new Set(Object.values(manifest.instances.cells).map((reference) => reference.path));
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