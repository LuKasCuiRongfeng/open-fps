// TerrainEditorTab: terrain editor settings tab.
// TerrainEditorTab：地形编辑器设置标签

import { useState, useEffect } from "react";
import type { TerrainEditor, BrushType } from "@editor/runtime";
import type { EditorAppSettings, EditorMouseAction } from "@editor/settings";
import { useTerrainBrushSettings } from "../../hooks/useTerrainBrushSettings";

type EditorMouseConfig = Pick<EditorAppSettings["editor"], "leftButton" | "rightButton" | "middleButton">;

export type ActiveEditorType = "none" | "terrain" | "texture";

type TerrainEditorTabProps = {
  terrainEditor: TerrainEditor | null;
  terrainMode: "editable" | "procedural";
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
  onClose?: () => void;
};

export function TerrainEditorTab({
  terrainEditor,
  terrainMode,
  activeEditor,
  onActiveEditorChange,
  onClose,
}: TerrainEditorTabProps) {
  const {
    brushType,
    brushRadius,
    brushStrength,
    brushFalloff,
    setBrushType,
    setBrushRadius,
    setBrushStrength,
    setBrushFalloff,
  } = useTerrainBrushSettings(terrainEditor);

  const [mouseConfig, setMouseConfig] = useState<EditorMouseConfig>(() => ({
    leftButton: terrainEditor?.mouseConfig.leftButton ?? "brush",
    rightButton: terrainEditor?.mouseConfig.rightButton ?? "orbit",
    middleButton: terrainEditor?.mouseConfig.middleButton ?? "pan",
  }));
  const [stickyDrag, setStickyDrag] = useState(() => terrainEditor?.stickyDrag ?? false);

  const canEdit = terrainMode === "editable";
  const isEditing = activeEditor === "terrain";

  useEffect(() => {
    if (!terrainEditor) return;

    setMouseConfig({
      leftButton: terrainEditor.mouseConfig.leftButton,
      rightButton: terrainEditor.mouseConfig.rightButton,
      middleButton: terrainEditor.mouseConfig.middleButton,
    });
    setStickyDrag(terrainEditor.stickyDrag);
  }, [terrainEditor]);

  const handleMouseConfigChange = (
    button: keyof EditorMouseConfig,
    action: EditorMouseAction,
  ) => {
    setMouseConfig((prev) => ({ ...prev, [button]: action }));
    terrainEditor?.setMouseConfig({ [button]: action });
  };

  const handleStickyDragChange = (enabled: boolean) => {
    setStickyDrag(enabled);
    terrainEditor?.setStickyDrag(enabled);
  };

  const handleSelectTerrain = () => {
    if (!canEdit) return;

    terrainEditor?.setMode("edit");
    onActiveEditorChange("terrain");
    onClose?.();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Terrain Editing</div>
          <div className="text-xs text-content-muted">
            {canEdit ? "Edit terrain heightmap" : "Open a project to enable editing"}
          </div>
        </div>
        <button
          onClick={handleSelectTerrain}
          disabled={!canEdit || isEditing}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            isEditing
              ? "cursor-default bg-status-success text-status-success-content"
              : canEdit
                ? "bg-accent-primary text-accent-primary-content hover:bg-accent-primary-hover"
                : "cursor-not-allowed bg-surface-panel-strong text-content-disabled"
          }`}
        >
          {isEditing
            ? "Editing Terrain"
            : canEdit
              ? "Edit Terrain"
              : "Open Project First"}
        </button>
      </div>

      {isEditing && (
        <>
          <div>
            <div className="text-sm font-semibold mb-3">Brush Type</div>
            <div className="grid grid-cols-4 gap-2">
              {(["raise", "lower", "smooth", "flatten"] as BrushType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setBrushType(type)}
                  className={`rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors ${
                    brushType === type
                      ? "bg-status-success text-status-success-content"
                      : "bg-surface-control text-content-secondary hover:bg-surface-control-hover hover:text-content-primary"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

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
                max="50"
                step="1"
                value={brushRadius}
                onChange={(e) => setBrushRadius(Number(e.target.value))}
                className="w-full accent-status-success"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm text-content-secondary">
                <span>Strength</span>
                <span>{(brushStrength * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={brushStrength}
                onChange={(e) => setBrushStrength(Number(e.target.value))}
                className="w-full accent-status-success"
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
                step="0.05"
                value={brushFalloff}
                onChange={(e) => setBrushFalloff(Number(e.target.value))}
                className="w-full accent-status-success"
              />
            </div>
          </div>
        </>
      )}

      <div>
        <div className="text-sm font-semibold mb-3">Mouse Controls</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-content-secondary">Left Button</label>
            <select
              value={mouseConfig.leftButton}
              onChange={(e) =>
                handleMouseConfigChange("leftButton", e.target.value as EditorMouseAction)
              }
              className="field-surface rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus:border-focus-ring"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-content-secondary">Right Button</label>
            <select
              value={mouseConfig.rightButton}
              onChange={(e) =>
                handleMouseConfigChange("rightButton", e.target.value as EditorMouseAction)
              }
              className="field-surface rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus:border-focus-ring"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-content-secondary">Middle Button</label>
            <select
              value={mouseConfig.middleButton}
              onChange={(e) =>
                handleMouseConfigChange("middleButton", e.target.value as EditorMouseAction)
              }
              className="field-surface rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus:border-focus-ring"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
        </div>
        <div className="mt-2 text-xs text-content-muted">
          Scroll: Zoom camera • Shift+Scroll: Brush radius
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-content-secondary">Sticky Drag</div>
            <div className="text-xs text-content-muted">
              Continue dragging when mouse leaves window
            </div>
          </div>
          <button
            onClick={() => handleStickyDragChange(!stickyDrag)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border border-stroke-default transition-colors ${
              stickyDrag ? "bg-status-success" : "bg-surface-panel-strong"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-surface-panel shadow transition-transform ${
                stickyDrag ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}