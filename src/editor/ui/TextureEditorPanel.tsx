// TextureEditorPanel: UI for texture painting brush controls.
// TextureEditorPanel：纹理绘制画刷控制的 UI
//
// Displayed only in edit mode when texture editing is enabled.
// 仅在启用纹理编辑的编辑模式下显示

import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import { useTextureBrushSettings } from "./hooks";

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
    <div className="overlay-panel absolute right-4 top-4 w-64 rounded-lg border p-4 text-sm shadow-panel backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">🎨 Texture Brush</h2>
        <span className="rounded bg-accent-secondary px-2 py-1 text-xs font-medium text-accent-secondary-content">
          PAINTING
        </span>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-content-muted">Texture Layer</label>
        <div className="grid grid-cols-2 gap-2">
          {layerNames.map((layer, index) => (
            <button
              key={layer}
              onClick={() => setSelectedLayer(layer)}
              className={`rounded px-3 py-2 text-xs font-medium transition-colors ${
                selectedLayer === layer
                  ? "bg-accent-secondary text-accent-secondary-content"
                  : "bg-surface-control text-content-secondary hover:bg-surface-control-hover hover:text-content-primary"
              }`}
            >
              <span className="mr-1 text-content-muted">{index + 1}.</span>
              {layer}
            </button>
          ))}
        </div>
        {layerNames.length === 0 && (
          <div className="text-xs italic text-content-muted">
            No texture layers defined
          </div>
        )}
      </div>

      <div className="mb-3">
        <label className="mb-1 flex items-center justify-between text-content-muted">
          <span>Radius</span>
          <span className="text-content-primary">{brushRadius.toFixed(0)}m</span>
        </label>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={brushRadius}
          onChange={(e) => setBrushRadius(Number(e.target.value))}
          className="w-full accent-accent-secondary"
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 flex items-center justify-between text-content-muted">
          <span>Strength</span>
          <span className="text-content-primary">{(brushStrength * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.01"
          max="1"
          step="0.01"
          value={brushStrength}
          onChange={(e) => setBrushStrength(Number(e.target.value))}
          className="w-full accent-accent-secondary"
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 flex items-center justify-between text-content-muted">
          <span>Falloff</span>
          <span className="text-content-primary">{(brushFalloff * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={brushFalloff}
          onChange={(e) => setBrushFalloff(Number(e.target.value))}
          className="w-full accent-accent-secondary"
        />
      </div>

      <div className="mt-4 border-t border-stroke-subtle pt-3 text-xs text-content-muted">
        <p>Left click: Paint texture</p>
        <p>Right click: Orbit camera</p>
        <p>Middle click: Pan camera</p>
      </div>
    </div>
  );
}