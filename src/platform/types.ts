export type PlatformRuntime = "desktop" | "browser";

export type PlatformCapability =
    | "projectWorkspace"
    | "fileImportExport"
    | "assetUrlResolution"
    | "windowCloseControl"
    | "pngRgbaCodec";

export type PlatformDialogFilter = {
    name: string;
    extensions: string[];
};

export type PlatformOpenFileOptions = {
    title?: string;
    filters?: PlatformDialogFilter[];
};

export type PlatformOpenFolderOptions = {
    title?: string;
};

export type PlatformSaveFileOptions = {
    title?: string;
    defaultPath?: string;
    filters?: PlatformDialogFilter[];
};

export type PlatformPromptKind = "info" | "warning" | "error";

export type PlatformConfirmOptions = {
    title?: string;
    kind?: PlatformPromptKind;
    okLabel?: string;
    cancelLabel?: string;
};

export type PlatformNotifyOptions = {
    title?: string;
    kind?: PlatformPromptKind;
};

export type PlatformCloseRequest = {
    preventDefault: () => void;
};

export type PlatformPngRgbaData = {
    base64Pixels: string;
    width: number;
    height: number;
};

export interface PlatformDialogs {
    openFile(options: PlatformOpenFileOptions): Promise<string | null>;
    openFolder(options: PlatformOpenFolderOptions): Promise<string | null>;
    saveFile(options: PlatformSaveFileOptions): Promise<string | null>;
    confirm(message: string, options?: PlatformConfirmOptions): Promise<boolean>;
    notify(message: string, options?: PlatformNotifyOptions): Promise<void>;
}

export interface PlatformFiles {
    readText(path: string): Promise<string>;
    writeText(path: string, content: string): Promise<void>;
    deleteFile(path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    readBinaryBase64(path: string): Promise<string>;
    writeBinaryBase64(path: string, base64: string): Promise<void>;
    readPngRgba(path: string): Promise<PlatformPngRgbaData>;
    writePngRgba(path: string, data: PlatformPngRgbaData): Promise<void>;
    resolveAssetUrl(path: string): Promise<string>;
}

export interface PlatformProjects {
    isValidProject(projectPath: string): Promise<boolean>;
    createProject(projectPath: string, metadata: string): Promise<void>;
    renameProject(oldPath: string, newName: string): Promise<string>;
    readMetadata(projectPath: string): Promise<string>;
    saveMetadata(projectPath: string, data: string): Promise<void>;
    readMapManifest(projectPath: string, mapId: string): Promise<string>;
    saveMapManifest(projectPath: string, mapId: string, data: string): Promise<void>;
    readMapChunk(projectPath: string, mapId: string, chunkPath: string): Promise<string>;
    saveMapChunk(projectPath: string, mapId: string, chunkPath: string, base64: string): Promise<void>;
    readSettings(projectPath: string): Promise<string>;
    saveSettings(projectPath: string, data: string): Promise<void>;
    listRecentProjects(): Promise<string[]>;
    addRecentProject(projectPath: string): Promise<void>;
    removeRecentProject(projectPath: string): Promise<void>;
}

export interface PlatformWindow {
    onCloseRequested(handler: (event: PlatformCloseRequest) => void | Promise<void>): Promise<() => void>;
    requestClose(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    startDragging(): Promise<void>;
    setDecorations(visible: boolean): Promise<void>;
}

export interface PlatformHost {
    readonly runtime: PlatformRuntime;
    hasCapability(capability: PlatformCapability): boolean;
    readonly dialogs: PlatformDialogs;
    readonly files: PlatformFiles;
    readonly projects: PlatformProjects;
    readonly window: PlatformWindow;
}
