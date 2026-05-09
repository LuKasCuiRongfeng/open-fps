// LoadingOverlay: compact desktop-style boot status surface.
// LoadingOverlay：紧凑桌面风格启动状态界面。

import { cn } from "@/lib/utils";

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
            steps.findIndex((step) => step.id === activeStepId),
        )
        : 0;

    // EN: Progress follows the boot step list so editor and game startup share one status model.
    // 中文: 进度跟随启动步骤列表，使编辑器和游戏启动共用同一套状态模型。
    const progress = (activeIndex + 1) / Math.max(1, steps.length);
    const progressPercent = Math.round(progress * 100);

    return (
        <div className="app-root absolute inset-0 z-10 flex flex-col overflow-hidden">
            <header className="shell-surface flex h-9 shrink-0 items-center justify-between border-b border-stroke-subtle px-3 text-xs">
                <div className="font-semibold text-content-primary">Open FPS Runtime</div>
                <div className="font-mono text-[11px] text-content-muted">BOOT</div>
            </header>

            <main className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
                <section className="overlay-panel w-full max-w-md border shadow-elevated backdrop-blur-sm">
                    <header className="border-b border-stroke-subtle px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-content-primary">Startup</span>
                            <span className="font-mono text-[11px] text-content-muted">{progressPercent}%</span>
                        </div>

                        <div
                            className="mt-2 h-1.5 bg-surface-panel-strong"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progressPercent}
                        >
                            <div
                                className="h-full bg-accent-primary transition-all duration-300 ease-out"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </header>

                    <ol className="space-y-1 p-2 text-xs">
                        {steps.map((step, index) => {
                            const complete = index < activeIndex;
                            const active = index === activeIndex;

                            return (
                                <li
                                    key={step.id}
                                    className={cn(
                                        "grid min-h-8 grid-cols-[0.75rem_1fr_auto] items-center gap-2 border border-transparent px-2",
                                        active && "panel-muted-surface border-stroke-subtle",
                                    )}
                                    aria-current={active ? "step" : undefined}
                                >
                                    <span
                                        className={cn(
                                            "h-2 w-2 shrink-0 rounded-full",
                                            complete || active ? "bg-accent-primary" : "bg-surface-panel-strong",
                                        )}
                                    />
                                    <span className={active ? "font-semibold text-content-primary" : "text-content-muted"}>
                                        {step.label}
                                    </span>
                                    <span
                                        className={cn(
                                            "font-mono text-[10px]",
                                            active ? "text-accent-primary" : "text-content-disabled",
                                        )}
                                    >
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            </main>
        </div>
    );
}
