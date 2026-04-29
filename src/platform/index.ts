import { createBrowserPlatform } from "./browserBridge";
import { createDesktopPlatform } from "./desktopBridge";
import type { PlatformHost } from "./types";

let cachedPlatform: PlatformHost | null = null;

function isDesktopRuntime(): boolean {
    // EN: Tauri injects this marker only in desktop windows, keeping native imports behind the desktop platform.
    // 中文: Tauri 只会在桌面窗口注入该标记，从而把原生导入隔离在桌面平台实现内。
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getPlatform(): PlatformHost {
    cachedPlatform ??= isDesktopRuntime() ? createDesktopPlatform() : createBrowserPlatform();
    return cachedPlatform;
}

export function resetPlatformForTesting(platform: PlatformHost | null = null): void {
    cachedPlatform = platform;
}

export * from "./types";
