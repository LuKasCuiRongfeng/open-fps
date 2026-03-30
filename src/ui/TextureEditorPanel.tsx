// TextureEditorPanel: UI for texture painting brush controls.
// TextureEditorPanel：纹理绘制画刷控制的 UI
//
// Displayed only in edit mode when texture editing is enabled.
// 仅在启用纹理编辑的编辑模式下显示

import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import { useTextureBrushSettings } from "./editor/hooks";

interface Props {
  editor: TextureEditor | null;
  visible: boolean;
}

/**
 * Texture editor panel - brush controls for texture painting.
 * 纹理编辑器面板 - 纹理绘制的画刷控制
 */
export function TextureEditorPanel({ editor, visible }: Props) {
  const {
    selectedLayer,
    brushRadius,
    brushStrength,
    brushFalloff,
    setSelectedLayer,
    setBrushRadius,
    setBrushStrength,
    setBrushFalloff,
  } = useTextureBrushSettings(editor);

  if (!editor || !visible || !editor.editingEnabled) return null;

  const layerNames = editor.layerNames;

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
              onClick={() => setSelectedLayer(layer)}
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
          onChange={(e) => setBrushRadius(Number(e.target.value))}
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
          onChange={(e) => setBrushStrength(Number(e.target.value))}
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
          onChange={(e) => setBrushFalloff(Number(e.target.value))}
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
