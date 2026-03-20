import { useEffect, useState } from "react";
import type { GameApp } from "@game/GameApp";
import type { TerrainEditor } from "@game/editor";
import type { GameSettings } from "@game/settings";
import type { MapData } from "@project/MapData";
import {
  addRecentProject,
  getProjectNameFromPath,
  listRecentProjects,
  loadProject,
  openProjectDialog,
  removeRecentProject,
  saveProjectAs,
  saveProjectMap,
  setCurrentProjectPath as setStoredCurrentProjectPath,
} from "@project/ProjectStorage";

export type TerrainMode = "editable" | "procedural";

export type LoadedWorkspaceProject = {
  projectPath: string;
  map: MapData | null;
  settings: GameSettings;
};

export type WorkspaceOperationResult = {
  ok: boolean;
  path: string | null;
  message: string;
};

type OpenProjectInAppOptions = {
  gameApp: GameApp | null;
  terrainEditor: TerrainEditor | null;
  onLoadMap?: (mapData: MapData) => void;
  onApplySettings?: (settings: GameSettings) => void;
};

type SaveProjectOptions = {
  gameApp: GameApp | null;
  terrainEditor: TerrainEditor | null;
  projectName: string;
  forceSaveAs?: boolean;
};

export interface EditorWorkspaceController {
  showProjectScreen: boolean;
  pendingMapData: MapData | null;
  pendingSettings: GameSettings | null;
  terrainMode: TerrainMode;
  currentProjectPath: string | null;
  recentProjects: string[];
  completeProjectSelection: (project: LoadedWorkspaceProject | null) => void;
  enterProceduralMode: () => void;
  syncProjectPath: (path: string | null) => void;
  markEditableMode: () => void;
  openProjectRecord: (projectPath: string) => Promise<LoadedWorkspaceProject>;
  openProjectFromDialog: () => Promise<LoadedWorkspaceProject | null>;
  removeRecentProjectEntry: (projectPath: string) => Promise<void>;
  openProjectInApp: (options: OpenProjectInAppOptions) => Promise<WorkspaceOperationResult>;
  saveProjectSession: (options: SaveProjectOptions) => Promise<WorkspaceOperationResult>;
  saveCurrentProjectForClose: (app: GameApp) => Promise<string>;
}

export function useEditorWorkspace(): EditorWorkspaceController {
  const [showProjectScreen, setShowProjectScreen] = useState(true);
  const [pendingMapData, setPendingMapData] = useState<MapData | null>(null);
  const [pendingSettings, setPendingSettings] = useState<GameSettings | null>(null);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>("procedural");
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);

  const refreshRecentProjects = async (): Promise<void> => {
    try {
      setRecentProjects(await listRecentProjects());
    } catch {
      setRecentProjects([]);
    }
  };

  useEffect(() => {
    void refreshRecentProjects();
  }, []);

  const syncProjectPath = (path: string | null) => {
    setCurrentProjectPath(path);
    setStoredCurrentProjectPath(path);
    setTerrainMode(path ? "editable" : "procedural");
  };

  const completeProjectSelection = (project: LoadedWorkspaceProject | null) => {
    setPendingMapData(project?.map ?? null);
    setPendingSettings(project?.settings ?? null);
    syncProjectPath(project?.projectPath ?? null);
    setShowProjectScreen(false);
  };

  const enterProceduralMode = () => {
    completeProjectSelection(null);
  };

  const markEditableMode = () => {
    setTerrainMode("editable");
  };

  const openProjectRecord = async (projectPath: string): Promise<LoadedWorkspaceProject> => {
    const { map, settings } = await loadProject(projectPath);
    await refreshRecentProjects();
    return { projectPath, map, settings };
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

  const openProjectInApp = async ({
    gameApp,
    terrainEditor,
    onLoadMap,
    onApplySettings,
  }: OpenProjectInAppOptions): Promise<WorkspaceOperationResult> => {
    if (!gameApp) {
      return { ok: false, path: null, message: "✗ Open failed: no active game session" };
    }

    const project = await openProjectFromDialog();
    if (!project) {
      return { ok: false, path: null, message: "Open cancelled" };
    }

    gameApp.applySettings(project.settings);
    onApplySettings?.(project.settings);

    await gameApp.loadTexturesFromProject(project.projectPath);

    if (project.map) {
      await gameApp.loadMapData(project.map);
      onLoadMap?.(project.map);
    }

    terrainEditor?.markClean();
    syncProjectPath(project.projectPath);

    return {
      ok: true,
      path: project.projectPath,
      message: `✓ Opened: ${getProjectNameFromPath(project.projectPath)}`,
    };
  };

  const saveProjectSession = async ({
    gameApp,
    terrainEditor,
    projectName,
    forceSaveAs = false,
  }: SaveProjectOptions): Promise<WorkspaceOperationResult> => {
    if (!gameApp) {
      return { ok: false, path: null, message: "✗ Save failed: no active game session" };
    }

    const mapData = gameApp.exportCurrentMapData();
    const settings = gameApp.getSettingsSnapshot();
    mapData.metadata.name = projectName;

    const createNewProject = forceSaveAs || !currentProjectPath;
    const savedPath = createNewProject
      ? await saveProjectAs(mapData, projectName, settings)
      : await saveProjectMap(mapData, settings, projectName);

    if (!savedPath) {
      return { ok: false, path: null, message: "Save cancelled" };
    }

    if (gameApp.getTextureEditor().editingEnabled) {
      await gameApp.saveTexturesToProject(savedPath);
    }

    terrainEditor?.markClean();

    try {
      await addRecentProject(savedPath);
    } catch {
      // Ignore recent-project refresh failures.
    }

    syncProjectPath(savedPath);
    await refreshRecentProjects();

    return {
      ok: true,
      path: savedPath,
      message: createNewProject
        ? `✓ Created project: ${getProjectNameFromPath(savedPath)}`
        : "✓ Saved to project",
    };
  };

  const saveCurrentProjectForClose = async (app: GameApp): Promise<string> => {
    const mapData = app.exportCurrentMapData();
    const settings = app.getSettingsSnapshot();
    const savedPath = await saveProjectMap(mapData, settings);

    if (app.getTextureEditor().editingEnabled) {
      await app.saveTexturesToProject(savedPath);
    }

    syncProjectPath(savedPath);
    await refreshRecentProjects();
    return savedPath;
  };

  return {
    showProjectScreen,
    pendingMapData,
    pendingSettings,
    terrainMode,
    currentProjectPath,
    recentProjects,
    completeProjectSelection,
    enterProceduralMode,
    syncProjectPath,
    markEditableMode,
    openProjectRecord,
    openProjectFromDialog,
    removeRecentProjectEntry,
    openProjectInApp,
    saveProjectSession,
    saveCurrentProjectForClose,
  };
}