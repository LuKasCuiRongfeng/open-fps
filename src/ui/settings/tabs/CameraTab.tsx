// CameraTab: camera settings tab.
// CameraTab：相机设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "../../../game/settings/GameSettings";

type CameraTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function CameraTab({ settings, onPatch }: CameraTabProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RangeField
        label="FOV (degrees)"
        value={settings.camera.fovDegrees}
        min={40}
        max={110}
        step={1}
        onChange={(v) => onPatch({ camera: { fovDegrees: v } })}
      />
    </div>
  );
}
