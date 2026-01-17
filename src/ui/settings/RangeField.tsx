// RangeField: reusable range slider with numeric input component.
// RangeField：可复用的范围滑块和数字输入组件

export type RangeFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export function RangeField({ label, value, min, max, step, onChange, disabled }: RangeFieldProps) {
  const id = `setting-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className={`grid grid-cols-[1fr_140px] items-center gap-3 ${disabled ? "opacity-50" : ""}`}>
      <label htmlFor={id} className="text-sm text-white/80">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={id}
          className="h-2 w-full cursor-pointer accent-white disabled:cursor-not-allowed"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
        />

        <input
          className="w-20 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-right text-xs tabular-nums text-white outline-none focus:border-white/30 disabled:cursor-not-allowed"
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
