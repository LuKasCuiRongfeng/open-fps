// MapStorage: standalone map import/export helpers over platform file capabilities.
// MapStorage：基于平台文件能力的独立地图导入/导出辅助工具

import { getPlatform } from "@/platform";
import type { MapData } from "./MapData";
import { serializeMapData, deserializeMapData } from "./MapData";

const platform = getPlatform();

export async function saveMapToFile(mapData: MapData, filePath: string): Promise<string> {
  const json = serializeMapData(mapData);
  await platform.files.writeText(filePath, json);
  return filePath;
}

export async function exportMapWithDialog(
  mapData: MapData,
  defaultFilename: string
): Promise<string | null> {
  const filepath = await platform.dialogs.saveFile({
    title: "Export Map",
    defaultPath: `${defaultFilename}.ofps-map`,
    filters: [
      {
        name: "Open FPS Map",
        extensions: ["ofps-map"],
      },
    ],
  });

  if (!filepath) {
    return null;
  }

  const json = serializeMapData(mapData);
  await platform.files.writeText(filepath, json);

  return filepath;
}

export async function importMapWithDialog(): Promise<MapData | null> {
  const filepath = await platform.dialogs.openFile({
    title: "Import Map",
    filters: [
      {
        name: "Open FPS Map",
        extensions: ["ofps-map"],
      },
    ],
  });

  if (!filepath || typeof filepath !== "string") {
    return null;
  }

  const json = await platform.files.readText(filepath);
  const mapData = deserializeMapData(json);
  currentMapFilePath = filepath;

  return mapData;
}

let currentMapFilePath: string | null = null;

export function getMapNameFromFilePath(): string | null {
  if (!currentMapFilePath) return null;
  const lastSlash = Math.max(
    currentMapFilePath.lastIndexOf("/"),
    currentMapFilePath.lastIndexOf("\\")
  );
  const filename = lastSlash >= 0
    ? currentMapFilePath.substring(lastSlash + 1)
    : currentMapFilePath;
  return filename.replace(/\.ofps-map$/i, "");
}

export function getCurrentMapFilePath(): string | null {
  return currentMapFilePath;
}

export function setCurrentMapFilePath(path: string | null): void {
  currentMapFilePath = path;
}

export async function saveMapToCurrentFile(
  mapData: MapData,
  newName?: string
): Promise<string | null> {
  if (!currentMapFilePath) {
    return null;
  }

  if (newName) {
    const currentName = getMapNameFromFilePath();
    if (currentName && newName !== currentName) {
      const lastSlash = Math.max(
        currentMapFilePath.lastIndexOf("/"),
        currentMapFilePath.lastIndexOf("\\")
      );
      const dir = lastSlash >= 0 ? currentMapFilePath.substring(0, lastSlash + 1) : "";
      const newPath = `${dir}${newName}.ofps-map`;

      await platform.files.rename(currentMapFilePath, newPath);
      currentMapFilePath = newPath;
    }
  }

  const json = serializeMapData(mapData);
  await platform.files.writeText(currentMapFilePath, json);

  return currentMapFilePath;
}

export async function loadMapFromFile(filePath: string): Promise<MapData> {
  const json = await platform.files.readText(filePath);
  return deserializeMapData(json);
}
