// EditorView: editor-specific runtime shell.
// EditorView：编辑器专用运行时外壳

import { useEffect, useState } from "react";
import type { EditorAppSettings, EditorAppSettingsPatch } from "@editor/settings";
import type { ActiveEditorType } from "./settings/tabs";
import FpsCounter from "@ui/FpsCounter";
import LoadingOverlay, { type LoadingStep } from "@ui/LoadingOverlay";
import { useDocumentTheme } from "@ui/theme";
import { ProjectScreen } from "./ProjectScreen";
import { TerrainEditorPanel } from "./TerrainEditorPanel";
import { TextureEditorPanel } from "./TextureEditorPanel";
import { EditorSettingsPanel } from "./settings/EditorSettingsPanel";
import { useCloseConfirmation, useEditorApp, useEditorInput, useEditorWorkspace } from "./hooks";

const LOADING_STEPS: LoadingStep[] = [
	{ id: "checking-webgpu", label: "Checking WebGPU" },
	{ id: "creating-renderer", label: "Creating renderer" },
	{ id: "creating-world", label: "Creating world" },
	{ id: "creating-ecs", label: "Creating ECS" },
	{ id: "loading-map", label: "Loading map data" },
	{ id: "ready", label: "Ready" },
];

export default function EditorView() {
	const editorWorkspace = useEditorWorkspace();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [activeEditor, setActiveEditor] = useState<ActiveEditorType>("none");

	const {
		hostRef,
		appRef,
		bootPhase,
		loading,
		error,
		settings,
		terrainEditor,
		textureEditor,
		setSettings,
	} = useEditorApp({
		enabled: !editorWorkspace.showProjectScreen,
		pendingMapData: editorWorkspace.pendingMapData,
		pendingSettings: editorWorkspace.pendingSettings,
		currentMapDirectory: editorWorkspace.currentMapDirectory,
	});

	useDocumentTheme(settings?.ui.theme ?? editorWorkspace.pendingSettings?.ui.theme);

	useCloseConfirmation({
		appRef,
		hasOpenProject: editorWorkspace.currentProjectPath !== null,
		saveCurrentProject: editorWorkspace.saveCurrentProjectForClose,
	});

	const { overlayRef, handleMouseDown, handleMouseUp } = useEditorInput({
		appRef,
		hostRef,
		terrainEditor,
		textureEditor,
		activeEditor,
	});

	const handleLoadMap = () => {
		editorWorkspace.markEditableMode();
	};

	const handleApplySettings = (newSettings: EditorAppSettings) => {
		setSettings(newSettings);
	};

	useEffect(() => {
		if (!settingsOpen) return;
		if (document.pointerLockElement) {
			document.exitPointerLock();
		}
	}, [settingsOpen]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.code !== "Escape") return;
			if (!settings || error) return;

			e.preventDefault();
			setSettingsOpen((v) => !v);
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [settings, error]);

	const applyPatch = (patch: EditorAppSettingsPatch) => {
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

	const handleActiveEditorChange = (editor: ActiveEditorType) => {
		setActiveEditor(editor);
		terrainEditor?.endBrush();
		textureEditor?.endBrush();
		terrainEditor?.setMode("edit");
		const app = appRef.current;
		if (app) {
			app.setActiveEditorType(editor === "none" ? null : editor);
		}
	};

	return (
		<div className="app-root relative h-screen w-screen overflow-hidden">
			<div ref={hostRef} className="h-full w-full" />

			{!loading && !error && !editorWorkspace.showProjectScreen && (
				<div
					ref={overlayRef}
					className={`absolute inset-0 ${activeEditor === "none" ? "cursor-grab" : "cursor-crosshair"}`}
					onMouseDown={handleMouseDown}
					onMouseUp={handleMouseUp}
				/>
			)}

			<FpsCounter
				visible={!loading && !error}
				isEditorMode={activeEditor !== "none"}
				getFps={() => appRef.current?.getFps() ?? 0}
				getPlayerPosition={() => null}
				getMousePosition={() => appRef.current?.getMousePosition() ?? null}
			/>

			<LoadingOverlay
				steps={LOADING_STEPS}
				activeStepId={bootPhase}
				visible={loading && !error}
			/>

			{settings && (
				<EditorSettingsPanel
					open={settingsOpen}
					settings={settings}
					editorApp={appRef.current}
					terrainEditor={terrainEditor}
					textureEditor={appRef.current?.getTextureEditor() ?? null}
					editorWorkspace={editorWorkspace}
					terrainMode={editorWorkspace.terrainMode}
					activeEditor={activeEditor}
					onActiveEditorChange={handleActiveEditorChange}
					onLoadMap={handleLoadMap}
					onApplySettings={handleApplySettings}
					onPatch={applyPatch}
					onReset={resetToDefaults}
					onClose={() => setSettingsOpen(false)}
				/>
			)}

			{!loading && !error && activeEditor === "terrain" && (
				<TerrainEditorPanel editor={terrainEditor} />
			)}

			{!loading && !error && activeEditor === "texture" && textureEditor?.editingEnabled && (
				<TextureEditorPanel editor={textureEditor} visible={true} />
			)}

			{error && (
				<div className="absolute inset-0 flex items-center justify-center p-6">
					<div className="overlay-panel max-w-xl rounded-md border p-4 text-sm leading-relaxed shadow-panel backdrop-blur-sm">
						<div className="mb-2 font-semibold">WebGPU init failed</div>
						<div className="text-content-secondary">{error}</div>
					</div>
				</div>
			)}

			{editorWorkspace.showProjectScreen && (
				<ProjectScreen workspace={editorWorkspace} />
			)}
		</div>
	);
}