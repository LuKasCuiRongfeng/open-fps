import { normalizeAssetPath } from "./pathUtils";

type TauriCore = typeof import("@tauri-apps/api/core");

let coreModule: Promise<TauriCore> | null = null;

function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function loadCore(): Promise<TauriCore> {
  coreModule ??= import("@tauri-apps/api/core");
  return coreModule;
}

export async function resolveAssetUrl(path: string): Promise<string> {
  if (/^[a-z]+:\/\//i.test(path)) {
    return path;
  }

  if (!isDesktopRuntime()) {
    return path;
  }

  const { convertFileSrc } = await loadCore();
  return convertFileSrc(normalizeAssetPath(path));
}