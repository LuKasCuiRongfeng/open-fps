// VegetationStorage: load and save vegetation.json in project map directories.
// VegetationStorage：加载与保存项目地图目录中的 vegetation.json。

import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import {
  VEGETATION_FILE_NAME,
  createEmptyVegetationData,
  deserializeVegetationData,
  serializeVegetationData,
  type VegetationMapData,
} from "@game/world/vegetation";

const platform = getPlatform();

export class VegetationStorage {
  static async loadVegetationData(mapDirectory: string): Promise<VegetationMapData> {
    const jsonPath = `${mapDirectory}/${VEGETATION_FILE_NAME}`;

    try {
      return deserializeVegetationData(await platform.files.readText(jsonPath));
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
    await platform.files.writeText(jsonPath, serializeVegetationData(data));
  }
}