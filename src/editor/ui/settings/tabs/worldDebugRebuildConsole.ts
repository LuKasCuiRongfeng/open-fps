// WorldDebugRebuildConsole: pure helpers for editor rebuild execution diagnostics.
// WorldDebugRebuildConsole：编辑器重建执行诊断的纯辅助逻辑。

import type { PlatformCookMapRequest, PlatformCookMapResult } from "@/platform";
import type { EditorRebuildPlan, MetricTone, RebuildScopes } from "./worldDebugDiagnostics";

export type CookRunKind = "dryRun" | "cook";
export type CookHistoryStatus = "running" | "success" | "error" | "skipped";
export type CookQueueStatus = CookHistoryStatus | "queued" | "blocked";
export type CookFailureCategory = "success" | "source" | "cooked" | "graph" | "pack" | "environment" | "validation" | "execution" | "unknown";
export type CookTargetKind = "sourceManifest" | "sourcePack" | "cookedManifest" | "cookedPack" | "script" | "asset" | "unknown";
export type CookTargetSectionId = "world-debug-asset-health" | "world-debug-rebuild-graph" | "world-debug-rebuild-plan" | "world-debug-partition-runtime" | "world-debug-streaming";
export type CookRecoveryActionKind = "refreshDiagnostics" | "copyTargets" | "retryDryRun" | "retryCook" | "fullDryRun";

export type CookTarget = {
  path: string;
  label: string;
  kind: CookTargetKind;
  stage: string | null;
  scopeKey: keyof RebuildScopes | null;
  scopeValue: string | null;
  sectionId: CookTargetSectionId;
  sectionLabel: string;
};

export type CookRecoveryAction = {
  kind: CookRecoveryActionKind;
  label: string;
  tone: MetricTone;
  detail: string;
};

export type CookFailureAnalysis = {
  category: CookFailureCategory;
  label: string;
  tone: MetricTone;
  detail: string;
  actions: string[];
  targets: string[];
  targetDetails: CookTarget[];
};

export type CookHistoryEntry = {
  id: string;
  kind: CookRunKind;
  status: CookHistoryStatus;
  label: string;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  durationMs: number | null;
  command: string[];
  output: string;
  request: PlatformCookMapRequest | null;
  analysis: CookFailureAnalysis;
};

export type CookQueueItem = {
  id: string;
  kind: CookRunKind;
  label: string;
  status: CookQueueStatus;
  request: PlatformCookMapRequest;
  blockedReason: string | null;
};

export type RebuildLockState = RebuildScopes;

export type LockConflict = {
  key: keyof RebuildScopes;
  label: string;
  values: string[];
  reason: string;
};

export type ScopeSummary = {
  key: keyof RebuildScopes;
  label: string;
  count: number;
  sample: string;
};

export type CookRiskSummary = {
  label: string;
  tone: MetricTone;
  detail: string;
};

export const emptyRebuildLocks: RebuildLockState = {
  terrainRegions: [],
  paintRegions: [],
  vegetationRegions: [],
  partitionCells: [],
};

const targetPattern = /(?:[A-Za-z]:)?[\w./\\-]+\.(?:json|heightpack|paintpack|vegpack|objectpack|collisionpack|navpack|mjs|glb|png|jpg|jpeg|webp)/g;

export function createRunningCookEntry(
  id: string,
  kind: CookRunKind,
  request: PlatformCookMapRequest,
  startedAt: number,
): CookHistoryEntry {
  return {
    id,
    kind,
    status: "running",
    label: `${formatCookKind(kind)} Running`,
    startedAt,
    finishedAt: null,
    exitCode: null,
    durationMs: null,
    command: createDisplayCommand(request),
    output: "",
    request: cloneCookRequest(request),
    analysis: createNeutralAnalysis("Running", "Cook command is still running."),
  };
}

export function completeCookEntry(entry: CookHistoryEntry, result: PlatformCookMapResult, finishedAt: number): CookHistoryEntry {
  const succeeded = result.exitCode === 0;
  return {
    ...entry,
    status: succeeded ? "success" : "error",
    label: `${formatCookKind(entry.kind)} ${succeeded ? "Finished" : "Failed"}`,
    finishedAt,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    command: result.command,
    output: formatCookMapResult(result),
    analysis: analyzeCookResult(result),
  };
}

export function failCookEntry(entry: CookHistoryEntry, message: string, finishedAt: number): CookHistoryEntry {
  return {
    ...entry,
    status: "error",
    label: `${formatCookKind(entry.kind)} Failed`,
    finishedAt,
    exitCode: null,
    durationMs: finishedAt - entry.startedAt,
    output: message,
    analysis: analyzeCookText(message, false),
  };
}

export function createCookQueue(request: PlatformCookMapRequest, conflicts: readonly LockConflict[] = []): CookQueueItem[] {
  return [
    createCookQueueItem("dryRun", request, conflicts),
    createCookQueueItem("cook", request, conflicts),
  ];
}

export function createCookQueueItem(kind: CookRunKind, request: PlatformCookMapRequest, conflicts: readonly LockConflict[] = []): CookQueueItem {
  const blockedReason = formatLockConflictReason(conflicts);
  return {
    id: createCookId(kind),
    kind,
    label: kind === "dryRun" ? "Dry Run Review" : request.full ? "Full Cook" : "Scoped Cook",
    status: blockedReason ? "blocked" : "queued",
    request: { ...cloneCookRequest(request), dryRun: kind === "dryRun" },
    blockedReason,
  };
}

export function createCookId(kind: CookRunKind): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function analyzeCookResult(result: PlatformCookMapResult): CookFailureAnalysis {
  return analyzeCookText(`${result.stderr}\n${result.stdout}`, result.exitCode === 0);
}

export function analyzeCookText(text: string, succeeded: boolean): CookFailureAnalysis {
  if (succeeded) {
    return {
      category: "success",
      label: "Completed",
      tone: "success",
      detail: "Cook command completed successfully.",
      actions: ["Refresh diagnostics"],
      ...createTargetAnalysisFields(text),
    };
  }

  const normalized = text.toLowerCase();
  if (/pnpm|enoent|script is not available|failed to run cook map command|failed to join/.test(normalized)) {
    return createAnalysis("environment", "Environment", "Cook tooling or process launch failed.", ["Check pnpm availability", "Run the dry-run command from the repository root"], text);
  }
  if (/generation graph|world generation graph|unknown world generation stage|dependency cycle|stage/.test(normalized)) {
    return createAnalysis("graph", "Generation Graph", "The rebuild graph or stage selection is invalid.", ["Refresh diagnostics", "Regenerate graph metadata", "Run full dry-run after graph changes"], text);
  }
  if (/sha256|bytelength|integrity|truncated|pack|heightpack|paintpack|vegpack|objectpack/.test(normalized)) {
    return createAnalysis("pack", "Pack Integrity", "A source or cooked pack failed integrity validation.", ["Inspect listed pack targets", "Regenerate the affected source sidecar", "Run scoped cook after repair"], text);
  }
  if (/cooked|manifest|artifact|blob|cache/.test(normalized)) {
    return createAnalysis("cooked", "Cooked Output", "Cooked output or cache metadata is missing or stale.", ["Run dry-run review", "Run scoped cook", "Use full cook if manifest inputs changed"], text);
  }
  if (/project_path|project\.json|map manifest|source|asset registry|registry\.json/.test(normalized)) {
    return createAnalysis("source", "Source Data", "Source project data is missing or not readable.", ["Save the project", "Refresh diagnostics", "Repair the listed source manifest"], text);
  }
  if (/invalid|must|cannot|outside|too many|empty/.test(normalized)) {
    return createAnalysis("validation", "Request Validation", "The structured cook request failed validation.", ["Refresh diagnostics", "Rebuild the plan", "Use full cook if local scope is unavailable"], text);
  }

  return createAnalysis("execution", "Execution", "Cook command failed without a known category.", ["Review stdout and stderr", "Run dry-run again", "Use full cook if scoped cook remains ambiguous"], text);
}

export function classifyDiagnosticIssue(issue: string): CookFailureAnalysis {
  return analyzeCookText(issue, false);
}

export function createCookTarget(path: string): CookTarget {
  const normalizedPath = normalizeTargetPath(path);
  const stage = inferTargetStage(normalizedPath);
  const scope = inferTargetScope(normalizedPath, stage);
  const kind = inferTargetKind(normalizedPath);
  const section = inferTargetSection(normalizedPath, stage);
  return {
    path: normalizedPath,
    label: formatTargetLabel(normalizedPath, stage, scope?.value ?? null),
    kind,
    stage,
    scopeKey: scope?.key ?? null,
    scopeValue: scope?.value ?? null,
    sectionId: section.id,
    sectionLabel: section.label,
  };
}

export function extractCookTargetDetails(text: string): CookTarget[] {
  const targets = new Map<string, CookTarget>();
  for (const match of text.matchAll(targetPattern)) {
    const target = createCookTarget(match[0]);
    targets.set(target.path, target);
    if (targets.size >= 6) {
      break;
    }
  }

  return [...targets.values()];
}

export function createCookRecoveryActions(entry: CookHistoryEntry): CookRecoveryAction[] {
  const actions: CookRecoveryAction[] = [
    { kind: "refreshDiagnostics", label: "Refresh", tone: "info", detail: "Refresh source and cooked diagnostics." },
  ];
  if (entry.analysis.targets.length > 0) {
    actions.push({ kind: "copyTargets", label: "Copy Targets", tone: "neutral", detail: "Copy parsed validation targets." });
  }
  if (entry.status === "success" || !entry.request) {
    return actions;
  }

  actions.push({ kind: "retryDryRun", label: "Queue Dry Run", tone: "info", detail: "Queue the same request as a dry-run review." });
  if (entry.kind === "cook") {
    actions.push({ kind: "retryCook", label: "Queue Cook", tone: "warning", detail: "Queue the same cook request again." });
  }
  if (!entry.request.full && entry.analysis.category !== "environment") {
    actions.push({ kind: "fullDryRun", label: "Full Dry Run", tone: "warning", detail: "Queue a full-map dry-run to recover ambiguous scope state." });
  }

  return actions;
}

export function createTargetRecoveryRequest(projectPath: string | null, mapId: string | null, target: CookTarget, dryRun: boolean): PlatformCookMapRequest | null {
  if (!projectPath || !mapId) {
    return null;
  }

  if (!target.stage || target.stage === "generationGraph") {
    return createFullRecoveryRequest(projectPath, mapId, dryRun);
  }

  const scopes = createEmptyScopes();
  if (target.scopeKey && target.scopeValue) {
    scopes[target.scopeKey] = [target.scopeValue];
  }

  return {
    projectPath,
    mapId,
    dryRun,
    full: false,
    changedStages: [target.stage],
    scopes,
  };
}

export function createEntryRecoveryRequest(entry: CookHistoryEntry, action: CookRecoveryActionKind): PlatformCookMapRequest | null {
  if (!entry.request) {
    return null;
  }

  switch (action) {
    case "retryDryRun":
      return { ...cloneCookRequest(entry.request), dryRun: true };
    case "retryCook":
      return { ...cloneCookRequest(entry.request), dryRun: false };
    case "fullDryRun":
      return createFullRecoveryRequest(entry.request.projectPath, entry.request.mapId, true);
    default:
      return null;
  }
}

export function normalizeRebuildLocks(value: Partial<RebuildLockState> | null | undefined): RebuildLockState {
  return {
    terrainRegions: uniqueGridKeys(value?.terrainRegions),
    paintRegions: uniqueGridKeys(value?.paintRegions),
    vegetationRegions: uniqueGridKeys(value?.vegetationRegions),
    partitionCells: uniqueGridKeys(value?.partitionCells),
  };
}

export function addRebuildLocks(current: RebuildLockState, additions: Partial<RebuildLockState>): RebuildLockState {
  return normalizeRebuildLocks({
    terrainRegions: [...current.terrainRegions, ...(additions.terrainRegions ?? [])],
    paintRegions: [...current.paintRegions, ...(additions.paintRegions ?? [])],
    vegetationRegions: [...current.vegetationRegions, ...(additions.vegetationRegions ?? [])],
    partitionCells: [...current.partitionCells, ...(additions.partitionCells ?? [])],
  });
}

export function removeRebuildLocks(current: RebuildLockState, removals: Partial<RebuildLockState>): RebuildLockState {
  return {
    terrainRegions: removeKeys(current.terrainRegions, removals.terrainRegions),
    paintRegions: removeKeys(current.paintRegions, removals.paintRegions),
    vegetationRegions: removeKeys(current.vegetationRegions, removals.vegetationRegions),
    partitionCells: removeKeys(current.partitionCells, removals.partitionCells),
  };
}

export function hasRebuildLocks(locks: RebuildLockState): boolean {
  return countScopeKeys(locks) > 0;
}

export function createLockConflicts(request: PlatformCookMapRequest | null, locks: RebuildLockState): LockConflict[] {
  if (!request || !hasRebuildLocks(locks)) {
    return [];
  }

  if (request.full) {
    return createScopeConflictEntries(locks, "Full cook touches locked scope");
  }

  return createScopeConflictEntries({
    terrainRegions: intersectKeys(request.scopes.terrainRegions, locks.terrainRegions),
    paintRegions: intersectKeys(request.scopes.paintRegions, locks.paintRegions),
    vegetationRegions: intersectKeys(request.scopes.vegetationRegions, locks.vegetationRegions),
    partitionCells: intersectKeys(request.scopes.partitionCells, locks.partitionCells),
  }, "Scoped cook intersects locked scope");
}

export function formatLockConflictReason(conflicts: readonly LockConflict[]): string | null {
  if (conflicts.length === 0) {
    return null;
  }

  const first = conflicts[0];
  const total = conflicts.reduce((sum, conflict) => sum + conflict.values.length, 0);
  return `${first.label} ${first.values.slice(0, 3).join(", ")}${total > 3 ? ` +${total - 3}` : ""}`;
}

export function summarizePlanScopes(plan: EditorRebuildPlan): ScopeSummary[] {
  return [
    createScopeSummary("terrainRegions", "Terrain", plan.scopes.terrainRegions),
    createScopeSummary("paintRegions", "Paint", plan.scopes.paintRegions),
    createScopeSummary("vegetationRegions", "Vegetation", plan.scopes.vegetationRegions),
    createScopeSummary("partitionCells", "Cells", plan.scopes.partitionCells),
  ];
}

export function summarizeCookRisk(plan: EditorRebuildPlan): CookRiskSummary {
  if (plan.status === "save-first") {
    return { label: "Save First", tone: "warning", detail: "Unsaved source edits must be committed before cook." };
  }
  if (plan.changedStages.includes("full")) {
    return { label: "Full", tone: "danger", detail: "All rebuild scopes are affected." };
  }
  if (countPlanScopeKeys(plan) > 64 || plan.changedStages.length > 4) {
    return { label: "Broad", tone: "warning", detail: "Multiple stages or many local scopes are affected." };
  }
  if (plan.status === "ready") {
    return { label: "Scoped", tone: "info", detail: "Only the planned local scopes are affected." };
  }

  return { label: plan.label, tone: plan.tone, detail: "No cook execution is currently needed." };
}

export function formatCookKind(kind: CookRunKind): string {
  return kind === "dryRun" ? "Dry Run" : "Cook";
}

export function formatCookMapResult(result: PlatformCookMapResult): string {
  const lines = [
    `$ ${result.command.map(formatDisplayCommandArg).join(" ")}`,
    `exit ${result.exitCode} in ${(result.durationMs / 1000).toFixed(1)}s`,
  ];

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (stdout) {
    lines.push(stdout);
  }
  if (stderr) {
    lines.push(`stderr:\n${stderr}`);
  }

  return lines.join("\n\n");
}

export function formatShortTime(value: number | null): string {
  if (!value) {
    return "pending";
  }

  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function createAnalysis(
  category: CookFailureCategory,
  label: string,
  detail: string,
  actions: string[],
  text: string,
): CookFailureAnalysis {
  return {
    category,
    label,
    tone: category === "success" ? "success" : category === "execution" || category === "unknown" ? "danger" : "warning",
    detail,
    actions,
    ...createTargetAnalysisFields(text),
  };
}

function createNeutralAnalysis(label: string, detail: string): CookFailureAnalysis {
  return { category: "unknown", label, tone: "info", detail, actions: [], targets: [], targetDetails: [] };
}

function createScopeSummary(key: keyof RebuildScopes, label: string, values: readonly string[]): ScopeSummary {
  return {
    key,
    label,
    count: values.length,
    sample: values.length === 0 ? "none" : values.length <= 5 ? values.join(", ") : `${values.slice(0, 5).join(", ")} +${values.length - 5}`,
  };
}

function countPlanScopeKeys(plan: EditorRebuildPlan): number {
  return countScopeKeys(plan.scopes);
}

function countScopeKeys(scopes: RebuildScopes): number {
  return scopes.terrainRegions.length
    + scopes.paintRegions.length
    + scopes.vegetationRegions.length
    + scopes.partitionCells.length;
}

function createScopeConflictEntries(scopes: RebuildScopes, reason: string): LockConflict[] {
  return [
    createLockConflict("terrainRegions", "Terrain", scopes.terrainRegions, reason),
    createLockConflict("paintRegions", "Paint", scopes.paintRegions, reason),
    createLockConflict("vegetationRegions", "Vegetation", scopes.vegetationRegions, reason),
    createLockConflict("partitionCells", "Cells", scopes.partitionCells, reason),
  ].filter((entry) => entry.values.length > 0);
}

function createLockConflict(key: keyof RebuildScopes, label: string, values: string[], reason: string): LockConflict {
  return { key, label, values, reason };
}

function uniqueGridKeys(values: readonly string[] | null | undefined): string[] {
  return [...new Set((values ?? []).filter((value) => /^-?\d+,-?\d+$/.test(value)))].sort(compareGridKeys);
}

function removeKeys(values: readonly string[], removals: readonly string[] | null | undefined): string[] {
  const removalSet = new Set(removals ?? []);
  return values.filter((value) => !removalSet.has(value));
}

function intersectKeys(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return uniqueGridKeys(left.filter((value) => rightSet.has(value)));
}

function compareGridKeys(left: string, right: string): number {
  const [leftX = 0, leftZ = 0] = left.split(",").map(Number);
  const [rightX = 0, rightZ = 0] = right.split(",").map(Number);
  return leftZ - rightZ || leftX - rightX;
}

function createDisplayCommand(request: PlatformCookMapRequest): string[] {
  const args = ["pnpm", "cook:map", "--", request.projectPath, "--map", request.mapId];
  if (request.dryRun) {
    args.push("--plan");
  }
  if (request.full) {
    args.push("--full");
    return args;
  }
  if (request.changedStages.length > 0) {
    args.push("--changed-stage", request.changedStages.join(","));
  }

  appendScopeArgs(args, "--terrain-region", request.scopes.terrainRegions);
  appendScopeArgs(args, "--paint-region", request.scopes.paintRegions);
  appendScopeArgs(args, "--vegetation-region", request.scopes.vegetationRegions);
  appendScopeArgs(args, "--cell", request.scopes.partitionCells);
  return args;
}

function appendScopeArgs(args: string[], flag: string, values: readonly string[]): void {
  for (const value of values) {
    args.push(flag, value);
  }
}

function createTargetAnalysisFields(text: string): Pick<CookFailureAnalysis, "targets" | "targetDetails"> {
  const targetDetails = extractCookTargetDetails(text);
  return {
    targets: targetDetails.map((target) => target.path),
    targetDetails,
  };
}

function formatDisplayCommandArg(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export function summarizeLockScopes(locks: RebuildLockState): ScopeSummary[] {
  return [
    createScopeSummary("terrainRegions", "Terrain", locks.terrainRegions),
    createScopeSummary("paintRegions", "Paint", locks.paintRegions),
    createScopeSummary("vegetationRegions", "Vegetation", locks.vegetationRegions),
    createScopeSummary("partitionCells", "Cells", locks.partitionCells),
  ];
}

function cloneCookRequest(request: PlatformCookMapRequest): PlatformCookMapRequest {
  return {
    projectPath: request.projectPath,
    mapId: request.mapId,
    dryRun: request.dryRun,
    full: request.full,
    changedStages: [...request.changedStages],
    scopes: {
      terrainRegions: [...request.scopes.terrainRegions],
      paintRegions: [...request.scopes.paintRegions],
      vegetationRegions: [...request.scopes.vegetationRegions],
      partitionCells: [...request.scopes.partitionCells],
    },
  };
}

function createFullRecoveryRequest(projectPath: string, mapId: string, dryRun: boolean): PlatformCookMapRequest {
  return {
    projectPath,
    mapId,
    dryRun,
    full: true,
    changedStages: [],
    scopes: createEmptyScopes(),
  };
}

function createEmptyScopes(): RebuildScopes {
  return {
    terrainRegions: [],
    paintRegions: [],
    vegetationRegions: [],
    partitionCells: [],
  };
}

function normalizeTargetPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^([A-Za-z]:)?\/+/, "");
}

function inferTargetKind(path: string): CookTargetKind {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".mjs")) {
    return "script";
  }
  if (/\.(glb|gltf|png|jpe?g|webp)$/.test(normalized)) {
    return "asset";
  }
  if (/\.(heightpack|paintpack|vegpack|objectpack|collisionpack|navpack)$/.test(normalized)) {
    return normalized.includes("cooked/maps/") ? "cookedPack" : "sourcePack";
  }
  if (normalized.endsWith(".json")) {
    return normalized.includes("cooked/maps/") ? "cookedManifest" : "sourceManifest";
  }

  return "unknown";
}

function inferTargetStage(path: string): string | null {
  const normalized = path.toLowerCase();
  if (normalized.includes("assets/registry.json")) {
    return "assetRegistry";
  }
  if (normalized.includes("generation/graph.json")) {
    return "generationGraph";
  }
  if (normalized.includes("terrain/height/")) {
    return "terrain";
  }
  if (normalized.includes("paint/")) {
    return "paint";
  }
  if (normalized.includes("vegetation/")) {
    return "vegetation";
  }
  if (normalized.includes("objects/")) {
    return "objects";
  }
  if (normalized.includes("collision/")) {
    return "collision";
  }
  if (normalized.includes("nav/")) {
    return "nav";
  }

  return null;
}

function inferTargetScope(path: string, stage: string | null): { key: keyof RebuildScopes; value: string } | null {
  const gridKey = parseTargetGridKey(path);
  if (!gridKey) {
    return null;
  }

  switch (stage) {
    case "terrain":
      return { key: "terrainRegions", value: gridKey };
    case "paint":
      return { key: "paintRegions", value: gridKey };
    case "vegetation":
      return { key: "vegetationRegions", value: gridKey };
    case "objects":
    case "collision":
    case "nav":
      return { key: "partitionCells", value: gridKey };
    default:
      return null;
  }
}

function inferTargetSection(path: string, stage: string | null): { id: CookTargetSectionId; label: string } {
  const normalized = path.toLowerCase();
  if (stage === "generationGraph" || normalized.endsWith(".mjs")) {
    return { id: "world-debug-rebuild-graph", label: "Rebuild Graph" };
  }
  if (stage === "collision" || stage === "nav") {
    return { id: "world-debug-partition-runtime", label: "Partition Runtime" };
  }
  if (normalized.includes("cooked/maps/")) {
    return { id: "world-debug-rebuild-plan", label: "Rebuild Plan" };
  }

  return { id: "world-debug-asset-health", label: "Asset Health" };
}

function parseTargetGridKey(path: string): string | null {
  const fileName = path.split("/").pop() ?? path;
  const match = /^[rc]_((?:m)?\d+|-?\d+)_((?:m)?\d+|-?\d+)\.[^.]+$/.exec(fileName);
  if (!match) {
    return null;
  }

  const x = parsePackedCoordinate(match[1]);
  const z = parsePackedCoordinate(match[2]);
  return x === null || z === null ? null : `${x},${z}`;
}

function parsePackedCoordinate(value: string): number | null {
  const normalized = value.startsWith("m") ? `-${value.slice(1)}` : value;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function formatTargetLabel(path: string, stage: string | null, scopeValue: string | null): string {
  if (stage && scopeValue) {
    return `${formatStageNameForTarget(stage)} ${scopeValue}`;
  }
  if (stage) {
    return formatStageNameForTarget(stage);
  }

  return path.split("/").pop() ?? path;
}

function formatStageNameForTarget(stage: string): string {
  switch (stage) {
    case "assetRegistry":
      return "Asset Registry";
    case "generationGraph":
      return "Generation Graph";
    default:
      return `${stage.slice(0, 1).toUpperCase()}${stage.slice(1)}`;
  }
}