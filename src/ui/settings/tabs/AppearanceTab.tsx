// EN: AppearanceTab provides shared UI theme controls.
// 中文: AppearanceTab 提供共享 UI 主题控制。

import { Moon, Sun } from "lucide-react";
import type { GameSettings, GameSettingsPatch, UiTheme } from "@game/settings";
import { SettingBadge, SettingRow, SettingsPage, SettingsSection } from "../SettingsLayout";

type AppearanceTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

const THEME_OPTIONS: ReadonlyArray<{
  id: UiTheme;
  label: string;
  description: string;
  Icon: typeof Moon;
}> = [
  { id: "dark", label: "Dark", description: "Compact editor contrast", Icon: Moon },
  { id: "light", label: "Light", description: "Bright workspace surfaces", Icon: Sun },
];

export function AppearanceTab({ settings, onPatch }: AppearanceTabProps) {
  return (
    <SettingsPage>
      <SettingsSection title="Interface" description="Shared shell appearance for editor and game UI.">
        <SettingRow label="Theme" description="Switches semantic surface, content, stroke, and status tokens.">
          <div className="grid gap-2 sm:grid-cols-2">
            {THEME_OPTIONS.map(({ id, label, description, Icon }) => {
              const active = settings.ui.theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPatch({ ui: { theme: id } })}
                  className={`flex min-h-14 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "border-accent-primary/60 bg-accent-primary/15 text-content-primary"
                      : "border-stroke-subtle bg-surface-control text-content-secondary hover:border-stroke-default hover:bg-surface-control-hover hover:text-content-primary"
                  }`}
                  aria-pressed={active}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-accent-primary" : "text-content-muted"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-xs font-medium">
                      {label}
                      {active && <SettingBadge tone="primary">Active</SettingBadge>}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-content-muted">{description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}
