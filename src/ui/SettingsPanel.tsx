// SettingsPanel: settings panel shell with tab navigation.
// SettingsPanel：带标签导航的设置面板外壳

import { useState } from "react";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { GameApp } from "@game/GameApp";
import type { TerrainEditor, MapData } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import {
  TabButton,
  TABS,
  type SettingsTabId,
  HelpTab,
  RenderTab,
  CameraTab,
  SkyTab,
  TimeTab,
  MovementTab,
  PhysicsTab,
  ThirdPersonTab,
  FileTab,
  TerrainEditorTab,
  TextureEditorTab,
  type ActiveEditorType,
} from "./settings";

type SettingsPanelProps = {
  open: boolean;
  settings: GameSettings;
  gameApp: GameApp | null;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
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
  settings,
  gameApp,
  terrainEditor,
  textureEditor,
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
                {TABS.map((t) => (
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
              {tab === "help" && <HelpTab />}

              {tab === "file" && (
                <FileTab
                  gameApp={gameApp}
                  terrainEditor={terrainEditor}
                  terrainMode={terrainMode}
                  currentProjectPath={currentProjectPath}
                  onProjectPathChange={onProjectPathChange}
                  onLoadMap={onLoadMap}
                  onApplySettings={onApplySettings}
                />
              )}

              {tab === "terrainEditor" && (
                <TerrainEditorTab
                  terrainEditor={terrainEditor}
                  terrainMode={terrainMode}
                  activeEditor={activeEditor}
                  onActiveEditorChange={onActiveEditorChange}
                  onClose={onClose}
                />
              )}

              {tab === "textureEditor" && (
                <TextureEditorTab
                  textureEditor={textureEditor}
                  terrainMode={terrainMode}
                  activeEditor={activeEditor}
                  onActiveEditorChange={onActiveEditorChange}
                  onClose={onClose}
                />
              )}

              {tab === "render" && <RenderTab settings={settings} onPatch={onPatch} />}

              {tab === "camera" && <CameraTab settings={settings} onPatch={onPatch} />}

              {tab === "sky" && <SkyTab settings={settings} onPatch={onPatch} />}

              {tab === "time" && <TimeTab settings={settings} onPatch={onPatch} />}

              {tab === "movement" && <MovementTab settings={settings} onPatch={onPatch} />}

              {tab === "physics" && <PhysicsTab settings={settings} onPatch={onPatch} />}

              {tab === "thirdPerson" && <ThirdPersonTab settings={settings} onPatch={onPatch} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
