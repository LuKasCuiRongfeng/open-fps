// EditorView: editor-specific runtime shell.
// EditorView：编辑器专用运行时外壳

import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import type { EditorAppSettings, EditorAppSettingsPatch } from "@editor/settings";
import type { ActiveEditorType } from "./settings/tabs";
import { AppTitleBar } from "@ui/AppTitleBar";
import FpsCounter from "@ui/FpsCounter";
import LoadingOverlay, { type LoadingStep } from "@ui/LoadingOverlay";
import { useDocumentTheme } from "@ui/theme";
import { ProjectScreen } from "./ProjectScreen";
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

function isTextEditingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

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
		vegetationEditor,
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
		vegetationEditor,
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
			const commandKey = e.ctrlKey || e.metaKey;
			if (commandKey && !e.altKey && !isTextEditingTarget(e.target)) {
				const app = appRef.current;
				if (app && e.code === "KeyZ") {
					e.preventDefault();
					if (e.shiftKey) {
						void app.redoEditorCommand();
					} else {
						void app.undoEditorCommand();
					}
					return;
				}

				if (app && e.code === "KeyY") {
					e.preventDefault();
					void app.redoEditorCommand();
					return;
				}
			}

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
		vegetationEditor?.endBrush();
		terrainEditor?.setMode("edit");
		const app = appRef.current;
		if (app) {
			app.setActiveEditorType(editor === "none" ? null : editor);
		}
	};

	return (
		<div className="app-root flex h-screen w-screen flex-col overflow-hidden">
			<AppTitleBar title="Open FPS Editor" icon={Boxes} />

			<div className="relative min-h-0 flex-1 overflow-hidden">
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
						vegetationEditor={appRef.current?.getVegetationEditor() ?? null}
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

				{error && (
					<div className="pointer-events-none absolute inset-0 p-3">
						<div className="overlay-panel pointer-events-auto max-w-xl rounded-md border text-sm shadow-panel backdrop-blur-sm">
							<div className="border-b border-stroke-subtle px-3 py-2 text-xs font-semibold text-content-primary">Editor Startup Failed</div>
							<div className="px-3 py-2 text-xs leading-relaxed text-content-secondary">{error}</div>
						</div>
					</div>
				)}

				{editorWorkspace.showProjectScreen && (
					<ProjectScreen workspace={editorWorkspace} />
				)}
			</div>
		</div>
	);
}