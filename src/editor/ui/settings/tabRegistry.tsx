import type { ReactNode } from "react";
import {
  Camera,
  Clock3,
  CloudSun,
  FolderOpen,
  Layers,
  Monitor,
  Mountain,
  Palette,
  Trees,
} from "lucide-react";
import type { EditorAppSession } from "@editor/app";
import type { TerrainEditor } from "@editor/runtime";
import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { VegetationEditor } from "@editor/runtime/vegetation/VegetationEditor";
import type { EditorAppSettings, EditorAppSettingsPatch } from "@editor/settings";
import type { MapData } from "@project/MapData";
import type { EditorWorkspaceController } from "@editor/ui/hooks/useEditorWorkspace";
import {
  AppearanceTab,
  RenderTab,
  CameraTab,
  SkyTab,
  TimeTab,
} from "@ui/settings/tabs";
import { ProjectFileTab } from "./ProjectFileTab";
import { TerrainEditorTab, TextureEditorTab, VegetationEditorTab, type ActiveEditorType } from "./tabs";

export const EDITOR_SETTINGS_TABS = [
  { id: "file", label: "File", Icon: FolderOpen },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "terrainEditor", label: "Terrain", Icon: Mountain },
  { id: "textureEditor", label: "Texture", Icon: Layers },
  { id: "vegetationEditor", label: "Vegetation", Icon: Trees },
  { id: "render", label: "Render", Icon: Monitor },
  { id: "camera", label: "Camera", Icon: Camera },
  { id: "time", label: "Time", Icon: Clock3 },
  { id: "sky", label: "Sky", Icon: CloudSun },
] as const;

export type EditorSettingsTabId = (typeof EDITOR_SETTINGS_TABS)[number]["id"];

export type EditorSettingsTabRenderProps = {
  settings: EditorAppSettings;
  editorApp: EditorAppSession | null;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  vegetationEditor: VegetationEditor | null;
  editorWorkspace: EditorWorkspaceController;
  terrainMode: "editable" | "procedural";
  activeEditor: ActiveEditorType;
  onActiveEditorChange: (editor: ActiveEditorType) => void;
  onLoadMap: (mapData: MapData) => void;
  onApplySettings: (settings: EditorAppSettings) => void;
  onPatch: (patch: EditorAppSettingsPatch) => void;
  onClose: () => void;
};

type EditorSettingsTabDescriptor = {
  id: EditorSettingsTabId;
  label: string;
  render: (props: EditorSettingsTabRenderProps) => ReactNode;
};

export const EDITOR_SETTINGS_TAB_REGISTRY: Record<EditorSettingsTabId, EditorSettingsTabDescriptor> = {
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
  appearance: {
    id: "appearance",
    label: "Appearance",
    render: (props) => <AppearanceTab settings={props.settings} onPatch={props.onPatch} />,
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
      />
    ),
  },
  vegetationEditor: {
    id: "vegetationEditor",
    label: "Vegetation Editor",
    render: (props) => (
      <VegetationEditorTab
        vegetationEditor={props.vegetationEditor}
        terrainMode={props.terrainMode}
        activeEditor={props.activeEditor}
        onActiveEditorChange={props.onActiveEditorChange}
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
};

export function renderEditorSettingsTab(
  tab: EditorSettingsTabId,
  props: EditorSettingsTabRenderProps,
): ReactNode {
  return EDITOR_SETTINGS_TAB_REGISTRY[tab].render(props);
}