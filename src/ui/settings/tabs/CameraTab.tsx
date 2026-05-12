// CameraTab: camera settings tab.
// CameraTab：相机设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import { SettingsPage, SettingsSection } from "../SettingsLayout";

type CameraTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function CameraTab({ settings, onPatch }: CameraTabProps) {
  return (
    <SettingsPage>
      <CameraProjectionSection settings={settings} onPatch={onPatch} />
    </SettingsPage>
  );
}

export function CameraProjectionSection({ settings, onPatch }: CameraTabProps) {
  return (
    <SettingsSection title="Viewport Camera" description="Controls perspective projection used by the active view.">
      <RangeField
        label="Field of View"
        description="Vertical perspective angle in degrees."
        value={settings.camera.fovDegrees}
        min={40}
        max={110}
        step={1}
        valueLabel={`${Math.round(settings.camera.fovDegrees)} deg`}
        onChange={(value) => onPatch({ camera: { fovDegrees: value } })}
      />
    </SettingsSection>
  );
}
