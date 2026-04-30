// TextureEditorTab: texture editor settings tab with start/stop editing.
// TextureEditorTab：带有开始/停止编辑的纹理编辑器设置标签

import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { ActiveEditorType } from "./TerrainEditorTab";
import { useTextureBrushSettings } from "../../hooks/useTextureBrushSettings";

type TextureEditorTabProps = {
  textureEditor: TextureEditor | null;
  terrainMode: "editable" | "procedural";
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
  onClose?: () => void;
};

export function TextureEditorTab({
  textureEditor,
  terrainMode,
  activeEditor,
  onActiveEditorChange,
  onClose,
}: TextureEditorTabProps) {
  const {
    selectedLayer,
    brushRadius,
    brushStrength,
    brushFalloff,
    setSelectedLayer,
    setBrushRadius,
    setBrushStrength,
    setBrushFalloff,
  } = useTextureBrushSettings(textureEditor);

  const canEdit = terrainMode === "editable";
  const editingEnabled = textureEditor?.editingEnabled ?? false;
  const isEditing = activeEditor === "texture";
  const layerNames = textureEditor?.layerNames ?? [];

  const handleSelectTexture = () => {
    if (!canEdit || !editingEnabled) return;

    onActiveEditorChange("texture");
    onClose?.();
  };

  const canStartEditing = canEdit && editingEnabled;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Texture Painting</div>
          <div className="text-xs text-content-muted">
            {!canEdit
              ? "Open a project to enable editing"
              : !editingEnabled
                ? "Add texture.json to enable"
                : "Paint texture layers on terrain"}
          </div>
        </div>
        <button
          onClick={handleSelectTexture}
          disabled={!canStartEditing || isEditing}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            isEditing
              ? "cursor-default bg-accent-secondary text-accent-secondary-content"
              : canStartEditing
                ? "bg-accent-primary text-accent-primary-content hover:bg-accent-primary-hover"
                : "cursor-not-allowed bg-surface-panel-strong text-content-disabled"
          }`}
        >
          {isEditing
            ? "Editing Texture"
            : canStartEditing
              ? "Edit Texture"
              : !canEdit
                ? "Open Project First"
                : "Add texture.json"}
        </button>
      </div>

      {canEdit && !editingEnabled && (
        <div className="rounded-lg border border-status-warning/35 bg-status-warning/15 px-3 py-2 text-sm text-content-secondary">
          Texture editing disabled. Create a <code className="rounded bg-surface-control px-1 text-status-warning">texture.json</code> file in your project to enable.
        </div>
      )}

      {isEditing && (
        <>
          {layerNames.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-3">Texture Layer</div>
              <div className="grid grid-cols-2 gap-2">
                {layerNames.map((name, index) => (
                  <button
                    key={name}
                    onClick={() => setSelectedLayer(name)}
                    className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      selectedLayer === name
                        ? "bg-accent-secondary text-accent-secondary-content"
                        : "bg-surface-control text-content-secondary hover:bg-surface-control-hover hover:text-content-primary"
                    }`}
                  >
                    <span className="mr-1 text-content-muted">{index + 1}.</span>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {layerNames.length === 0 && (
            <div className="text-sm italic text-content-muted">
              No texture layers defined in texture.json
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-semibold">Brush Settings</div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm text-content-secondary">
                <span>Radius</span>
                <span>{brushRadius.toFixed(0)}m</span>
              </div>
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

            <div>
              <div className="mb-1 flex items-center justify-between text-sm text-content-secondary">
                <span>Strength</span>
                <span>{(brushStrength * 100).toFixed(0)}%</span>
              </div>
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

            <div>
              <div className="mb-1 flex items-center justify-between text-sm text-content-secondary">
                <span>Falloff</span>
                <span>{(brushFalloff * 100).toFixed(0)}%</span>
              </div>
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
          </div>

          <div className="rounded-lg border border-accent-secondary/35 bg-accent-secondary/15 p-3 text-xs text-content-secondary">
            <strong>Controls:</strong>
            <ul className="mt-1 list-disc list-inside space-y-1">
              <li>Left click: Paint texture</li>
              <li>Right drag: Rotate camera</li>
              <li>Middle drag: Pan camera</li>
              <li>Scroll: Zoom • Shift+Scroll: Brush radius</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}