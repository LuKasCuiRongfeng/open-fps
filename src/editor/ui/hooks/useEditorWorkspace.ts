import { useEffect, useState } from "react";
import type { EditorAppSession } from "@editor/app";
import type { TerrainEditor } from "@editor/runtime";
import {
  mergeEditorAppSettingsWithDefaults,
  type EditorAppSettings,
} from "@editor/settings";
import type { MapData } from "@project/MapData";
import type { ProjectMapRecord, ProjectMetadata } from "@project/ProjectData";
import {
  addRecentProject,
  getProjectNameFromPath,
  type LoadedProject,
  listRecentProjects,
  loadProjectMap,
  openProjectDialog,
  removeRecentProject,
  saveProjectAs,
  saveProjectMap,
  setCurrentProjectReference,
} from "@project/ProjectStorage";

export type TerrainMode = "editable" | "locked";

export type LoadedWorkspaceProject = LoadedProject<EditorAppSettings>;

export type WorkspaceOperationResult = {
  ok: boolean;
  path: string | null;
  message: string;
};

type OpenProjectInAppOptions = {
  editorApp: EditorAppSession | null;
  terrainEditor: TerrainEditor | null;
  onLoadMap?: (mapData: MapData) => void;
  onApplySettings?: (settings: EditorAppSettings) => void;
};

type OpenProjectMapInAppOptions = OpenProjectInAppOptions & {
  mapId: string;
};

type SaveProjectOptions = {
  editorApp: EditorAppSession | null;
  terrainEditor: TerrainEditor | null;
  projectName: string;
  mapName: string;
  forceSaveAs?: boolean;
  createNewMap?: boolean;
};

export interface EditorWorkspaceController {
  showProjectScreen: boolean;
  pendingMapData: MapData | null;
  pendingSettings: EditorAppSettings | null;
  terrainMode: TerrainMode;
  currentProjectPath: string | null;
  currentProjectMetadata: ProjectMetadata | null;
  currentProjectMaps: ProjectMapRecord[];
  currentMapId: string | null;
  currentMapName: string | null;
  currentMapDirectory: string | null;
  recentProjects: string[];
  completeProjectSelection: (project: LoadedWorkspaceProject) => void;
  markEditableMode: () => void;
  openProjectRecord: (projectPath: string) => Promise<LoadedWorkspaceProject>;
  openProjectFromDialog: () => Promise<LoadedWorkspaceProject | null>;
  removeRecentProjectEntry: (projectPath: string) => Promise<void>;
  openProjectInApp: (options: OpenProjectInAppOptions) => Promise<WorkspaceOperationResult>;
  openProjectMapInApp: (options: OpenProjectMapInAppOptions) => Promise<WorkspaceOperationResult>;
  saveProjectSession: (options: SaveProjectOptions) => Promise<WorkspaceOperationResult>;
  saveCurrentProjectForClose: (app: EditorAppSession) => Promise<string>;
}

export function useEditorWorkspace(): EditorWorkspaceController {
  const [showProjectScreen, setShowProjectScreen] = useState(true);
  const [pendingMapData, setPendingMapData] = useState<MapData | null>(null);
  const [pendingSettings, setPendingSettings] = useState<EditorAppSettings | null>(null);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>("locked");
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
  const [currentProjectMetadata, setCurrentProjectMetadata] = useState<ProjectMetadata | null>(null);
  const [currentProjectMaps, setCurrentProjectMaps] = useState<ProjectMapRecord[]>([]);
  const [currentMapId, setCurrentMapId] = useState<string | null>(null);
  const [currentMapDirectory, setCurrentMapDirectory] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);

  const refreshRecentProjects = async (): Promise<void> => {
    try {
      setRecentProjects(await listRecentProjects());
    } catch (error) {
      console.warn("[useEditorWorkspace] Failed to refresh recent projects, clearing cached list", error);
      setRecentProjects([]);
    }
  };

  useEffect(() => {
    void refreshRecentProjects();
  }, []);

  const syncProjectState = (project: LoadedWorkspaceProject | null) => {
    setCurrentProjectPath(project?.projectPath ?? null);
    setCurrentProjectMetadata(project?.metadata ?? null);
    setCurrentProjectMaps(project?.availableMaps ?? []);
    setCurrentMapId(project?.activeMap.id ?? null);
    setCurrentMapDirectory(project?.activeMapDirectory ?? null);
    setCurrentProjectReference(project?.projectPath ?? null, project?.metadata ?? null);
    setTerrainMode(project ? "editable" : "locked");
  };

  const completeProjectSelection = (project: LoadedWorkspaceProject) => {
    setPendingMapData(project.map);
    setPendingSettings(project.settings);
    syncProjectState(project);
    setShowProjectScreen(false);
  };

  const markEditableMode = () => {
    setTerrainMode("editable");
  };

  const openProjectRecord = async (projectPath: string): Promise<LoadedWorkspaceProject> => {
    const project = await loadProjectMap(projectPath, undefined, mergeEditorAppSettingsWithDefaults);
    await refreshRecentProjects();
    return project;
  };

  const openProjectFromDialog = async (): Promise<LoadedWorkspaceProject | null> => {
    const projectPath = await openProjectDialog();
    if (!projectPath) {
      return null;
    }

    return openProjectRecord(projectPath);
  };

  const removeRecentProjectEntry = async (projectPath: string) => {
    await removeRecentProject(projectPath);
    setRecentProjects((prev) => prev.filter((path) => path !== projectPath));
  };

  const applyProjectToEditor = async (
    project: LoadedWorkspaceProject,
    editorApp: EditorAppSession,
    terrainEditor: TerrainEditor | null,
    onLoadMap?: (mapData: MapData) => void,
    onApplySettings?: (settings: EditorAppSettings) => void,
  ): Promise<void> => {
    editorApp.applySettings(project.settings);
    onApplySettings?.(project.settings);

    if (project.map) {
      await editorApp.loadMapData(project.map);
      onLoadMap?.(project.map);
    }

    await editorApp.loadTexturesFromMapDirectory(project.activeMapDirectory, project.map);

    await editorApp.loadVegetationFromMapDirectory(project.activeMapDirectory, project.map);

    await editorApp.loadWorldObjectsFromMapDirectory(project.activeMapDirectory, project.map);

    setPendingMapData(project.map);
    setPendingSettings(project.settings);
    terrainEditor?.markClean();
    syncProjectState(project);
  };

  const openProjectInApp = async ({
    editorApp,
    terrainEditor,
    onLoadMap,
    onApplySettings,
  }: OpenProjectInAppOptions): Promise<WorkspaceOperationResult> => {
    if (!editorApp) {
      return { ok: false, path: null, message: "✗ Open failed: no active editor session" };
    }

    const project = await openProjectFromDialog();
    if (!project) {
      return { ok: false, path: null, message: "Open cancelled" };
    }

    await applyProjectToEditor(project, editorApp, terrainEditor, onLoadMap, onApplySettings);

    return {
      ok: true,
      path: project.projectPath,
      message: `✓ Opened ${getProjectNameFromPath(project.projectPath)} / ${project.activeMap.name}`,
    };
  };

  const openProjectMapInApp = async ({
    editorApp,
    terrainEditor,
    mapId,
    onLoadMap,
    onApplySettings,
  }: OpenProjectMapInAppOptions): Promise<WorkspaceOperationResult> => {
    if (!editorApp) {
      return { ok: false, path: null, message: "✗ Open failed: no active editor session" };
    }

    if (!currentProjectPath) {
      return { ok: false, path: null, message: "✗ Open failed: no project open" };
    }

    const project = await loadProjectMap(currentProjectPath, mapId, mergeEditorAppSettingsWithDefaults);
    await applyProjectToEditor(project, editorApp, terrainEditor, onLoadMap, onApplySettings);

    return {
      ok: true,
      path: project.projectPath,
      message: `✓ Switched to map: ${project.activeMap.name}`,
    };
  };

  const saveProjectSession = async ({
    editorApp,
    terrainEditor,
    projectName,
    mapName,
    forceSaveAs = false,
    createNewMap = false,
  }: SaveProjectOptions): Promise<WorkspaceOperationResult> => {
    if (!editorApp) {
      return { ok: false, path: null, message: "✗ Save failed: no active editor session" };
    }

    await editorApp.flushPendingEditorCommands();
    const mapData = editorApp.exportCurrentMapData();
    const settings = editorApp.getSettingsSnapshot();
    mapData.metadata.name = mapName;
    if (editorApp.getTextureEditor().editingEnabled) {
      editorApp.getTextureEditor().applyToMapData(mapData);
    }
    if (editorApp.getVegetationEditor().shouldSave) {
      editorApp.getVegetationEditor().applyToMapData(mapData);
    }

    const createNewProject = forceSaveAs || !currentProjectPath;
    const savedProject = createNewProject
      ? await saveProjectAs(mapData, projectName, mapName, settings)
      : await saveProjectMap(mapData, {
          settings,
          projectName,
          mapName,
          createNewMap,
        });

    if (!savedProject) {
      return { ok: false, path: null, message: "Save cancelled" };
    }

    if (editorApp.getTextureEditor().editingEnabled) {
      await editorApp.saveTexturesToMapDirectory(savedProject.activeMapDirectory, mapData);
    }

    if (editorApp.getVegetationEditor().shouldSave) {
      await editorApp.saveVegetationToMapDirectory(savedProject.activeMapDirectory);
    }

    editorApp.markMapDataSaved();
    terrainEditor?.markClean();

    try {
      await addRecentProject(savedProject.projectPath);
    } catch (error) {
      console.warn("[useEditorWorkspace] Failed to add recent project entry", error);
    }

    const savedProjectPathChanged = savedProject.projectPath !== currentProjectPath;
    const savedMapChanged = savedProject.activeMap.id !== currentMapId;
    const savedMapDirectoryChanged = savedProject.activeMapDirectory !== currentMapDirectory;
    const shouldReloadProjectRuntime =
      createNewProject || createNewMap || savedProjectPathChanged || savedMapChanged || savedMapDirectoryChanged;
    if (shouldReloadProjectRuntime) {
      // EN: Only path-changing saves refresh boot data; ordinary Save must not restart the editor runtime and drop live sidecar state.
      // 中文: 只有路径变化的保存才刷新启动数据；普通保存不能重启编辑器运行时并丢掉实时 sidecar 状态。
      setPendingMapData(savedProject.map);
      setPendingSettings(settings);
    }
    syncProjectState(savedProject);
    await refreshRecentProjects();

    return {
      ok: true,
      path: savedProject.projectPath,
      message: createNewProject
        ? `✓ Created project: ${getProjectNameFromPath(savedProject.projectPath)}`
        : createNewMap
          ? `✓ Created map: ${savedProject.activeMap.name}`
          : `✓ Saved map: ${savedProject.activeMap.name}`,
    };
  };

  const saveCurrentProjectForClose = async (app: EditorAppSession): Promise<string> => {
    await app.flushPendingEditorCommands();
    const mapData = app.exportCurrentMapData();
    const settings = app.getSettingsSnapshot();
    if (app.getTextureEditor().editingEnabled) {
      app.getTextureEditor().applyToMapData(mapData);
    }
    if (app.getVegetationEditor().shouldSave) {
      app.getVegetationEditor().applyToMapData(mapData);
    }
    const savedProject = await saveProjectMap(mapData, {
      settings,
      projectName: currentProjectMetadata?.name,
      mapName: currentProjectMaps.find((entry) => entry.id === currentMapId)?.name,
      mapId: currentMapId ?? undefined,
    });

    if (app.getTextureEditor().editingEnabled) {
      await app.saveTexturesToMapDirectory(savedProject.activeMapDirectory, mapData);
    }

    if (app.getVegetationEditor().shouldSave) {
      await app.saveVegetationToMapDirectory(savedProject.activeMapDirectory);
    }

    app.markMapDataSaved();
    syncProjectState(savedProject);
    await refreshRecentProjects();
    return savedProject.projectPath;
  };

  const currentMapName =
    currentProjectMaps.find((entry) => entry.id === currentMapId)?.name ?? null;

  return {
    showProjectScreen,
    pendingMapData,
    pendingSettings,
    terrainMode,
    currentProjectPath,
    currentProjectMetadata,
    currentProjectMaps,
    currentMapId,
    currentMapName,
    currentMapDirectory,
    recentProjects,
    completeProjectSelection,
    markEditableMode,
    openProjectRecord,
    openProjectFromDialog,
    removeRecentProjectEntry,
    openProjectInApp,
    openProjectMapInApp,
    saveProjectSession,
    saveCurrentProjectForClose,
  };
}