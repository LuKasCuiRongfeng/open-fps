// RenderTab: render settings tab.
// RenderTab：渲染设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "../../../game/settings/GameSettings";

type RenderTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function RenderTab({ settings, onPatch }: RenderTabProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RangeField
        label="Max Pixel Ratio"
        value={settings.render.maxPixelRatio}
        min={0.5}
        max={3}
        step={0.05}
        onChange={(v) => onPatch({ render: { maxPixelRatio: v } })}
      />
    </div>
  );
}
