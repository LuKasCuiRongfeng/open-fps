// Toggle: reusable toggle switch component.
// Toggle：可复用的开关组件

export type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className={`flex items-center gap-3 cursor-pointer select-none ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div
        className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
          checked ? "bg-blue-500" : "bg-white/20"
        } ${disabled ? "cursor-not-allowed" : ""}`}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        role="switch"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-xs text-white/70">{label}</span>
    </label>
  );
}
