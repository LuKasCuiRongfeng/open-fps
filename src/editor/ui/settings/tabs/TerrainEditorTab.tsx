// TerrainEditorTab: terrain editor settings tab.
// TerrainEditorTab：地形编辑器设置标签

import { Brush, Square } from "lucide-react";
import type { TerrainEditor, BrushType } from "@editor/runtime";
import type { ActiveEditorType as RuntimeActiveEditorType } from "@editor/runtime/common";
import type { TerrainMode } from "@editor/ui/hooks/useEditorWorkspace";
import { useTerrainBrushSettings } from "../../hooks/useTerrainBrushSettings";
import { RangeField } from "@ui/settings/RangeField";
import { SettingBadge, SettingRow, SettingsButton, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";
import { Button } from "@ui/components/ui/button";

export type ActiveEditorType = NonNullable<RuntimeActiveEditorType> | "none";

type TerrainEditorTabProps = {
  terrainEditor: TerrainEditor | null;
  terrainMode: TerrainMode;
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
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

  const canEdit = terrainMode === "editable";
  const isEditing = activeEditor === "terrain";

  const handleSelectTerrain = () => {
    if (!canEdit) return;

    terrainEditor?.setMode("edit");
    onActiveEditorChange("terrain");
  };

  const handleStopEditing = () => {
    terrainEditor?.endBrush();
    onActiveEditorChange("none");
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
            Icon={isEditing ? Square : Brush}
            onClick={isEditing ? handleStopEditing : handleSelectTerrain}
            disabled={!canEdit}
            tone={isEditing ? "warning" : "primary"}
          >
            {isEditing
              ? "Stop Editing"
              : canEdit
                ? "Start Terrain Brush"
                : "Open Project First"}
          </SettingsButton>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Brush" description="Heightmap tool parameters used by the active terrain brush.">
        <SettingRow label="Brush Type">
          <div className="flex flex-wrap gap-1.5">
            {(["raise", "lower", "smooth", "flatten"] as BrushType[]).map((type) => (
              <Button
                key={type}
                size="sm"
                variant={brushType === type ? "success" : "default"}
                onClick={() => setBrushType(type)}
                disabled={!isEditing}
                className="min-w-20 capitalize"
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
    </SettingsPage>
  );
}
