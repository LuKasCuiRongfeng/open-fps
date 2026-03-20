import type {
  PlatformBridge,
  PlatformCloseRequest,
  PlatformOpenDialogOptions,
  PlatformSaveDialogOptions,
} from "./types";

export function createDesktopBridge(): PlatformBridge {
  return {
    runtime: "desktop",

    async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<T>(command, args);
    },

    async openDialog(options: PlatformOpenDialogOptions): Promise<string | null> {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open(options);
      return typeof result === "string" ? result : null;
    },

    async saveDialog(options: PlatformSaveDialogOptions): Promise<string | null> {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const result = await save(options);
      return typeof result === "string" ? result : null;
    },

    async readTextFile(path: string): Promise<string> {
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      return readTextFile(path);
    },

    async writeTextFile(path: string, content: string): Promise<void> {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(path, content);
    },

    async renamePath(oldPath: string, newPath: string): Promise<void> {
      const { rename } = await import("@tauri-apps/plugin-fs");
      await rename(oldPath, newPath);
    },

    async ask(message: string, options): Promise<boolean> {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      return ask(message, options);
    },

    async message(message: string, options): Promise<void> {
      const { message: showMessage } = await import("@tauri-apps/plugin-dialog");
      await showMessage(message, options);
    },

    async resolveAssetUrl(path: string): Promise<string> {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      return convertFileSrc(path);
    },

    async onCloseRequested(
      handler: (event: PlatformCloseRequest) => void | Promise<void>,
    ): Promise<() => void> {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const windowHandle = getCurrentWindow();
      return windowHandle.onCloseRequested(handler);
    },

    async closeWindow(): Promise<void> {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    },
  };
}