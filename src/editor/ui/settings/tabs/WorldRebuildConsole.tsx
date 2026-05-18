// WorldRebuildConsole: controlled rebuild execution workflow for World Diagnostics.
// WorldRebuildConsole：World Diagnostics 的受控重建执行工作流。

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, ListPlus, Play, RotateCcw } from "lucide-react";
import { getPlatform, type PlatformCookMapRequest } from "@/platform";
import { formatUnknownError } from "@/platform/errorUtils";
import { ReadonlyField, SettingBadge, SettingRow, SettingsButton } from "@ui/settings/SettingsLayout";
import { createEditorCookMapRequest, formatStageList, type EditorRebuildPlan, type MetricTone } from "./worldDebugDiagnostics";
import {
  classifyDiagnosticIssue,
  completeCookEntry,
  createCookId,
  createCookQueue,
  createRunningCookEntry,
  failCookEntry,
  formatCookKind,
  formatShortTime,
  summarizeCookRisk,
  summarizePlanScopes,
  type CookHistoryEntry,
  type CookHistoryStatus,
  type CookQueueItem,
  type CookRunKind,
} from "./worldDebugRebuildConsole";

const platform = getPlatform();
const HISTORY_LIMIT = 6;

type WorldRebuildConsoleProps = {
  projectPath: string | null;
  mapId: string | null;
  plan: EditorRebuildPlan;
  onCooked: () => void;
};

export function WorldRebuildConsole({ projectPath, mapId, plan, onCooked }: WorldRebuildConsoleProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const [history, setHistory] = useState<CookHistoryEntry[]>([]);
  const [queue, setQueue] = useState<CookQueueItem[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const canRun = platform.hasCapability("worldCookExecution") && plan.status === "ready" && projectPath !== null && mapId !== null;
  const running = activeRunId !== null;
  const risk = summarizeCookRisk(plan);

  useEffect(() => {
    setCopyStatus("");
    setQueue([]);
    setHistory([]);
    setActiveRunId(null);
  }, [projectPath, mapId]);

  useEffect(() => {
    setQueue([]);
  }, [plan.label, plan.commands.map((entry) => entry.command).join("|")]);

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

  async function handleRun(kind: CookRunKind): Promise<void> {
    const request = createRequest(kind);
    if (!request) {
      await notifyNotReady();
      return;
    }

    if (kind === "cook" && !(await confirmCook())) {
      return;
    }

    const entry = await executeCook(kind, request);
    if (kind === "cook" && entry.status === "success") {
      onCooked();
    }
  }

  function handleQueuePlan(): void {
    const request = createRequest("cook");
    if (!request) {
      return;
    }

    setQueue(createCookQueue(request));
  }

  async function handleRunQueue(): Promise<void> {
    let nextQueue = queue;
    if (nextQueue.length === 0) {
      const request = createRequest("cook");
      if (!request) {
        await notifyNotReady();
        return;
      }

      nextQueue = createCookQueue(request);
      setQueue(nextQueue);
    }

    const dryRun = nextQueue.find((item) => item.kind === "dryRun");
    const cook = nextQueue.find((item) => item.kind === "cook");
    if (dryRun && dryRun.status === "queued") {
      updateQueueItem(dryRun.id, "running");
      const dryRunEntry = await executeCook("dryRun", dryRun.request);
      updateQueueItem(dryRun.id, dryRunEntry.status);
      if (dryRunEntry.status !== "success") {
        return;
      }
    }

    if (!cook || cook.status !== "queued") {
      return;
    }

    if (!(await confirmCook())) {
      updateQueueItem(cook.id, "skipped");
      return;
    }

    updateQueueItem(cook.id, "running");
    const cookEntry = await executeCook("cook", cook.request);
    updateQueueItem(cook.id, cookEntry.status);
    if (cookEntry.status === "success") {
      onCooked();
    }
  }

  async function executeCook(kind: CookRunKind, request: PlatformCookMapRequest): Promise<CookHistoryEntry> {
    const entry = createRunningCookEntry(createCookId(kind), kind, request, Date.now());
    setActiveRunId(entry.id);
    pushHistoryEntry(entry);
    try {
      const result = await platform.world.runCookMap(request);
      const finished = completeCookEntry(entry, result, Date.now());
      pushHistoryEntry(finished);
      return finished;
    } catch (error) {
      const failed = failCookEntry(entry, `Cook failed: ${formatUnknownError(error)}`, Date.now());
      pushHistoryEntry(failed);
      await platform.dialogs.notify(failed.output, { title: "Cook Map", kind: "error" });
      return failed;
    } finally {
      setActiveRunId(null);
    }
  }

  function createRequest(kind: CookRunKind): PlatformCookMapRequest | null {
    return createEditorCookMapRequest(projectPath, mapId, plan, kind === "dryRun");
  }

  async function confirmCook(): Promise<boolean> {
    const message = plan.changedStages.includes("full")
      ? "Run a full map cook after reviewing the current plan?"
      : "Run the scoped cook after reviewing the current plan?";
    return platform.dialogs.confirm(message, {
      title: "Cook Map",
      kind: "warning",
      okLabel: "Run Cook",
      cancelLabel: "Cancel",
    });
  }

  async function notifyNotReady(): Promise<void> {
    await platform.dialogs.notify("Cook request is not ready", { title: "Cook Map", kind: "warning" });
  }

  function updateQueueItem(id: string, status: CookQueueItem["status"]): void {
    setQueue((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  }

  function pushHistoryEntry(entry: CookHistoryEntry): void {
    setHistory((entries) => [entry, ...entries.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT));
  }

  return (
    <>
      <SettingRow label="Scope Review" align="start">
        <ScopeReview plan={plan} risk={risk} />
      </SettingRow>
      <SettingRow label="Commands" align="start">
        <CommandList
          plan={plan}
          copyStatus={copyStatus}
          canRun={canRun}
          running={running}
          onCopy={handleCopyCommand}
          onRun={handleRun}
        />
      </SettingRow>
      <SettingRow label="Queue" align="start">
        <QueuePanel
          queue={queue}
          canRun={canRun}
          running={running}
          risk={risk}
          onQueue={handleQueuePlan}
          onRunQueue={handleRunQueue}
        />
      </SettingRow>
      <SettingRow label="History" align="start">
        <HistoryPanel history={history} activeRunId={activeRunId} />
      </SettingRow>
    </>
  );
}

export function DiagnosticIssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) {
    return <ReadonlyField>All checked packs match their manifests</ReadonlyField>;
  }

  return (
    <div className="space-y-1.5">
      {issues.slice(0, 5).map((issue) => {
        const analysis = classifyDiagnosticIssue(issue);
        return (
          <div key={issue} className="field-surface rounded-md border p-2 text-[11px] leading-4 text-content-secondary">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={getToneClass(analysis.tone)}>{analysis.label}</span>
              <SettingBadge tone={analysis.tone}>{analysis.category}</SettingBadge>
            </div>
            <div>{issue}</div>
            {analysis.targets.length > 0 && <TargetList targets={analysis.targets} />}
          </div>
        );
      })}
      {issues.length > 5 && <ReadonlyField>{issues.length - 5} more</ReadonlyField>}
    </div>
  );
}

function ScopeReview({ plan, risk }: { plan: EditorRebuildPlan; risk: { label: string; tone: MetricTone; detail: string } }) {
  const summaries = summarizePlanScopes(plan);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MetricTile label="Mode" value={risk.label} detail={risk.detail} tone={risk.tone} />
        <MetricTile label="Stages" value={formatCount(plan.changedStages.length)} detail={formatStageList(plan.changedStages)} tone={plan.changedStages.length > 0 ? "warning" : "success"} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {summaries.map((summary) => (
          <MetricTile key={summary.key} label={summary.label} value={formatCount(summary.count)} detail={summary.sample} tone={summary.count > 0 ? "info" : "neutral"} />
        ))}
      </div>
    </div>
  );
}

function CommandList({
  plan,
  copyStatus,
  canRun,
  running,
  onCopy,
  onRun,
}: {
  plan: EditorRebuildPlan;
  copyStatus: string;
  canRun: boolean;
  running: boolean;
  onCopy: (command: string) => Promise<void>;
  onRun: (kind: CookRunKind) => Promise<void>;
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
            <div className="flex items-center gap-1.5">
              <SettingsButton Icon={Copy} size="sm" onClick={() => void onCopy(entry.command)}>
                Copy
              </SettingsButton>
              <SettingsButton
                Icon={Play}
                size="sm"
                tone={entry.kind === "cook" ? "warning" : "info"}
                disabled={!canRun || running}
                onClick={() => void onRun(entry.kind)}
              >
                Run
              </SettingsButton>
            </div>
          </div>
          <div className="break-all font-mono text-[11px] leading-4 text-content-primary">{entry.command}</div>
        </div>
      ))}
      {copyStatus && <ReadonlyField>{copyStatus}</ReadonlyField>}
    </div>
  );
}

function QueuePanel({
  queue,
  canRun,
  running,
  risk,
  onQueue,
  onRunQueue,
}: {
  queue: CookQueueItem[];
  canRun: boolean;
  running: boolean;
  risk: { label: string; tone: MetricTone; detail: string };
  onQueue: () => void;
  onRunQueue: () => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SettingBadge tone={risk.tone}>{risk.label}</SettingBadge>
          <span className="text-[11px] text-content-muted">{risk.detail}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <SettingsButton Icon={ListPlus} size="sm" disabled={!canRun || running} onClick={onQueue}>
            Queue
          </SettingsButton>
          <SettingsButton Icon={Play} size="sm" tone="primary" disabled={!canRun || running} onClick={() => void onRunQueue()}>
            Run Queue
          </SettingsButton>
        </div>
      </div>
      {queue.length === 0 ? (
        <ReadonlyField>{canRun ? "Ready" : "Unavailable"}</ReadonlyField>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {queue.map((item) => (
            <MetricTile key={item.id} label={item.label} value={item.status} detail={formatCookKind(item.kind)} tone={getStatusTone(item.status)} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ history, activeRunId }: { history: CookHistoryEntry[]; activeRunId: string | null }) {
  if (history.length === 0) {
    return <ReadonlyField>Not Run</ReadonlyField>;
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => (
        <div key={entry.id} className="field-surface rounded-md border p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {entry.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success" aria-hidden="true" /> : <RotateCcw className={`h-3.5 w-3.5 shrink-0 ${entry.id === activeRunId ? "animate-spin text-status-info" : getToneClass(entry.analysis.tone)}`} aria-hidden="true" />}
              <span className="truncate text-[11px] font-medium text-content-primary">{entry.label}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <SettingBadge tone={entry.analysis.tone}>{entry.analysis.label}</SettingBadge>
              <span className="font-mono text-[11px] text-content-muted">{formatShortTime(entry.finishedAt ?? entry.startedAt)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="Exit" value={entry.exitCode === null ? "pending" : entry.exitCode.toString()} detail={entry.status} tone={getStatusTone(entry.status)} />
            <MetricTile label="Duration" value={entry.durationMs === null ? "running" : `${(entry.durationMs / 1000).toFixed(1)}s`} detail={formatCookKind(entry.kind)} />
          </div>
          <AnalysisPanel entry={entry} />
        </div>
      ))}
    </div>
  );
}

function AnalysisPanel({ entry }: { entry: CookHistoryEntry }) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="text-[11px] leading-4 text-content-secondary">{entry.analysis.detail}</div>
      {entry.analysis.targets.length > 0 && <TargetList targets={entry.analysis.targets} />}
      {entry.analysis.actions.length > 0 && entry.status !== "success" && (
        <div className="flex flex-wrap gap-1.5">
          {entry.analysis.actions.map((action) => (
            <span key={action} className="rounded-md border border-stroke-subtle px-1.5 py-0.5 text-[10px] text-content-muted">{action}</span>
          ))}
        </div>
      )}
      {entry.output && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border border-stroke-subtle p-2 font-mono text-[11px] leading-4 text-content-secondary">
          {entry.output}
        </pre>
      )}
    </div>
  );
}

function TargetList({ targets }: { targets: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {targets.map((target) => (
        <span key={target} className="rounded-md border border-stroke-subtle px-1.5 py-0.5 font-mono text-[10px] text-content-muted">{target}</span>
      ))}
    </div>
  );
}

function MetricTile({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: MetricTone }) {
  return (
    <div className="field-surface rounded-md border p-2">
      <div className="truncate text-[11px] uppercase tracking-wide text-content-muted">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm ${getToneClass(tone)}`}>{value}</div>
      {detail && <div className="mt-0.5 truncate text-[11px] text-content-muted">{detail}</div>}
    </div>
  );
}

function getStatusTone(status: CookHistoryStatus | CookQueueItem["status"]): MetricTone {
  switch (status) {
    case "success":
      return "success";
    case "error":
      return "danger";
    case "running":
      return "info";
    case "skipped":
      return "warning";
    default:
      return "neutral";
  }
}

function getToneClass(tone: MetricTone): string {
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

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return value.toFixed(0);
}