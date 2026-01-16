import { useState, useCallback, useEffect } from "react";
import { inputConfig } from "../config/input";
import { visualsConfig } from "../config/visuals";
import type { GameSettings, GameSettingsPatch } from "../game/settings/GameSettings";
import type { GameApp } from "../game/GameApp";
import type { TerrainEditor, EditorMode } from "../game/editor";
import { 
  exportMapWithDialog, 
  importMapWithDialog, 
  saveMapToCurrentFile, 
  getCurrentMapFilePath,
  setCurrentMapFilePath,
  getMapNameFromFilePath,
} from "../game/editor";

type RangeFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function RangeField({ label, value, min, max, step, onChange }: RangeFieldProps) {
  const id = `setting-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="grid grid-cols-[1fr_140px] items-center gap-3">
      <label htmlFor={id} className="text-sm text-white/80">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={id}
          className="h-2 w-full cursor-pointer accent-white"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />

        <input
          className="w-20 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-right text-xs tabular-nums text-white outline-none focus:border-white/30"
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

const TABS = [
  { id: "help", label: "Help" },
  { id: "mapEditor", label: "Map Editor" },
  { id: "render", label: "Render" },
  { id: "camera", label: "Camera" },
  { id: "fog", label: "Fog" },
  { id: "movement", label: "Movement" },
  { id: "physics", label: "Physics" },
  { id: "thirdPerson", label: "3rd Person" },
] as const;

type SettingsTabId = (typeof TABS)[number]["id"];

function keyLabelFromCode(code: string) {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code;
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-left text-xs text-white"
          : "w-full rounded-md border border-transparent bg-transparent px-3 py-2 text-left text-xs text-white/70 hover:bg-white/5 hover:text-white"
      }
    >
      {label}
    </button>
  );
}

type SettingsPanelProps = {
  open: boolean;
  settings: GameSettings;
  gameApp: GameApp | null;
  terrainEditor: TerrainEditor | null;
  terrainMode: "editable" | "procedural";
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  onPatch: (patch: GameSettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
};

export default function SettingsPanel({
  open,
  settings,
  gameApp,
  terrainEditor,
  terrainMode,
  editorMode,
  onEditorModeChange,
  onPatch,
  onReset,
  onClose,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTabId>("help");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [editableMapName, setEditableMapName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [mapLoadCounter, setMapLoadCounter] = useState(0);

  const canEdit = terrainMode === "editable";
  const dirty = terrainEditor?.dirty ?? false;

  // Sync map name and file path.
  // 同步地图名称和文件路径
  useEffect(() => {
    // Get name from file path (not metadata) so it matches the actual file.
    // 从文件路径获取名称（不是元数据），以便与实际文件匹配
    const nameFromPath = getMapNameFromFilePath();
    setEditableMapName(nameFromPath ?? "Untitled");
    setCurrentFilePath(getCurrentMapFilePath());
  }, [terrainEditor, open, mapLoadCounter]);

  // Update map name in editor when changed (metadata only, file path stays the same).
  // 当名称更改时更新编辑器中的地图名称（仅元数据，文件路径保持不变）
  const handleMapNameChange = useCallback((name: string) => {
    setEditableMapName(name);
    terrainEditor?.setMapName(name);
  }, [terrainEditor]);

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

  // Handle save to current file (no dialog).
  // 保存到当前文件（无对话框）
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!gameApp) return false;

    setProcessing(true);
    setStatusMessage("");

    try {
      const mapData = gameApp.exportCurrentMapData();
      const newName = editableMapName.trim() || "my_map";
      mapData.metadata.name = newName;

      // If we have a current file path, save (and rename if needed).
      // 如果有当前文件路径，保存（如有需要则重命名）
      if (currentFilePath) {
        const filepath = await saveMapToCurrentFile(mapData, newName);
        if (filepath) {
          setCurrentFilePath(filepath);
          setStatusMessage(`✓ Saved: ${filepath}`);
          return true;
        }
      }
      
      // Otherwise, ask user to choose location.
      // 否则，让用户选择位置
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

  // Handle map export with file dialog (always asks for location).
  // 使用文件对话框处理地图导出（总是询问位置）
  const handleExport = useCallback(async () => {
    if (!gameApp) return;

    setProcessing(true);
    setStatusMessage("");

    try {
      const mapData = gameApp.exportCurrentMapData();
      mapData.metadata.name = editableMapName.trim() || "exported_map";
      
      const filepath = await exportMapWithDialog(mapData, editableMapName.trim() || "exported_map");
      
      if (filepath) {
        // Update current file path after export.
        // 导出后更新当前文件路径
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

    // If dirty, ask to save first using Tauri's native dialog.
    // 如果有未保存的更改，使用 Tauri 原生对话框先询问是否保存
    if (dirty) {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const shouldSave = await ask(
        "You have unsaved changes. Save before importing?",
        { title: "Unsaved Changes", kind: "warning" }
      );
      if (shouldSave) {
        const saved = await handleSave();
        if (!saved) {
          // Save was cancelled or failed, don't proceed with import.
          // 保存被取消或失败，不继续导入
          return;
        }
      }
      // If user chose not to save, continue with import (discard changes).
      // 如果用户选择不保存，继续导入（丢弃更改）
    }

    // Now show import dialog.
    // 现在显示导入对话框
    setProcessing(true);
    setStatusMessage("");

    try {
      const mapData = await importMapWithDialog();
      if (mapData) {
        await gameApp.loadMapData(mapData);
        // Force re-sync of map name and file path.
        // 强制重新同步地图名称和文件路径
        setMapLoadCounter((c) => c + 1);
        setStatusMessage(`✓ Imported: ${mapData.metadata.name}`);
        // Switch to edit mode after import.
        // 导入后切换到编辑模式
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

    // Use Tauri's native dialog for confirmation.
    // 使用 Tauri 原生对话框确认
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

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />

      <div className="absolute left-1/2 top-6 w-[min(860px,calc(100vw-2rem))] -translate-x-1/2">
        <div className="rounded-xl border border-white/10 bg-black/70 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
            <div>
              <div className="text-sm font-semibold tracking-wide">Settings</div>
              <div className="text-xs text-white/60">Applies immediately</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                type="button"
                onClick={() => {
                  onReset();
                }}
              >
                Reset
              </button>
              <button
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                type="button"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex max-h-[78vh] min-h-[420px]">
            <div className="w-40 shrink-0 border-r border-white/10 p-3">
              <div className="space-y-1.5">
                {TABS.map((t) => (
                  <TabButton
                    key={t.id}
                    active={tab === t.id}
                    label={t.label}
                    onClick={() => setTab(t.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
            {tab === "help" ? (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-semibold">Controls</div>
                  <div className="mt-2 space-y-1.5 text-sm text-white/75">
                    <div>Click the game view to lock pointer.</div>
                    <div>WASD / Arrow keys: Move</div>
                    <div>Shift: Sprint</div>
                    <div>Space: Jump</div>
                    <div>
                      {keyLabelFromCode(inputConfig.toggleCameraMode.code)}: Toggle 1st / 3rd person
                    </div>
                    <div>
                      {keyLabelFromCode(inputConfig.toggleThirdPersonStyle.code)}: Toggle OTS / Chase
                    </div>
                    <div>Escape: Open/Close Settings</div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold">Notes</div>
                  <div className="mt-2 space-y-1.5 text-sm text-white/75">
                    <div>Settings apply immediately.</div>
                    <div>Reset restores default values.</div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "mapEditor" ? (
              <div className="space-y-5">
                {/* Mode toggle / 模式切换 */}
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
                    {editorMode === "edit" ? "⬛ Stop Editing" : canEdit ? "✏️ Start Editing" : "📁 Load Map First"}
                  </button>
                </div>

                {/* Current map info / 当前地图信息 */}
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

                {/* File operations / 文件操作 */}
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

                {/* Status message / 状态消息 */}
                {statusMessage && (
                  <div className={`text-sm ${statusMessage.startsWith("✓") ? "text-green-400" : statusMessage.includes("cancelled") ? "text-yellow-400" : "text-red-400"}`}>
                    {statusMessage}
                  </div>
                )}

                {/* Help / 帮助 */}
                <div className="rounded-lg bg-blue-900/30 p-3 text-xs text-blue-200">
                  <strong>Tips:</strong>
                  <ul className="mt-1 list-disc list-inside space-y-1">
                    <li>Import a map file to enable editing</li>
                    <li>Export procedural terrain to create an editable copy</li>
                    <li>Save frequently to avoid losing edits</li>
                  </ul>
                </div>
              </div>
            ) : null}

            {tab === "render" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="Max Pixel Ratio"
                  value={settings.render.maxPixelRatio}
                  min={0.5}
                  max={3}
                  step={0.05}
                  onChange={(v) => onPatch({ render: { maxPixelRatio: v } })}
                />
              </div>
            ) : null}

            {tab === "camera" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="FOV (degrees)"
                  value={settings.camera.fovDegrees}
                  min={40}
                  max={110}
                  step={1}
                  onChange={(v) => onPatch({ camera: { fovDegrees: v } })}
                />
              </div>
            ) : null}

            {tab === "fog" ? (
              <div className="space-y-4">
                <div className="text-xs text-white/60 mb-4">
                  Fog density controls atmospheric haze. Lower values = clearer visibility.
                  <br />
                  雾浓度控制大气雾化。数值越低 = 能见度越高。
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <RangeField
                    label="Fog Density"
                    value={settings.fog.density}
                    min={visualsConfig.fog.minDensity}
                    max={visualsConfig.fog.maxDensity}
                    step={0.00001}
                    onChange={(v) => onPatch({ fog: { density: v } })}
                  />
                </div>
                <div className="text-xs text-white/40 mt-2">
                  Visibility ≈ {Math.round(3.912 / settings.fog.density)}m
                </div>
              </div>
            ) : null}

            {tab === "movement" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="Mouse Sensitivity"
                  value={settings.player.mouseSensitivity}
                  min={0.05}
                  max={5}
                  step={0.01}
                  onChange={(v) => onPatch({ player: { mouseSensitivity: v } })}
                />
                <RangeField
                  label="Move Speed (m/s)"
                  value={settings.player.moveSpeed}
                  min={0.5}
                  max={40}
                  step={0.1}
                  onChange={(v) => onPatch({ player: { moveSpeed: v } })}
                />
                <RangeField
                  label="Sprint Bonus (m/s)"
                  value={settings.player.sprintBonus}
                  min={0}
                  max={60}
                  step={0.1}
                  onChange={(v) => onPatch({ player: { sprintBonus: v } })}
                />
              </div>
            ) : null}

            {tab === "physics" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="Jump Velocity (m/s)"
                  value={settings.player.jumpVelocity}
                  min={0.5}
                  max={20}
                  step={0.1}
                  onChange={(v) => onPatch({ player: { jumpVelocity: v } })}
                />
                <RangeField
                  label="Gravity (m/s²)"
                  value={settings.player.gravity}
                  min={0}
                  max={60}
                  step={0.1}
                  onChange={(v) => onPatch({ player: { gravity: v } })}
                />
                <RangeField
                  label="Max Fall Speed (m/s)"
                  value={settings.player.maxFallSpeed}
                  min={1}
                  max={120}
                  step={1}
                  onChange={(v) => onPatch({ player: { maxFallSpeed: v } })}
                />
              </div>
            ) : null}

            {tab === "thirdPerson" ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <RangeField
                    label="Follow Lerp (/s)"
                    value={settings.player.thirdPerson.followLerpPerSecond}
                    min={0}
                    max={40}
                    step={0.5}
                    onChange={(v) => onPatch({ player: { thirdPerson: { followLerpPerSecond: v } } })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <RangeField
                    label="Chase Distance (m)"
                    value={settings.player.thirdPerson.chase.followDistance}
                    min={0.5}
                    max={8}
                    step={0.05}
                    onChange={(v) =>
                      onPatch({ player: { thirdPerson: { chase: { followDistance: v } } } })
                    }
                  />
                  <RangeField
                    label="Chase Height (m)"
                    value={settings.player.thirdPerson.chase.heightOffset}
                    min={0}
                    max={4}
                    step={0.05}
                    onChange={(v) => onPatch({ player: { thirdPerson: { chase: { heightOffset: v } } } })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <RangeField
                    label="OTS Distance (m)"
                    value={settings.player.thirdPerson.overShoulder.followDistance}
                    min={0.5}
                    max={8}
                    step={0.05}
                    onChange={(v) =>
                      onPatch({ player: { thirdPerson: { overShoulder: { followDistance: v } } } })
                    }
                  />
                  <RangeField
                    label="OTS Height (m)"
                    value={settings.player.thirdPerson.overShoulder.heightOffset}
                    min={0}
                    max={4}
                    step={0.05}
                    onChange={(v) =>
                      onPatch({ player: { thirdPerson: { overShoulder: { heightOffset: v } } } })
                    }
                  />
                  <RangeField
                    label="OTS Shoulder (m)"
                    value={settings.player.thirdPerson.overShoulder.shoulderOffset}
                    min={-2}
                    max={2}
                    step={0.05}
                    onChange={(v) =>
                      onPatch({ player: { thirdPerson: { overShoulder: { shoulderOffset: v } } } })
                    }
                  />
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
