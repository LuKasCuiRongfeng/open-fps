// MapStorage: Tauri backend API for map save/load.
// MapStorage：Tauri 后端 API，用于地图保存/加载

import { getPlatformBridge } from "@/platform";
import type { MapData } from "./MapData";
import { serializeMapData, deserializeMapData } from "./MapData";

const platform = getPlatformBridge();

export async function saveMapToFile(mapData: MapData, filename: string): Promise<string> {
  const json = serializeMapData(mapData);
  const filepath = await platform.invoke<string>("save_map", { filename, data: json });
  return filepath;
}

export async function exportMapWithDialog(
  mapData: MapData,
  defaultFilename: string
): Promise<string | null> {
  const filepath = await platform.saveDialog({
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
  await platform.writeTextFile(filepath, json);

  return filepath;
}

export async function importMapWithDialog(): Promise<MapData | null> {
  const filepath = await platform.openDialog({
    title: "Import Map",
    multiple: false,
    directory: false,
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

  const json = await platform.readTextFile(filepath);
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

      await platform.renamePath(currentMapFilePath, newPath);
      currentMapFilePath = newPath;
    }
  }

  const json = serializeMapData(mapData);
  await platform.writeTextFile(currentMapFilePath, json);

  return currentMapFilePath;
}

export async function loadMapFromFile(filename: string): Promise<MapData> {
  const json = await platform.invoke<string>("load_map", { filename });
  return deserializeMapData(json);
}

export async function listSavedMaps(): Promise<string[]> {
  return platform.invoke<string[]>("list_maps");
}

export async function deleteMap(filename: string): Promise<void> {
  await platform.invoke<void>("delete_map", { filename });
}