import type {
  PlatformCapability,
  PlatformCloseRequest,
  PlatformHost,
  PlatformOpenFileOptions,
  PlatformOpenFolderOptions,
  PlatformPngRgbaData,
  PlatformSaveFileOptions,
} from "./types";
import { normalizeAssetPath } from "./pathUtils";

type TauriCore = typeof import("@tauri-apps/api/core");
type TauriDialog = typeof import("@tauri-apps/plugin-dialog");
type TauriFs = typeof import("@tauri-apps/plugin-fs");
type TauriWindow = typeof import("@tauri-apps/api/window");

const DESKTOP_CAPABILITIES = new Set<PlatformCapability>([
  "projectWorkspace",
  "fileImportExport",
  "assetUrlResolution",
  "windowCloseControl",
  "pngRgbaCodec",
]);

let coreModule: Promise<TauriCore> | null = null;
let dialogModule: Promise<TauriDialog> | null = null;
let fsModule: Promise<TauriFs> | null = null;
let windowModule: Promise<TauriWindow> | null = null;

function loadCore(): Promise<TauriCore> {
  coreModule ??= import("@tauri-apps/api/core");
  return coreModule;
}

function loadDialog(): Promise<TauriDialog> {
  dialogModule ??= import("@tauri-apps/plugin-dialog");
  return dialogModule;
}

function loadFs(): Promise<TauriFs> {
  fsModule ??= import("@tauri-apps/plugin-fs");
  return fsModule;
}

function loadWindow(): Promise<TauriWindow> {
  windowModule ??= import("@tauri-apps/api/window");
  return windowModule;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  // EN: Native command names stay private here so app code depends on capabilities, not Tauri wiring.
  // 中文: 原生命令名只保留在这里，应用代码依赖能力接口而不是 Tauri 接线细节。
  const { invoke } = await loadCore();
  return invoke<T>(command, args);
}

function singlePath(result: string | string[] | null): string | null {
  return typeof result === "string" ? result : null;
}

export function createDesktopPlatform(): PlatformHost {
  return {
    runtime: "desktop",

    hasCapability(capability: PlatformCapability): boolean {
      return DESKTOP_CAPABILITIES.has(capability);
    },

    dialogs: {
      async openFile(options: PlatformOpenFileOptions): Promise<string | null> {
        const { open } = await loadDialog();
        return singlePath(await open({ ...options, directory: false, multiple: false }));
      },

      async openFolder(options: PlatformOpenFolderOptions): Promise<string | null> {
        const { open } = await loadDialog();
        return singlePath(await open({ ...options, directory: true, multiple: false }));
      },

      async saveFile(options: PlatformSaveFileOptions): Promise<string | null> {
        const { save } = await loadDialog();
        return save(options);
      },

      async confirm(message: string, options): Promise<boolean> {
        const { ask } = await loadDialog();
        return ask(message, options);
      },

      async notify(message: string, options): Promise<void> {
        const { message: showMessage } = await loadDialog();
        await showMessage(message, options);
      },
    },

    files: {
      async readText(path: string): Promise<string> {
        const { readTextFile } = await loadFs();
        return readTextFile(path);
      },

      async writeText(path: string, content: string): Promise<void> {
        await invokeCommand<void>("write_text_file", { path, content });
      },

      async deleteFile(path: string): Promise<void> {
        await invokeCommand<void>("delete_file", { path });
      },

      async rename(oldPath: string, newPath: string): Promise<void> {
        const { rename } = await loadFs();
        await rename(oldPath, newPath);
      },

      async readBinaryBase64(path: string): Promise<string> {
        return invokeCommand<string>("read_binary_file_base64", { path });
      },

      async writeBinaryBase64(path: string, base64: string): Promise<void> {
        await invokeCommand<void>("write_binary_file_base64", { path, base64 });
      },

      async readPngRgba(path: string): Promise<PlatformPngRgbaData> {
        const [base64Pixels, width, height] = await invokeCommand<[string, number, number]>(
          "read_png_rgba",
          { path },
        );
        return { base64Pixels, width, height };
      },

      async writePngRgba(path: string, data: PlatformPngRgbaData): Promise<void> {
        await invokeCommand<void>("write_png_rgba", {
          path,
          base64Pixels: data.base64Pixels,
          width: data.width,
          height: data.height,
        });
      },

      async resolveAssetUrl(path: string): Promise<string> {
        const { convertFileSrc } = await loadCore();
        return convertFileSrc(normalizeAssetPath(path));
      },
    },

    projects: {
      isValidProject(projectPath: string): Promise<boolean> {
        return invokeCommand<boolean>("is_valid_project", { projectPath });
      },

      createProject(projectPath: string, metadata: string): Promise<void> {
        return invokeCommand<void>("create_project", { projectPath, metadata });
      },

      renameProject(oldPath: string, newName: string): Promise<string> {
        return invokeCommand<string>("rename_project", { oldPath, newName });
      },

      readMetadata(projectPath: string): Promise<string> {
        return invokeCommand<string>("read_project_metadata", { projectPath });
      },

      saveMetadata(projectPath: string, data: string): Promise<void> {
        return invokeCommand<void>("save_project_metadata", { projectPath, data });
      },

      readMapManifest(projectPath: string, mapId: string): Promise<string> {
        return invokeCommand<string>("read_project_map_manifest", { projectPath, mapId });
      },

      saveMapManifest(projectPath: string, mapId: string, data: string): Promise<void> {
        return invokeCommand<void>("save_project_map_manifest", { projectPath, mapId, data });
      },

      readMapChunk(projectPath: string, mapId: string, chunkPath: string): Promise<string> {
        return invokeCommand<string>("read_project_map_chunk_base64", { projectPath, mapId, chunkPath });
      },

      saveMapChunk(projectPath: string, mapId: string, chunkPath: string, base64: string): Promise<void> {
        return invokeCommand<void>("save_project_map_chunk_base64", { projectPath, mapId, chunkPath, base64 });
      },

      readSettings(projectPath: string): Promise<string> {
        return invokeCommand<string>("read_project_settings", { projectPath });
      },

      saveSettings(projectPath: string, data: string): Promise<void> {
        return invokeCommand<void>("save_project_settings", { projectPath, data });
      },

      listRecentProjects(): Promise<string[]> {
        return invokeCommand<string[]>("list_recent_projects");
      },

      addRecentProject(projectPath: string): Promise<void> {
        return invokeCommand<void>("add_recent_project", { projectPath });
      },

      removeRecentProject(projectPath: string): Promise<void> {
        return invokeCommand<void>("remove_recent_project", { projectPath });
      },
    },

    window: {
      async onCloseRequested(
        handler: (event: PlatformCloseRequest) => void | Promise<void>,
      ): Promise<() => void> {
        const { getCurrentWindow } = await loadWindow();
        return getCurrentWindow().onCloseRequested(handler);
      },

      async requestClose(): Promise<void> {
        const { getCurrentWindow } = await loadWindow();
        await getCurrentWindow().close();
      },

      async close(): Promise<void> {
        const { getCurrentWindow } = await loadWindow();
        await getCurrentWindow().destroy();
      },

      async isMaximized(): Promise<boolean> {
        const { getCurrentWindow } = await loadWindow();
        return getCurrentWindow().isMaximized();
      },

      async minimize(): Promise<void> {
        const { getCurrentWindow } = await loadWindow();
        await getCurrentWindow().minimize();
      },

      async toggleMaximize(): Promise<void> {
        const { getCurrentWindow } = await loadWindow();
        await getCurrentWindow().toggleMaximize();
      },

      async startDragging(): Promise<void> {
        const { getCurrentWindow } = await loadWindow();
        await getCurrentWindow().startDragging();
      },

      async setDecorations(visible: boolean): Promise<void> {
        const { getCurrentWindow } = await loadWindow();
        await getCurrentWindow().setDecorations(visible);
      },
    },
  };
}
