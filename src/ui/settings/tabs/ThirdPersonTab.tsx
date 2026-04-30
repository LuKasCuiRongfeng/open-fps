// ThirdPersonTab: third-person camera settings tab.
// ThirdPersonTab：第三人称相机设置标签

import { RangeField } from "../RangeField";
import { SettingsPage, SettingsSection } from "../SettingsLayout";
import type { GameSettings, GameSettingsPatch } from "@game/settings";

type ThirdPersonTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function ThirdPersonTab({ settings, onPatch }: ThirdPersonTabProps) {
  return (
    <SettingsPage>
      <SettingsSection title="Follow" description="Camera smoothing shared by third-person styles.">
        <RangeField
          label="Follow Lerp"
          value={settings.player.followLerpPerSecond}
          min={0}
          max={40}
          step={0.5}
          valueLabel={`${settings.player.followLerpPerSecond.toFixed(1)} /s`}
          onChange={(value) => onPatch({ player: { followLerpPerSecond: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Chase Camera" description="Centered follow camera parameters.">
        <RangeField
          label="Distance"
          value={settings.player.chaseFollowDistance}
          min={0.5}
          max={8}
          step={0.05}
          valueLabel={`${settings.player.chaseFollowDistance.toFixed(2)} m`}
          onChange={(value) => onPatch({ player: { chaseFollowDistance: value } })}
        />
        <RangeField
          label="Height"
          value={settings.player.chaseHeightOffset}
          min={0}
          max={4}
          step={0.05}
          valueLabel={`${settings.player.chaseHeightOffset.toFixed(2)} m`}
          onChange={(value) => onPatch({ player: { chaseHeightOffset: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Over Shoulder" description="Offset follow camera parameters.">
        <RangeField
          label="Distance"
          value={settings.player.overShoulderFollowDistance}
          min={0.5}
          max={8}
          step={0.05}
          valueLabel={`${settings.player.overShoulderFollowDistance.toFixed(2)} m`}
          onChange={(value) => onPatch({ player: { overShoulderFollowDistance: value } })}
        />
        <RangeField
          label="Height"
          value={settings.player.overShoulderHeightOffset}
          min={0}
          max={4}
          step={0.05}
          valueLabel={`${settings.player.overShoulderHeightOffset.toFixed(2)} m`}
          onChange={(value) => onPatch({ player: { overShoulderHeightOffset: value } })}
        />
        <RangeField
          label="Shoulder Offset"
          value={settings.player.overShoulderOffset}
          min={-2}
          max={2}
          step={0.05}
          valueLabel={`${settings.player.overShoulderOffset.toFixed(2)} m`}
          onChange={(value) => onPatch({ player: { overShoulderOffset: value } })}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
