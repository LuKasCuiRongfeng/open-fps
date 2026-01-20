import { useEffect, useRef, useState } from "react";
import { GameApp, type GameBootPhase } from "@game/GameApp";
import type { GameSettings, GameSettingsPatch } from "@game/settings/GameSettings";
import type { TerrainEditor } from "@game/editor";
import type { TextureEditor } from "@game/editor/TextureEditor";
import type { MapData } from "@game/editor/MapData";
import type { ActiveEditorType } from "./settings/tabs/TerrainEditorTab";
import {
  setCurrentProjectPath,
  saveProjectMap,
  hasOpenProject,
} from "@game/editor/ProjectStorage";
import FpsCounter from "./FpsCounter";
import LoadingOverlay, { type LoadingStep } from "./LoadingOverlay";
import SettingsPanel from "./SettingsPanel";
import { TerrainEditorPanel } from "./TerrainEditorPanel";
import { TextureEditorPanel } from "./TextureEditorPanel";
import { MapImportScreen } from "./MapImportScreen";

// Game state: whether we're in editable mode (project open) or procedural mode.
// 游戏状态：是否处于可编辑模式（项目已打开）还是程序生成模式
type TerrainMode = "editable" | "procedural";

export default function GameView() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<GameApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootPhase, setBootPhase] = useState<GameBootPhase>("checking-webgpu");
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [terrainEditor, setTerrainEditor] = useState<TerrainEditor | null>(null);
  const [textureEditor, setTextureEditor] = useState<TextureEditor | null>(null);
  const [activeEditor, setActiveEditor] = useState<ActiveEditorType>("none");
  // Pre-game project screen state.
  // 游戏前项目界面状态
  const [showProjectScreen, setShowProjectScreen] = useState(true);
  const [pendingMapData, setPendingMapData] = useState<MapData | null>(null);
  const [pendingSettings, setPendingSettings] = useState<GameSettings | null>(null);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>("procedural");
  const [currentProjectPath, setProjectPath] = useState<string | null>(null);

  const loadingSteps: LoadingStep[] = [
    { id: "checking-webgpu", label: "Checking WebGPU" },
    { id: "creating-renderer", label: "Creating renderer" },
    { id: "creating-world", label: "Creating world" },
    { id: "creating-ecs", label: "Creating ECS" },
    { id: "loading-map", label: "Loading map data" },
    { id: "ready", label: "Ready" },
  ];

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

  // Handle loading a map from settings panel (Open Project in settings).
  // 处理从设置面板加载地图（设置中的打开项目）
  const handleLoadMap = (_mapData: MapData) => {
    setTerrainMode("editable");
    // Map is already loaded by GameApp in FileTab.handleOpenProject.
    // 地图已由 FileTab.handleOpenProject 中的 GameApp 加载
  };

  // Handle applying settings from loaded project.
  // 处理应用加载项目的设置
  const handleApplySettings = (newSettings: GameSettings) => {
    setSettings(newSettings);
  };

  useEffect(() => {
    // Don't start game until project decision is made.
    // 在项目决定做出前不启动游戏
    if (showProjectScreen) return;

    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    setError(null);
    setLoading(true);

    const raf = requestAnimationFrame(() => {
      if (disposed) return;

      try {
        const app = new GameApp(host, (phase) => {
          setBootPhase(phase);
        });
        appRef.current = app;

        app.ready
          .then(async () => {
            if (disposed) return;

            // If user opened a project with settings, apply them first.
            // 如果用户打开了带有设置的项目，先应用设置
            if (pendingSettings) {
              app.applySettings(pendingSettings);
            }

            // If user opened a project, load textures.
            // 如果用户打开了项目，加载纹理
            if (currentProjectPath) {
              await app.loadTexturesFromProject(currentProjectPath);
            }

            // If user opened a project with map data, load it.
            // 如果用户打开了带有地图数据的项目，则加载它
            if (pendingMapData) {
              setBootPhase("loading-map");
              await app.loadMapData(pendingMapData);
            }

            // All loading complete, show ready and enter game.
            // 所有加载完成，显示 ready 并进入游戏
            setBootPhase("ready");
            setSettings(app.getSettingsSnapshot());
            setTerrainEditor(app.getTerrainEditor());
            setTextureEditor(app.getTextureEditor());
            
            // Set up time update callback to sync sundial UI.
            // 设置时间更新回调以同步日晷 UI
            app.setOnTimeUpdate((timeOfDay) => {
              setSettings((prev) => {
                if (!prev || Math.abs(prev.time.timeOfDay - timeOfDay) < 0.001) return prev;
                return { ...prev, time: { ...prev.time, timeOfDay } };
              });
            });
            
            setLoading(false);
          })
          .catch((e) => {
            if (disposed) return;
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
          });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      appRef.current?.setOnTimeUpdate(null);
      appRef.current?.dispose();
      appRef.current = null;
    };
  }, [showProjectScreen, pendingMapData, pendingSettings, currentProjectPath]);

  // Window close confirmation: check for unsaved changes before closing.
  // 窗口关闭确认：关闭前检查未保存的更改
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupCloseHandler = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();

      unlisten = await win.onCloseRequested(async (event) => {
        // Only check for unsaved changes if a project is open.
        // 只有在打开项目时才检查未保存的更改
        if (!hasOpenProject()) {
          // No project open (procedural mode), allow close without prompt.
          // 未打开项目（程序生成模式），直接关闭无需提示
          return;
        }

        // Check if there are unsaved changes (terrain or texture).
        // 检查是否有未保存的更改（地形或纹理）
        const terrainDirty = appRef.current?.getTerrainEditor()?.dirty ?? false;
        const textureDirty = appRef.current?.getTextureEditor()?.dirty ?? false;
        if (!terrainDirty && !textureDirty) {
          // No unsaved changes, allow close.
          // 没有未保存的更改，允许关闭
          return;
        }

        // Prevent window from closing immediately.
        // 阻止窗口立即关闭
        event.preventDefault();

        // Show save confirmation dialog.
        // 显示保存确认对话框
        const { ask } = await import("@tauri-apps/plugin-dialog");
        const shouldSave = await ask(
          "You have unsaved changes. Do you want to save before exiting?",
          {
            title: "Unsaved Changes",
            kind: "warning",
            okLabel: "Save & Exit",
            cancelLabel: "Exit without Saving",
          }
        );

        if (shouldSave) {
          // Save to current project (no rename).
          // 保存到当前项目（不重命名）
          try {
            const app = appRef.current;
            if (app) {
              const mapData = app.exportCurrentMapData();
              const settings = app.getSettingsSnapshot();
              const savedPath = await saveProjectMap(mapData, settings);
              
              // Save texture data if texture editing is enabled.
              // 如果启用了纹理编辑，保存纹理数据
              if (app.getTextureEditor().editingEnabled && savedPath) {
                await app.saveTexturesToProject(savedPath);
              }
            }
          } catch (e) {
            // Save failed, show error and abort close.
            // 保存失败，显示错误并取消关闭
            const { message } = await import("@tauri-apps/plugin-dialog");
            await message(
              `Save failed: ${e}\n\nPlease try again or use Save As to save to a different location.`,
              { title: "Save Error", kind: "error" }
            );
            // Don't close the window, let user retry.
            // 不关闭窗口，让用户重试
            return;
          }
        }

        // Close the window.
        // 关闭窗口
        await win.destroy();
      });
    };

    setupCloseHandler();

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [settingsOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;

      // Don't open settings if game isn't ready.
      // 游戏未就绪时不打开设置
      if (!settings || !!error) return;

      e.preventDefault();
      setSettingsOpen((v) => !v);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [settings, error, terrainEditor]);

  const applyPatch = (patch: GameSettingsPatch) => {
    const app = appRef.current;
    if (!app) return;
    app.updateSettings(patch);
    setSettings(app.getSettingsSnapshot());
  };

  const resetToDefaults = () => {
    const app = appRef.current;
    if (!app) return;
    app.resetSettings();
    setSettings(app.getSettingsSnapshot());
  };

  // Handle active editor change - update TerrainEditor mode.
  // 处理活动编辑器变化 - 更新 TerrainEditor 模式
  const handleActiveEditorChange = (editor: ActiveEditorType) => {
    setActiveEditor(editor);
    // Always reset both brushes when switching editors to prevent ghost strokes.
    // 切换编辑器时总是重置两个画刷，防止幽灵笔画
    terrainEditor?.endBrush();
    textureEditor?.endBrush();
    // Update terrain editor mode to match active editor state.
    // 更新地形编辑器模式以匹配活动编辑器状态
    if (terrainEditor) {
      terrainEditor.setMode(editor !== "none" ? "edit" : "play");
    }
  };

  // Editor mouse handlers.
  // 编辑器鼠标处理器
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!terrainEditor || activeEditor === "none") return;

    e.preventDefault();

    const action = terrainEditor.getActionForButton(e.button);
    if (action === "brush") {
      // Brush action: paint terrain or texture based on active editor.
      // 画刷操作：根据活动编辑器绘制地形或纹理
      if (activeEditor === "terrain") {
        terrainEditor.startBrush();
      } else if (activeEditor === "texture" && textureEditor?.editingEnabled) {
        textureEditor.startBrush();
      }
    } else if (action === "orbit" || action === "pan") {
      // Camera control action.
      // 相机控制操作
      terrainEditor.startCameraControl(e.button, e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!terrainEditor) return;

    const action = terrainEditor.getActionForButton(e.button);
    if (action === "brush") {
      if (activeEditor === "terrain") {
        terrainEditor.endBrush();
      } else if (activeEditor === "texture") {
        textureEditor?.endBrush();
      }
    } else if (action === "orbit" || action === "pan") {
      terrainEditor.endCameraControl(e.button);
    }
  };

  // Global mousemove listener: allows drag to continue when mouse is over UI or outside window.
  // 全局 mousemove 监听器：允许鼠标在 UI 上或窗口外时继续拖拽
  useEffect(() => {
    if (!terrainEditor || activeEditor === "none") return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const app = appRef.current;
      if (!app) return;

      // Update camera control (orbit/pan).
      // 更新相机控制（轨道旋转/平移）
      terrainEditor.updateCameraControl(e.clientX, e.clientY, window.innerWidth, window.innerHeight);

      // Update brush target position (only if not camera controlling).
      // 更新画刷目标位置（仅在不控制相机时）
      if (!terrainEditor.isCameraControlActive) {
        const rect = hostRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          // Update brush target based on active editor.
          // 根据活动编辑器更新画刷目标
          if (activeEditor === "terrain") {
            app.updateEditorBrushTarget(mouseX, mouseY);
          } else if (activeEditor === "texture") {
            app.updateTextureBrushTarget(mouseX, mouseY);
          }
        }
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => window.removeEventListener("mousemove", handleGlobalMouseMove);
  }, [terrainEditor, activeEditor]);

  // Global mouseup listener: ensures drag ends when mouse released outside editor area.
  // Only active when stickyDrag is OFF.
  // 全局 mouseup 监听器：确保鼠标在编辑区域外释放时结束拖拽
  // 仅在 stickyDrag 关闭时激活
  useEffect(() => {
    if (!terrainEditor || activeEditor === "none" || terrainEditor.stickyDrag) return;

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const action = terrainEditor.getActionForButton(e.button);
      if (action === "brush") {
        if (activeEditor === "terrain") {
          terrainEditor.endBrush();
        } else if (activeEditor === "texture") {
          textureEditor?.endBrush();
        }
      } else if (action === "orbit" || action === "pan") {
        terrainEditor.endCameraControl(e.button);
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [terrainEditor, textureEditor, activeEditor, terrainEditor?.stickyDrag]);

  // Handle scroll wheel: camera zoom with Shift, brush radius without.
  // 处理滚轮：Shift+滚轮缩放相机，无Shift调整画刷半径
  const handleWheel = (e: WheelEvent) => {
    if (!terrainEditor || activeEditor === "none") return;

    e.preventDefault();

    if (e.shiftKey) {
      // Shift + wheel: adjust brush radius based on active editor.
      // Shift + 滚轮：根据活动编辑器调整画刷半径
      const delta = e.deltaY > 0 ? -2 : 2;
      if (activeEditor === "terrain") {
        const newRadius = terrainEditor.brushSettings.radiusMeters + delta;
        terrainEditor.setBrushRadius(newRadius);
      } else if (activeEditor === "texture" && textureEditor) {
        const newRadius = textureEditor.brushSettings.radius + delta;
        textureEditor.setBrushRadius(newRadius);
      }
    } else {
      // Wheel: zoom camera.
      // 滚轮：缩放相机
      terrainEditor.zoomCamera(e.deltaY);
    }
  };

  // Ref for editor overlay to attach non-passive wheel listener.
  // 编辑器覆盖层 ref，用于附加非被动滚轮监听器
  const editorOverlayRef = useRef<HTMLDivElement | null>(null);

  // Attach wheel listener with { passive: false } to allow preventDefault.
  // 附加 { passive: false } 的滚轮监听器以允许 preventDefault
  useEffect(() => {
    const overlay = editorOverlayRef.current;
    if (!overlay || activeEditor === "none") return;

    overlay.addEventListener("wheel", handleWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", handleWheel);
  }, [activeEditor, handleWheel]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-black text-white"
    >
      <div ref={hostRef} className="h-full w-full" />

      {/* Edit mode overlay to capture mouse events and prevent pointer lock. */}
      {/* 编辑模式覆盖层，捕获鼠标事件并防止指针锁定 */}
      {activeEditor !== "none" && (
        <div
          ref={editorOverlayRef}
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
        steps={loadingSteps}
        activeStepId={bootPhase}
        visible={loading && !error}
      />

      {settings ? (
        <SettingsPanel
          open={settingsOpen}
          settings={settings}
          gameApp={appRef.current}
          terrainEditor={terrainEditor}
          textureEditor={appRef.current?.getTextureEditor?.() ?? null}
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
      ) : null}

      {/* Terrain Editor Panel (brush controls) - only when terrain editing / 地形编辑器面板（画刷控制）- 仅在地形编辑时 */}
      {!loading && !error && activeEditor === "terrain" && (
        <TerrainEditorPanel
          editor={terrainEditor}
        />
      )}

      {/* Texture Editor Panel (texture brush controls) - only when texture editing / 纹理编辑器面板（纹理画刷控制）- 仅在纹理编辑时 */}
      {!loading && !error && activeEditor === "texture" && textureEditor?.editingEnabled && (
        <TextureEditorPanel
          editor={textureEditor}
          visible={true}
        />
      )}

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl rounded bg-black/70 p-4 text-sm leading-relaxed">
            <div className="mb-2 font-semibold">WebGPU init failed</div>
            <div className="opacity-90">{error}</div>
          </div>
        </div>
      ) : null}

      {/* Project Screen (before game starts) / 项目界面（游戏启动前） */}
      {showProjectScreen && (
        <MapImportScreen onComplete={handleProjectComplete} />
      )}
    </div>
  );
}
