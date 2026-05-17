// TextureStorage: versioned paint sidecar manifest and RGBA8 region-pack storage.
// TextureStorage：版本化 paint sidecar 清单与 RGBA8 region pack 存储。

import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import { commitSidecarAsset, writeSidecarRegionPacks } from "@workspace/SidecarAssetCommit";
import {
  createSidecarRegionIntegrityMap,
  validateSidecarRegionIntegrity,
  type SidecarRegionIntegrityMap,
} from "@workspace/SidecarAssetIntegrity";
import {
  MAP_PAINT_PATH,
  assemblePaintSplatMapPixels,
  createPaintDataForMap,
  createPaintRegionPackPayload,
  decodePaintRegionPackBase64,
  getExpectedPaintRegionPageByteLength,
  getPaintRegionPages,
  getPaintRegionPathForKey,
  getPaintRegions,
  type MapData,
  type PaintRegionManifest,
  type PaintRegionPackPayload,
} from "@project/MapData";
import {
  createPaintDataFromManifest,
  createDefaultSplatMap,
  createPaintManifest,
  deserializePaintManifest,
  serializePaintManifest,
  type PaintManifest,
  type SplatMapData,
  type TextureDefinition,
} from "@game/world/terrain/TextureData";

const platform = getPlatform();

interface SavePaintPagesOptions {
  dirtyRegionKeys?: readonly string[];
}

export function getPaintSplatMapIndices(splatMapCount: number): number[] {
  return Array.from({ length: splatMapCount }, (_, index) => index);
}

export class TextureStorage {
  static async loadPaintManifest(mapDirectory: string, mapData?: MapData | null): Promise<PaintManifest | null> {
    const jsonPath = `${mapDirectory}/${mapData?.paintPath ?? MAP_PAINT_PATH}`;

    try {
      const content = await platform.files.readText(jsonPath);
      const manifest = deserializePaintManifest(content);
      if (mapData) {
        mapData.paint = createPaintDataFromManifest(manifest);
      }

      return manifest;
    } catch (error) {
      if (isMissingFileSystemResourceError(error)) {
        return null;
      }

      console.error(
        `[TextureStorage] Failed to load paint manifest: ${jsonPath}: ${formatUnknownError(error)}`,
        error,
      );
      throw error;
    }
  }

  static async loadTextureDefinition(mapDirectory: string, mapData?: MapData | null): Promise<TextureDefinition | null> {
    return (await this.loadPaintManifest(mapDirectory, mapData))?.layers ?? null;
  }

  static async saveTextureDefinition(
    mapDirectory: string,
    definition: TextureDefinition,
    mapData: MapData,
  ): Promise<void> {
    const jsonPath = `${mapDirectory}/${mapData.paintPath}`;
    const manifest = createPaintManifest(definition, mapData.paint);
    await platform.files.writeText(jsonPath, serializePaintManifest(manifest));
  }

  static async loadPaintPage(
    mapDirectory: string,
    mapData: MapData,
    splatMapIndex: number,
  ): Promise<SplatMapData | null> {
    const pages = await this.loadPaintPages(mapDirectory, mapData, splatMapIndex + 1);
    return pages[splatMapIndex] ?? null;
  }

  static async loadPaintPages(
    mapDirectory: string,
    mapData: MapData,
    splatMapCount: number,
  ): Promise<(SplatMapData | null)[]> {
    const regions = getPaintRegions(mapData.paint);
    try {
      const regionEntries = await Promise.all(regions.map(async (region) => {
        const base64 = await platform.files.readBinaryBase64(`${mapDirectory}/${region.path}`);
        const bytes = decodePaintRegionPackBase64(base64);
        validatePaintRegionPackByteLength(mapData, region, bytes);
        if (!region.integrity) {
          throw new Error(`Paint region pack '${region.key}' is missing integrity metadata`);
        }
        await validateSidecarRegionIntegrity("Paint region pack", region.key, bytes, region.integrity);
        return [region.key, bytes] as const;
      }));
      const regionBytesByKey = Object.fromEntries(regionEntries);
      return Array.from({ length: splatMapCount }, (_, index) => {
        if (!mapData.paint.splatMaps.indices.includes(index)) {
          return null;
        }

        return {
          resolution: mapData.paint.splatMaps.resolution,
          pixels: assemblePaintSplatMapPixels(
            mapData.paint,
            mapData.worldSizeMeters,
            mapData.pageSizeMeters,
            index,
            regionBytesByKey,
          ),
          splatMapIndex: index,
        };
      });
    } catch (error) {
      console.error(`[TextureStorage] Failed to load paint regions: ${formatUnknownError(error)}`, error);
      throw error;
    }
  }

  static async savePaintData(
    mapDirectory: string,
    definition: TextureDefinition,
    mapData: MapData,
    splatMaps: readonly SplatMapData[],
    options: SavePaintPagesOptions = {},
  ): Promise<void> {
    const commit = preparePaintRegionCommit(mapData, splatMaps, options);
    mapData.paint.splatMaps.regionIntegrity = await createSidecarRegionIntegrityMap(
      commit.regions,
      commit.keepPreviousIntegrity ? commit.previousRegionIntegrity : undefined,
    );
    await commitSidecarAsset({
      mapDirectory,
      manifestPath: mapData.paintPath,
      manifestText: serializePaintManifest(createPaintManifest(definition, mapData.paint)),
      regions: commit.regions,
      staleRegionPaths: commit.deleteStaleRegions ? commit.previousRegionPaths : undefined,
      staleDeleteLabel: "paint region",
    });
  }

  static async savePaintPages(
    mapDirectory: string,
    mapData: MapData,
    splatMaps: readonly SplatMapData[],
    options: SavePaintPagesOptions = {},
  ): Promise<void> {
    // EN: This writes binary packs only; use savePaintData when publishing a manifest-visible paint commit.
    // 中文: 这里只写二进制 pack；需要发布清单可见的绘制提交时应使用 savePaintData。
    const commit = preparePaintRegionCommit(mapData, splatMaps, options);
    await writeSidecarRegionPacks(mapDirectory, commit.regions);
  }

  static async ensurePaintPage(
    mapDirectory: string,
    mapData: MapData,
    splatMapIndex: number,
  ): Promise<void> {
    const existing = await this.loadPaintPage(mapDirectory, mapData, splatMapIndex);
    if (existing) return;

    const splatMaps = getPaintSplatMapIndices(Math.max(splatMapIndex + 1, mapData.paint.splatMaps.indices.length))
      .map((index) => createDefaultSplatMap(mapData.paint.splatMaps.resolution, index));
    await this.savePaintPages(mapDirectory, mapData, splatMaps);
  }
}

interface PreparedPaintRegionCommit {
  previousRegionPaths: ReadonlySet<string>;
  previousRegionIntegrity: SidecarRegionIntegrityMap;
  regions: PaintRegionPackPayload[];
  deleteStaleRegions: boolean;
  keepPreviousIntegrity: boolean;
}

function preparePaintRegionCommit(
  mapData: MapData,
  splatMaps: readonly SplatMapData[],
  options: SavePaintPagesOptions,
): PreparedPaintRegionCommit {
  const previousRegionPaths = new Set(Object.keys(mapData.paint.splatMaps.regions).map(getPaintRegionPathForKey));
  const previousRegionIntegrity = mapData.paint.splatMaps.regionIntegrity;
  const resolution = splatMaps[0]?.resolution ?? mapData.paint.splatMaps.resolution;
  const indices = getPaintSplatMapIndices(splatMaps.length);
  mapData.paint = createPaintDataForMap(mapData.worldSizeMeters, mapData.pageSizeMeters, indices, resolution);
  const dirtyRegionKeys = options.dirtyRegionKeys?.length ? options.dirtyRegionKeys : null;
  const regions = createPaintRegionPackPayload(
    mapData.paint,
    mapData.worldSizeMeters,
    mapData.pageSizeMeters,
    splatMaps,
    dirtyRegionKeys ?? undefined,
  );

  return {
    previousRegionPaths,
    previousRegionIntegrity,
    regions,
    deleteStaleRegions: !dirtyRegionKeys,
    keepPreviousIntegrity: Boolean(dirtyRegionKeys),
  };
}

function validatePaintRegionPackByteLength(
  mapData: MapData,
  region: PaintRegionManifest,
  bytes: Uint8Array,
): void {
  const paintData = mapData.paint.splatMaps;
  const pages = getPaintRegionPages(
    region,
    paintData.pageResolution,
    paintData.indices.length,
    paintData.regionSizePages,
  );
  const expectedByteLength = pages.length * getExpectedPaintRegionPageByteLength(
    paintData.pageResolution,
    paintData.indices.length,
  );
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(
      `Paint region pack '${region.key}' requires ${expectedByteLength} bytes, got ${bytes.byteLength}`,
    );
  }
}
