import { useEffect, useState } from "react";
import type { EditorAppSession } from "@game/app";
import type { TerrainEditor } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { MapData } from "@project/MapData";
import type { EditorWorkspaceController } from "@ui/editor/hooks/useEditorWorkspace";
import type { ActiveEditorType } from "./tabs";
import {
  EDITOR_SETTINGS_TABS,
  renderEditorSettingsTab,
  type EditorSettingsTabId,
} from "./tabRegistry";
import { SettingsPanelFrame } from "@ui/settings/SettingsPanelFrame";

type EditorSettingsPanelProps = {
  open: boolean;
  settings: GameSettings;
  editorApp: EditorAppSession | null;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  editorWorkspace: EditorWorkspaceController;
  terrainMode: "editable" | "procedural";
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
  onLoadMap: (mapData: MapData) => void;
  onApplySettings: (settings: GameSettings) => void;
  onPatch: (patch: GameSettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
};

export function EditorSettingsPanel({
  open,
  settings,
  editorApp,
  terrainEditor,
  textureEditor,
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
  const [tab, setTab] = useState<EditorSettingsTabId>("help");

  useEffect(() => {
    if (EDITOR_SETTINGS_TABS.some((entry) => entry.id === tab)) {
      return;
    }

    setTab(EDITOR_SETTINGS_TABS[0]?.id ?? "help");
  }, [tab]);

  return (
    <SettingsPanelFrame
      open={open}
      title="Editor Settings"
      subtitle="Applies immediately"
      tabs={EDITOR_SETTINGS_TABS}
      activeTab={tab}
      onTabChange={setTab}
      onReset={onReset}
      onClose={onClose}
    >
      {renderEditorSettingsTab(tab, {
        settings,
        editorApp,
        terrainEditor,
        textureEditor,
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