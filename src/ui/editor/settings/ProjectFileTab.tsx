// ProjectFileTab: project file operations tab for editor mode.
// ProjectFileTab：编辑器模式下的项目文件操作标签

import { useEffect, useState } from "react";
import { getPlatformBridge } from "@/platform";
import type { EditorAppSession } from "@game/app";
import type { TerrainEditor } from "@game/editor";
import { getProjectNameFromPath } from "@project/ProjectStorage";
import type { MapData } from "@project/MapData";
import type { GameSettings } from "@game/settings";
import type { EditorWorkspaceController } from "../hooks/useEditorWorkspace";

const platform = getPlatformBridge();

type ProjectFileTabProps = {
  editorApp: EditorAppSession | null;
  terrainEditor: TerrainEditor | null;
  editorWorkspace: EditorWorkspaceController;
  onLoadMap?: (mapData: MapData) => void;
  onApplySettings?: (settings: GameSettings) => void;
};

export function ProjectFileTab({
  editorApp,
  terrainEditor,
  editorWorkspace,
  onLoadMap,
  onApplySettings,
}: ProjectFileTabProps) {
  const [editableMapName, setEditableMapName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processing, setProcessing] = useState(false);

  const canEdit = editorWorkspace.terrainMode === "editable";
  const terrainDirty = terrainEditor?.dirty ?? false;
  const textureDirty = editorApp?.getTextureEditor()?.dirty ?? false;
  const dirty = terrainDirty || textureDirty;
  const hasProject = editorWorkspace.currentProjectPath !== null;

  useEffect(() => {
    if (editorWorkspace.currentProjectPath) {
      setEditableMapName(getProjectNameFromPath(editorWorkspace.currentProjectPath));
    } else {
      setEditableMapName("Untitled");
    }
  }, [editorWorkspace.currentProjectPath]);

  const handleMapNameChange = (name: string) => {
    setEditableMapName(name);
    terrainEditor?.setMapName(name);
  };

  const handleSave = async (): Promise<boolean> => {
    if (!editorApp) return false;

    setProcessing(true);
    setStatusMessage("");

    try {
      const projectName = editableMapName.trim() || "my_project";
      const result = await editorWorkspace.saveProjectSession({
        editorApp,
        terrainEditor,
        projectName,
      });
      setStatusMessage(result.message);
      return result.ok;
    } catch (e) {
      setStatusMessage(`✗ Save failed: ${e}`);
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveAs = async () => {
    if (!editorApp) return;

    if (dirty && hasProject) {
      const shouldSave = await platform.ask(
        "Save changes to current project before creating a new one?",
        { title: "Unsaved Changes", kind: "warning" }
      );
      if (shouldSave) {
        await handleSave();
      }
    }

    setProcessing(true);
    setStatusMessage("");

    try {
      const projectName = editableMapName.trim() || "my_project";
      const result = await editorWorkspace.saveProjectSession({
        editorApp,
        terrainEditor,
        projectName,
        forceSaveAs: true,
      });
      setStatusMessage(result.message);
    } catch (e) {
      setStatusMessage(`✗ Save failed: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenProject = async () => {
    if (!editorApp) return;

    if (dirty) {
      const shouldSave = await platform.ask(
        "Save changes to current project before opening another?",
        { title: "Unsaved Changes", kind: "warning" }
      );
      if (shouldSave) {
        const saved = await handleSave();
        if (!saved) {
          return;
        }
      }
    }

    setProcessing(true);
    setStatusMessage("");

    try {
      const result = await editorWorkspace.openProjectInApp({
        editorApp,
        terrainEditor,
        onLoadMap,
        onApplySettings,
      });
      setStatusMessage(result.message);
    } catch (e) {
      setStatusMessage(`✗ Open failed: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/60">Current Project</div>
          {dirty && <span className="text-xs text-yellow-400">● Unsaved changes</span>}
        </div>
        <div className="mt-2">
          <label className="mb-1 block text-xs text-white/50">Project Name</label>
          <input
            type="text"
            value={editableMapName}
            onChange={(e) => handleMapNameChange(e.target.value)}
            placeholder="Untitled"
            className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
        <div className="mt-2 text-xs text-white/50">
          Mode: {canEdit ? "✓ Project Open (Editable)" : "⚠ Procedural (View Only)"}
        </div>
        {editorWorkspace.currentProjectPath && (
          <div className="mt-1 truncate text-xs text-white/40" title={editorWorkspace.currentProjectPath}>
            📁 {editorWorkspace.currentProjectPath}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 text-sm font-semibold">Project Operations</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleOpenProject}
            disabled={processing}
            className="px-3 py-2 rounded-md text-sm font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            📂 Open Project...
          </button>
          <button
            onClick={handleSave}
            disabled={processing}
            className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            💾 {hasProject ? "Save" : "Save as Project..."}
          </button>
          <button
            onClick={handleSaveAs}
            disabled={processing}
            className="col-span-2 px-3 py-2 rounded-md text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 transition-colors"
          >
            📁 Save As...
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`text-sm ${statusMessage.startsWith("✓") ? "text-green-400" : statusMessage.includes("cancelled") ? "text-yellow-400" : "text-red-400"}`}
        >
          {statusMessage}
        </div>
      )}

      <div className="rounded-lg bg-blue-900/30 p-3 text-xs text-blue-200">
        <strong>Tips:</strong>
        <ul className="mt-1 list-disc list-inside space-y-1">
          <li>Open a project folder to enable terrain and texture editing</li>
          <li>Use "Save as Project" to save procedural terrain for editing</li>
          <li>Projects are folders containing map data, settings, and assets</li>
        </ul>
      </div>
    </div>
  );
}