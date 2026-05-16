// VegetationEditorTab: vegetation placement settings tab.
// VegetationEditorTab：植被摆放设置标签。

import { useEffect, useState } from "react";
import { Eraser, Layers, Plus, Sprout, Square, Trees } from "lucide-react";
import type { VegetationEditor } from "@editor/runtime/vegetation/VegetationEditor";
import { isSupportedVegetationModelPath, type VegetationBrushMode } from "@game/world/vegetation";
import type { ActiveEditorType } from "./TerrainEditorTab";
import type { TerrainMode } from "@editor/ui/hooks/useEditorWorkspace";
import { useVegetationBrushSettings } from "../../hooks/useVegetationBrushSettings";
import { RangeField } from "@ui/settings/RangeField";
import { ReadonlyField, SettingBadge, SettingRow, SettingsButton, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";

type VegetationEditorTabProps = {
  vegetationEditor: VegetationEditor | null;
  terrainMode: TerrainMode;
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
};

const BRUSH_MODE_LABELS: Record<VegetationBrushMode, string> = {
  place: "Place",
  erase: "Erase",
};

export function VegetationEditorTab({
  vegetationEditor,
  terrainMode,
  activeEditor,
  onActiveEditorChange,
}: VegetationEditorTabProps) {
  const {
    brushMode,
    brushRadius,
    densityPerSecond,
    scaleMin,
    scaleMax,
    selectedModelId,
    selectedTargetHeight,
    selectedLod1Path,
    selectedLod1Distance,
    selectedLod2Path,
    selectedLod2Distance,
    selectedMaxVisibleDistance,
    selectedShadowDistance,
    selectedModelStats,
    models,
    instanceCount,
    setBrushMode,
    setBrushRadius,
    setDensityPerSecond,
    setScaleMin,
    setScaleMax,
    setSelectedModel,
    setSelectedTargetHeight,
    setSelectedLod1Path,
    setSelectedLod1Distance,
    setSelectedLod2Path,
    setSelectedLod2Distance,
    setSelectedMaxVisibleDistance,
    setSelectedShadowDistance,
    addModel,
  } = useVegetationBrushSettings(vegetationEditor);
  const [modelPath, setModelPath] = useState("");
  const [modelName, setModelName] = useState("");
    const [lod1PathDraft, setLod1PathDraft] = useState("");
    const [lod2PathDraft, setLod2PathDraft] = useState("");

  const canEdit = terrainMode === "editable";
  const isEditing = activeEditor === "vegetation";
  const hasModel = models.length > 0;
  const canStartEditing = canEdit && hasModel;
  const canAddModel = canEdit && isSupportedVegetationModelPath(modelPath);
  const selectedModelCostTone = selectedModelStats?.levels.some((level) => level.triangles > 20_000)
    ? "warning"
    : "success";

  useEffect(() => {
    setLod1PathDraft(selectedLod1Path);
    setLod2PathDraft(selectedLod2Path);
  }, [selectedLod1Path, selectedLod2Path, selectedModelId]);

  const handleSelectVegetation = () => {
    if (!canStartEditing) return;

    onActiveEditorChange("vegetation");
  };

  const handleStopEditing = () => {
    vegetationEditor?.endBrush();
    onActiveEditorChange("none");
  };

  const handleAddModel = () => {
    if (!canAddModel) return;

    addModel(modelPath, modelName);
    setModelPath("");
    setModelName("");
  };

  return (
    <SettingsPage>
      <SettingsSection
        title="Mode"
        description="Enables vegetation placement while keeping the settings sidebar open."
        actions={<SettingBadge tone={isEditing ? "success" : canStartEditing ? "neutral" : "warning"}>{isEditing ? "Active" : canStartEditing ? "Ready" : "Locked"}</SettingBadge>}
      >
        <SettingRow
          label="Vegetation Brush"
          description={!canEdit ? "Open an editable project first." : !hasModel ? "Add a GLTF or GLB model first." : "Place or erase vegetation instances on terrain."}
        >
          <SettingsButton
            Icon={isEditing ? Square : Trees}
            onClick={isEditing ? handleStopEditing : handleSelectVegetation}
            disabled={!canStartEditing}
            tone={isEditing ? "warning" : "primary"}
          >
            {isEditing
              ? "Stop Editing"
              : canStartEditing
                ? "Start Vegetation Brush"
                : !canEdit
                  ? "Open Project First"
                  : "Add Model First"}
          </SettingsButton>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Models" actions={<SettingBadge tone="success">{models.length} models</SettingBadge>}>
        {models.length > 0 ? (
          <SettingRow label="Active Model" align="start">
            <div className="space-y-1.5">
              {models.map((model, index) => (
                <Button
                  key={model.id}
                  size="sm"
                  variant={selectedModelId === model.id ? "success" : "default"}
                  onClick={() => setSelectedModel(model.id)}
                  disabled={!canEdit}
                  className="w-full min-w-0 justify-start px-2"
                >
                  <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{index + 1}. {model.name}</span>
                </Button>
              ))}
            </div>
          </SettingRow>
        ) : (
          <SettingRow label="Active Model">
            <ReadonlyField>No models defined</ReadonlyField>
          </SettingRow>
        )}

        <SettingRow label="Model Name">
          <Input
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
            disabled={!canEdit}
            placeholder="Quiver Tree"
          />
        </SettingRow>
        <SettingRow label="Model Path">
          <div className="flex gap-2">
            <Input
              value={modelPath}
              onChange={(event) => setModelPath(event.target.value)}
              disabled={!canEdit}
              placeholder="../../assets/model/tree.glb"
            />
            <Button size="sm" variant="success" onClick={handleAddModel} disabled={!canAddModel}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add
            </Button>
          </div>
        </SettingRow>

        <RangeField
          label="Target Height"
          value={selectedTargetHeight}
          min={0.5}
          max={40}
          step={0.5}
          tone="success"
          valueLabel={`${selectedTargetHeight.toFixed(1)} m`}
          disabled={!canEdit || !selectedModelId}
          onChange={setSelectedTargetHeight}
        />
      </SettingsSection>

      <SettingsSection title="LOD" description="Optional lower-cost GLTF or GLB sources for distance rendering.">
        <SettingRow label="LOD1 Path">
          <Input
            value={lod1PathDraft}
            onChange={(event) => setLod1PathDraft(event.target.value)}
            onBlur={() => setSelectedLod1Path(lod1PathDraft)}
            disabled={!canEdit || !selectedModelId}
            placeholder="../../assets/model/tree_lod1.glb"
          />
        </SettingRow>
        <RangeField
          label="LOD1 Start"
          value={selectedLod1Distance}
          min={5}
          max={500}
          step={5}
          tone="success"
          valueLabel={`${selectedLod1Distance.toFixed(0)} m`}
          disabled={!canEdit || !selectedModelId}
          onChange={setSelectedLod1Distance}
        />

        <SettingRow label="LOD2 Path">
          <Input
            value={lod2PathDraft}
            onChange={(event) => setLod2PathDraft(event.target.value)}
            onBlur={() => setSelectedLod2Path(lod2PathDraft)}
            disabled={!canEdit || !selectedModelId}
            placeholder="../../assets/model/tree_billboard.glb"
          />
        </SettingRow>
        <RangeField
          label="LOD2 Start"
          value={selectedLod2Distance}
          min={10}
          max={800}
          step={5}
          tone="success"
          valueLabel={`${selectedLod2Distance.toFixed(0)} m`}
          disabled={!canEdit || !selectedModelId}
          onChange={setSelectedLod2Distance}
        />
      </SettingsSection>

      <SettingsSection
        title="Performance"
        actions={selectedModelStats ? <SettingBadge tone={selectedModelCostTone}>{selectedModelCostTone === "warning" ? "high cost" : "ok"}</SettingBadge> : undefined}
      >
        <SettingRow label="Model Cost" align="start">
          {selectedModelStats ? (
            <div className="space-y-1 font-mono text-[11px] text-content-secondary">
              {selectedModelStats.levels.map((level) => (
                <div key={level.level} className="field-surface flex min-h-7 items-center justify-between gap-2 rounded-md border px-2">
                  <span className="shrink-0 text-content-muted">{level.label}</span>
                  <span className="min-w-0 truncate text-right">{formatCount(level.triangles)} tris / {formatCount(level.vertices)} verts</span>
                </div>
              ))}
            </div>
          ) : (
            <ReadonlyField>Loading model stats</ReadonlyField>
          )}
        </SettingRow>
        <RangeField
          label="Max Display"
          value={selectedMaxVisibleDistance}
          min={20}
          max={800}
          step={10}
          tone="success"
          valueLabel={`${selectedMaxVisibleDistance.toFixed(0)} m`}
          disabled={!canEdit || !selectedModelId}
          onChange={setSelectedMaxVisibleDistance}
        />
        <RangeField
          label="Shadow Range"
          value={selectedShadowDistance}
          min={0}
          max={selectedMaxVisibleDistance}
          step={5}
          tone="success"
          valueLabel={`${selectedShadowDistance.toFixed(0)} m`}
          disabled={!canEdit || !selectedModelId}
          onChange={setSelectedShadowDistance}
        />
      </SettingsSection>

      <SettingsSection title="Brush" description="Vegetation brush parameters used by the active placement tool.">
        <SettingRow label="Brush Mode">
          <div className="flex flex-wrap gap-1.5">
            {(["place", "erase"] as VegetationBrushMode[]).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={brushMode === mode ? "success" : "default"}
                onClick={() => setBrushMode(mode)}
                disabled={!isEditing}
                className="min-w-20"
              >
                {mode === "place" ? <Sprout className="h-3.5 w-3.5" aria-hidden="true" /> : <Eraser className="h-3.5 w-3.5" aria-hidden="true" />}
                {BRUSH_MODE_LABELS[mode]}
              </Button>
            ))}
          </div>
        </SettingRow>

        <RangeField
          label="Radius"
          value={brushRadius}
          min={0.5}
          max={50}
          step={0.5}
          tone="success"
          valueLabel={`${brushRadius.toFixed(1)} m`}
          disabled={!isEditing}
          onChange={setBrushRadius}
        />
        <RangeField
          label="Density"
          value={densityPerSecond}
          min={1}
          max={60}
          step={1}
          tone="success"
          valueLabel={`${densityPerSecond.toFixed(0)}/s`}
          disabled={!isEditing || brushMode !== "place"}
          onChange={setDensityPerSecond}
        />
        <RangeField
          label="Min Scale"
          value={scaleMin}
          min={0.1}
          max={3}
          step={0.05}
          tone="success"
          valueLabel={`${scaleMin.toFixed(2)}x`}
          disabled={!isEditing || brushMode !== "place"}
          onChange={setScaleMin}
        />
        <RangeField
          label="Max Scale"
          value={scaleMax}
          min={0.1}
          max={3}
          step={0.05}
          tone="success"
          valueLabel={`${scaleMax.toFixed(2)}x`}
          disabled={!isEditing || brushMode !== "place"}
          onChange={setScaleMax}
        />
      </SettingsSection>

      <SettingsSection title="Map Data">
        <SettingRow label="Instances">
          <ReadonlyField align="right">{instanceCount}</ReadonlyField>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return value.toFixed(0);
}