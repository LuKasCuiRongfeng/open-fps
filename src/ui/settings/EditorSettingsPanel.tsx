import { useEffect, useState } from "react";
import type { GameApp, EditorApp } from "@game/app";
import type { TerrainEditor } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { MapData } from "@project/MapData";
import type { EditorWorkspaceController } from "@ui/editor/hooks/useEditorWorkspace";
import type { ActiveEditorType } from "@ui/editor/settings/tabs";
import {
  EDITOR_SETTINGS_TABS,
  renderEditorSettingsTab,
  type EditorSettingsTabId,
} from "@ui/editor/settings/tabRegistry";
import { SettingsPanelFrame } from "./SettingsPanelFrame";

type EditorSettingsPanelProps = {
  open: boolean;
  settings: GameSettings;
  gameApp: GameApp | null;
  editorApp: EditorApp | null;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  editorWorkspace: EditorWorkspaceController;
  terrainMode: "editable" | "procedural";
  activeEditor: ActiveEditorType;
  currentProjectPath: string | null;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
  onProjectPathChange: (path: string | null) => void;
  onLoadMap: (mapData: MapData) => void;
  onApplySettings: (settings: GameSettings) => void;
  onPatch: (patch: GameSettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
};

export function EditorSettingsPanel({
  open,
  settings,
  gameApp,
  editorApp,
  terrainEditor,
  textureEditor,
  editorWorkspace,
  terrainMode,
  activeEditor,
  currentProjectPath,
  onActiveEditorChange,
  onProjectPathChange,
  onLoadMap,
  onApplySettings,
  onPatch,
  onReset,
  onClose,
}: EditorSettingsPanelProps) {
  const [tab, setTab] = useState<EditorSettingsTabId>("help");
  const tabs = EDITOR_SETTINGS_TABS;

  useEffect(() => {
    if (tabs.some((entry) => entry.id === tab)) {
      return;
    }

    setTab(tabs[0]?.id ?? "help");
  }, [tab, tabs]);

  return (
    <SettingsPanelFrame
      open={open}
      title="Editor Settings"
      subtitle="Applies immediately"
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      onReset={onReset}
      onClose={onClose}
    >
      {renderEditorSettingsTab(tab, {
        settings,
        gameApp,
        editorApp,
        terrainEditor,
        textureEditor,
        editorWorkspace,
        terrainMode,
        activeEditor,
        currentProjectPath,
        onActiveEditorChange,
        onProjectPathChange,
        onLoadMap,
        onApplySettings,
        onPatch,
        onClose,
      })}
    </SettingsPanelFrame>
  );
}