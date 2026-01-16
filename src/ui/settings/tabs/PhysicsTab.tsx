// PhysicsTab: physics settings tab.
// PhysicsTab：物理设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "../../../game/settings/GameSettings";

type PhysicsTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function PhysicsTab({ settings, onPatch }: PhysicsTabProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RangeField
        label="Jump Velocity (m/s)"
        value={settings.player.jumpVelocity}
        min={0.5}
        max={20}
        step={0.1}
        onChange={(v) => onPatch({ player: { jumpVelocity: v } })}
      />
      <RangeField
        label="Gravity (m/s²)"
        value={settings.player.gravity}
        min={0}
        max={60}
        step={0.1}
        onChange={(v) => onPatch({ player: { gravity: v } })}
      />
      <RangeField
        label="Max Fall Speed (m/s)"
        value={settings.player.maxFallSpeed}
        min={1}
        max={120}
        step={1}
        onChange={(v) => onPatch({ player: { maxFallSpeed: v } })}
      />
    </div>
  );
}
