// WorldDebugRebuildState: project-level editor sidecar persistence for rebuild orchestration.

import { getPlatform, type PlatformCookMapRequest } from "@/platform";
import {
  emptyRebuildLocks,
  normalizeRebuildLocks,
  type CookFailureAnalysis,
  type CookHistoryEntry,
  type CookHistoryStatus,
  type CookQueueItem,
  type CookQueueStatus,
  type CookRunKind,
  type RebuildLockState,
} from "./worldDebugRebuildConsole";

export type RebuildMapState = {
  locks: RebuildLockState;
  history: CookHistoryEntry[];
  queue: CookQueueItem[];
};

type RebuildStateFile = {
  format: "open-fps-editor-rebuild-state-v1";
  version: 1;
  maps: Record<string, Partial<RebuildMapState>>;
};

const platform = getPlatform();
const rebuildStatePath = ".open-fps/editor/rebuild-state.json";
const rebuildStateFormat = "open-fps-editor-rebuild-state-v1";
const rebuildStateVersion = 1;
const persistedHistoryLimit = 24;
const persistedQueueLimit = 32;
const persistedOutputLimit = 16_000;

const emptyAnalysis: CookFailureAnalysis = {
  category: "unknown",
  label: "Unknown",
  tone: "warning",
  detail: "No persisted analysis is available.",
  actions: [],
  targets: [],
};

export function createEmptyRebuildMapState(): RebuildMapState {
  return {
    locks: normalizeRebuildLocks(emptyRebuildLocks),
    history: [],
    queue: [],
  };
}

export async function loadRebuildMapState(projectPath: string | null, mapId: string | null): Promise<RebuildMapState> {
  if (!projectPath || !mapId) {
    return createEmptyRebuildMapState();
  }

  const file = await readRebuildStateFile(projectPath);
  return normalizeRebuildMapState(file.maps[mapId]);
}

export async function saveRebuildMapState(projectPath: string | null, mapId: string | null, state: RebuildMapState): Promise<void> {
  if (!projectPath || !mapId) {
    return;
  }

  const file = await readRebuildStateFile(projectPath);
  file.maps[mapId] = normalizeRebuildMapState(state);
  await platform.files.writeText(joinPath(projectPath, rebuildStatePath), `${JSON.stringify(file, null, 2)}\n`);
}

export function normalizeRebuildMapState(value: Partial<RebuildMapState> | null | undefined): RebuildMapState {
  return {
    locks: normalizeRebuildLocks(value?.locks),
    history: normalizeHistory(value?.history).slice(0, persistedHistoryLimit),
    queue: normalizeQueue(value?.queue).slice(0, persistedQueueLimit),
  };
}

export function limitPersistedHistory(history: CookHistoryEntry[]): CookHistoryEntry[] {
  return normalizeHistory(history).slice(0, persistedHistoryLimit);
}

export function limitPersistedQueue(queue: CookQueueItem[]): CookQueueItem[] {
  return normalizeQueue(queue).slice(0, persistedQueueLimit);
}

async function readRebuildStateFile(projectPath: string): Promise<RebuildStateFile> {
  try {
    const parsed = JSON.parse(await platform.files.readText(joinPath(projectPath, rebuildStatePath))) as unknown;
    const record = asRecord(parsed);
    if (record?.format !== rebuildStateFormat || record.version !== rebuildStateVersion) {
      return createEmptyStateFile();
    }

    const maps = asPartialMapRecord(asRecord(record.maps));
    return { format: rebuildStateFormat, version: rebuildStateVersion, maps };
  } catch {
    return createEmptyStateFile();
  }
}

function createEmptyStateFile(): RebuildStateFile {
  return { format: rebuildStateFormat, version: rebuildStateVersion, maps: {} };
}

function normalizeHistory(value: unknown): CookHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeHistoryEntry).filter((entry): entry is CookHistoryEntry => entry !== null);
}

function normalizeHistoryEntry(value: unknown): CookHistoryEntry | null {
  const record = asRecord(value);
  const id = readString(record, "id");
  const kind = readCookKind(record, "kind");
  const status = readHistoryStatus(record, "status");
  if (!id || !kind || !status) {
    return null;
  }

  return {
    id,
    kind,
    status,
    label: readString(record, "label") ?? `${kind} ${status}`,
    startedAt: readNumber(record, "startedAt") ?? 0,
    finishedAt: readNullableNumber(record, "finishedAt"),
    exitCode: readNullableNumber(record, "exitCode"),
    durationMs: readNullableNumber(record, "durationMs"),
    command: readStringArray(record?.command),
    output: truncateText(readString(record, "output") ?? ""),
    analysis: normalizeAnalysis(record?.analysis),
  };
}

function normalizeQueue(value: unknown): CookQueueItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeQueueItem).filter((item): item is CookQueueItem => item !== null);
}

function normalizeQueueItem(value: unknown): CookQueueItem | null {
  const record = asRecord(value);
  const id = readString(record, "id");
  const kind = readCookKind(record, "kind");
  const request = normalizeCookRequest(record?.request);
  if (!id || !kind || !request) {
    return null;
  }

  const rawStatus = readQueueStatus(record, "status") ?? "queued";
  return {
    id,
    kind,
    label: readString(record, "label") ?? (kind === "dryRun" ? "Dry Run Review" : "Cook"),
    status: rawStatus === "running" ? "queued" : rawStatus,
    request,
    blockedReason: readString(record, "blockedReason"),
  };
}

function normalizeCookRequest(value: unknown): PlatformCookMapRequest | null {
  const record = asRecord(value);
  const projectPath = readString(record, "projectPath");
  const mapId = readString(record, "mapId");
  const scopes = asRecord(record?.scopes);
  if (!projectPath || !mapId || !scopes) {
    return null;
  }

  return {
    projectPath,
    mapId,
    dryRun: readBoolean(record, "dryRun") ?? false,
    full: readBoolean(record, "full") ?? false,
    changedStages: readStringArray(record?.changedStages),
    scopes: {
      terrainRegions: readStringArray(scopes.terrainRegions),
      paintRegions: readStringArray(scopes.paintRegions),
      vegetationRegions: readStringArray(scopes.vegetationRegions),
      partitionCells: readStringArray(scopes.partitionCells),
    },
  };
}

function normalizeAnalysis(value: unknown): CookFailureAnalysis {
  const record = asRecord(value);
  return {
    ...emptyAnalysis,
    category: readString(record, "category") as CookFailureAnalysis["category"] ?? emptyAnalysis.category,
    label: readString(record, "label") ?? emptyAnalysis.label,
    tone: readString(record, "tone") as CookFailureAnalysis["tone"] ?? emptyAnalysis.tone,
    detail: readString(record, "detail") ?? emptyAnalysis.detail,
    actions: readStringArray(record?.actions),
    targets: readStringArray(record?.targets),
  };
}

function readCookKind(record: Record<string, unknown> | null, key: string): CookRunKind | null {
  const value = readString(record, key);
  return value === "dryRun" || value === "cook" ? value : null;
}

function readHistoryStatus(record: Record<string, unknown> | null, key: string): CookHistoryStatus | null {
  const value = readString(record, key);
  return value === "running" || value === "success" || value === "error" || value === "skipped" ? value : null;
}

function readQueueStatus(record: Record<string, unknown> | null, key: string): CookQueueStatus | null {
  const value = readString(record, key);
  return value === "queued" || value === "blocked" || value === "running" || value === "success" || value === "error" || value === "skipped" ? value : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function readBoolean(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNullableNumber(record: Record<string, unknown> | null, key: string): number | null {
  return record?.[key] === null ? null : readNumber(record, key);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asPartialMapRecord(value: Record<string, unknown> | null): Record<string, Partial<RebuildMapState>> {
  const maps: Record<string, Partial<RebuildMapState>> = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    const record = asRecord(entry);
    if (record) {
      maps[key] = record as Partial<RebuildMapState>;
    }
  }

  return maps;
}

function truncateText(value: string): string {
  return value.length > persistedOutputLimit ? `${value.slice(0, persistedOutputLimit)}\n[output truncated]` : value;
}

function joinPath(root: string, relativePath: string): string {
  return `${root.replace(/[\\/]$/, "")}/${relativePath}`;
}