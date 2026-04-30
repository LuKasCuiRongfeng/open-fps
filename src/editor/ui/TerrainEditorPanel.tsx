// TerrainEditorPanel: UI for terrain editing brush controls only.
// TerrainEditorPanel：仅包含地形编辑画刷控制的 UI
//
// Mode switching, file operations moved to SettingsPanel.
// 模式切换、文件操作已移至 SettingsPanel

import type { TerrainEditor, BrushType } from "@editor/runtime";
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
    <div className="overlay-panel absolute right-4 top-4 w-64 rounded-lg border p-4 text-sm shadow-panel backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">🖌️ Brush</h2>
        <span className="rounded bg-status-success px-2 py-1 text-xs font-medium text-status-success-content">
          EDITING
        </span>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-content-muted">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(["raise", "lower", "smooth", "flatten"] as BrushType[]).map((type) => (
            <button
              key={type}
              onClick={() => setBrushType(type)}
              className={`rounded px-3 py-2 text-xs font-medium capitalize transition-colors ${
                brushType === type
                  ? "bg-accent-primary text-accent-primary-content"
                  : "bg-surface-control text-content-secondary hover:bg-surface-control-hover hover:text-content-primary"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 flex items-center justify-between text-content-muted">
          <span>Radius</span>
          <span className="text-content-primary">{brushRadius.toFixed(0)}m</span>
        </label>
        <input
          type="range"
          min="1"
          max="50"
          step="1"
          value={brushRadius}
          onChange={(e) => setBrushRadius(Number(e.target.value))}
          className="w-full accent-accent-primary"
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 flex items-center justify-between text-content-muted">
          <span>Strength</span>
          <span className="text-content-primary">{(brushStrength * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={brushStrength}
          onChange={(e) => setBrushStrength(Number(e.target.value))}
          className="w-full accent-accent-primary"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 flex items-center justify-between text-content-muted">
          <span>Falloff</span>
          <span className="text-content-primary">{(brushFalloff * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={brushFalloff}
          onChange={(e) => setBrushFalloff(Number(e.target.value))}
          className="w-full accent-accent-primary"
        />
      </div>

      <div className="rounded bg-surface-panel-muted p-2 text-xs text-content-muted">
        <p>• Left-click: paint terrain</p>
        <p>• Right-drag: rotate camera</p>
        <p>• Middle-drag: pan camera</p>
        <p>• Scroll: zoom / Shift+Scroll: radius</p>
        <p>• Press <kbd className="rounded bg-surface-control px-1 text-content-secondary">Esc</kbd> → Settings to exit</p>
      </div>
    </div>
  );
}