// TextureEditorPanel: UI for texture painting brush controls.
// TextureEditorPanel：纹理绘制画刷控制的 UI
//
// Displayed only in edit mode when texture editing is enabled.
// 仅在启用纹理编辑的编辑模式下显示

import { useState, useEffect } from "react";
import type { TextureEditor } from "@game/editor/TextureEditor";

interface Props {
  editor: TextureEditor | null;
  visible: boolean;
}

/**
 * Texture editor panel - brush controls for texture painting.
 * 纹理编辑器面板 - 纹理绘制的画刷控制
 */
export function TextureEditorPanel({ editor, visible }: Props) {
  const [selectedLayer, setSelectedLayer] = useState("");
  const [brushRadius, setBrushRadius] = useState(20);
  const [brushStrength, setBrushStrength] = useState(0.5);
  const [brushFalloff, setBrushFalloff] = useState(0.5);
  const [layerNames, setLayerNames] = useState<readonly string[]>([]);

  // Sync layer names from editor (runs once when editor changes).
  // 从编辑器同步层名称（编辑器更改时运行一次）
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

  if (!editor || !visible || !editor.editingEnabled) return null;

  return (
    <div className="absolute top-4 right-4 w-64 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white text-sm">
      {/* Header / 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">🎨 Texture Brush</h2>
        <span className="px-2 py-1 rounded text-xs font-medium bg-purple-600">
          PAINTING
        </span>
      </div>

      {/* Layer selection / 层选择 */}
      <div className="mb-4">
        <label className="block text-gray-400 mb-2">Texture Layer</label>
        <div className="grid grid-cols-2 gap-2">
          {layerNames.map((layer, index) => (
            <button
              key={layer}
              onClick={() => handleLayerChange(layer)}
              className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                selectedLayer === layer
                  ? "bg-purple-600"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              <span className="text-gray-400 mr-1">{index + 1}.</span>
              {layer}
            </button>
          ))}
        </div>
        {layerNames.length === 0 && (
          <div className="text-gray-500 text-xs italic">
            No texture layers defined
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
          className="w-full accent-purple-500"
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
          className="w-full accent-purple-500"
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
          className="w-full accent-purple-500"
        />
      </div>

      {/* Help text / 帮助文字 */}
      <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500">
        <p>Left click: Paint texture</p>
        <p>Right click: Orbit camera</p>
        <p>Middle click: Pan camera</p>
      </div>
    </div>
  );
}
