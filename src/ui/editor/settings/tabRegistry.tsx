import type { ReactNode } from "react";
import type { EditorAppSession } from "@game/app";
import type { TerrainEditor } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { MapData } from "@project/MapData";
import type { EditorWorkspaceController } from "@ui/editor/hooks/useEditorWorkspace";
import {
  HelpTab,
  RenderTab,
  CameraTab,
  SkyTab,
  TimeTab,
  MovementTab,
  PhysicsTab,
  ThirdPersonTab,
} from "@ui/settings/tabs";
import { ProjectFileTab } from "./ProjectFileTab";
import { TerrainEditorTab, TextureEditorTab, type ActiveEditorType } from "./tabs";

export const EDITOR_SETTINGS_TABS = [
  { id: "help", label: "Help" },
  { id: "file", label: "File" },
  { id: "terrainEditor", label: "Terrain Editor" },
  { id: "textureEditor", label: "Texture Editor" },
  { id: "render", label: "Render" },
  { id: "camera", label: "Camera" },
  { id: "time", label: "Time (日晷)" },
  { id: "sky", label: "Sky" },
  { id: "movement", label: "Movement" },
  { id: "physics", label: "Physics" },
  { id: "thirdPerson", label: "3rd Person" },
] as const;

export type EditorSettingsTabId = (typeof EDITOR_SETTINGS_TABS)[number]["id"];

export type EditorSettingsTabRenderProps = {
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
  onClose: () => void;
};

type EditorSettingsTabDescriptor = {
  id: EditorSettingsTabId;
  label: string;
  render: (props: EditorSettingsTabRenderProps) => ReactNode;
};

export const EDITOR_SETTINGS_TAB_REGISTRY: Record<EditorSettingsTabId, EditorSettingsTabDescriptor> = {
  help: {
    id: "help",
    label: "Help",
    render: () => <HelpTab />,
  },
  file: {
    id: "file",
    label: "File",
    render: (props) => (
      <ProjectFileTab
        editorApp={props.editorApp}
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
    render: (props) => <RenderTab settings={props.settings} onPatch={props.onPatch} />,
  },
  camera: {
    id: "camera",
    label: "Camera",
    render: (props) => <CameraTab settings={props.settings} onPatch={props.onPatch} />,
  },
  time: {
    id: "time",
    label: "Time (日晷)",
    render: (props) => <TimeTab settings={props.settings} onPatch={props.onPatch} />,
  },
  sky: {
    id: "sky",
    label: "Sky",
    render: (props) => <SkyTab settings={props.settings} onPatch={props.onPatch} />,
  },
  movement: {
    id: "movement",
    label: "Movement",
    render: (props) => <MovementTab settings={props.settings} onPatch={props.onPatch} />,
  },
  physics: {
    id: "physics",
    label: "Physics",
    render: (props) => <PhysicsTab settings={props.settings} onPatch={props.onPatch} />,
  },
  thirdPerson: {
    id: "thirdPerson",
    label: "3rd Person",
    render: (props) => <ThirdPersonTab settings={props.settings} onPatch={props.onPatch} />,
  },
};

export function renderEditorSettingsTab(
  tab: EditorSettingsTabId,
  props: EditorSettingsTabRenderProps,
): ReactNode {
  return EDITOR_SETTINGS_TAB_REGISTRY[tab].render(props);
}