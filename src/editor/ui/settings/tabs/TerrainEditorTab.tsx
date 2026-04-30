// TerrainEditorTab: terrain editor settings tab.
// TerrainEditorTab：地形编辑器设置标签

import { useState, useEffect } from "react";
import { Brush, MousePointer2 } from "lucide-react";
import type { TerrainEditor, BrushType } from "@editor/runtime";
import type { EditorAppSettings, EditorMouseAction } from "@editor/settings";
import { useTerrainBrushSettings } from "../../hooks/useTerrainBrushSettings";
import { RangeField } from "@ui/settings/RangeField";
import { SettingBadge, SettingRow, SettingsButton, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";
import { Button } from "@ui/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";

type EditorMouseConfig = Pick<EditorAppSettings["editor"], "leftButton" | "rightButton" | "middleButton">;

export type ActiveEditorType = "none" | "terrain" | "texture";

type TerrainEditorTabProps = {
  terrainEditor: TerrainEditor | null;
  terrainMode: "editable" | "procedural";
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
};

const MOUSE_ACTION_LABELS: Record<EditorMouseAction, string> = {
  brush: "Brush",
  orbit: "Orbit",
  pan: "Pan",
};

export function TerrainEditorTab({
  terrainEditor,
  terrainMode,
  activeEditor,
  onActiveEditorChange,
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
  };

  return (
    <SettingsPage>
      <SettingsSection
        title="Mode"
        description="Enables terrain height editing while keeping the settings sidebar open."
        actions={<SettingBadge tone={isEditing ? "success" : canEdit ? "neutral" : "warning"}>{isEditing ? "Active" : canEdit ? "Ready" : "Locked"}</SettingBadge>}
      >
        <SettingRow label="Terrain Brush" description={canEdit ? "Paint height changes directly in the viewport." : "Open an editable project first."}>
          <SettingsButton
            Icon={Brush}
            onClick={handleSelectTerrain}
            disabled={!canEdit || isEditing}
            tone={isEditing ? "success" : "primary"}
          >
            {isEditing
              ? "Terrain Active"
              : canEdit
                ? "Start Terrain Brush"
                : "Open Project First"}
          </SettingsButton>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Brush" description="Heightmap tool parameters used by the active terrain brush.">
        <SettingRow label="Brush Type">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {(["raise", "lower", "smooth", "flatten"] as BrushType[]).map((type) => (
              <Button
                key={type}
                size="sm"
                variant={brushType === type ? "success" : "default"}
                onClick={() => setBrushType(type)}
                disabled={!isEditing}
                className="capitalize"
              >
                {type}
              </Button>
            ))}
          </div>
        </SettingRow>

        <RangeField
          label="Radius"
          value={brushRadius}
          min={1}
          max={50}
          step={1}
          tone="success"
          valueLabel={`${brushRadius.toFixed(0)} m`}
          disabled={!isEditing}
          onChange={setBrushRadius}
        />
        <RangeField
          label="Strength"
          value={brushStrength}
          min={0.05}
          max={1}
          step={0.05}
          tone="success"
          valueLabel={`${(brushStrength * 100).toFixed(0)}%`}
          disabled={!isEditing}
          onChange={setBrushStrength}
        />
        <RangeField
          label="Falloff"
          value={brushFalloff}
          min={0}
          max={1}
          step={0.05}
          tone="success"
          valueLabel={`${(brushFalloff * 100).toFixed(0)}%`}
          disabled={!isEditing}
          onChange={setBrushFalloff}
        />
      </SettingsSection>

      <SettingsSection title="Mouse Bindings" description="Viewport input mapping while terrain tools are enabled.">
        <SettingRow label="Left Button">
          <Select
            value={mouseConfig.leftButton}
            onValueChange={(value) => handleMouseConfigChange("leftButton", value as EditorMouseAction)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MOUSE_ACTION_LABELS).map(([action, label]) => (
                <SelectItem key={action} value={action}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Right Button">
          <Select
            value={mouseConfig.rightButton}
            onValueChange={(value) => handleMouseConfigChange("rightButton", value as EditorMouseAction)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MOUSE_ACTION_LABELS).map(([action, label]) => (
                <SelectItem key={action} value={action}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Middle Button">
          <Select
            value={mouseConfig.middleButton}
            onValueChange={(value) => handleMouseConfigChange("middleButton", value as EditorMouseAction)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MOUSE_ACTION_LABELS).map(([action, label]) => (
                <SelectItem key={action} value={action}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="Sticky Drag" description="Continue dragging when the pointer leaves the window.">
          <Button
            size="sm"
            variant={stickyDrag ? "success" : "default"}
            onClick={() => handleStickyDragChange(!stickyDrag)}
            className="w-16 justify-between px-1.5"
          >
            <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
            {stickyDrag ? "On" : "Off"}
          </Button>
        </SettingRow>
        <SettingRow label="Wheel Input">
          <div className="text-[11px] text-content-muted">Scroll zooms the camera. Shift + scroll adjusts brush radius.</div>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}
