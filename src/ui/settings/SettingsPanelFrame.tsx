import type { ReactNode } from "react";
import { RotateCcw, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import { TabButton } from "./TabButton";

export type SettingsPanelTab<TTab extends string> = {
  id: TTab;
  label: string;
  Icon?: LucideIcon;
};

type SettingsPanelFrameProps<TTab extends string> = {
  open: boolean;
  title: string;
  subtitle: string;
  tabs: ReadonlyArray<SettingsPanelTab<TTab>>;
  activeTab: TTab;
  variant?: "modal" | "sidebar";
  onTabChange: (tab: TTab) => void;
  onReset: () => void;
  onClose: () => void;
  children: ReactNode;
};

export function SettingsPanelFrame<TTab extends string>({
  open,
  title,
  subtitle,
  tabs,
  activeTab,
  variant = "modal",
  onTabChange,
  onReset,
  onClose,
  children,
}: SettingsPanelFrameProps<TTab>) {
  if (!open) return null;

  const activeEntry = tabs.find((tab) => tab.id === activeTab);

  if (variant === "sidebar") {
    const ActiveIcon = activeEntry?.Icon;

    return (
      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="pointer-events-auto absolute inset-y-0 left-0 flex w-full max-w-3xl border-r border-stroke-subtle shadow-elevated backdrop-blur-sm">
          <aside className="shell-surface flex w-44 shrink-0 flex-col border-r border-stroke-subtle">
            <header className="flex h-10 shrink-0 items-center border-b border-stroke-subtle px-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold tracking-wide text-content-primary">{title}</div>
                <div className="truncate text-[11px] text-content-muted">{subtitle}</div>
              </div>
            </header>

            <nav className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="space-y-1">
                {tabs.map((tab) => (
                  <TabButton
                    key={tab.id}
                    active={activeTab === tab.id}
                    label={tab.label}
                    Icon={tab.Icon}
                    variant="sidebar"
                    onClick={() => onTabChange(tab.id)}
                  />
                ))}
              </div>
            </nav>

            <footer className="flex shrink-0 items-center gap-1 border-t border-stroke-subtle p-2">
              <Button
                type="button"
                size="sm"
                className="flex-1 text-[11px]"
                title="Reset settings"
                onClick={onReset}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </Button>
              <Button
                type="button"
                size="icon"
                title="Close settings"
                aria-label="Close settings"
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </footer>
          </aside>

          <section className="overlay-panel flex min-w-0 flex-1 flex-col border-0">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-stroke-subtle px-3 text-xs font-semibold text-content-primary">
              {ActiveIcon && <ActiveIcon className="h-3.5 w-3.5 text-accent-primary" aria-hidden="true" />}
              <span className="truncate">{activeEntry?.label ?? title}</span>
            </header>

            <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20">
      <div
        className="overlay-scrim absolute inset-0 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />

      <div className="absolute left-1/2 top-6 w-[min(860px,calc(100vw-2rem))] -translate-x-1/2">
        <div className="overlay-panel rounded-xl border shadow-elevated backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4 border-b border-stroke-subtle p-4">
            <div>
              <div className="text-sm font-semibold tracking-wide">{title}</div>
              <div className="text-xs text-content-muted">{subtitle}</div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={onReset}
              >
                Reset
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>

          <div className="flex max-h-[78vh] min-h-105">
            <div className="w-40 shrink-0 border-r border-stroke-subtle p-3">
              <div className="space-y-1.5">
                {tabs.map((tab) => (
                  <TabButton
                    key={tab.id}
                    active={activeTab === tab.id}
                    label={tab.label}
                    Icon={tab.Icon}
                    onClick={() => onTabChange(tab.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}