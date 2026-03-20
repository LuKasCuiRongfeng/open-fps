// FileTab: project file operations tab.
// FileTab：项目文件操作标签

import { useState, useEffect } from "react";
import { getPlatformBridge } from "@/platform";
import type { GameApp } from "@game/GameApp";
import type { TerrainEditor } from "@game/editor";
import { getProjectNameFromPath } from "@project/ProjectStorage";
import type { MapData } from "@project/MapData";
import type { GameSettings } from "@game/settings";
import type { EditorWorkspaceController } from "@ui/hooks";

const platform = getPlatformBridge();

type FileTabProps = {
  gameApp: GameApp | null;
  terrainEditor: TerrainEditor | null;
  editorWorkspace: EditorWorkspaceController;
  onLoadMap?: (mapData: MapData) => void;
  onApplySettings?: (settings: GameSettings) => void;
};

export function FileTab({
  gameApp,
  terrainEditor,
  editorWorkspace,
  onLoadMap,
  onApplySettings,
}: FileTabProps) {
  const [editableMapName, setEditableMapName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processing, setProcessing] = useState(false);

  const canEdit = editorWorkspace.terrainMode === "editable";
  const terrainDirty = terrainEditor?.dirty ?? false;
  const textureDirty = gameApp?.getTextureEditor()?.dirty ?? false;
  const dirty = terrainDirty || textureDirty;
  const hasProject = editorWorkspace.currentProjectPath !== null;

  // Sync editable map name from project path.
  // 从项目路径同步可编辑的地图名称
  useEffect(() => {
    if (editorWorkspace.currentProjectPath) {
      setEditableMapName(getProjectNameFromPath(editorWorkspace.currentProjectPath));
    } else {
      setEditableMapName("Untitled");
    }
  }, [editorWorkspace.currentProjectPath]);

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
      const projectName = editableMapName.trim() || "my_project";
      const result = await editorWorkspace.saveProjectSession({
        gameApp,
        terrainEditor,
        projectName,
      });
      setStatusMessage(result.message);
      return result.ok;
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
      const shouldSave = await platform.ask(
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
      const projectName = editableMapName.trim() || "my_project";
      const result = await editorWorkspace.saveProjectSession({
        gameApp,
        terrainEditor,
        projectName,
        forceSaveAs: true,
      });
      setStatusMessage(result.message);
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
      const shouldSave = await platform.ask(
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
      const result = await editorWorkspace.openProjectInApp({
        gameApp,
        terrainEditor,
        onLoadMap,
        onApplySettings,
      });
      setStatusMessage(result.message);
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
        {editorWorkspace.currentProjectPath && (
          <div className="mt-1 text-xs text-white/40 truncate" title={editorWorkspace.currentProjectPath}>
            📁 {editorWorkspace.currentProjectPath}
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
