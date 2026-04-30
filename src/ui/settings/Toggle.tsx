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
        className={`relative h-5 w-10 rounded-full border border-stroke-default transition-colors duration-200 ${
          checked ? "bg-accent-primary" : "bg-surface-panel-strong"
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
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface-panel shadow-md transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-xs text-content-muted">{label}</span>
    </label>
  );
}
