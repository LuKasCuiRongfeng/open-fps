// LoadingOverlay: compact desktop-style boot status surface.
// LoadingOverlay：紧凑桌面风格启动状态界面。

export type LoadingStep = {
  id: string;
  label: string;
};

type LoadingOverlayProps = {
  steps: LoadingStep[];
  activeStepId?: string;
  visible: boolean;
};

export default function LoadingOverlay({ steps, activeStepId, visible }: LoadingOverlayProps) {
  if (!visible) return null;

  const activeIndex = activeStepId
    ? Math.max(
        0,
        steps.findIndex((s) => s.id === activeStepId),
      )
    : 0;

  // EN: Progress follows the boot step list so editor and game startup share one status model.
  // 中文: 进度跟随启动步骤列表，使编辑器和游戏启动共用同一套状态模型。
  const progress = (activeIndex + 1) / Math.max(1, steps.length);

  return (
    <div className="app-root absolute inset-0 z-10 flex flex-col overflow-hidden">
      <header className="shell-surface flex h-9 shrink-0 items-center justify-between border-b border-stroke-subtle px-3 text-xs">
        <div className="font-semibold text-content-primary">Open FPS Runtime</div>
        <div className="font-mono text-[11px] text-content-muted">BOOT</div>
      </header>

      <main className="min-h-0 flex-1 p-3">
        <section className="overlay-panel w-full max-w-80 border shadow-panel backdrop-blur-sm">
          <header className="flex h-8 items-center justify-between border-b border-stroke-subtle px-2 text-xs">
            <span className="font-semibold text-content-primary">Startup</span>
            <span className="font-mono text-[11px] text-content-muted">{Math.round(progress * 100)}%</span>
          </header>

          <div className="h-1 bg-surface-panel-strong">
            <div
              className="h-full bg-accent-primary transition-all duration-300 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <ol className="divide-y divide-stroke-subtle text-xs">
            {steps.map((step, index) => {
              const complete = index < activeIndex;
              const active = index === activeIndex;

              return (
                <li key={step.id} className="flex min-h-7 items-center gap-2 px-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      complete || active ? "bg-accent-primary" : "bg-surface-panel-strong"
                    }`}
                  />
                  <span className={active ? "text-content-primary" : "text-content-muted"}>{step.label}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}
