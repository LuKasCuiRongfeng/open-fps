import { useEffect, useState } from "react";
import type { EditorAppSession } from "@game/app";
import type { TerrainEditor } from "@game/editor";
import type { GameSettings } from "@game/settings";
import type { MapData } from "@project/MapData";
import type { ProjectMetadata } from "@project/ProjectData";
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

export type TerrainMode = "editable" | "procedural";

export type LoadedWorkspaceProject = LoadedProject;

export type WorkspaceOperationResult = {
  ok: boolean;
  path: string | null;
  message: string;
};

type OpenProjectInAppOptions = {
  editorApp: EditorAppSession | null;
  terrainEditor: TerrainEditor | null;
  onLoadMap?: (mapData: MapData) => void;
  onApplySettings?: (settings: GameSettings) => void;
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
  pendingSettings: GameSettings | null;
  terrainMode: TerrainMode;
  currentProjectPath: string | null;
  currentProjectMetadata: ProjectMetadata | null;
  currentMapId: string | null;
  currentMapName: string | null;
  currentMapDirectory: string | null;
  recentProjects: string[];
  completeProjectSelection: (project: LoadedWorkspaceProject | null) => void;
  enterProceduralMode: () => void;
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
  const [pendingSettings, setPendingSettings] = useState<GameSettings | null>(null);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>("procedural");
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
  const [currentProjectMetadata, setCurrentProjectMetadata] = useState<ProjectMetadata | null>(null);
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
    setCurrentMapId(project?.activeMap.id ?? null);
    setCurrentMapDirectory(project?.activeMapDirectory ?? null);
    setCurrentProjectReference(project?.projectPath ?? null, project?.metadata ?? null);
    setTerrainMode(project ? "editable" : "procedural");
  };

  const completeProjectSelection = (project: LoadedWorkspaceProject | null) => {
    setPendingMapData(project?.map ?? null);
    setPendingSettings(project?.settings ?? null);
    syncProjectState(project);
    setShowProjectScreen(false);
  };

  const enterProceduralMode = () => {
    completeProjectSelection(null);
  };

  const markEditableMode = () => {
    setTerrainMode("editable");
  };

  const openProjectRecord = async (projectPath: string): Promise<LoadedWorkspaceProject> => {
    const project = await loadProjectMap(projectPath);
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
    onApplySettings?: (settings: GameSettings) => void,
  ): Promise<void> => {
    editorApp.applySettings(project.settings);
    onApplySettings?.(project.settings);

    await editorApp.loadTexturesFromMapDirectory(project.activeMapDirectory);

    if (project.map) {
      await editorApp.loadMapData(project.map);
      onLoadMap?.(project.map);
    }

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
      return { ok: false, path: null, message: "✗ Open failed: no active game session" };
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
      return { ok: false, path: null, message: "✗ Open failed: no active game session" };
    }

    if (!currentProjectPath) {
      return { ok: false, path: null, message: "✗ Open failed: no project open" };
    }

    const project = await loadProjectMap(currentProjectPath, mapId);
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
      return { ok: false, path: null, message: "✗ Save failed: no active game session" };
    }

    const mapData = editorApp.exportCurrentMapData();
    const settings = editorApp.getSettingsSnapshot();
    mapData.metadata.name = mapName;

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
      await editorApp.saveTexturesToMapDirectory(savedProject.activeMapDirectory);
    }

    terrainEditor?.markClean();

    try {
      await addRecentProject(savedProject.projectPath);
    } catch (error) {
      console.warn("[useEditorWorkspace] Failed to add recent project entry", error);
    }

    setPendingMapData(mapData);
    setPendingSettings(settings);
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
    const mapData = app.exportCurrentMapData();
    const settings = app.getSettingsSnapshot();
    const savedProject = await saveProjectMap(mapData, {
      settings,
      projectName: currentProjectMetadata?.name,
      mapName: currentProjectMetadata?.maps.find((entry) => entry.id === currentMapId)?.name,
      mapId: currentMapId ?? undefined,
    });

    if (app.getTextureEditor().editingEnabled) {
      await app.saveTexturesToMapDirectory(savedProject.activeMapDirectory);
    }

    syncProjectState(savedProject);
    await refreshRecentProjects();
    return savedProject.projectPath;
  };

  const currentMapName =
    currentProjectMetadata?.maps.find((entry) => entry.id === currentMapId)?.name ?? null;

  return {
    showProjectScreen,
    pendingMapData,
    pendingSettings,
    terrainMode,
    currentProjectPath,
    currentProjectMetadata,
    currentMapId,
    currentMapName,
    currentMapDirectory,
    recentProjects,
    completeProjectSelection,
    enterProceduralMode,
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