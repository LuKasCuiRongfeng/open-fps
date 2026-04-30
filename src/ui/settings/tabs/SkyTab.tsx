// SkyTab: unified sky, lighting, and fog settings tab.
// SkyTab：统一的天空、光照和雾设置标签

import { RangeField } from "../RangeField";
import { Toggle } from "../Toggle";
import { fogStaticConfig } from "@config/fog";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import { ReadonlyField, SettingRow, SettingsPage, SettingsSection } from "../SettingsLayout";

type SkyTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function SkyTab({ settings, onPatch }: SkyTabProps) {
  return (
    <SettingsPage>
      <SettingsSection title="Sun" description="Primary directional light and atmospheric disc.">
        <RangeField
          label="Elevation"
          description="0 degrees is horizon, 90 degrees is overhead."
          value={settings.sky.sunElevation}
          min={-30}
          max={90}
          step={1}
          valueLabel={`${Math.round(settings.sky.sunElevation)} deg`}
          onChange={(value) => onPatch({ sky: { sunElevation: value } })}
        />
        <SettingRow label="Azimuth" description="Driven by time when time-linked sun is enabled.">
          <ReadonlyField align="right">{Math.round(settings.sky.sunAzimuth)} deg</ReadonlyField>
        </SettingRow>
        <RangeField
          label="Disc Size"
          value={settings.sky.sunSize}
          min={5}
          max={50}
          step={1}
          onChange={(value) => onPatch({ sky: { sunSize: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Lighting">
        <RangeField
          label="Ambient Intensity"
          value={settings.sky.ambientIntensity}
          min={0}
          max={3}
          step={0.05}
          onChange={(value) => onPatch({ sky: { ambientIntensity: value } })}
        />
        <RangeField
          label="Sun Intensity"
          value={settings.sky.sunIntensity}
          min={0}
          max={3}
          step={0.05}
          onChange={(value) => onPatch({ sky: { sunIntensity: value } })}
        />
        <Toggle
          label="Shadows"
          description="Enables directional shadowing from the sun."
          checked={settings.sky.shadowsEnabled}
          onChange={(value) => onPatch({ sky: { shadowsEnabled: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Terrain Atmosphere">
        <RangeField
          label="Normal Softness"
          description="Higher values flatten contrast in terrain shading."
          value={settings.sky.normalSoftness}
          min={0}
          max={1}
          step={0.05}
          valueLabel={`${Math.round(settings.sky.normalSoftness * 100)}%`}
          onChange={(value) => onPatch({ sky: { normalSoftness: value } })}
        />
        <RangeField
          label="Fog Density"
          value={settings.sky.fogDensity}
          min={fogStaticConfig.minDensity}
          max={fogStaticConfig.maxDensity}
          step={0.00001}
          onChange={(value) => onPatch({ sky: { fogDensity: value } })}
        />
        <SettingRow label="Approx. Visibility">
          <ReadonlyField align="right">{Math.round(3.912 / settings.sky.fogDensity)} m</ReadonlyField>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Post Effects">
        <Toggle
          label="Sun Bloom"
          description="Adds glare around bright sun pixels."
          checked={settings.sky.bloomEnabled}
          onChange={(value) => onPatch({ sky: { bloomEnabled: value } })}
        />
        <RangeField
          label="Bloom Threshold"
          value={settings.sky.bloomThreshold}
          min={0}
          max={1}
          step={0.01}
          disabled={!settings.sky.bloomEnabled}
          onChange={(value) => onPatch({ sky: { bloomThreshold: value } })}
        />
        <RangeField
          label="Bloom Strength"
          value={settings.sky.bloomStrength}
          min={0}
          max={2}
          step={0.05}
          disabled={!settings.sky.bloomEnabled}
          onChange={(value) => onPatch({ sky: { bloomStrength: value } })}
        />
        <RangeField
          label="Bloom Radius"
          value={settings.sky.bloomRadius}
          min={0}
          max={1}
          step={0.01}
          disabled={!settings.sky.bloomEnabled}
          onChange={(value) => onPatch({ sky: { bloomRadius: value } })}
        />
        <Toggle
          label="Lens Flare"
          description="Shows lens artifacts when facing the sun."
          checked={settings.sky.lensflareEnabled}
          onChange={(value) => onPatch({ sky: { lensflareEnabled: value } })}
        />
        <RangeField
          label="Star Brightness"
          description="Visible when the sun is below the horizon."
          value={settings.sky.starBrightness}
          min={0}
          max={2}
          step={0.1}
          onChange={(value) => onPatch({ sky: { starBrightness: value } })}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
