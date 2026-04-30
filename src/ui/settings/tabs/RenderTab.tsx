// RenderTab: render settings tab.
// RenderTab：渲染设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import { ReadonlyField, SettingRow, SettingsPage, SettingsSection } from "../SettingsLayout";

type RenderTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function RenderTab({ settings, onPatch }: RenderTabProps) {
  // Calculate effective render resolution.
  // 计算有效渲染分辨率
  const effectivePixelRatio = Math.min(window.devicePixelRatio, settings.render.maxPixelRatio) * settings.render.renderScale;
  const renderWidth = Math.round(window.innerWidth * effectivePixelRatio);
  const renderHeight = Math.round(window.innerHeight * effectivePixelRatio);

  return (
    <SettingsPage>
      <SettingsSection title="Output Scaling" description="Controls the renderer backbuffer size without changing the editor viewport.">
        <RangeField
          label="Max Pixel Ratio"
          description="Caps device pixel ratio before render scale is applied."
          value={settings.render.maxPixelRatio}
          min={0.5}
          max={3}
          step={0.05}
          onChange={(value) => onPatch({ render: { maxPixelRatio: value } })}
        />
        <RangeField
          label="Render Scale"
          description="Lower values reduce GPU cost on dense displays."
          value={settings.render.renderScale}
          min={0.25}
          max={1}
          step={0.05}
          valueLabel={`${Math.round(settings.render.renderScale * 100)}%`}
          onChange={(value) => onPatch({ render: { renderScale: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Diagnostics">
        <SettingRow label="Output Resolution">
          <ReadonlyField align="right">{renderWidth} x {renderHeight}</ReadonlyField>
        </SettingRow>
        <SettingRow label="Window Size">
          <ReadonlyField align="right">{window.innerWidth} x {window.innerHeight}</ReadonlyField>
        </SettingRow>
        <SettingRow label="Device Pixel Ratio">
          <ReadonlyField align="right">{window.devicePixelRatio.toFixed(2)}</ReadonlyField>
        </SettingRow>
        <SettingRow label="Effective Ratio">
          <ReadonlyField align="right">{effectivePixelRatio.toFixed(2)}</ReadonlyField>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}
