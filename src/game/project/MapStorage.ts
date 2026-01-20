// MapStorage: Tauri backend API for map save/load.
// MapStorage：Tauri 后端 API，用于地图保存/加载

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { MapData } from "./MapData";
import { serializeMapData, deserializeMapData } from "./MapData";

/**
 * Save map to file via Tauri backend (to app data folder).
 * 通过 Tauri 后端将地图保存到文件（保存到应用数据文件夹）
 *
 * @param mapData Map data to save.
 * @param filename Filename (without extension).
 * @returns Full file path where the map was saved.
 */
export async function saveMapToFile(mapData: MapData, filename: string): Promise<string> {
  const json = serializeMapData(mapData);
  const filepath = await invoke<string>("save_map", { filename, data: json });
  return filepath;
}

/**
 * Export map to user-selected location via file dialog.
 * 通过文件对话框将地图导出到用户选择的位置
 *
 * @param mapData Map data to export.
 * @param defaultFilename Default filename suggestion.
 * @returns Full file path where the map was saved, or null if cancelled.
 */
export async function exportMapWithDialog(
  mapData: MapData,
  defaultFilename: string
): Promise<string | null> {
  // Show save dialog to let user choose location.
  // 显示保存对话框让用户选择位置
  const filepath = await save({
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
    // User cancelled.
    // 用户取消
    return null;
  }

  // Serialize and write to the selected path.
  // 序列化并写入选定的路径
  const json = serializeMapData(mapData);
  
  // Use Tauri's fs API to write to arbitrary path.
  // 使用 Tauri 的 fs API 写入任意路径
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await writeTextFile(filepath, json);

  return filepath;
}

/**
 * Import map from user-selected file via file dialog.
 * 通过文件对话框从用户选择的文件导入地图
 *
 * @returns Loaded map data, or null if cancelled.
 */
export async function importMapWithDialog(): Promise<MapData | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readTextFile } = await import("@tauri-apps/plugin-fs");

  // Show open dialog to let user choose file.
  // 显示打开对话框让用户选择文件
  const filepath = await open({
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
    // User cancelled or selected multiple (shouldn't happen).
    // 用户取消或选择了多个（不应该发生）
    return null;
  }

  // Read and deserialize the file.
  // 读取并反序列化文件
  const json = await readTextFile(filepath);
  const mapData = deserializeMapData(json);
  
  // Store the file path for later saves.
  // 存储文件路径供后续保存使用
  currentMapFilePath = filepath;
  
  return mapData;
}

// Current map file path (for saving without dialog).
// 当前地图文件路径（用于无对话框保存）
let currentMapFilePath: string | null = null;

/**
 * Get the map name from current file path (filename without extension).
 * 从当前文件路径获取地图名称（不带扩展名的文件名）
 */
export function getMapNameFromFilePath(): string | null {
  if (!currentMapFilePath) return null;
  const lastSlash = Math.max(
    currentMapFilePath.lastIndexOf("/"),
    currentMapFilePath.lastIndexOf("\\")
  );
  const filename = lastSlash >= 0 
    ? currentMapFilePath.substring(lastSlash + 1) 
    : currentMapFilePath;
  // Remove .ofps-map extension.
  // 移除 .ofps-map 扩展名
  return filename.replace(/\.ofps-map$/i, "");
}

/**
 * Get current map file path.
 * 获取当前地图文件路径
 */
export function getCurrentMapFilePath(): string | null {
  return currentMapFilePath;
}

/**
 * Set current map file path (after export).
 * 设置当前地图文件路径（导出后）
 */
export function setCurrentMapFilePath(path: string | null): void {
  currentMapFilePath = path;
}

/**
 * Save map to current file path (no dialog).
 * If newName differs from current filename, renames the file first.
 * 保存地图到当前文件路径（无对话框）
 * 如果 newName 与当前文件名不同，先重命名文件
 *
 * @param mapData Map data to save.
 * @param newName Optional new name (without extension). If different, file is renamed.
 * @returns File path where saved, or null if no current path.
 */
export async function saveMapToCurrentFile(
  mapData: MapData,
  newName?: string
): Promise<string | null> {
  if (!currentMapFilePath) {
    return null;
  }

  const { writeTextFile, rename } = await import("@tauri-apps/plugin-fs");

  // Check if we need to rename the file.
  // 检查是否需要重命名文件
  if (newName) {
    const currentName = getMapNameFromFilePath();
    if (currentName && newName !== currentName) {
      // Build new path with same directory.
      // 使用相同目录构建新路径
      const lastSlash = Math.max(
        currentMapFilePath.lastIndexOf("/"),
        currentMapFilePath.lastIndexOf("\\")
      );
      const dir = lastSlash >= 0 ? currentMapFilePath.substring(0, lastSlash + 1) : "";
      const newPath = `${dir}${newName}.ofps-map`;

      // Rename the file.
      // 重命名文件
      await rename(currentMapFilePath, newPath);
      currentMapFilePath = newPath;
    }
  }

  // Save data to (possibly renamed) file.
  // 保存数据到（可能已重命名的）文件
  const json = serializeMapData(mapData);
  await writeTextFile(currentMapFilePath, json);

  return currentMapFilePath;
}

/**
 * Load map from file via Tauri backend.
 * 通过 Tauri 后端从文件加载地图
 *
 * @param filename Filename (without extension).
 * @returns Loaded map data.
 */
export async function loadMapFromFile(filename: string): Promise<MapData> {
  const json = await invoke<string>("load_map", { filename });
  return deserializeMapData(json);
}

/**
 * List all saved maps.
 * 列出所有保存的地图
 *
 * @returns Array of map filenames (without extension).
 */
export async function listSavedMaps(): Promise<string[]> {
  return invoke<string[]>("list_maps");
}

/**
 * Delete a saved map.
 * 删除保存的地图
 *
 * @param filename Filename (without extension).
 */
export async function deleteMap(filename: string): Promise<void> {
  await invoke("delete_map", { filename });
}
