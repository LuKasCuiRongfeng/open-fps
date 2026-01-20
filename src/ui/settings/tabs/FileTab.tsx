// FileTab: project file operations tab.
// FileTab：项目文件操作标签

import { useState, useEffect } from "react";
import type { GameApp } from "@game/GameApp";
import type { TerrainEditor } from "@game/editor";
import {
  getProjectNameFromPath,
  saveProjectMap,
  saveProjectAs,
  hasOpenProject,
  openProjectDialog,
  loadProject,
} from "@game/editor/ProjectStorage";
import type { MapData } from "@game/editor/MapData";
import type { GameSettings } from "@game/settings/GameSettings";

type FileTabProps = {
  gameApp: GameApp | null;
  terrainEditor: TerrainEditor | null;
  terrainMode: "editable" | "procedural";
  currentProjectPath: string | null;
  onProjectPathChange?: (path: string | null) => void;
  onLoadMap?: (mapData: MapData) => void;
  onApplySettings?: (settings: GameSettings) => void;
};

export function FileTab({
  gameApp,
  terrainEditor,
  terrainMode,
  currentProjectPath,
  onProjectPathChange,
  onLoadMap,
  onApplySettings,
}: FileTabProps) {
  const [editableMapName, setEditableMapName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processing, setProcessing] = useState(false);

  const canEdit = terrainMode === "editable";
  const terrainDirty = terrainEditor?.dirty ?? false;
  const textureDirty = gameApp?.getTextureEditor()?.dirty ?? false;
  const dirty = terrainDirty || textureDirty;
  const hasProject = hasOpenProject();

  // Sync editable map name from project path.
  // 从项目路径同步可编辑的地图名称
  useEffect(() => {
    if (currentProjectPath) {
      setEditableMapName(getProjectNameFromPath(currentProjectPath));
    } else {
      setEditableMapName("Untitled");
    }
  }, [currentProjectPath]);

  // Update map name in editor.
  // 更新编辑器中的地图名称
  const handleMapNameChange = (name: string) => {
    setEditableMapName(name);
    terrainEditor?.setMapName(name);
  };

  // Handle save (to current project or save as new project).
  // 保存（到当前项目或另存为新项目）
  const handleSave = async (): Promise<boolean> => {
    if (!gameApp) return false;

    setProcessing(true);
    setStatusMessage("");

    try {
      const mapData = gameApp.exportCurrentMapData();
      const settings = gameApp.getSettingsSnapshot();
      const projectName = editableMapName.trim() || "my_project";
      mapData.metadata.name = projectName;

      if (hasProject) {
        // Save to current project (with rename if name changed).
        // 保存到当前项目（如果名称更改则重命名）
        const newPath = await saveProjectMap(mapData, settings, projectName);
        
        // Save texture data (splat map) to project.
        // 保存纹理数据（splat map）到项目
        await gameApp.saveTexturesToProject(newPath);
        
        terrainEditor?.markClean();
        gameApp.getTextureEditor().setOnDirtyChange(() => {}); // Clear dirty callback
        onProjectPathChange?.(newPath);
        setStatusMessage(`✓ Saved to project`);
        return true;
      } else {
        // No project open (procedural terrain) - save as new project.
        // 未打开项目（程序地形）- 另存为新项目
        const newPath = await saveProjectAs(mapData, projectName, settings);
        if (newPath) {
          // Save texture data if available.
          // 如果有纹理数据则保存
          if (gameApp.getTextureEditor().editingEnabled) {
            await gameApp.saveTexturesToProject(newPath);
          }
          terrainEditor?.markClean();
          onProjectPathChange?.(newPath);
          setStatusMessage(`✓ Created project: ${getProjectNameFromPath(newPath)}`);
          return true;
        } else {
          setStatusMessage("Save cancelled");
          return false;
        }
      }
    } catch (e) {
      setStatusMessage(`✗ Save failed: ${e}`);
      return false;
    } finally {
      setProcessing(false);
    }
  };

  // Handle save as (always prompts for new location).
  // 另存为（总是提示选择新位置）
  const handleSaveAs = async () => {
    if (!gameApp) return;

    // Check for unsaved changes first.
    // 先检查未保存的更改
    if (dirty && hasProject) {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const shouldSave = await ask(
        "Save changes to current project before creating a new one?",
        { title: "Unsaved Changes", kind: "warning" }
      );
      if (shouldSave) {
        await handleSave();
      }
    }

    setProcessing(true);
    setStatusMessage("");

    try {
      const mapData = gameApp.exportCurrentMapData();
      const settings = gameApp.getSettingsSnapshot();
      const projectName = editableMapName.trim() || "my_project";
      mapData.metadata.name = projectName;

      const newPath = await saveProjectAs(mapData, projectName, settings);
      if (newPath) {
        // Save texture data if available.
        // 如果有纹理数据则保存
        if (gameApp.getTextureEditor().editingEnabled) {
          await gameApp.saveTexturesToProject(newPath);
        }
        terrainEditor?.markClean();
        onProjectPathChange?.(newPath);
        setStatusMessage(`✓ Created project: ${getProjectNameFromPath(newPath)}`);
      } else {
        setStatusMessage("Save cancelled");
      }
    } catch (e) {
      setStatusMessage(`✗ Save failed: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  // Handle open project.
  // 打开项目
  const handleOpenProject = async () => {
    if (!gameApp) return;

    // Check for unsaved changes first.
    // 先检查未保存的更改
    if (dirty) {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const shouldSave = await ask(
        "Save changes to current project before opening another?",
        { title: "Unsaved Changes", kind: "warning" }
      );
      if (shouldSave) {
        const saved = await handleSave();
        if (!saved) {
          return; // Save was cancelled, abort open.
        }
      }
    }

    setProcessing(true);
    setStatusMessage("");

    try {
      const projectPath = await openProjectDialog();
      if (!projectPath) {
        setStatusMessage("Open cancelled");
        setProcessing(false);
        return;
      }

      const { map, settings } = await loadProject(projectPath);
      
      // Apply settings first.
      // 先应用设置
      gameApp.applySettings(settings);
      onApplySettings?.(settings);

      // Load textures from project (texture.json + splat map).
      // 从项目加载纹理（texture.json + splat map）
      await gameApp.loadTexturesFromProject(projectPath);
      
      if (map) {
        // Load map into game.
        // 加载地图到游戏
        await gameApp.loadMapData(map);
        onLoadMap?.(map);
      }

      terrainEditor?.markClean();
      onProjectPathChange?.(projectPath);
      setStatusMessage(`✓ Opened: ${getProjectNameFromPath(projectPath)}`);
    } catch (e) {
      setStatusMessage(`✗ Open failed: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Current project info */}
      <div className="rounded-md border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/60">Current Project</div>
          {dirty && <span className="text-xs text-yellow-400">● Unsaved changes</span>}
        </div>
        <div className="mt-2">
          <label className="block text-xs text-white/50 mb-1">Project Name</label>
          <input
            type="text"
            value={editableMapName}
            onChange={(e) => handleMapNameChange(e.target.value)}
            placeholder="Untitled"
            className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
        <div className="mt-2 text-xs text-white/50">
          Mode: {canEdit ? "✓ Project Open (Editable)" : "⚠ Procedural (View Only)"}
        </div>
        {currentProjectPath && (
          <div className="mt-1 text-xs text-white/40 truncate" title={currentProjectPath}>
            📁 {currentProjectPath}
          </div>
        )}
      </div>

      {/* File operations */}
      <div>
        <div className="text-sm font-semibold mb-3">Project Operations</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleOpenProject}
            disabled={processing}
            className="px-3 py-2 rounded-md text-sm font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            📂 Open Project...
          </button>
          <button
            onClick={handleSave}
            disabled={processing}
            className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            💾 {hasProject ? "Save" : "Save as Project..."}
          </button>
          <button
            onClick={handleSaveAs}
            disabled={processing}
            className="col-span-2 px-3 py-2 rounded-md text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            📁 Save As...
          </button>
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={`text-sm ${statusMessage.startsWith("✓") ? "text-green-400" : statusMessage.includes("cancelled") ? "text-yellow-400" : "text-red-400"}`}
        >
          {statusMessage}
        </div>
      )}

      {/* Help */}
      <div className="rounded-lg bg-blue-900/30 p-3 text-xs text-blue-200">
        <strong>Tips:</strong>
        <ul className="mt-1 list-disc list-inside space-y-1">
          <li>Open a project folder to enable terrain and texture editing</li>
          <li>Use "Save as Project" to save procedural terrain for editing</li>
          <li>Projects are folders containing map data, settings, and assets</li>
        </ul>
      </div>
    </div>
  );
}
