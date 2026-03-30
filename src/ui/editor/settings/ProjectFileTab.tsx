// ProjectFileTab: project file operations tab for editor mode.
// ProjectFileTab：编辑器模式下的项目文件操作标签

import { useEffect, useState } from "react";
import { getPlatformBridge } from "@/platform";
import type { EditorAppSession } from "@game/app";
import type { TerrainEditor } from "@game/editor";
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
  const [editableProjectName, setEditableProjectName] = useState("");
  const [editableMapName, setEditableMapName] = useState("");
  const [newMapName, setNewMapName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processing, setProcessing] = useState(false);

  const canEdit = editorWorkspace.terrainMode === "editable";
  const terrainDirty = terrainEditor?.dirty ?? false;
  const textureDirty = editorApp?.getTextureEditor()?.dirty ?? false;
  const dirty = terrainDirty || textureDirty;
  const hasProject = editorWorkspace.currentProjectPath !== null;
  const mapList = editorWorkspace.currentProjectMetadata?.maps ?? [];

  useEffect(() => {
    setEditableProjectName(editorWorkspace.currentProjectMetadata?.name ?? "Untitled Project");
  }, [editorWorkspace.currentProjectMetadata?.name]);

  useEffect(() => {
    const nextMapName = editorWorkspace.currentMapName ?? terrainEditor?.getMapDataMut().metadata.name ?? "Untitled Map";
    setEditableMapName(nextMapName);
    terrainEditor?.setMapName(nextMapName);
  }, [editorWorkspace.currentMapName, terrainEditor]);

  useEffect(() => {
    setNewMapName(`Map ${mapList.length + 1}`);
  }, [mapList.length]);

  const handleMapNameChange = (name: string) => {
    setEditableMapName(name);
    terrainEditor?.setMapName(name);
  };

  const handleSave = async (): Promise<boolean> => {
    if (!editorApp) return false;

    setProcessing(true);
    setStatusMessage("");

    try {
      const projectName = editableProjectName.trim() || "my_project";
      const mapName = editableMapName.trim() || "main";
      const result = await editorWorkspace.saveProjectSession({
        editorApp,
        terrainEditor,
        projectName,
        mapName,
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
      const projectName = editableProjectName.trim() || "my_project";
      const mapName = editableMapName.trim() || "main";
      const result = await editorWorkspace.saveProjectSession({
        editorApp,
        terrainEditor,
        projectName,
        mapName,
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

  const handleOpenMap = async (mapId: string) => {
    if (!editorApp || !hasProject || mapId === editorWorkspace.currentMapId) {
      return;
    }

    if (dirty) {
      const shouldSave = await platform.ask(
        "Save changes to the current map before switching?",
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
      const result = await editorWorkspace.openProjectMapInApp({
        editorApp,
        terrainEditor,
        mapId,
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

  const handleCreateMap = async () => {
    if (!editorApp || !hasProject) return;

    setProcessing(true);
    setStatusMessage("");

    try {
      const result = await editorWorkspace.saveProjectSession({
        editorApp,
        terrainEditor,
        projectName: editableProjectName.trim() || "my_project",
        mapName: newMapName.trim() || `Map ${mapList.length + 1}`,
        createNewMap: true,
      });
      setStatusMessage(result.message);
    } catch (e) {
      setStatusMessage(`✗ Save failed: ${e}`);
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
            value={editableProjectName}
            onChange={(e) => setEditableProjectName(e.target.value)}
            placeholder="Untitled Project"
            className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
        <div className="mt-2">
          <label className="mb-1 block text-xs text-white/50">Current Map Name</label>
          <input
            type="text"
            value={editableMapName}
            onChange={(e) => handleMapNameChange(e.target.value)}
            placeholder="Untitled Map"
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

      <div className="space-y-3 rounded-md border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Maps</div>
          {editorWorkspace.currentMapId && (
            <span className="text-xs text-white/45">Current: {editorWorkspace.currentMapId}</span>
          )}
        </div>

        <div className="space-y-2">
          {mapList.length > 0 ? (
            mapList.map((mapRecord) => {
              const active = mapRecord.id === editorWorkspace.currentMapId;
              return (
                <button
                  key={mapRecord.id}
                  onClick={() => void handleOpenMap(mapRecord.id)}
                  disabled={processing || active}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
                      : "border-white/10 bg-black/30 text-white hover:border-white/20 hover:bg-white/5"
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <span>{mapRecord.name}</span>
                  <span className="text-xs text-white/40">{mapRecord.id}</span>
                </button>
              );
            })
          ) : (
            <div className="text-xs text-white/45">No maps saved yet.</div>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            value={newMapName}
            onChange={(e) => setNewMapName(e.target.value)}
            placeholder="New map name"
            disabled={!hasProject || processing}
            className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:text-white/40"
          />
          <button
            onClick={handleCreateMap}
            disabled={!hasProject || processing}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-gray-800 disabled:text-gray-500"
          >
            New Map
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-blue-900/30 p-3 text-xs text-blue-200">
        <strong>Tips:</strong>
        <ul className="mt-1 list-disc list-inside space-y-1">
          <li>Each project stores shared settings in the project root.</li>
          <li>Each map stores its own terrain and texture data under maps/&lt;map-id&gt;.</li>
          <li>Create a new map from the current editor state, then switch maps from the list above.</li>
        </ul>
      </div>
    </div>
  );
}