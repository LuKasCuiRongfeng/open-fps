// DebugTab: runtime diagnostics and world overlay controls.
// DebugTab：运行时诊断与世界覆盖层控制。

import type { GameSettings, GameSettingsPatch } from "@game/settings";
import { Toggle } from "../Toggle";
import { SettingsPage, SettingsSection } from "../SettingsLayout";

type DebugTabProps = {
  settings: GameSettings;
  onPatch: (patch: GameSettingsPatch) => void;
};

export function DebugTab({ settings, onPatch }: DebugTabProps) {
  return (
    <SettingsPage>
      <SettingsSection title="World Partition">
        <Toggle
          label="Collision Overlay"
          description="Loaded collision shapes"
          checked={settings.debug.showCollisionOverlay}
          onChange={(value) => onPatch({ debug: { showCollisionOverlay: value } })}
        />
        <Toggle
          label="Nav Overlay"
          description="Loaded AI nav nodes and portals"
          checked={settings.debug.showNavOverlay}
          onChange={(value) => onPatch({ debug: { showNavOverlay: value } })}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
