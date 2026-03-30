// TerrainEditorTab: terrain editor settings tab.
// TerrainEditorTab：地形编辑器设置标签

import { useState, useEffect } from "react";
import type { TerrainEditor, BrushType } from "@game/editor";
import type { EditorMouseAction, GameSettings } from "@game/settings";
import { useTerrainBrushSettings } from "../../hooks/useTerrainBrushSettings";

type EditorMouseConfig = Pick<GameSettings["editor"], "leftButton" | "rightButton" | "middleButton">;

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

  const handleToggleMode = () => {
    if (!canEdit) return;

    if (isEditing) {
      terrainEditor?.setMode("play");
      onActiveEditorChange("none");
    } else {
      terrainEditor?.setMode("edit");
      onActiveEditorChange("terrain");
      onClose?.();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Terrain Editing</div>
          <div className="text-xs text-white/50">
            {canEdit ? "Edit terrain heightmap" : "Open a project to enable editing"}
          </div>
        </div>
        <button
          onClick={handleToggleMode}
          disabled={!canEdit}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isEditing
              ? "bg-green-600 hover:bg-green-700 text-white"
              : canEdit
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {isEditing
            ? "⬛ Stop Editing"
            : canEdit
              ? "🏔️ Start Editing"
              : "📁 Open Project First"}
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
                  className={`px-3 py-2 rounded-md text-xs font-medium transition-colors capitalize ${
                    brushType === type
                      ? "bg-green-600"
                      : "bg-gray-700 hover:bg-gray-600"
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
              <div className="flex items-center justify-between text-sm text-white/80 mb-1">
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
                className="w-full accent-green-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm text-white/80 mb-1">
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
                className="w-full accent-green-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm text-white/80 mb-1">
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
                className="w-full accent-green-500"
              />
            </div>
          </div>
        </>
      )}

      <div>
        <div className="text-sm font-semibold mb-3">Mouse Controls</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-white/80">Left Button</label>
            <select
              value={mouseConfig.leftButton}
              onChange={(e) =>
                handleMouseConfigChange("leftButton", e.target.value as EditorMouseAction)
              }
              className="rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-white/80">Right Button</label>
            <select
              value={mouseConfig.rightButton}
              onChange={(e) =>
                handleMouseConfigChange("rightButton", e.target.value as EditorMouseAction)
              }
              className="rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-white/80">Middle Button</label>
            <select
              value={mouseConfig.middleButton}
              onChange={(e) =>
                handleMouseConfigChange("middleButton", e.target.value as EditorMouseAction)
              }
              className="rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="brush">🖌️ Brush (Paint)</option>
              <option value="orbit">🔄 Orbit (Rotate)</option>
              <option value="pan">✋ Pan (Move)</option>
            </select>
          </div>
        </div>
        <div className="mt-2 text-xs text-white/50">
          Scroll: Zoom camera • Shift+Scroll: Brush radius
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-white/80">Sticky Drag</div>
            <div className="text-xs text-white/50">
              Continue dragging when mouse leaves window
            </div>
          </div>
          <button
            onClick={() => handleStickyDragChange(!stickyDrag)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              stickyDrag ? "bg-green-600" : "bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                stickyDrag ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}