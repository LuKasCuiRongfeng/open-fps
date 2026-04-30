// EN: AppearanceTab provides shared UI theme controls.
// 中文: AppearanceTab 提供共享 UI 主题控制。

import { Moon, Sun } from "lucide-react";
import type { GameSettings, GameSettingsPatch, UiTheme } from "@game/settings";

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
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Theme</div>
        <div className="text-xs text-content-muted">Applies to both editor and game UI.</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {THEME_OPTIONS.map(({ id, label, description, Icon }) => {
          const active = settings.ui.theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPatch({ ui: { theme: id } })}
              className={`flex items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                active
                  ? "border-accent-primary/60 bg-accent-primary/15 text-content-primary"
                  : "border-stroke-subtle bg-surface-control text-content-secondary hover:border-stroke-default hover:bg-surface-control-hover hover:text-content-primary"
              }`}
              aria-pressed={active}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-content-muted">{description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
