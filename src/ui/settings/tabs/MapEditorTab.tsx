// MapEditorTab: map editor settings tab.
// MapEditorTab：地图编辑器设置标签

import { useState, useEffect } from "react";
import type { GameApp } from "../../../game/GameApp";
import type { 
  TerrainEditor, 
  EditorMode, 
} from "../../../game/editor";
import type { EditorMouseAction } from "../../../game/settings/GameSettings";
import {
  getProjectNameFromPath,
  saveProjectMap,
  saveProjectAs,
  hasOpenProject,
  openProjectDialog,
  loadProject,
} from "../../../game/editor/ProjectStorage";
import type { MapData } from "../../../game/editor/MapData";
import type { GameSettings } from "../../../game/settings/GameSettings";

// Local type for mouse config (mirrors GameSettings.editor.mouseConfig).
// 本地鼠标配置类型（镜像 GameSettings.editor.mouseConfig）
type EditorMouseConfig = GameSettings["editor"]["mouseConfig"];

type MapEditorTabProps = {
  gameApp: GameApp | null;
  terrainEditor: TerrainEditor | null;
  terrainMode: "editable" | "procedural";
  editorMode: EditorMode;
  currentProjectPath: string | null;
  onEditorModeChange: (mode: EditorMode) => void;
  onProjectPathChange?: (path: string | null) => void;
  onLoadMap?: (mapData: MapData) => void;
  onApplySettings?: (settings: GameSettings) => void;
};

export function MapEditorTab({
  gameApp,
  terrainEditor,
  terrainMode,
  editorMode,
  currentProjectPath,
  onEditorModeChange,
  onProjectPathChange,
  onLoadMap,
  onApplySettings,
}: MapEditorTabProps) {
  const [editableMapName, setEditableMapName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processing, setProcessing] = useState(false);

  // Mouse button configuration state.
  // 鼠标按键配置状态
  const [mouseConfig, setMouseConfig] = useState<EditorMouseConfig>(() => ({
    leftButton: terrainEditor?.mouseConfig.leftButton ?? "brush",
    rightButton: terrainEditor?.mouseConfig.rightButton ?? "orbit",
    middleButton: terrainEditor?.mouseConfig.middleButton ?? "pan",
  }));

  const canEdit = terrainMode === "editable";
  const dirty = terrainEditor?.dirty ?? false;
  const hasProject = hasOpenProject();

  // Sync mouse config from editor when it changes.
  // 当编辑器配置变化时同步鼠标配置
  useEffect(() => {
    if (terrainEditor) {
      setMouseConfig({
        leftButton: terrainEditor.mouseConfig.leftButton,
        rightButton: terrainEditor.mouseConfig.rightButton,
        middleButton: terrainEditor.mouseConfig.middleButton,
      });
    }
  }, [terrainEditor]);

  // Handle mouse config change.
  // 处理鼠标配置变化
  const handleMouseConfigChange = (
    button: keyof EditorMouseConfig, action: EditorMouseAction
  ) => {
    setMouseConfig((prev) => ({ ...prev, [button]: action }));
    terrainEditor?.setMouseConfig({ [button]: action });
  };

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

  // Toggle edit mode.
  // 切换编辑模式
  const handleToggleMode = () => {
    if (!canEdit && editorMode === "play") {
      setStatusMessage("Cannot edit: open a project first");
      return;
    }
    terrainEditor?.toggleMode();
    const newMode = terrainEditor?.mode ?? "play";
    onEditorModeChange(newMode);
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
        terrainEditor?.markClean();
        onProjectPathChange?.(newPath);
        setStatusMessage(`✓ Saved to project`);
        return true;
      } else {
        // No project open (procedural terrain) - save as new project.
        // 未打开项目（程序地形）- 另存为新项目
        const newPath = await saveProjectAs(mapData, projectName, settings);
        if (newPath) {
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

  // Handle reset (discard edits).
  // 重置（丢弃编辑）
  const handleResetMap = async () => {
    if (!gameApp) return;

    const { ask } = await import("@tauri-apps/plugin-dialog");
    const confirmed = await ask(
      "Discard all terrain edits and reset to original?\nThis cannot be undone.",
      { title: "Reset Terrain", kind: "warning" }
    );
    if (!confirmed) {
      return;
    }

    setProcessing(true);
    setStatusMessage("");

    try {
      await gameApp.resetTerrain();
      setStatusMessage("✓ Terrain reset to original");
    } catch (e) {
      setStatusMessage(`✗ Reset failed: ${e}`);
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

      // Update local mouse config state from loaded settings.
      // 从加载的设置更新本地鼠标配置状态
      setMouseConfig(settings.editor.mouseConfig);
      
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
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Editor Mode</div>
          <div className="text-xs text-white/50">
            {canEdit ? "Toggle between play and edit mode" : "Open a project to enable editing"}
          </div>
        </div>
        <button
          onClick={handleToggleMode}
          disabled={!canEdit && editorMode === "play"}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            editorMode === "edit"
              ? "bg-green-600 hover:bg-green-700 text-white"
              : canEdit
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {editorMode === "edit"
            ? "⬛ Stop Editing"
            : canEdit
              ? "✏️ Start Editing"
              : "📁 Open Project First"}
        </button>
      </div>

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
          Mode: {terrainMode === "editable" ? "✓ Project Open (Editable)" : "⚠ Procedural (View Only)"}
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
            className="px-3 py-2 rounded-md text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            📁 Save As...
          </button>
          <button
            onClick={handleResetMap}
            disabled={processing || !canEdit || !dirty}
            className="px-3 py-2 rounded-md text-sm font-medium bg-red-600/80 hover:bg-red-600 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            🔄 Reset Edits
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

      {/* Mouse button configuration */}
      <div>
        <div className="text-sm font-semibold mb-3">Mouse Controls (Edit Mode)</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-white/80">Left Button</label>
            <select
              value={mouseConfig.leftButton}
              onChange={(e) =>
                handleMouseConfigChange("leftButton", e.target.value as EditorMouseAction)
              }
              className="rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-white/80">Right Button</label>
            <select
              value={mouseConfig.rightButton}
              onChange={(e) =>
                handleMouseConfigChange("rightButton", e.target.value as EditorMouseAction)
              }
              className="rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-white/80">Middle Button</label>
            <select
              value={mouseConfig.middleButton}
              onChange={(e) =>
                handleMouseConfigChange("middleButton", e.target.value as EditorMouseAction)
              }
              className="rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
        </div>
        <div className="mt-2 text-xs text-white/50">
          Scroll: Zoom camera • Shift+Scroll: Brush radius
        </div>
      </div>

      {/* Help */}
      <div className="rounded-lg bg-blue-900/30 p-3 text-xs text-blue-200">
        <strong>Tips:</strong>
        <ul className="mt-1 list-disc list-inside space-y-1">
          <li>Open a project folder to enable terrain editing</li>
          <li>Use "Save as Project" to save procedural terrain for editing</li>
          <li>Projects are folders containing map data, settings, and assets</li>
        </ul>
      </div>
    </div>
  );
}
