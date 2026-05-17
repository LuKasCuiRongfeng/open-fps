// VegetationStorage: load and save vegetation model manifests plus binary region packs.
// VegetationStorage：加载与保存植被模型清单及二进制 region pack。

import { getPlatform } from "@/platform";
import { base64ToUint8Array } from "@/lib/base64";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import { commitSidecarAsset } from "@workspace/SidecarAssetCommit";
import { createSidecarRegionIntegrityMap, validateSidecarRegionIntegrity } from "@workspace/SidecarAssetIntegrity";
import {
  DEFAULT_VEGETATION_CELL_SIZE_METERS,
  VEGETATION_MODELS_PATH,
  createVegetationDataFromManifest,
  createVegetationStoragePayload,
  createEmptyVegetationData,
  deserializeVegetationManifest,
  getVegetationRegionPathForKey,
  getVegetationRegions,
  serializeVegetationManifest,
  type VegetationMapData,
} from "@game/world/vegetation";
import { sortPageKeys, type MapData } from "@project/MapData";

const platform = getPlatform();

export interface VegetationStorageLoadResult {
  data: VegetationMapData;
  cellSizeMeters: number;
  regionKeys: string[];
}

export class VegetationStorage {
  static async loadVegetationData(mapDirectory: string, mapData?: MapData | null): Promise<VegetationStorageLoadResult> {
    const jsonPath = `${mapDirectory}/${mapData?.vegetationPath ?? VEGETATION_MODELS_PATH}`;
    let manifestText: string;

    try {
      manifestText = await platform.files.readText(jsonPath);
    } catch (error) {
      if (isMissingFileSystemResourceError(error)) {
        console.warn(`[VegetationStorage] Vegetation data not found: ${jsonPath}`, error);
        return {
          data: createEmptyVegetationData(),
          cellSizeMeters: DEFAULT_VEGETATION_CELL_SIZE_METERS,
          regionKeys: [],
        };
      }

      console.error(
        `[VegetationStorage] Failed to load vegetation data: ${jsonPath}: ${formatUnknownError(error)}`,
        error,
      );
      throw error;
    }

    try {
      const manifest = deserializeVegetationManifest(manifestText);
      const regions = getVegetationRegions(manifest);
      const regionEntries = await Promise.all(
        regions.map(async (region) => {
          const base64 = await platform.files.readBinaryBase64(`${mapDirectory}/${region.path}`);
          const bytes = base64ToUint8Array(base64);
          if (!region.integrity) {
            throw new Error(`Vegetation region '${region.key}' is missing integrity metadata`);
          }
          await validateSidecarRegionIntegrity("Vegetation region", region.key, bytes, region.integrity);
          return [region.key, bytes] as const;
        }),
      );
      return {
        data: createVegetationDataFromManifest(manifest, Object.fromEntries(regionEntries)),
        cellSizeMeters: manifest.instances.cellSizeMeters,
        regionKeys: regions.map((region) => region.key),
      };
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
    previousRegionKeys: Iterable<string> = [],
  ): Promise<void> {
    const previousRegionPaths = new Set(sortPageKeys(previousRegionKeys).map(getVegetationRegionPathForKey));
    const { manifest, regions } = createVegetationStoragePayload(data, cellSizeMeters);
    manifest.instances.regionIntegrity = await createSidecarRegionIntegrityMap(regions);

    await commitSidecarAsset({
      mapDirectory,
      manifestPath: VEGETATION_MODELS_PATH,
      manifestText: serializeVegetationManifest(manifest),
      regions,
      staleRegionPaths: previousRegionPaths,
      staleDeleteLabel: "vegetation region",
    });
  }
}
