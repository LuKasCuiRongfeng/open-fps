// TextureEditorTab: texture editor settings tab with start/stop editing.
// TextureEditorTab：带有开始/停止编辑的纹理编辑器设置标签

import { useState, useEffect } from "react";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { ActiveEditorType } from "./TerrainEditorTab";

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
  const [selectedLayer, setSelectedLayer] = useState("");
  const [brushRadius, setBrushRadius] = useState(20);
  const [brushStrength, setBrushStrength] = useState(0.5);
  const [brushFalloff, setBrushFalloff] = useState(0.5);

  const canEdit = terrainMode === "editable";
  const editingEnabled = textureEditor?.editingEnabled ?? false;
  const isEditing = activeEditor === "texture";
  const layerNames = textureEditor?.layerNames ?? [];

  // Sync state from editor.
  // 从编辑器同步状态
  useEffect(() => {
    if (textureEditor) {
      setSelectedLayer(textureEditor.brushSettings.selectedLayer);
      setBrushRadius(textureEditor.brushSettings.radius);
      setBrushStrength(textureEditor.brushSettings.strength);
      setBrushFalloff(textureEditor.brushSettings.falloff);
    }
  }, [textureEditor]);

  // Toggle edit mode.
  // 切换编辑模式
  const handleToggleMode = () => {
    if (!canEdit || !editingEnabled) return;

    if (isEditing) {
      // Stop editing.
      // 停止编辑
      onActiveEditorChange("none");
    } else {
      // Start editing - this will stop other editors.
      // 开始编辑 - 这会停止其他编辑器
      onActiveEditorChange("texture");
      onClose?.();
    }
  };

  // Handle layer selection.
  // 处理层选择
  const handleLayerSelect = (layerName: string) => {
    setSelectedLayer(layerName);
    textureEditor?.setSelectedLayer(layerName);
  };

  // Handle brush radius change.
  // 处理画刷半径变化
  const handleRadiusChange = (value: number) => {
    setBrushRadius(value);
    textureEditor?.setBrushRadius(value);
  };

  // Handle brush strength change.
  // 处理画刷强度变化
  const handleStrengthChange = (value: number) => {
    setBrushStrength(value);
    textureEditor?.setBrushStrength(value);
  };

  // Handle brush falloff change.
  // 处理画刷衰减变化
  const handleFalloffChange = (value: number) => {
    setBrushFalloff(value);
    textureEditor?.setBrushFalloff(value);
  };

  const canStartEditing = canEdit && editingEnabled;

  return (
    <div className="space-y-5">
      {/* Mode toggle / 模式切换 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Texture Painting</div>
          <div className="text-xs text-white/50">
            {!canEdit 
              ? "Open a project to enable editing" 
              : !editingEnabled 
                ? "Add texture.json to enable" 
                : "Paint texture layers on terrain"}
          </div>
        </div>
        <button
          onClick={handleToggleMode}
          disabled={!canStartEditing}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isEditing
              ? "bg-purple-600 hover:bg-purple-700 text-white"
              : canStartEditing
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {isEditing
            ? "⬛ Stop Editing"
            : canStartEditing
              ? "🎨 Start Editing"
              : !canEdit
                ? "📁 Open Project First"
                : "📄 Add texture.json"}
        </button>
      </div>

      {/* Not enabled warning / 未启用警告 */}
      {canEdit && !editingEnabled && (
        <div className="rounded-lg bg-amber-500/20 px-3 py-2 text-sm text-amber-300">
          Texture editing disabled. Create a <code className="rounded bg-black/30 px-1">texture.json</code> file in your project to enable.
        </div>
      )}

      {/* Brush settings (only when editing) / 画刷设置（仅在编辑时） */}
      {isEditing && (
        <>
          {/* Layer selection / 层选择 */}
          {layerNames.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-3">Texture Layer</div>
              <div className="grid grid-cols-2 gap-2">
                {layerNames.map((name, index) => (
                  <button
                    key={name}
                    onClick={() => handleLayerSelect(name)}
                    className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      selectedLayer === name
                        ? "bg-purple-600"
                        : "bg-gray-700 hover:bg-gray-600"
                    }`}
                  >
                    <span className="text-gray-400 mr-1">{index + 1}.</span>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {layerNames.length === 0 && (
            <div className="text-sm text-gray-500 italic">
              No texture layers defined in texture.json
            </div>
          )}

          {/* Brush parameters / 画刷参数 */}
          <div className="space-y-3">
            <div className="text-sm font-semibold">Brush Settings</div>
            
            {/* Radius / 半径 */}
            <div>
              <div className="flex items-center justify-between text-sm text-white/80 mb-1">
                <span>Radius</span>
                <span>{brushRadius.toFixed(0)}m</span>
              </div>
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

            {/* Strength / 强度 */}
            <div>
              <div className="flex items-center justify-between text-sm text-white/80 mb-1">
                <span>Strength</span>
                <span>{(brushStrength * 100).toFixed(0)}%</span>
              </div>
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

            {/* Falloff / 衰减 */}
            <div>
              <div className="flex items-center justify-between text-sm text-white/80 mb-1">
                <span>Falloff</span>
                <span>{(brushFalloff * 100).toFixed(0)}%</span>
              </div>
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
          </div>

          {/* Help / 帮助 */}
          <div className="rounded-lg bg-purple-900/30 p-3 text-xs text-purple-200">
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
