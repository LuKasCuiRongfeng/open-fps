// TimeTab: Chinese ancient sundial-style time settings with draggable gnomon shadow.
// TimeTab：中国古代日晷风格的时间设置，可拖拽晷针阴影

import { useRef, useState } from "react";
import type { GameSettings, GameSettingsPatch } from "@game/settings/GameSettings";
import { Toggle } from "../Toggle";
import { RangeField } from "../RangeField";

// Chinese traditional hour names (时辰), ordered for sundial display.
// Noon (午) at top, Midnight (子) at bottom.
// 中国传统时辰名称，按日晷显示顺序排列
// 午时在上方，子时在下方
const SHICHEN = [
  { name: "午", pinyin: "Wǔ", hour: 12 },    // 11:00-13:00, top
  { name: "未", pinyin: "Wèi", hour: 14 },   // 13:00-15:00
  { name: "申", pinyin: "Shēn", hour: 16 },  // 15:00-17:00
  { name: "酉", pinyin: "Yǒu", hour: 18 },   // 17:00-19:00
  { name: "戌", pinyin: "Xū", hour: 20 },    // 19:00-21:00
  { name: "亥", pinyin: "Hài", hour: 22 },   // 21:00-23:00
  { name: "子", pinyin: "Zǐ", hour: 0 },     // 23:00-01:00, bottom
  { name: "丑", pinyin: "Chǒu", hour: 2 },   // 01:00-03:00
  { name: "寅", pinyin: "Yín", hour: 4 },    // 03:00-05:00
  { name: "卯", pinyin: "Mǎo", hour: 6 },    // 05:00-07:00
  { name: "辰", pinyin: "Chén", hour: 8 },   // 07:00-09:00
  { name: "巳", pinyin: "Sì", hour: 10 },    // 09:00-11:00
];

// Get current Shichen from hour.
// 根据小时获取当前时辰
function getShichen(hour: number): (typeof SHICHEN)[number] {
  // Adjust for Zi starting at 23:00.
  // 调整子时从23:00开始
  const adjusted = (hour + 1) % 24;
  const index = Math.floor(adjusted / 2) % 12;
  // Map to our reordered array (午 is index 0 in display, but hour 12).
  // 映射到重新排序的数组
  const displayIndex = (index + 6) % 12; // Shift so 午 (index 6 in original) becomes 0
  return SHICHEN[displayIndex];
}

// Format time as HH:MM.
// 格式化时间为 HH:MM
function formatTime(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Get day period description (English only).
// 获取时段描述（仅英文）
function getDayPeriod(hour: number): string {
  if (hour >= 5 && hour < 7) return "Dawn";
  if (hour >= 7 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 13) return "Noon";
  if (hour >= 13 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 19) return "Dusk";
  if (hour >= 19 && hour < 22) return "Evening";
  return "Night";
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

  // Convert time to angle for sundial.
  // Noon (12:00) = top (-90°), Midnight (0:00) = bottom (90°).
  // 将时间转换为日晷角度
  // 正午(12:00) = 顶部(-90°)，午夜(0:00) = 底部(90°)
  const timeToAngle = (t: number) => {
    // Shift so noon is at top: (t - 12) maps noon to 0.
    // Then scale to 360° and convert to radians, starting from top (-90°).
    // 移位使正午在顶部
    const shifted = t - 12;
    return ((shifted / 24) * 360 - 90) * (Math.PI / 180);
  };
  const shadowAngle = timeToAngle(timeOfDay);

  // Handle pointer events for dragging the gnomon shadow.
  // 处理拖拽晷针阴影的指针事件
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    // Calculate angle from center.
    // 从中心计算角度
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    let angle = Math.atan2(y, x);

    // Convert angle to time.
    // Top (-90° or -π/2) = noon (12:00).
    // 将角度转换为时间
    angle = angle + Math.PI / 2; // Now top is 0.
    if (angle < 0) angle += Math.PI * 2;

    // Map angle to time: 0 rad = noon (12), 2π rad = noon again.
    // 映射角度到时间
    const newTime = ((angle / (Math.PI * 2)) * 24 + 12) % 24;
    onPatch({ time: { timeOfDay: newTime } });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  // Speed presets.
  // 速度预设
  const speedPresets = [
    { label: "Paused", value: 0 },
    { label: "1x", value: 1 },
    { label: "60x", value: 60 },
    { label: "360x", value: 360 },
    { label: "1440x", value: 1440 },
  ];

  return (
    <div className="space-y-6">
      <div className="text-xs text-white/60 mb-4">
        Drag the shadow on the sundial to set time. Ancient Chinese sundial style.
      </div>

      {/* Sundial SVG */}
      <div className="flex justify-center">
        <div className="relative">
          <svg
            ref={svgRef}
            width="280"
            height="280"
            viewBox="0 0 280 280"
            className="select-none"
            style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
          >
            {/* Definitions */}
            <defs>
              {/* Sundial plate gradient (bronze-like) */}
              <radialGradient id="plateGradient" cx="50%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#d4a574" />
                <stop offset="50%" stopColor="#8b6914" />
                <stop offset="100%" stopColor="#4a3c1a" />
              </radialGradient>

              {/* Inner ring gradient */}
              <radialGradient id="innerGradient" cx="50%" cy="30%" r="60%">
                <stop offset="0%" stopColor="#c9a55c" />
                <stop offset="100%" stopColor="#6b5a2a" />
              </radialGradient>

              {/* Shadow gradient */}
              <linearGradient id="shadowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1a1a2e" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#2d2d44" stopOpacity="0.6" />
              </linearGradient>

              {/* Gnomon (vertical pin) gradient */}
              <linearGradient id="gnomonGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b7355" />
                <stop offset="50%" stopColor="#d4c4a8" />
                <stop offset="100%" stopColor="#6b5a3a" />
              </linearGradient>

              {/* Day/Night arc gradients */}
              <linearGradient id="dayGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#ffd700" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ff8c00" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="nightGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1a1a3e" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0a0a1e" stopOpacity="0.2" />
              </linearGradient>
            </defs>

            {/* Outer plate (bronze disc) */}
            <circle cx="140" cy="140" r="135" fill="url(#plateGradient)" stroke="#3d2f1a" strokeWidth="3" />

            {/* Decorative outer ring with engravings */}
            <circle cx="140" cy="140" r="128" fill="none" stroke="#5a4a2a" strokeWidth="1" />
            <circle cx="140" cy="140" r="120" fill="none" stroke="#5a4a2a" strokeWidth="2" />

            {/* Day section (top half - noon area) */}
            <path
              d="M 140 25 A 115 115 0 0 1 140 255"
              fill="url(#dayGradient)"
            />

            {/* Night section (bottom half - midnight area) */}
            <path
              d="M 140 25 A 115 115 0 0 0 140 255"
              fill="url(#nightGradient)"
            />

            {/* Inner decorative circle */}
            <circle cx="140" cy="140" r="105" fill="url(#innerGradient)" stroke="#4a3a1a" strokeWidth="2" />
            <circle cx="140" cy="140" r="95" fill="none" stroke="#3d2f1a" strokeWidth="1" />

            {/* Hour markings and Shichen labels */}
            {SHICHEN.map((shi) => {
              // Place character at middle hour of each Shichen.
              // e.g., 午时 (11-13) → 12:00, 未时 (13-15) → 14:00
              // 将汉字放在每个时辰的中间小时刻度上
              // 例如：午时(11-13) → 12:00，未时(13-15) → 14:00
              const hourAngle = ((shi.hour - 12) / 24) * 360 - 90;
              const angle = (hourAngle * Math.PI) / 180;

              // Label position (outer).
              // 标签位置（外圈）
              const labelR = 112;
              const labelX = 140 + labelR * Math.cos(angle);
              const labelY = 140 + labelR * Math.sin(angle);

              return (
                <g key={shi.name}>
                  {/* Shichen character at middle hour */}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#2a1f0a"
                    fontSize="14"
                    fontWeight="bold"
                    fontFamily="serif"
                    style={{ textShadow: "1px 1px 0 #c9a55c" }}
                  >
                    {shi.name}
                  </text>
                </g>
              );
            })}

            {/* Minor tick marks (24 hours) */}
            {Array.from({ length: 24 }).map((_, i) => {
              // Hour 12 is at top, hour 0 is at bottom.
              // 12点在顶部，0点在底部
              const hourAngle = ((i - 12) / 24) * 360 - 90;
              const angle = (hourAngle * Math.PI) / 180;
              const innerR = i % 2 === 0 ? 92 : 95;
              const outerR = 98;
              return (
                <line
                  key={`tick-${i}`}
                  x1={140 + innerR * Math.cos(angle)}
                  y1={140 + innerR * Math.sin(angle)}
                  x2={140 + outerR * Math.cos(angle)}
                  y2={140 + outerR * Math.sin(angle)}
                  stroke="#3d2f1a"
                  strokeWidth={i % 2 === 0 ? 1.5 : 1}
                />
              );
            })}

            {/* Center decorative pattern */}
            <circle cx="140" cy="140" r="25" fill="#3d2f1a" stroke="#5a4a2a" strokeWidth="2" />
            <circle cx="140" cy="140" r="18" fill="#4a3a1a" stroke="#6b5a2a" strokeWidth="1" />
            <circle cx="140" cy="140" r="8" fill="#c9a55c" stroke="#8b7a4a" strokeWidth="1" />

            {/* Gnomon shadow (draggable) */}
            <g
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* Shadow shape (triangular) */}
              <polygon
                points={`
                  ${140 + 8 * Math.cos(shadowAngle + Math.PI / 2)},${140 + 8 * Math.sin(shadowAngle + Math.PI / 2)}
                  ${140 + 8 * Math.cos(shadowAngle - Math.PI / 2)},${140 + 8 * Math.sin(shadowAngle - Math.PI / 2)}
                  ${140 + 85 * Math.cos(shadowAngle)},${140 + 85 * Math.sin(shadowAngle)}
                `}
                fill="url(#shadowGradient)"
                stroke="#0a0a1e"
                strokeWidth="1"
                opacity={isDragging ? 0.95 : 0.85}
                style={{ transition: isDragging ? "none" : "opacity 0.2s" }}
              />

              {/* Shadow tip indicator */}
              <circle
                cx={140 + 75 * Math.cos(shadowAngle)}
                cy={140 + 75 * Math.sin(shadowAngle)}
                r="6"
                fill="#2d2d44"
                stroke="#4a4a6a"
                strokeWidth="2"
                className={isDragging ? "" : "animate-pulse"}
              />
            </g>

            {/* Central gnomon (vertical pin representation) */}
            <ellipse cx="140" cy="140" rx="5" ry="5" fill="url(#gnomonGradient)" stroke="#4a3a2a" strokeWidth="1" />

            {/* Decorative compass directions (Chinese characters kept) */}
            <text x="140" y="18" textAnchor="middle" fill="#5a4a2a" fontSize="10" fontWeight="bold">南</text>
            <text x="140" y="270" textAnchor="middle" fill="#5a4a2a" fontSize="10" fontWeight="bold">北</text>
            <text x="268" y="144" textAnchor="middle" fill="#5a4a2a" fontSize="10" fontWeight="bold">西</text>
            <text x="12" y="144" textAnchor="middle" fill="#5a4a2a" fontSize="10" fontWeight="bold">東</text>
          </svg>

          {/* Current time overlay */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black/80 rounded-lg px-4 py-2 border border-white/20">
            <div className="text-center">
              <div className="text-2xl font-mono text-amber-400 font-bold">{formatTime(timeOfDay)}</div>
              <div className="text-sm text-amber-300/80 font-serif">
                {shichen.name}時 <span className="text-xs text-white/50">({shichen.pinyin})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Day period indicator */}
      <div className="text-center text-sm text-white/70 mt-8">
        {getDayPeriod(timeOfDay)}
      </div>

      {/* Time Controls */}
      <div className="space-y-4 mt-6">
        <div className="text-xs font-medium text-white/80 mb-3">Time Flow</div>

        {/* Pause toggle */}
        <Toggle
          label="Pause Time"
          checked={settings.time.timePaused}
          onChange={(v) => onPatch({ time: { timePaused: v } })}
        />

        {/* Time-driven sun toggle */}
        <Toggle
          label="Sun follows time"
          checked={settings.time.timeDrivenSun}
          onChange={(v) => onPatch({ time: { timeDrivenSun: v } })}
        />

        {/* Speed presets */}
        <div>
          <div className="text-xs text-white/60 mb-2">Speed Presets</div>
          <div className="flex flex-wrap gap-2">
            {speedPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onPatch({ time: { timeSpeed: preset.value, timePaused: preset.value === 0 } })}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  settings.time.timeSpeed === preset.value && !settings.time.timePaused
                    ? "bg-amber-600/30 border-amber-500/50 text-amber-300"
                    : preset.value === 0 && settings.time.timePaused
                      ? "bg-amber-600/30 border-amber-500/50 text-amber-300"
                      : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom speed slider */}
        <RangeField
          label="Time Speed Multiplier"
          value={settings.time.timeSpeed}
          min={0}
          max={3600}
          step={1}
          onChange={(v) => onPatch({ time: { timeSpeed: v } })}
        />
        <div className="text-xs text-white/40">
          {settings.time.timeSpeed === 0
            ? "Time is stopped."
            : settings.time.timeSpeed === 1
              ? "Real-time (1 second = 1 second)"
              : settings.time.timeSpeed < 60
                ? `1 real second = ${settings.time.timeSpeed} game seconds`
                : settings.time.timeSpeed < 3600
                  ? `1 real second = ${(settings.time.timeSpeed / 60).toFixed(1)} game minutes`
                  : `1 real second = ${(settings.time.timeSpeed / 3600).toFixed(1)} game hours`}
        </div>

        {/* Direct time input */}
        <RangeField
          label="Time of Day (hours)"
          value={timeOfDay}
          min={0}
          max={24}
          step={0.1}
          onChange={(v) => onPatch({ time: { timeOfDay: v % 24 } })}
        />
      </div>

      {/* Info about Shichen */}
      <div className="mt-6 p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="text-xs font-medium text-amber-400/80 mb-2">時辰 (Shíchén) - Traditional Chinese Hours</div>
        <div className="text-xs text-white/50 leading-relaxed">
          Ancient China divided the day into 12 two-hour periods called 時辰 (shíchén).
          Each period is named after one of the 12 Earthly Branches (地支).
          The current period is <span className="text-amber-300 font-bold">{shichen.name}時</span>.
        </div>
      </div>
    </div>
  );
}
