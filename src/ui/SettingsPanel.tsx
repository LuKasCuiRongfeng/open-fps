// SettingsPanel: settings panel shell with tab navigation.
// SettingsPanel：带标签导航的设置面板外壳

import { useEffect, useState } from "react";
import type { AppTarget } from "@/app/appTarget";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { GameApp } from "@game/app/GameApp";
import type { TerrainEditor, MapData } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { EditorWorkspaceController } from "@ui/hooks";
import {
  TabButton,
  getSettingsTabs,
  renderSettingsTab,
  type SettingsTabId,
  type ActiveEditorType,
} from "./settings";

type SettingsPanelProps = {
  open: boolean;
  appTarget: AppTarget;
  settings: GameSettings;
  gameApp: GameApp | null;
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

export default function SettingsPanel({
  open,
  appTarget,
  settings,
  gameApp,
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
}: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTabId>("help");
  const tabs = getSettingsTabs(appTarget);

  useEffect(() => {
    if (tabs.some((entry) => entry.id === tab)) {
      return;
    }

    setTab(tabs[0]?.id ?? "help");
  }, [tab, tabs]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />

      <div className="absolute left-1/2 top-6 w-[min(860px,calc(100vw-2rem))] -translate-x-1/2">
        <div className="rounded-xl border border-white/10 bg-black/70 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
            <div>
              <div className="text-sm font-semibold tracking-wide">Settings</div>
              <div className="text-xs text-white/60">Applies immediately</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                type="button"
                onClick={() => {
                  onReset();
                }}
              >
                Reset
              </button>
              <button
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                type="button"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex max-h-[78vh] min-h-105">
            <div className="w-40 shrink-0 border-r border-white/10 p-3">
              <div className="space-y-1.5">
                {tabs.map((t) => (
                  <TabButton
                    key={t.id}
                    active={tab === t.id}
                    label={t.label}
                    onClick={() => setTab(t.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {renderSettingsTab(tab, {
                settings,
                gameApp,
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
