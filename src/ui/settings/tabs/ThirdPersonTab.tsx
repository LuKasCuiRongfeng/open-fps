// ThirdPersonTab: third-person camera settings tab.
// ThirdPersonTab：第三人称相机设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "@game/settings";

type ThirdPersonTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function ThirdPersonTab({ settings, onPatch }: ThirdPersonTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <RangeField
          label="Follow Lerp (/s)"
          value={settings.player.followLerpPerSecond}
          min={0}
          max={40}
          step={0.5}
          onChange={(v) => onPatch({ player: { followLerpPerSecond: v } })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RangeField
          label="Chase Distance (m)"
          value={settings.player.chaseFollowDistance}
          min={0.5}
          max={8}
          step={0.05}
          onChange={(v) => onPatch({ player: { chaseFollowDistance: v } })}
        />
        <RangeField
          label="Chase Height (m)"
          value={settings.player.chaseHeightOffset}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => onPatch({ player: { chaseHeightOffset: v } })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RangeField
          label="OTS Distance (m)"
          value={settings.player.overShoulderFollowDistance}
          min={0.5}
          max={8}
          step={0.05}
          onChange={(v) => onPatch({ player: { overShoulderFollowDistance: v } })}
        />
        <RangeField
          label="OTS Height (m)"
          value={settings.player.overShoulderHeightOffset}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => onPatch({ player: { overShoulderHeightOffset: v } })}
        />
        <RangeField
          label="OTS Shoulder (m)"
          value={settings.player.overShoulderOffset}
          min={-2}
          max={2}
          step={0.05}
          onChange={(v) => onPatch({ player: { overShoulderOffset: v } })}
        />
      </div>
    </div>
  );
}
