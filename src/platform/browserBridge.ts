import type {
  PlatformCapability,
  PlatformCloseRequest,
  PlatformConfirmOptions,
  PlatformHost,
  PlatformNotifyOptions,
  PlatformOpenFileOptions,
  PlatformPngRgbaData,
  PlatformSaveFileOptions,
} from "./types";

const BROWSER_FILE_PREFIX = "browser-file://";
const BROWSER_DOWNLOAD_PREFIX = "browser-download://";

const BROWSER_CAPABILITIES = new Set<PlatformCapability>([
  "fileImportExport",
  "assetUrlResolution",
  "windowCloseControl",
]);

const browserFiles = new Map<string, File>();
let browserFileSequence = 0;

// EN: Browser dialogs use pseudo paths so higher layers can keep one path-oriented storage flow.
// 中文: 浏览器对话框使用伪路径，让上层保持统一的路径式存储流程。

function unsupported(feature: string): never {
  throw new Error(`${feature} is not available in the browser runtime.`);
}

function formatPrompt(message: string, title?: string): string {
  return title ? `${title}\n\n${message}` : message;
}

function fileAcceptValue(options: PlatformOpenFileOptions): string | undefined {
  const extensions = options.filters?.flatMap((filter) => filter.extensions) ?? [];
  if (extensions.length === 0) {
    return undefined;
  }

  return extensions
    .map((extension) => extension.startsWith(".") ? extension : `.${extension}`)
    .join(",");
}

function storeBrowserFile(file: File): string {
  const path = `${BROWSER_FILE_PREFIX}${browserFileSequence}/${encodeURIComponent(file.name)}`;
  browserFileSequence += 1;
  browserFiles.set(path, file);
  return path;
}

function downloadFileName(path: string): string {
  const encoded = path.slice(BROWSER_DOWNLOAD_PREFIX.length);
  return decodeURIComponent(encoded) || "download.txt";
}

function defaultSaveFileName(options: PlatformSaveFileOptions): string {
  const fallback = "download.txt";
  if (!options.defaultPath) {
    return fallback;
  }

  const normalized = options.defaultPath.replace(/\\/g, "/");
  return normalized.split("/").pop() || fallback;
}

function openBrowserFile(options: PlatformOpenFileOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = fileAcceptValue(options) ?? "";
    input.style.display = "none";

    let settled = false;
    const cleanup = (path: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
      resolve(path);
    };

    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files || input.files.length === 0) {
          cleanup(null);
        }
      }, 0);
    };

    input.addEventListener("change", () => {
      const file = input.files?.item(0) ?? null;
      cleanup(file ? storeBrowserFile(file) : null);
    }, { once: true });

    window.addEventListener("focus", onWindowFocus);
    document.body.append(input);
    input.click();
  });
}

async function fetchBlob(path: string): Promise<Blob> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch '${path}': ${response.status}`);
  }

  return response.blob();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read binary data"));
        return;
      }

      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read binary data")));
    reader.readAsDataURL(blob);
  });
}

function downloadText(path: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadFileName(path);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createBrowserPlatform(): PlatformHost {
  return {
    runtime: "browser",

    hasCapability(capability: PlatformCapability): boolean {
      return BROWSER_CAPABILITIES.has(capability);
    },

    dialogs: {
      openFile: openBrowserFile,

      async openFolder(): Promise<string | null> {
        unsupported("Project folder selection");
      },

      async saveFile(options: PlatformSaveFileOptions): Promise<string | null> {
        return `${BROWSER_DOWNLOAD_PREFIX}${encodeURIComponent(defaultSaveFileName(options))}`;
      },

      async confirm(message: string, options?: PlatformConfirmOptions): Promise<boolean> {
        return window.confirm(formatPrompt(message, options?.title));
      },

      async notify(message: string, options?: PlatformNotifyOptions): Promise<void> {
        window.alert(formatPrompt(message, options?.title));
      },
    },

    files: {
      async readText(path: string): Promise<string> {
        const file = browserFiles.get(path);
        if (file) {
          return file.text();
        }

        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`Failed to fetch '${path}': ${response.status}`);
        }

        return response.text();
      },

      async writeText(path: string, content: string): Promise<void> {
        if (path.startsWith(BROWSER_DOWNLOAD_PREFIX)) {
          downloadText(path, content);
          return;
        }

        unsupported("Browser path writing");
      },

      async rename(): Promise<void> {
        unsupported("Browser path rename");
      },

      async readBinaryBase64(path: string): Promise<string> {
        const file = browserFiles.get(path);
        return blobToBase64(file ?? await fetchBlob(path));
      },

      async writeBinaryBase64(): Promise<void> {
        unsupported("Browser binary writing");
      },

      async readPngRgba(): Promise<PlatformPngRgbaData> {
        unsupported("Browser PNG RGBA codec");
      },

      async writePngRgba(): Promise<void> {
        unsupported("Browser PNG RGBA codec");
      },

      async resolveAssetUrl(path: string): Promise<string> {
        const file = browserFiles.get(path);
        return file ? URL.createObjectURL(file) : path.replace(/\\/g, "/");
      },
    },

    projects: {
      async isValidProject(): Promise<boolean> {
        unsupported("Browser project workspace");
      },

      async createProject(): Promise<void> {
        unsupported("Browser project workspace");
      },

      async renameProject(): Promise<string> {
        unsupported("Browser project workspace");
      },

      async readMetadata(): Promise<string> {
        unsupported("Browser project workspace");
      },

      async saveMetadata(): Promise<void> {
        unsupported("Browser project workspace");
      },

      async readMapManifest(): Promise<string> {
        unsupported("Browser project workspace");
      },

      async saveMapManifest(): Promise<void> {
        unsupported("Browser project workspace");
      },

      async readMapChunk(): Promise<string> {
        unsupported("Browser project workspace");
      },

      async saveMapChunk(): Promise<void> {
        unsupported("Browser project workspace");
      },

      async readSettings(): Promise<string> {
        unsupported("Browser project workspace");
      },

      async saveSettings(): Promise<void> {
        unsupported("Browser project workspace");
      },

      async listRecentProjects(): Promise<string[]> {
        return [];
      },

      async addRecentProject(): Promise<void> {
      },

      async removeRecentProject(): Promise<void> {
      },
    },

    window: {
      async onCloseRequested(
        handler: (event: PlatformCloseRequest) => void | Promise<void>,
      ): Promise<() => void> {
        const listener = (event: BeforeUnloadEvent) => {
          let prevented = false;
          const request: PlatformCloseRequest = {
            preventDefault: () => {
              prevented = true;
            },
          };

          void handler(request);

          if (prevented) {
            event.preventDefault();
            event.returnValue = "";
          }
        };

        window.addEventListener("beforeunload", listener);
        return () => window.removeEventListener("beforeunload", listener);
      },

      async close(): Promise<void> {
        window.close();
      },
    },
  };
}
