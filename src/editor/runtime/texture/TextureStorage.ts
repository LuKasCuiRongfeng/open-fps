// TextureStorage: v5 paint layer manifest and raw RGBA paint page storage.
// TextureStorage：v5 绘制层清单与原始 RGBA paint page 存储。

import { base64ToUint8Array } from "@/lib/base64";
import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import {
  MAP_PAINT_MATERIAL_SET_PATH,
  decodePaintPageBase64,
  encodePaintPageBase64,
  getPaintPagePathForKey,
  pageKey,
  type MapData,
} from "@project/MapData";
import {
  createDefaultSplatMap,
  type SplatMapData,
  type TextureDefinition,
} from "@game/world/terrain/TextureData";

const platform = getPlatform();

export function getGlobalPaintPageKey(splatMapIndex: number): string {
  return pageKey(splatMapIndex, 0);
}

export function getGlobalPaintPageKeys(splatMapCount: number): string[] {
  return Array.from({ length: splatMapCount }, (_, index) => getGlobalPaintPageKey(index));
}

export class TextureStorage {
  static async loadTextureDefinition(mapDirectory: string): Promise<TextureDefinition | null> {
    const jsonPath = `${mapDirectory}/${MAP_PAINT_MATERIAL_SET_PATH}`;

    try {
      const content = await platform.files.readText(jsonPath);
      return JSON.parse(content) as TextureDefinition;
    } catch (error) {
      if (isMissingFileSystemResourceError(error)) {
        return null;
      }

      console.error(
        `[TextureStorage] Failed to load paint material set: ${jsonPath}: ${formatUnknownError(error)}`,
        error,
      );
      throw error;
    }
  }

  static async saveTextureDefinition(mapDirectory: string, definition: TextureDefinition): Promise<void> {
    const jsonPath = `${mapDirectory}/${MAP_PAINT_MATERIAL_SET_PATH}`;
    await platform.files.writeText(jsonPath, `${JSON.stringify(definition, null, 2)}\n`);
  }

  static async loadPaintPage(
    mapDirectory: string,
    mapData: MapData,
    splatMapIndex: number,
  ): Promise<SplatMapData | null> {
    const key = getGlobalPaintPageKey(splatMapIndex);
    const path = `${mapDirectory}/${getPaintPagePathForKey(key)}`;

    try {
      const base64 = await platform.files.readBinaryBase64(path);
      return {
        resolution: mapData.paint.pageResolution,
        pixels: decodePaintPageBase64(base64, mapData.paint.pageResolution),
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
    const key = getGlobalPaintPageKey(splatMapIndex);
    const path = `${mapDirectory}/${getPaintPagePathForKey(key)}`;
    await platform.files.writeBinaryBase64(
      path,
      encodePaintPageBase64(splatMap.pixels, mapData.paint.pageResolution),
    );
  }

  static async ensurePaintPage(
    mapDirectory: string,
    mapData: MapData,
    splatMapIndex: number,
  ): Promise<void> {
    const key = getGlobalPaintPageKey(splatMapIndex);
    const path = `${mapDirectory}/${getPaintPagePathForKey(key)}`;

    try {
      const base64 = await platform.files.readBinaryBase64(path);
      base64ToUint8Array(base64);
    } catch (error) {
      if (!isMissingFileSystemResourceError(error)) {
        console.error(`[TextureStorage] Failed to verify paint page: ${path}: ${formatUnknownError(error)}`, error);
        throw error;
      }

      const defaultSplatMap = createDefaultSplatMap(mapData.paint.pageResolution, splatMapIndex);
      await this.savePaintPage(mapDirectory, mapData, defaultSplatMap, splatMapIndex);
    }
  }
}
