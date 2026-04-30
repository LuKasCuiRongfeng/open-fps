// EN: Theme runtime utilities are shared by the editor and game shells.
// 中文: 主题运行时工具由编辑器和游戏外壳共享。

import { useEffect } from "react";
import type { UiTheme } from "@game/settings";

export const DEFAULT_UI_THEME: UiTheme = "dark";

export function normalizeUiTheme(theme: UiTheme | null | undefined): UiTheme {
  return theme === "light" ? "light" : DEFAULT_UI_THEME;
}

export function applyDocumentTheme(theme: UiTheme | null | undefined): void {
  if (typeof document === "undefined") return;

  const nextTheme = normalizeUiTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = nextTheme;
  root.classList.toggle("dark", nextTheme === "dark");
  root.style.colorScheme = nextTheme;
}

export function useDocumentTheme(theme: UiTheme | null | undefined): void {
  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);
}
