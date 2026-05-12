// ProfilerTab: compact runtime metrics for editor performance diagnosis.
// ProfilerTab：用于编辑器性能诊断的紧凑运行时指标面板。

import { useEffect, useState } from "react";
import type { EditorAppSession } from "@editor/app";
import type { RuntimeProfilerSnapshot } from "@game/app";
import { ReadonlyField, SettingBadge, SettingRow, SettingsPage, SettingsSection } from "@ui/settings/SettingsLayout";

type ProfilerTabProps = {
  editorApp: EditorAppSession | null;
};

type MetricTone = "neutral" | "success" | "warning";

type MetricItem = {
  label: string;
  value: string;
  detail?: string;
  tone?: MetricTone;
};

const PROFILER_POLL_INTERVAL_MS = 250;
const SIXTY_FPS_FRAME_MS = 1000 / 60;
const HEAVY_TRIANGLE_BUDGET = 2_000_000;
const HEAVY_VEGETATION_UPDATE_MS = 2;

export function ProfilerTab({ editorApp }: ProfilerTabProps) {
  const [snapshot, setSnapshot] = useState<RuntimeProfilerSnapshot | null>(() => editorApp?.getProfilerSnapshot() ?? null);

  useEffect(() => {
    if (!editorApp) {
      setSnapshot(null);
      return undefined;
    }

    const update = () => {
      setSnapshot(editorApp.getProfilerSnapshot());
    };

    update();
    const interval = window.setInterval(update, PROFILER_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [editorApp]);

  if (!snapshot) {
    return (
      <SettingsPage>
        <SettingsSection title="Runtime">
          <SettingRow label="Profiler">
            <ReadonlyField>No runtime attached</ReadonlyField>
          </SettingRow>
        </SettingsSection>
      </SettingsPage>
    );
  }

  const vegetation = snapshot.vegetation;
  const frameTone = snapshot.frameMs > SIXTY_FPS_FRAME_MS ? "warning" : "success";
  const vegetationTriangleTone = vegetation.visibleTriangles > HEAVY_TRIANGLE_BUDGET ? "warning" : "success";
  const vegetationUpdateTone = vegetation.visibilityUpdateMs > HEAVY_VEGETATION_UPDATE_MS ? "warning" : "success";

  return (
    <SettingsPage>
      <SettingsSection title="Frame" actions={<SettingBadge tone={frameTone}>{snapshot.fps} FPS</SettingBadge>}>
        <SettingRow label="Timing" align="start">
          <MetricGrid
            items={[
              { label: "Frame", value: formatMs(snapshot.frameMs), detail: "full loop", tone: frameTone },
              { label: "Update", value: formatMs(snapshot.updateMs), detail: "CPU work" },
              { label: "Render", value: formatMs(snapshot.renderMs), detail: "submit" },
              { label: "Budget", value: formatMs(SIXTY_FPS_FRAME_MS), detail: "60 FPS" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Renderer" align="start">
          <MetricGrid
            items={[
              { label: "Draw Calls", value: formatCount(snapshot.renderer.drawCalls) },
              { label: "Triangles", value: formatCount(snapshot.renderer.triangles) },
              { label: "Geometries", value: formatCount(snapshot.renderer.geometries) },
              { label: "Textures", value: formatCount(snapshot.renderer.textures) },
            ]}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Vegetation"
        actions={<SettingBadge tone={vegetationTriangleTone}>{formatCount(vegetation.visibleTriangles)} tris</SettingBadge>}
      >
        <SettingRow label="Visibility" align="start">
          <MetricGrid
            items={[
              { label: "Instances", value: `${formatCount(vegetation.visibleInstances)} / ${formatCount(vegetation.totalInstances)}` },
              { label: "Cells", value: `${formatCount(vegetation.visibleCells)} / ${formatCount(vegetation.spatialCells)}` },
              { label: "Culled Cells", value: formatCount(vegetation.culledCells) },
              { label: "Cull Update", value: formatMs(vegetation.visibilityUpdateMs), tone: vegetationUpdateTone },
            ]}
          />
        </SettingRow>
        <SettingRow label="Cost" align="start">
          <MetricGrid
            items={[
              { label: "Draw Calls", value: formatCount(vegetation.drawCalls) },
              { label: "Shadow Draws", value: formatCount(vegetation.shadowDrawCalls) },
              { label: "Visible Verts", value: formatCount(vegetation.visibleVertices) },
              { label: "Shadow Tris", value: formatCount(vegetation.shadowTriangles) },
            ]}
          />
        </SettingRow>
        <SettingRow label="Runtime Flags" align="start">
          <div className="flex flex-wrap gap-1.5">
            <SettingBadge tone={vegetation.shadowsEnabled ? "warning" : "success"}>
              Shadows {vegetation.shadowsEnabled ? "On" : "Off"}
            </SettingBadge>
            <SettingBadge tone={vegetation.cellFrustumCulling ? "success" : "warning"}>
              Cell Culling {vegetation.cellFrustumCulling ? "On" : "Off"}
            </SettingBadge>
            <SettingBadge tone="info">Distance x{vegetation.maxVisibleDistanceScale.toFixed(1)}</SettingBadge>
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Vegetation LOD" actions={<SettingBadge tone={vegetation.levels.length > 1 ? "success" : "warning"}>{vegetation.levels.length} active</SettingBadge>}>
        <SettingRow label="Active Levels" align="start">
          {vegetation.levels.length > 0 ? (
            <div className="space-y-1.5">
              {vegetation.levels.map((level) => (
                <div key={`${level.modelId}-${level.label}`} className="field-surface rounded-md border p-2 font-mono text-[11px]">
                  <div className="mb-1 flex items-center justify-between gap-2 text-content-primary">
                    <span className="min-w-0 truncate">{level.modelName} / {level.label}</span>
                    <span className="shrink-0 text-content-muted">{formatCount(level.trianglesPerInstance)} tris/inst</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-content-secondary sm:grid-cols-4">
                    <span>inst {formatCount(level.visibleInstances)}</span>
                    <span>shadow {formatCount(level.shadowInstances)}</span>
                    <span>draw {formatCount(level.drawCalls)}</span>
                    <span>tris {formatCount(level.visibleTriangles)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ReadonlyField>No visible vegetation</ReadonlyField>
          )}
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
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
    default:
      return "text-content-primary";
  }
}

function formatMs(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`;
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