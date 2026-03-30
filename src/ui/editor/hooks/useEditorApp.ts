import { useEffect, useRef, useState } from "react";
import { EditorApp, type EditorAppSession, type GameBootPhase } from "@game/app";
import type { TerrainEditor } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { GameSettings } from "@game/settings";
import type { MapData } from "@project/MapData";

interface UseEditorAppOptions {
  enabled: boolean;
  pendingMapData: MapData | null;
  pendingSettings: GameSettings | null;
  currentProjectPath: string | null;
}

interface UseEditorAppReturn {
  hostRef: React.RefObject<HTMLDivElement | null>;
  appRef: React.RefObject<EditorAppSession | null>;
  bootPhase: GameBootPhase;
  loading: boolean;
  error: string | null;
  settings: GameSettings | null;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  setSettings: React.Dispatch<React.SetStateAction<GameSettings | null>>;
}

export function useEditorApp({
  enabled,
  pendingMapData,
  pendingSettings,
  currentProjectPath,
}: UseEditorAppOptions): UseEditorAppReturn {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<EditorAppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootPhase, setBootPhase] = useState<GameBootPhase>("checking-webgpu");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [terrainEditor, setTerrainEditor] = useState<TerrainEditor | null>(null);
  const [textureEditor, setTextureEditor] = useState<TextureEditor | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    setError(null);
    setLoading(true);

    const raf = requestAnimationFrame(() => {
      if (disposed) return;

      try {
        const app = new EditorApp(host, (phase) => {
          setBootPhase(phase);
        });
        appRef.current = app;

        app.ready
          .then(async () => {
            if (disposed) return;

            if (pendingSettings) {
              app.applySettings(pendingSettings);
            }

            if (currentProjectPath) {
              await app.loadTexturesFromProject(currentProjectPath);
            }

            if (pendingMapData) {
              setBootPhase("loading-map");
              await app.loadMapData(pendingMapData);
            }

            setBootPhase("ready");
            setSettings(app.getSettingsSnapshot());
            setTerrainEditor(app.getTerrainEditor());
            setTextureEditor(app.getTextureEditor());

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