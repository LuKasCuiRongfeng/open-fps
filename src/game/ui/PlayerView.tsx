import { useEffect, useState } from "react";
import type { GameSettingsPatch } from "@game/settings";
import FpsCounter from "@ui/FpsCounter";
import LoadingOverlay, { type LoadingStep } from "@ui/LoadingOverlay";
import { GameSettingsPanel } from "@ui/settings";
import { useDocumentTheme } from "@ui/theme";
import { DEFAULT_BUNDLED_PROJECT_URL } from "@game/workspace/loadBundledProject";
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
    bundledProjectUrl: DEFAULT_BUNDLED_PROJECT_URL,
  });

  useDocumentTheme(settings?.ui.theme);

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
    <div className="app-root relative h-screen w-screen overflow-hidden">
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
        <GameSettingsPanel
          open={settingsOpen}
          settings={settings}
          gameApp={appRef.current}
          onPatch={applyPatch}
          onReset={resetToDefaults}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="overlay-panel max-w-xl rounded-md border p-4 text-sm leading-relaxed shadow-panel backdrop-blur-sm">
            <div className="mb-2 font-semibold">Game init failed</div>
            <div className="text-content-secondary">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}