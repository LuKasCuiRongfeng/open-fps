// WorldDebugRebuildConsole: pure helpers for editor rebuild execution diagnostics.
// WorldDebugRebuildConsole：编辑器重建执行诊断的纯辅助逻辑。

import type { PlatformCookMapRequest, PlatformCookMapResult } from "@/platform";
import type { EditorRebuildPlan, MetricTone, RebuildScopes } from "./worldDebugDiagnostics";

export type CookRunKind = "dryRun" | "cook";
export type CookHistoryStatus = "running" | "success" | "error" | "skipped";
export type CookFailureCategory = "success" | "source" | "cooked" | "graph" | "pack" | "environment" | "validation" | "execution" | "unknown";

export type CookFailureAnalysis = {
  category: CookFailureCategory;
  label: string;
  tone: MetricTone;
  detail: string;
  actions: string[];
  targets: string[];
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
  analysis: CookFailureAnalysis;
};

export type CookQueueItem = {
  id: string;
  kind: CookRunKind;
  label: string;
  status: CookHistoryStatus | "queued";
  request: PlatformCookMapRequest;
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

const targetPattern = /(?:[A-Za-z]:)?[\w./\\-]+\.(?:json|heightpack|paintpack|vegpack|objectpack|mjs|glb|png|jpg|jpeg|webp)/g;

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

export function createCookQueue(request: PlatformCookMapRequest): CookQueueItem[] {
  return [
    {
      id: createCookId("dryRun"),
      kind: "dryRun",
      label: "Dry Run Review",
      status: "queued",
      request: { ...request, dryRun: true },
    },
    {
      id: createCookId("cook"),
      kind: "cook",
      label: request.full ? "Full Cook" : "Scoped Cook",
      status: "queued",
      request: { ...request, dryRun: false },
    },
  ];
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
      targets: extractCookTargets(text),
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
    targets: extractCookTargets(text),
  };
}

function createNeutralAnalysis(label: string, detail: string): CookFailureAnalysis {
  return { category: "unknown", label, tone: "info", detail, actions: [], targets: [] };
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
  return plan.scopes.terrainRegions.length
    + plan.scopes.paintRegions.length
    + plan.scopes.vegetationRegions.length
    + plan.scopes.partitionCells.length;
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

function extractCookTargets(text: string): string[] {
  const targets = new Set<string>();
  for (const match of text.matchAll(targetPattern)) {
    targets.add(match[0].replace(/\\/g, "/"));
    if (targets.size >= 6) {
      break;
    }
  }

  return [...targets];
}

function formatDisplayCommandArg(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}