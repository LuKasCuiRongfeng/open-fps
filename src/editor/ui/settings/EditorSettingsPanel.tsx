import { useEffect, useState } from "react";
import type { EditorAppSession } from "@editor/app";
import type { TerrainEditor } from "@editor/runtime";
import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { VegetationEditor } from "@editor/runtime/vegetation/VegetationEditor";
import type { WorldObjectEditor } from "@editor/runtime/world-objects";
import type { EditorAppSettings, EditorAppSettingsPatch } from "@editor/settings";
import type { MapData } from "@project/MapData";
import type { EditorWorkspaceController, TerrainMode } from "@editor/ui/hooks/useEditorWorkspace";
import type { ActiveEditorType } from "./tabs";
import {
  EDITOR_SETTINGS_TABS,
  renderEditorSettingsTab,
  type EditorSettingsTabId,
} from "./tabRegistry";
import { SettingsPanelFrame } from "@ui/settings/SettingsPanelFrame";

type EditorSettingsPanelProps = {
  open: boolean;
  settings: EditorAppSettings;
  editorApp: EditorAppSession | null;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  vegetationEditor: VegetationEditor | null;
  worldObjectEditor: WorldObjectEditor | null;
  editorWorkspace: EditorWorkspaceController;
  terrainMode: TerrainMode;
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
  onLoadMap: (mapData: MapData) => void;
  onApplySettings: (settings: EditorAppSettings) => void;
  onPatch: (patch: EditorAppSettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
};

export function EditorSettingsPanel({
  open,
  settings,
  editorApp,
  terrainEditor,
  textureEditor,
  vegetationEditor,
  worldObjectEditor,
  editorWorkspace,
  terrainMode,
  activeEditor,
  onActiveEditorChange,
  onLoadMap,
  onApplySettings,
  onPatch,
  onReset,
  onClose,
}: EditorSettingsPanelProps) {
  const [tab, setTab] = useState<EditorSettingsTabId>("file");

  useEffect(() => {
    if (EDITOR_SETTINGS_TABS.some((entry) => entry.id === tab)) {
      return;
    }

    setTab(EDITOR_SETTINGS_TABS[0]?.id ?? "file");
  }, [tab]);

  return (
    <SettingsPanelFrame
      open={open}
      title="Editor Settings"
      subtitle="Applies immediately"
      tabs={EDITOR_SETTINGS_TABS}
      activeTab={tab}
      variant="sidebar"
      onTabChange={setTab}
      onReset={onReset}
      onClose={onClose}
    >
      {renderEditorSettingsTab(tab, {
        settings,
        editorApp,
        terrainEditor,
        textureEditor,
        vegetationEditor,
        worldObjectEditor,
        editorWorkspace,
        terrainMode,
        activeEditor,
        onActiveEditorChange,
        onLoadMap,
        onApplySettings,
        onPatch,
        onClose,
      })}
    </SettingsPanelFrame>
  );
}