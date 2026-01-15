// Loading overlay with shadcn/ui style.
// shadcn/ui 风格的加载界面

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

  // Progress from 0 to 1 based on current step.
  // 基于当前步骤计算进度 0~1
  const progress = (activeIndex + 1) / Math.max(1, steps.length);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-950">
      <div className="flex w-80 flex-col items-center gap-6">
        {/* Title / 标题 */}
        <h1 className="text-lg font-medium tracking-tight text-zinc-50">
          Loading...
        </h1>

        {/* Progress bar (shadcn/ui style) / 进度条（shadcn/ui 风格） */}
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-zinc-50 transition-all duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* Current step / 当前步骤 */}
        <p className="text-sm text-zinc-400">
          {steps[activeIndex]?.label ?? "Initializing"}
        </p>
      </div>
    </div>
  );
}
