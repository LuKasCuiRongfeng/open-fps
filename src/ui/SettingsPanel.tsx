import { useState } from "react";
import { inputConfig } from "../config/input";
import type { GameSettings, GameSettingsPatch } from "../game/settings/GameSettings";

type RangeFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function RangeField({ label, value, min, max, step, onChange }: RangeFieldProps) {
  const id = `setting-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="grid grid-cols-[1fr_140px] items-center gap-3">
      <label htmlFor={id} className="text-sm text-white/80">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={id}
          className="h-2 w-full cursor-pointer accent-white"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />

        <input
          className="w-20 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-right text-xs tabular-nums text-white outline-none focus:border-white/30"
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

const TABS = [
  { id: "help", label: "Help" },
  { id: "render", label: "Render" },
  { id: "camera", label: "Camera" },
  { id: "movement", label: "Movement" },
  { id: "physics", label: "Physics" },
  { id: "thirdPerson", label: "3rd Person" },
] as const;

type SettingsTabId = (typeof TABS)[number]["id"];

function keyLabelFromCode(code: string) {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code;
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-left text-xs text-white"
          : "w-full rounded-md border border-transparent bg-transparent px-3 py-2 text-left text-xs text-white/70 hover:bg-white/5 hover:text-white"
      }
    >
      {label}
    </button>
  );
}

type SettingsPanelProps = {
  open: boolean;
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
};

export default function SettingsPanel({
  open,
  settings,
  onPatch,
  onReset,
  onClose,
}: SettingsPanelProps) {
  if (!open) return null;

  const [tab, setTab] = useState<SettingsTabId>("help");

  return (
    <div className="absolute inset-0 z-20">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />

      <div className="absolute left-1/2 top-6 w-[min(860px,calc(100vw-2rem))] -translate-x-1/2">
        <div className="rounded-xl border border-white/10 bg-black/70 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
            <div>
              <div className="text-sm font-semibold tracking-wide">Settings</div>
              <div className="text-xs text-white/60">Applies immediately</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                type="button"
                onClick={() => {
                  onReset();
                }}
              >
                Reset
              </button>
              <button
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                type="button"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex max-h-[78vh] min-h-[420px]">
            <div className="w-40 shrink-0 border-r border-white/10 p-3">
              <div className="space-y-1.5">
                {TABS.map((t) => (
                  <TabButton
                    key={t.id}
                    active={tab === t.id}
                    label={t.label}
                    onClick={() => setTab(t.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
            {tab === "help" ? (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-semibold">Controls</div>
                  <div className="mt-2 space-y-1.5 text-sm text-white/75">
                    <div>Click the game view to lock pointer.</div>
                    <div>WASD / Arrow keys: Move</div>
                    <div>Shift: Sprint</div>
                    <div>Space: Jump</div>
                    <div>
                      {keyLabelFromCode(inputConfig.toggleCameraMode.code)}: Toggle 1st / 3rd person
                    </div>
                    <div>
                      {keyLabelFromCode(inputConfig.toggleThirdPersonStyle.code)}: Toggle OTS / Chase
                    </div>
                    <div>Escape: Open/Close Settings</div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold">Notes</div>
                  <div className="mt-2 space-y-1.5 text-sm text-white/75">
                    <div>Settings apply immediately.</div>
                    <div>Reset restores default values.</div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "render" ? (
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
            ) : null}

            {tab === "camera" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="FOV (degrees)"
                  value={settings.camera.fovDegrees}
                  min={40}
                  max={110}
                  step={1}
                  onChange={(v) => onPatch({ camera: { fovDegrees: v } })}
                />
              </div>
            ) : null}

            {tab === "movement" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="Mouse Sensitivity"
                  value={settings.player.mouseSensitivity}
                  min={0.05}
                  max={5}
                  step={0.01}
                  onChange={(v) => onPatch({ player: { mouseSensitivity: v } })}
                />
                <RangeField
                  label="Move Speed (m/s)"
                  value={settings.player.moveSpeed}
                  min={0.5}
                  max={20}
                  step={0.1}
                  onChange={(v) => onPatch({ player: { moveSpeed: v } })}
                />
                <RangeField
                  label="Sprint Speed (m/s)"
                  value={settings.player.sprintSpeed}
                  min={0.5}
                  max={30}
                  step={0.1}
                  onChange={(v) => onPatch({ player: { sprintSpeed: v } })}
                />
              </div>
            ) : null}

            {tab === "physics" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <RangeField
                  label="Jump Velocity (m/s)"
                  value={settings.player.jumpVelocity}
                  min={0.5}
                  max={20}
                  step={0.1}
                  onChange={(v) => onPatch({ player: { jumpVelocity: v } })}
                />
                <RangeField
                  label="Gravity (m/s²)"
                  value={settings.player.gravity}
                  min={0}
                  max={60}
                  step={0.1}
                  onChange={(v) => onPatch({ player: { gravity: v } })}
                />
                <RangeField
                  label="Max Fall Speed (m/s)"
                  value={settings.player.maxFallSpeed}
                  min={1}
                  max={120}
                  step={1}
                  onChange={(v) => onPatch({ player: { maxFallSpeed: v } })}
                />
              </div>
            ) : null}

            {tab === "thirdPerson" ? (
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
                    onChange={(v) => onPatch({ player: { thirdPerson: { chase: { heightOffset: v } } } })}
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
            ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
