// ProjectStorage: Tauri backend API for project save/load.
// ProjectStorage：Tauri 后端 API，用于项目保存/加载

import { getPlatformBridge } from "@/platform";
import type { MapData } from "./MapData";
import { serializeMapData, deserializeMapData } from "./MapData";
import type { ProjectMetadata } from "./ProjectData";
import {
  serializeProjectMetadata,
  deserializeProjectMetadata,
  createProjectMetadata,
} from "./ProjectData";
import type { GameSettings } from "@game/settings";
import { mergeSettingsWithDefaults } from "@game/settings";

let currentProjectPath: string | null = null;
const platform = getPlatformBridge();

export function getCurrentProjectPath(): string | null {
  return currentProjectPath;
}

export function setCurrentProjectPath(path: string | null): void {
  currentProjectPath = path;
}

export function getProjectNameFromPath(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

export async function openProjectDialog(): Promise<string | null> {
  const selected = await platform.openDialog({
    title: "Open Project Folder",
    directory: true,
    multiple: false,
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  const isValid = await platform.invoke<boolean>("is_valid_project", { projectPath: selected });
  if (!isValid) {
    throw new Error("Selected folder is not a valid Open FPS project (missing project.json)");
  }

  return selected;
}

export async function selectProjectFolderDialog(): Promise<string | null> {
  const selected = await platform.openDialog({
    title: "Select Folder for New Project",
    directory: true,
    multiple: false,
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  return selected;
}

export async function loadProject(projectPath: string): Promise<{
  metadata: ProjectMetadata;
  map: MapData | null;
  settings: GameSettings;
}> {
  const metadataJson = await platform.invoke<string>("read_project_metadata", { projectPath });
  const metadata = deserializeProjectMetadata(metadataJson);

  let map: MapData | null = null;
  try {
    const mapJson = await platform.invoke<string>("read_project_map", { projectPath });
    map = deserializeMapData(mapJson);
  } catch {
    // Map doesn't exist yet.
  }

  let settingsJson: string | null = null;
  try {
    settingsJson = await platform.invoke<string>("read_project_settings", { projectPath });
    if (!settingsJson || settingsJson.trim() === "") {
      settingsJson = null;
    }
  } catch {
    // Settings don't exist yet.
  }
  const settings = mergeSettingsWithDefaults(settingsJson);

  currentProjectPath = projectPath;

  try {
    await platform.invoke<void>("add_recent_project", { projectPath });
  } catch {
    // Ignore errors adding to recent.
  }

  return { metadata, map, settings };
}

export async function createProject(
  projectPath: string,
  projectName: string
): Promise<ProjectMetadata> {
  const metadata = createProjectMetadata(projectName);
  const metadataJson = serializeProjectMetadata(metadata);

  await platform.invoke<void>("create_project", { projectPath, metadata: metadataJson });

  currentProjectPath = projectPath;
  return metadata;
}

export async function saveProjectMap(
  mapData: MapData,
  settings?: GameSettings,
  newProjectName?: string
): Promise<string> {
  if (!currentProjectPath) {
    throw new Error("No project open");
  }

  let projectPath = currentProjectPath;
  const currentName = getProjectNameFromPath(currentProjectPath);
  if (newProjectName && newProjectName !== currentName) {
    projectPath = await platform.invoke<string>("rename_project", {
      oldPath: currentProjectPath,
      newName: newProjectName,
    });
    currentProjectPath = projectPath;
  }

  const mapJson = serializeMapData(mapData);
  await platform.invoke<void>("save_project_map", { projectPath, data: mapJson });

  if (settings) {
    const settingsJson = JSON.stringify(settings, null, 2);
    await platform.invoke<void>("save_project_settings", { projectPath, data: settingsJson });
  }

  await updateProjectModifiedTime();

  return projectPath;
}

export async function saveProjectSettings(settings: GameSettings): Promise<void> {
  if (!currentProjectPath) {
    throw new Error("No project open");
  }

  const settingsJson = JSON.stringify(settings, null, 2);
  await platform.invoke<void>("save_project_settings", { projectPath: currentProjectPath, data: settingsJson });
}

async function updateProjectModifiedTime(): Promise<void> {
  if (!currentProjectPath) return;

  try {
    const metadataJson = await platform.invoke<string>("read_project_metadata", {
      projectPath: currentProjectPath,
    });
    const metadata = deserializeProjectMetadata(metadataJson);
    metadata.modified = Date.now();
    const updatedJson = serializeProjectMetadata(metadata);
    await platform.invoke<void>("save_project_metadata", {
      projectPath: currentProjectPath,
      data: updatedJson,
    });
  } catch {
    // Ignore errors updating metadata.
  }
}

export async function saveProjectAs(
  mapData: MapData,
  projectName: string,
  settings?: GameSettings
): Promise<string | null> {
  const folderPath = await selectProjectFolderDialog();
  if (!folderPath) {
    return null;
  }

  const projectPath = `${folderPath}/${projectName}`;

  await createProject(projectPath, projectName);

  const mapJson = serializeMapData(mapData);
  await platform.invoke<void>("save_project_map", { projectPath, data: mapJson });

  if (settings) {
    const settingsJson = JSON.stringify(settings, null, 2);
    await platform.invoke<void>("save_project_settings", { projectPath, data: settingsJson });
  }

  currentProjectPath = projectPath;
  return projectPath;
}

export function hasOpenProject(): boolean {
  return currentProjectPath !== null;
}

export async function listRecentProjects(): Promise<string[]> {
  return platform.invoke<string[]>("list_recent_projects");
}

export async function addRecentProject(projectPath: string): Promise<void> {
  return platform.invoke<void>("add_recent_project", { projectPath });
}

export async function removeRecentProject(projectPath: string): Promise<void> {
  return platform.invoke<void>("remove_recent_project", { projectPath });
}