// RenderTab: render settings tab.
// RenderTab：渲染设置标签

import { RangeField } from "../RangeField";
import type { GameSettings, GameSettingsPatch } from "@game/settings/GameSettings";

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
    <div className="grid gap-4 md:grid-cols-2">
      <RangeField
        label="Max Pixel Ratio"
        value={settings.render.maxPixelRatio}
        min={0.5}
        max={3}
        step={0.05}
        onChange={(v) => onPatch({ render: { maxPixelRatio: v } })}
      />
      <RangeField
        label="Render Scale"
        value={settings.render.renderScale}
        min={0.25}
        max={1}
        step={0.05}
        onChange={(v) => onPatch({ render: { renderScale: v } })}
      />
      <div className="col-span-2 rounded-md border border-white/10 bg-white/5 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-white/60">Effective Resolution / 有效分辨率</span>
          <span className="font-mono text-white">{renderWidth} × {renderHeight}</span>
        </div>
        <div className="mt-1 text-xs text-white/40">
          Window: {window.innerWidth} × {window.innerHeight} • DPR: {window.devicePixelRatio.toFixed(2)} • Effective: {effectivePixelRatio.toFixed(2)}
        </div>
      </div>
      <div className="col-span-2 text-xs text-white/50">
        💡 Lower render scale for better performance on high-resolution displays (4K).
        <br />
        降低渲染缩放可在高分辨率显示器 (4K) 上获得更好的性能。
      </div>
    </div>
  );
}
