export type PlatformRuntime = "desktop" | "browser";

export type PlatformDialogFilter = {
  name: string;
  extensions: string[];
};

export type PlatformOpenDialogOptions = {
  title?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: PlatformDialogFilter[];
};

export type PlatformSaveDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: PlatformDialogFilter[];
};

export type PlatformPromptKind = "info" | "warning" | "error";

export type PlatformAskOptions = {
  title?: string;
  kind?: PlatformPromptKind;
  okLabel?: string;
  cancelLabel?: string;
};

export type PlatformMessageOptions = {
  title?: string;
  kind?: PlatformPromptKind;
};

export type PlatformCloseRequest = {
  preventDefault: () => void;
};

export interface PlatformBridge {
  readonly runtime: PlatformRuntime;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  openDialog(options: PlatformOpenDialogOptions): Promise<string | null>;
  saveDialog(options: PlatformSaveDialogOptions): Promise<string | null>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  renamePath(oldPath: string, newPath: string): Promise<void>;
  ask(message: string, options?: PlatformAskOptions): Promise<boolean>;
  message(message: string, options?: PlatformMessageOptions): Promise<void>;
  resolveAssetUrl(path: string): Promise<string>;
  onCloseRequested(
    handler: (event: PlatformCloseRequest) => void | Promise<void>,
  ): Promise<() => void>;
  closeWindow(): Promise<void>;
}