// TabButton: settings panel tab button component.
// TabButton：设置面板标签按钮组件

import type { LucideIcon } from "lucide-react";

type TabButtonProps = {
  active: boolean;
  label: string;
  Icon?: LucideIcon;
  variant?: "modal" | "sidebar";
  onClick: () => void;
};

export function TabButton({ active, label, Icon, variant = "modal", onClick }: TabButtonProps) {
  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={
          active
            ? "flex h-8 shrink-0 items-center gap-2 rounded-md border border-accent-primary/45 bg-accent-primary/15 px-2.5 text-left text-xs font-medium text-content-primary sm:w-full"
            : "flex h-8 shrink-0 items-center gap-2 rounded-md border border-transparent bg-transparent px-2.5 text-left text-xs text-content-muted transition-colors hover:bg-surface-control-hover hover:text-content-primary sm:w-full"
        }
      >
        {Icon && (
          <Icon
            className={`h-3.5 w-3.5 shrink-0 ${active ? "text-accent-primary" : "text-content-muted"}`}
            aria-hidden="true"
          />
        )}
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "w-full rounded-md border border-accent-primary/45 bg-accent-primary/15 px-3 py-2 text-left text-xs text-content-primary"
          : "w-full rounded-md border border-transparent bg-transparent px-3 py-2 text-left text-xs text-content-muted transition-colors hover:bg-surface-control-hover hover:text-content-primary"
      }
    >
      {Icon && <Icon className="mr-2 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />}
      {label}
    </button>
  );
}
