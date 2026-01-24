// VegetationEditorTab: vegetation editor settings tab with start/stop editing.
// VegetationEditorTab：带有开始/停止编辑的植被编辑器设置标签

import { useState, useEffect } from "react";
import type { VegetationEditor } from "@game/editor/vegetation/VegetationEditor";
import type { ActiveEditorType } from "./TerrainEditorTab";
import { RangeField } from "../RangeField";
import { Toggle } from "../Toggle";

type VegetationEditorTabProps = {
  vegetationEditor: VegetationEditor | null;
  terrainMode: "editable" | "procedural";
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
  onClose?: () => void;
};

export function VegetationEditorTab({
  vegetationEditor,
  terrainMode,
  activeEditor,
  onActiveEditorChange,
  onClose,
}: VegetationEditorTabProps) {
  const [selectedLayer, setSelectedLayer] = useState("");
  const [brushRadius, setBrushRadius] = useState(15);
  const [brushStrength, setBrushStrength] = useState(0.5);
  const [brushFalloff, setBrushFalloff] = useState(0.5);
  const [brushMode, setBrushMode] = useState<"add" | "remove" | "erase">("add");

  const canEdit = terrainMode === "editable";
  const editingEnabled = vegetationEditor?.editingEnabled ?? false;
  const isEditing = activeEditor === "vegetation";
  const layerNames = vegetationEditor?.layerNames ?? [];
  const definition = vegetationEditor?.vegetationDefinition ?? null;

  // Sync state from editor.
  // 从编辑器同步状态
  useEffect(() => {
    if (vegetationEditor) {
      const settings = vegetationEditor.brushSettings;
      setSelectedLayer(settings.selectedLayer);
      setBrushRadius(settings.radius);
      setBrushStrength(settings.strength);
      setBrushFalloff(settings.falloff);
      setBrushMode(settings.mode);
    }
  }, [vegetationEditor]);

  // Toggle edit mode.
  // 切换编辑模式
  const handleToggleMode = (checked: boolean) => {
    if (!canEdit || !editingEnabled) return;

    if (!checked) {
      // Stop editing.
      // 停止编辑
      onActiveEditorChange("none");
    } else {
      // Start editing - this will stop other editors.
      // 开始编辑 - 这会停止其他编辑器
      onActiveEditorChange("vegetation");
      onClose?.();
    }
  };

  // Handle layer selection.
  // 处理层选择
  const handleLayerSelect = (layerName: string) => {
    setSelectedLayer(layerName);
    vegetationEditor?.setSelectedLayer(layerName);
  };

  // Handle brush mode change.
  // 处理画刷模式变化
  const handleModeChange = (mode: "add" | "remove" | "erase") => {
    setBrushMode(mode);
    vegetationEditor?.setBrushMode(mode);
  };

  // Handle brush radius change.
  // 处理画刷半径变化
  const handleRadiusChange = (value: number) => {
    setBrushRadius(value);
    vegetationEditor?.setBrushRadius(value);
  };

  // Handle brush strength change.
  // 处理画刷强度变化
  const handleStrengthChange = (value: number) => {
    setBrushStrength(value);
    vegetationEditor?.setBrushStrength(value);
  };

  // Handle brush falloff change.
  // 处理画刷衰减变化
  const handleFalloffChange = (value: number) => {
    setBrushFalloff(value);
    vegetationEditor?.setBrushFalloff(value);
  };

  // Get layer display name (the layer key itself).
  // 获取层显示名称（层键本身）
  const getLayerDisplay = (layerName: string) => {
    // The layerName is the key in the definition object, use it as display name.
    // layerName 是定义对象中的键，将其用作显示名称
    return layerName;
  };

  // Get layer model path.
  // 获取层模型路径
  const getLayerModel = (layerName: string) => {
    if (!definition) return "";
    const layer = definition[layerName];
    return layer?.model ?? "";
  };

  // Unavailable state.
  // 不可用状态
  if (!canEdit) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-400">
          Vegetation editing is only available in editable terrain mode.
        </p>
        <p className="text-sm text-zinc-500">
          Create a new map or import terrain data to enable editing.
        </p>
      </div>
    );
  }

  // Not ready state.
  // 未就绪状态
  if (!editingEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-400">
          Vegetation editor is loading or no vegetation.json defined.
        </p>
        <p className="text-sm text-zinc-500">
          Add a vegetation.json file to your project to enable vegetation editing.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Edit mode toggle */}
      {/* 编辑模式切换 */}
      <Toggle
        label="Edit Vegetation"
        checked={isEditing}
        onChange={handleToggleMode}
      />

      {isEditing && (
        <>
          {/* Brush mode selector */}
          {/* 画刷模式选择器 */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-zinc-300">Brush Mode</span>
            <div className="flex gap-2">
              <button
                className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                  brushMode === "add"
                    ? "bg-green-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
                onClick={() => handleModeChange("add")}
              >
                Add
              </button>
              <button
                className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                  brushMode === "remove"
                    ? "bg-yellow-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
                onClick={() => handleModeChange("remove")}
              >
                Remove
              </button>
              <button
                className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                  brushMode === "erase"
                    ? "bg-red-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
                onClick={() => handleModeChange("erase")}
              >
                Erase
              </button>
            </div>
          </div>

          {/* Layer selector */}
          {/* 层选择器 */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-zinc-300">Vegetation Layer</span>
            {layerNames.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No vegetation layers defined.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {layerNames.map((layerName) => (
                  <button
                    key={layerName}
                    className={`px-3 py-2 text-sm text-left rounded transition-colors ${
                      selectedLayer === layerName
                        ? "bg-sky-600 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                    onClick={() => handleLayerSelect(layerName)}
                  >
                    <span className="font-medium">{getLayerDisplay(layerName)}</span>
                    <span className="text-xs text-zinc-400 ml-2">
                      ({getLayerModel(layerName)})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Brush settings */}
          {/* 画刷设置 */}
          <div className="flex flex-col gap-3 pt-2 border-t border-zinc-700">
            <RangeField
              label="Radius"
              value={brushRadius}
              min={1}
              max={100}
              step={1}
              onChange={handleRadiusChange}
            />
            <RangeField
              label="Strength"
              value={brushStrength}
              min={0.01}
              max={1}
              step={0.01}
              onChange={handleStrengthChange}
            />
            <RangeField
              label="Falloff"
              value={brushFalloff}
              min={0}
              max={1}
              step={0.01}
              onChange={handleFalloffChange}
            />
          </div>

          {/* Tips */}
          {/* 提示 */}
          <div className="pt-2 border-t border-zinc-700">
            <p className="text-xs text-zinc-500">
              Left click to paint • Shift+Scroll to adjust radius
            </p>
          </div>
        </>
      )}
    </div>
  );
}
