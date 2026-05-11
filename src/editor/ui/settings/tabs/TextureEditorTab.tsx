// TextureEditorTab: texture editor settings tab with start/stop editing.
// TextureEditorTab：带有开始/停止编辑的纹理编辑器设置标签

import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { ActiveEditorType } from "./TerrainEditorTab";
import { useTextureBrushSettings } from "../../hooks/useTextureBrushSettings";
import { Layers, Paintbrush, Square } from "lucide-react";
import { RangeField } from "@ui/settings/RangeField";
import { ReadonlyField, SettingBadge, SettingRow, SettingsButton, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";
import { Button } from "@ui/components/ui/button";

type TextureEditorTabProps = {
  textureEditor: TextureEditor | null;
  terrainMode: "editable" | "procedural";
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
};

export function TextureEditorTab({
  textureEditor,
  terrainMode,
  activeEditor,
  onActiveEditorChange,
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
  };

  const handleStopEditing = () => {
    textureEditor?.endBrush();
    onActiveEditorChange("none");
  };

  const canStartEditing = canEdit && editingEnabled;

  return (
    <SettingsPage>
      <SettingsSection
        title="Mode"
        description="Enables splatmap painting while keeping the settings sidebar open."
        actions={<SettingBadge tone={isEditing ? "secondary" : canStartEditing ? "neutral" : "warning"}>{isEditing ? "Active" : canStartEditing ? "Ready" : "Locked"}</SettingBadge>}
      >
        <SettingRow
          label="Texture Brush"
          description={!canEdit ? "Open an editable project first." : !editingEnabled ? "Create texture.json to enable painting." : "Paint texture layers directly in the viewport."}
        >
          <SettingsButton
            Icon={isEditing ? Square : Paintbrush}
            onClick={isEditing ? handleStopEditing : handleSelectTexture}
            disabled={!canStartEditing}
            tone={isEditing ? "warning" : "primary"}
          >
            {isEditing
              ? "Stop Editing"
              : canStartEditing
                ? "Start Texture Brush"
                : !canEdit
                  ? "Open Project First"
                  : "Add texture.json"}
          </SettingsButton>
        </SettingRow>
      </SettingsSection>

      {canEdit && !editingEnabled && (
        <SettingsSection title="Setup">
          <SettingRow label="Missing File">
            <div className="text-xs text-status-warning">Create texture.json in the project root to enable texture painting.</div>
          </SettingRow>
        </SettingsSection>
      )}

      <SettingsSection title="Layer" actions={<SettingBadge tone="secondary">{layerNames.length} layers</SettingBadge>}>
        {layerNames.length > 0 ? (
          <SettingRow label="Active Layer" align="start">
            <div className="space-y-1.5">
              {layerNames.map((name, index) => (
                <Button
                  key={name}
                  size="sm"
                  variant={selectedLayer === name ? "secondary" : "default"}
                  onClick={() => setSelectedLayer(name)}
                  disabled={!isEditing}
                  className="w-full min-w-0 justify-start px-2"
                >
                  <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{index + 1}. {name}</span>
                </Button>
              ))}
            </div>
          </SettingRow>
        ) : (
          <SettingRow label="Active Layer">
            <ReadonlyField>No layers defined</ReadonlyField>
          </SettingRow>
        )}
      </SettingsSection>

      <SettingsSection title="Brush" description="Splatmap brush parameters used by the active texture brush.">
        <RangeField
          label="Radius"
          value={brushRadius}
          min={1}
          max={100}
          step={1}
          tone="secondary"
          valueLabel={`${brushRadius.toFixed(0)} m`}
          disabled={!isEditing}
          onChange={setBrushRadius}
        />
        <RangeField
          label="Strength"
          value={brushStrength}
          min={0.01}
          max={1}
          step={0.01}
          tone="secondary"
          valueLabel={`${(brushStrength * 100).toFixed(0)}%`}
          disabled={!isEditing}
          onChange={setBrushStrength}
        />
        <RangeField
          label="Falloff"
          value={brushFalloff}
          min={0}
          max={1}
          step={0.01}
          tone="secondary"
          valueLabel={`${(brushFalloff * 100).toFixed(0)}%`}
          disabled={!isEditing}
          onChange={setBrushFalloff}
        />
      </SettingsSection>

      <SettingsSection title="Input">
        <SettingRow label="Brush Stroke">
          <ReadonlyField>Left button</ReadonlyField>
        </SettingRow>
        <SettingRow label="Orbit Camera">
          <ReadonlyField>Right drag</ReadonlyField>
        </SettingRow>
        <SettingRow label="Pan Camera">
          <ReadonlyField>Middle drag</ReadonlyField>
        </SettingRow>
        <SettingRow label="Brush Radius">
          <ReadonlyField>Shift + scroll</ReadonlyField>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}