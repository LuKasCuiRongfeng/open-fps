// TerrainEditorPanel: UI for terrain editing brush controls only.
// TerrainEditorPanel：仅包含地形编辑画刷控制的 UI
//
// Mode switching, file operations moved to SettingsPanel.
// 模式切换、文件操作已移至 SettingsPanel

import type { TerrainEditor, BrushType } from "@game/editor";
import { useTerrainBrushSettings } from "./hooks";

interface Props {
  editor: TerrainEditor | null;
}

/**
 * Terrain editor panel - brush controls only.
 * 地形编辑器面板 - 仅画刷控制
 *
 * Displayed only in edit mode. Mode switching is in Settings.
 * 仅在编辑模式显示。模式切换在设置中。
 */
export function TerrainEditorPanel({ editor }: Props) {
  const {
    brushType,
    brushRadius,
    brushStrength,
    brushFalloff,
    setBrushType,
    setBrushRadius,
    setBrushStrength,
    setBrushFalloff,
  } = useTerrainBrushSettings(editor);

  if (!editor) return null;

  return (
    <div className="absolute top-4 right-4 w-64 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white text-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">🖌️ Brush</h2>
        <span className="px-2 py-1 rounded text-xs font-medium bg-green-600">
          EDITING
        </span>
      </div>

      <div className="mb-4">
        <label className="block text-gray-400 mb-2">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(["raise", "lower", "smooth", "flatten"] as BrushType[]).map((type) => (
            <button
              key={type}
              onClick={() => setBrushType(type)}
              className={`px-3 py-2 rounded text-xs font-medium transition-colors capitalize ${
                brushType === type
                  ? "bg-blue-600"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <label className="flex items-center justify-between text-gray-400 mb-1">
          <span>Radius</span>
          <span className="text-white">{brushRadius.toFixed(0)}m</span>
        </label>
        <input
          type="range"
          min="1"
          max="50"
          step="1"
          value={brushRadius}
          onChange={(e) => setBrushRadius(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      <div className="mb-3">
        <label className="flex items-center justify-between text-gray-400 mb-1">
          <span>Strength</span>
          <span className="text-white">{(brushStrength * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={brushStrength}
          onChange={(e) => setBrushStrength(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      <div className="mb-4">
        <label className="flex items-center justify-between text-gray-400 mb-1">
          <span>Falloff</span>
          <span className="text-white">{(brushFalloff * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={brushFalloff}
          onChange={(e) => setBrushFalloff(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      <div className="p-2 bg-gray-800/50 rounded text-xs text-gray-400">
        <p>• Left-click: paint terrain</p>
        <p>• Right-drag: rotate camera</p>
        <p>• Middle-drag: pan camera</p>
        <p>• Scroll: zoom / Shift+Scroll: radius</p>
        <p>• Press <kbd className="px-1 bg-gray-700 rounded">Esc</kbd> → Settings to exit</p>
      </div>
    </div>
  );
}