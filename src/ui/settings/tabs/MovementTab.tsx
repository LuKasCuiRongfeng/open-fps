// MovementTab: movement settings tab.
// MovementTab：移动设置标签

import { RangeField } from "../RangeField";
import { SettingsPage, SettingsSection } from "../SettingsLayout";
import type { GameSettings, GameSettingsPatch } from "@game/settings";

type MovementTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function MovementTab({ settings, onPatch }: MovementTabProps) {
  return (
    <SettingsPage>
      <SettingsSection title="Look" description="Pointer movement applied while the game view has focus.">
        <RangeField
          label="Mouse Sensitivity"
          value={settings.player.mouseSensitivity}
          min={0.05}
          max={5}
          step={0.01}
          onChange={(value) => onPatch({ player: { mouseSensitivity: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Locomotion" description="Ground movement speeds used by first-person and third-person modes.">
        <RangeField
          label="Move Speed"
          value={settings.player.moveSpeed}
          min={0.5}
          max={40}
          step={0.1}
          valueLabel={`${settings.player.moveSpeed.toFixed(1)} m/s`}
          onChange={(value) => onPatch({ player: { moveSpeed: value } })}
        />
        <RangeField
          label="Sprint Bonus"
          value={settings.player.sprintBonus}
          min={0}
          max={60}
          step={0.1}
          valueLabel={`${settings.player.sprintBonus.toFixed(1)} m/s`}
          onChange={(value) => onPatch({ player: { sprintBonus: value } })}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
