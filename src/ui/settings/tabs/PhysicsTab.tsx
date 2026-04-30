// PhysicsTab: physics settings tab.
// PhysicsTab：物理设置标签

import { RangeField } from "../RangeField";
import { SettingsPage, SettingsSection } from "../SettingsLayout";
import type { GameSettings, GameSettingsPatch } from "@game/settings";

type PhysicsTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function PhysicsTab({ settings, onPatch }: PhysicsTabProps) {
  return (
    <SettingsPage>
      <SettingsSection title="Jump" description="Vertical impulse applied when the player leaves the ground.">
        <RangeField
          label="Jump Velocity"
          value={settings.player.jumpVelocity}
          min={0.5}
          max={20}
          step={0.1}
          valueLabel={`${settings.player.jumpVelocity.toFixed(1)} m/s`}
          onChange={(value) => onPatch({ player: { jumpVelocity: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Fall" description="Gravity integration and terminal fall speed. Only affects runtime motion.">
        <RangeField
          label="Gravity"
          value={settings.player.gravity}
          min={0}
          max={60}
          step={0.1}
          valueLabel={`${settings.player.gravity.toFixed(1)} m/s2`}
          onChange={(value) => onPatch({ player: { gravity: value } })}
        />
        <RangeField
          label="Max Fall Speed"
          value={settings.player.maxFallSpeed}
          min={1}
          max={120}
          step={1}
          valueLabel={`${Math.round(settings.player.maxFallSpeed)} m/s`}
          onChange={(value) => onPatch({ player: { maxFallSpeed: value } })}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
