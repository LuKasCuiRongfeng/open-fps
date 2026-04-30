import type { ReactNode } from "react";
import { TabButton } from "./TabButton";

type SettingsPanelFrameProps<TTab extends string> = {
  open: boolean;
  title: string;
  subtitle: string;
  tabs: ReadonlyArray<{ id: TTab; label: string }>;
  activeTab: TTab;
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
  onTabChange,
  onReset,
  onClose,
  children,
}: SettingsPanelFrameProps<TTab>) {
  if (!open) return null;

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
              <button
                className="rounded-md border border-stroke-default bg-surface-control px-3 py-1.5 text-xs text-content-secondary transition-colors hover:bg-surface-control-hover hover:text-content-primary"
                type="button"
                onClick={onReset}
              >
                Reset
              </button>
              <button
                className="rounded-md border border-stroke-default bg-surface-control px-3 py-1.5 text-xs text-content-secondary transition-colors hover:bg-surface-control-hover hover:text-content-primary"
                type="button"
                onClick={onClose}
              >
                Close
              </button>
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