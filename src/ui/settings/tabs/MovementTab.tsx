// MovementTab: movement settings tab.
// MovementTab：移动设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "@game/settings/GameSettings";

type MovementTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function MovementTab({ settings, onPatch }: MovementTabProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RangeField
        label="Mouse Sensitivity"
        value={settings.player.mouseSensitivity}
        min={0.05}
        max={5}
        step={0.01}
        onChange={(v) => onPatch({ player: { mouseSensitivity: v } })}
      />
      <RangeField
        label="Move Speed (m/s)"
        value={settings.player.moveSpeed}
        min={0.5}
        max={40}
        step={0.1}
        onChange={(v) => onPatch({ player: { moveSpeed: v } })}
      />
      <RangeField
        label="Sprint Bonus (m/s)"
        value={settings.player.sprintBonus}
        min={0}
        max={60}
        step={0.1}
        onChange={(v) => onPatch({ player: { sprintBonus: v } })}
      />
    </div>
  );
}
