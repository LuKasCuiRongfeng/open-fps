// useGameApp: Game application lifecycle management.
// useGameApp：游戏应用生命周期管理

import { useEffect, useRef, useState } from "react";
import { GameApp, type GameBootPhase } from "@game/app";
import type { GameSettings } from "@game/settings";
import { loadBundledGameProject } from "@game/workspace/loadBundledProject";
import type { MapData } from "@project/MapData";

interface UseGameAppOptions {
  /** Whether to start the game (false during project selection screen). */
  /** 是否启动游戏（在项目选择界面时为 false） */
  enabled: boolean;
  /** Optional map data to load when no bundled project URL is provided. */
  /** 未提供随包项目 URL 时可选加载的地图数据 */
  pendingMapData: MapData | null;
  /** Settings to apply from loaded project. */
  /** 从加载的项目应用的设置 */
  pendingSettings: GameSettings | null;
  /** Bundled read-only project URL for standalone game builds. */
  /** 独立游戏构建使用的只读打包项目 URL */
  bundledProjectUrl?: string | null;
}

interface UseGameAppReturn {
  hostRef: React.RefObject<HTMLDivElement | null>;
  appRef: React.RefObject<GameApp | null>;
  bootPhase: GameBootPhase;
  loading: boolean;
  error: string | null;
  settings: GameSettings | null;
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
  bundledProjectUrl = null,
}: UseGameAppOptions): UseGameAppReturn {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<GameApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootPhase, setBootPhase] = useState<GameBootPhase>("checking-webgpu");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<GameSettings | null>(null);

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

            if (bundledProjectUrl || pendingMapData) {
              setBootPhase("loading-map");
            }

            const bundledProject = bundledProjectUrl
              ? await loadBundledGameProject(bundledProjectUrl)
              : null;
            if (disposed) return;

            const settingsToApply = bundledProject?.settings ?? pendingSettings;
            const mapDataToLoad = bundledProject?.map ?? pendingMapData;

            if (!mapDataToLoad) {
              throw new Error("No map file data was provided for the game runtime");
            }

            // Apply settings before loading data so terrain and sky use the packaged project values.
            // 先应用设置，确保地形和天空使用随包项目的配置值。
            if (settingsToApply) {
              app.applySettings(settingsToApply);
            }

            // EN: The game runtime requires a map file and cannot synthesize replacement terrain.
            // 中文: 游戏运行时必须提供地图文件，不能合成替代地形。
            await app.loadMapData(mapDataToLoad);
            if (disposed) return;

            if (bundledProject) {
              await app.loadTerrainTexturesFromMapDirectory(
                bundledProject.projectBaseUrl,
                bundledProject.mapDirectoryUrl,
                bundledProject.map,
                bundledProject.textureDefinition,
              );
              if (disposed) return;

              await app.loadVegetationFromMapDirectory(
                bundledProject.mapDirectoryUrl,
                bundledProject.vegetationData,
              );
              if (disposed) return;
            }

            // All loading complete, show ready and enter game.
            // 所有加载完成，显示 ready 并进入游戏
            setBootPhase("ready");
            setSettings(app.getSettingsSnapshot());

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
  }, [enabled, pendingMapData, pendingSettings, bundledProjectUrl]);

  return {
    hostRef,
    appRef,
    bootPhase,
    loading,
    error,
    settings,
    setSettings,
  };
}
