// ProjectStorage: Tauri backend API for project save/load.
// ProjectStorage：Tauri 后端 API，用于项目保存/加载

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { MapData } from "./MapData";
import { serializeMapData, deserializeMapData } from "./MapData";
import type { ProjectMetadata } from "./ProjectData";
import { 
  serializeProjectMetadata, 
  deserializeProjectMetadata,
  createProjectMetadata,
} from "./ProjectData";
import type { GameSettings } from "../settings/GameSettings";
import { mergeSettingsWithDefaults } from "../settings/GameSettings";

// Current project path (null = no project open, using procedural terrain).
// 当前项目路径（null = 未打开项目，使用程序生成地形）
let currentProjectPath: string | null = null;

/**
 * Get current project path.
 * 获取当前项目路径
 */
export function getCurrentProjectPath(): string | null {
  return currentProjectPath;
}

/**
 * Set current project path.
 * 设置当前项目路径
 */
export function setCurrentProjectPath(path: string | null): void {
  currentProjectPath = path;
}

/**
 * Get project name from path.
 * 从路径获取项目名称
 */
export function getProjectNameFromPath(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

/**
 * Open project dialog and return selected folder path.
 * 打开项目对话框并返回选中的文件夹路径
 *
 * @returns Project folder path, or null if cancelled.
 */
export async function openProjectDialog(): Promise<string | null> {
  const selected = await open({
    title: "Open Project Folder",
    directory: true,
    multiple: false,
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  // Validate it's a valid project.
  // 验证是否为有效项目
  const isValid = await invoke<boolean>("is_valid_project", { projectPath: selected });
  if (!isValid) {
    throw new Error("Selected folder is not a valid Open FPS project (missing project.json)");
  }

  return selected;
}

/**
 * Select folder for creating a new project.
 * 选择文件夹以创建新项目
 *
 * @returns Selected folder path, or null if cancelled.
 */
export async function selectProjectFolderDialog(): Promise<string | null> {
  const selected = await open({
    title: "Select Folder for New Project",
    directory: true,
    multiple: false,
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  return selected;
}

/**
 * Load project from folder.
 * 从文件夹加载项目
 *
 * @param projectPath Project folder path.
 * @returns Project data (metadata, map, settings).
 */
export async function loadProject(projectPath: string): Promise<{
  metadata: ProjectMetadata;
  map: MapData | null;
  settings: GameSettings;
}> {
  // Read metadata.
  // 读取元数据
  const metadataJson = await invoke<string>("read_project_metadata", { projectPath });
  const metadata = deserializeProjectMetadata(metadataJson);

  // Read map (may not exist).
  // 读取地图（可能不存在）
  let map: MapData | null = null;
  try {
    const mapJson = await invoke<string>("read_project_map", { projectPath });
    map = deserializeMapData(mapJson);
  } catch {
    // Map doesn't exist yet.
    // 地图还不存在
  }

  // Read settings and merge with defaults (handles missing/partial settings).
  // 读取设置并与默认值合并（处理缺失/部分设置）
  let settingsJson: string | null = null;
  try {
    settingsJson = await invoke<string>("read_project_settings", { projectPath });
    if (!settingsJson || settingsJson.trim() === "") {
      settingsJson = null;
    }
  } catch {
    // Settings don't exist yet.
    // 设置还不存在
  }
  const settings = mergeSettingsWithDefaults(settingsJson);

  currentProjectPath = projectPath;
  return { metadata, map, settings };
}

/**
 * Create a new project in the specified folder.
 * 在指定文件夹中创建新项目
 *
 * @param projectPath Project folder path.
 * @param projectName Project name.
 * @returns Created project metadata.
 */
export async function createProject(
  projectPath: string,
  projectName: string
): Promise<ProjectMetadata> {
  const metadata = createProjectMetadata(projectName);
  const metadataJson = serializeProjectMetadata(metadata);

  await invoke("create_project", { projectPath, metadata: metadataJson });

  currentProjectPath = projectPath;
  return metadata;
}

/**
 * Save map data to current project.
 * 保存地图数据到当前项目
 *
 * @param mapData Map data to save.
 * @param settings Optional settings to save.
 * @param newProjectName Optional new project name (will rename folder).
 * @returns New project path if renamed, otherwise current path.
 */
export async function saveProjectMap(
  mapData: MapData,
  settings?: GameSettings,
  newProjectName?: string
): Promise<string> {
  if (!currentProjectPath) {
    throw new Error("No project open");
  }

  let projectPath = currentProjectPath;

  // If project name changed, rename the folder.
  // 如果项目名称更改，重命名文件夹
  const currentName = getProjectNameFromPath(currentProjectPath);
  if (newProjectName && newProjectName !== currentName) {
    projectPath = await invoke<string>("rename_project", {
      oldPath: currentProjectPath,
      newName: newProjectName,
    });
    currentProjectPath = projectPath;
  }

  // Save map.
  // 保存地图
  const mapJson = serializeMapData(mapData);
  await invoke("save_project_map", { projectPath, data: mapJson });

  // Save settings if provided.
  // 如果提供了设置则保存
  if (settings) {
    const settingsJson = JSON.stringify(settings, null, 2);
    await invoke("save_project_settings", { projectPath, data: settingsJson });
  }

  // Update project metadata modified time.
  // 更新项目元数据的修改时间
  await updateProjectModifiedTime();

  return projectPath;
}

/**
 * Save settings to current project.
 * 保存设置到当前项目
 *
 * @param settings Settings to save.
 */
export async function saveProjectSettings(settings: GameSettings): Promise<void> {
  if (!currentProjectPath) {
    throw new Error("No project open");
  }

  const settingsJson = JSON.stringify(settings, null, 2);
  await invoke("save_project_settings", { projectPath: currentProjectPath, data: settingsJson });
}

/**
 * Update project metadata modified time.
 * 更新项目元数据的修改时间
 */
async function updateProjectModifiedTime(): Promise<void> {
  if (!currentProjectPath) return;

  try {
    const metadataJson = await invoke<string>("read_project_metadata", { 
      projectPath: currentProjectPath 
    });
    const metadata = deserializeProjectMetadata(metadataJson);
    metadata.modified = Date.now();
    const updatedJson = serializeProjectMetadata(metadata);
    await invoke("save_project_metadata", { 
      projectPath: currentProjectPath, 
      data: updatedJson 
    });
  } catch {
    // Ignore errors updating metadata.
    // 忽略更新元数据的错误
  }
}

/**
 * Save project to a new location (Save As).
 * 将项目保存到新位置（另存为）
 *
 * @param mapData Map data to save.
 * @param projectName Project name.
 * @param settings Optional settings to save.
 * @returns New project path, or null if cancelled.
 */
export async function saveProjectAs(
  mapData: MapData,
  projectName: string,
  settings?: GameSettings
): Promise<string | null> {
  const folderPath = await selectProjectFolderDialog();
  if (!folderPath) {
    return null;
  }

  // Create new project folder with project name.
  // 使用项目名称创建新项目文件夹
  const projectPath = `${folderPath}/${projectName}`;
  
  await createProject(projectPath, projectName);
  
  // Save map data.
  // 保存地图数据
  const mapJson = serializeMapData(mapData);
  await invoke("save_project_map", { projectPath, data: mapJson });

  // Save settings if provided.
  // 如果提供了设置则保存
  if (settings) {
    const settingsJson = JSON.stringify(settings, null, 2);
    await invoke("save_project_settings", { projectPath, data: settingsJson });
  }

  currentProjectPath = projectPath;
  return projectPath;
}

/**
 * Check if there's a project currently open.
 * 检查是否有项目当前打开
 */
export function hasOpenProject(): boolean {
  return currentProjectPath !== null;
}

/**
 * List recent projects.
 * 列出最近项目
 */
export async function listRecentProjects(): Promise<string[]> {
  return invoke<string[]>("list_recent_projects");
}
