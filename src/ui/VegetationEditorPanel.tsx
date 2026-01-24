// VegetationEditorPanel: UI for vegetation density painting brush controls.
// VegetationEditorPanel：植被密度绘制画刷控制的 UI
//
// Displayed only in edit mode when vegetation editing is enabled.
// 仅在启用植被编辑的编辑模式下显示

import { useState, useEffect } from "react";
import type { VegetationEditor } from "@game/editor/vegetation/VegetationEditor";
import type { VegetationBrushMode } from "@game/editor/vegetation/VegetationBrush";

interface Props {
  editor: VegetationEditor | null;
  visible: boolean;
}

const BRUSH_MODES: { mode: VegetationBrushMode; label: string; icon: string }[] = [
  { mode: "add", label: "Add", icon: "➕" },
  { mode: "remove", label: "Remove", icon: "➖" },
  { mode: "erase", label: "Erase All", icon: "🗑️" },
];

/**
 * Vegetation editor panel - brush controls for density painting.
 * 植被编辑器面板 - 密度绘制的画刷控制
 */
export function VegetationEditorPanel({ editor, visible }: Props) {
  const [selectedLayer, setSelectedLayer] = useState("");
  const [brushMode, setBrushMode] = useState<VegetationBrushMode>("add");
  const [brushRadius, setBrushRadius] = useState(15);
  const [brushStrength, setBrushStrength] = useState(0.5);
  const [brushFalloff, setBrushFalloff] = useState(0.5);
  const [layerNames, setLayerNames] = useState<readonly string[]>([]);

  // Sync layer names from editor.
  // 从编辑器同步层名称
  useEffect(() => {
    if (!editor) return;
    setLayerNames(editor.layerNames);
  }, [editor]);

  // Sync state from editor.
  // 从编辑器同步状态
  useEffect(() => {
    if (!editor) return;

    const brush = editor.brushSettings;
    setSelectedLayer(brush.selectedLayer);
    setBrushMode(brush.mode);
    setBrushRadius(brush.radius);
    setBrushStrength(brush.strength);
    setBrushFalloff(brush.falloff);
  }, [editor]);

  // Layer selection change.
  // 层选择更改
  const handleLayerChange = (layer: string) => {
    setSelectedLayer(layer);
    editor?.setSelectedLayer(layer);
  };

  // Brush mode change.
  // 画刷模式更改
  const handleModeChange = (mode: VegetationBrushMode) => {
    setBrushMode(mode);
    editor?.setBrushMode(mode);
  };

  // Brush radius change.
  // 画刷半径更改
  const handleRadiusChange = (value: number) => {
    setBrushRadius(value);
    editor?.setBrushRadius(value);
  };

  // Brush strength change.
  // 画刷强度更改
  const handleStrengthChange = (value: number) => {
    setBrushStrength(value);
    editor?.setBrushStrength(value);
  };

  // Brush falloff change.
  // 画刷衰减更改
  const handleFalloffChange = (value: number) => {
    setBrushFalloff(value);
    editor?.setBrushFalloff(value);
  };

  // Get vegetation type icon.
  // 获取植被类型图标
  const getTypeIcon = (layerName: string): string => {
    const def = editor?.vegetationDefinition;
    if (!def || !def[layerName]) return "🌿";
    const type = def[layerName].type;
    switch (type) {
      case "grass": return "🌾";
      case "shrub": return "🌳";
      case "tree": return "🌲";
      default: return "🌿";
    }
  };

  if (!editor || !visible || !editor.editingEnabled) return null;

  return (
    <div className="absolute top-4 right-4 w-64 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white text-sm">
      {/* Header / 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">🌿 Vegetation Brush</h2>
        <span className="px-2 py-1 rounded text-xs font-medium bg-green-600">
          PAINTING
        </span>
      </div>

      {/* Brush mode / 画刷模式 */}
      <div className="mb-4">
        <label className="block text-gray-400 mb-2">Brush Mode</label>
        <div className="flex gap-2">
          {BRUSH_MODES.map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`flex-1 px-2 py-2 rounded text-xs font-medium transition-colors ${
                brushMode === mode
                  ? "bg-green-600"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              <span className="mr-1">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Layer selection / 层选择 */}
      <div className="mb-4">
        <label className="block text-gray-400 mb-2">Vegetation Layer</label>
        <div className="grid grid-cols-2 gap-2">
          {layerNames.map((layer) => (
            <button
              key={layer}
              onClick={() => handleLayerChange(layer)}
              className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                selectedLayer === layer
                  ? "bg-green-600"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              <span className="mr-1">{getTypeIcon(layer)}</span>
              {layer}
            </button>
          ))}
        </div>
        {layerNames.length === 0 && (
          <div className="text-gray-500 text-xs italic">
            No vegetation layers defined in vegetation.json
          </div>
        )}
      </div>

      {/* Brush radius / 画刷半径 */}
      <div className="mb-3">
        <label className="flex items-center justify-between text-gray-400 mb-1">
          <span>Radius</span>
          <span className="text-white">{brushRadius.toFixed(0)}m</span>
        </label>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={brushRadius}
          onChange={(e) => handleRadiusChange(Number(e.target.value))}
          className="w-full accent-green-500"
        />
      </div>

      {/* Brush strength / 画刷强度 */}
      <div className="mb-3">
        <label className="flex items-center justify-between text-gray-400 mb-1">
          <span>Strength</span>
          <span className="text-white">{(brushStrength * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.01"
          max="1"
          step="0.01"
          value={brushStrength}
          onChange={(e) => handleStrengthChange(Number(e.target.value))}
          className="w-full accent-green-500"
        />
      </div>

      {/* Brush falloff / 画刷衰减 */}
      <div className="mb-3">
        <label className="flex items-center justify-between text-gray-400 mb-1">
          <span>Falloff</span>
          <span className="text-white">{(brushFalloff * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={brushFalloff}
          onChange={(e) => handleFalloffChange(Number(e.target.value))}
          className="w-full accent-green-500"
        />
      </div>

      {/* Help text / 帮助文字 */}
      <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500">
        <p>Left click: Paint vegetation</p>
        <p>Right click: Orbit camera</p>
        <p>Middle click: Pan camera</p>
        <p className="mt-2 text-green-400">
          {brushMode === "add" && "Adding vegetation density"}
          {brushMode === "remove" && "Removing selected layer"}
          {brushMode === "erase" && "Erasing all vegetation"}
        </p>
      </div>
    </div>
  );
}
