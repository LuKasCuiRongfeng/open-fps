// WorldRebuildConsole: controlled rebuild execution workflow for World Diagnostics.
// WorldRebuildConsole：World Diagnostics 的受控重建执行工作流。

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Crosshair, ListPlus, Lock, Play, RefreshCw, RotateCcw, ShieldAlert, Trash2, Unlock } from "lucide-react";
import { getPlatform, type PlatformCookMapRequest } from "@/platform";
import { formatUnknownError } from "@/platform/errorUtils";
import { ReadonlyField, SettingBadge, SettingRow, SettingsButton } from "@ui/settings/SettingsLayout";
import { createEditorCookMapRequest, formatStageList, type EditorRebuildPlan, type MetricTone } from "./worldDebugDiagnostics";
import {
  addRebuildLocks,
  classifyDiagnosticIssue,
  completeCookEntry,
  createCookId,
  createCookQueue,
  createCookQueueItem,
  createCookRecoveryActions,
  createEntryRecoveryRequest,
  createLockConflicts,
  createRunningCookEntry,
  createTargetRecoveryRequest,
  emptyRebuildLocks,
  failCookEntry,
  formatLockConflictReason,
  formatCookKind,
  formatShortTime,
  hasRebuildLocks,
  removeRebuildLocks,
  summarizeCookRisk,
  summarizeLockScopes,
  summarizePlanScopes,
  type CookHistoryEntry,
  type CookHistoryStatus,
  type CookQueueItem,
  type CookRecoveryActionKind,
  type CookTarget,
  type CookRunKind,
  type LockConflict,
  type RebuildLockState,
} from "./worldDebugRebuildConsole";
import {
  createEmptyRebuildMapState,
  limitPersistedHistory,
  limitPersistedQueue,
  loadRebuildMapState,
  saveRebuildMapState,
  type RebuildMapState,
} from "./worldDebugRebuildState";

const platform = getPlatform();

type PersistStatus = "idle" | "loading" | "saving" | "saved" | "error";

type WorldRebuildConsoleProps = {
  projectPath: string | null;
  mapId: string | null;
  plan: EditorRebuildPlan;
  onDiagnosticsRefresh: () => void;
};

export function WorldRebuildConsole({ projectPath, mapId, plan, onDiagnosticsRefresh }: WorldRebuildConsoleProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const [locks, setLocks] = useState<RebuildLockState>(emptyRebuildLocks);
  const [history, setHistory] = useState<CookHistoryEntry[]>([]);
  const [queue, setQueue] = useState<CookQueueItem[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [persistStatus, setPersistStatus] = useState<PersistStatus>("idle");
  const rebuildStateRef = useRef<RebuildMapState>(createEmptyRebuildMapState());
  const cookRequest = createRequest("cook");
  const lockConflicts = createLockConflicts(cookRequest, locks);
  const lockBlocked = lockConflicts.length > 0;
  const canUseCookExecution = platform.hasCapability("worldCookExecution") && projectPath !== null && mapId !== null;
  const canQueue = canUseCookExecution && plan.status === "ready";
  const canRunCommand = canQueue && !lockBlocked;
  const canRunQueue = canUseCookExecution && (queue.some((item) => item.status === "queued") || canRunCommand);
  const running = activeRunId !== null;
  const risk = summarizeCookRisk(plan);

  useEffect(() => {
    let cancelled = false;
    setCopyStatus("");
    setQueue([]);
    setHistory([]);
    setLocks(emptyRebuildLocks);
    setActiveRunId(null);
    setPersistStatus(projectPath && mapId ? "loading" : "idle");
    rebuildStateRef.current = createEmptyRebuildMapState();
    void loadRebuildMapState(projectPath, mapId)
      .then((state) => {
        if (cancelled) {
          return;
        }

        rebuildStateRef.current = state;
        setLocks(state.locks);
        setHistory(state.history);
        setQueue(state.queue);
        setPersistStatus(projectPath && mapId ? "saved" : "idle");
      })
      .catch(() => {
        if (!cancelled) {
          setPersistStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath, mapId]);

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

    const conflicts = createLockConflicts(request, locks);
    if (conflicts.length > 0) {
      await notifyBlocked(conflicts);
      return;
    }

    if (kind === "cook" && !(await confirmCook())) {
      return;
    }

    const entry = await executeCook(kind, request);
    if (kind === "cook" && entry.status === "success") {
      onDiagnosticsRefresh();
    }
  }

  function handleQueuePlan(): void {
    const request = createRequest("cook");
    if (!request) {
      return;
    }

    setQueueAndPersist([...queue, ...createCookQueue(request, createLockConflicts(request, locks))]);
  }

  async function handleRunQueue(): Promise<void> {
    let workingQueue = queue;
    if (workingQueue.length === 0) {
      const request = createRequest("cook");
      if (!request) {
        await notifyNotReady();
        return;
      }

      workingQueue = createCookQueue(request, createLockConflicts(request, locks));
      setQueueAndPersist(workingQueue);
    }

    for (const item of workingQueue) {
      if (item.status !== "queued") {
        continue;
      }

      const conflicts = createLockConflicts(item.request, locks);
      if (conflicts.length > 0) {
        workingQueue = replaceQueueItem(workingQueue, item.id, { status: "blocked", blockedReason: formatLockConflictReason(conflicts) });
        setQueueAndPersist(workingQueue);
        await notifyBlocked(conflicts);
        return;
      }

      if (item.kind === "cook" && !(await confirmCook())) {
        workingQueue = replaceQueueItem(workingQueue, item.id, { status: "skipped" });
        setQueueAndPersist(workingQueue);
        return;
      }

      workingQueue = replaceQueueItem(workingQueue, item.id, { status: "running", blockedReason: null });
      setQueueAndPersist(workingQueue);
      const entry = await executeCook(item.kind, item.request);
      workingQueue = replaceQueueItem(workingQueue, item.id, { status: entry.status, blockedReason: null });
      setQueueAndPersist(workingQueue);
      if (entry.status !== "success") {
        return;
      }

      if (item.kind === "cook") {
        onDiagnosticsRefresh();
      }
    }
  }

  async function handleRecoveryAction(entry: CookHistoryEntry, action: CookRecoveryActionKind): Promise<void> {
    if (action === "refreshDiagnostics") {
      onDiagnosticsRefresh();
      return;
    }
    if (action === "copyTargets") {
      await copyTargets(entry.analysis.targets);
      return;
    }

    const request = createEntryRecoveryRequest(entry, action);
    if (!request) {
      await notifyNotReady();
      return;
    }

    queueRecoveryRequest(request, request.dryRun ? "dryRun" : "cook");
  }

  function handleQueueTargetRecovery(target: CookTarget, kind: CookRunKind): void {
    const request = createTargetRecoveryRequest(projectPath, mapId, target, kind === "dryRun");
    if (!request) {
      return;
    }

    queueRecoveryRequest(request, kind);
  }

  function handleLockPlan(): void {
    if (!hasPlanScope(plan)) {
      return;
    }

    setLocksAndPersist(addRebuildLocks(locks, plan.scopes));
  }

  function handleUnlockPlan(): void {
    setLocksAndPersist(removeRebuildLocks(locks, plan.scopes));
  }

  function handleClearLocks(): void {
    setLocksAndPersist(emptyRebuildLocks);
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

  async function notifyBlocked(conflicts: LockConflict[]): Promise<void> {
    await platform.dialogs.notify(formatLockConflictReason(conflicts) ?? "Cook request is blocked by locked scopes", { title: "Cook Map", kind: "warning" });
  }

  async function copyTargets(targets: readonly string[]): Promise<void> {
    if (targets.length === 0) {
      return;
    }

    try {
      await writeClipboard(targets.join("\n"));
      setCopyStatus("Targets copied");
    } catch (error) {
      const message = `Copy failed: ${formatUnknownError(error)}`;
      setCopyStatus(message);
      await platform.dialogs.notify(message, { title: "Clipboard", kind: "warning" });
    }
  }

  function queueRecoveryRequest(request: PlatformCookMapRequest, kind: CookRunKind): void {
    const conflicts = createLockConflicts(request, locks);
    const item = createCookQueueItem(kind, request, conflicts);
    setQueueAndPersist([...rebuildStateRef.current.queue, item]);
    setCopyStatus(conflicts.length > 0 ? "Recovery blocked" : "Recovery queued");
  }

  function setLocksAndPersist(nextLocks: RebuildLockState): void {
    setLocks(nextLocks);
    persistState({ ...rebuildStateRef.current, locks: nextLocks });
  }

  function setQueueAndPersist(nextQueue: CookQueueItem[]): void {
    const limitedQueue = limitPersistedQueue(nextQueue);
    setQueue(limitedQueue);
    persistState({ ...rebuildStateRef.current, queue: limitedQueue });
  }

  function pushHistoryEntry(entry: CookHistoryEntry): void {
    const nextHistory = limitPersistedHistory([entry, ...rebuildStateRef.current.history.filter((item) => item.id !== entry.id)]);
    setHistory(nextHistory);
    persistState({ ...rebuildStateRef.current, history: nextHistory });
  }

  function persistState(state: RebuildMapState): void {
    rebuildStateRef.current = state;
    setPersistStatus("saving");
    void saveRebuildMapState(projectPath, mapId, state)
      .then(() => setPersistStatus(projectPath && mapId ? "saved" : "idle"))
      .catch(() => setPersistStatus("error"));
  }

  return (
    <>
      <SettingRow label="Locks" align="start">
        <LockPanel
          locks={locks}
          plan={plan}
          conflicts={lockConflicts}
          persistStatus={persistStatus}
          onLockPlan={handleLockPlan}
          onUnlockPlan={handleUnlockPlan}
          onClearLocks={handleClearLocks}
        />
      </SettingRow>
      <SettingRow label="Scope Review" align="start">
        <ScopeReview plan={plan} risk={risk} conflicts={lockConflicts} />
      </SettingRow>
      <SettingRow label="Commands" align="start">
        <CommandList
          plan={plan}
          copyStatus={copyStatus}
          canRun={canRunCommand}
          blocked={lockBlocked}
          running={running}
          onCopy={handleCopyCommand}
          onRun={handleRun}
        />
      </SettingRow>
      <SettingRow label="Queue" align="start">
        <QueuePanel
          queue={queue}
          canQueue={canQueue}
          canRun={canRunQueue}
          running={running}
          risk={risk}
          blocked={lockBlocked}
          onQueue={handleQueuePlan}
          onRunQueue={handleRunQueue}
        />
      </SettingRow>
      <SettingRow label="History" align="start">
        <HistoryPanel
          history={history}
          activeRunId={activeRunId}
          onRecoveryAction={handleRecoveryAction}
          onQueueTargetRecovery={handleQueueTargetRecovery}
          onJumpTarget={scrollToTargetSection}
          onCopyTarget={(target) => void copyTargetPath(target)}
        />
      </SettingRow>
    </>
  );
}

export function DiagnosticIssueList({ issues, onRefreshDiagnostics }: { issues: string[]; onRefreshDiagnostics?: () => void }) {
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
            {analysis.targetDetails.length > 0 && (
              <TargetList
                targets={analysis.targetDetails}
                onJumpTarget={scrollToTargetSection}
                onCopyTarget={(target) => void copyTargetPath(target)}
              />
            )}
            {onRefreshDiagnostics && (
              <div className="mt-1.5 flex justify-end">
                <SettingsButton Icon={RefreshCw} size="sm" tone="info" onClick={onRefreshDiagnostics}>
                  Refresh
                </SettingsButton>
              </div>
            )}
          </div>
        );
      })}
      {issues.length > 5 && <ReadonlyField>{issues.length - 5} more</ReadonlyField>}
    </div>
  );
}

function LockPanel({
  locks,
  plan,
  conflicts,
  persistStatus,
  onLockPlan,
  onUnlockPlan,
  onClearLocks,
}: {
  locks: RebuildLockState;
  plan: EditorRebuildPlan;
  conflicts: LockConflict[];
  persistStatus: PersistStatus;
  onLockPlan: () => void;
  onUnlockPlan: () => void;
  onClearLocks: () => void;
}) {
  const summaries = summarizeLockScopes(locks);
  const canLockPlan = hasPlanScope(plan);
  const locked = hasRebuildLocks(locks);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SettingBadge tone={conflicts.length > 0 ? "danger" : locked ? "warning" : "success"}>{conflicts.length > 0 ? "Blocked" : locked ? "Locked" : "Open"}</SettingBadge>
          <SettingBadge tone={getPersistTone(persistStatus)}>{persistStatus}</SettingBadge>
        </div>
        <div className="flex items-center gap-1.5">
          <SettingsButton Icon={Lock} size="sm" disabled={!canLockPlan} onClick={onLockPlan}>
            Lock
          </SettingsButton>
          <SettingsButton Icon={Unlock} size="sm" disabled={!canLockPlan || !locked} onClick={onUnlockPlan}>
            Unlock
          </SettingsButton>
          <SettingsButton Icon={Trash2} size="sm" tone="warning" disabled={!locked} onClick={onClearLocks}>
            Clear
          </SettingsButton>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {summaries.map((summary) => (
          <MetricTile key={summary.key} label={summary.label} value={formatCount(summary.count)} detail={summary.sample} tone={summary.count > 0 ? "warning" : "neutral"} />
        ))}
      </div>
      {conflicts.length > 0 && (
        <div className="space-y-1.5">
          {conflicts.map((conflict) => (
            <div key={conflict.key} className="field-surface flex items-start gap-2 rounded-md border border-status-danger/40 p-2 text-[11px] leading-4 text-status-danger">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-medium">{conflict.reason}: {conflict.label}</div>
                <div className="wrap-break-word font-mono text-[10px] text-content-muted">{conflict.values.join(", ")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScopeReview({ plan, risk, conflicts }: { plan: EditorRebuildPlan; risk: { label: string; tone: MetricTone; detail: string }; conflicts: LockConflict[] }) {
  const summaries = summarizePlanScopes(plan);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MetricTile label="Mode" value={conflicts.length > 0 ? "Blocked" : risk.label} detail={conflicts.length > 0 ? formatLockConflictReason(conflicts) ?? "Locked scope conflict" : risk.detail} tone={conflicts.length > 0 ? "danger" : risk.tone} />
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
  blocked,
  running,
  onCopy,
  onRun,
}: {
  plan: EditorRebuildPlan;
  copyStatus: string;
  canRun: boolean;
  blocked: boolean;
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
      {blocked && <ReadonlyField>Blocked by locked scopes</ReadonlyField>}
    </div>
  );
}

function QueuePanel({
  queue,
  canQueue,
  canRun,
  running,
  risk,
  blocked,
  onQueue,
  onRunQueue,
}: {
  queue: CookQueueItem[];
  canQueue: boolean;
  canRun: boolean;
  running: boolean;
  risk: { label: string; tone: MetricTone; detail: string };
  blocked: boolean;
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
          <SettingsButton Icon={ListPlus} size="sm" disabled={!canQueue || running} onClick={onQueue}>
            Add Plan
          </SettingsButton>
          <SettingsButton Icon={Play} size="sm" tone="primary" disabled={!canRun || running} onClick={() => void onRunQueue()}>
            Run Queue
          </SettingsButton>
        </div>
      </div>
      {queue.length === 0 ? (
        <ReadonlyField>{blocked ? "Blocked" : canQueue ? "Ready" : "Unavailable"}</ReadonlyField>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {queue.map((item) => (
            <MetricTile key={item.id} label={item.label} value={item.status} detail={item.blockedReason ?? formatCookKind(item.kind)} tone={getStatusTone(item.status)} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryPanel({
  history,
  activeRunId,
  onRecoveryAction,
  onQueueTargetRecovery,
  onJumpTarget,
  onCopyTarget,
}: {
  history: CookHistoryEntry[];
  activeRunId: string | null;
  onRecoveryAction: (entry: CookHistoryEntry, action: CookRecoveryActionKind) => Promise<void>;
  onQueueTargetRecovery: (target: CookTarget, kind: CookRunKind) => void;
  onJumpTarget: (target: CookTarget) => void;
  onCopyTarget: (target: CookTarget) => void;
}) {
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
          <AnalysisPanel
            entry={entry}
            onRecoveryAction={onRecoveryAction}
            onQueueTargetRecovery={onQueueTargetRecovery}
            onJumpTarget={onJumpTarget}
            onCopyTarget={onCopyTarget}
          />
        </div>
      ))}
    </div>
  );
}

function AnalysisPanel({
  entry,
  onRecoveryAction,
  onQueueTargetRecovery,
  onJumpTarget,
  onCopyTarget,
}: {
  entry: CookHistoryEntry;
  onRecoveryAction: (entry: CookHistoryEntry, action: CookRecoveryActionKind) => Promise<void>;
  onQueueTargetRecovery: (target: CookTarget, kind: CookRunKind) => void;
  onJumpTarget: (target: CookTarget) => void;
  onCopyTarget: (target: CookTarget) => void;
}) {
  const recoveryActions = createCookRecoveryActions(entry);
  return (
    <div className="mt-2 space-y-1.5">
      <div className="text-[11px] leading-4 text-content-secondary">{entry.analysis.detail}</div>
      {entry.analysis.targetDetails.length > 0 && (
        <TargetList
          targets={entry.analysis.targetDetails}
          onJumpTarget={onJumpTarget}
          onCopyTarget={onCopyTarget}
          onQueueTargetRecovery={onQueueTargetRecovery}
        />
      )}
      {recoveryActions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recoveryActions.map((action) => (
            <SettingsButton key={action.kind} Icon={getRecoveryActionIcon(action.kind)} size="sm" tone={action.tone} title={action.detail} onClick={() => void onRecoveryAction(entry, action.kind)}>
              {action.label}
            </SettingsButton>
          ))}
        </div>
      )}
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

function TargetList({
  targets,
  onJumpTarget,
  onCopyTarget,
  onQueueTargetRecovery,
}: {
  targets: CookTarget[];
  onJumpTarget: (target: CookTarget) => void;
  onCopyTarget: (target: CookTarget) => void;
  onQueueTargetRecovery?: (target: CookTarget, kind: CookRunKind) => void;
}) {
  return (
    <div className="space-y-1.5">
      {targets.map((target) => (
        <div key={target.path} className="field-surface rounded-md border p-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <SettingBadge tone="info">{target.sectionLabel}</SettingBadge>
                {target.scopeValue && <SettingBadge tone="warning">{target.scopeValue}</SettingBadge>}
                <span className="text-[11px] font-medium text-content-primary">{target.label}</span>
              </div>
              <div className="mt-1 break-all font-mono text-[10px] leading-4 text-content-muted">{target.path}</div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <SettingsButton Icon={Crosshair} size="icon" title="Jump" aria-label="Jump" onClick={() => onJumpTarget(target)} />
              <SettingsButton Icon={Copy} size="icon" title="Copy" aria-label="Copy" onClick={() => onCopyTarget(target)} />
              {onQueueTargetRecovery && (
                <SettingsButton Icon={ListPlus} size="icon" tone="info" title="Queue dry-run" aria-label="Queue dry-run" onClick={() => onQueueTargetRecovery(target, "dryRun")} />
              )}
            </div>
          </div>
        </div>
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
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

function getPersistTone(status: PersistStatus): MetricTone {
  switch (status) {
    case "saved":
      return "success";
    case "saving":
    case "loading":
      return "info";
    case "error":
      return "danger";
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

function hasPlanScope(plan: EditorRebuildPlan): boolean {
  return plan.scopes.terrainRegions.length > 0
    || plan.scopes.paintRegions.length > 0
    || plan.scopes.vegetationRegions.length > 0
    || plan.scopes.partitionCells.length > 0;
}

function replaceQueueItem(queue: CookQueueItem[], id: string, patch: Partial<CookQueueItem>): CookQueueItem[] {
  return queue.map((item) => item.id === id ? { ...item, ...patch } : item);
}

function scrollToTargetSection(target: CookTarget): void {
  document.getElementById(target.sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function copyTargetPath(target: CookTarget): Promise<void> {
  try {
    await writeClipboard(target.path);
  } catch (error) {
    await platform.dialogs.notify(`Copy failed: ${formatUnknownError(error)}`, { title: "Clipboard", kind: "warning" });
  }
}

async function writeClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API is not available");
  }

  await navigator.clipboard.writeText(text);
}

function getRecoveryActionIcon(kind: CookRecoveryActionKind) {
  switch (kind) {
    case "refreshDiagnostics":
      return RefreshCw;
    case "copyTargets":
      return Copy;
    case "retryCook":
      return Play;
    default:
      return RotateCcw;
  }
}