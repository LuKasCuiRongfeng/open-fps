// RangeField: reusable range slider with numeric input component.
// RangeField：可复用的范围滑块和数字输入组件

import { SettingRow } from "./SettingsLayout";
import { Input } from "@ui/components/ui/input";
import { Slider } from "@ui/components/ui/slider";

export type RangeFieldProps = {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "success" | "warning";
  valueLabel?: string;
};

export function RangeField({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  tone = "primary",
  valueLabel,
}: RangeFieldProps) {
  const id = `setting-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const numericValue = Number.isFinite(value) ? value : 0;

  return (
    <SettingRow label={label} description={description}>
      <div className="flex items-center gap-2">
        <Slider
          aria-label={label}
          className="min-w-0 flex-1"
          min={min}
          max={max}
          step={step}
          value={[numericValue]}
          tone={tone}
          onValueChange={([nextValue]) => onChange(nextValue ?? numericValue)}
          disabled={disabled}
        />

        <Input
          id={id}
          className="w-20 text-right tabular-nums"
          type="number"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
        />
        {valueLabel && <span className="w-10 text-right text-[11px] tabular-nums text-content-muted">{valueLabel}</span>}
      </div>
    </SettingRow>
  );
}
