import { useEffect, useRef, useState } from "react";
import { GameApp, type GameBootPhase } from "../game/GameApp";
import type { GameSettings, GameSettingsPatch } from "../game/settings/GameSettings";
import type { TerrainEditor } from "../game/editor";
import type { MapData } from "../game/editor/MapData";
import { setCurrentProjectPath } from "../game/editor/ProjectStorage";
import FpsCounter from "./FpsCounter";
import LoadingOverlay, { type LoadingStep } from "./LoadingOverlay";
import SettingsPanel from "./SettingsPanel";
import { TerrainEditorPanel } from "./TerrainEditorPanel";
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
  const [editorMode, setEditorMode] = useState<"play" | "edit">("play");
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
    // Map is already loaded by GameApp in MapEditorTab.handleOpenProject.
    // 地图已由 MapEditorTab.handleOpenProject 中的 GameApp 加载
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
      appRef.current?.dispose();
      appRef.current = null;
    };
  }, [showProjectScreen, pendingMapData, pendingSettings]);

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

  // Editor mouse handlers.
  // 编辑器鼠标处理器
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!terrainEditor || terrainEditor.mode !== "edit") return;

    e.preventDefault();

    const action = terrainEditor.getActionForButton(e.button);
    if (action === "brush") {
      // Brush action: paint terrain.
      // 画刷操作：绘制地形
      terrainEditor.startBrush();
    } else if (action === "orbit" || action === "pan") {
      // Camera control action.
      // 相机控制操作
      terrainEditor.startCameraControl(e.button, e.clientX, e.clientY);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!terrainEditor) return;

    const action = terrainEditor.getActionForButton(e.button);
    if (action === "brush") {
      terrainEditor.endBrush();
    } else if (action === "orbit" || action === "pan") {
      terrainEditor.endCameraControl(e.button);
    }
  };

  // Global mousemove listener: allows drag to continue when mouse is over UI or outside window.
  // 全局 mousemove 监听器：允许鼠标在 UI 上或窗口外时继续拖拽
  useEffect(() => {
    if (!terrainEditor || editorMode !== "edit") return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const app = appRef.current;
      if (!app) return;

      // Update camera control (orbit/pan).
      // 更新相机控制（轨道旋转/平移）
      terrainEditor.updateCameraControl(e.clientX, e.clientY);

      // Update brush target position (only if not camera controlling).
      // 更新画刷目标位置（仅在不控制相机时）
      if (!terrainEditor.isCameraControlActive) {
        const rect = hostRef.current?.getBoundingClientRect();
        if (rect) {
          app.updateEditorBrushTarget(e.clientX - rect.left, e.clientY - rect.top);
        }
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => window.removeEventListener("mousemove", handleGlobalMouseMove);
  }, [terrainEditor, editorMode]);

  // Global mouseup listener: ensures drag ends when mouse released outside editor area.
  // Only active when stickyDrag is OFF.
  // 全局 mouseup 监听器：确保鼠标在编辑区域外释放时结束拖拽
  // 仅在 stickyDrag 关闭时激活
  useEffect(() => {
    if (!terrainEditor || editorMode !== "edit" || terrainEditor.stickyDrag) return;

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const action = terrainEditor.getActionForButton(e.button);
      if (action === "brush") {
        terrainEditor.endBrush();
      } else if (action === "orbit" || action === "pan") {
        terrainEditor.endCameraControl(e.button);
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [terrainEditor, editorMode, terrainEditor?.stickyDrag]);

  // Handle scroll wheel: camera zoom with Shift, brush radius without.
  // 处理滚轮：Shift+滚轮缩放相机，无Shift调整画刷半径
  const handleWheel = (e: WheelEvent) => {
    if (!terrainEditor || terrainEditor.mode !== "edit") return;

    e.preventDefault();

    if (e.shiftKey) {
      // Shift + wheel: adjust brush radius.
      // Shift + 滚轮：调整画刷半径
      const delta = e.deltaY > 0 ? -2 : 2;
      const newRadius = terrainEditor.brushSettings.radiusMeters + delta;
      terrainEditor.setBrushRadius(newRadius);
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
    if (!overlay || editorMode !== "edit") return;

    overlay.addEventListener("wheel", handleWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", handleWheel);
  }, [editorMode, handleWheel]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-black text-white"
    >
      <div ref={hostRef} className="h-full w-full" />

      {/* Edit mode overlay to capture mouse events and prevent pointer lock. */}
      {/* 编辑模式覆盖层，捕获鼠标事件并防止指针锁定 */}
      {editorMode === "edit" && (
        <div
          ref={editorOverlayRef}
          className="absolute inset-0 cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        />
      )}

      <FpsCounter
        visible={!loading && !error}
        getFps={() => appRef.current?.getFps() ?? 0}
        getPlayerPosition={() => appRef.current?.getPlayerPosition() ?? null}
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
          terrainMode={terrainMode}
          editorMode={editorMode}
          currentProjectPath={currentProjectPath}
          onEditorModeChange={setEditorMode}
          onProjectPathChange={handleProjectPathChange}
          onLoadMap={handleLoadMap}
          onApplySettings={handleApplySettings}
          onPatch={applyPatch}
          onReset={resetToDefaults}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {/* Terrain Editor Panel (brush controls only) / 地形编辑器面板（仅画刷控制） */}
      {!loading && !error && editorMode === "edit" && (
        <TerrainEditorPanel
          editor={terrainEditor}
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
