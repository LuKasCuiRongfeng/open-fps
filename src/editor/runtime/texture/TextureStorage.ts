// TextureStorage: versioned paint sidecar manifest and RGBA8 region-pack storage.
// TextureStorage：版本化 paint sidecar 清单与 RGBA8 region pack 存储。

import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import {
  MAP_PAINT_PATH,
  assemblePaintSplatMapPixels,
  createPaintDataForMap,
  createPaintRegionPackPayload,
  decodePaintRegionPackBase64,
  encodePaintRegionPackBase64,
  getPaintRegionPathForKey,
  getPaintRegions,
  type MapData,
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
        return [region.key, decodePaintRegionPackBase64(base64)] as const;
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
      if (isMissingFileSystemResourceError(error)) {
        return Array.from({ length: splatMapCount }, () => null);
      }

      console.error(`[TextureStorage] Failed to load paint regions: ${formatUnknownError(error)}`, error);
      throw error;
    }
  }

  static async savePaintPages(
    mapDirectory: string,
    mapData: MapData,
    splatMaps: readonly SplatMapData[],
    options: SavePaintPagesOptions = {},
  ): Promise<void> {
    const previousRegionPaths = new Set(Object.keys(mapData.paint.splatMaps.regions).map(getPaintRegionPathForKey));
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

    // EN: Region packs are written before the manifest so the manifest never points at missing binary data.
    // 中文: 先写入 region pack，再写清单，避免清单指向尚未写好的二进制数据。
    await Promise.all(regions.map(async (region) => {
      await platform.files.writeBinaryBase64(`${mapDirectory}/${region.path}`, encodePaintRegionPackBase64(region.bytes));
    }));

    if (!dirtyRegionKeys) {
      const nextRegionPaths = new Set(regions.map((region) => region.path));
      await removeStalePaintRegions(mapDirectory, previousRegionPaths, nextRegionPaths);
    }
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

async function removeStalePaintRegions(
  mapDirectory: string,
  previousRegionPaths: ReadonlySet<string>,
  nextRegionPaths: ReadonlySet<string>,
): Promise<void> {
  await Promise.all(Array.from(previousRegionPaths).map(async (path) => {
    if (nextRegionPaths.has(path)) {
      return;
    }

    try {
      await platform.files.deleteFile(`${mapDirectory}/${path}`);
    } catch (error) {
      console.warn(`[TextureStorage] Failed to delete stale paint region: ${path}`, error);
    }
  }));
}
