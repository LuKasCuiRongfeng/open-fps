// MapEditorTab: map editor settings tab.
// MapEditorTab：地图编辑器设置标签

import { useState, useCallback, useEffect } from "react";
import type { GameApp } from "../../../game/GameApp";
import type { 
  TerrainEditor, 
  EditorMode, 
  EditorMouseAction, 
  EditorMouseConfig 
} from "../../../game/editor";
import {
  exportMapWithDialog,
  importMapWithDialog,
  saveMapToCurrentFile,
  getCurrentMapFilePath,
  setCurrentMapFilePath,
  getMapNameFromFilePath,
} from "../../../game/editor";

type MapEditorTabProps = {
  gameApp: GameApp | null;
  terrainEditor: TerrainEditor | null;
  terrainMode: "editable" | "procedural";
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
};

export function MapEditorTab({
  gameApp,
  terrainEditor,
  terrainMode,
  editorMode,
  onEditorModeChange,
}: MapEditorTabProps) {
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [editableMapName, setEditableMapName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [mapLoadCounter, setMapLoadCounter] = useState(0);

  // Mouse button configuration state.
  // 鼠标按键配置状态
  const [mouseConfig, setMouseConfig] = useState<EditorMouseConfig>(() => ({
    leftButton: terrainEditor?.mouseConfig.leftButton ?? "brush",
    rightButton: terrainEditor?.mouseConfig.rightButton ?? "orbit",
    middleButton: terrainEditor?.mouseConfig.middleButton ?? "pan",
  }));

  const canEdit = terrainMode === "editable";
  const dirty = terrainEditor?.dirty ?? false;

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
  const handleMouseConfigChange = useCallback(
    (button: keyof EditorMouseConfig, action: EditorMouseAction) => {
      setMouseConfig((prev) => ({ ...prev, [button]: action }));
      terrainEditor?.setMouseConfig({ [button]: action });
    },
    [terrainEditor]
  );

  // Sync map name and file path.
  // 同步地图名称和文件路径
  useEffect(() => {
    const nameFromPath = getMapNameFromFilePath();
    setEditableMapName(nameFromPath ?? "Untitled");
    setCurrentFilePath(getCurrentMapFilePath());
  }, [terrainEditor, mapLoadCounter]);

  // Update map name in editor.
  // 更新编辑器中的地图名称
  const handleMapNameChange = useCallback(
    (name: string) => {
      setEditableMapName(name);
      terrainEditor?.setMapName(name);
    },
    [terrainEditor]
  );

  // Toggle edit mode.
  // 切换编辑模式
  const handleToggleMode = useCallback(() => {
    if (!canEdit && editorMode === "play") {
      setStatusMessage("Cannot edit: load a map file first");
      return;
    }
    terrainEditor?.toggleMode();
    const newMode = terrainEditor?.mode ?? "play";
    onEditorModeChange(newMode);
  }, [terrainEditor, canEdit, editorMode, onEditorModeChange]);

  // Handle save to current file.
  // 保存到当前文件
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!gameApp) return false;

    setProcessing(true);
    setStatusMessage("");

    try {
      const mapData = gameApp.exportCurrentMapData();
      const newName = editableMapName.trim() || "my_map";
      mapData.metadata.name = newName;

      if (currentFilePath) {
        const filepath = await saveMapToCurrentFile(mapData, newName);
        if (filepath) {
          setCurrentFilePath(filepath);
          setStatusMessage(`✓ Saved: ${filepath}`);
          return true;
        }
      }

      const filepath = await exportMapWithDialog(mapData, newName);
      if (filepath) {
        setCurrentFilePath(filepath);
        setCurrentMapFilePath(filepath);
        setStatusMessage(`✓ Saved: ${filepath}`);
        return true;
      } else {
        setStatusMessage("Save cancelled");
        return false;
      }
    } catch (e) {
      setStatusMessage(`✗ Save failed: ${e}`);
      return false;
    } finally {
      setProcessing(false);
    }
  }, [gameApp, editableMapName, currentFilePath]);

  // Handle map export with file dialog.
  // 使用文件对话框处理地图导出
  const handleExport = useCallback(async () => {
    if (!gameApp) return;

    setProcessing(true);
    setStatusMessage("");

    try {
      const mapData = gameApp.exportCurrentMapData();
      mapData.metadata.name = editableMapName.trim() || "exported_map";

      const filepath = await exportMapWithDialog(
        mapData,
        editableMapName.trim() || "exported_map"
      );

      if (filepath) {
        setCurrentFilePath(filepath);
        setCurrentMapFilePath(filepath);
        setStatusMessage(`✓ Exported to: ${filepath}`);
      } else {
        setStatusMessage("Export cancelled");
      }
    } catch (e) {
      setStatusMessage(`✗ Export failed: ${e}`);
    } finally {
      setProcessing(false);
    }
  }, [gameApp, editableMapName]);

  // Handle map import with file dialog.
  // 使用文件对话框处理地图导入
  const handleImport = useCallback(async () => {
    if (!gameApp) return;

    if (dirty) {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const shouldSave = await ask(
        "You have unsaved changes. Save before importing?",
        { title: "Unsaved Changes", kind: "warning" }
      );
      if (shouldSave) {
        const saved = await handleSave();
        if (!saved) {
          return;
        }
      }
    }

    setProcessing(true);
    setStatusMessage("");

    try {
      const mapData = await importMapWithDialog();
      if (mapData) {
        await gameApp.loadMapData(mapData);
        setMapLoadCounter((c) => c + 1);
        setStatusMessage(`✓ Imported: ${mapData.metadata.name}`);
        if (terrainEditor?.mode !== "edit") {
          terrainEditor?.setMode("edit");
          onEditorModeChange("edit");
        }
      } else {
        setStatusMessage("Import cancelled");
      }
    } catch (e) {
      setStatusMessage(`✗ Import failed: ${e}`);
    } finally {
      setProcessing(false);
    }
  }, [gameApp, dirty, handleSave, terrainEditor, onEditorModeChange]);

  // Handle reset (discard edits).
  // 重置（丢弃编辑）
  const handleResetMap = useCallback(async () => {
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
  }, [gameApp]);

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Editor Mode</div>
          <div className="text-xs text-white/50">
            {canEdit ? "Toggle between play and edit mode" : "Load a map to enable editing"}
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
              : "📁 Load Map First"}
        </button>
      </div>

      {/* Current map info */}
      <div className="rounded-md border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/60">Current Map</div>
          {dirty && <span className="text-xs text-yellow-400">● Unsaved changes</span>}
        </div>
        <div className="mt-2">
          <label className="block text-xs text-white/50 mb-1">Map Name</label>
          <input
            type="text"
            value={editableMapName}
            onChange={(e) => handleMapNameChange(e.target.value)}
            placeholder="Untitled"
            className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
        <div className="mt-2 text-xs text-white/50">
          Mode: {terrainMode === "editable" ? "Editable (from file)" : "Procedural (view only)"}
        </div>
        {currentFilePath && (
          <div className="mt-1 text-xs text-white/40 truncate" title={currentFilePath}>
            📁 {currentFilePath}
          </div>
        )}
      </div>

      {/* File operations */}
      <div>
        <div className="text-sm font-semibold mb-3">File Operations</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleImport}
            disabled={processing}
            className="px-3 py-2 rounded-md text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            📂 Import Map...
          </button>
          <button
            onClick={handleExport}
            disabled={processing}
            className="px-3 py-2 rounded-md text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            💾 Export Map...
          </button>
          <button
            onClick={handleSave}
            disabled={processing || !canEdit}
            className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            💾 Save
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
        <div className="text-sm font-semibold mb-3">Mouse Controls</div>
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
          <li>Import a map file to enable editing</li>
          <li>Export procedural terrain to create an editable copy</li>
          <li>Save frequently to avoid losing edits</li>
        </ul>
      </div>
    </div>
  );
}
