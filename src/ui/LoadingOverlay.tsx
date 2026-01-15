export type LoadingStep = {
  id: string;
  label: string;
};

type LoadingOverlayProps = {
  title: string;
  steps: LoadingStep[];
  activeStepId?: string;
  visible: boolean;
};

export default function LoadingOverlay({ title, steps, activeStepId, visible }: LoadingOverlayProps) {
  if (!visible) return null;

  const activeIndex = activeStepId
    ? Math.max(
        0,
        steps.findIndex((s) => s.id === activeStepId),
      )
    : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="w-[min(520px,calc(100vw-2rem))] rounded-xl border border-white/10 bg-black/70 p-5 text-white shadow-2xl backdrop-blur-sm">
        <div className="mb-3 text-sm font-semibold tracking-wide">{title}</div>

        <div className="space-y-1.5 text-xs text-white/75">
          {steps.map((s, i) => {
            const status = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
            return (
              <div
                key={s.id}
                className={
                  status === "active"
                    ? "text-white"
                    : status === "done"
                      ? "text-white/70"
                      : "text-white/40"
                }
              >
                {status === "done" ? "•" : status === "active" ? "›" : "·"} {s.label}
              </div>
            );
          })}
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded bg-white/10">
          <div
            className="h-full bg-white/60"
            style={{ width: `${((activeIndex + 1) / Math.max(1, steps.length)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
