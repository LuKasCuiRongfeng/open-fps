// ProjectFileTab: project file operations tab for editor mode.
// ProjectFileTab：编辑器模式下的项目文件操作标签

import { useEffect, useState } from "react";
import { getPlatform } from "@/platform";
import type { EditorAppSession } from "@editor/app";
import type { TerrainEditor } from "@editor/runtime";
import type { MapData } from "@project/MapData";
import type { EditorAppSettings } from "@editor/settings";
import type { EditorWorkspaceController } from "../hooks/useEditorWorkspace";

const platform = getPlatform();

type ProjectFileTabProps = {
  editorApp: EditorAppSession | null;
  terrainEditor: TerrainEditor | null;
  editorWorkspace: EditorWorkspaceController;
  onLoadMap?: (mapData: MapData) => void;
  onApplySettings?: (settings: EditorAppSettings) => void;
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
      const shouldSave = await platform.dialogs.confirm(
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
      const shouldSave = await platform.dialogs.confirm(
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
      const shouldSave = await platform.dialogs.confirm(
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
      <div className="panel-muted-surface rounded-md border p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-content-muted">Current Project</div>
          {dirty && <span className="text-xs text-status-warning">● Unsaved changes</span>}
        </div>
        <div className="mt-2">
          <label className="mb-1 block text-xs text-content-muted">Project Name</label>
          <input
            type="text"
            value={editableProjectName}
            onChange={(e) => setEditableProjectName(e.target.value)}
            placeholder="Untitled Project"
            className="field-surface w-full rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus:border-focus-ring"
          />
        </div>
        <div className="mt-2">
          <label className="mb-1 block text-xs text-content-muted">Current Map Name</label>
          <input
            type="text"
            value={editableMapName}
            onChange={(e) => handleMapNameChange(e.target.value)}
            placeholder="Untitled Map"
            className="field-surface w-full rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus:border-focus-ring"
          />
        </div>
        <div className="mt-2 text-xs text-content-muted">
          Mode: {canEdit ? "✓ Project Open (Editable)" : "⚠ Procedural (View Only)"}
        </div>
        {editorWorkspace.currentProjectPath && (
          <div className="mt-1 truncate text-xs text-content-muted" title={editorWorkspace.currentProjectPath}>
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
            className="rounded-md bg-accent-secondary px-3 py-2 text-sm font-medium text-accent-secondary-content transition-colors hover:bg-accent-secondary-hover disabled:bg-surface-panel-strong disabled:text-content-disabled"
          >
            📂 Open Project...
          </button>
          <button
            onClick={handleSave}
            disabled={processing}
            className="rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-accent-primary-content transition-colors hover:bg-accent-primary-hover disabled:bg-surface-panel-strong disabled:text-content-disabled"
          >
            💾 {hasProject ? "Save" : "Save as Project..."}
          </button>
          <button
            onClick={handleSaveAs}
            disabled={processing}
            className="col-span-2 rounded-md border border-stroke-default bg-surface-control px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-control-hover hover:text-content-primary disabled:bg-surface-panel-strong disabled:text-content-disabled"
          >
            📁 Save As...
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`text-sm ${statusMessage.startsWith("✓") ? "text-status-success" : statusMessage.includes("cancelled") ? "text-status-warning" : "text-status-danger"}`}
        >
          {statusMessage}
        </div>
      )}

      <div className="panel-muted-surface space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Maps</div>
          {editorWorkspace.currentMapId && (
            <span className="text-xs text-content-muted">Current: {editorWorkspace.currentMapId}</span>
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
                      ? "border-accent-primary/45 bg-accent-primary/15 text-content-primary"
                      : "border-stroke-subtle bg-surface-control text-content-secondary hover:border-stroke-default hover:bg-surface-control-hover hover:text-content-primary"
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <span>{mapRecord.name}</span>
                  <span className="text-xs text-content-muted">{mapRecord.id}</span>
                </button>
              );
            })
          ) : (
            <div className="text-xs text-content-muted">No maps saved yet.</div>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            value={newMapName}
            onChange={(e) => setNewMapName(e.target.value)}
            placeholder="New map name"
            disabled={!hasProject || processing}
            className="field-surface w-full rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus:border-focus-ring disabled:text-content-disabled"
          />
          <button
            onClick={handleCreateMap}
            disabled={!hasProject || processing}
            className="rounded-md bg-status-success px-3 py-2 text-sm font-medium text-status-success-content transition-colors hover:bg-status-success-hover disabled:bg-surface-panel-strong disabled:text-content-disabled"
          >
            New Map
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-status-info/35 bg-status-info/15 p-3 text-xs text-content-secondary">
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