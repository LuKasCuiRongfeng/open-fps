// ProjectFileTab: project file operations tab for editor mode.
// ProjectFileTab：编辑器模式下的项目文件操作标签

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, FolderOpen, Layers, Plus, Save, SaveAll } from "lucide-react";
import { getPlatform } from "@/platform";
import type { EditorAppSession } from "@editor/app";
import type { TerrainEditor } from "@editor/runtime";
import type { MapData } from "@project/MapData";
import type { EditorAppSettings } from "@editor/settings";
import type { EditorWorkspaceController } from "../hooks/useEditorWorkspace";
import {
  ReadonlyField,
  SettingBadge,
  SettingRow,
  SettingsButton,
  SettingsPage,
  SettingsSection,
} from "@ui/settings/SettingsLayout";
import { Input } from "@ui/components/ui/input";

const platform = getPlatform();

function getStatusTone(statusMessage: string): "success" | "warning" | "danger" {
  if (statusMessage.startsWith("✓")) return "success";
  if (statusMessage.toLowerCase().includes("cancelled")) return "warning";
  return "danger";
}

function getCleanStatusMessage(statusMessage: string): string {
  return statusMessage.replace(/^[✓✗⚠]\s*/, "");
}

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
  const statusTone = statusMessage ? getStatusTone(statusMessage) : "success";
  const StatusIcon = statusTone === "success" ? CheckCircle2 : CircleAlert;

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
    } catch (error) {
      setStatusMessage(`Save failed: ${error}`);
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
    } catch (error) {
      setStatusMessage(`Save failed: ${error}`);
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
    } catch (error) {
      setStatusMessage(`Open failed: ${error}`);
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
    } catch (error) {
      setStatusMessage(`Open failed: ${error}`);
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
    } catch (error) {
      setStatusMessage(`Save failed: ${error}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <SettingsPage>
      <SettingsSection
        title="Project"
        description="Current editable workspace and map metadata."
        actions={<SettingBadge tone={dirty ? "warning" : "success"}>{dirty ? "Unsaved" : "Clean"}</SettingBadge>}
      >
        <SettingRow label="Project Name">
          <Input
            type="text"
            value={editableProjectName}
            onChange={(e) => setEditableProjectName(e.target.value)}
            placeholder="Untitled Project"
          />
        </SettingRow>
        <SettingRow label="Map Name">
          <Input
            type="text"
            value={editableMapName}
            onChange={(e) => handleMapNameChange(e.target.value)}
            placeholder="Untitled Map"
          />
        </SettingRow>
        <SettingRow label="Mode">
          <SettingBadge tone={canEdit ? "success" : "warning"}>{canEdit ? "Editable Project" : "Procedural View"}</SettingBadge>
        </SettingRow>
        <SettingRow label="Project Path" align="start">
          <ReadonlyField>{editorWorkspace.currentProjectPath ?? "No project selected"}</ReadonlyField>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Operations">
        <div className="flex flex-wrap gap-2 py-2">
          <SettingsButton
            Icon={FolderOpen}
            onClick={handleOpenProject}
            disabled={processing}
            tone="secondary"
          >
            Open
          </SettingsButton>
          <SettingsButton
            Icon={Save}
            onClick={handleSave}
            disabled={processing}
            tone="primary"
          >
            {hasProject ? "Save" : "Save As"}
          </SettingsButton>
          <SettingsButton
            Icon={SaveAll}
            onClick={handleSaveAs}
            disabled={processing}
          >
            Save Copy
          </SettingsButton>
        </div>
      </SettingsSection>

      {statusMessage && (
        <SettingsSection title="Last Operation">
          <SettingRow label="Status">
            <div className={`flex items-center gap-2 text-xs ${statusTone === "success" ? "text-status-success" : statusTone === "warning" ? "text-status-warning" : "text-status-danger"}`}>
              <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 wrap-break-word">{getCleanStatusMessage(statusMessage)}</span>
            </div>
          </SettingRow>
        </SettingsSection>
      )}

      <SettingsSection
        title="Maps"
        actions={editorWorkspace.currentMapId && <SettingBadge tone="primary">{editorWorkspace.currentMapId}</SettingBadge>}
      >
        <div className="py-2">
          {mapList.length > 0 ? (
            <div className="space-y-1.5">
              {mapList.map((mapRecord) => {
                const active = mapRecord.id === editorWorkspace.currentMapId;
                return (
                  <button
                    key={mapRecord.id}
                    onClick={() => void handleOpenMap(mapRecord.id)}
                    disabled={processing || active}
                    className={`flex h-8 w-full items-center justify-between gap-2 rounded-md border px-2 text-left text-xs transition-colors ${
                      active
                        ? "border-accent-primary/45 bg-accent-primary/15 text-content-primary"
                        : "border-stroke-subtle bg-surface-control text-content-secondary hover:border-stroke-default hover:bg-surface-control-hover hover:text-content-primary"
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Layers className="h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden="true" />
                      <span className="truncate">{mapRecord.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-content-muted">{mapRecord.id}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-content-muted">No maps saved yet.</div>
          )}
        </div>

        <SettingRow label="Create Map">
          <div className="flex min-w-0 gap-2">
            <Input
              type="text"
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
              placeholder="New map name"
              disabled={!hasProject || processing}
              className="min-w-0 flex-1"
            />
            <SettingsButton
              Icon={Plus}
              onClick={handleCreateMap}
              disabled={!hasProject || processing}
              tone="success"
            >
              New
            </SettingsButton>
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Project Files">
        <SettingRow label="Project Data">
          <ReadonlyField>project.json</ReadonlyField>
        </SettingRow>
        <SettingRow label="Runtime Settings">
          <ReadonlyField>settings.json</ReadonlyField>
        </SettingRow>
        <SettingRow label="Map Directory">
          <ReadonlyField>maps/&lt;map-id&gt;/</ReadonlyField>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}