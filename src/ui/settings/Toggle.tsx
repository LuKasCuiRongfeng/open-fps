// Toggle: reusable toggle switch component.
// Toggle：可复用的开关组件

import { SettingRow } from "./SettingsLayout";
import { Switch } from "@ui/components/ui/switch";

export type ToggleProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function Toggle({ label, description, checked, onChange, disabled }: ToggleProps) {
  return (
    <SettingRow label={label} description={description}>
      <div className="flex items-center gap-2">
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={label}
        />
        <span className="w-6 text-[11px] text-content-muted">{checked ? "On" : "Off"}</span>
      </div>
    </SettingRow>
  );
}
