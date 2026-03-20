import type {
  PlatformAskOptions,
  PlatformBridge,
  PlatformCloseRequest,
  PlatformMessageOptions,
  PlatformOpenDialogOptions,
  PlatformSaveDialogOptions,
} from "./types";

function unsupported(feature: string): never {
  throw new Error(`${feature} is not available in the browser runtime yet.`);
}

function formatPrompt(message: string, title?: string): string {
  return title ? `${title}\n\n${message}` : message;
}

export function createBrowserBridge(): PlatformBridge {
  return {
    runtime: "browser",

    async invoke<T>(_command: string, _args?: Record<string, unknown>): Promise<T> {
      unsupported("Native command invocation");
    },

    async openDialog(_options: PlatformOpenDialogOptions): Promise<string | null> {
      unsupported("Native open dialog");
    },

    async saveDialog(_options: PlatformSaveDialogOptions): Promise<string | null> {
      unsupported("Native save dialog");
    },

    async readTextFile(_path: string): Promise<string> {
      unsupported("Native file reading");
    },

    async writeTextFile(_path: string, _content: string): Promise<void> {
      unsupported("Native file writing");
    },

    async renamePath(_oldPath: string, _newPath: string): Promise<void> {
      unsupported("Native file rename");
    },

    async ask(message: string, options?: PlatformAskOptions): Promise<boolean> {
      return window.confirm(formatPrompt(message, options?.title));
    },

    async message(message: string, options?: PlatformMessageOptions): Promise<void> {
      window.alert(formatPrompt(message, options?.title));
    },

    async resolveAssetUrl(path: string): Promise<string> {
      return path;
    },

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

    async closeWindow(): Promise<void> {
      window.close();
    },
  };
}