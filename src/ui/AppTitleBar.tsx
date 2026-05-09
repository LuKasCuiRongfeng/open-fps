// AppTitleBar: themed desktop window chrome shared by editor and game.
// AppTitleBar：编辑器和游戏共用的主题化桌面窗口标题栏。

import { useEffect, useState, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Copy, Minus, Square, X } from "lucide-react";
import { getPlatform } from "@/platform";
import { cn } from "@/lib/utils";

type AppTitleBarProps = {
    title: string;
    icon: LucideIcon;
};

type WindowActionButtonProps = {
    label: string;
    danger?: boolean;
    icon: LucideIcon;
    onClick: () => void;
};

const platform = getPlatform();

function runWindowAction(action: () => Promise<void>): void {
    action().catch((error: unknown) => {
        console.error("Window action failed", error);
    });
}

function WindowActionButton({ label, danger = false, icon, onClick }: WindowActionButtonProps) {
    const Icon = icon;

    return (
        <button
            type="button"
            className={cn(
                "flex h-9 w-11 items-center justify-center text-content-muted transition-colors hover:bg-surface-control-hover hover:text-content-primary focus-visible:focus-token",
                danger && "hover:bg-status-danger/20 hover:text-status-danger",
            )}
            title={label}
            aria-label={label}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
    );
}

export function AppTitleBar({ title, icon }: AppTitleBarProps) {
    const [maximized, setMaximized] = useState(false);

    useEffect(() => {
        if (platform.runtime !== "desktop") return;

        let disposed = false;

        runWindowAction(async () => {
            await platform.window.setDecorations(false);
            const nextMaximized = await platform.window.isMaximized();

            if (!disposed) {
                setMaximized(nextMaximized);
            }
        });

        return () => {
            disposed = true;
        };
    }, []);

    if (platform.runtime !== "desktop") return null;

    const TitleIcon = icon;

    function handleDragStart(event: MouseEvent<HTMLElement>): void {
        if (event.button !== 0) return;
        runWindowAction(() => platform.window.startDragging());
    }

    function handleToggleMaximize(): void {
        runWindowAction(async () => {
            await platform.window.toggleMaximize();
            setMaximized(await platform.window.isMaximized());
        });
    }

    const MaximizeIcon = maximized ? Copy : Square;
    const maximizeLabel = maximized ? "Restore" : "Maximize";

    return (
        <header
            className="shell-surface relative flex h-9 shrink-0 select-none items-center border-b border-stroke-subtle text-xs"
            onMouseDown={handleDragStart}
        >
            <div className="pointer-events-none absolute inset-0 flex min-w-0 items-center justify-center px-36">
                <div className="flex min-w-0 items-center gap-2 font-semibold text-content-primary">
                    <TitleIcon className="h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
                    <span className="truncate">{title}</span>
                </div>
            </div>

            <div className="ml-auto flex h-full shrink-0 items-center">
                <WindowActionButton
                    label="Minimize"
                    icon={Minus}
                    onClick={() => runWindowAction(() => platform.window.minimize())}
                />
                <WindowActionButton
                    label={maximizeLabel}
                    icon={MaximizeIcon}
                    onClick={handleToggleMaximize}
                />
                <WindowActionButton
                    label="Close"
                    icon={X}
                    danger
                    onClick={() => runWindowAction(() => platform.window.requestClose())}
                />
            </div>
        </header>
    );
}