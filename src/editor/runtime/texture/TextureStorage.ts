// TextureStorage: versioned paint sidecar manifest and raw RGBA splat-map page storage.
// TextureStorage：版本化 paint sidecar 清单与原始 RGBA splat map page 存储。

import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import {
  MAP_PAINT_PATH,
  decodePaintPageBase64,
  encodePaintPageBase64,
  getPaintPagePath,
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
    if (!mapData.paint.splatMaps.indices.includes(splatMapIndex)) {
      return null;
    }

    const path = `${mapDirectory}/${getPaintPagePath(splatMapIndex)}`;

    try {
      const base64 = await platform.files.readBinaryBase64(path);
      return {
        resolution: mapData.paint.splatMaps.resolution,
        pixels: decodePaintPageBase64(base64, mapData.paint.splatMaps.resolution),
        splatMapIndex,
      };
    } catch (error) {
      if (isMissingFileSystemResourceError(error)) {
        return null;
      }

      console.error(`[TextureStorage] Failed to load paint page: ${path}: ${formatUnknownError(error)}`, error);
      throw error;
    }
  }

  static async savePaintPage(
    mapDirectory: string,
    mapData: MapData,
    splatMap: SplatMapData,
    splatMapIndex: number,
  ): Promise<void> {
    const path = `${mapDirectory}/${getPaintPagePath(splatMapIndex)}`;
    await platform.files.writeBinaryBase64(
      path,
      encodePaintPageBase64(splatMap.pixels, mapData.paint.splatMaps.resolution),
    );
  }

  static async ensurePaintPage(
    mapDirectory: string,
    mapData: MapData,
    splatMapIndex: number,
  ): Promise<void> {
    const path = `${mapDirectory}/${getPaintPagePath(splatMapIndex)}`;

    try {
      const base64 = await platform.files.readBinaryBase64(path);
      decodePaintPageBase64(base64, mapData.paint.splatMaps.resolution);
    } catch (error) {
      if (!isMissingFileSystemResourceError(error)) {
        console.error(`[TextureStorage] Failed to verify paint page: ${path}: ${formatUnknownError(error)}`, error);
        throw error;
      }

      const defaultSplatMap = createDefaultSplatMap(mapData.paint.splatMaps.resolution, splatMapIndex);
      await this.savePaintPage(mapDirectory, mapData, defaultSplatMap, splatMapIndex);
    }
  }
}
