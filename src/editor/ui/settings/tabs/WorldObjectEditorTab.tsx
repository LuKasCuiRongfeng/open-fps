// WorldObjectEditorTab: authored world object placement settings.
// WorldObjectEditorTab：世界对象摆放设置标签。

import { useEffect, useState } from "react";
import { Eraser, MousePointer2, PackageOpen, Square } from "lucide-react";
import type { WorldObjectEditor, WorldObjectEditMode } from "@editor/runtime/world-objects";
import type { WorldObjectArchetypeDefinition } from "@game/world/objects";
import type { TerrainMode } from "@editor/ui/hooks/useEditorWorkspace";
import type { ActiveEditorType } from "./TerrainEditorTab";
import { ReadonlyField, SettingBadge, SettingRow, SettingsButton, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";
import { Button } from "@ui/components/ui/button";

type WorldObjectEditorTabProps = {
  worldObjectEditor: WorldObjectEditor | null;
  terrainMode: TerrainMode;
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
};

interface WorldObjectEditorSnapshot {
  mode: WorldObjectEditMode;
  selectedArchetypeId: string;
  selectedArchetype: WorldObjectArchetypeDefinition | null;
  archetypes: readonly [string, WorldObjectArchetypeDefinition][];
  instanceCount: number;
  dirty: boolean;
}

export function WorldObjectEditorTab({
  worldObjectEditor,
  terrainMode,
  activeEditor,
  onActiveEditorChange,
}: WorldObjectEditorTabProps) {
  const [snapshot, setSnapshot] = useState<WorldObjectEditorSnapshot>(() => createSnapshot(worldObjectEditor));

  useEffect(() => {
    setSnapshot(createSnapshot(worldObjectEditor));
    return worldObjectEditor?.subscribe(() => setSnapshot(createSnapshot(worldObjectEditor)));
  }, [worldObjectEditor]);

  const canEdit = terrainMode === "editable";
  const isEditing = activeEditor === "object";
  const hasArchetypes = snapshot.archetypes.length > 0;
  const canStartEditing = canEdit && hasArchetypes;

  const handleSelectObjectEditor = () => {
    if (!canStartEditing) return;
    onActiveEditorChange("object");
  };

  const handleStopEditing = () => {
    worldObjectEditor?.endBrush();
    onActiveEditorChange("none");
  };

  const setMode = (mode: WorldObjectEditMode) => {
    worldObjectEditor?.setMode(mode);
  };

  return (
    <SettingsPage>
      <SettingsSection
        title="Mode"
        description="Places authored object archetypes on terrain using the active project object manifest."
        actions={<SettingBadge tone={isEditing ? "success" : canStartEditing ? "neutral" : "warning"}>{isEditing ? "Active" : canStartEditing ? "Ready" : "Locked"}</SettingBadge>}
      >
        <SettingRow
          label="Object Tool"
          description={!canEdit ? "Open an editable project first." : !hasArchetypes ? "No object archetypes found." : "Place or erase authored props and POIs."}
        >
          <SettingsButton
            Icon={isEditing ? Square : PackageOpen}
            onClick={isEditing ? handleStopEditing : handleSelectObjectEditor}
            disabled={!canStartEditing}
            tone={isEditing ? "warning" : "primary"}
          >
            {isEditing
              ? "Stop Editing"
              : canStartEditing
                ? "Start Object Tool"
                : !canEdit
                  ? "Open Project First"
                  : "No Archetypes"}
          </SettingsButton>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Brush" actions={<SettingBadge tone={snapshot.dirty ? "warning" : "success"}>{snapshot.dirty ? "dirty" : "saved"}</SettingBadge>}>
        <SettingRow label="Operation">
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={snapshot.mode === "place" ? "success" : "default"}
              onClick={() => setMode("place")}
              disabled={!canEdit}
              className="min-w-20"
            >
              <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
              Place
            </Button>
            <Button
              size="sm"
              variant={snapshot.mode === "erase" ? "danger" : "default"}
              onClick={() => setMode("erase")}
              disabled={!canEdit}
              className="min-w-20"
            >
              <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
              Erase
            </Button>
          </div>
        </SettingRow>
        <SettingRow label="Instances">
          <ReadonlyField>{snapshot.instanceCount.toLocaleString()} objects</ReadonlyField>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Archetypes" actions={<SettingBadge tone="success">{snapshot.archetypes.length} types</SettingBadge>}>
        {snapshot.archetypes.length > 0 ? (
          <SettingRow label="Active Type" align="start">
            <div className="space-y-1.5">
              {snapshot.archetypes.map(([id, archetype], index) => (
                <Button
                  key={id}
                  size="sm"
                  variant={snapshot.selectedArchetypeId === id ? "success" : "default"}
                  onClick={() => worldObjectEditor?.setSelectedArchetype(id)}
                  disabled={!canEdit || archetype.layer === "road" || archetype.layer === "water"}
                  className="w-full min-w-0 justify-start px-2"
                >
                  <PackageOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{index + 1}. {id}</span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase text-content-muted">{archetype.layer}</span>
                </Button>
              ))}
            </div>
          </SettingRow>
        ) : (
          <SettingRow label="Active Type">
            <ReadonlyField>No archetypes loaded</ReadonlyField>
          </SettingRow>
        )}
      </SettingsSection>

      <SettingsSection title="Selected" actions={snapshot.selectedArchetype ? <SettingBadge tone={snapshot.selectedArchetype.render?.kind === "gltf" ? "success" : "neutral"}>{snapshot.selectedArchetype.render?.kind ?? "none"}</SettingBadge> : undefined}>
        <SettingRow label="Layer">
          <ReadonlyField>{snapshot.selectedArchetype?.layer ?? "None"}</ReadonlyField>
        </SettingRow>
        <SettingRow label="Placement">
          <ReadonlyField>{snapshot.selectedArchetype?.editor?.placement ?? "single"}</ReadonlyField>
        </SettingRow>
        <SettingRow label="Collision">
          <ReadonlyField>{snapshot.selectedArchetype?.collision ? "Enabled" : "Disabled"}</ReadonlyField>
        </SettingRow>
        <SettingRow label="Budget">
          <ReadonlyField>{formatBudget(snapshot.selectedArchetype)}</ReadonlyField>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}

function createSnapshot(editor: WorldObjectEditor | null): WorldObjectEditorSnapshot {
  return {
    mode: editor?.currentMode ?? "place",
    selectedArchetypeId: editor?.currentSelectedArchetypeId ?? "",
    selectedArchetype: editor?.selectedArchetype ?? null,
    archetypes: editor?.archetypes ?? [],
    instanceCount: editor?.instanceCount ?? 0,
    dirty: editor?.dirty ?? false,
  };
}

function formatBudget(archetype: WorldObjectArchetypeDefinition | null): string {
  if (!archetype?.render) return "No render asset";

  const visible = archetype.render.maxVisibleDistanceMeters;
  const shadow = archetype.render.shadowDistanceMeters;
  if (!visible && !shadow) return "Default visibility";

  return `${visible?.toFixed(0) ?? "auto"} m / ${shadow?.toFixed(0) ?? "auto"} m shadows`;
}
