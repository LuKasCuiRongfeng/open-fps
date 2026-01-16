// FogTab: fog settings tab.
// FogTab：雾设置标签

import { RangeField } from "../RangeField";
import { visualsConfig } from "../../../config/visuals";
import type { GameSettings, GameSettingsPatch } from "../../../game/settings/GameSettings";

type FogTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function FogTab({ settings, onPatch }: FogTabProps) {
  return (
    <div className="space-y-4">
      <div className="text-xs text-white/60 mb-4">
        Fog density controls atmospheric haze. Lower values = clearer visibility.
        <br />
        雾浓度控制大气雾化。数值越低 = 能见度越高。
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <RangeField
          label="Fog Density"
          value={settings.fog.density}
          min={visualsConfig.fog.minDensity}
          max={visualsConfig.fog.maxDensity}
          step={0.00001}
          onChange={(v) => onPatch({ fog: { density: v } })}
        />
      </div>
      <div className="text-xs text-white/40 mt-2">
        Visibility ≈ {Math.round(3.912 / settings.fog.density)}m
      </div>
    </div>
  );
}
