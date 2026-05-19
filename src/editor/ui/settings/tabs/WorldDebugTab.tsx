// WorldDebugTab: source asset and partition diagnostics for editor world data.
// WorldDebugTab：编辑器世界数据的 source 资产与分区诊断。

import { useEffect, useState } from "react";
import { Copy, Crosshair, Eye, EyeOff, MousePointer2, Play, RefreshCw, Route } from "lucide-react";
import { getPlatform } from "@/platform";
import { formatUnknownError } from "@/platform/errorUtils";
import type { EditorAppSession } from "@editor/app";
import type { RuntimeProfilerSnapshot } from "@game/app";
import type { WorldNavPathResult } from "@game/world/partition";
import type { EditorWorkspaceController } from "@editor/ui/hooks/useEditorWorkspace";
import { ReadonlyField, SettingBadge, SettingRow, SettingsButton, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";
import { DiagnosticIssueList, WorldRebuildConsole } from "./WorldRebuildConsole";
import {
  collectLiveRebuildState,
  createEditorGraphRunRequest,
  createEditorRebuildPlan,
  createEditorSelectionRebuildPlan,
  createGraphRunCommands,
  emptyDiagnostics,
  formatSelectionKind,
  formatShortTimestamp,
  formatStageList,
  loadAssetDiagnostics,
  type AssetDiagnostics,
  type EditorRebuildPlan,
  type LiveRebuildState,
  type MetricTone,
  type RebuildCommand,
  type WorldDebugSelection,
  type WorldDebugSelectionKind,
  type WorldDebugPatchLayerStack,
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

type NavProbePoint = { x: number; z: number };

export function WorldDebugTab({ editorApp, editorWorkspace }: WorldDebugTabProps) {
  const [profiler, setProfiler] = useState<RuntimeProfilerSnapshot | null>(() => editorApp?.getProfilerSnapshot() ?? null);
  const [diagnostics, setDiagnostics] = useState<AssetDiagnostics>(emptyDiagnostics);
  const [diagnosticsRevision, setDiagnosticsRevision] = useState(0);
  const [selectionKind, setSelectionKind] = useState<WorldDebugSelectionKind>("cell");
  const [selectedKey, setSelectedKey] = useState("");
  const [graphRunStatus, setGraphRunStatus] = useState("");
  const [debugSettingsRevision, setDebugSettingsRevision] = useState(0);
  const [navProbeStart, setNavProbeStart] = useState<NavProbePoint | null>(null);
  const [navProbeEnd, setNavProbeEnd] = useState<NavProbePoint | null>(null);
  const [navProbeResult, setNavProbeResult] = useState<WorldNavPathResult | null>(null);

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
  const rebuildPlan = createEditorRebuildPlan(editorWorkspace.currentMapId, diagnostics, liveRebuild, editorWorkspace.currentProjectPath);
  const selectionKeys = getSelectionKeys(diagnostics, selectionKind);
  const selection: WorldDebugSelection | null = selectedKey && selectionKeys.includes(selectedKey)
    ? { kind: selectionKind, key: selectedKey }
    : null;
  const selectionPlan = createEditorSelectionRebuildPlan(editorWorkspace.currentMapId, diagnostics, editorWorkspace.currentProjectPath, selection);
  const graphCommands = createGraphRunCommands(editorWorkspace.currentProjectPath, editorWorkspace.currentMapId, selection);
  const staleSourceCount = diagnostics.cookedSources.filter((source) => source.status === "stale").length;
  const missingSourceCount = diagnostics.cookedSources.filter((source) => source.status === "missing").length;
  const freshSourceCount = diagnostics.cookedSources.filter((source) => source.status === "fresh").length;

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
  const debugSettings = debugSettingsRevision >= 0 ? editorApp?.getSettingsSnapshot().debug ?? null : null;
  const refreshDiagnostics = () => setDiagnosticsRevision((revision) => revision + 1);

  useEffect(() => {
    const keys = getSelectionKeys(diagnostics, selectionKind);
    setSelectedKey((current) => keys.includes(current) ? current : keys[0] ?? "");
  }, [diagnostics, selectionKind]);

  async function handleCopyGraphCommand(command: string): Promise<void> {
    setGraphRunStatus("");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is not available");
      }
      await navigator.clipboard.writeText(command);
      setGraphRunStatus("Copied");
    } catch (error) {
      const message = `Copy failed: ${formatUnknownError(error)}`;
      setGraphRunStatus(message);
      await platform.dialogs.notify(message, { title: "World Graph", kind: "warning" });
    }
  }

  async function handleRunGraph(kind: RebuildCommand["kind"]): Promise<void> {
    const request = createEditorGraphRunRequest(editorWorkspace.currentProjectPath, editorWorkspace.currentMapId, selection, kind === "dryRun");
    if (!request || !platform.hasCapability("worldGraphExecution")) {
      await platform.dialogs.notify("World generation graph execution is not available", { title: "World Graph", kind: "warning" });
      return;
    }

    setGraphRunStatus(kind === "dryRun" ? "Planning" : "Running");
    try {
      const result = await platform.world.runGenerationGraph(request);
      setGraphRunStatus(result.exitCode === 0 ? "Graph OK" : `Graph exited ${result.exitCode}`);
      if (result.exitCode === 0) {
        refreshDiagnostics();
      } else {
        await platform.dialogs.notify(`${result.stderr || result.stdout || "World graph failed"}`, { title: "World Graph", kind: "error" });
      }
    } catch (error) {
      const message = `Graph failed: ${formatUnknownError(error)}`;
      setGraphRunStatus(message);
      await platform.dialogs.notify(message, { title: "World Graph", kind: "error" });
    }
  }

  function handleToggleCollisionOverlay(): void {
    const current = editorApp?.getSettingsSnapshot().debug.showCollisionOverlay ?? false;
    editorApp?.updateSettings({ debug: { showCollisionOverlay: !current } });
    setDebugSettingsRevision((revision) => revision + 1);
  }

  function handleToggleNavOverlay(): void {
    const current = editorApp?.getSettingsSnapshot().debug.showNavOverlay ?? false;
    editorApp?.updateSettings({ debug: { showNavOverlay: !current } });
    setDebugSettingsRevision((revision) => revision + 1);
  }

  function handleCaptureNavProbe(point: "start" | "end", source: "player" | "mouse"): void {
    const position = source === "player" ? editorApp?.getPlayerPosition() : editorApp?.getMousePosition();
    if (!position || ("valid" in position && !position.valid)) {
      setNavProbeResult({ status: "unreachable", startNode: null, endNode: null, cost: Infinity, nodes: [] });
      return;
    }

    const nextPoint = { x: roundDisplay(position.x), z: roundDisplay(position.z) };
    if (point === "start") {
      setNavProbeStart(nextPoint);
    } else {
      setNavProbeEnd(nextPoint);
    }
  }

  function handleRunNavProbe(): void {
    if (!editorApp || !navProbeStart || !navProbeEnd) {
      return;
    }

    setNavProbeResult(editorApp.queryNavPath(navProbeStart, navProbeEnd, 256));
  }

  return (
    <SettingsPage>
      <SettingsSection
        id="world-debug-asset-health"
        title="Asset Health"
        actions={(
          <div className="flex items-center gap-1.5">
            <SettingBadge tone={healthTone}>{healthLabel}</SettingBadge>
            <SettingsButton
              Icon={RefreshCw}
              size="icon"
              aria-label="Refresh diagnostics"
              title="Refresh diagnostics"
              onClick={refreshDiagnostics}
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
        <SettingRow label="Layer Stack" align="start">
          <LayerCompositionPanel stacks={diagnostics.patchLayers} />
        </SettingRow>
        <SettingRow label="Diagnostics" align="start">
          {diagnostics.status === "ready" || issueCount > 0 ? <DiagnosticIssueList issues={diagnostics.issues} onRefreshDiagnostics={refreshDiagnostics} /> : <ReadonlyField>No diagnostics available</ReadonlyField>}
        </SettingRow>
      </SettingsSection>

      <SettingsSection id="world-debug-rebuild-graph" title="Rebuild Graph" actions={<SettingBadge tone={diagnostics.generationExecutors > 0 ? "success" : "warning"}>{diagnostics.generationPolicy}</SettingBadge>}>
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
        <SettingRow label="Scope Selection" align="start">
          <WorldScopeSelectionPanel
            diagnostics={diagnostics}
            selectionKind={selectionKind}
            selectedKey={selectedKey}
            selectionPlan={selectionPlan}
            onSelectionKindChange={setSelectionKind}
            onSelectedKeyChange={setSelectedKey}
          />
        </SettingRow>
        <SettingRow label="Graph Run" align="start">
          <GraphRunPanel
            commands={graphCommands}
            canRun={platform.hasCapability("worldGraphExecution") && selection !== null}
            status={graphRunStatus}
            onCopy={handleCopyGraphCommand}
            onRun={handleRunGraph}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection id="world-debug-rebuild-plan" title="Rebuild Plan" actions={<SettingBadge tone={rebuildPlan.tone}>{rebuildPlan.label}</SettingBadge>}>
        <SettingRow label="Changed Inputs" align="start">
          <SourceDriftList diagnostics={diagnostics} liveRebuild={liveRebuild} rebuildPlan={rebuildPlan} />
        </SettingRow>
        <SettingRow label="Affected Scopes" align="start">
          <MetricGrid
            items={[
              { label: "Stages", value: formatCount(rebuildPlan.changedStages.length), detail: formatStageList(rebuildPlan.changedStages), tone: rebuildPlan.changedStages.length > 0 ? "warning" : "success" },
              { label: "Terrain", value: formatCount(rebuildPlan.scopes.terrainRegions.length), detail: "regions" },
              { label: "Paint", value: formatCount(rebuildPlan.scopes.paintRegions.length), detail: "regions" },
              { label: "Budget", value: formatCount(rebuildPlan.budget.estimatedArtifacts), detail: rebuildPlan.budget.exceeded ? "blocked" : "artifacts", tone: rebuildPlan.budget.exceeded ? "danger" : "info" },
            ]}
          />
        </SettingRow>
        <WorldRebuildConsole
          projectPath={editorWorkspace.currentProjectPath}
          mapId={editorWorkspace.currentMapId}
          plan={rebuildPlan}
          onDiagnosticsRefresh={refreshDiagnostics}
        />
      </SettingsSection>

      <SettingsSection
        id="world-debug-partition-runtime"
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
        <SettingRow label="Inspector" align="start">
          <WorldPartitionInspectorPanel
            collisionOverlay={debugSettings?.showCollisionOverlay ?? false}
            navOverlay={debugSettings?.showNavOverlay ?? false}
            start={navProbeStart}
            end={navProbeEnd}
            result={navProbeResult}
            canQuery={editorApp !== null && partitionActive}
            onToggleCollision={handleToggleCollisionOverlay}
            onToggleNav={handleToggleNavOverlay}
            onCaptureStartFromPlayer={() => handleCaptureNavProbe("start", "player")}
            onCaptureEndFromMouse={() => handleCaptureNavProbe("end", "mouse")}
            onRunQuery={handleRunNavProbe}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection id="world-debug-streaming" title="Streaming" actions={<SettingBadge tone="info">{profiler?.fps ?? 0} FPS</SettingBadge>}>
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

function WorldScopeSelectionPanel({
  diagnostics,
  selectionKind,
  selectedKey,
  selectionPlan,
  onSelectionKindChange,
  onSelectedKeyChange,
}: {
  diagnostics: AssetDiagnostics;
  selectionKind: WorldDebugSelectionKind;
  selectedKey: string;
  selectionPlan: EditorRebuildPlan;
  onSelectionKindChange: (kind: WorldDebugSelectionKind) => void;
  onSelectedKeyChange: (key: string) => void;
}) {
  const kinds: WorldDebugSelectionKind[] = ["terrain", "paint", "vegetation", "cell"];
  const keys = getSelectionKeys(diagnostics, selectionKind);
  const topBudgets = diagnostics.cellBudgets.slice(0, 4);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {kinds.map((kind) => {
          const count = getSelectionKeys(diagnostics, kind).length;
          return (
            <SettingsButton
              key={kind}
              Icon={Crosshair}
              size="sm"
              tone={selectionKind === kind ? "primary" : "neutral"}
              onClick={() => onSelectionKindChange(kind)}
              disabled={count === 0}
            >
              {formatSelectionKind(kind)}
            </SettingsButton>
          );
        })}
      </div>
      <select
        value={selectedKey}
        onChange={(event) => onSelectedKeyChange(event.currentTarget.value)}
        disabled={keys.length === 0}
        className="field-surface h-8 w-full rounded-md border px-2 text-xs text-content-primary outline-none"
      >
        {keys.length === 0 ? <option value="">No scopes</option> : keys.map((key) => <option key={key} value={key}>{key}</option>)}
      </select>
      <MetricGrid
        items={[
          { label: "Stages", value: formatCount(selectionPlan.changedStages.length), detail: formatStageList(selectionPlan.changedStages), tone: selectionPlan.status === "ready" ? "info" : "warning" },
          { label: "Artifacts", value: formatCount(selectionPlan.budget.estimatedArtifacts), detail: selectionPlan.budget.exceeded ? "blocked" : "estimate", tone: selectionPlan.budget.exceeded ? "danger" : "info" },
        ]}
      />
      {topBudgets.length > 0 && selectionKind === "cell" && (
        <div className="grid grid-cols-2 gap-2">
          {topBudgets.map((budget) => (
            <MetricTile
              key={budget.key}
              label={budget.key}
              value={budget.estimatedCost.toFixed(1)}
              detail={`${formatCount(budget.objectCount)} obj / ${formatBytes(budget.compressedBytes)}`}
              tone={budget.rating === "over" ? "danger" : budget.rating === "watch" ? "warning" : "success"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GraphRunPanel({
  commands,
  canRun,
  status,
  onCopy,
  onRun,
}: {
  commands: RebuildCommand[];
  canRun: boolean;
  status: string;
  onCopy: (command: string) => Promise<void>;
  onRun: (kind: RebuildCommand["kind"]) => Promise<void>;
}) {
  if (commands.length === 0) {
    return <ReadonlyField>Select a region or partition cell</ReadonlyField>;
  }

  return (
    <div className="space-y-2">
      {commands.map((entry) => (
        <div key={entry.label} className="field-surface rounded-md border p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-content-muted">{entry.label}</div>
            <div className="flex items-center gap-1.5">
              <SettingsButton Icon={Copy} size="sm" onClick={() => void onCopy(entry.command)}>
                Copy
              </SettingsButton>
              <SettingsButton Icon={Play} size="sm" tone={entry.kind === "cook" ? "warning" : "info"} disabled={!canRun} onClick={() => void onRun(entry.kind)}>
                Run
              </SettingsButton>
            </div>
          </div>
          <div className="break-all font-mono text-[11px] leading-4 text-content-primary">{entry.command}</div>
        </div>
      ))}
      {status && <ReadonlyField>{status}</ReadonlyField>}
    </div>
  );
}

function WorldPartitionInspectorPanel({
  collisionOverlay,
  navOverlay,
  start,
  end,
  result,
  canQuery,
  onToggleCollision,
  onToggleNav,
  onCaptureStartFromPlayer,
  onCaptureEndFromMouse,
  onRunQuery,
}: {
  collisionOverlay: boolean;
  navOverlay: boolean;
  start: NavProbePoint | null;
  end: NavProbePoint | null;
  result: WorldNavPathResult | null;
  canQuery: boolean;
  onToggleCollision: () => void;
  onToggleNav: () => void;
  onCaptureStartFromPlayer: () => void;
  onCaptureEndFromMouse: () => void;
  onRunQuery: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <SettingsButton Icon={collisionOverlay ? Eye : EyeOff} size="sm" tone={collisionOverlay ? "success" : "neutral"} onClick={onToggleCollision}>
          Collision
        </SettingsButton>
        <SettingsButton Icon={navOverlay ? Eye : EyeOff} size="sm" tone={navOverlay ? "success" : "neutral"} onClick={onToggleNav}>
          Nav
        </SettingsButton>
        <SettingsButton Icon={Crosshair} size="sm" disabled={!canQuery} onClick={onCaptureStartFromPlayer}>
          Start
        </SettingsButton>
        <SettingsButton Icon={MousePointer2} size="sm" disabled={!canQuery} onClick={onCaptureEndFromMouse}>
          End
        </SettingsButton>
        <SettingsButton Icon={Route} size="sm" tone="primary" disabled={!canQuery || !start || !end} onClick={onRunQuery}>
          Query
        </SettingsButton>
      </div>
      <MetricGrid
        items={[
          { label: "Start", value: formatProbePoint(start), detail: result?.startNode?.id ?? "nav snap" },
          { label: "End", value: formatProbePoint(end), detail: result?.endNode?.id ?? "nav snap" },
          { label: "Status", value: result?.status ?? "idle", detail: result ? `${formatCount(result.nodes.length)} nodes` : "not queried", tone: getNavResultTone(result) },
          { label: "Cost", value: Number.isFinite(result?.cost ?? Infinity) ? (result?.cost ?? 0).toFixed(2) : "inf", detail: "path cost", tone: result?.status === "ok" ? "success" : "warning" },
        ]}
      />
    </div>
  );
}

function LayerCompositionPanel({ stacks }: { stacks: WorldDebugPatchLayerStack[] }) {
  if (stacks.length === 0) {
    return <ReadonlyField>No patch layers declared</ReadonlyField>;
  }

  return (
    <div className="space-y-2">
      {stacks.map((stack) => {
        const activeLayer = stack.layers.find((layer) => layer.id === stack.activeLayerId);
        return (
          <div key={stack.asset} className="field-surface rounded-md border p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-content-muted">{stack.asset}</div>
              <SettingBadge tone={stack.mode === "ordered-nondestructive-v1" ? "success" : "warning"}>{activeLayer?.label ?? stack.activeLayerId}</SettingBadge>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {stack.layers.map((layer) => (
                <MetricTile
                  key={layer.id}
                  label={layer.label}
                  value={layer.kind}
                  detail={`${formatCount(layer.regionCount)} regions${layer.enabled ? "" : " off"}`}
                  tone={!layer.enabled ? "warning" : layer.kind === "manual" ? "info" : layer.kind === "base" ? "neutral" : "success"}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricTile({ label, value, detail, tone }: MetricItem) {
  return (
    <div className="field-surface rounded-md border p-2">
      <div className="truncate text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm ${getMetricToneClass(tone)}`}>{value}</div>
      {detail && <div className="mt-0.5 truncate text-[11px] text-content-muted">{detail}</div>}
    </div>
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

function formatProbePoint(point: NavProbePoint | null): string {
  return point ? `${point.x.toFixed(0)}, ${point.z.toFixed(0)}` : "none";
}

function getNavResultTone(result: WorldNavPathResult | null): MetricTone {
  if (!result) {
    return "neutral";
  }

  return result.status === "ok" ? "success" : "warning";
}

function roundDisplay(value: number): number {
  return Math.round(value * 100) / 100;
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

function getSelectionKeys(diagnostics: AssetDiagnostics, kind: WorldDebugSelectionKind): string[] {
  switch (kind) {
    case "terrain":
      return diagnostics.terrainRegionKeys;
    case "paint":
      return diagnostics.paintRegionKeys;
    case "vegetation":
      return diagnostics.vegetationRegionKeys;
    case "cell":
      return diagnostics.partitionCellKeys;
  }
}
