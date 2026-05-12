// EditorCameraTab: editor camera settings and viewport mouse bindings.
// EditorCameraTab：编辑器相机设置和视口鼠标绑定。

import type { EditorAppSettings, EditorAppSettingsPatch, EditorMouseButtonAction } from "@editor/settings";
import { CameraProjectionSection } from "@ui/settings/tabs";
import { ReadonlyField, SettingRow, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";
import { Toggle } from "@ui/settings/Toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";

type EditorMouseButtonKey = "leftButton" | "rightButton" | "middleButton";

type EditorCameraTabProps = {
  settings: EditorAppSettings;
  onPatch: (patch: EditorAppSettingsPatch) => void;
};

const MOUSE_BUTTON_ROWS: { key: EditorMouseButtonKey; label: string }[] = [
  { key: "leftButton", label: "Left Button" },
  { key: "rightButton", label: "Right Button" },
  { key: "middleButton", label: "Middle Button" },
];

const MOUSE_BUTTON_ACTIONS: { value: EditorMouseButtonAction; label: string }[] = [
  { value: "pan", label: "Pan" },
  { value: "zoom", label: "Zoom" },
  { value: "orbit", label: "Orbit" },
];

export function EditorCameraTab({ settings, onPatch }: EditorCameraTabProps) {
  const handleMouseConfigChange = (button: EditorMouseButtonKey, value: string) => {
    if (!isMouseButtonAction(value)) return;

    onPatch(createMouseButtonPatch(button, value));
  };

  return (
    <SettingsPage>
      <CameraProjectionSection settings={settings} onPatch={onPatch} />

      <SettingsSection title="Mouse Bindings" description="Viewport camera bindings shared by editor tools.">
        {MOUSE_BUTTON_ROWS.map((row) => (
          <SettingRow key={row.key} label={row.label}>
            <Select
              value={settings.editor[row.key]}
              onValueChange={(value) => handleMouseConfigChange(row.key, value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOUSE_BUTTON_ACTIONS.map((action) => (
                  <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        ))}

        <SettingRow label="Wheel Scroll">
          <ReadonlyField>Zoom</ReadonlyField>
        </SettingRow>
        <SettingRow label="Edit Override" description="Scene editors reserve left drag for active brush strokes.">
          <ReadonlyField>Left Button to Brush</ReadonlyField>
        </SettingRow>
        <Toggle
          label="Sticky Drag"
          description="Continue dragging when the pointer leaves the window."
          checked={settings.editor.stickyDrag}
          onChange={(enabled) => onPatch({ editor: { stickyDrag: enabled } })}
        />
      </SettingsSection>
    </SettingsPage>
  );
}

function isMouseButtonAction(value: string): value is EditorMouseButtonAction {
  return MOUSE_BUTTON_ACTIONS.some((action) => action.value === value);
}

function createMouseButtonPatch(
  button: EditorMouseButtonKey,
  action: EditorMouseButtonAction,
): EditorAppSettingsPatch {
  switch (button) {
    case "leftButton":
      return { editor: { leftButton: action } };
    case "rightButton":
      return { editor: { rightButton: action } };
    case "middleButton":
      return { editor: { middleButton: action } };
  }
}
