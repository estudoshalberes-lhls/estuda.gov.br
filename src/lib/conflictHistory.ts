import type { StudyDatabase } from '../types/study';

export type ConflictSource = 'apps-script' | 'google-drive' | 'drive-file' | 'oauth';
export type ConflictKind = 'version-divergence' | 'sync-failure' | 'file-conflict' | 'auth-failure';
export type ConflictResolutionStatus = 'pending' | 'resolved-local' | 'resolved-drive' | 'dismissed';

export interface DatabaseVersionSummary {
  updatedAt?: string | null;
  version?: number;
  fileName?: string;
  laws: number;
  scheduleTopics: number;
  questions: number;
  annotations: number;
  pdfs: number;
}

export interface SyncConflictHistoryEntry {
  id: string;
  timestamp: string;
  source: ConflictSource;
  kind: ConflictKind;
  title: string;
  reason: string;
  errorCode?: string;
  status: ConflictResolutionStatus;
  resolvedAt?: string;
  resolutionNote?: string;
  fileName?: string;
  driveFileId?: string;
  serverConflictId?: string;
  localSummary?: DatabaseVersionSummary;
  driveSummary?: DatabaseVersionSummary;
}

export interface VersionComparisonReport {
  checkedAt: string;
  backendMode: 'apps-script' | 'google-drive-oauth';
  hasDivergence: boolean;
  divergenceReason?: string;
  localSummary: DatabaseVersionSummary;
  driveSummary: DatabaseVersionSummary | null;
  driveFileId?: string;
  driveFileName?: string;
  error?: string;
}

export type NewConflictHistoryInput = Omit<SyncConflictHistoryEntry, 'id' | 'timestamp' | 'status'> & {
  id?: string;
  timestamp?: string;
  status?: ConflictResolutionStatus;
};

const CONFLICT_HISTORY_PREFIX = 'ce_sync_conflict_history_v1::';
const MAX_CONFLICT_HISTORY = 80;

type ConflictHistoryListener = (scope: string, items: SyncConflictHistoryEntry[]) => void;
const listeners = new Set<ConflictHistoryListener>();

function getStorageKey(scope: string): string {
  return `${CONFLICT_HISTORY_PREFIX}${scope || 'offline_guest'}`;
}

function generateConflictId(): string {
  return `conf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildDatabaseVersionSummary(
  db: StudyDatabase | null | undefined,
  meta?: { updatedAt?: string | null; version?: number; fileName?: string },
): DatabaseVersionSummary {
  if (!db) {
    return {
      updatedAt: meta?.updatedAt || null,
      version: meta?.version,
      fileName: meta?.fileName,
      laws: 0,
      scheduleTopics: 0,
      questions: 0,
      annotations: 0,
      pdfs: 0,
    };
  }

  const lawsCount = Array.isArray((db as any).laws)
    ? (db as any).laws.length
    : db.laws && typeof db.laws === 'object'
      ? Object.keys(db.laws).length
      : 0;

  let scheduleTopics = 0;
  if (db.schedule && typeof db.schedule === 'object') {
    for (const dayTopics of Object.values(db.schedule)) {
      if (Array.isArray(dayTopics)) scheduleTopics += dayTopics.length;
    }
  }

  let pdfsCount = 0;
  if (db.pdfFolders && typeof db.pdfFolders === 'object') {
    for (const list of Object.values(db.pdfFolders)) {
      if (Array.isArray(list)) {
        pdfsCount += list.length;
      }
    }
  }

  return {
    updatedAt: meta?.updatedAt || null,
    version: meta?.version,
    fileName: meta?.fileName,
    laws: lawsCount,
    scheduleTopics,
    questions: Array.isArray(db.questions) ? db.questions.length : 0,
    annotations: Array.isArray(db.annotations) ? db.annotations.length : 0,
    pdfs: pdfsCount,
  };
}

function notifyListeners(scope: string, items: SyncConflictHistoryEntry[]): void {
  listeners.forEach((listener) => {
    try {
      listener(scope, items);
    } catch {
      // ignore listener error
    }
  });
}

export function loadConflictHistory(scope: string): SyncConflictHistoryEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(getStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SyncConflictHistoryEntry =>
        Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string',
    );
  } catch {
    return [];
  }
}

function saveConflictHistory(scope: string, items: SyncConflictHistoryEntry[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(getStorageKey(scope), JSON.stringify(items.slice(0, MAX_CONFLICT_HISTORY)));
  } catch {
    // ignore storage quota errors
  }
}

export function recordConflictHistoryEntry(
  scope: string,
  input: NewConflictHistoryInput,
): SyncConflictHistoryEntry {
  const entry: SyncConflictHistoryEntry = {
    id: input.id || generateConflictId(),
    timestamp: input.timestamp || new Date().toISOString(),
    source: input.source,
    kind: input.kind,
    title: input.title,
    reason: input.reason,
    status: input.status || 'pending',
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
    ...(input.resolutionNote ? { resolutionNote: input.resolutionNote } : {}),
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(input.driveFileId ? { driveFileId: input.driveFileId } : {}),
    ...(input.serverConflictId ? { serverConflictId: input.serverConflictId } : {}),
    ...(input.localSummary ? { localSummary: input.localSummary } : {}),
    ...(input.driveSummary ? { driveSummary: input.driveSummary } : {}),
  };

  const existing = loadConflictHistory(scope);

  // Deduplica conflitos idênticos pendentes registrados nos últimos 60s
  const duplicateIdx = existing.findIndex(
    (item) =>
      item.status === 'pending' &&
      item.kind === entry.kind &&
      item.source === entry.source &&
      item.title === entry.title &&
      item.errorCode === entry.errorCode &&
      Math.abs(Date.parse(entry.timestamp) - Date.parse(item.timestamp)) < 60_000,
  );

  let next: SyncConflictHistoryEntry[];
  if (duplicateIdx >= 0) {
    next = [...existing];
    next[duplicateIdx] = {
      ...next[duplicateIdx],
      timestamp: entry.timestamp,
      reason: entry.reason,
      localSummary: entry.localSummary || next[duplicateIdx].localSummary,
      driveSummary: entry.driveSummary || next[duplicateIdx].driveSummary,
      serverConflictId: entry.serverConflictId || next[duplicateIdx].serverConflictId,
    };
  } else {
    next = [entry, ...existing].slice(0, MAX_CONFLICT_HISTORY);
  }

  saveConflictHistory(scope, next);
  notifyListeners(scope, next);
  return entry;
}

export function updateConflictHistoryStatus(
  scope: string,
  entryId: string | 'ALL_PENDING_VERSION',
  status: ConflictResolutionStatus,
  resolutionNote?: string,
): SyncConflictHistoryEntry[] {
  const existing = loadConflictHistory(scope);
  const nowIso = new Date().toISOString();
  const next = existing.map((item) => {
    const match =
      entryId === 'ALL_PENDING_VERSION'
        ? item.status === 'pending' && (item.kind === 'version-divergence' || item.kind === 'sync-failure')
        : item.id === entryId;
    if (!match) return item;
    return {
      ...item,
      status,
      resolvedAt: nowIso,
      ...(resolutionNote ? { resolutionNote } : {}),
    };
  });
  saveConflictHistory(scope, next);
  notifyListeners(scope, next);
  return next;
}

export function clearResolvedConflictHistoryForScope(scope: string): SyncConflictHistoryEntry[] {
  const existing = loadConflictHistory(scope);
  const next = existing.filter((item) => item.status === 'pending');
  saveConflictHistory(scope, next);
  notifyListeners(scope, next);
  return next;
}

export function subscribeConflictHistory(listener: ConflictHistoryListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
