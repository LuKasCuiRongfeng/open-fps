// TimeTab: compact time simulation settings with a draggable editor dial.
// TimeTab：带可拖拽编辑器刻度盘的紧凑时间模拟设置。

import { useRef, useState } from "react";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import { Toggle } from "../Toggle";
import { RangeField } from "../RangeField";
import { ReadonlyField, SettingBadge, SettingRow, SettingsPage, SettingsSection } from "../SettingsLayout";

const DIAL_CENTER = 110;
const DIAL_LABEL_RADIUS = 88;
const DIAL_TICK_OUTER_RADIUS = 96;
const DIAL_TICK_INNER_RADIUS = 90;
const SHADOW_RADIUS = 70;

const SHICHEN = [
  { name: "午", pinyin: "Wu", hour: 12 },
  { name: "未", pinyin: "Wei", hour: 14 },
  { name: "申", pinyin: "Shen", hour: 16 },
  { name: "酉", pinyin: "You", hour: 18 },
  { name: "戌", pinyin: "Xu", hour: 20 },
  { name: "亥", pinyin: "Hai", hour: 22 },
  { name: "子", pinyin: "Zi", hour: 0 },
  { name: "丑", pinyin: "Chou", hour: 2 },
  { name: "寅", pinyin: "Yin", hour: 4 },
  { name: "卯", pinyin: "Mao", hour: 6 },
  { name: "辰", pinyin: "Chen", hour: 8 },
  { name: "巳", pinyin: "Si", hour: 10 },
] as const;

const TIME_SPEED_PRESETS = [
  { label: "Paused", value: 0 },
  { label: "1x", value: 1 },
  { label: "60x", value: 60 },
  { label: "360x", value: 360 },
  { label: "1440x", value: 1440 },
] as const;

function getShichen(hour: number): (typeof SHICHEN)[number] {
  const adjustedHour = (hour + 1) % 24;
  const periodIndex = Math.floor(adjustedHour / 2) % 12;
  const displayIndex = (periodIndex + 6) % 12;
  return SHICHEN[displayIndex];
}

function formatTime(hours: number): string {
  const hourPart = Math.floor(hours) % 24;
  const minutePart = Math.floor((hours % 1) * 60);
  return `${hourPart.toString().padStart(2, "0")}:${minutePart.toString().padStart(2, "0")}`;
}

function getDayPeriod(hour: number): string {
  if (hour >= 5 && hour < 7) return "Dawn";
  if (hour >= 7 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 13) return "Noon";
  if (hour >= 13 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 19) return "Dusk";
  if (hour >= 19 && hour < 22) return "Evening";
  return "Night";
}

function getTimeSpeedLabel(timeSpeed: number): string {
  if (timeSpeed === 0) return "Stopped";
  if (timeSpeed === 1) return "Real time";
  if (timeSpeed < 60) return `${timeSpeed} game seconds / real second`;
  if (timeSpeed < 3600) return `${(timeSpeed / 60).toFixed(1)} game minutes / real second`;
  return `${(timeSpeed / 3600).toFixed(1)} game hours / real second`;
}

type TimeTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function TimeTab({ settings, onPatch }: TimeTabProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const timeOfDay = settings.time.timeOfDay;
  const shichen = getShichen(timeOfDay);

  const timeToAngle = (timeValue: number) => {
    // EN: Noon is rendered at the top of the dial, matching the existing sun-time model.
    // 中文: 正午显示在刻度盘顶部，以匹配现有太阳时间模型。
    const shiftedTime = timeValue - 12;
    return ((shiftedTime / 24) * 360 - 90) * (Math.PI / 180);
  };

  const shadowAngle = timeToAngle(timeOfDay);
  const shadowTipX = DIAL_CENTER + SHADOW_RADIUS * Math.cos(shadowAngle);
  const shadowTipY = DIAL_CENTER + SHADOW_RADIUS * Math.sin(shadowAngle);

  const handlePointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.preventDefault();
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGGElement>) => {
    if (!isDragging || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const pointerX = event.clientX - rect.left - centerX;
    const pointerY = event.clientY - rect.top - centerY;
    let angle = Math.atan2(pointerY, pointerX) + Math.PI / 2;

    if (angle < 0) {
      angle += Math.PI * 2;
    }

    const nextTime = ((angle / (Math.PI * 2)) * 24 + 12) % 24;
    onPatch({ time: { timeOfDay: nextTime } });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGGElement>) => {
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <SettingsPage>
      <SettingsSection
        title="Time Preview"
        actions={<SettingBadge tone={settings.time.timePaused ? "warning" : "success"}>{settings.time.timePaused ? "Paused" : "Running"}</SettingBadge>}
      >
        <SettingRow label="Current Time" description="Drag the dial handle or use the slider below." align="start">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <svg
              ref={svgRef}
              width="220"
              height="220"
              viewBox="0 0 220 220"
              className="h-56 w-56 select-none text-content-muted"
            >
              <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r="104" className="fill-surface-panel stroke-stroke-default" strokeWidth="1" />
              <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r="82" className="fill-surface-panel-muted stroke-stroke-subtle" strokeWidth="1" />

              {Array.from({ length: 24 }, (_unused, hourIndex) => {
                const hourAngle = ((hourIndex - 12) / 24) * 360 - 90;
                const markerAngle = (hourAngle * Math.PI) / 180;
                const tickInnerRadius = hourIndex % 2 === 0 ? DIAL_TICK_INNER_RADIUS - 6 : DIAL_TICK_INNER_RADIUS;
                return (
                  <line
                    key={`tick-${hourIndex}`}
                    x1={DIAL_CENTER + tickInnerRadius * Math.cos(markerAngle)}
                    y1={DIAL_CENTER + tickInnerRadius * Math.sin(markerAngle)}
                    x2={DIAL_CENTER + DIAL_TICK_OUTER_RADIUS * Math.cos(markerAngle)}
                    y2={DIAL_CENTER + DIAL_TICK_OUTER_RADIUS * Math.sin(markerAngle)}
                    className="stroke-content-muted"
                    strokeWidth={hourIndex % 2 === 0 ? 1.5 : 1}
                  />
                );
              })}

              {SHICHEN.map((period) => {
                const hourAngle = ((period.hour - 12) / 24) * 360 - 90;
                const labelAngle = (hourAngle * Math.PI) / 180;
                return (
                  <text
                    key={period.name}
                    x={DIAL_CENTER + DIAL_LABEL_RADIUS * Math.cos(labelAngle)}
                    y={DIAL_CENTER + DIAL_LABEL_RADIUS * Math.sin(labelAngle)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-content-muted font-serif text-[10px]"
                  >
                    {period.name}
                  </text>
                );
              })}

              <line
                x1={DIAL_CENTER}
                y1={DIAL_CENTER}
                x2={shadowTipX}
                y2={shadowTipY}
                className="stroke-status-warning"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r="5" className="fill-surface-control stroke-stroke-default" strokeWidth="1" />

              <g
                className={isDragging ? "cursor-grabbing" : "cursor-grab"}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <circle cx={shadowTipX} cy={shadowTipY} r="10" className="fill-status-warning/20 stroke-status-warning" strokeWidth="2" />
                <circle cx={shadowTipX} cy={shadowTipY} r="3" className="fill-status-warning" />
              </g>
            </svg>

            <div className="space-y-2">
              <ReadonlyField>{formatTime(timeOfDay)}</ReadonlyField>
              <ReadonlyField>{getDayPeriod(timeOfDay)}</ReadonlyField>
              <ReadonlyField>{shichen.name} / {shichen.pinyin}</ReadonlyField>
            </div>
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Simulation">
        <Toggle
          label="Pause Time"
          description="Freezes the simulation clock at the current hour."
          checked={settings.time.timePaused}
          onChange={(value) => onPatch({ time: { timePaused: value } })}
        />
        <Toggle
          label="Sun Follows Time"
          description="Links sun azimuth to the time-of-day value."
          checked={settings.time.timeDrivenSun}
          onChange={(value) => onPatch({ time: { timeDrivenSun: value } })}
        />
        <SettingRow label="Speed Preset">
          <div className="flex flex-wrap gap-1.5">
            {TIME_SPEED_PRESETS.map((preset) => {
              const active = settings.time.timeSpeed === preset.value && (preset.value !== 0 || settings.time.timePaused);
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onPatch({ time: { timeSpeed: preset.value, timePaused: preset.value === 0 } })}
                  className={`h-7 rounded-md border px-2 text-[11px] transition-colors ${
                    active
                      ? "border-status-warning/50 bg-status-warning/20 text-status-warning"
                      : "border-stroke-default bg-surface-control text-content-muted hover:bg-surface-control-hover hover:text-content-primary"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </SettingRow>
        <RangeField
          label="Speed Multiplier"
          description={getTimeSpeedLabel(settings.time.timeSpeed)}
          value={settings.time.timeSpeed}
          min={0}
          max={3600}
          step={1}
          tone="warning"
          onChange={(value) => onPatch({ time: { timeSpeed: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Direct Control">
        <RangeField
          label="Time of Day"
          value={timeOfDay}
          min={0}
          max={24}
          step={0.1}
          tone="warning"
          valueLabel={formatTime(timeOfDay)}
          onChange={(value) => onPatch({ time: { timeOfDay: value % 24 } })}
        />
      </SettingsSection>
    </SettingsPage>
  );
}