import { useEffect, useRef, useState } from "react";
import { EditorApp, type EditorAppSession, type GameBootPhase } from "@editor/app";
import type { TerrainEditor } from "@editor/runtime";
import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { VegetationEditor } from "@editor/runtime/vegetation/VegetationEditor";
import type { WorldObjectEditor } from "@editor/runtime/world-objects";
import type { EditorAppSettings } from "@editor/settings";
import type { MapData } from "@project/MapData";

interface UseEditorAppOptions {
  enabled: boolean;
  pendingMapData: MapData | null;
  pendingSettings: EditorAppSettings | null;
  currentMapDirectory: string | null;
}

interface UseEditorAppReturn {
  hostRef: React.RefObject<HTMLDivElement | null>;
  appRef: React.RefObject<EditorAppSession | null>;
  bootPhase: GameBootPhase;
  loading: boolean;
  error: string | null;
  settings: EditorAppSettings | null;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  vegetationEditor: VegetationEditor | null;
  worldObjectEditor: WorldObjectEditor | null;
  setSettings: React.Dispatch<React.SetStateAction<EditorAppSettings | null>>;
}

export function useEditorApp({
  enabled,
  pendingMapData,
  pendingSettings,
  currentMapDirectory,
}: UseEditorAppOptions): UseEditorAppReturn {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<EditorAppSession | null>(null);
  // EN: Project data here is only for boot; later saves or map-directory state updates must not recreate the editor runtime.
  // 中文: 这里的项目数据只用于启动；后续保存或地图目录状态更新不能重建编辑器运行时。
  const bootInputsRef = useRef({ pendingMapData, pendingSettings, currentMapDirectory });
  const [error, setError] = useState<string | null>(null);
  const [bootPhase, setBootPhase] = useState<GameBootPhase>("checking-webgpu");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<EditorAppSettings | null>(null);
  const [terrainEditor, setTerrainEditor] = useState<TerrainEditor | null>(null);
  const [textureEditor, setTextureEditor] = useState<TextureEditor | null>(null);
  const [vegetationEditor, setVegetationEditor] = useState<VegetationEditor | null>(null);
  const [worldObjectEditor, setWorldObjectEditor] = useState<WorldObjectEditor | null>(null);

  bootInputsRef.current = { pendingMapData, pendingSettings, currentMapDirectory };

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
            const bootInputs = bootInputsRef.current;

            if (bootInputs.pendingSettings) {
              app.applySettings(bootInputs.pendingSettings);
            }

            if (bootInputs.pendingMapData) {
              setBootPhase("loading-map");
              await app.loadMapData(bootInputs.pendingMapData);
            }

            if (bootInputs.currentMapDirectory) {
              await app.loadTexturesFromMapDirectory(bootInputs.currentMapDirectory, bootInputs.pendingMapData);
            }

            if (bootInputs.currentMapDirectory) {
              await app.loadVegetationFromMapDirectory(bootInputs.currentMapDirectory, bootInputs.pendingMapData);
            }

            if (bootInputs.currentMapDirectory) {
              await app.loadWorldObjectsFromMapDirectory(bootInputs.currentMapDirectory, bootInputs.pendingMapData);
            }

            await app.warmUpRuntimeShaders();

            setBootPhase("ready");
            setSettings(app.getSettingsSnapshot());
            setTerrainEditor(app.getTerrainEditor());
            setTextureEditor(app.getTextureEditor());
            setVegetationEditor(app.getVegetationEditor());
            setWorldObjectEditor(app.getWorldObjectEditor());

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
  }, [enabled]);

  return {
    hostRef,
    appRef,
    bootPhase,
    loading,
    error,
    settings,
    terrainEditor,
    textureEditor,
    vegetationEditor,
    worldObjectEditor,
    setSettings,
  };
}