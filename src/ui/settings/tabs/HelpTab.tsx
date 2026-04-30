// HelpTab: help and controls information tab.
// HelpTab：帮助和控制信息标签

import { inputConfig } from "@config/input";
import { ReadonlyField, SettingRow, SettingsPage, SettingsSection } from "../SettingsLayout";

function keyLabelFromCode(code: string) {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code;
}

export function HelpTab() {
  const cameraModeKey = keyLabelFromCode(inputConfig.toggleCameraMode.codes[0]);
  const cameraStyleKey = keyLabelFromCode(inputConfig.toggleThirdPersonStyle.codes[0]);

  return (
    <SettingsPage>
      <SettingsSection title="View Focus" description="Runtime input starts after the game view captures the pointer.">
        <SettingRow label="Pointer Lock">
          <ReadonlyField>Click game view</ReadonlyField>
        </SettingRow>
        <SettingRow label="Settings">
          <ReadonlyField>Escape</ReadonlyField>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Movement">
        <SettingRow label="Move">
          <ReadonlyField>WASD / Arrow keys</ReadonlyField>
        </SettingRow>
        <SettingRow label="Sprint">
          <ReadonlyField>Shift</ReadonlyField>
        </SettingRow>
        <SettingRow label="Jump">
          <ReadonlyField>Space</ReadonlyField>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Camera">
        <SettingRow label="Mode Toggle">
          <ReadonlyField>{cameraModeKey}</ReadonlyField>
        </SettingRow>
        <SettingRow label="Style Toggle">
          <ReadonlyField>{cameraStyleKey}</ReadonlyField>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Settings Behavior">
        <SettingRow label="Apply">
          <ReadonlyField>Immediate</ReadonlyField>
        </SettingRow>
        <SettingRow label="Reset">
          <ReadonlyField>Default values</ReadonlyField>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}
