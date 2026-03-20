// GameView: Main game view component.
// GameView：主游戏视图组件
//
// Orchestrates game lifecycle, editor panels, and settings UI.
// 协调游戏生命周期、编辑器面板和设置 UI

import { useEffect, useState } from "react";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { ActiveEditorType } from "./settings/tabs/TerrainEditorTab";
import FpsCounter from "./FpsCounter";
import LoadingOverlay, { type LoadingStep } from "./LoadingOverlay";
import SettingsPanel from "./SettingsPanel";
import { TerrainEditorPanel } from "./TerrainEditorPanel";
import { TextureEditorPanel } from "./TextureEditorPanel";
import { MapImportScreen } from "./MapImportScreen";
import { useCloseConfirmation, useEditorInput, useEditorWorkspace, useGameApp } from "./hooks";

const LOADING_STEPS: LoadingStep[] = [
  { id: "checking-webgpu", label: "Checking WebGPU" },
  { id: "creating-renderer", label: "Creating renderer" },
  { id: "creating-world", label: "Creating world" },
  { id: "creating-ecs", label: "Creating ECS" },
  { id: "loading-map", label: "Loading map data" },
  { id: "ready", label: "Ready" },
];

export default function GameView() {
  const editorWorkspace = useEditorWorkspace();

  // UI state.
  // UI 状态
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeEditor, setActiveEditor] = useState<ActiveEditorType>("none");

  // Game app lifecycle.
  // 游戏应用生命周期
  const {
    hostRef,
    appRef,
    bootPhase,
    loading,
    error,
    settings,
    terrainEditor,
    textureEditor,
    setSettings,
  } = useGameApp({
    enabled: !editorWorkspace.showProjectScreen,
    pendingMapData: editorWorkspace.pendingMapData,
    pendingSettings: editorWorkspace.pendingSettings,
    currentProjectPath: editorWorkspace.currentProjectPath,
  });

  // Window close confirmation.
  // 窗口关闭确认
  useCloseConfirmation({
    appRef,
    hasOpenProject: editorWorkspace.currentProjectPath !== null,
    saveCurrentProject: editorWorkspace.saveCurrentProjectForClose,
  });

  // Editor input handling.
  // 编辑器输入处理
  const { overlayRef, handleMouseDown, handleMouseUp } = useEditorInput({
    appRef,
    hostRef,
    terrainEditor,
    textureEditor,
    activeEditor,
  });

  // Handle loading a map from settings panel.
  // 处理从设置面板加载地图
  const handleLoadMap = () => {
    editorWorkspace.markEditableMode();
  };

  // Handle applying settings from loaded project.
  // 处理应用加载项目的设置
  const handleApplySettings = (newSettings: GameSettings) => {
    setSettings(newSettings);
  };

  // Exit pointer lock when settings panel opens.
  // 设置面板打开时退出指针锁定
  useEffect(() => {
    if (!settingsOpen) return;
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [settingsOpen]);

  // Escape key toggles settings panel.
  // Escape 键切换设置面板
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (!settings || !!error) return;

      e.preventDefault();
      setSettingsOpen((v) => !v);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settings, error]);

  // Apply settings patch.
  // 应用设置补丁
  const applyPatch = (patch: GameSettingsPatch) => {
    const app = appRef.current;
    if (!app) return;
    app.updateSettings(patch);
    setSettings(app.getSettingsSnapshot());
  };

  // Reset settings to defaults.
  // 重置设置为默认值
  const resetToDefaults = () => {
    const app = appRef.current;
    if (!app) return;
    app.resetSettings();
    setSettings(app.getSettingsSnapshot());
  };

  // Handle active editor change.
  // 处理活动编辑器变化
  const handleActiveEditorChange = (editor: ActiveEditorType) => {
    setActiveEditor(editor);
    // Reset all brushes when switching editors to prevent ghost strokes.
    // 切换编辑器时重置所有画笔，防止幽灵笔画
    terrainEditor?.endBrush();
    textureEditor?.endBrush();
    // Update terrain editor mode.
    // 更新地形编辑器模式
    if (terrainEditor) {
      terrainEditor.setMode(editor !== "none" ? "edit" : "play");
    }
    // Update brush indicator active editor type.
    // 更新笔刷指示器的活动编辑器类型
    const app = appRef.current;
    if (app) {
      app.setActiveEditorType(editor === "none" ? null : editor);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <div ref={hostRef} className="h-full w-full" />

      {/* Edit mode overlay to capture mouse events. */}
      {/* 编辑模式覆盖层，捕获鼠标事件 */}
      {activeEditor !== "none" && (
        <div
          ref={overlayRef}
          className="absolute inset-0 cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        />
      )}

      <FpsCounter
        visible={!loading && !error}
        isEditorMode={activeEditor !== "none"}
        getFps={() => appRef.current?.getFps() ?? 0}
        getPlayerPosition={() => appRef.current?.getPlayerPosition() ?? null}
        getMousePosition={() => appRef.current?.getMousePosition() ?? null}
      />

      <LoadingOverlay
        steps={LOADING_STEPS}
        activeStepId={bootPhase}
        visible={loading && !error}
      />

      {settings && (
        <SettingsPanel
          open={settingsOpen}
          appTarget="editor"
          settings={settings}
          gameApp={appRef.current}
          terrainEditor={terrainEditor}
          textureEditor={appRef.current?.getTextureEditor?.() ?? null}
          editorWorkspace={editorWorkspace}
          terrainMode={editorWorkspace.terrainMode}
          activeEditor={activeEditor}
          currentProjectPath={editorWorkspace.currentProjectPath}
          onActiveEditorChange={handleActiveEditorChange}
          onProjectPathChange={editorWorkspace.syncProjectPath}
          onLoadMap={handleLoadMap}
          onApplySettings={handleApplySettings}
          onPatch={applyPatch}
          onReset={resetToDefaults}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Terrain Editor Panel. */}
      {/* 地形编辑器面板 */}
      {!loading && !error && activeEditor === "terrain" && (
        <TerrainEditorPanel editor={terrainEditor} />
      )}

      {/* Texture Editor Panel. */}
      {/* 纹理编辑器面板 */}
      {!loading && !error && activeEditor === "texture" && textureEditor?.editingEnabled && (
        <TextureEditorPanel editor={textureEditor} visible={true} />
      )}

      {/* Error display. */}
      {/* 错误显示 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl rounded bg-black/70 p-4 text-sm leading-relaxed">
            <div className="mb-2 font-semibold">WebGPU init failed</div>
            <div className="opacity-90">{error}</div>
          </div>
        </div>
      )}

      {/* Project Screen (before game starts). */}
      {/* 项目界面（游戏启动前） */}
      {editorWorkspace.showProjectScreen && (
        <MapImportScreen workspace={editorWorkspace} />
      )}
    </div>
  );
}
