// SkyTab: unified sky, lighting, and fog settings tab.
// SkyTab：统一的天空、光照和雾设置标签

import { RangeField } from "../RangeField";
import { Toggle } from "../Toggle";
import { fogConfig } from "@config/fog";
import type { GameSettings, GameSettingsPatch } from "@game/settings/GameSettings";

type SkyTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function SkyTab({ settings, onPatch }: SkyTabProps) {
  return (
    <div className="space-y-6">
      <div className="text-xs text-white/60 mb-4">
        Sky atmosphere, sun position, lighting, and fog settings.
        <br />
        天空大气、太阳位置、光照和雾设置。
      </div>

      {/* Sun Position */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">Sun Position / 太阳位置</div>
        <div className="grid gap-4 md:grid-cols-2">
          <RangeField
            label="Elevation (height)"
            value={settings.sky.sunElevation}
            min={-30}
            max={90}
            step={1}
            onChange={(v) => onPatch({ sky: { sunElevation: v } })}
          />
          <div className="space-y-1">
            <label className="block text-xs text-white/70">Azimuth (direction)</label>
            <div className="flex items-center h-8 px-3 bg-white/5 rounded text-sm text-white/60">
              {Math.round(settings.sky.sunAzimuth)}°
            </div>
            <div className="text-xs text-white/40">Driven by time. Adjust via Time settings.</div>
          </div>
          <RangeField
            label="Sun Size"
            value={settings.sky.sunSize}
            min={5}
            max={50}
            step={1}
            onChange={(v) => onPatch({ sky: { sunSize: v } })}
          />
        </div>
        <div className="text-xs text-white/40 mt-2">
          Elevation: -30° to 0° = night/twilight, 0° = horizon, 90° = overhead.
        </div>
      </div>

      {/* Lighting Intensity */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">Lighting / 光照</div>
        <div className="grid gap-4 md:grid-cols-2">
          <RangeField
            label="Ambient Intensity"
            value={settings.sky.ambientIntensity}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => onPatch({ sky: { ambientIntensity: v } })}
          />
          <RangeField
            label="Sun Intensity"
            value={settings.sky.sunIntensity}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => onPatch({ sky: { sunIntensity: v } })}
          />
        </div>
        <div className="mt-3">
          <Toggle
            label="Shadows"
            checked={settings.sky.shadowsEnabled}
            onChange={(v) => onPatch({ sky: { shadowsEnabled: v } })}
          />
        </div>
      </div>

      {/* Terrain Shading */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">Terrain Shading / 地形着色</div>
        <RangeField
          label="Normal Softness"
          value={settings.sky.normalSoftness}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onPatch({ sky: { normalSoftness: v } })}
        />
        <div className="text-xs text-white/40 mt-2">
          0 = sharp realistic shading, 1 = flat (no contrast). Try 0.3-0.5 for balanced look.
        </div>
      </div>

      {/* Fog */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">Fog / 雾</div>
        <RangeField
          label="Fog Density"
          value={settings.sky.fogDensity}
          min={fogConfig.minDensity}
          max={fogConfig.maxDensity}
          step={0.00001}
          onChange={(v) => onPatch({ sky: { fogDensity: v } })}
        />
        <div className="text-xs text-white/40 mt-2">
          Visibility ≈ {Math.round(3.912 / settings.sky.fogDensity)}m
        </div>
      </div>

      {/* Atmosphere */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">Atmosphere / 大气</div>
        <div className="grid gap-4 md:grid-cols-2">
          <RangeField
            label="Turbidity"
            value={settings.sky.turbidity}
            min={1}
            max={20}
            step={0.5}
            onChange={(v) => onPatch({ sky: { turbidity: v } })}
          />
          <RangeField
            label="Rayleigh"
            value={settings.sky.rayleigh}
            min={0}
            max={4}
            step={0.1}
            onChange={(v) => onPatch({ sky: { rayleigh: v } })}
          />
          <RangeField
            label="Mie Coefficient"
            value={settings.sky.mieCoefficient}
            min={0}
            max={0.1}
            step={0.001}
            onChange={(v) => onPatch({ sky: { mieCoefficient: v } })}
          />
          <RangeField
            label="Mie Directional G"
            value={settings.sky.mieDirectionalG}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onPatch({ sky: { mieDirectionalG: v } })}
          />
        </div>
        <div className="text-xs text-white/40 mt-2">
          Turbidity: 2 = clear, 10 = hazy. Rayleigh affects sky blue color. Mie affects sun halo.
        </div>
      </div>

      {/* Bloom */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">Sun Bloom / 太阳泛光</div>
        <div className="mb-3">
          <Toggle
            label="Enable bloom (sun glare effect)"
            checked={settings.sky.bloomEnabled}
            onChange={(v) => onPatch({ sky: { bloomEnabled: v } })}
          />
        </div>
        {settings.sky.bloomEnabled && (
          <div className="grid gap-4 md:grid-cols-3">
            <RangeField
              label="Threshold"
              value={settings.sky.bloomThreshold}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onPatch({ sky: { bloomThreshold: v } })}
            />
            <RangeField
              label="Strength"
              value={settings.sky.bloomStrength}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => onPatch({ sky: { bloomStrength: v } })}
            />
            <RangeField
              label="Radius"
              value={settings.sky.bloomRadius}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onPatch({ sky: { bloomRadius: v } })}
            />
          </div>
        )}
      </div>

      {/* Lens Flare */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">Lens Flare / 镜头光斑</div>
        <div className="mb-3">
          <Toggle
            label="Enable lens flare (camera effect)"
            checked={settings.sky.lensflareEnabled}
            onChange={(v) => onPatch({ sky: { lensflareEnabled: v } })}
          />
        </div>
        <div className="text-xs text-white/40 mt-2">
          Simulates internal lens reflections when facing the sun. Creates ghost images radiating from the light source.
        </div>
      </div>

      {/* God Rays */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">God Rays / 上帝光线</div>
        <div className="mb-3">
          <Toggle
            label="Enable god rays (light shaft effect)"
            checked={settings.sky.godRaysEnabled}
            onChange={(v) => onPatch({ sky: { godRaysEnabled: v } })}
          />
        </div>
        {settings.sky.godRaysEnabled && (
          <div className="grid gap-4 md:grid-cols-3">
            <RangeField
              label="Weight"
              value={settings.sky.godRaysWeight}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => onPatch({ sky: { godRaysWeight: v } })}
            />
            <RangeField
              label="Decay"
              value={settings.sky.godRaysDecay}
              min={0.8}
              max={1}
              step={0.01}
              onChange={(v) => onPatch({ sky: { godRaysDecay: v } })}
            />
            <RangeField
              label="Exposure"
              value={settings.sky.godRaysExposure}
              min={0}
              max={10}
              step={0.1}
              onChange={(v) => onPatch({ sky: { godRaysExposure: v } })}
            />
          </div>
        )}
        <div className="text-xs text-white/40 mt-2">
          Simulates volumetric light scattering (crepuscular rays) radiating from the sun.
        </div>
      </div>

      {/* Night Sky */}
      <div>
        <div className="text-xs font-medium text-white/80 mb-3">Night Sky / 夜空</div>
        <div className="grid gap-4 md:grid-cols-2">
          <RangeField
            label="Star Brightness"
            value={settings.sky.starBrightness}
            min={0}
            max={2}
            step={0.1}
            onChange={(v) => onPatch({ sky: { starBrightness: v } })}
          />
          <RangeField
            label="Milky Way Brightness"
            value={settings.sky.milkyWayBrightness}
            min={0}
            max={2}
            step={0.1}
            onChange={(v) => onPatch({ sky: { milkyWayBrightness: v } })}
          />
        </div>
        <div className="text-xs text-white/40 mt-2">
          Adjust the visibility of stars and the Milky Way in the night sky. Set sun elevation to 0° to see the night sky.
        </div>
      </div>
    </div>
  );
}
