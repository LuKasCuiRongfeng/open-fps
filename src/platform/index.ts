import { createBrowserBridge } from "./browserBridge";
import { createDesktopBridge } from "./desktopBridge";
import type { PlatformBridge } from "./types";

let cachedBridge: PlatformBridge | null = null;

function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getPlatformBridge(): PlatformBridge {
  if (!cachedBridge) {
    cachedBridge = isDesktopRuntime() ? createDesktopBridge() : createBrowserBridge();
  }

  return cachedBridge;
}

export * from "./types";