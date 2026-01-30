// GameView: Main game view component.
// GameView：主游戏视图组件
//
// Orchestrates game lifecycle, editor panels, and settings UI.
// 协调游戏生命周期、编辑器面板和设置 UI

import { useEffect, useState } from "react";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import type { MapData } from "@project/MapData";
import type { ActiveEditorType } from "./settings/tabs/TerrainEditorTab";
import { setCurrentProjectPath } from "@project/ProjectStorage";
import FpsCounter from "./FpsCounter";
import LoadingOverlay, { type LoadingStep } from "./LoadingOverlay";
import SettingsPanel from "./SettingsPanel";
import { TerrainEditorPanel } from "./TerrainEditorPanel";
import { TextureEditorPanel } from "./TextureEditorPanel";
import { VegetationEditorPanel } from "./VegetationEditorPanel";
import { MapImportScreen } from "./MapImportScreen";
import { useCloseConfirmation, useEditorInput, useGameApp } from "./hooks";

// Game state: whether we're in editable mode (project open) or procedural mode.
// 游戏状态：是否处于可编辑模式（项目已打开）还是程序生成模式
type TerrainMode = "editable" | "procedural";

const LOADING_STEPS: LoadingStep[] = [
  { id: "checking-webgpu", label: "Checking WebGPU" },
  { id: "creating-renderer", label: "Creating renderer" },
  { id: "creating-world", label: "Creating world" },
  { id: "creating-ecs", label: "Creating ECS" },
  { id: "loading-map", label: "Loading map data" },
  { id: "ready", label: "Ready" },
];

export default function GameView() {
  // Project state.
  // 项目状态
  const [showProjectScreen, setShowProjectScreen] = useState(true);
  const [pendingMapData, setPendingMapData] = useState<MapData | null>(null);
  const [pendingSettings, setPendingSettings] = useState<GameSettings | null>(null);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>("procedural");
  const [currentProjectPath, setProjectPath] = useState<string | null>(null);

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
    vegetationEditor,
    setSettings,
  } = useGameApp({
    enabled: !showProjectScreen,
    pendingMapData,
    pendingSettings,
    currentProjectPath,
  });

  // Window close confirmation.
  // 窗口关闭确认
  useCloseConfirmation(appRef);

  // Editor input handling.
  // 编辑器输入处理
  const { overlayRef, handleMouseDown, handleMouseUp } = useEditorInput({
    appRef,
    hostRef,
    terrainEditor,
    textureEditor,
    vegetationEditor,
    activeEditor,
  });

  // Handle project open decision.
  // 处理项目打开决定
  const handleProjectComplete = (
    mapData: MapData | null,
    projectPath: string | null,
    projectSettings: GameSettings | null
  ) => {
    setPendingMapData(mapData);
    setPendingSettings(projectSettings);
    setTerrainMode(projectPath ? "editable" : "procedural");
    setProjectPath(projectPath);
    setShowProjectScreen(false);
  };

  // Handle project path change (when saving procedural terrain as new project).
  // 处理项目路径变化（当保存程序地形为新项目时）
  const handleProjectPathChange = (path: string | null) => {
    setProjectPath(path);
    setCurrentProjectPath(path);
    if (path) {
      setTerrainMode("editable");
    }
  };

  // Handle loading a map from settings panel.
  // 处理从设置面板加载地图
  const handleLoadMap = (_mapData: MapData) => {
    setTerrainMode("editable");
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
    vegetationEditor?.endBrush();
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
          settings={settings}
          gameApp={appRef.current}
          terrainEditor={terrainEditor}
          textureEditor={appRef.current?.getTextureEditor?.() ?? null}
          vegetationEditor={appRef.current?.getVegetationEditor?.() ?? null}
          terrainMode={terrainMode}
          activeEditor={activeEditor}
          currentProjectPath={currentProjectPath}
          onActiveEditorChange={handleActiveEditorChange}
          onProjectPathChange={handleProjectPathChange}
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

      {/* Vegetation Editor Panel. */}
      {/* 植被编辑器面板 */}
      {!loading && !error && activeEditor === "vegetation" && vegetationEditor?.editingEnabled && (
        <VegetationEditorPanel editor={vegetationEditor} visible={true} />
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
      {showProjectScreen && (
        <MapImportScreen onComplete={handleProjectComplete} />
      )}
    </div>
  );
}
