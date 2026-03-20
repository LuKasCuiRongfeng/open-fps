import type { AppTarget } from "@/app/appTarget";
import type { ReactNode } from "react";
import type { GameApp } from "@game/app/GameApp";
import type { TerrainEditor, MapData } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { EditorWorkspaceController } from "@ui/hooks";
import {
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
} from "./tabs";

export const SETTINGS_TABS = [
  { id: "help", label: "Help", targets: ["editor", "game"] },
  { id: "file", label: "File", targets: ["editor"] },
  { id: "terrainEditor", label: "Terrain Editor", targets: ["editor"] },
  { id: "textureEditor", label: "Texture Editor", targets: ["editor"] },
  { id: "render", label: "Render", targets: ["editor", "game"] },
  { id: "camera", label: "Camera", targets: ["editor", "game"] },
  { id: "time", label: "Time (日晷)", targets: ["editor", "game"] },
  { id: "sky", label: "Sky", targets: ["editor", "game"] },
  { id: "movement", label: "Movement", targets: ["editor", "game"] },
  { id: "physics", label: "Physics", targets: ["editor", "game"] },
  { id: "thirdPerson", label: "3rd Person", targets: ["editor", "game"] },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export type SettingsTabRenderProps = {
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
  onClose: () => void;
};

type SettingsTabDescriptor = {
  id: SettingsTabId;
  label: string;
  targets: readonly AppTarget[];
  render: (props: SettingsTabRenderProps) => ReactNode;
};

export const SETTINGS_TAB_REGISTRY: Record<SettingsTabId, SettingsTabDescriptor> = {
  help: {
    id: "help",
    label: "Help",
    targets: ["editor", "game"],
    render: () => <HelpTab />,
  },
  file: {
    id: "file",
    label: "File",
    targets: ["editor"],
    render: (props) => (
      <FileTab
        gameApp={props.gameApp}
        terrainEditor={props.terrainEditor}
        editorWorkspace={props.editorWorkspace}
        onLoadMap={props.onLoadMap}
        onApplySettings={props.onApplySettings}
      />
    ),
  },
  terrainEditor: {
    id: "terrainEditor",
    label: "Terrain Editor",
    targets: ["editor"],
    render: (props) => (
      <TerrainEditorTab
        terrainEditor={props.terrainEditor}
        terrainMode={props.terrainMode}
        activeEditor={props.activeEditor}
        onActiveEditorChange={props.onActiveEditorChange}
        onClose={props.onClose}
      />
    ),
  },
  textureEditor: {
    id: "textureEditor",
    label: "Texture Editor",
    targets: ["editor"],
    render: (props) => (
      <TextureEditorTab
        textureEditor={props.textureEditor}
        terrainMode={props.terrainMode}
        activeEditor={props.activeEditor}
        onActiveEditorChange={props.onActiveEditorChange}
        onClose={props.onClose}
      />
    ),
  },
  render: {
    id: "render",
    label: "Render",
    targets: ["editor", "game"],
    render: (props) => <RenderTab settings={props.settings} onPatch={props.onPatch} />,
  },
  camera: {
    id: "camera",
    label: "Camera",
    targets: ["editor", "game"],
    render: (props) => <CameraTab settings={props.settings} onPatch={props.onPatch} />,
  },
  time: {
    id: "time",
    label: "Time (日晷)",
    targets: ["editor", "game"],
    render: (props) => <TimeTab settings={props.settings} onPatch={props.onPatch} />,
  },
  sky: {
    id: "sky",
    label: "Sky",
    targets: ["editor", "game"],
    render: (props) => <SkyTab settings={props.settings} onPatch={props.onPatch} />,
  },
  movement: {
    id: "movement",
    label: "Movement",
    targets: ["editor", "game"],
    render: (props) => <MovementTab settings={props.settings} onPatch={props.onPatch} />,
  },
  physics: {
    id: "physics",
    label: "Physics",
    targets: ["editor", "game"],
    render: (props) => <PhysicsTab settings={props.settings} onPatch={props.onPatch} />,
  },
  thirdPerson: {
    id: "thirdPerson",
    label: "3rd Person",
    targets: ["editor", "game"],
    render: (props) => <ThirdPersonTab settings={props.settings} onPatch={props.onPatch} />,
  },
};

export function getSettingsTabs(appTarget: AppTarget) {
  return SETTINGS_TABS.filter((tab) => tab.targets.some((target) => target === appTarget));
}

export function renderSettingsTab(
  tab: SettingsTabId,
  props: SettingsTabRenderProps,
): ReactNode {
  return SETTINGS_TAB_REGISTRY[tab].render(props);
}