// ProjectStorage: project save/load workflow over platform project capabilities.
// ProjectStorage：基于平台项目能力的项目保存/加载流程

import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import type { MapData } from "./MapData";
import { serializeMapData, deserializeMapData } from "./MapData";
import type { ProjectMapRecord, ProjectMetadata } from "./ProjectData";
import {
  createProjectMetadata,
  createUniqueProjectMapId,
  deserializeProjectMetadata,
  getCurrentProjectMapRecord,
  getProjectMapDirectory,
  getProjectMapRecord,
  serializeProjectMetadata,
  upsertProjectMapRecord,
} from "./ProjectData";
import type { GameSettings } from "@game/settings";
import { mergeSettingsWithDefaults } from "@game/settings";

type CurrentProjectState = {
  path: string;
  metadata: ProjectMetadata;
};

export type LoadedProject = {
  projectPath: string;
  metadata: ProjectMetadata;
  activeMap: ProjectMapRecord;
  activeMapDirectory: string;
  map: MapData | null;
  settings: GameSettings;
};

type SaveProjectMapOptions = {
  settings?: GameSettings;
  projectName?: string;
  mapName?: string;
  mapId?: string;
  createNewMap?: boolean;
};

let currentProject: CurrentProjectState | null = null;
const platform = getPlatform();

export function getCurrentProjectPath(): string | null {
  return currentProject?.path ?? null;
}

export function setCurrentProjectReference(
  path: string | null,
  metadata?: ProjectMetadata | null,
): void {
  if (!path) {
    currentProject = null;
    return;
  }

  currentProject = {
    path,
    metadata: metadata ?? currentProject?.metadata ?? createProjectMetadata(getProjectNameFromPath(path)),
  };
}

export function getProjectNameFromPath(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

export async function openProjectDialog(): Promise<string | null> {
  const selected = await platform.dialogs.openFolder({
    title: "Open Project Folder",
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  const isValid = await platform.projects.isValidProject(selected);
  if (!isValid) {
    throw new Error("Selected folder is not a valid Open FPS project (missing project.json)");
  }

  return selected;
}

export async function selectProjectFolderDialog(): Promise<string | null> {
  const selected = await platform.dialogs.openFolder({
    title: "Select Folder for New Project",
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
  return loadProjectMap(projectPath);
}

export async function loadProjectMap(
  projectPath: string,
  requestedMapId?: string,
): Promise<LoadedProject> {
  const metadataJson = await platform.projects.readMetadata(projectPath);
  let metadata = deserializeProjectMetadata(metadataJson);
  const activeMapId = requestedMapId ?? metadata.currentMapId;
  const activeMap = resolveProjectMap(metadata, activeMapId);

  if (metadata.currentMapId !== activeMap.id) {
    metadata = { ...metadata, currentMapId: activeMap.id, modified: Date.now() };
    await saveProjectMetadata(projectPath, metadata);
  }

  let map: MapData | null = null;
  try {
    const mapJson = await platform.projects.readMap(projectPath, activeMap.id);
    map = deserializeMapData(mapJson);
  } catch (error) {
    if (isMissingFileSystemResourceError(error)) {
      console.warn("[ProjectStorage] Project map does not exist yet", error);
    } else {
      console.error(`[ProjectStorage] Failed to read project map: ${formatUnknownError(error)}`, error);
      throw error;
    }
  }

  let settingsJson: string | null = null;
  try {
    settingsJson = await platform.projects.readSettings(projectPath);
    if (!settingsJson || settingsJson.trim() === "") {
      settingsJson = null;
    }
  } catch (error) {
    if (isMissingFileSystemResourceError(error)) {
      console.warn("[ProjectStorage] Project settings do not exist yet", error);
    } else {
      console.error(`[ProjectStorage] Failed to read project settings: ${formatUnknownError(error)}`, error);
      throw error;
    }
  }
  const settings = mergeSettingsWithDefaults(settingsJson);

  currentProject = { path: projectPath, metadata };

  try {
    await platform.projects.addRecentProject(projectPath);
  } catch (error) {
    console.warn("[ProjectStorage] Failed to add recent project entry", error);
  }

  return {
    projectPath,
    metadata,
    activeMap,
    activeMapDirectory: getProjectMapDirectory(projectPath, activeMap.id),
    map,
    settings,
  };
}

export async function createProject(
  projectPath: string,
  projectName: string,
  initialMapName: string,
): Promise<ProjectMetadata> {
  const metadata = createProjectMetadata(projectName, initialMapName);
  const metadataJson = serializeProjectMetadata(metadata);

  await platform.projects.createProject(projectPath, metadataJson);

  currentProject = { path: projectPath, metadata };
  return metadata;
}

export async function saveProjectMap(
  mapData: MapData,
  options: SaveProjectMapOptions = {},
): Promise<LoadedProject> {
  if (!currentProject) {
    throw new Error("No project open");
  }

  let projectPath = currentProject.path;
  let metadata = currentProject.metadata;
  const normalizedProjectName = normalizeName(options.projectName, metadata.name);
  if (normalizedProjectName !== metadata.name) {
    projectPath = await platform.projects.renameProject(currentProject.path, normalizedProjectName);
    metadata = { ...metadata, name: normalizedProjectName, modified: Date.now() };
  }

  const currentMap = getCurrentProjectMapRecord(metadata);
  const normalizedMapName = normalizeName(options.mapName, mapData.metadata.name || currentMap.name);
  const targetMapId = options.createNewMap
    ? createUniqueProjectMapId(normalizedMapName, metadata.maps)
    : options.mapId ?? currentMap.id;

  metadata = upsertProjectMapRecord(metadata, targetMapId, normalizedMapName);
  mapData.metadata.name = normalizedMapName;

  await saveProjectMetadata(projectPath, metadata);

  const mapJson = serializeMapData(mapData);
  await platform.projects.saveMap(projectPath, targetMapId, mapJson);

  if (options.settings) {
    const settingsJson = JSON.stringify(options.settings, null, 2);
    await platform.projects.saveSettings(projectPath, settingsJson);
  }

  currentProject = { path: projectPath, metadata };

  return {
    projectPath,
    metadata,
    activeMap: resolveProjectMap(metadata, targetMapId),
    activeMapDirectory: getProjectMapDirectory(projectPath, targetMapId),
    map: mapData,
    settings: options.settings ?? mergeSettingsWithDefaults(null),
  };
}

export async function saveProjectSettings(settings: GameSettings): Promise<void> {
  if (!currentProject) {
    throw new Error("No project open");
  }

  const settingsJson = JSON.stringify(settings, null, 2);
  await platform.projects.saveSettings(currentProject.path, settingsJson);
}

export async function saveProjectAs(
  mapData: MapData,
  projectName: string,
  mapName: string,
  settings?: GameSettings,
): Promise<LoadedProject | null> {
  const folderPath = await selectProjectFolderDialog();
  if (!folderPath) {
    return null;
  }

  const projectPath = `${folderPath}/${projectName}`;

  await createProject(projectPath, projectName, mapName);
  return saveProjectMap(mapData, { settings, mapName });
}

export function hasOpenProject(): boolean {
  return currentProject !== null;
}

export async function listRecentProjects(): Promise<string[]> {
  return platform.projects.listRecentProjects();
}

export async function addRecentProject(projectPath: string): Promise<void> {
  return platform.projects.addRecentProject(projectPath);
}

export async function removeRecentProject(projectPath: string): Promise<void> {
  return platform.projects.removeRecentProject(projectPath);
}

function resolveProjectMap(metadata: ProjectMetadata, mapId: string | null | undefined): ProjectMapRecord {
  if (!mapId) {
    throw new Error("No map selected in project metadata");
  }

  const mapRecord = getProjectMapRecord(metadata, mapId);
  if (!mapRecord) {
    throw new Error(`Project map '${mapId}' was not found`);
  }

  return mapRecord;
}

function normalizeName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

async function saveProjectMetadata(projectPath: string, metadata: ProjectMetadata): Promise<void> {
  await platform.projects.saveMetadata(projectPath, serializeProjectMetadata(metadata));
}
