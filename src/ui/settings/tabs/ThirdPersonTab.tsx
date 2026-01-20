// ThirdPersonTab: third-person camera settings tab.
// ThirdPersonTab：第三人称相机设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "@game/settings/GameSettings";

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
          value={settings.player.thirdPerson.followLerpPerSecond}
          min={0}
          max={40}
          step={0.5}
          onChange={(v) => onPatch({ player: { thirdPerson: { followLerpPerSecond: v } } })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RangeField
          label="Chase Distance (m)"
          value={settings.player.thirdPerson.chase.followDistance}
          min={0.5}
          max={8}
          step={0.05}
          onChange={(v) =>
            onPatch({ player: { thirdPerson: { chase: { followDistance: v } } } })
          }
        />
        <RangeField
          label="Chase Height (m)"
          value={settings.player.thirdPerson.chase.heightOffset}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) =>
            onPatch({ player: { thirdPerson: { chase: { heightOffset: v } } } })
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RangeField
          label="OTS Distance (m)"
          value={settings.player.thirdPerson.overShoulder.followDistance}
          min={0.5}
          max={8}
          step={0.05}
          onChange={(v) =>
            onPatch({ player: { thirdPerson: { overShoulder: { followDistance: v } } } })
          }
        />
        <RangeField
          label="OTS Height (m)"
          value={settings.player.thirdPerson.overShoulder.heightOffset}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) =>
            onPatch({ player: { thirdPerson: { overShoulder: { heightOffset: v } } } })
          }
        />
        <RangeField
          label="OTS Shoulder (m)"
          value={settings.player.thirdPerson.overShoulder.shoulderOffset}
          min={-2}
          max={2}
          step={0.05}
          onChange={(v) =>
            onPatch({ player: { thirdPerson: { overShoulder: { shoulderOffset: v } } } })
          }
        />
      </div>
    </div>
  );
}
