// VegetationStorage: load and save vegetation manifests plus binary instance chunks.
// VegetationStorage：加载与保存植被清单及二进制实例 chunk。

import { terrainConfig } from "@config/terrain";
import { getPlatform } from "@/platform";
import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/base64";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import {
  VEGETATION_FILE_NAME,
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
    const jsonPath = `${mapDirectory}/${VEGETATION_FILE_NAME}`;

    try {
      const manifest = deserializeVegetationManifest(await platform.files.readText(jsonPath));
      const chunkEntries = await Promise.all(
        Object.entries(manifest.instances.chunks).map(async ([key, reference]) => {
          const base64 = await platform.files.readBinaryBase64(`${mapDirectory}/${reference.path}`);
          return [key, base64ToUint8Array(base64)] as const;
        }),
      );
      return createVegetationDataFromManifest(manifest, Object.fromEntries(chunkEntries));
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

  static async saveVegetationData(mapDirectory: string, data: VegetationMapData): Promise<void> {
    const jsonPath = `${mapDirectory}/${VEGETATION_FILE_NAME}`;
    const previousChunkPaths = await loadPreviousChunkPaths(jsonPath);
    const { manifest, chunks } = createVegetationStoragePayload(
      data,
      terrainConfig.streaming.pageSizeMeters,
    );

    // EN: Instance chunk files are written before the manifest so the manifest never points at missing binary data.
    // 中文: 先写入实例 chunk 文件，再写清单，避免清单指向尚未写好的二进制数据。
    await Promise.all(chunks.map(async (chunk) => {
      await platform.files.writeBinaryBase64(`${mapDirectory}/${chunk.path}`, uint8ArrayToBase64(chunk.bytes));
    }));

    await platform.files.writeText(jsonPath, serializeVegetationManifest(manifest));

    const nextChunkPaths = new Set(chunks.map((chunk) => chunk.path));
    await removeStaleChunks(mapDirectory, previousChunkPaths, nextChunkPaths);
  }
}

async function loadPreviousChunkPaths(jsonPath: string): Promise<Set<string>> {
  try {
    const manifest = deserializeVegetationManifest(await platform.files.readText(jsonPath));
    return getManifestChunkPaths(manifest);
  } catch (error) {
    if (!isMissingFileSystemResourceError(error)) {
      console.warn(`[VegetationStorage] Ignoring previous vegetation manifest during cleanup: ${jsonPath}`, error);
    }

    return new Set();
  }
}

function getManifestChunkPaths(manifest: VegetationManifest): Set<string> {
  return new Set(Object.values(manifest.instances.chunks).map((reference) => reference.path));
}

async function removeStaleChunks(
  mapDirectory: string,
  previousChunkPaths: ReadonlySet<string>,
  nextChunkPaths: ReadonlySet<string>,
): Promise<void> {
  await Promise.all(Array.from(previousChunkPaths).map(async (path) => {
    if (nextChunkPaths.has(path)) {
      return;
    }

    try {
      await platform.files.deleteFile(`${mapDirectory}/${path}`);
    } catch (error) {
      console.warn(`[VegetationStorage] Failed to delete stale vegetation chunk: ${path}`, error);
    }
  }));
}