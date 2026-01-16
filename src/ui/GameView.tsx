import { useEffect, useRef, useState, useCallback } from "react";
import { GameApp, type GameBootPhase } from "../game/GameApp";
import type { GameSettings, GameSettingsPatch } from "../game/settings/GameSettings";
import type { TerrainEditor } from "../game/editor";
import type { MapData } from "../game/editor/MapData";
import FpsCounter from "./FpsCounter";
import LoadingOverlay, { type LoadingStep } from "./LoadingOverlay";
import SettingsPanel from "./SettingsPanel";
import { TerrainEditorPanel } from "./TerrainEditorPanel";
import { MapImportScreen } from "./MapImportScreen";

// Game state: whether we're in editable mode (loaded from file) or procedural mode.
// 游戏状态：是否处于可编辑模式（从文件加载）还是程序生成模式
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
  // Pre-game map import state.
  // 游戏前地图导入状态
  const [showMapImport, setShowMapImport] = useState(true);
  const [pendingMapData, setPendingMapData] = useState<MapData | null>(null);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>("procedural");

  const loadingSteps: LoadingStep[] = [
    { id: "checking-webgpu", label: "Checking WebGPU" },
    { id: "creating-renderer", label: "Creating renderer" },
    { id: "creating-world", label: "Creating world" },
    { id: "creating-ecs", label: "Creating ECS" },
    { id: "ready", label: "Ready" },
  ];

  // Handle map import decision.
  // 处理地图导入决定
  const handleMapImport = useCallback((mapData: MapData | null) => {
    setPendingMapData(mapData);
    setTerrainMode(mapData ? "editable" : "procedural");
    setShowMapImport(false);
  }, []);

  useEffect(() => {
    // Don't start game until map import decision is made.
    // 在地图导入决定做出前不启动游戏
    if (showMapImport) return;

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

            // If user imported a map, load it.
            // 如果用户导入了地图，则加载它
            if (pendingMapData) {
              await app.loadMapData(pendingMapData);
            }

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
  }, [showMapImport, pendingMapData]);

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
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const app = appRef.current;
    if (!app || !terrainEditor || terrainEditor.mode !== "edit") return;

    // Update camera control (orbit/pan with right/middle drag).
    // 更新相机控制（右键/中键拖拽进行轨道旋转/平移）
    terrainEditor.updateCameraControl(e.clientX, e.clientY);

    // Update brush target position (only if not camera controlling).
    // 更新画刷目标位置（仅在不控制相机时）
    if (!terrainEditor.isCameraControlActive) {
      const rect = hostRef.current?.getBoundingClientRect();
      if (rect) {
        app.updateEditorBrushTarget(e.clientX - rect.left, e.clientY - rect.top);
      }
    }
  }, [terrainEditor]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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
  }, [terrainEditor]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!terrainEditor) return;

    const action = terrainEditor.getActionForButton(e.button);
    if (action === "brush") {
      terrainEditor.endBrush();
    } else if (action === "orbit" || action === "pan") {
      terrainEditor.endCameraControl(e.button);
    }
  }, [terrainEditor]);

  // Handle scroll wheel: camera zoom with Shift, brush radius without.
  // 处理滚轮：Shift+滚轮缩放相机，无Shift调整画刷半径
  const handleWheel = useCallback((e: React.WheelEvent) => {
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
  }, [terrainEditor]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-black text-white"
    >
      <div ref={hostRef} className="h-full w-full" />

      {/* Edit mode overlay to capture mouse events and prevent pointer lock. */}
      {/* 编辑模式覆盖层，捕获鼠标事件并防止指针锁定 */}
      {editorMode === "edit" && (
        <div
          className="absolute inset-0 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
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
          onEditorModeChange={setEditorMode}
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

      {/* Map Import Screen (before game starts) / 地图导入界面（游戏启动前） */}
      {showMapImport && (
        <MapImportScreen onComplete={handleMapImport} />
      )}
    </div>
  );
}
