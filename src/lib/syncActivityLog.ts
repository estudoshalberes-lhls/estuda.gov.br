export type SyncActivityStatus = 'success' | 'error' | 'warning';

export type SyncActivityCategory =
  | 'drive-sync'
  | 'drive-restore'
  | 'drive-backup'
  | 'drive-upload'
  | 'drive-delete'
  | 'firebase-sync'
  | 'firebase-restore'
  | 'oauth';

export type AffectedFileAction =
  | 'uploaded'
  | 'restored'
  | 'imported-orphan'
  | 'trashed'
  | 'skipped-tombstone'
  | 'queued-delete'
  | 'failed';

export interface SyncAffectedFile {
  name: string;
  action: AffectedFileAction;
  module?: string;
  driveFileId?: string;
  detail?: string;
}

export interface SyncActivityLogStats {
  uploaded?: number;
  restored?: number;
  imported?: number;
  trashed?: number;
  skippedTombstones?: number;
  queuedDeletes?: number;
  chunks?: number;
}

export interface SyncActivityLogEntry {
  id: string;
  timestamp: string;
  category: SyncActivityCategory;
  operation: string;
  status: SyncActivityStatus;
  message: string;
  errorCode?: string;
  affectedFiles: SyncAffectedFile[];
  stats?: SyncActivityLogStats;
}

export type NewSyncActivityLogInput = Omit<SyncActivityLogEntry, 'id' | 'timestamp' | 'affectedFiles'> & {
  id?: string;
  timestamp?: string;
  affectedFiles?: SyncAffectedFile[];
};

const SYNC_ACTIVITY_LOG_PREFIX = 'ce_sync_activity_log_v1::';
const MAX_ACTIVITY_LOGS = 60;
const MAX_AFFECTED_FILES_PER_LOG = 25;

type SyncActivityLogListener = (scope: string, logs: SyncActivityLogEntry[]) => void;
const listeners = new Set<SyncActivityLogListener>();

function getStorageKey(scope: string): string {
  return `${SYNC_ACTIVITY_LOG_PREFIX}${scope || 'offline_guest'}`;
}

function generateLogId(): string {
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeAffectedFiles(files?: SyncAffectedFile[]): SyncAffectedFile[] {
  if (!Array.isArray(files) || files.length === 0) return [];
  const seen = new Set<string>();
  const cleaned: SyncAffectedFile[] = [];
  for (const item of files) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) continue;
    const dedupeKey = `${item.action}::${item.driveFileId || item.name.trim().toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    cleaned.push({
      name: item.name.trim(),
      action: item.action,
      ...(item.module ? { module: item.module } : {}),
      ...(item.driveFileId ? { driveFileId: item.driveFileId } : {}),
      ...(item.detail ? { detail: item.detail } : {}),
    });
    if (cleaned.length >= MAX_AFFECTED_FILES_PER_LOG) break;
  }
  return cleaned;
}

function notifyListeners(scope: string, logs: SyncActivityLogEntry[]): void {
  listeners.forEach((listener) => {
    try {
      listener(scope, logs);
    } catch {
      // ignore listener error
    }
  });
}

export function loadSyncActivityLogs(scope: string): SyncActivityLogEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(getStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SyncActivityLogEntry =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.timestamp === 'string' &&
        typeof item.operation === 'string' &&
        typeof item.message === 'string',
    );
  } catch {
    return [];
  }
}

function saveSyncActivityLogs(scope: string, logs: SyncActivityLogEntry[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      getStorageKey(scope),
      JSON.stringify(logs.slice(0, MAX_ACTIVITY_LOGS)),
    );
  } catch {
    // ignore storage quota errors
  }
}

export function appendSyncActivityLog(
  scope: string,
  input: NewSyncActivityLogInput,
): SyncActivityLogEntry {
  const entry: SyncActivityLogEntry = {
    id: input.id || generateLogId(),
    timestamp: input.timestamp || new Date().toISOString(),
    category: input.category,
    operation: input.operation,
    status: input.status,
    message: input.message,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    affectedFiles: sanitizeAffectedFiles(input.affectedFiles),
    ...(input.stats ? { stats: input.stats } : {}),
  };

  const existing = loadSyncActivityLogs(scope);
  const previous = existing[0];
  // Avoid duplicating identical consecutive OAuth or failure warnings within 30s
  if (
    previous &&
    previous.category === entry.category &&
    previous.operation === entry.operation &&
    previous.status === entry.status &&
    previous.errorCode === entry.errorCode &&
    previous.message === entry.message &&
    previous.affectedFiles.length === entry.affectedFiles.length &&
    Math.abs(Date.parse(entry.timestamp) - Date.parse(previous.timestamp)) < 30_000
  ) {
    return previous;
  }

  const next = [entry, ...existing].slice(0, MAX_ACTIVITY_LOGS);
  saveSyncActivityLogs(scope, next);
  notifyListeners(scope, next);
  return entry;
}

export function clearSyncActivityLogsForScope(scope: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(getStorageKey(scope));
    }
  } catch {
    // ignore storage errors
  }
  notifyListeners(scope, []);
}

export function subscribeSyncActivityLogs(listener: SyncActivityLogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
