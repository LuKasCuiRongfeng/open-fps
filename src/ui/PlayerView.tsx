import { useEffect, useState } from "react";
import type { GameSettingsPatch } from "@game/settings";
import FpsCounter from "./FpsCounter";
import LoadingOverlay, { type LoadingStep } from "./LoadingOverlay";
import SettingsPanel from "./SettingsPanel";
import { useGameApp } from "./hooks";

const LOADING_STEPS: LoadingStep[] = [
  { id: "checking-webgpu", label: "Checking WebGPU" },
  { id: "creating-renderer", label: "Creating renderer" },
  { id: "creating-world", label: "Creating world" },
  { id: "creating-ecs", label: "Creating ECS" },
  { id: "loading-map", label: "Loading map data" },
  { id: "ready", label: "Ready" },
];

export default function PlayerView() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    hostRef,
    appRef,
    bootPhase,
    loading,
    error,
    settings,
    setSettings,
  } = useGameApp({
    enabled: true,
    pendingMapData: null,
    pendingSettings: null,
    currentProjectPath: null,
  });

  useEffect(() => {
    if (!settingsOpen || !document.pointerLockElement) {
      return;
    }

    document.exitPointerLock();
  }, [settingsOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      if (!settings || error) return;

      event.preventDefault();
      setSettingsOpen((value) => !value);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settings, error]);

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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <div ref={hostRef} className="h-full w-full" />

      <FpsCounter
        visible={!loading && !error}
        isEditorMode={false}
        getFps={() => appRef.current?.getFps() ?? 0}
        getPlayerPosition={() => appRef.current?.getPlayerPosition() ?? null}
        getMousePosition={() => null}
      />

      <LoadingOverlay
        steps={LOADING_STEPS}
        activeStepId={bootPhase}
        visible={loading && !error}
      />

      {settings && (
        <SettingsPanel
          open={settingsOpen}
          appTarget="game"
          settings={settings}
          gameApp={appRef.current}
          terrainEditor={null}
          textureEditor={null}
          terrainMode="procedural"
          activeEditor="none"
          currentProjectPath={null}
          onActiveEditorChange={() => {}}
          onProjectPathChange={() => {}}
          onLoadMap={() => {}}
          onApplySettings={() => {}}
          onPatch={applyPatch}
          onReset={resetToDefaults}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl rounded bg-black/70 p-4 text-sm leading-relaxed">
            <div className="mb-2 font-semibold">WebGPU init failed</div>
            <div className="opacity-90">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}