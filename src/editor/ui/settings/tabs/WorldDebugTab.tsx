// WorldDebugTab: source asset and partition diagnostics for editor world data.
// WorldDebugTab：编辑器世界数据的 source 资产与分区诊断。

import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { getPlatform } from "@/platform";
import { formatUnknownError } from "@/platform/errorUtils";
import type { EditorAppSession } from "@editor/app";
import type { RuntimeProfilerSnapshot } from "@game/app";
import type { EditorWorkspaceController } from "@editor/ui/hooks/useEditorWorkspace";
import { ReadonlyField, SettingBadge, SettingRow, SettingsButton, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";
import {
  collectLiveRebuildState,
  createEditorRebuildPlan,
  emptyDiagnostics,
  formatShortTimestamp,
  formatStageList,
  loadAssetDiagnostics,
  type AssetDiagnostics,
  type EditorRebuildPlan,
  type LiveRebuildState,
  type MetricTone,
} from "./worldDebugDiagnostics";

const platform = getPlatform();
const WORLD_DEBUG_POLL_INTERVAL_MS = 400;

type MetricItem = {
  label: string;
  value: string;
  detail?: string;
  tone?: MetricTone;
};

type WorldDebugTabProps = {
  editorApp: EditorAppSession | null;
  editorWorkspace: EditorWorkspaceController;
};

export function WorldDebugTab({ editorApp, editorWorkspace }: WorldDebugTabProps) {
  const [profiler, setProfiler] = useState<RuntimeProfilerSnapshot | null>(() => editorApp?.getProfilerSnapshot() ?? null);
  const [diagnostics, setDiagnostics] = useState<AssetDiagnostics>(emptyDiagnostics);
  const [diagnosticsRevision, setDiagnosticsRevision] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!editorApp) {
      setProfiler(null);
      return undefined;
    }

    const update = () => setProfiler(editorApp.getProfilerSnapshot());
    update();
    const interval = window.setInterval(update, WORLD_DEBUG_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [editorApp]);

  useEffect(() => {
    let cancelled = false;
    const mapDirectory = editorWorkspace.currentMapDirectory;
    const projectPath = editorWorkspace.currentProjectPath;
    const mapId = editorWorkspace.currentMapId;
    if (!editorApp || !mapDirectory) {
      setDiagnostics(emptyDiagnostics);
      return undefined;
    }

    setDiagnostics({ ...emptyDiagnostics, status: "checking" });
    void loadAssetDiagnostics(editorApp, mapDirectory, projectPath, mapId)
      .then((nextDiagnostics) => {
        if (!cancelled) {
          setDiagnostics(nextDiagnostics);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostics({
            ...emptyDiagnostics,
            status: "error",
            issues: [formatUnknownError(error)],
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editorApp, editorWorkspace.currentMapDirectory, editorWorkspace.currentProjectPath, editorWorkspace.currentMapId, diagnosticsRevision]);

  const liveRebuild = collectLiveRebuildState(editorApp, diagnostics);
  const rebuildPlan = createEditorRebuildPlan(editorWorkspace.currentMapId, diagnostics, liveRebuild);
  const staleSourceCount = diagnostics.cookedSources.filter((source) => source.status === "stale").length;
  const missingSourceCount = diagnostics.cookedSources.filter((source) => source.status === "missing").length;
  const freshSourceCount = diagnostics.cookedSources.filter((source) => source.status === "fresh").length;

  async function handleCopyCommand(command: string): Promise<void> {
    setCopyStatus("");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is not available");
      }

      await navigator.clipboard.writeText(command);
      setCopyStatus("Copied");
    } catch (error) {
      const message = `Copy failed: ${formatUnknownError(error)}`;
      setCopyStatus(message);
      await platform.dialogs.notify(message, { title: "Clipboard", kind: "warning" });
    }
  }

  const issueCount = diagnostics.issues.length;
  const healthTone = diagnostics.status === "checking"
    ? "info"
    : issueCount > 0 || diagnostics.status === "error"
      ? "danger"
      : staleSourceCount > 0 || missingSourceCount > 0 || diagnostics.cookedStatus === "missing"
        ? "warning"
        : diagnostics.status === "ready"
          ? "success"
          : "warning";
  const healthLabel = diagnostics.status === "checking"
    ? "Checking"
    : issueCount > 0
      ? `${issueCount} issue${issueCount === 1 ? "" : "s"}`
      : staleSourceCount > 0 || missingSourceCount > 0
        ? "Cooked Stale"
        : diagnostics.cookedStatus === "missing"
          ? "Cook Missing"
          : diagnostics.status === "ready"
            ? "Healthy"
            : "Idle";
  const partition = profiler?.partition ?? null;
  const partitionActive = (partition?.activeCells ?? 0) > 0;

  return (
    <SettingsPage>
      <SettingsSection
        title="Asset Health"
        actions={(
          <div className="flex items-center gap-1.5">
            <SettingBadge tone={healthTone}>{healthLabel}</SettingBadge>
            <SettingsButton
              Icon={RefreshCw}
              size="icon"
              aria-label="Refresh diagnostics"
              title="Refresh diagnostics"
              onClick={() => setDiagnosticsRevision((revision) => revision + 1)}
            />
          </div>
        )}
      >
        <SettingRow label="Workspace" align="start">
          <ReadonlyField>{editorWorkspace.currentMapName ?? "No map loaded"}</ReadonlyField>
        </SettingRow>
        <SettingRow label="Source Assets" align="start">
          <MetricGrid
            items={[
              { label: "Graph", value: formatCount(diagnostics.generationStages), detail: `${formatCount(diagnostics.generationRules)} rules` },
              { label: "Terrain", value: formatCount(diagnostics.terrainRegions), detail: "regions" },
              { label: "Paint", value: formatCount(diagnostics.paintRegions), detail: "regions" },
              { label: "Vegetation", value: formatCount(diagnostics.vegetationRegions), detail: `${formatCount(diagnostics.vegetationModels)} models` },
              { label: "Objects", value: formatCount(diagnostics.objectCount), detail: `${formatCount(diagnostics.objectCells)} cells` },
            ]}
          />
        </SettingRow>
        <SettingRow label="Pack Integrity" align="start">
          <MetricGrid
            items={[
              { label: "Checked", value: formatCount(diagnostics.checkedPacks), detail: "packs", tone: diagnostics.checkedPacks > 0 ? "success" : "warning" },
              { label: "Bytes", value: formatBytes(diagnostics.checkedBytes), detail: "hashed" },
              { label: "Issues", value: formatCount(issueCount), detail: diagnostics.status, tone: issueCount > 0 ? "danger" : "success" },
              { label: "Runtime", value: platform.runtime, detail: "platform" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Cooked Sources" align="start">
          <MetricGrid
            items={[
              { label: "Fresh", value: formatCount(freshSourceCount), detail: `${formatCount(diagnostics.cookedSources.length)} tracked`, tone: freshSourceCount > 0 ? "success" : "neutral" },
              { label: "Stale", value: formatCount(staleSourceCount), detail: "hash drift", tone: staleSourceCount > 0 ? "warning" : "success" },
              { label: "Missing", value: formatCount(missingSourceCount), detail: diagnostics.cookedStatus, tone: missingSourceCount > 0 || diagnostics.cookedStatus === "missing" ? "warning" : "success" },
              { label: "Generated", value: formatShortTimestamp(diagnostics.cookedGeneratedAt), detail: "cooked build" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Diagnostics" align="start">
          {issueCount > 0 ? (
            <div className="space-y-1.5">
              {diagnostics.issues.slice(0, 5).map((issue) => (
                <div key={issue} className="field-surface rounded-md border p-2 text-[11px] leading-4 text-status-danger">
                  {issue}
                </div>
              ))}
              {issueCount > 5 && <ReadonlyField>{issueCount - 5} more</ReadonlyField>}
            </div>
          ) : (
            <ReadonlyField>{diagnostics.status === "ready" ? "All checked packs match their manifests" : "No diagnostics available"}</ReadonlyField>
          )}
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Rebuild Graph" actions={<SettingBadge tone={diagnostics.generationExecutors > 0 ? "success" : "warning"}>{diagnostics.generationPolicy}</SettingBadge>}>
        <SettingRow label="Execution" align="start">
          <MetricGrid
            items={[
              { label: "Executors", value: formatCount(diagnostics.generationExecutors), detail: "stages", tone: diagnostics.generationExecutors > 0 ? "success" : "warning" },
              { label: "Scopes", value: formatCount(diagnostics.generationLocalScopes), detail: "local types" },
              { label: "Budgets", value: formatCount(diagnostics.generationBudgets), detail: "limits" },
              { label: "Planner", value: diagnostics.generationPolicy, detail: "policy" },
            ]}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Rebuild Plan" actions={<SettingBadge tone={rebuildPlan.tone}>{rebuildPlan.label}</SettingBadge>}>
        <SettingRow label="Changed Inputs" align="start">
          <SourceDriftList diagnostics={diagnostics} liveRebuild={liveRebuild} rebuildPlan={rebuildPlan} />
        </SettingRow>
        <SettingRow label="Affected Scopes" align="start">
          <MetricGrid
            items={[
              { label: "Stages", value: formatCount(rebuildPlan.changedStages.length), detail: formatStageList(rebuildPlan.changedStages), tone: rebuildPlan.changedStages.length > 0 ? "warning" : "success" },
              { label: "Terrain", value: formatCount(rebuildPlan.scopes.terrainRegions.length), detail: "regions" },
              { label: "Paint", value: formatCount(rebuildPlan.scopes.paintRegions.length), detail: "regions" },
              { label: "Cells", value: formatCount(rebuildPlan.scopes.partitionCells.length), detail: "partition" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Commands" align="start">
          <CommandList plan={rebuildPlan} copyStatus={copyStatus} onCopy={handleCopyCommand} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Partition Runtime"
        actions={<SettingBadge tone={partitionActive ? "success" : "warning"}>{partitionActive ? "Cooked" : "Source"}</SettingBadge>}
      >
        <SettingRow label="Plan" align="start">
          <MetricGrid
            items={[
              { label: "Active", value: formatCount(partition?.activeCells ?? 0), detail: "cells", tone: partitionActive ? "success" : "warning" },
              { label: "Load", value: formatCount(partition?.plannedLoadCells ?? 0), detail: "planned" },
              { label: "Keep", value: formatCount(partition?.plannedKeepCells ?? 0), detail: "planned" },
              { label: "Unload", value: formatCount(partition?.plannedUnloadCells ?? 0), detail: "planned" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Payloads" align="start">
          <MetricGrid
            items={[
              { label: "Objects", value: formatCount(partition?.loadedObjectCells ?? 0), detail: "cells" },
              { label: "Collision", value: formatCount(partition?.loadedCollisionCells ?? 0), detail: "cells" },
              { label: "Nav", value: formatCount(partition?.loadedNavCells ?? 0), detail: "cells" },
              { label: "Meshes", value: formatCount(partition?.worldObjects.meshes ?? 0), detail: "world objects" },
            ]}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Streaming" actions={<SettingBadge tone="info">{profiler?.fps ?? 0} FPS</SettingBadge>}>
        <SettingRow label="Runtime Scene" align="start">
          <MetricGrid
            items={[
              { label: "Object Cells", value: formatCount(partition?.worldObjects.activeCells ?? 0), detail: "visible" },
              { label: "Objects", value: formatCount(partition?.worldObjects.objects ?? 0), detail: "authored" },
              { label: "Vegetation", value: formatCount(profiler?.vegetation.visibleInstances ?? 0), detail: "visible" },
              { label: "Veg Cells", value: `${formatCount(profiler?.vegetation.visibleCells ?? 0)} / ${formatCount(profiler?.vegetation.spatialCells ?? 0)}` },
            ]}
          />
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}

function SourceDriftList({
  diagnostics,
  liveRebuild,
  rebuildPlan,
}: {
  diagnostics: AssetDiagnostics;
  liveRebuild: LiveRebuildState;
  rebuildPlan: EditorRebuildPlan;
}) {
  const labels = [
    ...rebuildPlan.sourceLabels,
    ...rebuildPlan.liveLabels,
  ];

  if (diagnostics.status === "checking") {
    return <ReadonlyField>Checking source hashes</ReadonlyField>;
  }

  if (labels.length === 0) {
    return <ReadonlyField>Cooked data matches tracked source manifests</ReadonlyField>;
  }

  return (
    <div className="space-y-1.5">
      {labels.slice(0, 6).map((label) => (
        <div key={label} className="field-surface rounded-md border p-2 text-[11px] leading-4 text-content-secondary">
          {label}
        </div>
      ))}
      {labels.length > 6 && <ReadonlyField>{labels.length - 6} more</ReadonlyField>}
      {liveRebuild.unsaved && (
        <div className="field-surface rounded-md border border-status-warning/45 p-2 text-[11px] leading-4 text-status-warning">
          Save the map before running a cooked rebuild.
        </div>
      )}
    </div>
  );
}

function CommandList({
  plan,
  copyStatus,
  onCopy,
}: {
  plan: EditorRebuildPlan;
  copyStatus: string;
  onCopy: (command: string) => Promise<void>;
}) {
  if (plan.commands.length === 0) {
    return <ReadonlyField>{plan.status === "checking" ? "Plan pending" : "No rebuild command needed"}</ReadonlyField>;
  }

  return (
    <div className="space-y-2">
      {plan.commands.map((entry) => (
        <div key={entry.label} className="field-surface rounded-md border p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-content-muted">{entry.label}</div>
            <SettingsButton Icon={Copy} size="sm" onClick={() => void onCopy(entry.command)}>
              Copy
            </SettingsButton>
          </div>
          <div className="break-all font-mono text-[11px] leading-4 text-content-primary">{entry.command}</div>
        </div>
      ))}
      {copyStatus && <ReadonlyField>{copyStatus}</ReadonlyField>}
    </div>
  );
}

function MetricGrid({ items }: { items: MetricItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="field-surface rounded-md border p-2">
          <div className="truncate text-[11px] uppercase tracking-wide text-content-muted">{item.label}</div>
          <div className={`mt-0.5 truncate font-mono text-sm ${getMetricToneClass(item.tone)}`}>{item.value}</div>
          {item.detail && <div className="mt-0.5 truncate text-[11px] text-content-muted">{item.detail}</div>}
        </div>
      ))}
    </div>
  );
}

function getMetricToneClass(tone: MetricTone = "neutral"): string {
  switch (tone) {
    case "success":
      return "text-status-success";
    case "warning":
      return "text-status-warning";
    case "danger":
      return "text-status-danger";
    case "info":
      return "text-status-info";
    default:
      return "text-content-primary";
  }
}

function formatBytes(value: number): string {
  if (value >= 1_048_576) {
    return `${(value / 1_048_576).toFixed(1)} MiB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }

  return `${value} B`;
}

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return value.toFixed(0);
}
