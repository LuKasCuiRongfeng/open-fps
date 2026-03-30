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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />

      <div className="absolute left-1/2 top-6 w-[min(860px,calc(100vw-2rem))] -translate-x-1/2">
        <div className="rounded-xl border border-white/10 bg-black/70 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
            <div>
              <div className="text-sm font-semibold tracking-wide">{title}</div>
              <div className="text-xs text-white/60">{subtitle}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                type="button"
                onClick={onReset}
              >
                Reset
              </button>
              <button
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                type="button"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex max-h-[78vh] min-h-105">
            <div className="w-40 shrink-0 border-r border-white/10 p-3">
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