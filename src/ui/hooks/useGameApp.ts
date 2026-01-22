// useGameApp: Game application lifecycle management.
// useGameApp：游戏应用生命周期管理

import { useEffect, useRef, useState } from "react";
import { GameApp, type GameBootPhase } from "@game/GameApp";
import type { GameSettings } from "@game/settings/GameSettings";
import type { TerrainEditor } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { MapData } from "@project/MapData";

interface UseGameAppOptions {
  /** Whether to start the game (false during project selection screen). */
  /** 是否启动游戏（在项目选择界面时为 false） */
  enabled: boolean;
  /** Map data to load (null for procedural terrain). */
  /** 要加载的地图数据（程序生成地形为 null） */
  pendingMapData: MapData | null;
  /** Settings to apply from loaded project. */
  /** 从加载的项目应用的设置 */
  pendingSettings: GameSettings | null;
  /** Current project path (null for procedural mode). */
  /** 当前项目路径（程序生成模式为 null） */
  currentProjectPath: string | null;
}

interface UseGameAppReturn {
  hostRef: React.RefObject<HTMLDivElement | null>;
  appRef: React.RefObject<GameApp | null>;
  bootPhase: GameBootPhase;
  loading: boolean;
  error: string | null;
  settings: GameSettings | null;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  setSettings: React.Dispatch<React.SetStateAction<GameSettings | null>>;
}

/**
 * Hook to manage GameApp lifecycle.
 * 管理 GameApp 生命周期的 Hook
 */
export function useGameApp({
  enabled,
  pendingMapData,
  pendingSettings,
  currentProjectPath,
}: UseGameAppOptions): UseGameAppReturn {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<GameApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootPhase, setBootPhase] = useState<GameBootPhase>("checking-webgpu");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [terrainEditor, setTerrainEditor] = useState<TerrainEditor | null>(null);
  const [textureEditor, setTextureEditor] = useState<TextureEditor | null>(null);

  useEffect(() => {
    // Don't start game until enabled (project decision is made).
    // 在启用前不启动游戏（直到项目决定做出）
    if (!enabled) return;

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
  }, [enabled, pendingMapData, pendingSettings, currentProjectPath]);

  return {
    hostRef,
    appRef,
    bootPhase,
    loading,
    error,
    settings,
    terrainEditor,
    textureEditor,
    setSettings,
  };
}
