// WorldDebugTab: source asset and partition diagnostics for editor world data.
// WorldDebugTab：编辑器世界数据的 source 资产与分区诊断。

import { useEffect, useState } from "react";
import { getPlatform } from "@/platform";
import { formatUnknownError } from "@/platform/errorUtils";
import type { EditorAppSession } from "@editor/app";
import type { RuntimeProfilerSnapshot } from "@game/app";
import type { MapData } from "@project/MapData";
import type { EditorWorkspaceController } from "@editor/ui/hooks/useEditorWorkspace";
import { ReadonlyField, SettingBadge, SettingRow, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";

const platform = getPlatform();
const WORLD_DEBUG_POLL_INTERVAL_MS = 400;

type DiagnosticStatus = "idle" | "checking" | "ready" | "error";

type AssetDiagnostics = {
  status: DiagnosticStatus;
  generationStages: number;
  generationRules: number;
  terrainRegions: number;
  paintRegions: number;
  vegetationRegions: number;
  vegetationModels: number;
  objectCells: number;
  objectCount: number;
  checkedPacks: number;
  checkedBytes: number;
  issues: string[];
};

type MetricTone = "neutral" | "success" | "warning" | "danger" | "info";

type MetricItem = {
  label: string;
  value: string;
  detail?: string;
  tone?: MetricTone;
};

const emptyDiagnostics: AssetDiagnostics = {
  status: "idle",
  generationStages: 0,
  generationRules: 0,
  terrainRegions: 0,
  paintRegions: 0,
  vegetationRegions: 0,
  vegetationModels: 0,
  objectCells: 0,
  objectCount: 0,
  checkedPacks: 0,
  checkedBytes: 0,
  issues: [],
};

type WorldDebugTabProps = {
  editorApp: EditorAppSession | null;
  editorWorkspace: EditorWorkspaceController;
};

export function WorldDebugTab({ editorApp, editorWorkspace }: WorldDebugTabProps) {
  const [profiler, setProfiler] = useState<RuntimeProfilerSnapshot | null>(() => editorApp?.getProfilerSnapshot() ?? null);
  const [diagnostics, setDiagnostics] = useState<AssetDiagnostics>(emptyDiagnostics);

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
    if (!editorApp || !mapDirectory) {
      setDiagnostics(emptyDiagnostics);
      return undefined;
    }

    setDiagnostics({ ...emptyDiagnostics, status: "checking" });
    void loadAssetDiagnostics(editorApp, mapDirectory)
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
  }, [editorApp, editorWorkspace.currentMapDirectory]);

  const issueCount = diagnostics.issues.length;
  const healthTone = diagnostics.status === "checking"
    ? "info"
    : issueCount > 0 || diagnostics.status === "error"
      ? "danger"
      : diagnostics.status === "ready"
        ? "success"
        : "warning";
  const healthLabel = diagnostics.status === "checking"
    ? "Checking"
    : issueCount > 0
      ? `${issueCount} issue${issueCount === 1 ? "" : "s"}`
      : diagnostics.status === "ready"
        ? "Healthy"
        : "Idle";
  const partition = profiler?.partition ?? null;
  const partitionActive = (partition?.activeCells ?? 0) > 0;

  return (
    <SettingsPage>
      <SettingsSection title="Asset Health" actions={<SettingBadge tone={healthTone}>{healthLabel}</SettingBadge>}>
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

async function loadAssetDiagnostics(editorApp: EditorAppSession, mapDirectory: string): Promise<AssetDiagnostics> {
  const issues: string[] = [];
  const mapData = editorApp.exportCurrentMapData();
  const diagnostics: AssetDiagnostics = {
    ...emptyDiagnostics,
    status: "ready",
    issues,
  };

  const generationGraph = await readJsonManifest(joinPath(mapDirectory, mapData.generationGraphPath), issues);
  const generationStages = readRecordProperty(generationGraph, "stages");
  diagnostics.generationStages = countRecordEntries(generationStages);
  diagnostics.generationRules = countGenerationGraphRules(generationStages);

  const terrainManifest = await readJsonManifest(joinPath(mapDirectory, mapData.terrainPath), issues);
  diagnostics.terrainRegions = countRecordEntries(readRecordProperty(terrainManifest, "regions"));
  await validateRegionPacks(mapDirectory, terrainManifest, "heightpack", issues, diagnostics);

  const paintManifest = await readJsonManifest(joinPath(mapDirectory, mapData.paintPath), issues);
  const splatMaps = readRecordProperty(paintManifest, "splatMaps");
  diagnostics.paintRegions = countRecordEntries(readRecordProperty(splatMaps, "regions"));
  await validateRegionPacks(mapDirectory, splatMaps, "paintpack", issues, diagnostics);

  const vegetationManifest = await readJsonManifest(joinPath(mapDirectory, mapData.vegetationPath), issues);
  diagnostics.vegetationModels = countRecordEntries(readRecordProperty(vegetationManifest, "models"));
  const instances = readRecordProperty(vegetationManifest, "instances");
  diagnostics.vegetationRegions = countRecordEntries(readRecordProperty(instances, "regions"));
  await validateRegionPacks(mapDirectory, instances, "vegpack", issues, diagnostics);

  const objectManifest = await readJsonManifest(joinPath(mapDirectory, mapData.objectsPath ?? "objects/manifest.json"), issues);
  await validateObjectPacks(mapDirectory, objectManifest, issues, diagnostics, mapData);

  return diagnostics;
}

function countGenerationGraphRules(stages: Record<string, unknown> | null): number {
  if (!stages) {
    return 0;
  }

  let count = 0;
  for (const stage of Object.values(stages)) {
    const record = asRecord(stage);
    if (!record) {
      continue;
    }

    const operations = Array.isArray(record.operations) ? record.operations : [];
    const rules = Array.isArray(record.rules) ? record.rules : [];
    count += operations.length + rules.length;
  }

  return count;
}

async function validateRegionPacks(
  mapDirectory: string,
  manifestSection: Record<string, unknown> | null,
  extension: string,
  issues: string[],
  diagnostics: AssetDiagnostics,
): Promise<void> {
  if (!manifestSection) {
    return;
  }

  const regionsDirectory = readStringProperty(manifestSection, "regionsDirectory");
  const regionIntegrity = readRecordProperty(manifestSection, "regionIntegrity");
  if (!regionsDirectory || !regionIntegrity) {
    issues.push(`${extension} manifest is missing region integrity`);
    return;
  }

  for (const [key, integrity] of Object.entries(regionIntegrity)) {
    const regionPath = `${regionsDirectory}/r_${formatRegionFileKey(key)}.${extension}`;
    await validatePackIntegrity(joinPath(mapDirectory, regionPath), integrity, issues, diagnostics);
  }
}

async function validateObjectPacks(
  mapDirectory: string,
  manifest: Record<string, unknown> | null,
  issues: string[],
  diagnostics: AssetDiagnostics,
  mapData: MapData,
): Promise<void> {
  const cells = readRecordProperty(manifest, "cells");
  if (!cells) {
    issues.push("object manifest is missing cells");
    return;
  }

  diagnostics.objectCells = Object.keys(cells).length;
  for (const [key, value] of Object.entries(cells)) {
    const cell = asRecord(value);
    const cellPath = readStringProperty(cell, "path");
    if (!cellPath) {
      issues.push(`object cell '${key}' is missing path`);
      continue;
    }

    await validatePackIntegrity(joinPath(mapDirectory, cellPath), cell, issues, diagnostics);
    const pack = await readJsonManifest(joinPath(mapDirectory, cellPath), issues);
    const objects = Array.isArray(pack?.objects) ? pack.objects : [];
    const expectedCount = readNumberProperty(cell, "objectCount") ?? 0;
    diagnostics.objectCount += expectedCount;
    if (objects.length !== expectedCount) {
      issues.push(`object cell '${key}' count ${objects.length} != ${expectedCount}`);
    }
  }

  if (!mapData.objectsPath) {
    issues.push("map data is missing objectsPath");
  }
}

async function validatePackIntegrity(
  filePath: string,
  integrity: unknown,
  issues: string[],
  diagnostics: AssetDiagnostics,
): Promise<void> {
  const record = asRecord(integrity);
  const expectedByteLength = readNumberProperty(record, "byteLength");
  const expectedSha256 = readStringProperty(record, "sha256");
  if (expectedByteLength === null || !expectedSha256) {
    issues.push(`${basename(filePath)} is missing integrity metadata`);
    return;
  }

  try {
    const bytes = decodeBase64(await platform.files.readBinaryBase64(filePath));
    diagnostics.checkedPacks += 1;
    diagnostics.checkedBytes += bytes.byteLength;
    if (bytes.byteLength !== expectedByteLength) {
      issues.push(`${basename(filePath)} byteLength ${bytes.byteLength} != ${expectedByteLength}`);
    }

    const actualSha256 = await sha256Hex(bytes);
    if (actualSha256 !== expectedSha256) {
      issues.push(`${basename(filePath)} sha256 mismatch`);
    }
  } catch (error) {
    issues.push(`${basename(filePath)} ${formatUnknownError(error)}`);
  }
}

async function readJsonManifest(filePath: string, issues: string[]): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await platform.files.readText(filePath)) as unknown;
    return asRecord(parsed);
  } catch (error) {
    issues.push(`${basename(filePath)} ${formatUnknownError(error)}`);
    return null;
  }
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

function readRecordProperty(value: Record<string, unknown> | null, property: string): Record<string, unknown> | null {
  return asRecord(value?.[property]);
}

function readStringProperty(value: Record<string, unknown> | null, property: string): string | null {
  const nextValue = value?.[property];
  return typeof nextValue === "string" ? nextValue : null;
}

function readNumberProperty(value: Record<string, unknown> | null, property: string): number | null {
  const nextValue = value?.[property];
  return typeof nextValue === "number" && Number.isFinite(nextValue) ? nextValue : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function countRecordEntries(value: Record<string, unknown> | null): number {
  return value ? Object.keys(value).length : 0;
}

function formatRegionFileKey(key: string): string {
  const [x, z] = key.split(",").map(Number);
  return `${formatGridCoordinate(x)}_${formatGridCoordinate(z)}`;
}

function formatGridCoordinate(value: number): string {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

function joinPath(directory: string, relativePath: string): string {
  return `${directory.replace(/[\\/]$/, "")}/${relativePath}`;
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = window.atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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