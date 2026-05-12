// Editor settings contracts live outside the game runtime.
// 编辑器设置契约位于游戏运行时之外

import {
  applySettingsPatch,
  createDefaultGameSettings,
  setSettings,
  type DeepPartial,
  type GameSettings,
  type GameSettingsPatch,
} from "@game/settings";

// Editor mouse action type.
// 编辑器鼠标动作类型
export type EditorMouseButtonAction = "orbit" | "pan" | "zoom";
export type EditorMouseAction = EditorMouseButtonAction | "brush";

// Editor-only settings.
// 仅编辑器使用的设置
export type EditorSettings = {
  leftButton: EditorMouseButtonAction;
  rightButton: EditorMouseButtonAction;
  middleButton: EditorMouseButtonAction;
  /** When true, drag operations continue even if mouse leaves window. / 为 true 时，拖拽操作在鼠标离开窗口后继续 */
  stickyDrag: boolean;
};

export type EditorAppSettings = GameSettings & {
  editor: EditorSettings;
};

export type EditorAppSettingsPatch = GameSettingsPatch & {
  editor?: DeepPartial<EditorSettings>;
};

export function createDefaultEditorSettings(): EditorSettings {
  return {
    leftButton: "pan",
    rightButton: "orbit",
    middleButton: "pan",
    stickyDrag: false,
  };
}

function isEditorMouseButtonAction(action: unknown): action is EditorMouseButtonAction {
  return action === "orbit" || action === "pan" || action === "zoom";
}

export function createDefaultEditorAppSettings(): EditorAppSettings {
  return {
    ...createDefaultGameSettings(),
    editor: createDefaultEditorSettings(),
  };
}

export function cloneEditorSettings(settings: EditorSettings): EditorSettings {
  return structuredClone(settings);
}

export function cloneEditorAppSettings(settings: EditorAppSettings): EditorAppSettings {
  return structuredClone(settings);
}

export function applyEditorSettingsPatch(
  settings: EditorSettings,
  patch: DeepPartial<EditorSettings>,
): void {
  if (isEditorMouseButtonAction(patch.leftButton)) {
    settings.leftButton = patch.leftButton;
  }
  if (isEditorMouseButtonAction(patch.rightButton)) {
    settings.rightButton = patch.rightButton;
  }
  if (isEditorMouseButtonAction(patch.middleButton)) {
    settings.middleButton = patch.middleButton;
  }
  if (patch.stickyDrag !== undefined) {
    settings.stickyDrag = patch.stickyDrag;
  }
}

export function setEditorSettings(target: EditorSettings, source: EditorSettings): void {
  applyEditorSettingsPatch(target, source);
}

export function applyEditorAppSettingsPatch(
  settings: EditorAppSettings,
  patch: EditorAppSettingsPatch,
): void {
  const { editor, ...gamePatch } = patch;
  applySettingsPatch(settings, gamePatch);

  if (editor) {
    applyEditorSettingsPatch(settings.editor, editor);
  }
}

export function setEditorAppSettings(target: EditorAppSettings, source: EditorAppSettings): void {
  const { editor, ...gameSettings } = source;
  setSettings(target, gameSettings);
  setEditorSettings(target.editor, editor);
}

export function mergeEditorAppSettingsWithDefaults(json: string | null): EditorAppSettings {
  const defaults = createDefaultEditorAppSettings();
  if (!json) return defaults;

  try {
    applyEditorAppSettingsPatch(defaults, JSON.parse(json) as EditorAppSettingsPatch);
    return defaults;
  } catch (error) {
    console.warn("[editor-settings] Failed to parse settings JSON, falling back to defaults", error);
    return defaults;
  }
}