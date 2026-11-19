import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_PREFERENCES,
  THEMES,
  createInitialDatabase,
  ensureSeededBlobs,
} from '../data/seedData';
import {
  clearAllFileBlobs,
  clearDriveJsonCacheForScope,
  deleteFileBlob,
  ensurePersistentBrowserStorage,
  getAllFileBlobs,
  getFileBlob,
  loadScopedDatabaseJson,
  loadScopedSyncMeta,
  saveFileBlob,
  saveScopedDatabaseJson,
  saveScopedSyncMeta,
  StoredDatabaseSnapshot,
  triggerBlobDownload,
  setStorageUserScope,
  DriveUploadOutboxItem,
  getDriveUploadOutbox,
  enqueueDriveUploadOutbox,
  removeDriveUploadOutboxItem,
  LocalRestorePointMeta,
  listLocalRestorePoints,
  createLocalRestorePoint,
  loadLocalRestorePointJson,
  deleteLocalRestorePoint,
} from '../lib/fileStorage';
import {
  CLOUD_SYNC_FILENAME,
  DEFAULT_STUDY_FOLDER_ID,
  DRIVE_FOLDER_NAME,
  GoogleAccountUser as User,
  googleSignOut,
  getOrCreateStudyFolder,
  syncStudySubFoldersInDrive,
  uploadFileToDrive,
  upsertTextFileInDriveSubFolder,
  getAccessToken,
  clearAccessTokenOnly,
  subscribeDriveTokenChanges,
  isDriveFilePermissionBlocked,
  DriveFileInfo,
  DriveFolderSummary,
  buildDriveSignatureMap,
  serializeDriveSignatureMap,
  selectScopedBackupList,
  saveCloudSyncSnapshot,
  saveDatabaseBackupToDrive,
  listDatabaseBackupsFromDrive,
  pruneOldDatabaseBackupsFromDrive,
  listAllStudyFilesInDrive,
  listDriveFoldersOverview,
  downloadBackupFileFromDrive,
  downloadLatestCloudSync,
  downloadDriveFileBlob,
  deleteFileFromDrive,
  trashFileInDriveDetailed,
  DriveTrashFailureReason,
  deleteStudyFilesFromDrive,
  flushPendingDriveDeletes,
  getPendingDriveDeletes,
  queuePendingDriveDeletes,
  clearPendingDriveDeletes,
  removePendingDriveDeletesForDriveFile,
  removePendingDriveDeletesForTarget,
  DriveDeleteTarget,
  getPreferredStudyFolder,
  setPreferredStudyFolder,
  getKnownStudyDriveFolderNames,
  rememberKnownStudyDriveFolderName,
  getDriveFolderMetadata,
  verifyDriveFolderWritable,
  extractDriveFolderId,
  openDrivePicker,
  classifyDriveFileSyncOrigin,
} from '../lib/googleDrive';
import {
  DEFAULT_FIXED_SUBJECTS,
  WEEKDAYS,
  buildContestTxtFileName,
  buildEditalTxtFileName,
  buildScheduleWeekMetadata,
  cleanSafeName,
  displayBaseName,
  formatIsoDateBr,
  formatScheduleDuration,
  getCurrentWeekDates,
  getWeekDatesForIsoWeek,
  healAndNormalizeLawItems,
  inferFixedSubjectFromTopic,
  isContestOrEditalTxtDescriptor,
  isReservedBackupFolderName,
  isScheduleTxtDescriptor,
  localDateBrazilian,
  localDateIso,
  localDateTimeBrazilian,
  normalizeAnswer,
  normalizeQuestionOptions,
  normalizeSearch,
  parseAnswerKeyWithMode,
  parseContestOrEditalTxt,
  parseEditalTopicsText,
  parseLawTextToItems,
  parseScheduleText,
  parseScheduleWeekText,
  parseUploadedQuestions,
  resolveActiveScheduleWeekKey,
  scheduleDurationSeconds,
  serializeAllContestsMasterTxt,
  serializeContestEditalTxt,
  serializeContestRegistrationTxt,
  serializeScheduleWeekToText,
  sortLawItemsInOrder,
  splitExamQuestion,
  splitLawDevices,
  uid,
  visibleName,
} from '../lib/parsers';
import {
  applyIncrementalDeltaToDatabase,
  applyTombstonesToMergedDatabase,
  buildIncrementalDatabaseBackup,
  clearDeletedTombstones,
  computeDatabaseContentHash,
  computeSerializedContentHash,
  detectDeletedEntitiesBetweenDatabases,
  isContestOrScheduleTombstoned,
  isDriveFileTombstoned,
  isIncrementalBackupPayload,
  mergeTombstoneMaps,
  pruneActiveTombstonesForDatabase,
  reconcileCompletedAndArchivedItems,
  recordDeletedTombstones,
  removeDeletedTombstoneKeys,
  stripActiveEntityTombstones,
} from '../lib/incrementalBackup';
import {
  DeletedDriveConflict,
  TimestampSyncComparisonReport,
  addIgnoredDriveConflictFileId,
  compareLocalAndDriveFileTimestamps,
  isDriveTimestampNewerThanLocal,
  removeIgnoredDriveConflictFileId,
} from '../lib/driveTimestampSync';
import {
  decryptBackupEnvelope,
  encryptBackupJson,
  isEncryptedBackupEnvelope,
} from '../lib/cryptoBackup';
import {
  extractTextFromPdfFile,
  readAnswerKeyInput,
  readStudyBlobText,
  readStudyTextFile,
} from '../lib/pdfExtract';
import {
  API_URL as GAS_DEFAULT_API_URL,
  GasSession,
  clearGasSession,
  gasCheckHealth,
  gasInspectRemoteVersion,
  gasListAuditLogs,
  gasListConflicts,
  gasLogin,
  gasLogout,
  gasPing,
  gasPullState,
  gasPushState,
  gasResolveConflict,
  gasSetStudyFolder,
  gasSetupDailyBackupTrigger,
  gasVerifyChecksumBeforeWrite,
  getConfiguredGasApiUrl,
  getGasSession,
  isGasSessionActive,
  setConfiguredGasApiUrl,
  subscribeGasActiveSyncEvents,
  subscribeGasSession,
  updateGasSessionMetadata,
} from '../lib/appsScriptBackend';
import {
  GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS,
  GasAuditLogEntry,
  GasQueuedOperation,
  clearFailedGasQueueItems as clearFailedGasQueueItemsStore,
  configureGasOperationQueueCallbacks,
  getLocalGasAuditLogs,
  isGasQueueConnectionOnline,
  isGasQueueProcessing,
  loadGasOperationQueue,
  notifyGasConnectionRestored,
  processGasOperationQueue,
  removeGasQueueItem as removeGasQueueItemStore,
  setGasQueueConnectionOnline,
  subscribeGasOperationQueue,
  subscribeLocalGasAuditLogs,
} from '../lib/gasOperationQueue';
import {
  SyncConflictHistoryEntry,
  VersionComparisonReport,
  buildDatabaseVersionSummary,
  clearResolvedConflictHistoryForScope,
  loadConflictHistory,
  recordConflictHistoryEntry,
  subscribeConflictHistory,
  updateConflictHistoryStatus,
} from '../lib/conflictHistory';
import {
  NewSyncActivityLogInput,
  SyncActivityLogEntry,
  SyncAffectedFile,
  appendSyncActivityLog,
  clearSyncActivityLogsForScope,
  loadSyncActivityLogs,
  subscribeSyncActivityLogs,
} from '../lib/syncActivityLog';
import { publishTimerTickSnapshot } from '../lib/timerTickStore';
import {
  ActiveTimerLink,
  AppPreferences,
  CaseLawItem,
  CompletedSimulation,
  ContestEditalPoint,
  ContestItem,
  EditalLawLink,
  ErrorNotebookEntry,
  EssayRecord,
  HighlightColorKey,
  HistoryRecord,
  IncidenceGrade,
  LawFolderData,
  LawHighlight,
  LawItem,
  LawPdfEntry,
  LawReadingEntry,
  ModuleName,
  ModuleVisibility,
  PdfFileAnnotations,
  PersonalPdfFile,
  PomodoroMode,
  ProofFileRecord,
  Question,
  QuestionAlternative,
  QuizAnswer,
  QuizSession,
  RestoreProgress,
  SavedIncidenceFilter,
  ScheduleMap,
  ScheduleTopic,
  StudyDatabase,
  StudyTimeRecord,
  SubmittedSimulation,
  SummaryFile,
  ToastMessage,
  WeekdayName,
  WeeklyScheduleFileRecord,
} from '../types/study';

function addDaysIso(baseIso: string, days: number): string {
  const parts = baseIso.split('-').map(Number);
  const d =
    parts.length === 3 && parts.every((n) => Number.isFinite(n))
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date();
  d.setDate(d.getDate() + days);
  return localDateIso(d);
}

function playPomodoroChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.08, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.36);
    });
  } catch {
    // Ignore audio context blocks
  }
}

const EMAIL_SCOPE_MAP_KEY = 'central_estudos_email_scope_v1';
const DRIVE_SYNC_DEBOUNCE_MS = 20000;

export function getUserScopeKey(user: { uid?: string; email?: string | null } | null): string {
  if (!user) return 'offline_guest';
  const defaultScope =
    user.uid && user.uid.trim()
      ? `user_${user.uid.trim()}`
      : user.email && user.email.trim()
        ? `user_${user.email.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_')}`
        : 'offline_guest';
  if (typeof window === 'undefined' || !window.localStorage || !user.email?.trim()) {
    return defaultScope;
  }
  const cleanEmail = user.email.trim().toLowerCase();
  try {
    const rawMap = localStorage.getItem(EMAIL_SCOPE_MAP_KEY);
    const map: Record<string, string> = rawMap ? JSON.parse(rawMap) : {};
    if (map[cleanEmail]) return map[cleanEmail];
    if (localStorage.getItem(`central-estudos-db-${defaultScope}`)) {
      map[cleanEmail] = defaultScope;
      localStorage.setItem(EMAIL_SCOPE_MAP_KEY, JSON.stringify(map));
      return defaultScope;
    }
    const existingUserScopes: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.startsWith('central-estudos-db-user_') && !k.endsWith('_backup')) {
        existingUserScopes.push(k.replace(/^central-estudos-db-/, ''));
      }
    }
    if (existingUserScopes.length === 1) {
      const adopted = existingUserScopes[0];
      map[cleanEmail] = adopted;
      localStorage.setItem(EMAIL_SCOPE_MAP_KEY, JSON.stringify(map));
      return adopted;
    }
  } catch {
    // ignore storage lookup errors
  }
  return defaultScope;
}

const DB_STORAGE_KEY_LEGACY = 'central-estudos-db-v1';
const TIMER_STORAGE_KEY_LEGACY = 'central-study-timer';
const QUOTE_STORAGE_KEY_LEGACY = 'central-daily-quote';

export function getDbStorageKey(scope: string): string {
  return `central-estudos-db-${scope}`;
}
export function getTimerStorageKey(scope: string): string {
  return `central-study-timer-${scope}`;
}
export function getTimerTopicStorageKey(scope: string): string {
  return `central-timer-topic-${scope}`;
}
export function getQuoteStorageKey(scope: string): string {
  return `central-daily-quote-${scope}`;
}
export function getSyncMetaKey(scope: string): string {
  return `central-estudos-sync-meta-${scope}`;
}

interface ScopeSyncMeta {
  lastLocalEditAt?: string;
  lastCloudSyncAt?: string;
  lastMergedGuestEditAt?: string;
  hasPendingCloudSync?: boolean;
  lastCloudContentHash?: string;
  lastBackupContentHash?: string;
  lastSyncedFolderId?: string;
  lastSubfoldersSyncedFolderId?: string;
  lastCloudBackupSignature?: string;
  cachedBackupSignatureMap?: Record<string, string>;
  lastDriveFilesSignature?: string;
  cachedDriveFilesSignatureMap?: Record<string, string>;
  lastCacheVerifiedAt?: string;
  idbAuthoritative?: boolean;
  lastSavedByteLength?: number;
}

let pendingIdbDbWrites = 0;

function hasPersistedPendingSync(meta: ScopeSyncMeta): boolean {
  if (meta.hasPendingCloudSync) return true;
  const editMs = Date.parse(meta.lastLocalEditAt || '') || 0;
  const syncMs = Date.parse(meta.lastCloudSyncAt || '') || 0;
  return editMs > 0 && (syncMs === 0 || editMs > syncMs + 1500);
}

function loadSyncMeta(scope: string): ScopeSyncMeta {
  try {
    const raw = localStorage.getItem(getSyncMetaKey(scope));
    return raw ? (JSON.parse(raw) as ScopeSyncMeta) : {};
  } catch {
    return {};
  }
}

function saveSyncMeta(scope: string, patch: Partial<ScopeSyncMeta>): ScopeSyncMeta {
  const next = { ...loadSyncMeta(scope), ...patch };
  try {
    localStorage.setItem(getSyncMetaKey(scope), JSON.stringify(next));
  } catch {
    // Fallback: evict oversized legacy/db cache if quota is tight so sync metadata always persists
    try {
      localStorage.removeItem(DB_STORAGE_KEY_LEGACY);
      localStorage.removeItem(getDbStorageKey(scope));
      next.idbAuthoritative = true;
      localStorage.setItem(getSyncMetaKey(scope), JSON.stringify(next));
    } catch {
      // ignore if localStorage is completely blocked
    }
  }
  void saveScopedSyncMeta(scope, next);
  return next;
}

function getDbBackupStorageKey(scope: string): string {
  return `central-estudos-db-backup-${scope}`;
}

const pendingBackupWriteTimers = new Map<string, number>();

function scheduleSecondaryBackupWrite(scope: string, serialized: string): void {
  const backupKey = getDbBackupStorageKey(scope);
  const existing = pendingBackupWriteTimers.get(scope);
  if (existing !== undefined) {
    window.clearTimeout(existing);
  }
  const timerId = window.setTimeout(() => {
    pendingBackupWriteTimers.delete(scope);
    const run = () => {
      try {
        localStorage.setItem(backupKey, serialized);
      } catch {
        try {
          localStorage.removeItem(backupKey);
        } catch {
          // ignore
        }
      }
    };
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (typeof ric === 'function') {
      ric(run, { timeout: 2000 });
    } else {
      run();
    }
  }, 1500);
  pendingBackupWriteTimers.set(scope, timerId);
}

function persistLocalDatabaseForScope(
  scope: string,
  serialized: string,
  ts: string,
  extraMeta?: Partial<ScopeSyncMeta>,
): void {
  let lsSaved = false;
  const primaryKey = getDbStorageKey(scope);
  const backupKey = getDbBackupStorageKey(scope);
  try {
    localStorage.setItem(primaryKey, serialized);
    lsSaved = true;
    // Keep a secondary redundant recovery copy in localStorage when payload fits comfortably (<1.8 MB),
    // deferred to idle time so edits never block the main thread with two synchronous multi-MB writes.
    if (serialized.length < 1_800_000) {
      scheduleSecondaryBackupWrite(scope, serialized);
    }
  } catch {
    // IndexedDB remains primary persistence when localStorage hits ~5 MB quota;
    // remove the stale smaller localStorage DB immediately so syncMeta never loses quota
    try {
      localStorage.removeItem(backupKey);
      localStorage.removeItem(primaryKey);
      localStorage.removeItem(DB_STORAGE_KEY_LEGACY);
    } catch {
      // ignore
    }
  }

  saveSyncMeta(scope, {
    idbAuthoritative: !lsSaved,
    lastSavedByteLength: serialized.length,
    ...extraMeta,
  });

  pendingIdbDbWrites += 1;
  void saveScopedDatabaseJson(scope, serialized, ts).finally(() => {
    pendingIdbDbWrites = Math.max(0, pendingIdbDbWrites - 1);
  });
}

function shouldPreferIdbSnapshot(
  scope: string,
  idbSnap: StoredDatabaseSnapshot | null,
  hadLocalLs: boolean,
): boolean {
  if (!idbSnap?.raw) return false;
  const meta = loadSyncMeta(scope);
  const localTs = Date.parse(meta.lastLocalEditAt || '') || 0;
  const idbTs = Date.parse(idbSnap.updatedAt || '') || 0;
  let lsSize = 0;
  try {
    lsSize = (localStorage.getItem(getDbStorageKey(scope)) || '').length;
  } catch {
    lsSize = 0;
  }

  if (lsSize === 0 && idbSnap.byteLength > 0) return true;
  if (!hadLocalLs && idbSnap.byteLength > 0) return true;
  if (meta.idbAuthoritative && idbSnap.byteLength >= lsSize) return true;
  if (
    meta.lastSavedByteLength &&
    lsSize !== meta.lastSavedByteLength &&
    idbSnap.byteLength === meta.lastSavedByteLength
  ) {
    return true;
  }
  return idbTs > localTs + 1500;
}

function buildDriveFileStamp(file: DriveFileInfo): string {
  const parent = file.parents?.[0] || '';
  return `${file.modifiedTime || file.createdTime || new Date().toISOString()}:${file.size || ''}:${parent}`;
}

function recordUploadedFilesInCacheMeta(
  scope: string,
  opts: {
    backupFiles?: Array<DriveFileInfo | null | undefined>;
    driveFiles?: Array<DriveFileInfo | null | undefined>;
    folderId?: string;
    extraPatch?: Partial<ScopeSyncMeta>;
  },
): ScopeSyncMeta {
  const meta = loadSyncMeta(scope);
  const backupMap = { ...(meta.cachedBackupSignatureMap || {}) };
  const filesMap = { ...(meta.cachedDriveFilesSignatureMap || {}) };
  let updatedBackup = false;
  let updatedFiles = false;

  for (const bf of opts.backupFiles || []) {
    if (!bf?.id) continue;
    const stamp = buildDriveFileStamp(bf);
    backupMap[bf.id] = stamp;
    filesMap[bf.id] = stamp;
    updatedBackup = true;
    updatedFiles = true;
  }

  for (const df of opts.driveFiles || []) {
    if (!df?.id) continue;
    filesMap[df.id] = buildDriveFileStamp(df);
    updatedFiles = true;
  }

  const patch: Partial<ScopeSyncMeta> = {
    ...(opts.folderId ? { lastSyncedFolderId: opts.folderId } : {}),
    lastCacheVerifiedAt: new Date().toISOString(),
    ...opts.extraPatch,
  };
  if (updatedBackup) {
    patch.cachedBackupSignatureMap = backupMap;
    patch.lastCloudBackupSignature = serializeDriveSignatureMap(backupMap);
  }
  if (updatedFiles) {
    patch.cachedDriveFilesSignatureMap = filesMap;
    patch.lastDriveFilesSignature = serializeDriveSignatureMap(filesMap);
  }
  return saveSyncMeta(scope, patch);
}

function invalidateDriveBrowserCacheMeta(scope: string): ScopeSyncMeta {
  return saveSyncMeta(scope, {
    lastSyncedFolderId: undefined,
    lastSubfoldersSyncedFolderId: undefined,
    lastCloudBackupSignature: undefined,
    cachedBackupSignatureMap: undefined,
    lastDriveFilesSignature: undefined,
    cachedDriveFilesSignatureMap: undefined,
    lastCacheVerifiedAt: undefined,
  });
}

function removeFileIdsFromCacheMeta(scope: string, fileIds: string[]): ScopeSyncMeta | null {
  if (!fileIds.length) return null;
  const meta = loadSyncMeta(scope);
  const nextBackupMap = meta.cachedBackupSignatureMap ? { ...meta.cachedBackupSignatureMap } : undefined;
  const nextFilesMap = meta.cachedDriveFilesSignatureMap ? { ...meta.cachedDriveFilesSignatureMap } : undefined;
  let changed = false;

  for (const id of fileIds) {
    if (nextBackupMap && id in nextBackupMap) {
      delete nextBackupMap[id];
      changed = true;
    }
    if (nextFilesMap && id in nextFilesMap) {
      delete nextFilesMap[id];
      changed = true;
    }
  }
  if (!changed) return null;

  return saveSyncMeta(scope, {
    ...(nextBackupMap
      ? {
          cachedBackupSignatureMap: nextBackupMap,
          lastCloudBackupSignature: serializeDriveSignatureMap(nextBackupMap),
        }
      : {}),
    ...(nextFilesMap
      ? {
          cachedDriveFilesSignatureMap: nextFilesMap,
          lastDriveFilesSignature: serializeDriveSignatureMap(nextFilesMap),
        }
      : {}),
  });
}

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmDialogState extends ConfirmOptions {
  resolve: (accepted: boolean) => void;
}

interface TimerStored {
  elapsed: number;
  startedAt: number;
}

export interface LawDeepLink {
  folder: string;
  search?: string;
  tab?: 'continuous' | 'devices';
  onlyMatches?: boolean;
  nonce: number;
}

export type GasConnectionStatus =
  | 'online'
  | 'offline'
  | 'checking'
  | 'session-expired'
  | 'disconnected';

export interface GasConnectionHealth {
  status: GasConnectionStatus;
  lastCheckedAt: string | null;
  lastOnlineAt: string | null;
  latencyMs: number | null;
  consecutiveFailures: number;
  errorMessage: string | null;
  serverVersion: number | null;
  scriptVersion: string | null;
  folderName: string | null;
  isReconnecting: boolean;
}

export type ActiveSyncGuardStatus =
  | 'idle'
  | 'checking'
  | 'in-sync'
  | 'local-ahead'
  | 'blocked-conflict'
  | 'offline-queued'
  | 'error';

export interface ActiveSyncState {
  status: ActiveSyncGuardStatus;
  localChecksum: string;
  baseChecksum: string | null;
  remoteChecksum: string | null;
  localBaseVersion: number;
  remoteVersion: number | null;
  remoteDevice: string | null;
  remoteUpdatedAt: string | null;
  lastCheckedAt: string | null;
  lastGuardOutcome: 'allowed' | 'blocked' | 'queued' | null;
  blockedReason: string | null;
  writesProtectedCount: number;
  controlSheetTable: string;
}

interface StudyContextValue {
  db: StudyDatabase;
  activePage: ModuleName;
  setActivePage: (page: ModuleName) => void;
  lawDeepLink: LawDeepLink | null;
  openLawAt: (
    folder: string,
    search?: string,
    options?: { tab?: 'continuous' | 'devices'; onlyMatches?: boolean },
  ) => void;
  clearLawDeepLink: () => void;
  selectedEditalContestId: string | null;
  setSelectedEditalContestId: (contestId: string | null) => void;
  openContestEdital: (contestId: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  examFocusMode: boolean;
  setExamFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  toasts: ToastMessage[];
  toast: (message: string, isError?: boolean) => void;
  dismissToast: (id: string) => void;
  confirmDialog: ConfirmDialogState | null;
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>;

  // Header widgets & timer
  focusQuote: string;
  changeFocusQuote: () => void;
  nowTick: number;
  timerSeconds: number;
  getCurrentTimerSeconds: () => number;
  timerRunning: boolean;
  toggleTimer: () => void;
  resetTimer: () => void;
  ensureTimerRunning: () => void;
  pomodoroMode: PomodoroMode;
  pomodoroPhase: 'focus' | 'break';
  pomodoroRemainingSeconds: number;
  setPomodoroMode: (mode: PomodoroMode) => void;
  activeTimerTopic: ActiveTimerLink | null;
  linkTimerToScheduleTopic: (day: WeekdayName, topic: ScheduleTopic, startNow?: boolean) => void;
  clearTimerLink: () => void;
  commitTimerToSchedule: (overrideTarget?: {
    day: WeekdayName;
    topicId?: string;
    materia: string;
    disciplinaFixa?: string;
    concursoAlvo?: string;
    observacoes?: string;
  }) => boolean;
  logQuickStudyMinutes: (day: WeekdayName, topic: ScheduleTopic, minutes: number) => boolean;
  deleteStudyTimeRecord: (quizId: string) => void;

  // Derived data & Fixed Subjects
  disciplines: string[];
  fixedSubjects: string[];
  addFixedSubject: (subject: string) => void;
  renameFixedSubject: (oldName: string, newName: string) => void;
  removeFixedSubject: (subject: string) => void;
  questionsByDiscipline: Record<string, number>;
  allQuestions: (includeSubmitted?: boolean, subjectFilter?: string) => Question[];
  allErrorEntries: ErrorNotebookEntry[];
  moduleVisibility: (moduleName: string) => ModuleVisibility;

  // Active Quiz (Training / Simulation)
  quiz: QuizSession | null;
  setQuiz: React.Dispatch<React.SetStateAction<QuizSession | null>>;
  submitQuizAnswer: (answerKey: string) => void;
  changeQuizAnswer: (questionIndex: number, answerKey: string) => void;
  advanceQuizQuestion: () => void;
  previousQuizQuestion: () => void;
  goToQuizQuestion: (index: number) => void;
  finishQuizSession: () => void;
  cancelQuizSession: () => void;
  retryRecordStudyTime: (session: QuizSession) => void;
  retryArchiveSimulation: (session: QuizSession) => void;

  // Question bank & Simulation management
  deleteSubmittedSimulation: (simulationId: string) => Promise<void>;
  updateQuestion: (
    id: string,
    patch: Partial<Pick<Question, 'materia' | 'enunciado' | 'alternativas' | 'gabarito' | 'comentario' | 'tipo'>>,
  ) => void;
  deleteQuestion: (id: string) => void;

  // Error Notebook & Spaced Repetition
  addAnnotation: (materia: string, tipo: string, texto: string) => void;
  updateAnnotation: (
    id: string,
    materia: string,
    tipo: string,
    texto: string,
    questionPatch?: {
      enunciado?: string;
      gabarito?: string;
      resposta?: string;
      comentario?: string;
    },
    silent?: boolean,
  ) => void;
  updateErrorEntrySubject: (id: string, materia: string) => void;
  deleteAnnotation: (id: string) => void;
  markAnnotationCorrected: (id: string) => void;
  reopenAnnotation: (id: string) => void;
  toggleAnnotationCorrected: (id: string) => void;
  advanceErrorReview: (id: string) => void;
  startErrorNotebookQuiz: (subjectFilter?: string, onlyPending?: boolean) => void;

  // Case Law
  saveCaseLaw: (
    payload: Omit<CaseLawItem, 'id' | 'criado_em'> & { id?: string },
  ) => void;
  deleteCaseLaw: (id: string) => void;

  // Contests & Editais
  addContest: (payload: Omit<ContestItem, 'id'>) => ContestItem;
  updateContest: (id: string, patch: Partial<Omit<ContestItem, 'id'>>) => void;
  toggleContestPayment: (id: string) => void;
  deleteContest: (id: string) => void;
  saveContestEditalPoints: (
    contestId: string,
    points: Array<{ materia: string; titulo: string; observacao?: string }>,
    options?: { replace?: boolean; arquivo?: string; silent?: boolean },
  ) => number;
  importContestEditalFile: (
    contestId: string,
    file: File,
    options?: { replace?: boolean; defaultSubject?: string },
  ) => Promise<{ added: number; rawText: string; fileName: string }>;
  toggleContestEditalPoint: (contestId: string, pointId: string) => void;
  setContestEditalPointsStudied: (contestId: string, pointIds: string[], studied: boolean) => void;
  updateContestEditalPoint: (
    contestId: string,
    pointId: string,
    patch: Partial<Pick<ContestEditalPoint, 'materia' | 'titulo' | 'observacao'>>,
  ) => void;
  deleteContestEditalPoint: (contestId: string, pointId: string) => void;
  linkEditalPointToLaw: (
    contestId: string,
    pointId: string,
    link: { pastaLei: string; filtroArtigos: string; label?: string },
  ) => boolean;
  unlinkEditalPointFromLaw: (contestId: string, pointId: string, linkId: string) => void;
  clearContestEdital: (contestId: string) => Promise<boolean>;
  syncContestsAndEditaisTxtToFolder: (options?: {
    contestId?: string;
    downloadContestId?: string;
    downloadEditalContestId?: string;
    downloadMaster?: boolean;
    silent?: boolean;
  }) => Promise<void>;
  importContestsOrEditalTxtFile: (file: File) => Promise<number>;

  // Schedule & Goals
  saveScheduleDay: (day: WeekdayName, topics: ScheduleTopic[], silent?: boolean) => void;
  setScheduleDayDate: (
    day: WeekdayName,
    dateBr: string,
    options?: { overwriteCustomized?: boolean; silent?: boolean },
  ) => void;
  applyScheduleWeekDates: (
    weekInput: string,
    options?: { overwriteCustomized?: boolean; silent?: boolean },
  ) => void;
  saveScheduleWeekToTxtFolder: (
    weekInput?: string,
    options?: { silent?: boolean; download?: boolean },
  ) => Promise<void>;
  loadSavedScheduleWeek: (weekKey: string) => boolean;
  deleteSavedScheduleWeek: (weekKey: string) => void;
  addTopicToDay: (
    day: WeekdayName,
    preset?: {
      disciplina_fixa?: string;
      concurso_alvo?: string;
      materia?: string;
      tempo?: string;
      observacoes?: string;
    },
  ) => void;
  deleteScheduleTopic: (day: WeekdayName, index: number) => void;
  completeScheduleTopic: (day: WeekdayName, index: number, currentDayTopics?: ScheduleTopic[]) => void;
  archiveTopicAsIncomplete: (day: WeekdayName, index: number, currentSchedule: ScheduleMap) => void;
  archiveFullWeek: (currentSchedule: ScheduleMap) => number;
  importScheduleTxt: (file: File) => Promise<number>;
  deleteCompletedGoal: (id: string) => void;
  updateCompletedGoal: (
    id: string,
    patch: {
      data?: string;
      dia_semana?: string;
      materia?: string;
      tempo?: string;
      observacoes?: string;
    },
  ) => void;
  reopenCompletedGoal: (id: string) => void;
  saveWeeklyGoalNote: (weekMondayIso: string, notes: string, silent?: boolean) => void;
  completeIncompleteGoal: (id: string) => void;
  deleteIncompleteGoal: (id: string) => void;

  // Laws & Incidence Matrix
  createLawFolder: (name: string, options?: { silent?: boolean }) => string;
  uploadLawFile: (folder: string, file: File, options?: { silent?: boolean }) => Promise<number>;
  reprocessLawFolder: (folder: string) => Promise<number>;
  deleteLawFolder: (folder: string) => Promise<number>;
  deleteLawPdf: (folder: string, pdfId: string) => Promise<void>;
  addManualLawItem: (
    folder: string,
    dispositivo: string,
    texto: string,
    dica: string,
    grau: IncidenceGrade,
  ) => void;
  updateLawItem: (
    folder: string,
    itemId: string,
    grau: IncidenceGrade,
    observacao: string,
    dispositivo?: string,
    texto?: string,
    dica?: string,
    silent?: boolean,
  ) => void;
  deleteLawItem: (folder: string, itemId: string) => void;
  toggleLawItemRead: (folder: string, itemId: string) => void;
  markLawItemsRead: (folder: string, itemIds: string[], markAsRead: boolean) => void;
  addLawReadDate: (folder: string, dateIso: string, observacao?: string) => void;
  removeLawReadDate: (folder: string, entryId: string) => void;
  addLawItemReadDate: (
    folder: string,
    itemIds: string | string[],
    dateIso: string,
    observacao?: string,
  ) => void;
  removeLawItemReadDate: (folder: string, itemId: string, entryId: string) => void;
  setLawLastPosition: (folder: string, articleKey: string) => void;
  saveIncidenceFilter: (
    payload: Omit<SavedIncidenceFilter, 'id' | 'criado_em'> & { id?: string },
  ) => SavedIncidenceFilter;
  deleteIncidenceFilter: (id: string) => void;
  addLawHighlight: (
    folder: string,
    text: string,
    color: HighlightColorKey,
    options?: { itemId?: string; startOffset?: number; endOffset?: number },
  ) => void;
  cycleLawHighlightColor: (folder: string, targetTextOrId: string, itemId?: string) => void;
  removeLawHighlightText: (folder: string, text: string) => boolean;
  removeLastLawHighlight: (folder: string) => void;
  saveLawNote: (folder: string, note: string, silent?: boolean) => void;

  // Personal PDFs
  createPdfFolder: (name: string) => string;
  renamePdfFolder: (oldName: string, newName: string) => string;
  uploadPersonalPdfs: (folder: string, files: File[]) => Promise<number>;
  replacePersonalPdf: (folder: string, fileId: string, replacement: File) => Promise<void>;
  savePdfAnnotations: (blobKey: string, annotations: PdfFileAnnotations) => void;
  commitAnnotatedPersonalPdf: (
    folder: string,
    fileId: string,
    updatedBlob: Blob,
    hasAnnotations: boolean,
    options?: { silent?: boolean },
  ) => Promise<boolean>;
  deletePersonalPdf: (folder: string, fileId: string) => Promise<void>;
  deletePdfFolder: (folder: string) => Promise<number>;

  // Summaries
  createSummaryFolder: (name: string) => string;
  uploadSummaryFile: (folder: string, file: File) => Promise<void>;
  deleteSummaryFile: (folder: string, fileId: string) => Promise<void>;

  // Proofs
  createProofBank: (name: string) => string;
  uploadProofOnly: (bank: string, file: File) => Promise<void>;
  uploadProofWithAnswer: (
    bank: string,
    kind: 'provas' | 'provas-com-gabarito',
    proofFile: File,
    answerFile: File | null,
    answerText: string,
    observacoes: string,
  ) => Promise<number>;
  replaceProofPdf: (proofId: string, replacement: File) => Promise<void>;
  deleteProofFile: (proofId: string) => Promise<void>;
  updateProofObservations: (proofId: string, observacoes: string, silent?: boolean) => void;
  addOrUpdateProofCorrection: (
    proofId: string,
    questao: string,
    observacoes: string,
    correctionId?: string,
  ) => void;
  deleteProofCorrection: (proofId: string, correctionId: string) => void;

  // Discursive Essays
  submitEssay: (titulo: string, file: File) => Promise<EssayRecord>;
  updateEssayCorrection: (essayId: string, feedback: string, correctedFile?: File | null) => Promise<EssayRecord>;
  deleteEssay: (essayId: string) => Promise<void>;

  // Critical Points
  addCriticalPoint: (data: string, materia: string, titulo: string, texto: string) => void;
  deleteCriticalPoint: (id: string) => void;

  // Utilities
  importQuestionsTxt: (
    file: File,
    subjectInput: string,
    asSimulation: boolean,
  ) => Promise<{ count: number; materia: string; simulado: boolean }>;
  addManualQuestion: (payload: {
    materia: string;
    enunciado: string;
    alternativasText: string;
    gabarito: string;
    comentario: string;
  }) => { materia: string };
  convertLawPdf: (file: File, folderName: string) => Promise<{ pasta: string; dispositivos: number }>;
  convertExamPdf: (
    pdfFile: File,
    subjectInput: string,
    answerFile: File | null,
    answerText: string,
    asSimulation: boolean,
  ) => Promise<{ count: number; materia: string; simulado: boolean }>;
  convertExamToStructuredTxt: (
    pdfFile: File,
    answerFile: File | null,
    answerText: string,
  ) => Promise<string>;

  // Backup & Settings
  exportBackupJson: (options?: { passphrase?: string }) => Promise<{ fileCount: number }>;
  importBackupJson: (file: File, options?: { passphrase?: string }) => Promise<void>;
  resetDemoData: () => Promise<void>;
  testLocalIntegrity: () => { status: string; totalRecords: number };
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  updateModuleVisibility: (moduleName: string, key: keyof ModuleVisibility, value: boolean) => void;

  // Google Drive & Apps Script Cloud integration
  lastLocalWriteMs: number;
  googleUser: User | null;
  driveConnected: boolean;
  driveTokenReady: boolean;
  isRenewingDriveToken: boolean;
  driveFolderUrl: string | null;
  activeDriveFolderId: string | null;
  activeDriveFolderName: string;
  lastCloudSyncAt: string | null;
  lastCacheVerifiedAt: string | null;
  isSyncingDrive: boolean;
  hasPendingCloudChanges: boolean;
  drivePermissionNeedsPicker: { folderId: string; folderName: string; count: number } | null;
  authorizeDriveFolderViaPicker: () => Promise<boolean>;
  restoreProgress: RestoreProgress | null;
  authError: string | null;
  connectGoogleDrive: (options?: { forceAccountPicker?: boolean }) => Promise<boolean>;
  disconnectGoogleDrive: () => Promise<void>;
  clearDriveBrowserCache: () => Promise<void>;
  selectDriveStudyFolder: (folder: { id?: string; name?: string }) => Promise<boolean>;
  syncAllLocalFilesToDrive: () => Promise<{ synced: number; errors: number; folderUrl?: string }>;
  restoreAllFromGoogleDrive: (options?: {
    silentIfEmpty?: boolean;
    folderId?: string;
    forceModule?: 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries';
    associateAsDefault?: boolean;
  }) => Promise<{
    restoredDb: boolean;
    filesRestored: number;
    orphansImported: number;
    permissionBlockedCount?: number;
  }>;
  pickDriveFolderOrFiles: (options?: {
    parentFolderId?: string;
    mode?: 'folders-and-files' | 'files-only' | 'folders-only';
    targetModule?: 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries';
    autoRestore?: boolean;
  }) => Promise<{
    folder?: { id: string; name: string };
    restoredDb: boolean;
    filesRestored: number;
    orphansImported: number;
    permissionBlockedCount: number;
  } | null>;
  inspectDriveFolders: () => Promise<DriveFolderSummary[]>;
  importDriveFolderFiles: (
    folderId: string,
    targetModule?: 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries',
  ) => Promise<number>;
  recoverFileFromDrive: (blobKey: string, filename?: string) => Promise<Blob | null>;
  saveCloudBackup: () => Promise<boolean>;
  listCloudBackups: () => Promise<DriveFileInfo[]>;
  restoreCloudBackup: (fileId: string) => Promise<boolean>;
  deleteCloudBackup: (fileId: string) => Promise<boolean>;
  pruneOldCloudBackups: (maxKeep?: number) => Promise<number>;
  syncActivityLogs: SyncActivityLogEntry[];
  clearSyncActivityLogs: () => void;
  // Modo 100% Google Apps Script (Drive + Planilha Oculta)
  gasSession: GasSession | null;
  gasConnected: boolean;
  gasApiUrl: string;
  gasConnectionHealth: GasConnectionHealth;
  checkGasConnectionNow: (options?: { silent?: boolean }) => Promise<GasConnectionHealth>;
  forceReconnectAppsScript: (credentials?: {
    username?: string;
    password?: string;
    customApiUrl?: string;
  }) => Promise<{ ok: boolean; needsLogin?: boolean; message: string }>;
  setGasApiUrl: (url: string) => void;
  connectAppsScript: (
    username: string,
    password: string,
    customApiUrl?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  disconnectAppsScript: () => Promise<void>;
  testAppsScriptConnection: (customApiUrl?: string) => Promise<{
    ok: boolean;
    version?: string;
    serverVersion?: number;
    folderName?: string;
    message: string;
  }>;
  setAppsScriptStudyFolder: (folderIdOrUrl: string) => Promise<boolean>;
  setupAppsScriptDailyBackup: () => Promise<boolean>;
  // Fila de Operações (Queue LocalStorage + Backoff Exponencial) & Auditoria de Sincronização
  gasOperationQueue: GasQueuedOperation[];
  gasQueueProcessing: boolean;
  localGasAuditLogs: GasAuditLogEntry[];
  processGasQueueNow: (options?: { forceAll?: boolean; onlyItemId?: string }) => Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    remaining: number;
  }>;
  removeGasQueueItem: (id: string) => void;
  clearFailedGasQueueItems: () => number;
  fetchGasAuditLogs: (limit?: number) => Promise<{
    ok: boolean;
    logs: GasAuditLogEntry[];
    source: 'drive-json' | 'sheet' | 'unavailable';
    updatedAt?: string | null;
    unsupportedByScript?: boolean;
    error?: string;
  }>;
  // Módulo de Sincronização Ativa (Comparação de Checksum e Versão contra Planilha de Controle antes de cada gravação)
  activeSyncState: ActiveSyncState;
  verifyActiveSyncChecksumNow: (options?: { silent?: boolean }) => Promise<ActiveSyncState>;
  triggerActiveSyncPushNow: () => Promise<boolean>;
  // Histórico de Conflitos & Resolução Manual (Local × Drive)
  conflictHistory: SyncConflictHistoryEntry[];
  latestVersionComparison: VersionComparisonReport | null;
  isCheckingDivergence: boolean;
  resolvingConflictAction: string | null;
  checkLocalVsDriveDivergence: () => Promise<VersionComparisonReport | null>;
  resolveVersionDivergenceKeepLocal: (entryId?: string) => Promise<boolean>;
  resolveVersionDivergenceKeepDrive: (entryId?: string) => Promise<boolean>;
  dismissConflictHistoryEntry: (entryId: string) => void;
  clearResolvedConflictHistory: () => void;
  driveSyncConflicts: DeletedDriveConflict[];
  driveConflictErrors: Record<string, { reason: DriveTrashFailureReason; message: string }>;
  resolvingDriveConflictId: string | null;
  resolveDriveConflictRemoveCloud: (conflictId: string) => Promise<boolean>;
  authorizeAndRemoveDriveConflict: (conflictId: string) => Promise<boolean>;
  ignoreDriveConflict: (conflictId: string) => void;
  resolveDriveConflictRestoreLocal: (conflictId: string) => Promise<boolean>;
  resolveAllDriveConflictsRemoveCloud: () => Promise<void>;
  resolveAllDriveConflictsRestoreLocal: () => Promise<void>;
  dismissDriveSyncConflicts: () => void;
  checkDriveTimestampConflictsNow: () => Promise<DeletedDriveConflict[]>;
  driveUploadOutboxItems: DriveUploadOutboxItem[];
  driveUploadOutboxCount: number;
  flushDriveUploadOutboxNow: () => Promise<number>;
  localRestorePoints: LocalRestorePointMeta[];
  createManualRestorePoint: (reason?: string) => Promise<LocalRestorePointMeta | null>;
  restoreFromLocalRestorePoint: (pointId: string) => Promise<boolean>;
  deleteLocalRestorePointById: (pointId: string) => Promise<void>;
}

const StudyContext = createContext<StudyContextValue | null>(null);

function getDatabaseContentCounts(candidate: StudyDatabase) {
  const editalPoints = (candidate.contests || []).reduce(
    (sum, c) => sum + (c.edital_pontos?.length || 0),
    0,
  );
  const editalStudied = (candidate.contests || []).reduce(
    (sum, c) => sum + (c.edital_pontos || []).filter((p) => p.estudado).length,
    0,
  );
  const editalLinks = (candidate.contests || []).reduce(
    (sum, c) =>
      sum +
      (c.edital_pontos || []).reduce(
        (ptSum, p) => ptSum + (p.artigos_vinculados?.length || 0),
        0,
      ),
    0,
  );
  const scheduleTopics = WEEKDAYS.reduce(
    (sum, day) => sum + ((candidate.schedule?.[day] || []).length),
    0,
  );
  const lawItems = Object.values(candidate.laws || {}).reduce(
    (sum, f) => sum + (f.items?.length || 0) + (f.pdfs?.length || 0),
    0,
  );
  const lawItemReadDates = Object.values(candidate.laws || {}).reduce(
    (sum, f) =>
      sum +
      (f.items || []).reduce((itSum, it) => itSum + (it.leituras?.length || 0), 0),
    0,
  );
  const filesCount =
    Object.values(candidate.pdfFolders || {}).reduce((sum, list) => sum + list.length, 0) +
    Object.values(candidate.summaryFolders || {}).reduce((sum, list) => sum + list.length, 0) +
    (candidate.proofFiles?.length || 0) +
    (candidate.essays?.length || 0);

  return {
    questions: (candidate.questions || []).length,
    contests: (candidate.contests || []).length,
    editalPoints,
    editalStudied,
    editalLinks,
    scheduleTopics,
    lawFolders: Object.keys(candidate.laws || {}).length,
    lawItems,
    lawItemReadDates,
    savedFilters: (candidate.savedIncidenceFilters || []).length,
    annotations: (candidate.annotations || []).length,
    completedGoals: (candidate.completedGoals || []).length,
    incompleteGoals: (candidate.incompleteGoals || []).length,
    filesCount,
    studyRecords: (candidate.studyTimeRecords || []).length,
  };
}

function hasMoreCustomEntities(localDb: StudyDatabase, cloudDb: StudyDatabase): boolean {
  const l = getDatabaseContentCounts(localDb);
  const c = getDatabaseContentCounts(cloudDb);
  if (
    l.contests > c.contests ||
    l.editalPoints > c.editalPoints ||
    l.editalStudied > c.editalStudied ||
    l.editalLinks > c.editalLinks ||
    l.scheduleTopics > c.scheduleTopics ||
    l.questions > c.questions ||
    l.lawFolders > c.lawFolders ||
    l.lawItems > c.lawItems ||
    l.lawItemReadDates > c.lawItemReadDates ||
    l.savedFilters > c.savedFilters ||
    l.annotations > c.annotations ||
    l.completedGoals > c.completedGoals ||
    l.incompleteGoals > c.incompleteGoals ||
    l.filesCount > c.filesCount ||
    l.studyRecords > c.studyRecords
  ) {
    return true;
  }

  // Also detect per-key local additions even if aggregate counts are equal or smaller
  const cloudLawByNorm = new Map<string, LawFolderData>();
  Object.entries(cloudDb.laws || {}).forEach(([k, v]) => {
    cloudLawByNorm.set(normalizeSearch(visibleName(k)), v);
  });
  for (const [k, localFolder] of Object.entries(localDb.laws || {})) {
    const cloudFolder = (cloudDb.laws || {})[k] || cloudLawByNorm.get(normalizeSearch(visibleName(k)));
    if (!cloudFolder) return true;
    if ((localFolder.items?.length || 0) > (cloudFolder.items?.length || 0)) return true;
    if ((localFolder.pdfs?.length || 0) > (cloudFolder.pdfs?.length || 0)) return true;
  }

  const cloudContestIds = new Set((cloudDb.contests || []).map((ct) => ct.id));
  if ((localDb.contests || []).some((ct) => ct.id && !cloudContestIds.has(ct.id))) {
    return true;
  }

  // Detect custom schedule topics or weekly schedule files in localDb that aren't in cloudDb
  const isSeedId = (id?: string) => /^sch-[1-8]$/.test(id || '');
  const cloudScheduleSig = new Set(
    WEEKDAYS.flatMap((d) =>
      (cloudDb.schedule?.[d] || []).map((t) => `${d}::${t.id}::${t.materia}::${t.observacoes}`),
    ),
  );
  const localCustomScheduleTopics = WEEKDAYS.flatMap((d) =>
    (localDb.schedule?.[d] || [])
      .filter((t) => !isSeedId(t.id))
      .map((t) => `${d}::${t.id}::${t.materia}::${t.observacoes}`),
  );
  if (localCustomScheduleTopics.some((sig) => !cloudScheduleSig.has(sig))) {
    return true;
  }
  const localWeekKeys = Object.keys(localDb.weeklySchedules || {});
  const cloudWeekKeys = new Set(Object.keys(cloudDb.weeklySchedules || {}));
  if (localWeekKeys.some((wk) => !cloudWeekKeys.has(wk))) {
    return true;
  }

  return false;
}

let cachedSeedFingerprint: string | null = null;
function computeDbFingerprint(candidate: StudyDatabase): string {
  const c = getDatabaseContentCounts(candidate);
  const editalSig = (candidate.contests || [])
    .map(
      (ct) =>
        `${ct.concurso}:${(ct.edital_pontos || [])
          .map(
            (p) =>
              `${p.materia}|${p.titulo}|${p.estudado ? 1 : 0}|${(p.artigos_vinculados || [])
                .map((l) => `${l.pastaLei}:${l.filtroArtigos}`)
                .join(',')}`,
          )
          .join(';')}`,
    )
    .join('||');
  const scheduleSig = WEEKDAYS.map(
    (day) =>
      `${day}:${(candidate.schedule?.[day] || [])
        .map((t) => `${t.materia}|${t.tempo}|${t.observacoes}|${t.estudado_segundos || 0}`)
        .join(';')}`,
  ).join('||');
  const lawReadDatesCount = Object.values(candidate.lawReadDates || {}).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );
  const lawHighlightsCount = Object.values(candidate.lawHighlights || {}).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );

  return JSON.stringify({
    ...c,
    cs: (candidate.completedSimulations || []).length,
    ss: (candidate.submittedSimulations || []).length,
    h: (candidate.history || []).length,
    cl: (candidate.caseLaw || []).length,
    cp: (candidate.criticalPoints || []).length,
    lrd: lawReadDatesCount,
    lh: lawHighlightsCount,
    editalSig,
    scheduleSig,
  });
}

function getSeedFingerprint(): string {
  if (!cachedSeedFingerprint) {
    cachedSeedFingerprint = computeDbFingerprint(createInitialDatabase());
  }
  return cachedSeedFingerprint;
}

function isUntouchedSeedDatabase(candidate: StudyDatabase): boolean {
  return computeDbFingerprint(candidate) === getSeedFingerprint();
}

function toArraySafe<T = any>(val: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('entries' in obj && obj.entries && typeof obj.entries === 'object') {
      return toArraySafe<T>(obj.entries, fallback);
    }
    const numeric: Array<{ idx: number; item: T }> = [];
    for (const [k, v] of Object.entries(obj)) {
      if (/^\d+$/.test(k)) {
        numeric.push({ idx: Number(k), item: v as T });
      }
    }
    if (numeric.length > 0) {
      numeric.sort((a, b) => a.idx - b.idx);
      return numeric.map((entry) => entry.item);
    }
  }
  return fallback;
}

function normalizeArrayRecordMap<T = any>(
  ...sources: Array<Record<string, unknown> | undefined>
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const src of sources) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const [k, v] of Object.entries(src)) {
      result[k] = toArraySafe<T>(v);
    }
  }
  return result;
}

function normalizeAndMergeDatabase(rawInput: unknown): StudyDatabase {
  const seed = createInitialDatabase();
  if (!rawInput || typeof rawInput !== 'object') return seed;

  const obj = rawInput as Record<string, any>;
  const dataObj: Partial<StudyDatabase> =
    obj.data && typeof obj.data === 'object'
      ? (obj.data as Partial<StudyDatabase>)
      : obj.database && typeof obj.database === 'object'
      ? (obj.database as Partial<StudyDatabase>)
      : (obj as Partial<StudyDatabase>);

  const loadedAnnotations = [...toArraySafe(dataObj.annotations, seed.annotations || [])];
  const existingIds = new Set(loadedAnnotations.map((a) => a.id));

  // Reconcile completed simulations errors into annotations (Pendentes de Correção)
  toArraySafe(dataObj.completedSimulations).forEach((sim) => {
    toArraySafe(sim?.questoes).forEach((q) => {
      if (!q.correta && Boolean(q.resposta)) {
        const simErrId = `sim-err-${sim.id}-${q.numero}`;
        if (!existingIds.has(simErrId)) {
          const split = splitExamQuestion(q.enunciado);
          const alternatives = Array.isArray(q.alternativas) && q.alternativas.length ? q.alternativas : split.alternatives;
          loadedAnnotations.push({
            id: simErrId,
            data: sim.data || localDateBrazilian(),
            materia: q.materia,
            tipo: 'Erro em Simulado Fechado',
            texto:
              q.comentario?.trim() ||
              `Questão ${q.numero} errada no simulado fechado (marcou ${q.resposta}, gabarito ${q.gabarito}). Revisar conteúdo.`,
            corrigido: false,
            origem: 'Simulado Fechado',
            questao: {
              enunciado: Array.isArray(q.alternativas) && q.alternativas.length ? q.enunciado : split.statement,
              alternativas: alternatives,
              resposta: q.resposta,
              gabarito: q.gabarito,
              comentario: q.comentario || '',
            },
          });
          existingIds.add(simErrId);
        }
      }
    });
  });

  const normalizedContests = toArraySafe(dataObj.contests, seed.contests || []).map((c) => ({
    ...c,
    edital_pontos: toArraySafe(c?.edital_pontos)
      .map((p) => {
        const rawLinks = toArraySafe<EditalLawLink>(p?.artigos_vinculados);
        const cleanLinks: EditalLawLink[] = rawLinks
          .filter((lk) => Boolean(lk && lk.pastaLei && lk.filtroArtigos))
          .map((lk) => ({
            id: lk.id || uid(8),
            pastaLei: String(lk.pastaLei).trim(),
            filtroArtigos: String(lk.filtroArtigos).trim(),
            ...(lk.label ? { label: String(lk.label).trim() } : {}),
          }));
        return {
          id: p.id || uid(10),
          materia: String(p.materia || 'Geral').trim() || 'Geral',
          titulo: String(p.titulo || '').trim(),
          estudado: Boolean(p.estudado),
          estudado_em: p.estudado_em,
          observacao: p.observacao,
          ...(cleanLinks.length > 0 ? { artigos_vinculados: cleanLinks } : {}),
        };
      })
      .filter((p) => Boolean(p.titulo)),
  }));

  const normalizedLawReadDates: Record<string, LawReadingEntry[]> = {};
  Object.entries(
    dataObj.lawReadDates && typeof dataObj.lawReadDates === 'object' ? dataObj.lawReadDates : {},
  ).forEach(([folder, list]) => {
    const safeList = toArraySafe<LawReadingEntry>(list);
    if (Array.isArray(list) || safeList.length > 0) {
      normalizedLawReadDates[folder] = safeList
        .filter((e) => Boolean(e && e.data))
        .map((e) => ({
          id: e.id || uid(8),
          data: String(e.data),
          observacao: e.observacao ? String(e.observacao) : undefined,
        }));
    }
  });

  const extractSourcePathFromObs = (obs?: string): string | undefined => {
    const m = String(obs || '').match(/\(([^)]+)\)\s*\.?\s*$/);
    return m ? m[1] : undefined;
  };

  // Coalesce any duplicate law folder keys (e.g. "Direito Constitucional" vs "Direito_Constitucional")
  // and ensure valid items/pdfs arrays while purging misclassified Cronograma / Edital / Datas e Locais files
  const rawLaws =
    dataObj.laws !== undefined
      ? dataObj.laws && typeof dataObj.laws === 'object'
        ? dataObj.laws
        : {}
      : seed.laws || {};
  const normalizedLaws: Record<string, LawFolderData> = {};
  const normalizedLawHighlights =
    dataObj.lawHighlights !== undefined
      ? normalizeArrayRecordMap<LawHighlight>(dataObj.lawHighlights as Record<string, unknown>)
      : normalizeArrayRecordMap<LawHighlight>(seed.lawHighlights);
  const normalizedReadLawItems =
    dataObj.readLawItems !== undefined
      ? normalizeArrayRecordMap<string>(dataObj.readLawItems as Record<string, unknown>)
      : normalizeArrayRecordMap<string>(seed.readLawItems);
  const normalizedLawLastReadPosition: Record<string, string> =
    dataObj.lawLastReadPosition !== undefined
      ? {
          ...(dataObj.lawLastReadPosition && typeof dataObj.lawLastReadPosition === 'object'
            ? dataObj.lawLastReadPosition
            : {}),
        }
      : { ...(seed.lawLastReadPosition || {}) };
  const normalizedLawNotes: Record<string, string> =
    dataObj.lawNotes !== undefined
      ? {
          ...(dataObj.lawNotes && typeof dataObj.lawNotes === 'object' && !Array.isArray(dataObj.lawNotes)
            ? dataObj.lawNotes
            : {}),
        }
      : { ...(seed.lawNotes || {}) };

  const dropLawFolderMetadata = (folderKey: string) => {
    delete normalizedLawHighlights[folderKey];
    delete normalizedReadLawItems[folderKey];
    delete normalizedLawReadDates[folderKey];
    delete normalizedLawLastReadPosition[folderKey];
    delete normalizedLawNotes[folderKey];
  };

  const lawGroups = new Map<string, Array<{ key: string; folder: LawFolderData }>>();
  Object.entries(rawLaws).forEach(([key, val]) => {
    if (!val || typeof val !== 'object') return;
    if (
      isScheduleTxtDescriptor(key) ||
      isScheduleTxtDescriptor(visibleName(key)) ||
      isContestOrEditalTxtDescriptor(key) ||
      isContestOrEditalTxtDescriptor(visibleName(key))
    ) {
      dropLawFolderMetadata(key);
      return;
    }

    const rawItems = toArraySafe<LawItem>(val.items);
    const rawPdfs = toArraySafe<LawPdfEntry>(val.pdfs);
    const filteredItems = rawItems.filter(
      (it) =>
        !isScheduleTxtDescriptor(it.arquivo, undefined, it.texto) &&
        !isContestOrEditalTxtDescriptor(it.arquivo, undefined, it.texto),
    );
    const filteredPdfs = rawPdfs.filter(
      (p) =>
        !isScheduleTxtDescriptor(p.name) &&
        !isContestOrEditalTxtDescriptor(p.name),
    );

    if (
      filteredItems.length === 0 &&
      filteredPdfs.length === 0 &&
      (rawItems.length > 0 || rawPdfs.length > 0)
    ) {
      dropLawFolderMetadata(key);
      return;
    }

    const norm = normalizeSearch(visibleName(key)) || key.toLowerCase();
    const arr = lawGroups.get(norm) || [];
    arr.push({
      key,
      folder: {
        name: key,
        items: filteredItems,
        pdfs: filteredPdfs,
      },
    });
    lawGroups.set(norm, arr);
  });

  for (const group of lawGroups.values()) {
    if (group.length === 1) {
      const only = group[0];
      const healedItems = healAndNormalizeLawItems(only.folder.items);
      normalizedLaws[only.key] = {
        ...only.folder,
        items: healedItems,
      };
      const existingReadSet = new Set(toArraySafe<string>(normalizedReadLawItems[only.key]));
      const inheritedReadIds = healedItems
        .filter((it) => {
          if ((it.leituras?.length || 0) > 0) return true;
          if (it.id.includes('::sub-')) {
            const parentId = it.id.split('::sub-')[0];
            return existingReadSet.has(parentId);
          }
          return false;
        })
        .map((it) => it.id);
      if (inheritedReadIds.length > 0) {
        normalizedReadLawItems[only.key] = Array.from(
          new Set([...existingReadSet, ...inheritedReadIds]),
        );
      }
      continue;
    }

    // Pick winner with most items (preferring underscore key on ties)
    const sorted = [...group].sort((a, b) => {
      const diffItems = (b.folder.items?.length || 0) - (a.folder.items?.length || 0);
      if (diffItems !== 0) return diffItems;
      const aHasUnder = a.key.includes('_') ? 1 : 0;
      const bHasUnder = b.key.includes('_') ? 1 : 0;
      return bHasUnder - aHasUnder;
    });
    const winner = sorted[0];
    const seenItemIds = new Set<string>(winner.folder.items.map((it) => it.id));
    const mergedItems: LawItem[] = [...winner.folder.items];
    const pdfMap = new Map<string, LawPdfEntry>();
    winner.folder.pdfs.forEach((p) => {
      const pk = p.blobKey || p.name.toLowerCase();
      if (pk) pdfMap.set(pk, p);
    });

    for (const loser of sorted.slice(1)) {
      for (const it of loser.folder.items) {
        if (!seenItemIds.has(it.id)) {
          seenItemIds.add(it.id);
          mergedItems.push(it);
        }
      }
      for (const p of loser.folder.pdfs) {
        const pk = p.blobKey || p.name.toLowerCase();
        if (pk && !pdfMap.has(pk)) pdfMap.set(pk, p);
      }

      const loserHighlights = toArraySafe<LawHighlight>(normalizedLawHighlights[loser.key]);
      if (loserHighlights.length) {
        normalizedLawHighlights[winner.key] = [
          ...toArraySafe<LawHighlight>(normalizedLawHighlights[winner.key]),
          ...loserHighlights,
        ];
      }
      delete normalizedLawHighlights[loser.key];

      const loserReadItems = toArraySafe<string>(normalizedReadLawItems[loser.key]);
      if (loserReadItems.length) {
        normalizedReadLawItems[winner.key] = Array.from(
          new Set([
            ...toArraySafe<string>(normalizedReadLawItems[winner.key]),
            ...loserReadItems,
          ]),
        );
      }
      delete normalizedReadLawItems[loser.key];

      const loserReadDates = toArraySafe<LawReadingEntry>(normalizedLawReadDates[loser.key]);
      if (loserReadDates.length) {
        normalizedLawReadDates[winner.key] = [
          ...toArraySafe<LawReadingEntry>(normalizedLawReadDates[winner.key]),
          ...loserReadDates,
        ];
      }
      delete normalizedLawReadDates[loser.key];

      if (normalizedLawLastReadPosition[loser.key] && !normalizedLawLastReadPosition[winner.key]) {
        normalizedLawLastReadPosition[winner.key] = normalizedLawLastReadPosition[loser.key];
      }
      delete normalizedLawLastReadPosition[loser.key];

      if (normalizedLawNotes[loser.key]) {
        const wNote = (normalizedLawNotes[winner.key] || '').trim();
        const lNote = normalizedLawNotes[loser.key].trim();
        normalizedLawNotes[winner.key] = wNote && wNote !== lNote ? `${wNote}\n\n${lNote}` : wNote || lNote;
      }
      delete normalizedLawNotes[loser.key];
    }

    const healedMergedItems = healAndNormalizeLawItems(mergedItems);
    const winnerReadSet = new Set(toArraySafe<string>(normalizedReadLawItems[winner.key]));
    const inheritedReadIds = healedMergedItems
      .filter((it) => {
        if ((it.leituras?.length || 0) > 0) return true;
        if (it.id.includes('::sub-')) {
          const parentId = it.id.split('::sub-')[0];
          return winnerReadSet.has(parentId);
        }
        return false;
      })
      .map((it) => it.id);
    if (inheritedReadIds.length > 0) {
      normalizedReadLawItems[winner.key] = Array.from(
        new Set([...winnerReadSet, ...inheritedReadIds]),
      );
    }

    normalizedLaws[winner.key] = {
      name: winner.key,
      items: healedMergedItems,
      pdfs: Array.from(pdfMap.values()),
    };
  }

  const normalizedSavedFilters: SavedIncidenceFilter[] = toArraySafe<SavedIncidenceFilter>(
    dataObj.savedIncidenceFilters,
    seed.savedIncidenceFilters || [],
  )
    .filter((f) => Boolean(f && f.nome && f.pastaLei))
    .map((f) => ({
      id: f.id || uid(10),
      nome: String(f.nome).trim(),
      pastaLei: String(f.pastaLei).trim(),
      gradeFilter: f.gradeFilter || 'Todas',
      readStatusFilter: f.readStatusFilter || 'all',
      editalContestId: f.editalContestId || 'all',
      multiArticleQuery: String(f.multiArticleQuery || ''),
      selectedArticleKeys: toArraySafe<string>(f.selectedArticleKeys),
      search: String(f.search || ''),
      criado_em: f.criado_em || localDateTimeBrazilian(),
    }));

  const normalizedFixedSubjects = Array.from(
    new Set(
      toArraySafe<string>(dataObj.fixedSubjects, DEFAULT_FIXED_SUBJECTS)
        .map((s) => visibleName(String(s || '')))
        .filter(Boolean),
    ),
  );

  const normalizedSubmittedSimulations = toArraySafe<SubmittedSimulation>(
    dataObj.submittedSimulations,
    seed.submittedSimulations || [],
  ).filter((sim) => {
    if (!sim || typeof sim !== 'object') return false;
    const samplePrompt = sim.questoes?.[0]?.enunciado || '';
    return !(
      isScheduleTxtDescriptor(sim.arquivo, sim.materia, samplePrompt) ||
      isScheduleTxtDescriptor(sim.titulo, sim.materia, samplePrompt) ||
      isContestOrEditalTxtDescriptor(sim.arquivo, sim.materia, samplePrompt) ||
      isContestOrEditalTxtDescriptor(sim.titulo, sim.materia, samplePrompt)
    );
  });

  const normalizedProofFiles = toArraySafe<ProofFileRecord>(
    dataObj.proofFiles,
    seed.proofFiles || [],
  )
    .filter((pf) => {
      if (!pf || typeof pf !== 'object') return false;
      const obsPath = extractSourcePathFromObs(pf.observacoes);
      const pathHint = [pf.bank, obsPath].filter(Boolean).join(' / ');
      return !(
        isScheduleTxtDescriptor(pf.name, pathHint) ||
        isContestOrEditalTxtDescriptor(pf.name, pathHint)
      );
    })
    .map((pf) => ({
      ...pf,
      correcoes: toArraySafe(pf.correcoes),
    }));

  const hasProvidedSchedule =
    dataObj.schedule !== undefined && dataObj.schedule !== null && typeof dataObj.schedule === 'object';
  const rawSchedule = hasProvidedSchedule ? dataObj.schedule : {};
  const normalizedSchedule = (hasProvidedSchedule ? {} : { ...seed.schedule }) as ScheduleMap;
  WEEKDAYS.forEach((day) => {
    const dayVal = (rawSchedule as Record<string, unknown>)[day];
    if (dayVal !== undefined) {
      normalizedSchedule[day] = toArraySafe<ScheduleTopic>(dayVal);
    } else if (hasProvidedSchedule) {
      normalizedSchedule[day] = [];
    } else {
      normalizedSchedule[day] = toArraySafe<ScheduleTopic>(normalizedSchedule[day]);
    }
  });

  const rawWeeklySchedules =
    dataObj.weeklySchedules && typeof dataObj.weeklySchedules === 'object'
      ? dataObj.weeklySchedules
      : {};
  const normalizedWeeklySchedules: Record<string, WeeklyScheduleFileRecord> = {};
  Object.entries(rawWeeklySchedules).forEach(([wk, rec]) => {
    if (!rec || typeof rec !== 'object') return;
    const recSchedRaw =
      rec.schedule && typeof rec.schedule === 'object' ? rec.schedule : {};
    const safeRecSched = {} as ScheduleMap;
    WEEKDAYS.forEach((day) => {
      safeRecSched[day] = toArraySafe<ScheduleTopic>(
        (recSchedRaw as Record<string, unknown>)[day],
      );
    });
    normalizedWeeklySchedules[wk] = {
      ...rec,
      schedule: safeRecSched,
      scheduleDayDates:
        rec.scheduleDayDates && typeof rec.scheduleDayDates === 'object'
          ? rec.scheduleDayDates
          : {},
    };
  });

  // Safeguard: if active schedule is completely empty (0 topics) while weeklySchedules has
  // populated topics for the active week, automatically recover them into normalizedSchedule.
  const activeScheduleTopicCount = WEEKDAYS.reduce(
    (sum, day) => sum + (normalizedSchedule[day]?.length || 0),
    0,
  );
  if (activeScheduleTopicCount === 0 && Object.keys(normalizedWeeklySchedules).length > 0) {
    const inferredActiveKey = resolveActiveScheduleWeekKey(
      dataObj.scheduleDayDates,
      normalizedSchedule,
    );
    const matchingSavedWeek = normalizedWeeklySchedules[inferredActiveKey];
    const matchingCount = matchingSavedWeek
      ? WEEKDAYS.reduce((sum, day) => sum + (matchingSavedWeek.schedule?.[day]?.length || 0), 0)
      : 0;
    if (matchingSavedWeek && matchingCount > 0) {
      WEEKDAYS.forEach((day) => {
        normalizedSchedule[day] = [...(matchingSavedWeek.schedule?.[day] || [])];
      });
    }
  }

  const normalizedPdfFolders =
    dataObj.pdfFolders !== undefined
      ? normalizeArrayRecordMap<PersonalPdfFile>(dataObj.pdfFolders as Record<string, unknown>)
      : normalizeArrayRecordMap<PersonalPdfFile>(seed.pdfFolders);
  const rawPdfAnnotations =
    dataObj.pdfAnnotations && typeof dataObj.pdfAnnotations === 'object' && !Array.isArray(dataObj.pdfAnnotations)
      ? (dataObj.pdfAnnotations as Record<string, any>)
      : {};
  const normalizedPdfAnnotations: Record<string, PdfFileAnnotations> = {};
  Object.entries(rawPdfAnnotations).forEach(([key, val]) => {
    if (!key || !val || typeof val !== 'object') return;
    normalizedPdfAnnotations[key] = {
      strokes: toArraySafe(val.strokes),
      notes: toArraySafe(val.notes),
      updatedAt: typeof val.updatedAt === 'string' ? val.updatedAt : '',
      ...(typeof val.lastBakedAt === 'string' ? { lastBakedAt: val.lastBakedAt } : {}),
    };
  });
  const normalizedSummaryFolders =
    dataObj.summaryFolders !== undefined
      ? normalizeArrayRecordMap<SummaryFile>(dataObj.summaryFolders as Record<string, unknown>)
      : normalizeArrayRecordMap<SummaryFile>(seed.summaryFolders);

  const normalizedTombstones =
    dataObj.deletedTombstones && typeof dataObj.deletedTombstones === 'object'
      ? mergeTombstoneMaps(dataObj.deletedTombstones as Record<string, number>)
      : undefined;

  return {
    ...seed,
    ...dataObj,
    questions: toArraySafe(dataObj.questions, seed.questions || []),
    completedSimulations: toArraySafe(dataObj.completedSimulations, seed.completedSimulations || []),
    history: toArraySafe(dataObj.history, seed.history || []),
    studyTimeRecords: toArraySafe(dataObj.studyTimeRecords, seed.studyTimeRecords || []),
    caseLaw: toArraySafe(dataObj.caseLaw, seed.caseLaw || []),
    completedGoals: toArraySafe(dataObj.completedGoals, seed.completedGoals || []),
    incompleteGoals: toArraySafe(dataObj.incompleteGoals, seed.incompleteGoals || []),
    proofBanks: toArraySafe(dataObj.proofBanks, seed.proofBanks || []),
    essays: toArraySafe(dataObj.essays, seed.essays || []),
    criticalPoints: toArraySafe(dataObj.criticalPoints, seed.criticalPoints || []),
    phrases: toArraySafe(dataObj.phrases, seed.phrases || []),
    weeklyGoalNotes:
      dataObj.weeklyGoalNotes && typeof dataObj.weeklyGoalNotes === 'object' && !Array.isArray(dataObj.weeklyGoalNotes)
        ? dataObj.weeklyGoalNotes
        : seed.weeklyGoalNotes || {},
    pdfFolders: normalizedPdfFolders,
    pdfAnnotations: normalizedPdfAnnotations,
    summaryFolders: normalizedSummaryFolders,
    laws: normalizedLaws,
    submittedSimulations: normalizedSubmittedSimulations,
    proofFiles: normalizedProofFiles,
    lawHighlights: normalizedLawHighlights,
    readLawItems: normalizedReadLawItems,
    lawLastReadPosition: normalizedLawLastReadPosition,
    lawNotes: normalizedLawNotes,
    savedIncidenceFilters: normalizedSavedFilters,
    fixedSubjects: normalizedFixedSubjects,
    contests: normalizedContests,
    lawReadDates: normalizedLawReadDates,
    annotations: loadedAnnotations,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...(dataObj.preferences && typeof dataObj.preferences === 'object' ? dataObj.preferences : {}),
      modules: {
        ...(dataObj.preferences?.modules && typeof dataObj.preferences.modules === 'object'
          ? dataObj.preferences.modules
          : {}),
      },
      ...(dataObj.preferences?.quick_access_modules !== undefined
        ? { quick_access_modules: toArraySafe(dataObj.preferences.quick_access_modules) }
        : {}),
      ...(dataObj.preferences?.default_drive_folder &&
      typeof dataObj.preferences.default_drive_folder === 'object' &&
      typeof dataObj.preferences.default_drive_folder.name === 'string' &&
      dataObj.preferences.default_drive_folder.name.trim()
        ? {
            default_drive_folder: {
              id:
                typeof dataObj.preferences.default_drive_folder.id === 'string' &&
                dataObj.preferences.default_drive_folder.id.trim()
                  ? dataObj.preferences.default_drive_folder.id.trim()
                  : null,
              name: dataObj.preferences.default_drive_folder.name.trim(),
              ...(typeof dataObj.preferences.default_drive_folder.url === 'string' &&
              dataObj.preferences.default_drive_folder.url.trim()
                ? { url: dataObj.preferences.default_drive_folder.url.trim() }
                : {}),
              ...(typeof dataObj.preferences.default_drive_folder.updatedAt === 'string' &&
              dataObj.preferences.default_drive_folder.updatedAt.trim()
                ? { updatedAt: dataObj.preferences.default_drive_folder.updatedAt.trim() }
                : {}),
            },
          }
        : {}),
    },
    schedule: normalizedSchedule,
    scheduleDayDates:
      dataObj.scheduleDayDates !== undefined
        ? {
            ...(dataObj.scheduleDayDates && typeof dataObj.scheduleDayDates === 'object'
              ? dataObj.scheduleDayDates
              : {}),
          }
        : { ...(seed.scheduleDayDates || {}) },
    weeklySchedules: normalizedWeeklySchedules,
    ...(normalizedTombstones && Object.keys(normalizedTombstones).length > 0
      ? { deletedTombstones: normalizedTombstones }
      : {}),
  };
}

function loadStoredDatabase(scope: string): StudyDatabase {
  const tryParseRaw = (raw: string | null): StudyDatabase | null => {
    if (!raw) return null;
    try {
      return applyTombstonesToMergedDatabase(normalizeAndMergeDatabase(JSON.parse(raw)), scope);
    } catch {
      return null;
    }
  };

  try {
    const scopedKey = getDbStorageKey(scope);
    let raw = localStorage.getItem(scopedKey);
    let parsed = tryParseRaw(raw);
    if (parsed) return parsed;

    // Fallback to secondary localStorage recovery copy if primary key is missing or corrupted
    const backupRaw = localStorage.getItem(getDbBackupStorageKey(scope));
    parsed = tryParseRaw(backupRaw);
    if (parsed) return parsed;

    // Backwards compatibility: only adopt legacy DB once if not yet migrated
    if (!raw && !localStorage.getItem('central-estudos-legacy-adopted')) {
      const legacyRaw = localStorage.getItem(DB_STORAGE_KEY_LEGACY);
      parsed = tryParseRaw(legacyRaw);
      if (legacyRaw && parsed) {
        try {
          localStorage.setItem(scopedKey, legacyRaw);
          localStorage.setItem('central-estudos-legacy-adopted', '1');
        } catch {
          // ignore quota
        }
        return parsed;
      }
    }
    return createInitialDatabase();
  } catch {
    return createInitialDatabase();
  }
}

function stripDrivePrefix(name: string): string {
  return name.replace(/^(LEI|PROVA|GABARITO|RESUMO|DISCURSIVA|CORRECAO)\s*-\s*/i, '').trim();
}

function normalizeFileLookup(name: string): string {
  return name.normalize('NFC').trim().toLowerCase();
}

function isSupportedRestorableStudyFile(df: DriveFileInfo): boolean {
  if (!df.mimeType) return false;
  if (df.mimeType === 'application/vnd.google-apps.folder') return false;
  if (df.mimeType === 'application/vnd.google-apps.shortcut') return false;
  if (df.mimeType === 'application/pdf') return true;
  if (df.mimeType === 'application/vnd.google-apps.document') return true;
  if (df.mimeType.startsWith('text/')) return true;
  if (df.mimeType.startsWith('image/')) return true;
  return /\.(pdf|txt|docx?|md|png|jpe?g|webp)$/i.test(df.name);
}

function extractNestedFolderName(df: DriveFileInfo, canonicalCategory: string): string | undefined {
  if (!df.folderPath) return undefined;
  const parts = df.folderPath.split(' / ').map((p) => p.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => p.toLowerCase() === canonicalCategory.toLowerCase());
  if (idx >= 0 && parts.length > idx + 1) {
    return parts.slice(idx + 1).join(' / ');
  }
  if (!df.isInStudyFolder && parts.length > 0 && parts[parts.length - 1] !== 'Meu Drive (Raiz)') {
    return parts[parts.length - 1];
  }
  return undefined;
}

async function syncMissingReferencedBlobsToDrive(
  targetDb: StudyDatabase,
  driveFiles: DriveFileInfo[],
  token: string,
  scope = 'offline_guest',
): Promise<{ uploadedCount: number; updatedCount: number; uploadedFiles: DriveFileInfo[] }> {
  const report = compareLocalAndDriveFileTimestamps(targetDb, driveFiles, scope);
  const candidatesToPush = [...report.localOnly, ...report.localNewer];
  if (candidatesToPush.length === 0) {
    return { uploadedCount: 0, updatedCount: 0, uploadedFiles: [] };
  }

  const allBlobs = await getAllFileBlobs();
  const blobByKey = new Map(allBlobs.map((item) => [item.key, item.blob]));
  let uploadedCount = 0;
  let updatedCount = 0;
  const uploadedFiles: DriveFileInfo[] = [];

  for (const item of candidatesToPush) {
    const blob = blobByKey.get(item.blobKey);
    if (!blob) continue;

    try {
      const uploaded = await uploadFileToDrive(
        blob,
        item.name,
        token,
        item.subfolder,
        {
          ...(item.driveFile ? { existingFileId: item.driveFile.id } : {}),
          moduleTag: item.moduleLabel,
          sourceAction: item.status === 'local-newer' ? 'sync-update' : 'sync-upload',
        },
      );
      uploadedFiles.push(uploaded);
      uploadedCount += 1;
      if (item.status === 'local-newer') updatedCount += 1;
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) throw err;
      console.warn(`[Login Sync Drive] Falha ao enviar ${item.name} para o Drive:`, err);
    }
  }

  return { uploadedCount, updatedCount, uploadedFiles };
}

function resolveLawFolderKey(
  existingLaws: Record<string, LawFolderData>,
  rawFolderName: string,
): string {
  const normTarget = normalizeSearch(visibleName(rawFolderName));
  if (normTarget) {
    const match = Object.keys(existingLaws).find(
      (k) => normalizeSearch(visibleName(k)) === normTarget,
    );
    if (match) return match;
  }
  return cleanSafeName(rawFolderName, 'Leis_Recuperadas_do_Drive').replace(/\s+/g, '_');
}

async function restoreFilesAndOrphansFromDriveList(
  targetDb: StudyDatabase,
  driveFiles: DriveFileInfo[],
  token: string,
  scope: string,
  onProgress?: (current: number, total: number, label: string) => void,
  options?: {
    importFromAnyFolder?: boolean;
    onlyFolderId?: string;
    onlyFileIds?: string[];
    forceModule?: 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries';
    skipTargetDbBlobs?: boolean;
    lazyBinaryBlobs?: boolean;
    knownSyncedFileIds?: Set<string>;
    dbBaselineMs?: number;
  },
): Promise<{
  updatedDb: StudyDatabase;
  filesRestored: number;
  orphansImported: number;
  healedLawsCount: number;
  permissionBlockedCount: number;
  skippedTombstonesCount: number;
  fileEvents: SyncAffectedFile[];
}> {
  if (!driveFiles.length) {
    return {
      updatedDb: targetDb,
      filesRestored: 0,
      orphansImported: 0,
      healedLawsCount: 0,
      permissionBlockedCount: 0,
      skippedTombstonesCount: 0,
      fileEvents: [],
    };
  }

  // Index Drive files by normalized exact name, stripped name, and Drive file ID (preferring active/selected folder)
  const driveByName = new Map<string, DriveFileInfo>();
  const driveByStripped = new Map<string, DriveFileInfo>();
  const driveById = new Map<string, DriveFileInfo>();

  const defaultPreferredFolderId =
    (options?.onlyFolderId && options.onlyFolderId !== 'all' ? options.onlyFolderId : undefined) ||
    targetDb.preferences?.default_drive_folder?.id ||
    getPreferredStudyFolder().id ||
    undefined;

  const matchesPreferredFolder = (df: DriveFileInfo) =>
    Boolean(
      defaultPreferredFolderId &&
        (df.parents?.includes(defaultPreferredFolderId) ||
          df.ancestorFolderIds?.includes(defaultPreferredFolderId)),
    );

  const orderedDriveFiles = defaultPreferredFolderId
    ? [...driveFiles].sort((a, b) => Number(matchesPreferredFolder(b)) - Number(matchesPreferredFolder(a)))
    : driveFiles;

  orderedDriveFiles.forEach((df) => {
    driveById.set(df.id, df);
    const norm = normalizeFileLookup(df.name);
    if (!driveByName.has(norm)) driveByName.set(norm, df);
    const stripped = normalizeFileLookup(stripDrivePrefix(df.name));
    if (stripped && !driveByStripped.has(stripped)) driveByStripped.set(stripped, df);
  });

  const onlyFileIdSet = options?.onlyFileIds?.length ? new Set(options.onlyFileIds) : null;
  const matchedDriveFileIds = new Set<string>();
  const knownFileNames = new Set<string>();
  let filesRestored = 0;
  let permissionBlockedCount = 0;
  let skippedTombstonesCount = 0;
  const fileEvents: SyncAffectedFile[] = [];
  const seenSkippedIds = new Set<string>();
  const pushFileEvent = (ev: SyncAffectedFile) => {
    if (ev.action === 'skipped-tombstone' && ev.driveFileId) {
      if (seenSkippedIds.has(ev.driveFileId)) return;
      seenSkippedIds.add(ev.driveFileId);
      skippedTombstonesCount += 1;
    }
    fileEvents.push(ev);
  };

  const pendingDeleteTargets = [
    ...getPendingDriveDeletes(scope),
    ...(scope !== 'offline_guest' ? getPendingDriveDeletes('offline_guest') : []),
  ];
  const matchesQueuedDriveDelete = (df: DriveFileInfo): boolean => {
    if (pendingDeleteTargets.length === 0) return false;
    const cleanId = String(df.id || '').trim();
    const dfFull = normalizeSearch(visibleName(df.name || ''));
    const dfStripped = normalizeSearch(visibleName(stripDrivePrefix(df.name || '')));
    const dfSegs = String(df.folderPath || '')
      .split('/')
      .map((s) => normalizeSearch(visibleName(s)))
      .filter(Boolean);
    return pendingDeleteTargets.some((pd) => {
      if (pd.fileIds?.some((id) => String(id || '').replace(/^drive_/, '').trim() === cleanId)) {
        return true;
      }
      if (
        pd.names?.some((n) => {
          const nf = normalizeSearch(visibleName(n));
          const ns = normalizeSearch(visibleName(stripDrivePrefix(n)));
          return (
            Boolean(nf && (nf === dfFull || nf === dfStripped)) ||
            Boolean(ns && (ns === dfFull || ns === dfStripped))
          );
        })
      ) {
        return true;
      }
      if (pd.folderNames?.length && df.isInStudyFolder !== false) {
        const fKeys = new Set(pd.folderNames.map((f) => normalizeSearch(visibleName(f))).filter(Boolean));
        if (dfSegs.some((s) => fKeys.has(s))) return true;
      }
      return false;
    });
  };

  const knownBackupRoots = [
    getPreferredStudyFolder().name,
    ...getKnownStudyDriveFolderNames(),
  ];

  const isBackupFile = (df: DriveFileInfo) => {
    const lowerName = (df.name || '').toLowerCase();
    const pathSegments = (df.folderPath || '')
      .split('/')
      .map((s) => normalizeSearch(visibleName(s)));
    return (
      df.subfolderName === 'Backups' ||
      pathSegments.includes('backups') ||
      pathSegments.includes('backup geral') ||
      lowerName === CLOUD_SYNC_FILENAME ||
      lowerName === 'post-it.txt' ||
      lowerName.startsWith('backup_central_estudos') ||
      lowerName.startsWith('backup_incremental_central_estudos') ||
      lowerName.includes('central_estudos_sync') ||
      lowerName.startsWith('.central_estudos_') ||
      lowerName.endsWith('.json')
    );
  };

  const skipBlobDownload = Boolean(options?.skipTargetDbBlobs || options?.lazyBinaryBlobs);
  const dbAlreadyHydrated = !isUntouchedSeedDatabase(targetDb);
  const knownSyncedIds = options?.knownSyncedFileIds;
  const shouldInspectDriveTxtOnAuth = (df: DriveFileInfo) => {
    if (!options?.lazyBinaryBlobs) return true;
    if (!dbAlreadyHydrated) return true;
    if (knownSyncedIds && knownSyncedIds.size > 0) {
      return !knownSyncedIds.has(df.id);
    }
    return true;
  };

  const estimatedTotal = Math.max(
    1,
    (skipBlobDownload
      ? 0
      : Object.values(targetDb.pdfFolders || {}).reduce((s, list) => s + list.length, 0) +
        Object.values(targetDb.summaryFolders || {}).reduce((s, list) => s + list.length, 0) +
        Object.values(targetDb.laws || {}).reduce((s, f) => s + (f.pdfs?.length || 0), 0) +
        (targetDb.proofFiles?.length || 0) +
        (targetDb.essays?.length || 0)) +
      driveFiles.filter((df) => !isBackupFile(df) && isSupportedRestorableStudyFile(df)).length,
  );
  let processedSteps = 0;
  const emitProgress = (label: string) => {
    processedSteps += 1;
    onProgress?.(Math.min(processedSteps, estimatedTotal), estimatedTotal, label);
  };

  const refreshedBlobTimestamps = new Map<string, string>();
  const tryRestoreBlob = async (
    blobKey: string | undefined,
    candidates: string[],
    mimeHint?: string,
    localTimestampIso?: string,
  ) => {
    candidates.forEach((c) => {
      if (c) {
        knownFileNames.add(normalizeFileLookup(c));
        knownFileNames.add(normalizeFileLookup(stripDrivePrefix(c)));
      }
    });
    if (!blobKey) return;

    let match: DriveFileInfo | undefined;
    if (blobKey.startsWith('drive_')) {
      match = driveById.get(blobKey.replace(/^drive_/, ''));
    }
    if (!match) {
      match = candidates
        .map((c) => driveByName.get(normalizeFileLookup(c)) || driveByStripped.get(normalizeFileLookup(stripDrivePrefix(c))))
        .find((item): item is DriveFileInfo => Boolean(item));
    }
    if (match) matchedDriveFileIds.add(match.id);

    const driveTimestampIso = match ? match.modifiedTime || match.createdTime : undefined;
    const driveIsNewer = Boolean(
      match && localTimestampIso && isDriveTimestampNewerThanLocal(localTimestampIso, driveTimestampIso),
    );
    const existing = await getFileBlob(blobKey, scope);
    const hasExistingBlob = Boolean(existing && existing.size > 0);

    // When lazyBinaryBlobs or skipTargetDbBlobs is enabled (e.g. instant login hydration),
    // skip uncached binaries, unless explicitly picked or Drive has a newer timestamp for an existing cached blob.
    if (skipBlobDownload && !(match?.id && onlyFileIdSet?.has(match.id)) && (!driveIsNewer || !hasExistingBlob)) {
      return;
    }

    if (hasExistingBlob && !driveIsNewer) {
      emitProgress(candidates[0] || 'Arquivo local verificado');
      return;
    }

    if (match) {
      if (!onlyFileIdSet?.has(match.id) && isDriveFilePermissionBlocked(match.id)) {
        permissionBlockedCount += 1;
        return;
      }
      emitProgress(
        driveIsNewer
          ? `Atualizando ${stripDrivePrefix(match.name) || match.name} (versão mais recente no Drive)`
          : `Carregando ${stripDrivePrefix(match.name) || match.name}`,
      );
      try {
        const blob = token ? await downloadDriveFileBlob(match.id, token, mimeHint || match.mimeType) : null;
        if (!blob) return;
        await saveFileBlob(blobKey, blob, scope);
        filesRestored += 1;
        if (driveIsNewer) {
          refreshedBlobTimestamps.set(blobKey, driveTimestampIso || new Date().toISOString());
        }
        const restoredTag = classifyDriveFileSyncOrigin(match);
        pushFileEvent({
          name: stripDrivePrefix(match.name) || match.name,
          action: 'restored',
          module: match.subfolderName || undefined,
          driveFileId: match.id,
          syncOrigin: restoredTag.origin,
          detail: driveIsNewer
            ? restoredTag.origin === 'external-modified'
              ? 'Atualizado do Drive (modificado externamente)'
              : 'Atualizado do Drive (versão mais recente)'
            : undefined,
        });
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) throw err;
        if (msg.includes('PICKER_FILE_PERMISSION')) permissionBlockedCount += 1;
        pushFileEvent({
          name: stripDrivePrefix(match.name) || match.name,
          action: 'failed',
          module: match.subfolderName || undefined,
          driveFileId: match.id,
          syncOrigin: classifyDriveFileSyncOrigin(match).origin,
          detail: msg || 'Falha ao baixar arquivo do Drive',
        });
        console.warn(`Falha ao carregar ${match.name}:`, err);
      }
    }
  };

  // Always index known files from targetDb (and download blobs when missing or newer in Drive)
  // 1. PDFs Pessoais
  for (const files of Object.values(targetDb.pdfFolders || {})) {
    for (const f of files) {
      const annIso = f.blobKey ? targetDb.pdfAnnotations?.[f.blobKey]?.updatedAt : undefined;
      const localIso =
        annIso && (!f.updatedAt || Date.parse(annIso) > Date.parse(f.updatedAt))
          ? annIso
          : f.updatedAt || f.createdAt;
      await tryRestoreBlob(f.blobKey, [f.name, f.blobKey, `${f.blobKey}.pdf`], 'application/pdf', localIso);
    }
  }

  // 2. Resumos e Mapas
  for (const files of Object.values(targetDb.summaryFolders || {})) {
    for (const s of files) {
      await tryRestoreBlob(
        s.blobKey,
        [`RESUMO - ${s.name}`, s.name, s.blobKey, `${s.blobKey}.pdf`],
        s.mimeType,
        s.updatedAt || s.createdAt,
      );
    }
  }

  // 3. Lei Seca PDFs/TXT
  for (const folder of Object.values(targetDb.laws || {})) {
    for (const pdf of folder.pdfs || []) {
      const lowerName = (pdf.name || '').toLowerCase();
      const hint =
        lowerName.endsWith('.txt') || lowerName.endsWith('.md')
          ? 'text/plain'
          : 'application/pdf';
      await tryRestoreBlob(
        pdf.blobKey,
        [`LEI - ${pdf.name}`, pdf.name, pdf.blobKey, `${pdf.blobKey}.pdf`],
        hint,
        pdf.updatedAt || pdf.createdAt,
      );
    }
  }

  // 4. Provas e Gabaritos
  for (const pf of targetDb.proofFiles || []) {
    const lowerProof = (pf.name || '').toLowerCase();
    const proofMimeHint =
      lowerProof.endsWith('.txt') || lowerProof.endsWith('.md')
        ? 'text/plain'
        : 'application/pdf';
    await tryRestoreBlob(
      pf.blobKey,
      [`PROVA - ${pf.name}`, pf.name, pf.blobKey, `${pf.blobKey}.pdf`],
      proofMimeHint,
      pf.updatedAt || pf.createdAt,
    );
    if (pf.gabarito_arquivo) {
      knownFileNames.add(normalizeFileLookup(`GABARITO - ${pf.gabarito_arquivo}`));
      knownFileNames.add(normalizeFileLookup(pf.gabarito_arquivo));
    }
    knownFileNames.add(normalizeFileLookup(`${pf.name}.gabarito.txt`));
  }

  // 5. Discursivas
  for (const e of targetDb.essays || []) {
    await tryRestoreBlob(
      e.original_blobKey,
      [`DISCURSIVA - ${e.original_arquivo}`, e.original_arquivo, e.original_blobKey, `${e.original_blobKey}.pdf`],
      e.original_mime,
      e.updatedAt || e.created_at || e.data,
    );
    if (e.corrigido_blobKey && e.corrigido_arquivo) {
      await tryRestoreBlob(
        e.corrigido_blobKey,
        [`CORRECAO - ${e.corrigido_arquivo}`, e.corrigido_arquivo, e.corrigido_blobKey, `${e.corrigido_blobKey}.pdf`],
        e.corrigido_mime,
        e.updatedAt || e.corrigida_em || e.created_at,
      );
    }
  }

  // 6. Recover orphaned/unlinked study files in Drive folders
  let nextDb: StudyDatabase = targetDb;
  if (refreshedBlobTimestamps.size > 0) {
    nextDb = {
      ...nextDb,
      pdfFolders: Object.fromEntries(
        Object.entries(nextDb.pdfFolders || {}).map(([fk, list]) => [
          fk,
          (list || []).map((f) =>
            refreshedBlobTimestamps.has(f.blobKey)
              ? { ...f, updatedAt: refreshedBlobTimestamps.get(f.blobKey) }
              : f,
          ),
        ]),
      ),
      summaryFolders: Object.fromEntries(
        Object.entries(nextDb.summaryFolders || {}).map(([fk, list]) => [
          fk,
          (list || []).map((s) =>
            refreshedBlobTimestamps.has(s.blobKey)
              ? { ...s, updatedAt: refreshedBlobTimestamps.get(s.blobKey) }
              : s,
          ),
        ]),
      ),
      laws: Object.fromEntries(
        Object.entries(nextDb.laws || {}).map(([fk, folderObj]) => [
          fk,
          {
            ...folderObj,
            pdfs: (folderObj.pdfs || []).map((p) =>
              refreshedBlobTimestamps.has(p.blobKey)
                ? { ...p, updatedAt: refreshedBlobTimestamps.get(p.blobKey) }
                : p,
            ),
          },
        ]),
      ),
      proofFiles: (nextDb.proofFiles || []).map((pf) =>
        refreshedBlobTimestamps.has(pf.blobKey)
          ? { ...pf, updatedAt: refreshedBlobTimestamps.get(pf.blobKey) }
          : pf,
      ),
      essays: (nextDb.essays || []).map((e) => {
        const ts =
          refreshedBlobTimestamps.get(e.original_blobKey) ||
          (e.corrigido_blobKey ? refreshedBlobTimestamps.get(e.corrigido_blobKey) : undefined);
        return ts ? { ...e, updatedAt: ts } : e;
      }),
    };
  }
  let orphansImported = 0;

  const hasStudyPrefix = (name: string) =>
    /^(LEI|PROVA|GABARITO|RESUMO|DISCURSIVA|CORRECAO)\s*-\s*/i.test(name);

  const inSelectedFolder = (df: DriveFileInfo) => {
    if (!options?.onlyFolderId || options.onlyFolderId === 'all') return true;
    if (options.onlyFolderId === 'root') return !df.parents || df.parents.length === 0 || df.folderPath === 'Meu Drive (Raiz)';
    return Boolean(
      df.parents?.includes(options.onlyFolderId) ||
        df.ancestorFolderIds?.includes(options.onlyFolderId),
    );
  };

  const isGabaritoFilename = (name: string) =>
    /^GABARITO\s*-\s*/i.test(name) || /\.gabarito\.txt$/i.test(name);

  const gabaritoStemKey = (name: string) => {
    const cleaned = stripDrivePrefix(name)
      .replace(/\.gabarito\.txt$/i, '')
      .replace(/\.[^.]+$/, '');
    return normalizeFileLookup(cleaned);
  };

  const gabaritoFileByStem = new Map<string, DriveFileInfo>();
  for (const df of orderedDriveFiles) {
    if (!inSelectedFolder(df) || isBackupFile(df)) continue;
    if (!isGabaritoFilename(df.name)) continue;
    const stem = gabaritoStemKey(df.name);
    if (stem && !gabaritoFileByStem.has(stem)) {
      gabaritoFileByStem.set(stem, df);
    }
  }

  const parsedGabaritoCache = new Map<
    string,
    { fileName: string; content: string; answers: Record<number, string> }
  >();
  const readPairedGabarito = async (
    proofFilename: string,
  ): Promise<{ fileName: string; content: string; answers: Record<number, string> } | null> => {
    const stem = gabaritoStemKey(proofFilename);
    if (!stem) return null;
    if (parsedGabaritoCache.has(stem)) return parsedGabaritoCache.get(stem) || null;
    const gdf = gabaritoFileByStem.get(stem);
    if (!gdf) return null;
    try {
      const gBlob = token ? await downloadDriveFileBlob(gdf.id, token, gdf.mimeType) : null;
      if (!gBlob) return null;
      const gText = await readStudyBlobText(gBlob, gdf.name, gdf.mimeType);
      let answers: Record<number, string> = {};
      try {
        answers = parseAnswerKeyWithMode(gText).answers;
      } catch {
        answers = {};
      }
      const result = { fileName: stripDrivePrefix(gdf.name) || gdf.name, content: gText, answers };
      parsedGabaritoCache.set(stem, result);
      matchedDriveFileIds.add(gdf.id);
      return result;
    } catch {
      return null;
    }
  };

  const unlinkedDriveFiles = driveFiles.filter((df) => {
    const forcedMode = options?.forceModule || 'auto';
    const isTxtOrMdEntry = /\.(txt|md)$/i.test(df.name || '');
    const isNonArchiveModuleFile =
      df.subfolderName === 'Questões' ||
      df.subfolderName === 'Cronogramas' ||
      df.subfolderName === 'Datas e Locais' ||
      df.subfolderName === 'Editais' ||
      isScheduleTxtDescriptor(df.name, df.subfolderName || df.folderPath) ||
      isContestOrEditalTxtDescriptor(df.name, df.subfolderName || df.folderPath);

    if (
      isNonArchiveModuleFile &&
      (isTxtOrMdEntry || forcedMode === 'auto' || forcedMode === 'laws' || forcedMode === 'proofs')
    ) {
      return false; // handled by Step 8 / Step 9 dedicated TXT recovery passes
    }

    if (onlyFileIdSet) {
      if (!onlyFileIdSet.has(df.id)) return false;
      if (matchedDriveFileIds.has(df.id)) return false;
      return !isBackupFile(df) && isSupportedRestorableStudyFile(df);
    }
    if (!inSelectedFolder(df)) return false;
    if (matchedDriveFileIds.has(df.id)) return false;
    if (isBackupFile(df)) return false;
    if (!isSupportedRestorableStudyFile(df)) return false;
    if (isGabaritoFilename(df.name)) return false;
    if (options?.lazyBinaryBlobs && dbAlreadyHydrated && knownSyncedIds?.has(df.id)) return false;

    const tagInfo = classifyDriveFileSyncOrigin(df);
    if (isDriveFileTombstoned(df, nextDb, scope) || matchesQueuedDriveDelete(df)) {
      pushFileEvent({
        name: stripDrivePrefix(df.name) || df.name,
        action: 'skipped-tombstone',
        module: df.subfolderName || undefined,
        driveFileId: df.id,
        syncOrigin: tagInfo.origin,
        detail:
          tagInfo.origin === 'internal'
            ? 'Cópia interna bloqueada pelo registro de exclusão'
            : tagInfo.origin === 'external-modified'
              ? 'Arquivo modificado externamente bloqueado por exclusão'
              : 'Arquivo externo bloqueado pelo registro de exclusão',
      });
      return false;
    }

    // Sync-tag state-confusion guard: during automatic login sync against an already-hydrated DB,
    // an older internal app file absent from the DB snapshot was already removed/deleted previously.
    if (
      !options?.onlyFolderId &&
      !options?.importFromAnyFolder &&
      dbAlreadyHydrated &&
      tagInfo.origin === 'internal' &&
      tagInfo.syncedAtMs > 0 &&
      options?.dbBaselineMs &&
      tagInfo.syncedAtMs + 60_000 < options.dbBaselineMs
    ) {
      pushFileEvent({
        name: stripDrivePrefix(df.name) || df.name,
        action: 'skipped-tombstone',
        module: df.subfolderName || undefined,
        driveFileId: df.id,
        syncOrigin: 'internal',
        detail: 'Cópia interna anterior ao banco atual bloqueada pela etiqueta de sincronização',
      });
      return false;
    }

    if (isDriveFilePermissionBlocked(df.id)) {
      permissionBlockedCount += 1;
      pushFileEvent({
        name: stripDrivePrefix(df.name) || df.name,
        action: 'failed',
        module: df.subfolderName || undefined,
        driveFileId: df.id,
        syncOrigin: tagInfo.origin,
        detail: 'Sem permissão do Seletor do Drive',
      });
      return false;
    }

    const normName = normalizeFileLookup(df.name);
    const normStripped = normalizeFileLookup(stripDrivePrefix(df.name));
    if (knownFileNames.has(normName) || knownFileNames.has(normStripped)) return false;

    if (options?.onlyFolderId || options?.importFromAnyFolder) return true;
    if (defaultPreferredFolderId) {
      return matchesPreferredFolder(df) || Boolean(df.isInStudyFolder);
    }
    return Boolean(df.isInStudyFolder || hasStudyPrefix(df.name));
  });

  const existingSimFileKeys = new Set(
    (nextDb.submittedSimulations || []).flatMap((s) => [
      normalizeFileLookup(s.arquivo || ''),
      normalizeFileLookup(stripDrivePrefix(s.arquivo || '')),
    ]),
  );

  if (unlinkedDriveFiles.length > 0) {
    const nextPdfFolders = { ...(nextDb.pdfFolders || {}) };
    const nextSummaryFolders = { ...(nextDb.summaryFolders || {}) };
    const nextLaws = { ...(nextDb.laws || {}) };
    const nextProofFiles = [...(nextDb.proofFiles || [])];
    const nextEssays = [...(nextDb.essays || [])];
    const nextSubmittedSims = [...(nextDb.submittedSimulations || [])];
    const nowIso = new Date().toISOString().slice(0, 10);
    const forced = options?.forceModule || 'auto';

    for (const df of unlinkedDriveFiles) {
      if (isGabaritoFilename(df.name)) continue;

      try {
        let cleanName = stripDrivePrefix(df.name) || df.name;
        if (df.mimeType === 'application/vnd.google-apps.document' && !cleanName.toLowerCase().endsWith('.pdf')) {
          cleanName = `${cleanName}.pdf`;
        }
        const isTxtOrMd = /\.(txt|md)$/i.test(cleanName);
        const isLaw =
          forced === 'laws' ||
          (forced === 'auto' && (df.subfolderName === 'Lei Seca' || /^LEI\s*-\s*/i.test(df.name)));
        const isProof =
          forced === 'proofs' ||
          (forced === 'auto' && (df.subfolderName === 'Provas e Gabaritos' || /^PROVA\s*-\s*/i.test(df.name)));
        const isSummary =
          forced === 'summaries' ||
          (forced === 'auto' && (df.subfolderName === 'Resumos e Mapas' || /^RESUMO\s*-\s*/i.test(df.name)));
        const isEssay =
          forced === 'auto' && (df.subfolderName === 'Discursivas' || /^DISCURSIVA\s*-\s*/i.test(df.name));

        // When lazyBinaryBlobs is active, binary PDFs/images are cataloged by metadata without downloading the file blob upfront.
        // Text/markdown files and small Law PDFs (<= 3.5 MB) are downloaded immediately for parsing; larger Law PDFs are still cataloged for on-demand opening.
        const rawSizeBytes = Number(df.size || 0);
        const needsBlobForParsing =
          isTxtOrMd || (isLaw && (!options?.lazyBinaryBlobs || (rawSizeBytes > 0 && rawSizeBytes <= 3_500_000)));
        let blob: Blob | null = null;
        if (!options?.lazyBinaryBlobs || needsBlobForParsing) {
          emitProgress(`Importando ${cleanName}`);
          try {
            blob = token ? await downloadDriveFileBlob(df.id, token, df.mimeType) : null;
          } catch (dlErr: any) {
            if (String(dlErr?.message || '').includes('TOKEN_EXPIRED')) throw dlErr;
            // In lazy mode, if a binary Law PDF fails/times out during parsing download, still catalog it by metadata so it is never lost
            if (!options?.lazyBinaryBlobs || isTxtOrMd) {
              throw dlErr;
            }
            console.warn(`Download de texto da lei "${cleanName}" falhou; catalogando para abertura sob demanda:`, dlErr);
            blob = null;
          }
          if (!blob && (!options?.lazyBinaryBlobs || isTxtOrMd)) continue;
        }
        const blobKey = `drive_${df.id}`;
        if (blob) {
          await saveFileBlob(blobKey, blob, scope);
        }
        const sizeNum = Number(df.size || blob?.size || 0);

        const registerTxtProofAndSim = async (
          fileText: string,
          bankName: string,
          sourceLabel: string,
        ) => {
          if (
            isScheduleTxtDescriptor(cleanName, df.folderPath, fileText) ||
            isContestOrEditalTxtDescriptor(cleanName, df.folderPath, fileText)
          ) {
            return;
          }
          const paired = await readPairedGabarito(cleanName);
          const parsedQuestions = parseUploadedQuestions(
            fileText,
            displayBaseName(cleanName) || bankName || 'Geral',
            paired?.answers,
          );

          let gabaritoArquivo = paired?.fileName;
          let gabaritoConteudo = paired?.content;
          let gabaritoQuestoes = paired ? Object.keys(paired.answers).length : 0;

          if (!gabaritoQuestoes && parsedQuestions.length > 0) {
            const lines = parsedQuestions.map((q, idx) => `${q.numero ?? idx + 1}-${q.gabarito}`);
            gabaritoQuestoes = lines.length;
            gabaritoArquivo = `${cleanName}.gabarito.txt`;
            gabaritoConteudo = `GABARITO EXTRAÍDO DA PROVA\n${lines.join('\n')}\n`;
          }

          const alreadyInProofs = nextProofFiles.some(
            (p) =>
              normalizeFileLookup(p.name) === normalizeFileLookup(cleanName) &&
              normalizeFileLookup(p.bank) === normalizeFileLookup(bankName),
          );
          if (!alreadyInProofs) {
            nextProofFiles.unshift({
              id: uid(10),
              name: cleanName,
              size: sizeNum,
              bank: bankName,
              kind: gabaritoQuestoes > 0 ? 'provas-com-gabarito' : 'provas',
              blobKey,
              ...(gabaritoArquivo ? { gabarito_arquivo: gabaritoArquivo } : {}),
              ...(gabaritoConteudo ? { gabarito_conteudo: gabaritoConteudo } : {}),
              gabarito_questoes: gabaritoQuestoes,
              observacoes: sourceLabel,
              correcoes: [],
              createdAt: nowIso,
            });
          }

          if (
            parsedQuestions.length > 0 &&
            !existingSimFileKeys.has(normalizeFileLookup(cleanName)) &&
            !existingSimFileKeys.has(normalizeFileLookup(df.name))
          ) {
            existingSimFileKeys.add(normalizeFileLookup(cleanName));
            existingSimFileKeys.add(normalizeFileLookup(df.name));
            const simSubject = visibleName(bankName === 'Recuperadas do Drive' ? displayBaseName(cleanName) : bankName) || displayBaseName(cleanName) || 'Geral';
            nextSubmittedSims.unshift({
              id: uid(32),
              titulo: displayBaseName(cleanName),
              materia: simSubject,
              arquivo: cleanName,
              data: localDateTimeBrazilian(),
              criado_em: new Date().toISOString().slice(0, 19),
              questoes: parsedQuestions.map((q, idx) => ({
                ...q,
                numero: q.numero || idx + 1,
                materia: simSubject,
              })),
            });
          }
        };

        const dfOrigin = classifyDriveFileSyncOrigin(df).origin;
        const originDetail =
          dfOrigin === 'internal'
            ? 'Etiqueta interna do app'
            : dfOrigin === 'external-modified'
              ? 'Modificado externamente no Drive'
              : 'Enviado externamente (sem etiqueta)';

        if (isLaw) {
          let parsedItems: LawItem[] = [];
          if (blob) {
            try {
              const extractedText = await readStudyBlobText(blob, cleanName, df.mimeType);
              if (
                isScheduleTxtDescriptor(cleanName, df.folderPath, extractedText) ||
                isContestOrEditalTxtDescriptor(cleanName, df.folderPath, extractedText)
              ) {
                continue;
              }
              parsedItems = parseLawTextToItems(cleanName, extractedText);
            } catch (parseErr) {
              console.warn(`Não foi possível extrair dispositivos automaticamente de "${cleanName}":`, parseErr);
            }
          }

          const rawFolderName =
            extractNestedFolderName(df, 'Lei Seca') ||
            displayBaseName(cleanName) ||
            'Leis_Recuperadas_do_Drive';
          const folderKey = resolveLawFolderKey(nextLaws, rawFolderName);
          const existingFolder = nextLaws[folderKey] || { name: folderKey, items: [], pdfs: [] };

          const hasPdfAlready = existingFolder.pdfs.some(
            (p) => p.blobKey === blobKey || normalizeFileLookup(p.name) === normalizeFileLookup(cleanName),
          );
          const hasItemsFromFileAlready = existingFolder.items.some(
            (it) => normalizeFileLookup(it.arquivo) === normalizeFileLookup(cleanName),
          );
          const updatedPdfs = hasPdfAlready
            ? existingFolder.pdfs
            : [
                ...existingFolder.pdfs,
                { id: uid(10), name: cleanName, size: sizeNum, blobKey, createdAt: nowIso },
              ];

          const shouldAppendParsedItems =
            parsedItems.length > 0 &&
            (existingFolder.items.length === 0 || (!hasPdfAlready && !hasItemsFromFileAlready));

          nextLaws[folderKey] = {
            ...existingFolder,
            name: folderKey,
            items: shouldAppendParsedItems
              ? sortLawItemsInOrder([...existingFolder.items, ...parsedItems])
              : sortLawItemsInOrder(existingFolder.items),
            pdfs: updatedPdfs,
          };
          orphansImported += 1;
          pushFileEvent({
            name: cleanName,
            action: 'imported-orphan',
            module: 'Lei Seca',
            driveFileId: df.id,
            syncOrigin: dfOrigin,
            detail: originDetail,
          });
        } else if (isProof) {
          const bankName =
            extractNestedFolderName(df, 'Provas e Gabaritos') ||
            'Recuperadas do Drive';
          const sourceLabel = `Arquivo restaurado do Google Drive (${df.folderPath || 'Drive'}).`;

          if (isTxtOrMd && blob) {
            const txt = await readStudyBlobText(blob, cleanName, df.mimeType);
            if (
              isScheduleTxtDescriptor(cleanName, df.folderPath, txt) ||
              isContestOrEditalTxtDescriptor(cleanName, df.folderPath, txt)
            ) {
              continue;
            }
            await registerTxtProofAndSim(txt, bankName, sourceLabel);
          } else {
            const paired = options?.lazyBinaryBlobs ? null : await readPairedGabarito(cleanName);
            const gabaritoQuestoes = paired ? Object.keys(paired.answers).length : 0;
            nextProofFiles.unshift({
              id: uid(10),
              name: cleanName,
              size: sizeNum,
              bank: bankName,
              kind: gabaritoQuestoes > 0 ? 'provas-com-gabarito' : 'provas',
              blobKey,
              ...(paired?.fileName ? { gabarito_arquivo: paired.fileName } : {}),
              ...(paired?.content ? { gabarito_conteudo: paired.content } : {}),
              gabarito_questoes: gabaritoQuestoes,
              observacoes: sourceLabel,
              correcoes: [],
              createdAt: nowIso,
            });
          }
          orphansImported += 1;
          pushFileEvent({
            name: cleanName,
            action: 'imported-orphan',
            module: 'Provas e Gabaritos',
            driveFileId: df.id,
            syncOrigin: dfOrigin,
            detail: originDetail,
          });
        } else if (isSummary) {
          const folderName =
            extractNestedFolderName(df, 'Resumos e Mapas') || 'Recuperados do Drive';
          const list = nextSummaryFolders[folderName] || [];
          nextSummaryFolders[folderName] = [
            ...list,
            {
              id: uid(10),
              name: cleanName,
              size: sizeNum,
              mimeType: blob?.type || df.mimeType || 'application/pdf',
              blobKey,
              createdAt: nowIso,
            },
          ];
          orphansImported += 1;
          pushFileEvent({
            name: cleanName,
            action: 'imported-orphan',
            module: 'Resumos e Mapas',
            driveFileId: df.id,
            syncOrigin: dfOrigin,
            detail: originDetail,
          });
        } else if (isEssay) {
          nextEssays.unshift({
            id: uid(10),
            titulo: displayBaseName(cleanName),
            data: localDateBrazilian(),
            created_at: new Date().toISOString().slice(0, 19),
            original_arquivo: cleanName,
            original_blobKey: blobKey,
            original_mime: blob?.type || df.mimeType || 'application/pdf',
            corrigido_arquivo: '',
            feedback: 'Recuperada automaticamente do Google Drive.',
          });
          orphansImported += 1;
          pushFileEvent({
            name: cleanName,
            action: 'imported-orphan',
            module: 'Discursivas',
            driveFileId: df.id,
            syncOrigin: dfOrigin,
            detail: originDetail,
          });
        } else if (isTxtOrMd && forced === 'auto' && blob) {
          // Inspect text files outside canonical folders before misfiling into Personal PDFs
          const txt = await readStudyBlobText(blob, cleanName, df.mimeType);
          if (
            isScheduleTxtDescriptor(cleanName, df.folderPath, txt) ||
            isContestOrEditalTxtDescriptor(cleanName, df.folderPath, txt)
          ) {
            continue;
          }
          const paired = await readPairedGabarito(cleanName);
          const detectedQuestions = parseUploadedQuestions(
            txt,
            displayBaseName(cleanName) || 'Geral',
            paired?.answers,
          );
          if (detectedQuestions.length > 0) {
            await registerTxtProofAndSim(
              txt,
              'Recuperadas do Drive',
              `Prova .txt restaurada do Drive (${df.folderPath || 'Drive'}).`,
            );
            orphansImported += 1;
            pushFileEvent({
              name: cleanName,
              action: 'imported-orphan',
              module: 'Provas e Gabaritos',
              driveFileId: df.id,
              syncOrigin: dfOrigin,
              detail: originDetail,
            });
          } else if (splitLawDevices(txt).length >= 2) {
            const detectedLaw = parseLawTextToItems(cleanName, txt);
            if (detectedLaw.length >= 2) {
              const folderKey = resolveLawFolderKey(
                nextLaws,
                displayBaseName(cleanName) || 'Leis_Recuperadas',
              );
              const existingFolder = nextLaws[folderKey] || { name: folderKey, items: [], pdfs: [] };
              nextLaws[folderKey] = {
                ...existingFolder,
                name: folderKey,
                items: existingFolder.items.length
                  ? sortLawItemsInOrder(existingFolder.items)
                  : detectedLaw,
                pdfs: [
                  ...existingFolder.pdfs,
                  { id: uid(10), name: cleanName, size: sizeNum, blobKey, createdAt: nowIso },
                ],
              };
              orphansImported += 1;
              pushFileEvent({
                name: cleanName,
                action: 'imported-orphan',
                module: 'Lei Seca',
                driveFileId: df.id,
                syncOrigin: dfOrigin,
                detail: originDetail,
              });
            }
          }
        } else {
          const nestedPdfFolder = extractNestedFolderName(df, 'PDFs Pessoais');
          const rawCandidate =
            nestedPdfFolder && !isReservedBackupFolderName(nestedPdfFolder, knownBackupRoots)
              ? nestedPdfFolder
              : df.subfolderName &&
                  !isReservedBackupFolderName(df.subfolderName, knownBackupRoots) &&
                  normalizeSearch(visibleName(df.subfolderName)) !== 'pdfs pessoais'
                ? df.subfolderName
                : '';
          const folderName =
            rawCandidate &&
            !isReservedBackupFolderName(rawCandidate, knownBackupRoots) &&
            normalizeSearch(visibleName(rawCandidate)) !== 'pdfs pessoais'
              ? rawCandidate
              : 'Recuperados_do_Drive';
          const list = nextPdfFolders[folderName] || [];
          nextPdfFolders[folderName] = [
            ...list,
            { id: uid(10), name: cleanName, size: sizeNum, blobKey, createdAt: nowIso },
          ];
          orphansImported += 1;
          pushFileEvent({
            name: cleanName,
            action: 'imported-orphan',
            module: 'PDFs Pessoais',
            driveFileId: df.id,
            syncOrigin: dfOrigin,
            detail: originDetail,
          });
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) throw err;
        if (msg.includes('PICKER_FILE_PERMISSION')) permissionBlockedCount += 1;
        pushFileEvent({
          name: stripDrivePrefix(df.name) || df.name,
          action: 'failed',
          module: df.subfolderName || undefined,
          driveFileId: df.id,
          syncOrigin: classifyDriveFileSyncOrigin(df).origin,
          detail: msg || 'Erro ao importar arquivo do Drive',
        });
        console.warn(`Falha ao recuperar arquivo "${df.name}" do Drive:`, err);
      }
    }

    if (orphansImported > 0) {
      nextDb = {
        ...nextDb,
        pdfFolders: nextPdfFolders,
        summaryFolders: nextSummaryFolders,
        laws: nextLaws,
        proofFiles: nextProofFiles,
        essays: nextEssays,
        submittedSimulations: nextSubmittedSims,
      };
    }
  }

  // 6b. Pair companion gabarito files & extract .txt gabaritos for existing ProofFileRecords missing a gabarito
  if (!options?.lazyBinaryBlobs && (nextDb.proofFiles || []).length > 0) {
    let proofsPatched = false;
    const patchedProofs = [...nextDb.proofFiles];
    for (let i = 0; i < patchedProofs.length; i++) {
      const pf = patchedProofs[i];
      if ((pf.gabarito_questoes || 0) > 0 && pf.gabarito_conteudo) continue;
      const paired = await readPairedGabarito(pf.name);
      if (paired && Object.keys(paired.answers).length > 0) {
        patchedProofs[i] = {
          ...pf,
          kind: 'provas-com-gabarito',
          gabarito_arquivo: paired.fileName,
          gabarito_conteudo: paired.content,
          gabarito_questoes: Object.keys(paired.answers).length,
        };
        proofsPatched = true;
      }
    }
    if (proofsPatched) {
      nextDb = { ...nextDb, proofFiles: patchedProofs };
    }
  }

  // 7. Auto-heal any law folders with (0) items that already have attached PDF/TXT blobs locally
  let healedLawsCount = 0;
  const lawsAfterRecovery = { ...(nextDb.laws || {}) };
  let lawsPatched = false;
  for (const [folderKey, folderData] of Object.entries(lawsAfterRecovery)) {
    if ((folderData.items?.length || 0) > 0 || !(folderData.pdfs?.length)) continue;
    const recoveredItems: LawItem[] = [];
    for (const pdf of folderData.pdfs) {
      if (!pdf.blobKey) continue;
      const blob = await getFileBlob(pdf.blobKey, scope);
      if (!blob) continue;
      try {
        const text = await readStudyBlobText(blob, pdf.name);
        const items = parseLawTextToItems(pdf.name, text);
        if (items.length > 0) {
          recoveredItems.push(...items);
        }
      } catch {
        // ignore unparseable/image PDFs during silent auto-heal
      }
    }
    if (recoveredItems.length > 0) {
      lawsAfterRecovery[folderKey] = {
        ...folderData,
        items: sortLawItemsInOrder(recoveredItems),
      };
      lawsPatched = true;
      healedLawsCount += 1;
    }
  }
  if (lawsPatched) {
    nextDb = { ...nextDb, laws: lawsAfterRecovery };
  }

  // 8. Recover weekly schedule TXT files from 'Cronogramas' and contests/editais TXT files from 'Datas e Locais' & 'Editais'
  const scheduleTxtDriveFiles = driveFiles.filter((df) => {
    if (!inSelectedFolder(df) || isBackupFile(df) || !shouldInspectDriveTxtOnAuth(df)) return false;
    const lower = df.name.toLowerCase();
    if (!lower.endsWith('.txt')) return false;
    const matchesSchedule = df.subfolderName === 'Cronogramas' || /^CRONOGRAMA\s*-\s*/i.test(df.name);
    if (!matchesSchedule) return false;
    if (
      !onlyFileIdSet?.has(df.id) &&
      (isDriveFileTombstoned(df, nextDb, scope) || matchesQueuedDriveDelete(df))
    ) {
      pushFileEvent({
        name: stripDrivePrefix(df.name) || df.name,
        action: 'skipped-tombstone',
        module: 'Cronogramas',
        driveFileId: df.id,
        syncOrigin: classifyDriveFileSyncOrigin(df).origin,
        detail: 'Cronograma ignorado pelo registro de exclusão',
      });
      return false;
    }
    if (!onlyFileIdSet?.has(df.id) && isDriveFilePermissionBlocked(df.id)) {
      permissionBlockedCount += 1;
      return false;
    }
    return true;
  });

  if (scheduleTxtDriveFiles.length > 0) {
    const nextWeeklySchedules: Record<string, WeeklyScheduleFileRecord> = {
      ...(nextDb.weeklySchedules || {}),
    };
    let latestRecoveredWeek: WeeklyScheduleFileRecord | null = null;
    let latestRecoveredMs = 0;

    for (const df of scheduleTxtDriveFiles) {
      try {
        const blob = token ? await downloadDriveFileBlob(df.id, token, df.mimeType) : null;
        if (!blob) continue;
        const text = await readStudyBlobText(blob, df.name);
        const parsedWeek = parseScheduleWeekText(text, df.name);
        if (
          !onlyFileIdSet?.has(df.id) &&
          isContestOrScheduleTombstoned(
            'weeklySchedule',
            { id: parsedWeek.weekKey, fileName: df.name },
            nextDb,
            scope,
          )
        ) {
          pushFileEvent({
            name: stripDrivePrefix(df.name) || df.name,
            action: 'skipped-tombstone',
            module: 'Cronogramas',
            driveFileId: df.id,
            detail: 'Semana excluída ignorada',
          });
          continue;
        }
        const blobKey = `schedule_week_${parsedWeek.weekKey}`;
        await saveFileBlob(blobKey, blob, scope);
        const fileMs = Date.parse(df.modifiedTime || df.createdTime || '') || Date.now();
        const existingWeek = nextWeeklySchedules[parsedWeek.weekKey];
        const existingTopicsCount = existingWeek
          ? WEEKDAYS.reduce((s, d) => s + (existingWeek.schedule?.[d]?.length || 0), 0)
          : 0;
        const parsedTopicsCount = WEEKDAYS.reduce(
          (s, d) => s + (parsedWeek.schedule?.[d]?.length || 0),
          0,
        );
        if (!existingWeek || (existingTopicsCount === 0 && parsedTopicsCount > 0)) {
          nextWeeklySchedules[parsedWeek.weekKey] = {
            ...parsedWeek,
            blobKey,
          };
        }
        if (parsedTopicsCount > 0 && fileMs >= latestRecoveredMs) {
          latestRecoveredMs = fileMs;
          latestRecoveredWeek = nextWeeklySchedules[parsedWeek.weekKey];
        }
      } catch (err: any) {
        if (String(err?.message || '').includes('PICKER_FILE_PERMISSION')) permissionBlockedCount += 1;
      }
    }

    const currentScheduleTotalTopics = WEEKDAYS.reduce(
      (sum, d) => sum + (nextDb.schedule?.[d]?.length || 0),
      0,
    );
    const currentScheduleHasCustom = WEEKDAYS.some((d) =>
      (nextDb.schedule?.[d] || []).some((t) => !/^sch-[1-8]$/.test(t.id || '')),
    );
    const dbIsUntouchedSeed = isUntouchedSeedDatabase(nextDb);
    const activeWeekKey = resolveActiveScheduleWeekKey(nextDb.scheduleDayDates, nextDb.schedule);
    const activeWeekRec = nextWeeklySchedules[activeWeekKey];
    const activeWeekRecCount = activeWeekRec
      ? WEEKDAYS.reduce((s, d) => s + (activeWeekRec.schedule?.[d]?.length || 0), 0)
      : 0;
    const matchingActiveWeek = activeWeekRecCount > 0 ? activeWeekRec : latestRecoveredWeek;
    const matchingTopicsCount = matchingActiveWeek
      ? WEEKDAYS.reduce((s, d) => s + (matchingActiveWeek.schedule?.[d]?.length || 0), 0)
      : 0;

    // Hydrate active schedule from .txt file when DB is untouched seed OR when the active schedule
    // was completely emptied (0 topics) while Drive Cronogramas still holds a populated schedule.
    if (
      matchingActiveWeek &&
      matchingTopicsCount > 0 &&
      ((dbIsUntouchedSeed && !currentScheduleHasCustom) || currentScheduleTotalTopics === 0)
    ) {
      nextDb = reconcileCompletedAndArchivedItems(
        {
          ...nextDb,
          weeklySchedules: nextWeeklySchedules,
          schedule: matchingActiveWeek.schedule,
          scheduleDayDates: matchingActiveWeek.scheduleDayDates,
        },
        nextDb,
        nextDb,
      );
    } else {
      nextDb = {
        ...nextDb,
        weeklySchedules: nextWeeklySchedules,
      };
    }
    nextDb = applyTombstonesToMergedDatabase(nextDb, scope);
  }

  const contestAndEditalTxtFiles = driveFiles.filter((df) => {
    if (!inSelectedFolder(df) || isBackupFile(df) || !shouldInspectDriveTxtOnAuth(df)) return false;
    const lower = df.name.toLowerCase();
    if (!lower.endsWith('.txt')) return false;
    const matchesContest =
      df.subfolderName === 'Datas e Locais' ||
      df.subfolderName === 'Editais' ||
      /^(?:DATAS\s*E\s*LOCAIS|EDITAL)\s*-\s*/i.test(df.name);
    if (!matchesContest) return false;
    if (
      !onlyFileIdSet?.has(df.id) &&
      (isDriveFileTombstoned(df, nextDb, scope) || matchesQueuedDriveDelete(df))
    ) {
      pushFileEvent({
        name: stripDrivePrefix(df.name) || df.name,
        action: 'skipped-tombstone',
        module: df.subfolderName || 'Editais',
        driveFileId: df.id,
        syncOrigin: classifyDriveFileSyncOrigin(df).origin,
        detail: 'Edital/concurso ignorado pelo registro de exclusão',
      });
      return false;
    }
    if (!onlyFileIdSet?.has(df.id) && isDriveFilePermissionBlocked(df.id)) {
      permissionBlockedCount += 1;
      return false;
    }
    return true;
  });

  if (contestAndEditalTxtFiles.length > 0) {
    const mergedContests = [...(nextDb.contests || [])];
    let contestsChanged = false;

    for (const df of contestAndEditalTxtFiles) {
      try {
        const blob = token ? await downloadDriveFileBlob(df.id, token, df.mimeType) : null;
        if (!blob) continue;
        const text = await readStudyBlobText(blob, df.name);
        const parsedContests = parseContestOrEditalTxt(text, df.name);
        for (const pc of parsedContests) {
          if (
            !onlyFileIdSet?.has(df.id) &&
            isContestOrScheduleTombstoned(
              'contest',
              { id: pc.id, name: pc.concurso, fileName: df.name },
              nextDb,
              scope,
            )
          ) {
            pushFileEvent({
              name: pc.concurso || stripDrivePrefix(df.name) || df.name,
              action: 'skipped-tombstone',
              module: 'Editais',
              driveFileId: df.id,
              detail: 'Concurso excluído ignorado',
            });
            continue;
          }
          const matchIdx = mergedContests.findIndex(
            (existing) =>
              (pc.id && existing.id === pc.id) ||
              normalizeSearch(existing.concurso) === normalizeSearch(pc.concurso),
          );
          if (matchIdx === -1) {
            mergedContests.push(pc);
            contestsChanged = true;
            pushFileEvent({
              name: stripDrivePrefix(df.name) || pc.concurso,
              action: 'imported-orphan',
              module: 'Editais',
              driveFileId: df.id,
            });
          } else {
            const cur = mergedContests[matchIdx];
            const curPoints = cur.edital_pontos || [];
            const incomingPoints = pc.edital_pontos || [];
            let nextPoints = curPoints;
            if (incomingPoints.length > 0) {
              const byKey = new Map<string, ContestEditalPoint>();
              curPoints.forEach((p) => {
                byKey.set(`${normalizeSearch(p.materia)}::${normalizeSearch(p.titulo)}`, p);
              });
              let pointsPatched = false;
              const combined = [...curPoints];
              for (const incPt of incomingPoints) {
                const k = `${normalizeSearch(incPt.materia)}::${normalizeSearch(incPt.titulo)}`;
                const found = byKey.get(k);
                if (!found) {
                  combined.push(incPt);
                  byKey.set(k, incPt);
                  pointsPatched = true;
                } else if (incPt.estudado && !found.estudado) {
                  found.estudado = true;
                  found.estudado_em = incPt.estudado_em || localDateBrazilian();
                  pointsPatched = true;
                }
              }
              if (pointsPatched) {
                nextPoints = combined;
                contestsChanged = true;
              }
            }
            const nextContest: ContestItem = {
              ...cur,
              data_abertura: cur.data_abertura || pc.data_abertura,
              data_pagamento: cur.data_pagamento || pc.data_pagamento,
              local_prova: cur.local_prova || pc.local_prova,
              observacoes: cur.observacoes || pc.observacoes,
              edital_arquivo: cur.edital_arquivo || pc.edital_arquivo,
              edital_pontos: nextPoints,
            };
            if (JSON.stringify(nextContest) !== JSON.stringify(cur)) {
              mergedContests[matchIdx] = nextContest;
              contestsChanged = true;
            }
          }
        }
      } catch (err: any) {
        if (String(err?.message || '').includes('PICKER_FILE_PERMISSION')) permissionBlockedCount += 1;
      }
    }

    if (contestsChanged) {
      nextDb = {
        ...nextDb,
        contests: mergedContests,
      };
    }
  }

  // 9. Recover question & .txt exam files from 'Questões' / 'Simulados' / 'Provas e Gabaritos'
  const questionOrExamTxtFiles = driveFiles.filter((df) => {
    if (!inSelectedFolder(df) || isBackupFile(df) || !shouldInspectDriveTxtOnAuth(df)) return false;
    if (isGabaritoFilename(df.name)) return false;
    if (
      df.subfolderName === 'Cronogramas' ||
      df.subfolderName === 'Datas e Locais' ||
      df.subfolderName === 'Editais' ||
      isScheduleTxtDescriptor(df.name, df.subfolderName || df.folderPath) ||
      isContestOrEditalTxtDescriptor(df.name, df.subfolderName || df.folderPath)
    ) {
      return false;
    }
    const lower = df.name.toLowerCase();
    if (!lower.endsWith('.txt') && !lower.endsWith('.md')) return false;
    const matchesQ =
      df.subfolderName === 'Questões' ||
      df.subfolderName === 'Provas e Gabaritos' ||
      /^PROVA\s*-\s*/i.test(df.name) ||
      lower.includes('_estruturada.');
    if (!matchesQ) return false;
    if (!onlyFileIdSet?.has(df.id) && isDriveFileTombstoned(df, nextDb, scope)) {
      pushFileEvent({
        name: stripDrivePrefix(df.name) || df.name,
        action: 'skipped-tombstone',
        module: df.subfolderName || 'Questões',
        driveFileId: df.id,
        detail: 'Arquivo de questões/prova ignorado pelo registro de exclusão',
      });
      return false;
    }
    if (!onlyFileIdSet?.has(df.id) && isDriveFilePermissionBlocked(df.id)) {
      permissionBlockedCount += 1;
      return false;
    }
    return true;
  });

  if (questionOrExamTxtFiles.length > 0) {
    const existingEnunciados = new Set(
      (nextDb.questions || []).map((q) => normalizeSearch(q.enunciado)),
    );
    const addedQuestions = [...(nextDb.questions || [])];
    const addedSubmittedSims = [...(nextDb.submittedSimulations || [])];
    const seenSimFiles = new Set(
      addedSubmittedSims.flatMap((s) => [
        normalizeFileLookup(s.arquivo || ''),
        normalizeFileLookup(stripDrivePrefix(s.arquivo || '')),
      ]),
    );
    let questionsAdded = false;
    let simsAdded = false;

    for (const df of questionOrExamTxtFiles) {
      try {
        const cleanName = stripDrivePrefix(df.name) || df.name;
        const isProofFolderFile =
          df.subfolderName === 'Provas e Gabaritos' ||
          /^PROVA\s*-\s*/i.test(df.name) ||
          cleanName.toLowerCase().includes('_estruturada.');
        const isFromSimFolder = normalizeSearch(df.folderPath || '').includes('simulados');

        const blob = token ? await downloadDriveFileBlob(df.id, token, df.mimeType) : null;
        if (!blob) continue;
        const text = await readStudyBlobText(blob, df.name);
        if (
          isScheduleTxtDescriptor(cleanName, df.folderPath, text) ||
          isContestOrEditalTxtDescriptor(cleanName, df.folderPath, text)
        ) {
          continue;
        }
        const paired = await readPairedGabarito(cleanName);
        const nestedSubject =
          extractNestedFolderName(df, 'Questões') ||
          extractNestedFolderName(df, 'Provas e Gabaritos');
        const subject = nestedSubject || displayBaseName(cleanName) || 'Geral';
        const parsed = parseUploadedQuestions(text, subject, paired?.answers);
        if (!parsed.length) continue;

        const looksLikeExamSim =
          isProofFolderFile ||
          isFromSimFolder ||
          /\b(?:prova|simulado)\b/i.test(normalizeSearch(cleanName)) ||
          /^[ \t]*PROVA:/m.test(text);

        if (
          looksLikeExamSim &&
          !seenSimFiles.has(normalizeFileLookup(cleanName)) &&
          !seenSimFiles.has(normalizeFileLookup(df.name))
        ) {
          seenSimFiles.add(normalizeFileLookup(cleanName));
          seenSimFiles.add(normalizeFileLookup(df.name));
          addedSubmittedSims.unshift({
            id: uid(32),
            titulo: displayBaseName(cleanName),
            materia: visibleName(subject),
            arquivo: cleanName,
            data: localDateTimeBrazilian(),
            criado_em: new Date().toISOString().slice(0, 19),
            questoes: parsed.map((q, idx) => ({
              ...q,
              numero: q.numero || idx + 1,
              materia: visibleName(subject),
            })),
          });
          simsAdded = true;
        }

        // Question bank files ('Questões' non-exam files) populate Treino Diário directly
        if (df.subfolderName === 'Questões' && !isProofFolderFile) {
          for (const q of parsed) {
            const normE = normalizeSearch(q.enunciado);
            if (normE && !existingEnunciados.has(normE)) {
              existingEnunciados.add(normE);
              addedQuestions.push(q);
              questionsAdded = true;
            }
          }
        }
        if (questionsAdded || simsAdded) {
          pushFileEvent({
            name: cleanName,
            action: 'imported-orphan',
            module: isProofFolderFile ? 'Provas e Gabaritos' : 'Questões',
            driveFileId: df.id,
          });
        }
      } catch (err: any) {
        if (String(err?.message || '').includes('PICKER_FILE_PERMISSION')) permissionBlockedCount += 1;
      }
    }

    if (questionsAdded || simsAdded) {
      nextDb = {
        ...nextDb,
        ...(questionsAdded ? { questions: addedQuestions } : {}),
        ...(simsAdded ? { submittedSimulations: addedSubmittedSims } : {}),
      };
    }
  }

  nextDb = applyTombstonesToMergedDatabase(nextDb, scope);

  return {
    updatedDb: nextDb,
    filesRestored,
    orphansImported,
    healedLawsCount,
    permissionBlockedCount,
    skippedTombstonesCount,
    fileEvents,
  };
}

function loadTimer(scope: string): TimerStored {
  try {
    const scopedKey = getTimerStorageKey(scope);
    let raw = localStorage.getItem(scopedKey);
    if (!raw) {
      raw = localStorage.getItem(TIMER_STORAGE_KEY_LEGACY);
    }
    const parsed = JSON.parse(raw || '{}') as Partial<TimerStored>;
    return {
      elapsed: typeof parsed.elapsed === 'number' && Number.isFinite(parsed.elapsed) ? Math.max(0, parsed.elapsed) : 0,
      startedAt: typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt) ? Math.max(0, parsed.startedAt) : 0,
    };
  } catch {
    return { elapsed: 0, startedAt: 0 };
  }
}

function loadTimerTopic(scope: string): ActiveTimerLink | null {
  try {
    const raw = localStorage.getItem(getTimerTopicStorageKey(scope));
    return raw ? (JSON.parse(raw) as ActiveTimerLink) : null;
  } catch {
    return null;
  }
}

export const StudyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialGasSession = useMemo(() => getGasSession(), []);
  const [googleUser, setGoogleUser] = useState<User | null>(() =>
    initialGasSession?.username
      ? {
          uid: initialGasSession.username,
          email: initialGasSession.username,
          displayName: initialGasSession.username,
        }
      : null,
  );
  const initialScope = useMemo(
    () => (initialGasSession?.username ? getUserScopeKey({ email: initialGasSession.username }) : 'offline_guest'),
    [initialGasSession],
  );
  const activeScopeRef = useRef<string>(initialScope);

  // Set active storage scope immediately so blob reads/writes use active account
  if (typeof window !== 'undefined') {
    setStorageUserScope(activeScopeRef.current);
  }

  const [db, setDbState] = useState<StudyDatabase>(() => loadStoredDatabase(initialScope));
  const [activePage, setActivePageState] = useState<ModuleName>('Início');
  const setActivePage = useCallback((page: ModuleName) => {
    window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
    setExamFocusMode(false);
    setActivePageState(page);
  }, []);
  const [lawDeepLink, setLawDeepLink] = useState<LawDeepLink | null>(null);
  const [selectedEditalContestId, setSelectedEditalContestId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [examFocusMode, setExamFocusMode] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [quiz, setQuiz] = useState<QuizSession | null>(null);

  const [timerState, setTimerState] = useState<TimerStored>(() => loadTimer(initialScope));
  const [activeTimerTopic, setActiveTimerTopic] = useState<ActiveTimerLink | null>(() => loadTimerTopic(initialScope));
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [pomodoroMode, setPomodoroModeState] = useState<PomodoroMode>('continuous');
  const [pomodoroPhase, setPomodoroPhase] = useState<'focus' | 'break'>('focus');
  const [pomodoroRemainingSeconds, setPomodoroRemainingSeconds] = useState<number>(0);
  const [focusQuote, setFocusQuote] = useState<string>('A constância diária vence a intensidade passageira.');
  const quizTimerBaselineRef = useRef<number>(0);
  const finishQuizSessionRef = useRef<() => void>(() => {});

  const [driveConnected, setDriveConnected] = useState<boolean>(() => Boolean(initialGasSession));
  const [driveTokenReady, setDriveTokenReady] = useState<boolean>(() => Boolean(initialGasSession));
  const [isRenewingDriveToken, setIsRenewingDriveToken] = useState<boolean>(false);
  const [activeDriveFolderId, setActiveDriveFolderId] = useState<string | null>(
    () => db.preferences?.default_drive_folder?.id || getPreferredStudyFolder().id,
  );
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(() => {
    const pref = db.preferences?.default_drive_folder || getPreferredStudyFolder();
    return pref.url || (pref.id ? `https://drive.google.com/drive/folders/${pref.id}` : null);
  });
  const [activeDriveFolderName, setActiveDriveFolderName] = useState<string>(
    () => db.preferences?.default_drive_folder?.name || getPreferredStudyFolder().name,
  );
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(() => loadSyncMeta(initialScope).lastCloudSyncAt || null);
  const [lastCacheVerifiedAt, setLastCacheVerifiedAt] = useState<string | null>(
    () => loadSyncMeta(initialScope).lastCacheVerifiedAt || null,
  );
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
  const isSyncingDriveRef = useRef<boolean>(false);
  useEffect(() => {
    isSyncingDriveRef.current = isSyncingDrive;
  }, [isSyncingDrive]);
  const [hasPendingCloudChanges, setHasPendingCloudChanges] = useState<boolean>(
    () => initialScope !== 'offline_guest' && hasPersistedPendingSync(loadSyncMeta(initialScope)),
  );
  const [drivePermissionNeedsPicker, setDrivePermissionNeedsPicker] = useState<{
    folderId: string;
    folderName: string;
    count: number;
  } | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncActivityLogs, setSyncActivityLogs] = useState<SyncActivityLogEntry[]>(() =>
    loadSyncActivityLogs(initialScope),
  );
  const [gasOperationQueue, setGasOperationQueue] = useState<GasQueuedOperation[]>(() =>
    loadGasOperationQueue(),
  );
  const [gasQueueProcessing, setGasQueueProcessing] = useState<boolean>(() => isGasQueueProcessing());
  const [localGasAuditLogs, setLocalGasAuditLogs] = useState<GasAuditLogEntry[]>(() =>
    getLocalGasAuditLogs(),
  );
  const [driveSyncConflicts, setDriveSyncConflicts] = useState<DeletedDriveConflict[]>([]);
  const [driveConflictErrors, setDriveConflictErrors] = useState<
    Record<string, { reason: DriveTrashFailureReason; message: string }>
  >({});
  const [resolvingDriveConflictId, setResolvingDriveConflictId] = useState<string | null>(null);
  const dismissedConflictIdsRef = useRef<Set<string>>(new Set());
  const [driveUploadOutboxItems, setDriveUploadOutboxItems] = useState<DriveUploadOutboxItem[]>([]);
  const [localRestorePoints, setLocalRestorePoints] = useState<LocalRestorePointMeta[]>([]);

  const [lastLocalWriteMs, setLastLocalWriteMs] = useState<number>(0);
  const lastUserEditMsRef = useRef<number>(0);
  const lastLocalWriteMsRef = useRef<number>(0);
  const lastDeletionMsRef = useRef<number>(0);
  const lastUrgentSaveMsRef = useRef<number>(0);
  const googleUserRef = useRef<User | null>(googleUser);
  googleUserRef.current = googleUser;
  const activeTimerTopicRef = useRef<ActiveTimerLink | null>(activeTimerTopic);
  activeTimerTopicRef.current = activeTimerTopic;

  const [gasSession, setGasSession] = useState<GasSession | null>(() => initialGasSession);
  const [gasApiUrl, setGasApiUrlState] = useState<string>(() => getConfiguredGasApiUrl());
  const [conflictHistory, setConflictHistory] = useState<SyncConflictHistoryEntry[]>(() =>
    loadConflictHistory(initialScope),
  );
  const [latestVersionComparison, setLatestVersionComparison] = useState<VersionComparisonReport | null>(null);
  const [isCheckingDivergence, setIsCheckingDivergence] = useState<boolean>(false);
  const [resolvingConflictAction, setResolvingConflictAction] = useState<string | null>(null);
  const gasHydratedTokenRef = useRef<string | null>(null);
  const gasConnected = Boolean(gasSession?.token);
  const [gasConnectionHealth, setGasConnectionHealth] = useState<GasConnectionHealth>(() => ({
    status:
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'offline'
        : initialGasSession?.token
          ? 'checking'
          : 'disconnected',
    lastCheckedAt: null,
    lastOnlineAt: initialGasSession?.lastSyncedAt || null,
    latencyMs: null,
    consecutiveFailures: 0,
    errorMessage: null,
    serverVersion: typeof initialGasSession?.serverVersion === 'number' ? initialGasSession.serverVersion : null,
    scriptVersion: null,
    folderName: initialGasSession?.folderName || null,
    isReconnecting: false,
  }));
  const gasHealthCheckInFlightRef = useRef<boolean>(false);
  const lastGasHealthCheckMsRef = useRef<number>(0);
  const gasConnectionHealthRef = useRef<GasConnectionHealth>(gasConnectionHealth);
  gasConnectionHealthRef.current = gasConnectionHealth;

  const [activeSyncMeta, setActiveSyncMeta] = useState<Omit<ActiveSyncState, 'localChecksum'>>(() => {
    const initialPersistedHash =
      initialGasSession?.lastContentHash || loadSyncMeta(initialScope).lastCloudContentHash || null;
    return {
      status: 'idle',
      baseChecksum: initialPersistedHash,
      remoteChecksum: initialPersistedHash,
      localBaseVersion: typeof initialGasSession?.serverVersion === 'number' ? initialGasSession.serverVersion : 0,
      remoteVersion: typeof initialGasSession?.serverVersion === 'number' ? initialGasSession.serverVersion : null,
      remoteDevice: null,
      remoteUpdatedAt: initialGasSession?.lastSyncedAt || null,
      lastCheckedAt: null,
      lastGuardOutcome: null,
      blockedReason: null,
      writesProtectedCount: 0,
      controlSheetTable: 'tb_estado',
    };
  });

  const currentLocalChecksum = useMemo(() => computeDatabaseContentHash(db), [db]);

  const activeSyncState = useMemo<ActiveSyncState>(() => {
    const baseChecksum = activeSyncMeta.baseChecksum || gasSession?.lastContentHash || null;
    const localBaseVersion = typeof gasSession?.serverVersion === 'number' ? gasSession.serverVersion : activeSyncMeta.localBaseVersion;
    let derivedStatus: ActiveSyncGuardStatus = activeSyncMeta.status;

    if (
      gasConnectionHealth.status === 'offline' ||
      (gasOperationQueue.length > 0 && gasOperationQueue.some((it) => it.status === 'waiting-connection'))
    ) {
      if (derivedStatus !== 'blocked-conflict' && derivedStatus !== 'checking') {
        derivedStatus = 'offline-queued';
      }
    } else if (derivedStatus === 'in-sync' && activeSyncMeta.remoteChecksum && currentLocalChecksum !== activeSyncMeta.remoteChecksum) {
      derivedStatus = 'local-ahead';
    } else if (derivedStatus === 'idle' && gasSession?.token) {
      if (activeSyncMeta.remoteChecksum && currentLocalChecksum === activeSyncMeta.remoteChecksum) {
        derivedStatus = 'in-sync';
      } else if (baseChecksum && currentLocalChecksum !== baseChecksum) {
        derivedStatus = 'local-ahead';
      }
    }

    return {
      ...activeSyncMeta,
      status: derivedStatus,
      localChecksum: currentLocalChecksum,
      baseChecksum,
      localBaseVersion,
    };
  }, [activeSyncMeta, currentLocalChecksum, gasConnectionHealth.status, gasOperationQueue, gasSession?.lastContentHash, gasSession?.serverVersion, gasSession?.token]);

  useEffect(() => {
    return subscribeGasSession((next) => {
      setGasSession(next);
      if (next) {
        setActiveSyncMeta((prev) => ({
          ...prev,
          baseChecksum: next.lastContentHash || prev.baseChecksum,
          localBaseVersion: typeof next.serverVersion === 'number' ? next.serverVersion : prev.localBaseVersion,
        }));
      }
    });
  }, []);

  useEffect(() => {
    return subscribeGasActiveSyncEvents((ev) => {
      setActiveSyncMeta((prev) => {
        if (ev.type === 'write-blocked') {
          return {
            ...prev,
            status: 'blocked-conflict',
            baseChecksum: ev.expectedBaseChecksum ?? prev.baseChecksum,
            remoteChecksum: ev.remoteChecksum ?? prev.remoteChecksum,
            localBaseVersion: typeof ev.localBaseVersion === 'number' ? ev.localBaseVersion : prev.localBaseVersion,
            remoteVersion: typeof ev.remoteVersion === 'number' ? ev.remoteVersion : prev.remoteVersion,
            remoteDevice: ev.remoteDevice ?? prev.remoteDevice,
            remoteUpdatedAt: ev.remoteUpdatedAt ?? prev.remoteUpdatedAt,
            lastCheckedAt: ev.checkedAt,
            lastGuardOutcome: 'blocked',
            blockedReason: ev.reason || 'Versão/checksum mais recente detectado na planilha de controle.',
            writesProtectedCount: prev.writesProtectedCount + 1,
            controlSheetTable: ev.controlSheetTable || prev.controlSheetTable,
          };
        }
        if (ev.type === 'write-committed') {
          return {
            ...prev,
            status: 'in-sync',
            baseChecksum: ev.remoteChecksum ?? prev.baseChecksum,
            remoteChecksum: ev.remoteChecksum ?? prev.remoteChecksum,
            localBaseVersion: typeof ev.remoteVersion === 'number' ? ev.remoteVersion : prev.localBaseVersion,
            remoteVersion: typeof ev.remoteVersion === 'number' ? ev.remoteVersion : prev.remoteVersion,
            remoteDevice: ev.remoteDevice ?? prev.remoteDevice,
            remoteUpdatedAt: ev.remoteUpdatedAt ?? ev.checkedAt,
            lastCheckedAt: ev.checkedAt,
            lastGuardOutcome: 'allowed',
            blockedReason: null,
            controlSheetTable: ev.controlSheetTable || prev.controlSheetTable,
          };
        }
        return {
          ...prev,
          status:
            ev.status === 'conflict'
              ? 'blocked-conflict'
              : ev.status === 'in-sync'
                ? 'in-sync'
                : ev.status === 'local-ahead' || ev.status === 'remote-empty'
                  ? 'local-ahead'
                  : prev.status,
          baseChecksum: ev.expectedBaseChecksum ?? prev.baseChecksum,
          remoteChecksum: ev.remoteChecksum ?? prev.remoteChecksum,
          localBaseVersion: typeof ev.localBaseVersion === 'number' ? ev.localBaseVersion : prev.localBaseVersion,
          remoteVersion: typeof ev.remoteVersion === 'number' ? ev.remoteVersion : prev.remoteVersion,
          remoteDevice: ev.remoteDevice ?? prev.remoteDevice,
          remoteUpdatedAt: ev.remoteUpdatedAt ?? prev.remoteUpdatedAt,
          lastCheckedAt: ev.checkedAt,
          lastGuardOutcome: ev.status === 'conflict' ? 'blocked' : 'allowed',
          blockedReason: ev.status === 'conflict' ? ev.reason || null : null,
          controlSheetTable: ev.controlSheetTable || prev.controlSheetTable,
        };
      });
    });
  }, []);

  useEffect(() => {
    return subscribeConflictHistory((changedScope, nextItems) => {
      if (changedScope === activeScopeRef.current) {
        setConflictHistory(nextItems);
      }
    });
  }, []);

  useEffect(() => {
    return subscribeSyncActivityLogs((changedScope, nextLogs) => {
      if (changedScope === activeScopeRef.current) {
        setSyncActivityLogs(nextLogs);
      }
    });
  }, []);

  const recordSyncActivity = useCallback(
    (input: NewSyncActivityLogInput, explicitScope?: string) => {
      const targetScope = explicitScope || activeScopeRef.current || 'offline_guest';
      appendSyncActivityLog(targetScope, input);
    },
    [],
  );

  const clearSyncActivityLogs = useCallback(() => {
    clearSyncActivityLogsForScope(activeScopeRef.current || 'offline_guest');
  }, []);

  const setGasApiUrl = useCallback((url: string) => {
    const clean = setConfiguredGasApiUrl(url);
    setGasApiUrlState(clean);
  }, []);

  const runDriveTimestampComparison = useCallback(
    (
      targetDb: StudyDatabase,
      driveFiles: DriveFileInfo[],
      scope: string,
      options?: { onlyFolderId?: string; includeDismissed?: boolean; sourceLabel?: string },
    ): TimestampSyncComparisonReport => {
      const report = compareLocalAndDriveFileTimestamps(targetDb, driveFiles, scope, {
        onlyFolderId: options?.onlyFolderId,
      });

      if (!options?.onlyFolderId) {
        const activeIds = new Set(driveFiles.map((df) => df.id));
        const activeNames = new Set(driveFiles.map((df) => normalizeFileLookup(df.name)));
        const activeStripped = new Set(driveFiles.map((df) => normalizeFileLookup(stripDrivePrefix(df.name))));
        const pendingAll = [
          ...getPendingDriveDeletes(scope),
          ...(scope !== 'offline_guest' ? getPendingDriveDeletes('offline_guest') : []),
        ];
        if (pendingAll.length > 0 && report.deletedConflicts.length === 0) {
          const anyStillInDrive = pendingAll.some((pd) => {
            if (pd.fileIds?.some((id) => activeIds.has(String(id).replace(/^drive_/, '')))) return true;
            if (
              pd.names?.some((n) => {
                const nf = normalizeFileLookup(n);
                const ns = normalizeFileLookup(stripDrivePrefix(n));
                return activeNames.has(nf) || activeStripped.has(ns);
              })
            ) {
              return true;
            }
            if (pd.folderNames?.length) {
              const fk = new Set(pd.folderNames.map((f) => normalizeSearch(visibleName(f))));
              return driveFiles.some((df) =>
                String(df.folderPath || '')
                  .split('/')
                  .some((seg) => fk.has(normalizeSearch(visibleName(seg)))),
              );
            }
            return false;
          });
          if (!anyStillInDrive) {
            clearPendingDriveDeletes(scope);
            if (scope !== 'offline_guest') clearPendingDriveDeletes('offline_guest');
          }
        }
      }

      if (options?.includeDismissed) {
        dismissedConflictIdsRef.current.clear();
      }
      const visibleConflicts = options?.includeDismissed
        ? report.deletedConflicts
        : report.deletedConflicts.filter((c) => !dismissedConflictIdsRef.current.has(c.id));

      setDriveSyncConflicts(visibleConflicts);
      setDriveConflictErrors((prev) => {
        const visibleSet = new Set(visibleConflicts.map((c) => c.id));
        const next: Record<string, { reason: DriveTrashFailureReason; message: string }> = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (visibleSet.has(k)) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });

      if (
        report.localNewer.length > 0 ||
        report.driveNewer.length > 0 ||
        report.deletedConflicts.length > 0
      ) {
        recordSyncActivity(
          {
            category: 'drive-sync',
            operation: options?.sourceLabel || 'Comparação de timestamps (Local × Drive)',
            status: report.deletedConflicts.length > 0 ? 'warning' : 'success',
            message: [
              report.deletedConflicts.length > 0
                ? `${report.deletedConflicts.length} arquivo(s) excluído(s) localmente encontrado(s) no Google Drive (aguardando decisão)`
                : null,
              report.localNewer.length > 0
                ? `${report.localNewer.length} arquivo(s) local(is) mais recente(s)`
                : null,
              report.driveNewer.length > 0
                ? `${report.driveNewer.length} arquivo(s) no Drive mais recente(s)`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
            affectedFiles: [
              ...report.deletedConflicts.map((c) => ({
                name: c.displayName,
                action: 'skipped-tombstone' as const,
                module: c.moduleLabel,
                driveFileId: c.driveFile.id,
                syncOrigin: c.syncOrigin,
                detail:
                  c.newerSide === 'drive'
                    ? 'Drive mais recente que a exclusão local'
                    : c.newerSide === 'local-delete'
                      ? 'Exclusão local mais recente que o Drive'
                      : 'Conflito: excluído localmente e presente no Drive',
              })),
              ...report.localNewer.map((item) => ({
                name: item.name,
                action: 'uploaded' as const,
                module: item.moduleLabel,
                driveFileId: item.driveFile?.id,
                syncOrigin: item.syncOrigin,
                detail: 'Versão local mais recente',
              })),
              ...report.driveNewer.map((item) => ({
                name: item.name,
                action: 'restored' as const,
                module: item.moduleLabel,
                driveFileId: item.driveFile?.id,
                syncOrigin: item.syncOrigin,
                detail:
                  item.syncOrigin === 'external-modified'
                    ? 'Versão do Drive mais recente (modificada externamente)'
                    : 'Versão do Drive mais recente',
              })),
            ],
            stats: {
              skippedTombstones: report.deletedConflicts.length,
              uploaded: report.localNewer.length,
              restored: report.driveNewer.length,
            },
          },
          scope,
        );
      }

      return report;
    },
    [recordSyncActivity],
  );

  const registerLocalWriteShield = useCallback((_uid?: string | null): number => {
    const now = Date.now();
    lastLocalWriteMsRef.current = now;
    lastUserEditMsRef.current = now;
    // Only update state when more than 2500ms have elapsed to avoid secondary re-renders on every keystroke/highlight
    setLastLocalWriteMs((prev) => (now - prev > 2500 ? now : prev));
    return now;
  }, []);

  const dbRef = useRef<StudyDatabase>(db);
  const pendingCloudSyncRef = useRef<boolean>(
    initialScope !== 'offline_guest' && hasPersistedPendingSync(loadSyncMeta(initialScope)),
  );
  const driveConnectedRef = useRef<boolean>(driveConnected);
  const deleteOrQueueDriveFiles = useCallback(
    (target: DriveDeleteTarget) => {
      const scope = activeScopeRef.current || 'offline_guest';
      queuePendingDriveDeletes(scope, target);
      const targetLabels = [
        ...(target.names || []),
        ...(target.folderNames || []).map((f) => `Pasta: ${f}`),
        ...(target.fileIds || []).filter((id) => !(target.names || []).length).map((id) => `ID ${id}`),
      ].filter(Boolean);

      if (scope === 'offline_guest' || !driveConnectedRef.current) {
        if (targetLabels.length > 0) {
          recordSyncActivity(
            {
              category: 'drive-delete',
              operation: 'Exclusão registrada localmente',
              status: 'warning',
              message:
                'Item excluído localmente. A remoção na pasta do Google Drive ficou na fila aguardando conexão com a conta Google.',
              affectedFiles: targetLabels.map((name) => ({
                name,
                action: 'queued-delete' as const,
                detail: 'Aguardando login com o Google Drive',
              })),
              stats: { queuedDeletes: targetLabels.length },
            },
            scope,
          );
        }
        return;
      }

      void (async () => {
        const token = await getAccessToken();
        if (!token) {
          if (targetLabels.length > 0) {
            recordSyncActivity(
              {
                category: 'drive-delete',
                operation: 'Exclusão no Drive aguardando sessão OAuth',
                status: 'warning',
                errorCode: 'oauth/drive-token-expired',
                message:
                  'A exclusão foi salva localmente, mas a sessão do Google Drive não está ativa. Entre no painel do Google Apps Script para enviar à lixeira do Drive.',
                affectedFiles: targetLabels.map((name) => ({
                  name,
                  action: 'queued-delete' as const,
                  detail: 'Aguardando reautorização OAuth do Drive',
                })),
                stats: { queuedDeletes: targetLabels.length },
              },
              scope,
            );
          }
          return;
        }
        const {
          deletedIds,
          deletedNames,
          remainingCount,
          permissionBlockedIds,
          tokenExpired,
          firstErrorDetail,
        } = await flushPendingDriveDeletes(scope, token);
        if (tokenExpired) {
          setDriveTokenReady(false);
        }
        if (deletedIds.length > 0) {
          removeFileIdsFromCacheMeta(scope, deletedIds);
          const labels = deletedNames.length > 0 ? deletedNames : targetLabels;
          recordSyncActivity(
            {
              category: 'drive-delete',
              operation: 'Exclusão enviada à lixeira do Google Drive',
              status: remainingCount > 0 ? 'warning' : 'success',
              message:
                remainingCount > 0
                  ? `${deletedIds.length} arquivo(s) movido(s) para a lixeira do Drive; ${remainingCount} item(ns) ainda na fila.`
                  : `${deletedIds.length} arquivo(s) movido(s) para a lixeira do Google Drive para não retornarem.`,
              affectedFiles: labels.map((name) => ({
                name,
                action: 'trashed' as const,
              })),
              stats: { trashed: deletedIds.length, queuedDeletes: remainingCount },
            },
            scope,
          );
        } else if (remainingCount > 0 && targetLabels.length > 0) {
          const isPickerBlocked = permissionBlockedIds.length > 0;
          recordSyncActivity(
            {
              category: 'drive-delete',
              operation: tokenExpired
                ? 'Exclusão no Drive aguardando sessão OAuth'
                : isPickerBlocked
                  ? 'Exclusão no Drive aguardando autorização pelo Seletor'
                  : 'Falha ao excluir arquivo no Google Drive',
              status: tokenExpired || isPickerBlocked ? 'warning' : 'error',
              errorCode: tokenExpired ? 'oauth/drive-token-expired' : undefined,
              message:
                firstErrorDetail ||
                'Não foi possível mover os itens selecionados para a lixeira do Google Drive agora; permaneceram na fila de exclusão.',
              affectedFiles: targetLabels.map((name) => ({
                name,
                action: tokenExpired || isPickerBlocked ? ('queued-delete' as const) : ('failed' as const),
                detail: firstErrorDetail || 'Mantido na fila de exclusão',
              })),
              stats: { queuedDeletes: remainingCount },
            },
            scope,
          );
        }
      })();
    },
    [recordSyncActivity],
  );

  const setDb = useCallback((updater: React.SetStateAction<StudyDatabase>) => {
    const prev = dbRef.current;
    const rawNext = typeof updater === 'function' ? updater(prev) : updater;
    // Fast no-op bailout: if reference is identical, never schedule a state update or DOM redraw
    if (rawNext === prev) {
      return;
    }
    let next = rawNext;
    if (!isRestoringRef.current) {
      const currentScope = activeScopeRef.current || 'offline_guest';
      const pruned = pruneActiveTombstonesForDatabase(
        currentScope,
        rawNext,
        rawNext.deletedTombstones,
      );
      if (currentScope !== 'offline_guest') {
        pruneActiveTombstonesForDatabase('offline_guest', rawNext);
      }
      const deleted = detectDeletedEntitiesBetweenDatabases(prev, rawNext);
      if (deleted.length > 0) {
        const updatedTombstones = recordDeletedTombstones(
          currentScope,
          deleted,
          pruned ?? rawNext.deletedTombstones,
        );
        next = { ...rawNext, deletedTombstones: updatedTombstones };
        lastDeletionMsRef.current = Date.now();
      } else if (pruned !== rawNext.deletedTombstones) {
        next = { ...rawNext, deletedTombstones: pruned };
      }
      pendingCloudSyncRef.current = true;
    }
    dbRef.current = next;
    setDbState(next);
  }, []);
  const timerStateRef = useRef<TimerStored>(timerState);
  const quizRef = useRef<QuizSession | null>(quiz);
  const activeDriveFolderNameRef = useRef<string>(activeDriveFolderName);
  const skipPersistDbRef = useRef<StudyDatabase | null>(db);
  const lastPersistedDbRef = useRef<StudyDatabase>(db);
  const lastPersistedDbHashRef = useRef<string>(computeDatabaseContentHash(db));
  const lastDriveUploadAlertAtRef = useRef<number>(0);
  const isRestoringRef = useRef<boolean>(false);
  const syncedScopeOnceRef = useRef<string | null>(null);
  const activeCloudSyncPromiseRef = useRef<Promise<void> | null>(null);
  const cloudSaveInFlightRef = useRef<boolean>(false);
  const lastAutoBackupAtRef = useRef<number>(Date.now());
  const pendingGuestDbRef = useRef<{ db: StudyDatabase; updatedAtMs: number } | null>(null);
  const lastCloudDbRef = useRef<StudyDatabase | null>(null);
  const lastCloudHashRef = useRef<string | null>(loadSyncMeta(initialScope).lastCloudContentHash || null);
  const lastBackupDbRef = useRef<StudyDatabase | null>(null);
  const lastBackupHashRef = useRef<string | null>(loadSyncMeta(initialScope).lastBackupContentHash || null);
  const lastBackupIsoRef = useRef<string | null>(loadSyncMeta(initialScope).lastCloudSyncAt || null);
  timerStateRef.current = timerState;
  quizRef.current = quiz;
  activeDriveFolderNameRef.current = activeDriveFolderName;
  driveConnectedRef.current = driveConnected;

  // Seed sample PDFs, request persistent browser storage, and hydrate DB & sync metadata from IndexedDB if authoritative or newer than localStorage cache
  useEffect(() => {
    void ensureSeededBlobs();
    void ensurePersistentBrowserStorage();
    const scope = activeScopeRef.current;
    void (async () => {
      const [idbSnap, idbMeta] = await Promise.all([
        loadScopedDatabaseJson(scope),
        loadScopedSyncMeta<ScopeSyncMeta>(scope),
      ]);
      if (activeScopeRef.current !== scope) return;

      if (idbMeta) {
        const lsMeta = loadSyncMeta(scope);
        const lsEditMs = Date.parse(lsMeta.lastLocalEditAt || '') || 0;
        const idbEditMs = Date.parse(idbMeta.lastLocalEditAt || '') || 0;
        const lsSyncMs = Date.parse(lsMeta.lastCloudSyncAt || '') || 0;
        const idbSyncMs = Date.parse(idbMeta.lastCloudSyncAt || '') || 0;
        const mergedMeta = saveSyncMeta(scope, {
          ...idbMeta,
          ...lsMeta,
          lastLocalEditAt: idbEditMs > lsEditMs ? idbMeta.lastLocalEditAt : lsMeta.lastLocalEditAt || idbMeta.lastLocalEditAt,
          lastCloudSyncAt: idbSyncMs > lsSyncMs ? idbMeta.lastCloudSyncAt : lsMeta.lastCloudSyncAt || idbMeta.lastCloudSyncAt,
          hasPendingCloudSync: Boolean(lsMeta.hasPendingCloudSync || idbMeta.hasPendingCloudSync),
        });
        if (scope !== 'offline_guest' && hasPersistedPendingSync(mergedMeta)) {
          pendingCloudSyncRef.current = true;
          setHasPendingCloudChanges(true);
        }
      }

      if (!idbSnap || activeScopeRef.current !== scope || isRestoringRef.current) return;
      let hadLocalLs = false;
      try {
        hadLocalLs = Boolean(localStorage.getItem(getDbStorageKey(scope)));
      } catch {
        hadLocalLs = false;
      }
      if (shouldPreferIdbSnapshot(scope, idbSnap, hadLocalLs)) {
        try {
          const parsed = applyTombstonesToMergedDatabase(
            normalizeAndMergeDatabase(JSON.parse(idbSnap.raw)),
            scope,
          );
          isRestoringRef.current = true;
          skipPersistDbRef.current = parsed;
          lastPersistedDbRef.current = parsed;
          lastPersistedDbHashRef.current = computeDatabaseContentHash(parsed);
          setDb(parsed);
          dbRef.current = parsed;
        } catch {
          // Ignore malformed IndexedDB snapshot
        }
      }
    })();
  }, []);

  const localPersistTimerRef = useRef<number | null>(null);

  // Persist DB to IndexedDB (unlimited capacity) and localStorage (fast cache) only on real user changes.
  // Debounced slightly (280ms) with single-pass JSON.stringify + hashing to eliminate main-thread UI freezes
  // during rapid clicks/edits, while visibilitychange/beforeunload flushes immediately.
  useEffect(() => {
    if (db === skipPersistDbRef.current) {
      skipPersistDbRef.current = null;
      lastPersistedDbRef.current = db;
      lastPersistedDbHashRef.current = computeDatabaseContentHash(db);
      isRestoringRef.current = false;
      return;
    }
    if (db === lastPersistedDbRef.current) {
      isRestoringRef.current = false;
      return;
    }

    if (localPersistTimerRef.current !== null) {
      window.clearTimeout(localPersistTimerRef.current);
      localPersistTimerRef.current = null;
    }

    const wasRestoring = isRestoringRef.current;
    isRestoringRef.current = false;

    localPersistTimerRef.current = window.setTimeout(() => {
      localPersistTimerRef.current = null;
      const targetDb = dbRef.current;
      if (targetDb === lastPersistedDbRef.current) return;

      const serialized = JSON.stringify(targetDb);
      const curHash = computeSerializedContentHash(serialized);
      if (curHash === lastPersistedDbHashRef.current) {
        lastPersistedDbRef.current = targetDb;
        return;
      }

      lastPersistedDbRef.current = targetDb;
      lastPersistedDbHashRef.current = curHash;
      if (!wasRestoring) {
        registerLocalWriteShield();
      }

      const scope = activeScopeRef.current;
      const nowIso = new Date().toISOString();
      const hasCustomOfflineData = scope !== 'offline_guest' || !isUntouchedSeedDatabase(targetDb);
      persistLocalDatabaseForScope(scope, serialized, nowIso, {
        lastLocalEditAt: nowIso,
        ...(hasCustomOfflineData ? { hasPendingCloudSync: true } : {}),
      });
      if (hasCustomOfflineData) {
        pendingCloudSyncRef.current = true;
        setHasPendingCloudChanges((prev) => (prev ? prev : true));
      }
    }, 280);

    return () => {
      if (localPersistTimerRef.current !== null) {
        window.clearTimeout(localPersistTimerRef.current);
        localPersistTimerRef.current = null;
      }
    };
  }, [db, registerLocalWriteShield]);

  // Apply theme attribute & meta color
  useEffect(() => {
    const tema = db.preferences.tema || 'gov-padrao';
    document.documentElement.dataset.theme = tema;
    const theme = THEMES.find((t) => t.id === tema);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme && meta) meta.content = theme.colors[0];
  }, [db.preferences.tema]);

  // Persist timer state to user-scoped localStorage
  useEffect(() => {
    try {
      localStorage.setItem(getTimerStorageKey(activeScopeRef.current), JSON.stringify(timerState));
    } catch {
      // Ignore storage error
    }
  }, [timerState]);

  useEffect(() => {
    try {
      const key = getTimerTopicStorageKey(activeScopeRef.current);
      if (activeTimerTopic) {
        localStorage.setItem(key, JSON.stringify(activeTimerTopic));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage error
    }
  }, [activeTimerTopic]);

  const computeCurrentTimerSeconds = useCallback(
    (t: TimerStored, nowMs: number) =>
      t.elapsed + (t.startedAt ? Math.max(0, Math.floor((nowMs - t.startedAt + 40) / 1000)) : 0),
    [],
  );

  const getCurrentTimerSeconds = useCallback(
    () => computeCurrentTimerSeconds(timerStateRef.current, Date.now()),
    [computeCurrentTimerSeconds],
  );

  const timerSeconds = computeCurrentTimerSeconds(timerState, nowTick);
  const timerRunning = timerState.startedAt > 0;

  const toast = useCallback((message: string, isError = false) => {
    const id = uid(10);
    setToasts((prev) => [...prev, { id, message, isError }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const pomodoroModeRef = useRef<PomodoroMode>(pomodoroMode);
  const pomodoroPhaseRef = useRef<'focus' | 'break'>(pomodoroPhase);
  const pomodoroRemainingRef = useRef<number>(pomodoroRemainingSeconds);
  const lastWallSecRef = useRef<number>(Math.floor(Date.now() / 1000));
  const lastTimerSecRef = useRef<number>(computeCurrentTimerSeconds(timerState, Date.now()));
  pomodoroModeRef.current = pomodoroMode;
  pomodoroPhaseRef.current = pomodoroPhase;

  useEffect(() => {
    pomodoroRemainingRef.current = pomodoroRemainingSeconds;
  }, [pomodoroRemainingSeconds]);

  // Keep external timerTickStore synchronized whenever timer state or Pomodoro config changes
  useEffect(() => {
    const now = Date.now();
    const sec = computeCurrentTimerSeconds(timerState, now);
    lastTimerSecRef.current = sec;
    publishTimerTickSnapshot({
      nowTick: now,
      timerSeconds: sec,
      timerRunning: timerState.startedAt > 0,
      pomodoroMode,
      pomodoroPhase,
      pomodoroRemainingSeconds: pomodoroRemainingRef.current,
    });
  }, [computeCurrentTimerSeconds, pomodoroMode, pomodoroPhase, pomodoroRemainingSeconds, timerState]);

  // Precision ticker: publishes 1Hz updates ONLY to timerTickStore (useSyncExternalStore),
  // completely eliminating 1Hz re-renders of StudyProvider and full-page trees!
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = timerStateRef.current;
      const activeQuiz = quizRef.current;
      const hasRunningQuiz = Boolean(activeQuiz && !activeQuiz.completed);
      if (t.startedAt === 0 && !hasRunningQuiz) {
        return;
      }

      const now = Date.now();
      const wallSec = Math.floor(now / 1000);
      const curTimerSec = computeCurrentTimerSeconds(t, now);

      const wallChanged = wallSec !== lastWallSecRef.current;
      const timerChanged = curTimerSec !== lastTimerSecRef.current;

      if (!wallChanged && !timerChanged) return;

      lastWallSecRef.current = wallSec;
      const prevTimerSec = lastTimerSecRef.current;
      const deltaSec = t.startedAt > 0 ? Math.max(0, curTimerSec - prevTimerSec) : 0;
      lastTimerSecRef.current = curTimerSec;

      if (pomodoroModeRef.current !== 'continuous' && t.startedAt > 0 && deltaSec > 0) {
        const mode = pomodoroModeRef.current;
        const focusSec = mode === '25-5' ? 25 * 60 : 50 * 60;
        const breakSec = mode === '25-5' ? 5 * 60 : 10 * 60;
        const prevRem = pomodoroRemainingRef.current;
        if (prevRem > deltaSec) {
          pomodoroRemainingRef.current = prevRem - deltaSec;
        } else {
          playPomodoroChime();
          const nextPhase = pomodoroPhaseRef.current === 'focus' ? 'break' : 'focus';
          pomodoroPhaseRef.current = nextPhase;
          const nextRem = nextPhase === 'break' ? breakSec : focusSec;
          pomodoroRemainingRef.current = nextRem;
          setPomodoroPhase(nextPhase);
          setPomodoroRemainingSeconds(nextRem);
          window.setTimeout(() => {
            toast(
              nextPhase === 'break'
                ? `Ciclo Pomodoro concluído! Faça uma pausa de ${breakSec / 60} min.`
                : 'Pausa encerrada! Hora de voltar ao foco.',
            );
          }, 0);
        }
      }

      if (t.startedAt > 0) {
        publishTimerTickSnapshot({
          nowTick: now,
          timerSeconds: curTimerSec,
          timerRunning: true,
          pomodoroMode: pomodoroModeRef.current,
          pomodoroPhase: pomodoroPhaseRef.current,
          pomodoroRemainingSeconds: pomodoroRemainingRef.current,
        });
      }

      if (quizRef.current && !quizRef.current.completed) {
        setQuiz((prev) => {
          if (!prev || prev.completed) return prev;
          const delta = t.startedAt ? Math.max(0, curTimerSec - prev.timerBaseline) : 0;
          const elapsed = prev.startedAt
            ? Math.max(0, Math.floor((now - prev.startedAt) / 1000))
            : prev.elapsedSeconds || 0;

          if (prev.timeLimitSeconds && prev.timeLimitSeconds > 0 && elapsed >= prev.timeLimitSeconds) {
            window.setTimeout(() => finishQuizSessionRef.current(), 10);
          }

          if (delta === 0 && prev.timerBaseline === curTimerSec && prev.elapsedSeconds === elapsed) {
            return prev;
          }
          return {
            ...prev,
            studySeconds: prev.studySeconds + delta,
            timerBaseline: curTimerSec,
            elapsedSeconds: elapsed,
          };
        });
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [computeCurrentTimerSeconds, toast]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const requestConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        ...options,
        resolve: (accepted: boolean) => {
          setConfirmDialog(null);
          resolve(accepted);
        },
      });
    });
  }, []);

  const associateAccountDefaultDriveFolder = useCallback(
    (
      folder: { id?: string | null; name?: string | null; url?: string | null; updatedAt?: string },
      options?: { skipDbUpdate?: boolean },
    ) => {
      const cleanId = folder.id?.trim() || null;
      const cleanName = folder.name?.trim() || DRIVE_FOLDER_NAME;
      const cleanUrl =
        folder.url?.trim() ||
        (cleanId ? `https://drive.google.com/drive/folders/${cleanId}` : undefined);
      const nowIso = folder.updatedAt || new Date().toISOString();

      setPreferredStudyFolder(
        { id: cleanId, name: cleanName, url: cleanUrl, updatedAt: nowIso },
        googleUserRef.current?.email || googleUserRef.current?.uid,
      );
      setActiveDriveFolderId((prev) => (prev === cleanId ? prev : cleanId));
      setActiveDriveFolderName((prev) => (prev === cleanName ? prev : cleanName));
      setDriveFolderUrl((prev) => {
        const nextUrl = cleanUrl || null;
        return prev === nextUrl ? prev : nextUrl;
      });

      if (!options?.skipDbUpdate) {
        setDb((prev) => {
          const cur = prev.preferences?.default_drive_folder;
          if (
            cur &&
            cur.id === cleanId &&
            cur.name === cleanName &&
            (cur.url || undefined) === cleanUrl
          ) {
            return prev;
          }
          return {
            ...prev,
            preferences: {
              ...prev.preferences,
              default_drive_folder: {
                id: cleanId,
                name: cleanName,
                ...(cleanUrl ? { url: cleanUrl } : {}),
                updatedAt: nowIso,
              },
            },
          };
        });
      }
    },
    [setDb],
  );

  const applyRestoredDatabaseForScope = useCallback(
    (
      scope: string,
      nextDb: StudyDatabase,
      cloudTimestamp?: string,
    ) => {
      let sanitizedDb = applyTombstonesToMergedDatabase(
        normalizeAndMergeDatabase(nextDb),
        scope,
      );
      const accountHint =
        googleUserRef.current?.email ||
        googleUserRef.current?.uid ||
        getGasSession()?.username ||
        undefined;
      const localPref = getPreferredStudyFolder(accountHint);
      const dbPrefFolder = sanitizedDb.preferences?.default_drive_folder;
      const localPrefMs = Date.parse(localPref.updatedAt || '') || 0;
      const dbPrefMs = Date.parse(dbPrefFolder?.updatedAt || '') || 0;

      if (dbPrefFolder && (dbPrefFolder.id || dbPrefFolder.name)) {
        const shouldAdoptDbFolder =
          !localPref.id ||
          (Boolean(dbPrefFolder.id) && dbPrefMs >= localPrefMs);
        if (shouldAdoptDbFolder) {
          associateAccountDefaultDriveFolder(dbPrefFolder, { skipDbUpdate: true });
        } else if (localPref.id) {
          sanitizedDb = {
            ...sanitizedDb,
            preferences: {
              ...sanitizedDb.preferences,
              default_drive_folder: {
                id: localPref.id,
                name: localPref.name,
                ...(localPref.url ? { url: localPref.url } : {}),
                updatedAt: localPref.updatedAt || new Date().toISOString(),
              },
            },
          };
        }
      } else if (localPref.id) {
        sanitizedDb = {
          ...sanitizedDb,
          preferences: {
            ...sanitizedDb.preferences,
            default_drive_folder: {
              id: localPref.id,
              name: localPref.name,
              ...(localPref.url ? { url: localPref.url } : {}),
              updatedAt: localPref.updatedAt || new Date().toISOString(),
            },
          },
        };
      }

      const nextHash = computeDatabaseContentHash(sanitizedDb);
      isRestoringRef.current = true;
      skipPersistDbRef.current = sanitizedDb;
      lastPersistedDbRef.current = sanitizedDb;
      lastPersistedDbHashRef.current = nextHash;
      setDb(sanitizedDb);
      dbRef.current = sanitizedDb;
      window.setTimeout(() => {
        isRestoringRef.current = false;
      }, 80);
      const serialized = JSON.stringify(sanitizedDb);
      const ts = cloudTimestamp || new Date().toISOString();
      const hasDrivePending =
        getPendingDriveDeletes(scope).length > 0 ||
        (scope !== 'offline_guest' && getPendingDriveDeletes('offline_guest').length > 0) ||
        (driveConnectedRef.current && lastCloudHashRef.current !== nextHash);
      persistLocalDatabaseForScope(scope, serialized, ts, {
        lastCloudSyncAt: ts,
        lastLocalEditAt: ts,
        hasPendingCloudSync: hasDrivePending,
      });
      setLastCloudSyncAt(ts);
      pendingCloudSyncRef.current = hasDrivePending;
      setHasPendingCloudChanges(hasDrivePending);
    },
    [associateAccountDefaultDriveFolder, setDb],
  );

  const syncAccountWithDriveOnAuth = useCallback(
    async (user: User, token: string, scope: string, hadLocalDbBeforeLoad: boolean) => {
      if (!token) {
        setDriveTokenReady(false);
        return;
      }
      setDriveTokenReady(true);

      if (activeCloudSyncPromiseRef.current) {
        return activeCloudSyncPromiseRef.current;
      }

      const task = (async () => {
        setIsSyncingDrive(true);
        try {
          const dbAtSyncStart = dbRef.current;
          const localDbFolderPref = dbAtSyncStart.preferences?.default_drive_folder;
          const localAccountPref = getPreferredStudyFolder(user.email || user.uid);

          const candidateFolderPrefs = [localDbFolderPref, localAccountPref].filter(
            (p): p is { id: string; name: string; url?: string; updatedAt?: string } => Boolean(p?.id),
          );
          if (candidateFolderPrefs.length > 0) {
            candidateFolderPrefs.sort(
              (a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0),
            );
            const winningFolder = candidateFolderPrefs[0];
            if (winningFolder.id !== localAccountPref.id) {
              setPreferredStudyFolder(winningFolder, user.email || user.uid);
            }
          }

          const folder = await getOrCreateStudyFolder(token);
          const resolvedFolderName = folder.name || getPreferredStudyFolder(user.email || user.uid).name;
          rememberKnownStudyDriveFolderName(resolvedFolderName);
          associateAccountDefaultDriveFolder({
            id: folder.id,
            name: resolvedFolderName,
            url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
          });

          const preSyncMeta = loadSyncMeta(scope);
          const skipSubfolderEnsure = preSyncMeta.lastSubfoldersSyncedFolderId === folder.id;

          const folderWritable = await verifyDriveFolderWritable(folder.id, token).catch(() => false);
          const hasQueuedDriveDeletesPre =
            getPendingDriveDeletes(scope).length > 0 ||
            (scope !== 'offline_guest' && getPendingDriveDeletes('offline_guest').length > 0);
          const flushedPreDeletedCount = 0;
          const flushedPreDeletedNames: string[] = [];

          // Fetch Drive file/backup metadata and IndexedDB snapshots
          const isGasAutoSync = isGasSessionActive();
          const [, fetchedBackupsList, driveFiles, idbSnap, idbMeta, guestIdbSnap, guestIdbMeta] = await Promise.all([
            skipSubfolderEnsure || !folderWritable || isGasAutoSync
              ? Promise.resolve({})
              : syncStudySubFoldersInDrive(folder.id, token).catch(() => ({})),
            isGasAutoSync
              ? Promise.resolve([] as DriveFileInfo[])
              : listDatabaseBackupsFromDrive(token, { activeFolderId: folder.id }),
            listAllStudyFilesInDrive(token),
            loadScopedDatabaseJson(scope),
            loadScopedSyncMeta<ScopeSyncMeta>(scope),
            loadScopedDatabaseJson('offline_guest'),
            loadScopedSyncMeta<ScopeSyncMeta>('offline_guest'),
          ]);
          const backupsList = isGasAutoSync
            ? driveFiles.filter(
                (df) =>
                  df.subfolderName === 'Backups' ||
                  df.name.startsWith('backup_central_estudos') ||
                  df.name.startsWith('backup_incremental_central_estudos') ||
                  df.name === CLOUD_SYNC_FILENAME,
              )
            : fetchedBackupsList;

          let currentDb = applyTombstonesToMergedDatabase(dbRef.current, scope);
          let hasLocalAny = hadLocalDbBeforeLoad || Boolean(idbSnap?.byteLength);
          if (idbSnap?.raw && shouldPreferIdbSnapshot(scope, idbSnap, hadLocalDbBeforeLoad)) {
            try {
              currentDb = applyTombstonesToMergedDatabase(
                normalizeAndMergeDatabase(JSON.parse(idbSnap.raw)),
                scope,
              );
              hasLocalAny = true;
            } catch {
              // ignore malformed idb snapshot
            }
          }

          const idbEditMs = Math.max(
            Date.parse(preSyncMeta.lastLocalEditAt || '') || 0,
            Date.parse(idbMeta?.lastLocalEditAt || '') || 0,
            Date.parse(idbSnap?.updatedAt || '') || 0,
          );

          // Recover edits made while in offline_guest EVEN ACROSS BROWSER RELOADS (check memory ref, IDB, and localStorage)
          const guestPending = pendingGuestDbRef.current;
          pendingGuestDbRef.current = null;
          const guestLsMeta = loadSyncMeta('offline_guest');
          const persistedGuestEditMs = Math.max(
            Date.parse(guestLsMeta.lastLocalEditAt || '') || 0,
            Date.parse(guestIdbMeta?.lastLocalEditAt || '') || 0,
            Date.parse(guestIdbSnap?.updatedAt || '') || 0,
          );
          let persistedGuestDb: StudyDatabase | null = null;
          if (guestIdbSnap?.raw && shouldPreferIdbSnapshot('offline_guest', guestIdbSnap, true)) {
            try {
              persistedGuestDb = applyTombstonesToMergedDatabase(
                normalizeAndMergeDatabase(JSON.parse(guestIdbSnap.raw)),
                'offline_guest',
              );
            } catch {
              persistedGuestDb = null;
            }
          } else {
            try {
              if (localStorage.getItem(getDbStorageKey('offline_guest'))) {
                persistedGuestDb = loadStoredDatabase('offline_guest');
              }
            } catch {
              persistedGuestDb = null;
            }
          }

          const candidateGuestDb =
            guestPending && (!persistedGuestDb || guestPending.updatedAtMs >= persistedGuestEditMs)
              ? guestPending.db
              : persistedGuestDb;
          const candidateGuestMs = Math.max(guestPending?.updatedAtMs || 0, persistedGuestEditMs);
          const lastMergedGuestMs =
            Math.max(
              Date.parse(preSyncMeta.lastMergedGuestEditAt || '') || 0,
              Date.parse(idbMeta?.lastMergedGuestEditAt || '') || 0,
            ) || 0;

          let rescuedGuestEdits = false;
          if (
            candidateGuestDb &&
            !isUntouchedSeedDatabase(candidateGuestDb) &&
            (Boolean(guestPending) || candidateGuestMs > lastMergedGuestMs + 500 || isUntouchedSeedDatabase(currentDb))
          ) {
            if (!hasLocalAny || isUntouchedSeedDatabase(currentDb)) {
              currentDb = applyTombstonesToMergedDatabase(candidateGuestDb, 'offline_guest');
            } else {
              const prevAccountDbBeforeGuest = currentDb;
              const guestDelta = buildIncrementalDatabaseBackup(createInitialDatabase(), candidateGuestDb, {
                updatedAt: new Date(candidateGuestMs || Date.now()).toISOString(),
                userEmail: user.email || undefined,
              });
              if (guestDelta.hasChanges) {
                const additiveGuestEnvelope = {
                  ...guestDelta.envelope,
                  delta: Object.fromEntries(
                    Object.entries(guestDelta.envelope.delta).map(([sec, val]) => {
                      if (val && typeof val === 'object' && !Array.isArray(val)) {
                        const copy = { ...(val as Record<string, any>) };
                        delete copy.deletedIds;
                        delete copy.deletedKeys;
                        return [sec, copy];
                      }
                      return [sec, val];
                    }),
                  ),
                };
                currentDb = applyIncrementalDeltaToDatabase(currentDb, additiveGuestEnvelope, { additiveMerge: true });
                currentDb = reconcileCompletedAndArchivedItems(
                  currentDb,
                  candidateGuestDb,
                  prevAccountDbBeforeGuest,
                );
              }
              currentDb = applyTombstonesToMergedDatabase(
                {
                  ...currentDb,
                  deletedTombstones: mergeTombstoneMaps(
                    currentDb.deletedTombstones,
                    candidateGuestDb.deletedTombstones,
                  ),
                },
                'offline_guest',
              );
            }
            hasLocalAny = true;
            rescuedGuestEdits = true;
            if (currentDb.deletedTombstones) {
              recordDeletedTombstones(scope, [], currentDb.deletedTombstones);
            }
            const guestQueuedDeletes = getPendingDriveDeletes('offline_guest');
            for (const qd of guestQueuedDeletes) {
              queuePendingDriveDeletes(scope, qd);
            }
            clearPendingDriveDeletes('offline_guest');
            clearDeletedTombstones('offline_guest');
            persistLocalDatabaseForScope(
              'offline_guest',
              JSON.stringify(createInitialDatabase()),
              new Date().toISOString(),
              { lastLocalEditAt: '', hasPendingCloudSync: false },
            );
            const mergedIso = new Date(Math.max(candidateGuestMs, Date.now())).toISOString();
            saveSyncMeta(scope, {
              lastMergedGuestEditAt: mergedIso,
              lastLocalEditAt: mergedIso,
              hasPendingCloudSync: true,
            });
          }

          // Update sync baseline after hydrating from IndexedDB/guest so IDB hydration is never mistaken for a concurrent edit
          const hydratedBaselineDb = currentDb;
          const hydratedBaselineHash = computeDatabaseContentHash(hydratedBaselineDb);

          const scopedBackups = selectScopedBackupList(backupsList, { activeFolderId: folder.id });
          const backupSigMap = buildDriveSignatureMap(scopedBackups);
          const backupsSig = serializeDriveSignatureMap(backupSigMap);
          const filesSigMap = buildDriveSignatureMap(driveFiles);
          const filesSig = serializeDriveSignatureMap(filesSigMap);
          const currentDbHash = hydratedBaselineHash;
          const metaAfterLoad = loadSyncMeta(scope);

          const persistCacheState = (
            hashToSave: string,
            backupHashToSave: string,
            extra?: Partial<ScopeSyncMeta>,
          ) => {
            const verifiedAt = new Date().toISOString();
            saveSyncMeta(scope, {
              lastSyncedFolderId: folder.id,
              lastSubfoldersSyncedFolderId: folder.id,
              cachedBackupSignatureMap: backupSigMap,
              lastCloudBackupSignature: serializeDriveSignatureMap(backupSigMap),
              cachedDriveFilesSignatureMap: filesSigMap,
              lastDriveFilesSignature: serializeDriveSignatureMap(filesSigMap),
              lastCloudContentHash: hashToSave,
              lastBackupContentHash: backupHashToSave,
              lastCacheVerifiedAt: verifiedAt,
              ...extra,
            });
            setLastCacheVerifiedAt(verifiedAt);
          };

          const addUploadedToLocalSigMaps = (saved?: DriveFileInfo | null, isBackup = false) => {
            if (!saved?.id) return;
            const stamp = buildDriveFileStamp(saved);
            filesSigMap[saved.id] = stamp;
            if (isBackup) backupSigMap[saved.id] = stamp;
          };

          const localReadyForCache = hasLocalAny && !isUntouchedSeedDatabase(currentDb);
          const driveBackupsMatchCache =
            metaAfterLoad.lastSyncedFolderId === folder.id &&
            Boolean(metaAfterLoad.lastCloudBackupSignature) &&
            backupsSig === metaAfterLoad.lastCloudBackupSignature;
          const driveFilesMatchCache =
            metaAfterLoad.lastSyncedFolderId === folder.id &&
            Boolean(metaAfterLoad.lastDriveFilesSignature) &&
            filesSig === metaAfterLoad.lastDriveFilesSignature;
          const dbMatchesLastCloud =
            Boolean(metaAfterLoad.lastCloudContentHash) &&
            currentDbHash === metaAfterLoad.lastCloudContentHash;

          const cacheTimestampReport =
            localReadyForCache && driveBackupsMatchCache && driveFilesMatchCache && dbMatchesLastCloud
              ? runDriveTimestampComparison(currentDb, driveFiles, scope, {
                  sourceLabel: 'Comparação de timestamps na verificação do Drive',
                })
              : null;

          if (
            !rescuedGuestEdits &&
            !hasQueuedDriveDeletesPre &&
            folderWritable &&
            localReadyForCache &&
            driveBackupsMatchCache &&
            driveFilesMatchCache &&
            dbMatchesLastCloud &&
            !hasPersistedPendingSync(metaAfterLoad) &&
            cacheTimestampReport &&
            cacheTimestampReport.localNewer.length === 0 &&
            cacheTimestampReport.driveNewer.length === 0
          ) {
            if (currentDb !== dbRef.current) {
              applyRestoredDatabaseForScope(scope, currentDb, metaAfterLoad.lastCloudSyncAt);
            }
            setDrivePermissionNeedsPicker(null);
            lastCloudDbRef.current = currentDb;
            lastCloudHashRef.current = currentDbHash;
            lastBackupDbRef.current = currentDb;
            lastBackupHashRef.current = metaAfterLoad.lastBackupContentHash || currentDbHash;
            lastBackupIsoRef.current = metaAfterLoad.lastCloudSyncAt || null;
            pendingCloudSyncRef.current = false;
            setHasPendingCloudChanges(false);

            const verifiedAt = new Date().toISOString();
            saveSyncMeta(scope, {
              lastSubfoldersSyncedFolderId: folder.id,
              lastCacheVerifiedAt: verifiedAt,
              hasPendingCloudSync: false,
            });
            setLastCacheVerifiedAt(verifiedAt);
            syncedScopeOnceRef.current = scope;
            lastAutoBackupAtRef.current = Date.now();
            recordSyncActivity({
              category: 'drive-sync',
              operation: 'Verificação inicial do Google Drive',
              status: cacheTimestampReport.deletedConflicts.length > 0 ? 'warning' : 'success',
              message:
                cacheTimestampReport.deletedConflicts.length > 0
                  ? `Cache validado; ${cacheTimestampReport.deletedConflicts.length} arquivo(s) excluído(s) localmente encontrado(s) no Drive.`
                  : 'Cache do navegador validado sem alterações no Drive — restauração dispensada.',
            });
            toast('Cache do navegador atualizado — restauração dispensada (nenhuma alteração no Drive).');
            return;
          }

          const latestCloud = await downloadLatestCloudSync(token, {
            activeFolderId: folder.id,
            expectedEmail: user.email || undefined,
            prefetchedBackups: backupsList,
          });

          const hasCloudData = Boolean(latestCloud?.payload || latestCloud?.incrementalDeltas?.length);
          const blockedBackupsCount = latestCloud?.permissionBlockedCount || 0;

          if (!hasCloudData && (blockedBackupsCount > 0 || !folderWritable)) {
            const targetFolderId = latestCloud?.permissionBlockedFolderId || folder.id;
            setDrivePermissionNeedsPicker({
              folderId: targetFolderId,
              folderName: resolvedFolderName,
              count: Math.max(1, blockedBackupsCount),
            });
            if (currentDb !== dbRef.current && hasLocalAny) {
              isRestoringRef.current = true;
              skipPersistDbRef.current = currentDb;
              lastPersistedDbRef.current = currentDb;
              setDb(currentDb);
              dbRef.current = currentDb;
              window.setTimeout(() => {
                isRestoringRef.current = false;
              }, 80);
              persistLocalDatabaseForScope(scope, JSON.stringify(currentDb), new Date().toISOString(), {
                hasPendingCloudSync: !isUntouchedSeedDatabase(currentDb),
              });
            }
            if (hasPersistedPendingSync(metaAfterLoad) || !isUntouchedSeedDatabase(currentDb)) {
              pendingCloudSyncRef.current = true;
              setHasPendingCloudChanges(true);
            }
            toast(
              blockedBackupsCount > 0
                ? `Encontramos ${blockedBackupsCount} backup(s) na pasta "${resolvedFolderName}" do Drive, mas o Google exige autorização via Seletor para liberar o acesso após a atualização de login.`
                : `A pasta "${resolvedFolderName}" exige autorização via Seletor do Google Drive para liberar a gravação. Use "Backup e Restauração" para selecioná-la.`,
              true,
            );
            return;
          }

          if (!folderWritable) {
            setDrivePermissionNeedsPicker({
              folderId: folder.id,
              folderName: resolvedFolderName,
              count: Math.max(1, blockedBackupsCount),
            });
          } else {
            setDrivePermissionNeedsPicker(null);
          }

          if (latestCloud && hasCloudData) {
            let cloudDb = latestCloud.payload
              ? normalizeAndMergeDatabase(latestCloud.payload)
              : currentDb;
            if (latestCloud.incrementalDeltas?.length) {
              for (const incDelta of latestCloud.incrementalDeltas) {
                cloudDb = applyIncrementalDeltaToDatabase(cloudDb, incDelta);
              }
            }
            const latestDeltaIso =
              latestCloud.incrementalDeltas?.[latestCloud.incrementalDeltas.length - 1]?.updatedAt;
            const cloudIso =
              latestDeltaIso ||
              latestCloud.payload?.updatedAt ||
              latestCloud.payload?.exportedAt ||
              latestCloud.file.modifiedTime ||
              latestCloud.file.createdTime ||
              new Date().toISOString();

            const syncMeta = loadSyncMeta(scope);
            const knownSyncedFileIds = new Set(Object.keys(metaAfterLoad.cachedDriveFilesSignatureMap || {}));
            const localEditMs = Math.max(
              Date.parse(syncMeta.lastLocalEditAt || '') || 0,
              Date.parse(idbMeta?.lastLocalEditAt || '') || 0,
              Date.parse(idbSnap?.updatedAt || '') || 0,
              rescuedGuestEdits ? candidateGuestMs : 0,
            );
            const cloudMs = Date.parse(cloudIso) || 0;
            const localHash = currentDbHash;
            const cloudHash = computeDatabaseContentHash(cloudDb);
            const hashesDiffer = localHash !== cloudHash;

            const localHasCustom = hasLocalAny && !isUntouchedSeedDatabase(currentDb);
            const localIsNewer = localHasCustom && hashesDiffer && localEditMs > cloudMs + 2000;
            const localHasUnsavedEdge =
              localHasCustom &&
              hashesDiffer &&
              hasMoreCustomEntities(currentDb, cloudDb) &&
              !(cloudMs > localEditMs + 2000);
            const cloudOutsideActiveFolder =
              localHasCustom && hashesDiffer && !latestCloud.fromActiveFolder;

            const sameSessionRenewal =
              syncedScopeOnceRef.current === scope &&
              pendingCloudSyncRef.current &&
              localIsNewer &&
              !cloudOutsideActiveFolder;

            const lastCloudSyncMs = Math.max(
              Date.parse(syncMeta.lastCloudSyncAt || '') || 0,
              Date.parse(idbMeta?.lastCloudSyncAt || '') || 0,
            );
            const hasPersistedUnsyncedLocal =
              hasPersistedPendingSync(syncMeta) ||
              Boolean(pendingCloudSyncRef.current) ||
              rescuedGuestEdits;
            const localTombstoneMap = mergeTombstoneMaps(currentDb.deletedTombstones);
            const cloudTombstoneMap = mergeTombstoneMaps(cloudDb.deletedTombstones);
            const localHasNewerDeletes =
              flushedPreDeletedCount > 0 ||
              getPendingDriveDeletes(scope).length > 0 ||
              Object.entries(localTombstoneMap).some(([k, ts]) => ts > (cloudTombstoneMap[k] || 0));
            const offlineLocalContinuation =
              localIsNewer &&
              !cloudOutsideActiveFolder &&
              (syncMeta.lastSyncedFolderId === folder.id || hasPersistedUnsyncedLocal) &&
              (lastCloudSyncMs > 0 || rescuedGuestEdits) &&
              localEditMs > Math.max(lastCloudSyncMs, cloudMs) + 1500 &&
              (!hasMoreCustomEntities(cloudDb, currentDb) || localHasNewerDeletes);

            let useCloudSnapshot = true;
            if (
              sameSessionRenewal ||
              offlineLocalContinuation ||
              (localIsNewer && !cloudOutsideActiveFolder) ||
              (syncedScopeOnceRef.current === scope && pendingCloudSyncRef.current && hashesDiffer && !cloudOutsideActiveFolder && localEditMs >= cloudMs - 1500) ||
              (hasPersistedUnsyncedLocal && localHasNewerDeletes && !cloudOutsideActiveFolder && localEditMs >= cloudMs - 1500)
            ) {
              useCloudSnapshot = false;
              let baseLocalDb = currentDb;
              if (computeDatabaseContentHash(dbRef.current) !== hydratedBaselineHash && dbRef.current !== dbAtSyncStart) {
                const concurrentDelta = buildIncrementalDatabaseBackup(hydratedBaselineDb, dbRef.current, {
                  updatedAt: new Date().toISOString(),
                  userEmail: user.email || undefined,
                });
                if (concurrentDelta.hasChanges) {
                  baseLocalDb = applyIncrementalDeltaToDatabase(baseLocalDb, concurrentDelta.envelope, { additiveMerge: true });
                }
              }
              const {
                updatedDb,
                filesRestored,
                orphansImported,
                healedLawsCount,
                permissionBlockedCount,
                skippedTombstonesCount,
                fileEvents,
              } =
                await restoreFilesAndOrphansFromDriveList(
                  baseLocalDb,
                  driveFiles,
                  token,
                  scope,
                  isUntouchedSeedDatabase(baseLocalDb)
                    ? (current, total, label) => setRestoreProgress({ current, total, label })
                    : undefined,
                  {
                    importFromAnyFolder: false,
                    lazyBinaryBlobs: true,
                    knownSyncedFileIds,
                    dbBaselineMs: Math.max(idbEditMs, cloudMs),
                  },
                );
              if (permissionBlockedCount > 0) {
                setDrivePermissionNeedsPicker({
                  folderId: folder.id,
                  folderName: resolvedFolderName,
                  count: permissionBlockedCount,
                });
              }
              const { uploadedCount: filesUploaded, uploadedFiles } = await syncMissingReferencedBlobsToDrive(
                updatedDb,
                driveFiles,
                token,
                scope,
              );
              uploadedFiles.forEach((uf) => addUploadedToLocalSigMaps(uf, false));
              setRestoreProgress(null);
              runDriveTimestampComparison(updatedDb, [...driveFiles, ...uploadedFiles], scope);
              applyRestoredDatabaseForScope(scope, updatedDb);
              const nowIso = new Date().toISOString();
              const updatedHash = computeDatabaseContentHash(updatedDb);
              if (folderWritable && (updatedHash !== cloudHash || healedLawsCount > 0)) {
                const savedSync = await saveCloudSyncSnapshot(
                  {
                    version: 2,
                    app: 'Central de Estudos',
                    updatedAt: nowIso,
                    contentHash: updatedHash,
                    userEmail: user.email || undefined,
                    data: updatedDb,
                  },
                  token,
                  { force: true },
                );
                addUploadedToLocalSigMaps(savedSync, true);
                setLastCloudSyncAt(nowIso);
              }
              persistCacheState(updatedHash, cloudHash, {
                lastCloudSyncAt: folderWritable ? nowIso : syncMeta.lastCloudSyncAt,
                lastLocalEditAt: nowIso,
                hasPendingCloudSync: !folderWritable,
              });
              lastCloudDbRef.current = updatedDb;
              lastCloudHashRef.current = updatedHash;
              lastBackupDbRef.current = cloudDb;
              lastBackupHashRef.current = cloudHash;
              lastBackupIsoRef.current = cloudIso;
              pendingCloudSyncRef.current = !folderWritable;
              setHasPendingCloudChanges(!folderWritable);
              const totalFiles = filesRestored + orphansImported + filesUploaded;
              const affectedFiles: SyncAffectedFile[] = [
                ...flushedPreDeletedNames.map((name) => ({ name, action: 'trashed' as const })),
                ...fileEvents,
                ...uploadedFiles.map((uf) => ({
                  name: uf.name,
                  action: 'uploaded' as const,
                  driveFileId: uf.id,
                  syncOrigin: uf.syncOrigin || 'internal',
                })),
              ];
              recordSyncActivity({
                category: 'drive-sync',
                operation: 'Sincronização inicial do Google Drive (dados locais preservados)',
                status: permissionBlockedCount > 0 ? 'warning' : 'success',
                message: `Estado local mais recente mantido. ${flushedPreDeletedCount} excluído(s) na lixeira, ${orphansImported} órfão(s) importado(s), ${skippedTombstonesCount} ignorado(s) por exclusão, ${filesUploaded} enviado(s).`,
                affectedFiles,
                stats: {
                  trashed: flushedPreDeletedCount,
                  restored: filesRestored,
                  imported: orphansImported,
                  uploaded: filesUploaded,
                  skippedTombstones: skippedTombstonesCount,
                },
              });
              toast(
                totalFiles > 0
                  ? `Dados mantidos e pastas do Drive sincronizadas (${totalFiles} arquivo(s)).`
                  : 'Dados sincronizados instantaneamente com o Google Drive.',
              );
            }

            if (useCloudSnapshot) {
              // Non-destructive safeguard: merge unsynced local additions/edits made after last sync instead of discarding them
              let baseMergedCloudDb = applyTombstonesToMergedDatabase(
                {
                  ...cloudDb,
                  deletedTombstones: mergeTombstoneMaps(
                    cloudDb.deletedTombstones,
                    currentDb.deletedTombstones,
                  ),
                },
                scope,
              );
              let preservedLocalEdits = false;
              const localEditedAfterLastSync =
                localHasCustom &&
                hashesDiffer &&
                (rescuedGuestEdits ||
                  localIsNewer ||
                  (hasPersistedUnsyncedLocal &&
                    localEditMs >= cloudMs - 1500 &&
                    (localHasNewerDeletes || localHasUnsavedEdge || (lastCloudSyncMs > 0 && localEditMs > lastCloudSyncMs + 1500))));
              if (localEditedAfterLastSync) {
                const localDiff = buildIncrementalDatabaseBackup(baseMergedCloudDb, currentDb, {
                  updatedAt: new Date(localEditMs || Date.now()).toISOString(),
                  userEmail: user.email || undefined,
                });
                if (localDiff.hasChanges) {
                  const additiveLocalEnvelope = {
                    ...localDiff.envelope,
                    delta: Object.fromEntries(
                      Object.entries(localDiff.envelope.delta).map(([sec, val]) => {
                        if (val && typeof val === 'object' && !Array.isArray(val)) {
                          const copy = { ...(val as Record<string, any>) };
                          delete copy.deletedIds;
                          delete copy.deletedKeys;
                          return [sec, copy];
                        }
                        return [sec, val];
                      }),
                    ),
                  };
                  const preMergeCloud = baseMergedCloudDb;
                  baseMergedCloudDb = applyIncrementalDeltaToDatabase(baseMergedCloudDb, additiveLocalEnvelope, { additiveMerge: true });
                  const countSchedTopics = (s?: ScheduleMap) =>
                    WEEKDAYS.reduce((sum, d) => sum + (s?.[d]?.length || 0), 0);
                  const localSchedCount = countSchedTopics(currentDb.schedule);
                  const cloudSchedCount = countSchedTopics(preMergeCloud.schedule);
                  const mergedWeeklySafe: Record<string, WeeklyScheduleFileRecord> = {
                    ...(preMergeCloud.weeklySchedules || {}),
                  };
                  for (const [wk, locRec] of Object.entries(currentDb.weeklySchedules || {})) {
                    const cloudRec = mergedWeeklySafe[wk];
                    if (
                      cloudRec &&
                      countSchedTopics(locRec?.schedule) === 0 &&
                      countSchedTopics(cloudRec?.schedule) > 0 &&
                      Date.now() - lastDeletionMsRef.current > 15_000
                    ) {
                      continue;
                    }
                    mergedWeeklySafe[wk] = locRec;
                  }
                  const preferLocalSchedule =
                    (localEditMs >= cloudMs - 1500 || rescuedGuestEdits) &&
                    !(localSchedCount === 0 && cloudSchedCount > 0 && Date.now() - lastDeletionMsRef.current > 15_000);
                  baseMergedCloudDb = {
                    ...baseMergedCloudDb,
                    ...(preferLocalSchedule
                      ? {
                          schedule: currentDb.schedule,
                          scheduleDayDates: currentDb.scheduleDayDates,
                        }
                      : {}),
                    weeklySchedules: mergedWeeklySafe,
                    deletedTombstones: stripActiveEntityTombstones(
                      mergeTombstoneMaps(
                        baseMergedCloudDb.deletedTombstones,
                        currentDb.deletedTombstones,
                      ),
                      currentDb,
                    ),
                  };
                  baseMergedCloudDb = applyTombstonesToMergedDatabase(baseMergedCloudDb, scope);
                  baseMergedCloudDb = reconcileCompletedAndArchivedItems(
                    baseMergedCloudDb,
                    currentDb,
                    preMergeCloud,
                  );
                  preservedLocalEdits = true;
                }
              }

              const {
                updatedDb,
                filesRestored,
                orphansImported,
                healedLawsCount,
                permissionBlockedCount,
                skippedTombstonesCount,
                fileEvents,
              } =
                await restoreFilesAndOrphansFromDriveList(
                  baseMergedCloudDb,
                  driveFiles,
                  token,
                  scope,
                  isUntouchedSeedDatabase(baseMergedCloudDb)
                    ? (current, total, label) => setRestoreProgress({ current, total, label })
                    : undefined,
                  {
                    importFromAnyFolder: false,
                    lazyBinaryBlobs: true,
                    knownSyncedFileIds,
                    dbBaselineMs: Math.max(cloudMs, idbEditMs),
                  },
                );
              if (permissionBlockedCount > 0) {
                setDrivePermissionNeedsPicker({
                  folderId: folder.id,
                  folderName: resolvedFolderName,
                  count: permissionBlockedCount,
                });
              }
              let finalUpdatedDb = updatedDb;
              let hadConcurrentLocalEdits = preservedLocalEdits;
              if (computeDatabaseContentHash(dbRef.current) !== hydratedBaselineHash && dbRef.current !== dbAtSyncStart) {
                const concurrentDelta = buildIncrementalDatabaseBackup(hydratedBaselineDb, dbRef.current, {
                  updatedAt: new Date().toISOString(),
                  userEmail: user.email || undefined,
                });
                if (concurrentDelta.hasChanges) {
                  finalUpdatedDb = applyIncrementalDeltaToDatabase(finalUpdatedDb, concurrentDelta.envelope, { additiveMerge: true });
                  hadConcurrentLocalEdits = true;
                }
              }
              const { uploadedCount: filesUploaded, uploadedFiles } = await syncMissingReferencedBlobsToDrive(
                finalUpdatedDb,
                driveFiles,
                token,
                scope,
              );
              uploadedFiles.forEach((uf) => addUploadedToLocalSigMaps(uf, false));
              setRestoreProgress(null);
              runDriveTimestampComparison(finalUpdatedDb, [...driveFiles, ...uploadedFiles], scope);
              applyRestoredDatabaseForScope(
                scope,
                finalUpdatedDb,
                hadConcurrentLocalEdits ? undefined : cloudIso,
              );
              const updatedHash = computeDatabaseContentHash(finalUpdatedDb);
              let driveSnapshotUploadFailed = false;
              const cloudNeedsSnapshotPush =
                orphansImported > 0 ||
                healedLawsCount > 0 ||
                hadConcurrentLocalEdits ||
                updatedHash !== cloudHash;

              if (folderWritable && cloudNeedsSnapshotPush) {
                try {
                  const savedSync = await saveCloudSyncSnapshot(
                    {
                      version: 2,
                      app: 'Central de Estudos',
                      updatedAt: new Date().toISOString(),
                      contentHash: updatedHash,
                      userEmail: user.email || undefined,
                      data: finalUpdatedDb,
                    },
                    token,
                    updatedHash !== cloudHash ? { force: true } : undefined,
                  );
                  addUploadedToLocalSigMaps(savedSync, true);
                } catch {
                  driveSnapshotUploadFailed = true;
                }
              }

              const keepPendingDrive =
                (!folderWritable && (hadConcurrentLocalEdits || updatedHash !== cloudHash)) ||
                driveSnapshotUploadFailed;
              lastCloudDbRef.current = driveSnapshotUploadFailed ? cloudDb : finalUpdatedDb;
              lastCloudHashRef.current = driveSnapshotUploadFailed ? cloudHash : updatedHash;
              lastBackupDbRef.current = finalUpdatedDb;
              lastBackupHashRef.current = updatedHash;
              lastBackupIsoRef.current = cloudIso;
              persistCacheState(updatedHash, updatedHash, { hasPendingCloudSync: keepPendingDrive });
              if (keepPendingDrive) {
                pendingCloudSyncRef.current = true;
                setHasPendingCloudChanges(true);
              }

              const totalFiles = filesRestored + orphansImported + filesUploaded;
              const incCount = latestCloud.incrementalDeltas?.length || 0;
              const affectedFiles: SyncAffectedFile[] = [
                ...flushedPreDeletedNames.map((name) => ({ name, action: 'trashed' as const })),
                ...fileEvents,
                ...uploadedFiles.map((uf) => ({
                  name: uf.name,
                  action: 'uploaded' as const,
                  driveFileId: uf.id,
                  syncOrigin: uf.syncOrigin || 'internal',
                })),
              ];
              recordSyncActivity({
                category: 'drive-sync',
                operation: 'Sincronização inicial do Google Drive',
                status: permissionBlockedCount > 0 ? 'warning' : 'success',
                message: `${preservedLocalEdits ? 'Snapshot do Drive mesclado com edições locais' : 'Snapshot do Drive aplicado'}${incCount > 0 ? ` (+${incCount} incremento(s))` : ''}. ${flushedPreDeletedCount} excluído(s), ${orphansImported} órfão(s) importado(s), ${skippedTombstonesCount} ignorado(s) por exclusão, ${filesUploaded} enviado(s).`,
                affectedFiles,
                stats: {
                  trashed: flushedPreDeletedCount,
                  restored: filesRestored,
                  imported: orphansImported,
                  uploaded: filesUploaded,
                  skippedTombstones: skippedTombstonesCount,
                },
              });
              toast(
                preservedLocalEdits
                  ? `Dados sincronizados e suas alterações mais recentes foram preservadas!`
                  : totalFiles > 0
                  ? incCount > 0
                    ? `Banco de dados (+${incCount} incremento(s)) e ${totalFiles} arquivo(s) sincronizados instantaneamente!`
                    : `Banco de dados e ${totalFiles} arquivo(s) sincronizados instantaneamente!`
                  : `Banco de dados carregado instantaneamente!`,
              );
            }
          } else {
            // No JSON backup in Drive yet -> sync all Drive study folders and upload any local files
            const knownSyncedFileIds = new Set(Object.keys(metaAfterLoad.cachedDriveFilesSignatureMap || {}));
            let baseLocalDb = currentDb;
            if (computeDatabaseContentHash(dbRef.current) !== hydratedBaselineHash && dbRef.current !== dbAtSyncStart) {
              const concurrentDelta = buildIncrementalDatabaseBackup(hydratedBaselineDb, dbRef.current, {
                updatedAt: new Date().toISOString(),
                userEmail: user.email || undefined,
              });
              if (concurrentDelta.hasChanges) {
                baseLocalDb = applyIncrementalDeltaToDatabase(baseLocalDb, concurrentDelta.envelope, { additiveMerge: true });
              }
            }
            const {
              updatedDb,
              filesRestored,
              orphansImported,
              healedLawsCount,
              permissionBlockedCount,
              skippedTombstonesCount,
              fileEvents,
            } =
              await restoreFilesAndOrphansFromDriveList(
                baseLocalDb,
                driveFiles,
                token,
                scope,
                isUntouchedSeedDatabase(baseLocalDb)
                  ? (current, total, label) => setRestoreProgress({ current, total, label })
                  : undefined,
                { importFromAnyFolder: false, lazyBinaryBlobs: true, knownSyncedFileIds },
              );
            if (permissionBlockedCount > 0) {
              setDrivePermissionNeedsPicker({
                folderId: folder.id,
                folderName: resolvedFolderName,
                count: permissionBlockedCount,
              });
            }
            const { uploadedCount: filesUploaded, uploadedFiles } = await syncMissingReferencedBlobsToDrive(
              updatedDb,
              driveFiles,
              token,
              scope,
            );
            uploadedFiles.forEach((uf) => addUploadedToLocalSigMaps(uf, false));
            setRestoreProgress(null);
            runDriveTimestampComparison(updatedDb, [...driveFiles, ...uploadedFiles], scope);
            if (orphansImported > 0 || healedLawsCount > 0 || rescuedGuestEdits) {
              applyRestoredDatabaseForScope(scope, updatedDb);
              if (orphansImported > 0) {
                toast(`${orphansImported} arquivo(s) recuperado(s) das pastas do Google Drive!`);
              }
            } else if (filesRestored + filesUploaded > 0) {
              toast(`${filesRestored + filesUploaded} arquivo(s) sincronizado(s) com o Google Drive.`);
            }

            const nowIso = new Date().toISOString();
            const updatedHash = computeDatabaseContentHash(updatedDb);
            const initialPayload = {
              version: 2,
              app: 'Central de Estudos',
              updatedAt: nowIso,
              contentHash: updatedHash,
              userEmail: user.email || undefined,
              data: updatedDb,
            };
            const [savedSyncFile, savedInitialBackupFile] = await Promise.all([
              saveCloudSyncSnapshot(initialPayload, token),
              saveDatabaseBackupToDrive(initialPayload, token),
            ]);
            addUploadedToLocalSigMaps(savedSyncFile, true);
            addUploadedToLocalSigMaps(savedInitialBackupFile, true);

            lastCloudDbRef.current = updatedDb;
            lastCloudHashRef.current = updatedHash;
            lastBackupDbRef.current = updatedDb;
            lastBackupHashRef.current = updatedHash;
            lastBackupIsoRef.current = nowIso;
            persistCacheState(updatedHash, updatedHash, { lastCloudSyncAt: nowIso, hasPendingCloudSync: false });
            setLastCloudSyncAt(nowIso);
            pendingCloudSyncRef.current = false;
            setHasPendingCloudChanges(false);

            recordSyncActivity({
              category: 'drive-sync',
              operation: 'Primeira sincronização com pasta do Google Drive',
              status: permissionBlockedCount > 0 ? 'warning' : 'success',
              message: `Snapshot inicial criado na pasta "${resolvedFolderName}". ${orphansImported} órfão(s) importado(s), ${skippedTombstonesCount} ignorado(s) por exclusão, ${filesUploaded} enviado(s).`,
              affectedFiles: [
                ...flushedPreDeletedNames.map((name) => ({ name, action: 'trashed' as const })),
                ...fileEvents,
                ...uploadedFiles.map((uf) => ({
                  name: uf.name,
                  action: 'uploaded' as const,
                  driveFileId: uf.id,
                  syncOrigin: uf.syncOrigin || 'internal',
                })),
                ...(savedSyncFile
                  ? [
                      {
                        name: savedSyncFile.name,
                        action: 'uploaded' as const,
                        driveFileId: savedSyncFile.id,
                        syncOrigin: savedSyncFile.syncOrigin || 'internal',
                      },
                    ]
                  : []),
                ...(savedInitialBackupFile
                  ? [
                      {
                        name: savedInitialBackupFile.name,
                        action: 'uploaded' as const,
                        driveFileId: savedInitialBackupFile.id,
                        syncOrigin: savedInitialBackupFile.syncOrigin || 'internal',
                      },
                    ]
                  : []),
              ],
              stats: {
                trashed: flushedPreDeletedCount,
                restored: filesRestored,
                imported: orphansImported,
                uploaded: filesUploaded,
                skippedTombstones: skippedTombstonesCount,
              },
            });
          }

          lastAutoBackupAtRef.current = Date.now();
          syncedScopeOnceRef.current = scope;
        } catch (err: any) {
          console.warn('[Cloud Sync Auth] Falha na verificação inicial do Drive:', err);
          const msg = String(err?.message || '');
          const isTokenErr = msg.includes('TOKEN_EXPIRED');
          const isPickerErr = msg.includes('DRIVE_FOLDER_PERMISSION');
          recordSyncActivity({
            category: 'drive-sync',
            operation: 'Falha na sincronização inicial do Google Drive',
            status: 'error',
            errorCode: isTokenErr
              ? 'oauth/drive-token-expired'
              : isPickerErr
                ? 'DRIVE_FOLDER_PERMISSION'
                : undefined,
            message: isTokenErr
              ? 'Sessão OAuth do Google Drive sem permissão ou expirada. Clique em "Reconectar conta Google" para restaurar backups e exclusões na nuvem.'
              : msg || 'Erro desconhecido ao acessar pasta do Google Drive.',
          });
          if (isTokenErr && !isGasSessionActive()) {
            setDriveTokenReady(false);
            toast(
              'Sessão do Google Apps Script encerrada. Faça login novamente com Usuário e Senha para sincronizar.',
              true,
            );
          } else if (isPickerErr) {
            const pref = getPreferredStudyFolder();
            setDrivePermissionNeedsPicker({
              folderId: pref.id || 'root',
              folderName: pref.name || activeDriveFolderNameRef.current || DRIVE_FOLDER_NAME,
              count: 1,
            });
            toast(
              'O Google Drive exige selecionar ou autorizar a pasta pelo Seletor oficial. Clique em "Autorizar Drive".',
              true,
            );
          } else if (msg) {
            toast(`Aviso ao conectar pasta no Google Drive: ${msg}`, true);
          }
          if (activeScopeRef.current === scope) {
            lastAutoBackupAtRef.current = Date.now();
            // Do NOT mark syncedScopeOnceRef as synced when initial Drive verification failed;
            // otherwise subsequent edits could overwrite unverified cloud data in Drive.
          }
        } finally {
          setIsSyncingDrive(false);
          activeCloudSyncPromiseRef.current = null;
        }
      })();

      activeCloudSyncPromiseRef.current = task;
      return task;
    },
    [applyRestoredDatabaseForScope, recordSyncActivity, runDriveTimestampComparison, toast],
  );

  const flushCloudSyncNow = useCallback(async () => {
    if (!driveConnected || !driveTokenReady) return;
    const scope = activeScopeRef.current;
    if (scope === 'offline_guest') return;
    if (syncedScopeOnceRef.current !== scope) return;
    if (activeCloudSyncPromiseRef.current || isRestoringRef.current || cloudSaveInFlightRef.current) return;

    window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
    const currentDb = dbRef.current;
    const curHash = computeDatabaseContentHash(currentDb);
    const hasPendingDeletes =
      getPendingDriveDeletes(scope).length > 0 ||
      getPendingDriveDeletes('offline_guest').length > 0;
    if (!hasPendingDeletes && lastCloudHashRef.current && curHash === lastCloudHashRef.current) {
      pendingCloudSyncRef.current = false;
      setHasPendingCloudChanges(false);
      return;
    }

    const { hasChanges } = buildIncrementalDatabaseBackup(
      lastCloudDbRef.current,
      currentDb,
      {
        updatedAt: new Date().toISOString(),
        baseUpdatedAt: lastBackupIsoRef.current || undefined,
        userEmail: googleUser?.email || undefined,
      },
    );
    if (!hasPendingDeletes && lastCloudDbRef.current && !hasChanges) {
      lastCloudHashRef.current = curHash;
      pendingCloudSyncRef.current = false;
      setHasPendingCloudChanges(false);
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setDriveTokenReady(false);
      return;
    }

    if (
      lastCloudDbRef.current &&
      !isUntouchedSeedDatabase(lastCloudDbRef.current) &&
      isUntouchedSeedDatabase(currentDb)
    ) {
      pendingCloudSyncRef.current = false;
      setHasPendingCloudChanges(false);
      return;
    }

    cloudSaveInFlightRef.current = true;
    pendingCloudSyncRef.current = false;
    let shouldRetryConcurrentEdit = false;
    try {
      let remainingDeletes = 0;
      let flushedDeleteIds: string[] = [];
      let flushedDeleteNames: string[] = [];
      if (hasPendingDeletes) {
        const flushed = await flushPendingDriveDeletes(scope, token);
        remainingDeletes = flushed.remainingCount;
        flushedDeleteIds = flushed.deletedIds;
        flushedDeleteNames = flushed.deletedNames;
        if (flushed.deletedIds.length > 0) {
          removeFileIdsFromCacheMeta(scope, flushed.deletedIds);
        }
      }

      const nowIso = new Date().toISOString();
      const mergedCloudDb: StudyDatabase = currentDb;
      const mergedHash = computeDatabaseContentHash(mergedCloudDb);

      const isGasActive = isGasSessionActive();
      const forceSnapshot = isGasActive
        ? false
        : flushedDeleteIds.length > 0 ||
          Date.now() - lastDeletionMsRef.current < 120_000 ||
          syncedScopeOnceRef.current === scope;

      const expectedBaseHash =
        lastCloudHashRef.current || getGasSession()?.lastContentHash || null;
      const baseServerVersion = getGasSession()?.serverVersion;

      const savedSync =
        lastCloudHashRef.current !== mergedHash || flushedDeleteIds.length > 0
          ? await saveCloudSyncSnapshot(
              {
                version: 2,
                app: 'Central de Estudos',
                updatedAt: nowIso,
                contentHash: mergedHash,
                userEmail: googleUser?.email || gasSession?.username || undefined,
                data: mergedCloudDb,
              },
              token,
              {
                ...(forceSnapshot ? { force: true } : {}),
                expectedContentHash: expectedBaseHash,
                baseVersion: baseServerVersion,
              },
            )
          : null;

      lastCloudDbRef.current = mergedCloudDb;
      lastCloudHashRef.current = mergedHash;
      const updatedMeta = recordUploadedFilesInCacheMeta(scope, {
        backupFiles: savedSync ? [savedSync] : [],
        extraPatch: {
          lastCloudSyncAt: nowIso,
          lastCloudContentHash: mergedHash,
          hasPendingCloudSync: remainingDeletes > 0,
        },
      });
      setLastCloudSyncAt(nowIso);
      if (updatedMeta.lastCacheVerifiedAt) setLastCacheVerifiedAt(updatedMeta.lastCacheVerifiedAt);
      if (flushedDeleteIds.length > 0 || savedSync) {
        recordSyncActivity({
          category: 'drive-sync',
          operation: isGasActive
            ? 'Sincronização silenciosa (Google Apps Script)'
            : 'Sincronização contínua com o Google Drive',
          status: remainingDeletes > 0 ? 'warning' : 'success',
          message:
            flushedDeleteIds.length > 0
              ? `Espelho atualizado e ${flushedDeleteIds.length} arquivo(s) excluído(s) enviado(s) para a lixeira do Drive.`
              : `Salvo na nuvem (${CLOUD_SYNC_FILENAME}) com proteção de versão.`,
          affectedFiles: [
            ...flushedDeleteNames.map((name) => ({ name, action: 'trashed' as const })),
            ...(savedSync ? [{ name: savedSync.name, action: 'uploaded' as const, driveFileId: savedSync.id }] : []),
          ],
          stats: {
            trashed: flushedDeleteIds.length,
            uploaded: savedSync ? 1 : 0,
            queuedDeletes: remainingDeletes,
          },
        });
      }
      if (computeDatabaseContentHash(dbRef.current) !== curHash || remainingDeletes > 0) {
        pendingCloudSyncRef.current = true;
        setHasPendingCloudChanges(true);
        shouldRetryConcurrentEdit = computeDatabaseContentHash(dbRef.current) !== curHash;
      } else {
        setHasPendingCloudChanges(false);
      }
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      const isGasActive = isGasSessionActive();
      const isVersionConflict =
        err?.code === 'VERSION_CONFLICT' || errMsg.includes('DRIVE_CONFLICT_NEWER_REMOTE');

      if (isVersionConflict) {
        // No modo Apps Script, NUNCA sobrescrevemos silenciosamente outro computador: registramos no Histórico de Conflitos!
        if (isGasActive) {
          pendingCloudSyncRef.current = true;
          setHasPendingCloudChanges(true);
          saveSyncMeta(scope, { hasPendingCloudSync: true });
          const localSum = buildDatabaseVersionSummary(currentDb, {
            updatedAt: new Date().toISOString(),
            version: getGasSession()?.serverVersion,
          });
          const remoteSumRaw = err?.remoteSummary as any;
          const driveSum = remoteSumRaw
            ? {
                updatedAt: err?.remoteUpdatedAt || null,
                version: typeof err?.serverVersion === 'number' ? err.serverVersion : undefined,
                fileName: CLOUD_SYNC_FILENAME,
                laws: Number(remoteSumRaw.laws || 0),
                scheduleTopics: Number(remoteSumRaw.scheduleTopics || 0),
                questions: Number(remoteSumRaw.questions || 0),
                annotations: Number(remoteSumRaw.annotations || 0),
                pdfs: Number(remoteSumRaw.pdfs || 0),
              }
            : undefined;

          recordConflictHistoryEntry(scope, {
            source: 'apps-script',
            kind: 'version-divergence',
            title: 'Divergência de versão detectada entre este computador e o Google Drive',
            reason:
              errMsg ||
              'Outro dispositivo salvou uma versão mais recente no Google Drive. Escolha manualmente qual versão manter na aba Backup.',
            errorCode: 'VERSION_CONFLICT',
            serverConflictId: err?.conflictId,
            localSummary: localSum,
            driveSummary: driveSum,
          });
          recordSyncActivity({
            category: 'drive-sync',
            operation: 'Conflito de versão bloqueado (proteção contra sobrescrita)',
            status: 'warning',
            errorCode: 'VERSION_CONFLICT',
            message:
              'Versão mais recente detectada no Google Drive. Acesse Backup → Histórico de Conflitos para escolher Local ou Drive.',
          });
          toast(
            'Conflito de versão detectado com outro dispositivo! Acesse Backup → Histórico de Conflitos para escolher qual versão manter.',
            true,
          );
        } else {
          // Fluxo OAuth legado: tenta reconciliar ou registra no Histórico de Conflitos
          let reconciledOk = false;
          try {
            const latestCloud = await downloadLatestCloudSync(token, {
              expectedEmail: googleUser?.email || undefined,
              bypassCache: true,
            });
            let reconciledDb = currentDb;
            if (latestCloud?.payload) {
              let remoteDb = normalizeAndMergeDatabase(latestCloud.payload);
              if (latestCloud.incrementalDeltas?.length) {
                for (const incDelta of latestCloud.incrementalDeltas) {
                  remoteDb = applyIncrementalDeltaToDatabase(remoteDb, incDelta);
                }
              }
              const mergedTombstones = stripActiveEntityTombstones(
                mergeTombstoneMaps(
                  remoteDb.deletedTombstones,
                  currentDb.deletedTombstones,
                ),
                currentDb,
              );
              reconciledDb = applyTombstonesToMergedDatabase(
                {
                  ...currentDb,
                  deletedTombstones: mergedTombstones,
                },
                scope,
              );
            }
            const reconciledIso = new Date().toISOString();
            const reconciledHash = computeDatabaseContentHash(reconciledDb);
            const forcedSync = await saveCloudSyncSnapshot(
              {
                version: 2,
                app: 'Central de Estudos',
                updatedAt: reconciledIso,
                contentHash: reconciledHash,
                userEmail: googleUser?.email || undefined,
                data: reconciledDb,
              },
              token,
              { force: true },
            );
            lastCloudDbRef.current = reconciledDb;
            lastCloudHashRef.current = reconciledHash;
            recordUploadedFilesInCacheMeta(scope, {
              backupFiles: forcedSync ? [forcedSync] : [],
              extraPatch: {
                lastCloudSyncAt: reconciledIso,
                lastCloudContentHash: reconciledHash,
                hasPendingCloudSync: false,
              },
            });
            setLastCloudSyncAt(reconciledIso);
            pendingCloudSyncRef.current = false;
            setHasPendingCloudChanges(false);
            reconciledOk = true;
          } catch {
            reconciledOk = false;
          }
          if (!reconciledOk) {
            pendingCloudSyncRef.current = true;
            setHasPendingCloudChanges(true);
            saveSyncMeta(scope, { hasPendingCloudSync: true });
            recordConflictHistoryEntry(scope, {
              source: 'google-drive',
              kind: 'version-divergence',
              title: 'Conflito de sincronização com o Google Drive',
              reason: 'Alterações mais recentes foram detectadas no Google Drive e a mesclagem automática não concluiu.',
              errorCode: 'DRIVE_CONFLICT_NEWER_REMOTE',
              localSummary: buildDatabaseVersionSummary(currentDb, { updatedAt: new Date().toISOString() }),
            });
            recordSyncActivity({
              category: 'drive-sync',
              operation: 'Conflito na sincronização do Drive',
              status: 'warning',
              errorCode: 'DRIVE_CONFLICT_NEWER_REMOTE',
              message: 'Alterações mais recentes detectadas no Drive; nova tentativa mantida na fila.',
            });
            toast(
              'Alterações mais recentes encontradas no Google Drive. Verifique o Histórico de Conflitos na aba Backup.',
              true,
            );
          }
        }
      } else if (err?.queued) {
        // Operação armazenada na fila local (LocalStorage) com backoff exponencial:
        // permanece silenciosa nas 3 primeiras tentativas; notificação ocorre somente se persistir > 3 tentativas.
        pendingCloudSyncRef.current = true;
        setHasPendingCloudChanges(true);
        saveSyncMeta(scope, { hasPendingCloudSync: true });
      } else {
        pendingCloudSyncRef.current = true;
        setHasPendingCloudChanges(true);
        saveSyncMeta(scope, { hasPendingCloudSync: true });
        recordConflictHistoryEntry(scope, {
          source: isGasActive ? 'apps-script' : 'google-drive',
          kind: errMsg.includes('TOKEN_EXPIRED') ? 'auth-failure' : 'sync-failure',
          title: errMsg.includes('TOKEN_EXPIRED')
            ? 'Falha de sincronização: sessão expirada'
            : 'Falha ao salvar alterações na nuvem',
          reason: errMsg || 'Erro ao enviar alterações pendentes para o Google Drive.',
          errorCode: errMsg.includes('TOKEN_EXPIRED')
            ? 'oauth/drive-token-expired'
            : errMsg.includes('DRIVE_FOLDER_PERMISSION')
              ? 'DRIVE_FOLDER_PERMISSION'
              : 'SYNC_ERROR',
          localSummary: buildDatabaseVersionSummary(currentDb, { updatedAt: new Date().toISOString() }),
        });
        recordSyncActivity({
          category: 'drive-sync',
          operation: 'Falha na sincronização contínua do Google Drive',
          status: 'error',
          errorCode: errMsg.includes('TOKEN_EXPIRED')
            ? 'oauth/drive-token-expired'
            : errMsg.includes('DRIVE_FOLDER_PERMISSION')
              ? 'DRIVE_FOLDER_PERMISSION'
              : undefined,
          message: errMsg || 'Erro ao enviar alterações pendentes para o Google Drive.',
        });
        if (!isGasActive && errMsg.includes('TOKEN_EXPIRED')) {
          setDriveTokenReady(false);
        } else if (!isGasActive && errMsg.includes('DRIVE_FOLDER_PERMISSION')) {
          const pref = getPreferredStudyFolder();
          setDrivePermissionNeedsPicker({
            folderId: pref.id || DEFAULT_STUDY_FOLDER_ID,
            folderName: activeDriveFolderNameRef.current || pref.name,
            count: 1,
          });
        }
      }
    } finally {
      cloudSaveInFlightRef.current = false;
      if (shouldRetryConcurrentEdit && pendingCloudSyncRef.current && syncedScopeOnceRef.current === activeScopeRef.current) {
        window.setTimeout(() => {
          void flushCloudSyncNow();
        }, 350);
      }
    }
  }, [driveConnected, driveTokenReady, googleUser?.email, recordSyncActivity, toast]);

  // Camada 3 (Google Drive): debounce rápido para exclusões (2.5s) ou 20000ms (20s) + flush imediato em visibilitychange/pagehide
  useEffect(() => {
    if (!driveConnected || !driveTokenReady) return;
    const scope = activeScopeRef.current;
    if (scope === 'offline_guest') return;
    if (syncedScopeOnceRef.current !== scope) return;
    if (isRestoringRef.current || activeCloudSyncPromiseRef.current || isSyncingDrive) return;
    const hasPendingDeletes =
      getPendingDriveDeletes(scope).length > 0 ||
      getPendingDriveDeletes('offline_guest').length > 0;
    if (!pendingCloudSyncRef.current && !hasPendingDeletes) return;

    const delayMs = isGasSessionActive()
      ? 3500
      : Date.now() - lastDeletionMsRef.current < 15_000
        ? 2500
        : DRIVE_SYNC_DEBOUNCE_MS;
    const timer = window.setTimeout(() => {
      const stillHasDeletes =
        getPendingDriveDeletes(activeScopeRef.current).length > 0 ||
        getPendingDriveDeletes('offline_guest').length > 0;
      if (
        syncedScopeOnceRef.current !== activeScopeRef.current ||
        activeCloudSyncPromiseRef.current ||
        isRestoringRef.current ||
        (!pendingCloudSyncRef.current && !stillHasDeletes)
      ) {
        return;
      }
      void flushCloudSyncNow();
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [db, driveConnected, driveTokenReady, flushCloudSyncNow, isSyncingDrive]);

  const runPeriodicAutoBackupIfDue = useCallback(async () => {
    const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000;
    if (!driveConnected) return;
    const scope = activeScopeRef.current;
    if (scope === 'offline_guest') return;
    if (syncedScopeOnceRef.current !== scope) return;
    if (isRestoringRef.current || cloudSaveInFlightRef.current || activeCloudSyncPromiseRef.current) return;
    if (Date.now() - lastAutoBackupAtRef.current < AUTO_BACKUP_INTERVAL_MS) return;

    const currentDb = dbRef.current;
    const curHash = computeDatabaseContentHash(currentDb);
    const baselineDb = lastBackupDbRef.current || lastCloudDbRef.current;
    const nowIso = new Date().toISOString();
    const { hasChanges, envelope } = buildIncrementalDatabaseBackup(baselineDb, currentDb, {
      updatedAt: nowIso,
      baseUpdatedAt: lastBackupIsoRef.current || undefined,
      userEmail: googleUser?.email || undefined,
    });

    // Never create a redundant backup or replace existing backups if nothing was altered
    if ((lastBackupHashRef.current && curHash === lastBackupHashRef.current) || (baselineDb && !hasChanges)) {
      lastAutoBackupAtRef.current = Date.now();
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setDriveTokenReady(false);
      return;
    }
    setDriveTokenReady(true);

    if (
      lastCloudDbRef.current &&
      !isUntouchedSeedDatabase(lastCloudDbRef.current) &&
      isUntouchedSeedDatabase(currentDb)
    ) {
      return;
    }

    cloudSaveInFlightRef.current = true;
    pendingCloudSyncRef.current = false;
    try {
      const mergedCloudDb: StudyDatabase = currentDb;
      const mergedHash = computeDatabaseContentHash(mergedCloudDb);

      const syncPayload = {
        version: 2,
        app: 'Central de Estudos',
        updatedAt: nowIso,
        contentHash: mergedHash,
        userEmail: googleUser?.email || undefined,
        data: mergedCloudDb,
      };

      // Save strictly incremental delta file (never replacing or deleting existing backups in Drive)
      const savedIncFile = await saveDatabaseBackupToDrive(envelope, token);
      const savedSyncFile =
        lastCloudHashRef.current !== mergedHash
          ? await saveCloudSyncSnapshot(syncPayload, token)
          : null;

      lastAutoBackupAtRef.current = Date.now();
      lastCloudDbRef.current = mergedCloudDb;
      lastCloudHashRef.current = mergedHash;
      lastBackupDbRef.current = currentDb;
      lastBackupHashRef.current = curHash;
      lastBackupIsoRef.current = nowIso;
      const updatedMeta = recordUploadedFilesInCacheMeta(scope, {
        backupFiles: [savedIncFile, savedSyncFile],
        extraPatch: {
          lastCloudSyncAt: nowIso,
          lastCloudContentHash: mergedHash,
          lastBackupContentHash: curHash,
          hasPendingCloudSync: false,
        },
      });
      setLastCloudSyncAt(nowIso);
      if (updatedMeta.lastCacheVerifiedAt) setLastCacheVerifiedAt(updatedMeta.lastCacheVerifiedAt);
      setHasPendingCloudChanges(false);
      recordSyncActivity({
        category: 'drive-backup',
        operation: 'Backup incremental automático (30 min)',
        status: 'success',
        message: `Backup incremental gravado no Google Drive (${envelope.changesSummary.addedOrUpdated} item(ns) alterado(s)).`,
        affectedFiles: [
          { name: savedIncFile.name, action: 'uploaded', driveFileId: savedIncFile.id },
          ...(savedSyncFile ? [{ name: savedSyncFile.name, action: 'uploaded' as const, driveFileId: savedSyncFile.id }] : []),
        ],
        stats: { uploaded: savedSyncFile ? 2 : 1 },
      });
      toast('Backup incremental automático salvo no Google Drive.');
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      recordSyncActivity({
        category: 'drive-backup',
        operation: 'Falha no backup automático (30 min)',
        status: errMsg.includes('DRIVE_CONFLICT_NEWER_REMOTE') ? 'warning' : 'error',
        errorCode: errMsg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
        message: errMsg || 'Erro ao gravar backup automático no Google Drive.',
      });
      if (errMsg.includes('DRIVE_CONFLICT_NEWER_REMOTE')) {
        lastAutoBackupAtRef.current = Date.now();
        toast(
          'Backup do Google Drive mais recente detectado. Snapshot base preservado sem sobrescrita.',
          true,
        );
      } else if (errMsg.includes('TOKEN_EXPIRED')) {
        setDriveTokenReady(false);
      } else {
        // Backoff 1 minute before retrying failed periodic backup
        lastAutoBackupAtRef.current = Date.now() - AUTO_BACKUP_INTERVAL_MS + 60 * 1000;
      }
      console.warn('[Auto-backup 30min] Falha ao salvar backup automático no Drive:', err);
    } finally {
      cloudSaveInFlightRef.current = false;
    }
  }, [driveConnected, googleUser?.email, recordSyncActivity, toast]);

  // Automatic backup snapshot to Google Drive every 30 minutes (never disconnects on timeout)
  useEffect(() => {
    if (!driveConnected) return;
    const intervalId = window.setInterval(() => {
      void runPeriodicAutoBackupIfDue();
    }, 60 * 1000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void runPeriodicAutoBackupIfDue();
      }
    };
    document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('focus', onFocusOrVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('focus', onFocusOrVisible);
    };
  }, [driveConnected, runPeriodicAutoBackupIfDue]);

  // Flush drafts and pending local/cloud changes immediately when the user hides the tab or leaves/reloads
  useEffect(() => {
    const flushLocalAndCloud = () => {
      window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
      const scope = activeScopeRef.current;
      try {
        localStorage.setItem(getTimerStorageKey(scope), JSON.stringify(timerStateRef.current));
      } catch {
        // ignore
      }
      if (localPersistTimerRef.current !== null) {
        window.clearTimeout(localPersistTimerRef.current);
        localPersistTimerRef.current = null;
      }
      const curDb = dbRef.current;
      const serializedCurDb = JSON.stringify(curDb);
      const curHash = computeSerializedContentHash(serializedCurDb);
      const hasFlushedDraftChange = curHash !== lastPersistedDbHashRef.current;
      const hasCustomOfflineData = scope !== 'offline_guest' || !isUntouchedSeedDatabase(curDb);
      if (hasFlushedDraftChange) {
        lastPersistedDbRef.current = curDb;
        lastPersistedDbHashRef.current = curHash;
        registerLocalWriteShield();
        const nowIso = new Date().toISOString();
        persistLocalDatabaseForScope(scope, serializedCurDb, nowIso, {
          lastLocalEditAt: nowIso,
          ...(hasCustomOfflineData ? { hasPendingCloudSync: true } : {}),
        });
        if (hasCustomOfflineData) {
          pendingCloudSyncRef.current = true;
          setHasPendingCloudChanges(true);
        }
      }
      if (scheduleTxtSyncTimerRef.current) {
        window.clearTimeout(scheduleTxtSyncTimerRef.current);
        scheduleTxtSyncTimerRef.current = null;
        try {
          const activeWeekKey = resolveActiveScheduleWeekKey(curDb.scheduleDayDates, curDb.schedule);
          const meta = buildScheduleWeekMetadata(activeWeekKey, curDb.scheduleDayDates);
          const txtContent = serializeScheduleWeekToText(meta.weekKey, curDb.schedule, meta.dayDates);
          const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
          void saveFileBlob(`schedule_week_${meta.weekKey}`, blob, scope);
        } catch {
          // ignore
        }
      }
      const hasPendingDeletes =
        getPendingDriveDeletes(scope).length > 0 ||
        (scope !== 'offline_guest' && getPendingDriveDeletes('offline_guest').length > 0);
      if ((pendingCloudSyncRef.current || hasPendingDeletes) && driveConnected && driveTokenReady) {
        void flushCloudSyncNow();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushLocalAndCloud();
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      flushLocalAndCloud();
      if (
        pendingIdbDbWrites > 0 ||
        (driveConnected && !driveTokenReady && (hasPendingCloudChanges || pendingCloudSyncRef.current))
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('pagehide', flushLocalAndCloud);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushLocalAndCloud);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    driveConnected,
    driveTokenReady,
    flushCloudSyncNow,
    hasPendingCloudChanges,
    registerLocalWriteShield,
  ]);

  // Keep React driveTokenReady synchronized whenever Drive/Apps Script session changes
  useEffect(() => {
    return subscribeDriveTokenChanges((hasToken) => {
      setDriveTokenReady(isGasSessionActive() ? true : hasToken);
    });
  }, []);

  // Flush locally queued edits to Google Drive / Apps Script automatically as soon as network connectivity is restored
  useEffect(() => {
    let flushInProgress = false;
    const syncPendingOfflineChanges = async () => {
      if (flushInProgress) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const scope = activeScopeRef.current;
      if (scope === 'offline_guest') return;

      const meta = loadSyncMeta(scope);
      const curHash = computeDatabaseContentHash(dbRef.current);
      const hasPending = pendingCloudSyncRef.current || hasPersistedPendingSync(meta);
      if (!hasPending) return;
      if (!driveConnectedRef.current || lastCloudHashRef.current === curHash) {
        pendingCloudSyncRef.current = false;
        setHasPendingCloudChanges(false);
        saveSyncMeta(scope, { hasPendingCloudSync: false });
        return;
      }

      flushInProgress = true;
      try {
        if (driveConnectedRef.current && pendingCloudSyncRef.current) {
          void flushCloudSyncNow();
        }
      } finally {
        flushInProgress = false;
      }
    };

    const handleNetworkRestored = () => {
      window.setTimeout(() => {
        void syncPendingOfflineChanges();
      }, 800);
    };

    window.addEventListener('online', handleNetworkRestored);
    const startupFlushId = window.setTimeout(() => {
      void syncPendingOfflineChanges();
    }, 3500);

    return () => {
      window.clearTimeout(startupFlushId);
      window.removeEventListener('online', handleNetworkRestored);
    };
  }, [flushCloudSyncNow]);

  const connectGoogleDrive = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    if (isGasSessionActive()) {
      setDriveConnected(true);
      setDriveTokenReady(true);
      toast('Conexão ativa no Modo 100% Google Apps Script (Google Drive).');
      return true;
    }
    const msg = 'Faça login com Usuário e Senha (Modo 100% Google Apps Script) para sincronizar com o Google Drive.';
    setAuthError(msg);
    toast(msg, true);
    return false;
  }, [toast]);

  // ==========================================================================
  // MODO 100% GOOGLE APPS SCRIPT (DRIVE + PLANILHA OCULTA) & HISTÓRICO DE CONFLITOS
  // ==========================================================================

  const hydrateGasScopeAndRemoteState = useCallback(
    async (
      session: GasSession,
      initialPayload?: any,
      initialUpdatedAt?: string | null,
      initialConflicts?: Array<{
        id: string;
        timestamp: string;
        reason: string;
        localVersion: number;
        serverVersion: number;
        status: string;
        resolution?: string;
        resolvedAt?: string;
      }>,
    ) => {
      const gasScope = getUserScopeKey({ email: session.username });
      if (gasScope !== activeScopeRef.current) {
        window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
        const prevScope = activeScopeRef.current;
        const prevSnapshot = JSON.stringify(dbRef.current);
        const nowIso = new Date().toISOString();
        persistLocalDatabaseForScope(prevScope, prevSnapshot, nowIso);

        activeScopeRef.current = gasScope;
        setStorageUserScope(gasScope);
        const scopedLocal = loadStoredDatabase(gasScope);
        isRestoringRef.current = true;
        skipPersistDbRef.current = scopedLocal;
        lastPersistedDbRef.current = scopedLocal;
        lastPersistedDbHashRef.current = computeDatabaseContentHash(scopedLocal);
        setDb(scopedLocal);
        dbRef.current = scopedLocal;
        window.setTimeout(() => {
          isRestoringRef.current = false;
        }, 80);
      }

      setConflictHistory(loadConflictHistory(gasScope));
      setSyncActivityLogs(loadSyncActivityLogs(gasScope));
      setGoogleUser({
        uid: session.username,
        email: session.username,
        displayName: session.username,
      });
      setDriveConnected(true);
      setDriveTokenReady(true);
      setAuthError(null);
      setDrivePermissionNeedsPicker(null);
      if (session.folderId) {
        setActiveDriveFolderId(session.folderId);
      }
      if (session.folderName) {
        setActiveDriveFolderName(session.folderName);
      }
      if (session.folderUrl) {
        setDriveFolderUrl(session.folderUrl);
      }

      setIsSyncingDrive(true);
      try {
        let payload = initialPayload;
        let updatedAt = initialUpdatedAt || session.lastSyncedAt || null;

        if (payload === undefined) {
          const pulled = await gasPullState();
          if (pulled?.ok) {
            payload = pulled.payload;
            updatedAt = pulled.updatedAt;
            if (pulled.folderId) setActiveDriveFolderId(pulled.folderId);
            if (pulled.folderName) setActiveDriveFolderName(pulled.folderName);
            if (pulled.folderUrl) setDriveFolderUrl(pulled.folderUrl);
          }
        }

        if (payload && typeof payload === 'object') {
          const remoteDb = applyTombstonesToMergedDatabase(normalizeAndMergeDatabase(payload), gasScope);
          const remoteHash = computeDatabaseContentHash(remoteDb);
          const localDb = dbRef.current;
          const localHash = computeDatabaseContentHash(localDb);
          const localMeta = loadSyncMeta(gasScope);
          const hasLocalPending = hasPersistedPendingSync(localMeta);

          if (localHash !== remoteHash && hasLocalPending && !isUntouchedSeedDatabase(localDb)) {
            // Há alterações locais pendentes divergentes da nuvem: registra no Histórico de Conflitos sem destruir nada!
            recordConflictHistoryEntry(gasScope, {
              source: 'apps-script',
              kind: 'version-divergence',
              title: 'Divergência encontrada ao abrir sessão neste dispositivo',
              reason:
                'Este dispositivo tinha alterações locais pendentes diferentes da versão salva no Google Drive. Escolha manualmente qual versão manter na aba Backup.',
              errorCode: 'STARTUP_DIVERGENCE',
              localSummary: buildDatabaseVersionSummary(localDb, {
                updatedAt: localMeta.lastLocalEditAt || new Date().toISOString(),
              }),
              driveSummary: buildDatabaseVersionSummary(remoteDb, {
                updatedAt,
                version: session.serverVersion,
                fileName: CLOUD_SYNC_FILENAME,
              }),
            });
            toast(
              'Há divergência entre este dispositivo e o Google Drive. Acesse Backup → Histórico de Conflitos para escolher qual versão manter.',
              true,
            );
          } else if (!isUntouchedSeedDatabase(remoteDb)) {
            const syncedAtIso = updatedAt || new Date().toISOString();
            applyRestoredDatabaseForScope(gasScope, remoteDb, syncedAtIso);
            saveSyncMeta(gasScope, {
              lastCloudSyncAt: syncedAtIso,
              lastCloudContentHash: remoteHash,
              hasPendingCloudSync: false,
            });
            lastCloudDbRef.current = remoteDb;
            lastCloudHashRef.current = remoteHash;
            pendingCloudSyncRef.current = false;
            setHasPendingCloudChanges(false);
            setLastCloudSyncAt(syncedAtIso);
          }
        } else if (!isUntouchedSeedDatabase(dbRef.current)) {
          // Primeira vez no Apps Script: sobe o banco local atual como versão v1
          const nowIso = new Date().toISOString();
          const curHash = computeDatabaseContentHash(dbRef.current);
          const pushed = await gasPushState(
            {
              version: 2,
              app: 'Central de Estudos',
              updatedAt: nowIso,
              contentHash: curHash,
              userEmail: session.username,
              data: dbRef.current,
            },
            { force: true, contentHash: curHash },
          );
          if (pushed.ok) {
            lastCloudDbRef.current = dbRef.current;
            lastCloudHashRef.current = curHash;
            pendingCloudSyncRef.current = false;
            setHasPendingCloudChanges(false);
            setLastCloudSyncAt(pushed.updatedAt || nowIso);
          }
        }

        // Importa conflitos pendentes registrados na planilha oculta tb_conflitos
        const serverConflicts = initialConflicts || (await gasListConflicts().catch(() => []));
        for (const sc of serverConflicts) {
          if (sc.status === 'pending') {
            recordConflictHistoryEntry(gasScope, {
              id: `srv_${sc.id}`,
              timestamp: sc.timestamp || new Date().toISOString(),
              source: 'apps-script',
              kind: 'version-divergence',
              title: `Conflito de versão (v${sc.localVersion} × v${sc.serverVersion})`,
              reason: sc.reason || 'Divergência registrada no servidor Google Apps Script.',
              errorCode: 'VERSION_CONFLICT',
              serverConflictId: sc.id,
            });
          }
        }

        syncedScopeOnceRef.current = gasScope;
      } catch (err: any) {
        const msg = err?.message || 'Erro ao carregar estado do Google Apps Script.';
        recordConflictHistoryEntry(gasScope, {
          source: 'apps-script',
          kind: 'sync-failure',
          title: 'Falha ao sincronizar sessão com Google Apps Script',
          reason: msg,
          errorCode: 'GAS_HYDRATE_ERROR',
          localSummary: buildDatabaseVersionSummary(dbRef.current, { updatedAt: new Date().toISOString() }),
        });
        toast(msg, true);
      } finally {
        setIsSyncingDrive(false);
      }
    },
    [applyRestoredDatabaseForScope, toast],
  );

  // Hidrata sessão persistida do Google Apps Script automaticamente ao abrir o site
  useEffect(() => {
    const activeGas = getGasSession();
    if (!activeGas?.token) return;
    if (gasHydratedTokenRef.current === activeGas.token) return;
    gasHydratedTokenRef.current = activeGas.token;
    void hydrateGasScopeAndRemoteState(activeGas);
  }, [gasSession?.token, hydrateGasScopeAndRemoteState]);

  const connectAppsScript = useCallback(
    async (
      username: string,
      password: string,
      customApiUrl?: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      setAuthError(null);
      try {
        const res = await gasLogin(username, password, customApiUrl);
        if (!res.ok) {
          const msg = res.error || 'Usuário ou senha inválidos no Google Apps Script.';
          setAuthError(msg);
          return { ok: false, error: msg };
        }
        const session = getGasSession();
        if (session) {
          gasHydratedTokenRef.current = session.token;
          await hydrateGasScopeAndRemoteState(session, res.payload, res.updatedAt, res.conflicts);
          recordSyncActivity({
            category: 'drive-sync',
            operation: 'Login no Modo 100% Google Apps Script',
            status: 'success',
            message: `Conectado como ${session.username} · Pasta "${session.folderName}" (v${session.serverVersion}).`,
          });
          toast(`Conectado ao Google Drive via Apps Script (${session.folderName})!`);
        }
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || 'Não foi possível conectar ao Google Apps Script.';
        setAuthError(msg);
        return { ok: false, error: msg };
      }
    },
    [hydrateGasScopeAndRemoteState, recordSyncActivity, toast],
  );

  const disconnectAppsScript = useCallback(async () => {
    const scope = activeScopeRef.current;
    if (pendingCloudSyncRef.current && isGasSessionActive()) {
      try {
        await flushCloudSyncNow();
      } catch {
        // ignore pre-logout flush error
      }
    }
    await gasLogout();
    gasHydratedTokenRef.current = null;
    syncedScopeOnceRef.current = null;
    setDriveConnected(false);
    setDriveTokenReady(false);
    setHasPendingCloudChanges(false);
    recordSyncActivity(
      {
        category: 'oauth',
        operation: 'Desconexão do Google Apps Script',
        status: 'success',
        message: 'Sessão do Modo 100% Google Apps Script encerrada neste dispositivo.',
      },
      scope,
    );
    toast('Sessão do Google Apps Script encerrada.');
  }, [flushCloudSyncNow, recordSyncActivity, toast]);

  const testAppsScriptConnection = useCallback(
    async (customApiUrl?: string) => {
      const res = await gasPing(customApiUrl);
      if (res.ok) {
        return {
          ok: true,
          version: res.version,
          serverVersion: res.serverVersion,
          folderName: res.folderName,
          message: `Conexão OK! Script v${res.version || '2.0'} ativo · Pasta "${res.folderName || 'Central de Estudos'}" · Estado v${res.serverVersion ?? 0}.`,
        };
      }
      return {
        ok: false,
        message: res.error || 'O script não respondeu no formato JSON esperado.',
      };
    },
    [],
  );

  const checkGasConnectionNow = useCallback(
    async (options?: { silent?: boolean }): Promise<GasConnectionHealth> => {
      if (gasHealthCheckInFlightRef.current) {
        return gasConnectionHealthRef.current;
      }
      if (
        options?.silent &&
        (isSyncingDriveRef.current || isRestoringRef.current || Boolean(activeCloudSyncPromiseRef.current))
      ) {
        return gasConnectionHealthRef.current;
      }
      gasHealthCheckInFlightRef.current = true;
      lastGasHealthCheckMsRef.current = Date.now();

      setGasConnectionHealth((prev) => ({
        ...prev,
        status: prev.status === 'online' ? 'online' : 'checking',
      }));

      try {
        const res = await gasCheckHealth();
        let nextState: GasConnectionHealth = gasConnectionHealthRef.current;

        setGasConnectionHealth((prev) => {
          const isOnline = res.status === 'online';
          const failures = isOnline
            ? 0
            : res.status === 'disconnected'
              ? 0
              : prev.consecutiveFailures + 1;
          nextState = {
            status: res.status,
            lastCheckedAt: res.checkedAt,
            lastOnlineAt: isOnline ? res.checkedAt : prev.lastOnlineAt,
            latencyMs: res.latencyMs,
            consecutiveFailures: failures,
            errorMessage: res.error || null,
            serverVersion: res.serverVersion ?? prev.serverVersion,
            scriptVersion: res.scriptVersion ?? prev.scriptVersion,
            folderName: res.folderName ?? prev.folderName,
            isReconnecting: prev.isReconnecting,
          };
          return nextState;
        });

        if (res.status === 'online') {
          setDriveConnected(true);
          setDriveTokenReady(true);
          // Ao restabelecer a conexão, libera e drena automaticamente a fila persistente no LocalStorage
          if (!isGasQueueConnectionOnline() || loadGasOperationQueue().length > 0) {
            notifyGasConnectionRestored();
          } else {
            setGasQueueConnectionOnline(true);
          }
          if (pendingCloudSyncRef.current) {
            void flushCloudSyncNow();
          }
          if (!options?.silent) {
            toast(`Google Apps Script Online (${res.latencyMs ?? 0} ms)!`);
          }
        } else if (res.status === 'session-expired') {
          setDriveConnected(false);
          setDriveTokenReady(false);
          setGasQueueConnectionOnline(false);
          if (!options?.silent) {
            toast(res.error || 'Sessão expirada. Reconecte sem atualizar a página.', true);
          }
        } else if (res.status === 'offline') {
          setGasQueueConnectionOnline(false);
          if (!options?.silent) {
            toast(res.error || 'Google Apps Script indisponível (Offline).', true);
          }
        } else if (res.status === 'disconnected' && !options?.silent) {
          toast('Servidor online, mas nenhuma conta está conectada.', true);
        }

        return nextState;
      } finally {
        gasHealthCheckInFlightRef.current = false;
      }
    },
    [flushCloudSyncNow, toast],
  );

  const forceReconnectAppsScript = useCallback(
    async (credentials?: {
      username?: string;
      password?: string;
      customApiUrl?: string;
    }): Promise<{ ok: boolean; needsLogin?: boolean; message: string }> => {
      setGasConnectionHealth((prev) => ({
        ...prev,
        isReconnecting: true,
        status: 'checking',
        errorMessage: null,
      }));

      try {
        // Caso o usuário tenha informado credenciais inline (ex: após sessão expirada ou modo offline)
        if (credentials?.username && credentials?.password) {
          const loginRes = await connectAppsScript(
            credentials.username,
            credentials.password,
            credentials.customApiUrl,
          );
          if (!loginRes.ok) {
            const errMsg = loginRes.error || 'Credenciais inválidas ao reconectar.';
            setGasConnectionHealth((prev) => ({
              ...prev,
              isReconnecting: false,
              status: getGasSession()?.token ? 'offline' : 'session-expired',
              errorMessage: errMsg,
              lastCheckedAt: new Date().toISOString(),
            }));
            return { ok: false, needsLogin: true, message: errMsg };
          }
          const health = await checkGasConnectionNow({ silent: true });
          setGasConnectionHealth((prev) => ({
            ...prev,
            ...health,
            status: 'online',
            isReconnecting: false,
            errorMessage: null,
          }));
          return { ok: true, message: 'Reconectado ao Google Apps Script com sucesso!' };
        }

        const activeSession = getGasSession();
        if (!activeSession?.token) {
          const pingRes = await gasCheckHealth();
          const msg =
            pingRes.status === 'offline'
              ? pingRes.error || 'Sem resposta do Google Apps Script.'
              : 'Informe Usuário e Senha para reconectar sua sessão sem atualizar a página.';
          setGasConnectionHealth((prev) => ({
            ...prev,
            isReconnecting: false,
            status: pingRes.status === 'offline' ? 'offline' : 'session-expired',
            latencyMs: pingRes.latencyMs,
            lastCheckedAt: pingRes.checkedAt,
            errorMessage: msg,
          }));
          return { ok: false, needsLogin: pingRes.status !== 'offline', message: msg };
        }

        // Reconexão forçada em tempo real (sem recarregar a página)
        const health = await gasCheckHealth();
        if (health.status === 'session-expired') {
          setDriveConnected(false);
          setDriveTokenReady(false);
          setGasConnectionHealth((prev) => ({
            ...prev,
            isReconnecting: false,
            status: 'session-expired',
            latencyMs: health.latencyMs,
            lastCheckedAt: health.checkedAt,
            errorMessage: health.error || 'Sessão expirada no servidor. Faça login rápido para reconectar.',
          }));
          toast('Sua sessão expirou no servidor. Informe sua senha no painel de conexão para reconectar.', true);
          return {
            ok: false,
            needsLogin: true,
            message: health.error || 'Sessão expirada no servidor.',
          };
        }

        if (health.status !== 'online') {
          const errMsg = health.error || 'Não foi possível alcançar o Google Apps Script.';
          setGasConnectionHealth((prev) => ({
            ...prev,
            isReconnecting: false,
            status: 'offline',
            latencyMs: health.latencyMs,
            lastCheckedAt: health.checkedAt,
            consecutiveFailures: prev.consecutiveFailures + 1,
            errorMessage: errMsg,
          }));
          toast(`Falha ao reconectar: ${errMsg}`, true);
          return { ok: false, message: errMsg };
        }

        // Re-hidrata estado remoto e dispara envio de alterações/exclusões pendentes sem atualizar a página
        gasHydratedTokenRef.current = activeSession.token;
        await hydrateGasScopeAndRemoteState(activeSession);
        setDriveConnected(true);
        setDriveTokenReady(true);
        setGasQueueConnectionOnline(true);

        const scope = activeScopeRef.current;
        if (scope && scope !== 'offline_guest') {
          if (loadGasOperationQueue().length > 0) {
            await processGasOperationQueue({ forceAll: true });
          }
          if (pendingCloudSyncRef.current) {
            await flushCloudSyncNow();
          }
          const pendingDeletes = getPendingDriveDeletes(scope);
          if (pendingDeletes.length > 0) {
            await flushPendingDriveDeletes(scope).catch(() => {});
          }
        }

        const nowIso = new Date().toISOString();
        setGasConnectionHealth((prev) => ({
          ...prev,
          status: 'online',
          isReconnecting: false,
          lastCheckedAt: nowIso,
          lastOnlineAt: nowIso,
          latencyMs: health.latencyMs,
          consecutiveFailures: 0,
          errorMessage: null,
          serverVersion: health.serverVersion ?? prev.serverVersion,
          scriptVersion: health.scriptVersion ?? prev.scriptVersion,
          folderName: health.folderName ?? prev.folderName,
        }));

        recordSyncActivity({
          category: 'drive-sync',
          operation: 'Reconexão forçada com Google Apps Script',
          status: 'success',
          message: `Conexão revalidada com sucesso (${health.latencyMs ?? 0} ms · v${health.serverVersion ?? activeSession.serverVersion}).`,
        });
        toast(`Reconexão concluída! Google Apps Script Online (${health.latencyMs ?? 0} ms).`);
        return { ok: true, message: 'Reconexão forçada concluída com sucesso!' };
      } catch (err: any) {
        const errMsg = err?.message || 'Erro ao forçar reconexão com o Google Apps Script.';
        setGasConnectionHealth((prev) => ({
          ...prev,
          isReconnecting: false,
          status: 'offline',
          lastCheckedAt: new Date().toISOString(),
          consecutiveFailures: prev.consecutiveFailures + 1,
          errorMessage: errMsg,
        }));
        toast(errMsg, true);
        return { ok: false, message: errMsg };
      }
    },
    [
      checkGasConnectionNow,
      connectAppsScript,
      flushCloudSyncNow,
      hydrateGasScopeAndRemoteState,
      recordSyncActivity,
      toast,
    ],
  );

  useEffect(() => {
    const unsubQueue = subscribeGasOperationQueue((items, processing) => {
      setGasOperationQueue(items);
      setGasQueueProcessing(processing);
    });
    const unsubAudit = subscribeLocalGasAuditLogs((logs) => {
      setLocalGasAuditLogs(logs);
    });

    configureGasOperationQueueCallbacks({
      getLatestSyncPayload: () => {
        const currentDb = dbRef.current;
        const hash = computeDatabaseContentHash(currentDb);
        const nowIso = new Date().toISOString();
        const activeSession = getGasSession();
        return {
          version: 2,
          app: 'Central de Estudos',
          updatedAt: nowIso,
          contentHash: hash,
          userEmail: googleUser?.email || activeSession?.username || undefined,
          data: currentDb,
        };
      },
      onPersistentFailure: (item) => {
        toast(
          `Falha persistente na fila (${item.attempts} tentativas > ${GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS}): "${item.label}". Mantido localmente; verifique Backup → Auditoria de Sincronização.`,
          true,
        );
        recordSyncActivity({
          category: 'drive-sync',
          operation: `Fila Apps Script — falha persistente (${item.attempts} tentativas)`,
          status: 'error',
          errorCode: 'GAS_QUEUE_PERSISTENT_FAILURE',
          message: `${item.label}: ${item.lastError}`,
        });
      },
      onOperationSucceeded: (item, result) => {
        if (item.type === 'pushState') {
          const scope = activeScopeRef.current;
          const nowIso = result?.updatedAt || new Date().toISOString();
          const curHash = computeDatabaseContentHash(dbRef.current);
          lastCloudDbRef.current = dbRef.current;
          lastCloudHashRef.current = curHash;
          pendingCloudSyncRef.current = false;
          setHasPendingCloudChanges(false);
          setLastCloudSyncAt(nowIso);
          if (scope && scope !== 'offline_guest') {
            saveSyncMeta(scope, {
              lastCloudSyncAt: nowIso,
              lastCloudContentHash: curHash,
              hasPendingCloudSync: false,
            });
          }
          recordSyncActivity({
            category: 'drive-sync',
            operation: 'Fila Apps Script reenviada com sucesso',
            status: 'success',
            message: `${item.label} sincronizado após ${item.attempts} tentativa(s).`,
          });
        }
      },
      onVersionConflict: (item, result) => {
        const scope = activeScopeRef.current;
        if (scope) {
          recordConflictHistoryEntry(scope, {
            source: 'apps-script',
            kind: 'version-divergence',
            title: 'Divergência de versão detectada ao reenviar fila local',
            reason:
              result?.error ||
              `Conflito ao reenviar "${item.label}". Escolha qual versão manter na aba Backup.`,
            errorCode: 'VERSION_CONFLICT',
            localSummary: buildDatabaseVersionSummary(dbRef.current, {
              updatedAt: new Date().toISOString(),
              version: getGasSession()?.serverVersion,
            }),
          });
        }
        toast(
          'Conflito de versão detectado durante o reenvio automático. Acesse Backup → Histórico de Conflitos.',
          true,
        );
      },
    });

    return () => {
      unsubQueue();
      unsubAudit();
    };
  }, [googleUser?.email, recordSyncActivity, toast]);

  const processGasQueueNow = useCallback(
    async (options?: { forceAll?: boolean; onlyItemId?: string }) => {
      const res = await processGasOperationQueue({
        forceAll: options?.forceAll ?? true,
        onlyItemId: options?.onlyItemId,
      });
      if (res.succeeded > 0) {
        toast(`${res.succeeded} operação(ões) da fila sincronizada(s) com o Google Drive!`);
      } else if (res.remaining > 0 && res.failed > 0) {
        toast(
          `Conexão ainda indisponível (${res.remaining} item(ns) na fila). Novas tentativas automáticas estão agendadas.`,
          true,
        );
      }
      return res;
    },
    [toast],
  );

  const removeGasQueueItem = useCallback((id: string) => {
    removeGasQueueItemStore(id);
  }, []);

  const clearFailedGasQueueItems = useCallback(() => {
    const removed = clearFailedGasQueueItemsStore();
    if (removed > 0) {
      toast(`${removed} item(ns) com falha persistente removido(s) da fila.`);
    }
    return removed;
  }, [toast]);

  const fetchGasAuditLogs = useCallback(async (limit = 150) => {
    return await gasListAuditLogs(limit);
  }, []);

  const verifyActiveSyncChecksumNow = useCallback(
    async (options?: { silent?: boolean }): Promise<ActiveSyncState> => {
      const localChecksum = computeDatabaseContentHash(dbRef.current);
      const session = getGasSession();
      const baseChecksum = lastCloudHashRef.current || session?.lastContentHash || null;
      const localBaseVersion = typeof session?.serverVersion === 'number' ? session.serverVersion : 0;

      if (!session?.token) {
        const next: ActiveSyncState = {
          ...activeSyncMeta,
          status: 'idle',
          localChecksum,
          baseChecksum,
          localBaseVersion,
          lastCheckedAt: new Date().toISOString(),
          blockedReason: null,
        };
        return next;
      }

      setActiveSyncMeta((prev) => ({
        ...prev,
        status: 'checking',
      }));

      const res = await gasVerifyChecksumBeforeWrite({
        localContentHash: localChecksum,
        expectedBaseHash: baseChecksum,
        expectedBaseVersion: localBaseVersion,
        auditOnResult: true,
      });

      if (!res.ok) {
        setActiveSyncMeta((prev) => ({
          ...prev,
          status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline-queued' : 'error',
          lastCheckedAt: res.checkedAt,
          blockedReason: res.reason,
        }));
        if (!options?.silent) {
          toast(`Não foi possível verificar a planilha de controle: ${res.reason}`, true);
        }
        return {
          ...activeSyncMeta,
          status: 'error',
          localChecksum,
          baseChecksum,
          localBaseVersion,
          lastCheckedAt: res.checkedAt,
          blockedReason: res.reason,
        };
      }

      const nextStatus: ActiveSyncGuardStatus =
        res.status === 'conflict'
          ? 'blocked-conflict'
          : res.status === 'in-sync'
            ? 'in-sync'
            : 'local-ahead';

      const updatedMeta: Omit<ActiveSyncState, 'localChecksum'> = {
        status: nextStatus,
        baseChecksum: res.expectedBaseChecksum,
        remoteChecksum: res.remoteChecksum,
        localBaseVersion: res.localBaseVersion,
        remoteVersion: res.remoteVersion,
        remoteDevice: res.remoteDevice,
        remoteUpdatedAt: res.remoteUpdatedAt,
        lastCheckedAt: res.checkedAt,
        lastGuardOutcome: res.allowedToWrite ? 'allowed' : 'blocked',
        blockedReason: res.allowedToWrite ? null : res.reason,
        writesProtectedCount: activeSyncMeta.writesProtectedCount + (res.allowedToWrite ? 0 : 1),
        controlSheetTable: res.controlSheetTable,
      };
      setActiveSyncMeta(updatedMeta);

      if (!options?.silent) {
        if (!res.allowedToWrite) {
          toast(res.reason, true);
        } else if (res.status === 'in-sync') {
          toast(`Sincronização Ativa OK: checksum idêntico à planilha de controle (v${res.remoteVersion ?? 0}).`);
        } else {
          toast(`Planilha de controle verificada (v${res.remoteVersion ?? 0}): cliente atualizado e liberado para gravar.`);
        }
      }

      return {
        ...updatedMeta,
        localChecksum,
      };
    },
    [activeSyncMeta, toast],
  );

  const triggerActiveSyncPushNow = useCallback(async (): Promise<boolean> => {
    if (!isGasSessionActive()) {
      toast('Conecte sua sessão do Google Apps Script para sincronizar.', true);
      return false;
    }
    const check = await verifyActiveSyncChecksumNow({ silent: true });
    if (check.status === 'blocked-conflict') {
      toast(
        check.blockedReason ||
          'Gravação bloqueada pela Sincronização Ativa: há uma versão mais recente na planilha de controle.',
        true,
      );
      return false;
    }
    if (check.status === 'error' || check.status === 'offline-queued') {
      toast('Sem conexão com o Google Apps Script. Alterações ficam protegidas na fila local até reconectar.', true);
      return false;
    }
    pendingCloudSyncRef.current = true;
    await flushCloudSyncNow();
    return true;
  }, [flushCloudSyncNow, toast, verifyActiveSyncChecksumNow]);

  // Monitor periódico da conexão com o Google Apps Script (a cada 60s + retorno à aba + eventos online/offline)
  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void checkGasConnectionNow({ silent: true });
    }, 1800);

    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void checkGasConnectionNow({ silent: true });
    }, 60_000);

    const handleOnline = () => {
      void checkGasConnectionNow({ silent: true });
    };

    const handleOffline = () => {
      setGasQueueConnectionOnline(false);
      setGasConnectionHealth((prev) => ({
        ...prev,
        status: 'offline',
        lastCheckedAt: new Date().toISOString(),
        errorMessage: 'Sem conexão com a internet neste dispositivo.',
      }));
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastGasHealthCheckMsRef.current >= 20_000
      ) {
        void checkGasConnectionNow({ silent: true });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkGasConnectionNow, gasSession?.token]);

  const setAppsScriptStudyFolder = useCallback(
    async (folderIdOrUrl: string): Promise<boolean> => {
      const cleanInput = String(folderIdOrUrl || '').trim();
      if (!cleanInput) {
        toast('Informe o link ou ID da pasta do Google Drive.', true);
        return false;
      }
      const extractedId = extractDriveFolderId(cleanInput);
      const res = await gasSetStudyFolder(
        extractedId ? { folderId: extractedId } : { folderName: cleanInput },
      );
      if (!res.ok) {
        toast(res.error || 'Não foi possível associar a pasta no Google Apps Script.', true);
        return false;
      }
      if (res.folderId) setActiveDriveFolderId(res.folderId);
      if (res.folderName) setActiveDriveFolderName(res.folderName);
      if (res.folderUrl) setDriveFolderUrl(res.folderUrl);
      toast(`Pasta padrão "${res.folderName}" salva no servidor para todos os seus dispositivos!`);
      return true;
    },
    [toast],
  );

  const setupAppsScriptDailyBackup = useCallback(async (): Promise<boolean> => {
    const res = await gasSetupDailyBackupTrigger();
    if (!res.ok) {
      toast(res.error || 'Falha ao ativar backup diário automático no Google Apps Script.', true);
      return false;
    }
    toast(res.message || 'Backup diário automático ativado no servidor (03h)!');
    return true;
  }, [toast]);

  const checkLocalVsDriveDivergence = useCallback(async (): Promise<VersionComparisonReport | null> => {
    const scope = activeScopeRef.current;
    setIsCheckingDivergence(true);
    try {
      const localSummary = buildDatabaseVersionSummary(dbRef.current, {
        updatedAt: loadSyncMeta(scope).lastLocalEditAt || lastCloudSyncAt || new Date().toISOString(),
        version: getGasSession()?.serverVersion,
      });

      if (isGasSessionActive()) {
        const remote = await gasInspectRemoteVersion();
        if (!remote.ok) {
          const report: VersionComparisonReport = {
            checkedAt: new Date().toISOString(),
            backendMode: 'apps-script',
            hasDivergence: false,
            localSummary,
            driveSummary: null,
            error: remote.error || 'Não foi possível consultar a versão do Google Drive.',
          };
          setLatestVersionComparison(report);
          return report;
        }

        const localHash = computeDatabaseContentHash(dbRef.current);
        const driveSummary = remote.hasRemoteData
          ? {
              updatedAt: remote.updatedAt,
              version: remote.serverVersion,
              fileName: remote.fileName || CLOUD_SYNC_FILENAME,
              laws: Number(remote.summary?.laws || 0),
              scheduleTopics: Number(remote.summary?.scheduleTopics || 0),
              questions: Number(remote.summary?.questions || 0),
              annotations: Number(remote.summary?.annotations || 0),
              pdfs: Number(remote.summary?.pdfs || 0),
            }
          : null;

        const sessionVer = getGasSession()?.serverVersion || 0;
        const hashDiffers = Boolean(remote.contentHash && localHash && remote.contentHash !== localHash);
        const versionDiffers = Boolean(remote.serverVersion > 0 && sessionVer > 0 && remote.serverVersion !== sessionVer);
        const countsDiffer = Boolean(
          driveSummary &&
            (driveSummary.laws !== localSummary.laws ||
              driveSummary.scheduleTopics !== localSummary.scheduleTopics ||
              driveSummary.questions !== localSummary.questions ||
              driveSummary.annotations !== localSummary.annotations ||
              driveSummary.pdfs !== localSummary.pdfs),
        );
        const hasDivergence = Boolean(driveSummary && (hashDiffers || versionDiffers || countsDiffer));
        const divergenceReason = !driveSummary
          ? 'Ainda não há snapshot salvo na nuvem.'
          : versionDiffers
            ? `Versão do servidor (v${remote.serverVersion}) difere da versão local (v${sessionVer}).`
            : countsDiffer
              ? 'Quantidade de registros entre Local e Google Drive está diferente.'
              : hashDiffers
                ? 'Conteúdo interno diverge entre a versão Local e o Google Drive.'
                : undefined;

        const report: VersionComparisonReport = {
          checkedAt: new Date().toISOString(),
          backendMode: 'apps-script',
          hasDivergence,
          divergenceReason,
          localSummary,
          driveSummary,
          driveFileId: remote.fileId || undefined,
          driveFileName: remote.fileName || CLOUD_SYNC_FILENAME,
        };
        setLatestVersionComparison(report);

        if (hasDivergence && driveSummary) {
          recordConflictHistoryEntry(scope, {
            source: 'apps-script',
            kind: 'version-divergence',
            title: 'Divergência detectada na comparação Local × Drive',
            reason: divergenceReason || 'Local e Google Drive possuem conteúdos diferentes.',
            errorCode: 'MANUAL_CHECK_DIVERGENCE',
            localSummary,
            driveSummary,
          });
        }
        return report;
      }

      // Modo OAuth Drive legado
      const token = await getAccessToken();
      if (!token) {
        const report: VersionComparisonReport = {
          checkedAt: new Date().toISOString(),
          backendMode: 'google-drive-oauth',
          hasDivergence: false,
          localSummary,
          driveSummary: null,
          error: 'Conecte o Google Apps Script ou sua conta Google Drive para comparar versões.',
        };
        setLatestVersionComparison(report);
        return report;
      }

      const latestCloud = await downloadLatestCloudSync(token, {
        expectedEmail: googleUser?.email || undefined,
        bypassCache: true,
      });
      if (!latestCloud?.payload) {
        const report: VersionComparisonReport = {
          checkedAt: new Date().toISOString(),
          backendMode: 'google-drive-oauth',
          hasDivergence: false,
          divergenceReason: 'Nenhum arquivo de sincronização encontrado no Google Drive.',
          localSummary,
          driveSummary: null,
        };
        setLatestVersionComparison(report);
        return report;
      }

      const remoteDb = normalizeAndMergeDatabase(latestCloud.payload);
      const driveSummary = buildDatabaseVersionSummary(remoteDb, {
        updatedAt: latestCloud.file.modifiedTime || latestCloud.payload?.updatedAt || null,
        fileName: latestCloud.file.name,
      });
      const hasDivergence = computeDatabaseContentHash(dbRef.current) !== computeDatabaseContentHash(remoteDb);
      const report: VersionComparisonReport = {
        checkedAt: new Date().toISOString(),
        backendMode: 'google-drive-oauth',
        hasDivergence,
        divergenceReason: hasDivergence
          ? 'O snapshot local e a cópia do Google Drive possuem diferenças.'
          : undefined,
        localSummary,
        driveSummary,
        driveFileId: latestCloud.file.id,
        driveFileName: latestCloud.file.name,
      };
      setLatestVersionComparison(report);
      if (hasDivergence) {
        recordConflictHistoryEntry(scope, {
          source: 'google-drive',
          kind: 'version-divergence',
          title: 'Divergência detectada na comparação Local × Drive',
          reason: 'O snapshot local e o arquivo do Google Drive possuem dados diferentes.',
          errorCode: 'MANUAL_CHECK_DIVERGENCE',
          localSummary,
          driveSummary,
        });
      }
      return report;
    } catch (err: any) {
      const report: VersionComparisonReport = {
        checkedAt: new Date().toISOString(),
        backendMode: isGasSessionActive() ? 'apps-script' : 'google-drive-oauth',
        hasDivergence: false,
        localSummary: buildDatabaseVersionSummary(dbRef.current),
        driveSummary: null,
        error: err?.message || 'Erro ao comparar versão Local com o Google Drive.',
      };
      setLatestVersionComparison(report);
      return report;
    } finally {
      setIsCheckingDivergence(false);
    }
  }, [googleUser?.email, lastCloudSyncAt]);

  const resolveVersionDivergenceKeepLocal = useCallback(
    async (entryId?: string): Promise<boolean> => {
      const scope = activeScopeRef.current;
      setResolvingConflictAction('keep-local');
      try {
        // Cria ponto de restauração local de segurança antes de forçar envio
        const localCurHash = computeDatabaseContentHash(dbRef.current);
        await createLocalRestorePoint(scope, JSON.stringify(dbRef.current), {
          label: 'Segurança antes de manter versão Local sobre o Drive',
          reason: 'manual',
          contentHash: localCurHash,
          stats: {
            laws: Object.keys(dbRef.current.laws || {}).length,
            questions: (dbRef.current.questions || []).length,
            contests: (dbRef.current.contests || []).length,
            errors: (dbRef.current.annotations || []).length,
          },
        }).catch(() => {});

        const nowIso = new Date().toISOString();
        const curHash = computeDatabaseContentHash(dbRef.current);
        const payload = {
          version: 2,
          app: 'Central de Estudos',
          updatedAt: nowIso,
          contentHash: curHash,
          userEmail: googleUser?.email || getGasSession()?.username || undefined,
          data: dbRef.current,
        };

        const saved = await saveCloudSyncSnapshot(payload, undefined, { force: true });
        lastCloudDbRef.current = dbRef.current;
        lastCloudHashRef.current = curHash;
        pendingCloudSyncRef.current = false;
        setHasPendingCloudChanges(false);
        setLastCloudSyncAt(nowIso);
        recordUploadedFilesInCacheMeta(scope, {
          backupFiles: saved ? [saved] : [],
          extraPatch: {
            lastCloudSyncAt: nowIso,
            lastCloudContentHash: curHash,
            hasPendingCloudSync: false,
          },
        });

        updateConflictHistoryStatus(
          scope,
          entryId || 'ALL_PENDING_VERSION',
          'resolved-local',
          'Usuário escolheu manter a versão Local e enviá-la ao Google Drive.',
        );
        if (isGasSessionActive()) {
          void gasResolveConflict('ALL_PENDING', 'resolved-local', 'Versão Local mantida pelo usuário');
        }
        recordSyncActivity({
          category: 'drive-sync',
          operation: 'Conflito resolvido (Versão Local mantida)',
          status: 'success',
          message: 'Versão Local enviada ao Google Drive como versão oficial.',
        });
        toast('Versão Local mantida e enviada com sucesso para o Google Drive!');
        await checkLocalVsDriveDivergence();
        return true;
      } catch (err: any) {
        toast(err?.message || 'Falha ao enviar versão Local para o Google Drive.', true);
        return false;
      } finally {
        setResolvingConflictAction(null);
      }
    },
    [checkLocalVsDriveDivergence, googleUser?.email, recordSyncActivity, toast],
  );

  const resolveVersionDivergenceKeepDrive = useCallback(
    async (entryId?: string): Promise<boolean> => {
      const scope = activeScopeRef.current;
      setResolvingConflictAction('keep-drive');
      try {
        // Salva ponto de restauração de segurança do estado Local atual ANTES de substituir pelo Drive!
        const beforeRestoreHash = computeDatabaseContentHash(dbRef.current);
        await createLocalRestorePoint(scope, JSON.stringify(dbRef.current), {
          label: 'Backup automático local antes de adotar versão do Google Drive',
          reason: 'auto-pre-restore',
          contentHash: beforeRestoreHash,
          stats: {
            laws: Object.keys(dbRef.current.laws || {}).length,
            questions: (dbRef.current.questions || []).length,
            contests: (dbRef.current.contests || []).length,
            errors: (dbRef.current.annotations || []).length,
          },
        }).catch(() => {});

        const latestCloud = await downloadLatestCloudSync(undefined, {
          expectedEmail: googleUser?.email || getGasSession()?.username || undefined,
          bypassCache: true,
        });
        if (!latestCloud?.payload) {
          toast('Nenhum dado válido encontrado no Google Drive para restaurar.', true);
          return false;
        }

        let remoteDb = normalizeAndMergeDatabase(latestCloud.payload);
        if (latestCloud.incrementalDeltas?.length) {
          for (const incDelta of latestCloud.incrementalDeltas) {
            remoteDb = applyIncrementalDeltaToDatabase(remoteDb, incDelta);
          }
        }
        const remoteHash = computeDatabaseContentHash(remoteDb);
        const nowIso = latestCloud.file.modifiedTime || new Date().toISOString();

        applyRestoredDatabaseForScope(scope, remoteDb, nowIso);
        saveSyncMeta(scope, {
          lastCloudSyncAt: nowIso,
          lastCloudContentHash: remoteHash,
          hasPendingCloudSync: false,
        });
        lastCloudDbRef.current = remoteDb;
        lastCloudHashRef.current = remoteHash;
        pendingCloudSyncRef.current = false;
        setHasPendingCloudChanges(false);
        setLastCloudSyncAt(nowIso);
        if (isGasSessionActive()) {
          updateGasSessionMetadata({ lastContentHash: remoteHash, lastSyncedAt: nowIso });
          setActiveSyncMeta((prev) => ({
            ...prev,
            status: 'in-sync',
            baseChecksum: remoteHash,
            remoteChecksum: remoteHash,
            localBaseVersion: getGasSession()?.serverVersion ?? prev.localBaseVersion,
            remoteVersion: getGasSession()?.serverVersion ?? prev.remoteVersion,
            remoteUpdatedAt: nowIso,
            lastCheckedAt: new Date().toISOString(),
            lastGuardOutcome: 'allowed',
            blockedReason: null,
          }));
        }

        updateConflictHistoryStatus(
          scope,
          entryId || 'ALL_PENDING_VERSION',
          'resolved-drive',
          'Usuário escolheu restaurar a versão do Google Drive (ponto de segurança local salvo antes).',
        );
        if (isGasSessionActive()) {
          void gasResolveConflict('ALL_PENDING', 'resolved-drive', 'Versão do Drive adotada pelo usuário');
        }
        recordSyncActivity({
          category: 'drive-restore',
          operation: 'Conflito resolvido (Versão do Drive mantida)',
          status: 'success',
          message: 'Versão do Google Drive restaurada neste dispositivo (backup local salvo nos Pontos de Restauração).',
        });
        toast('Versão do Google Drive restaurada com sucesso! Um ponto de segurança local foi salvo antes da troca.');
        await checkLocalVsDriveDivergence();
        return true;
      } catch (err: any) {
        toast(err?.message || 'Falha ao baixar versão do Google Drive.', true);
        return false;
      } finally {
        setResolvingConflictAction(null);
      }
    },
    [applyRestoredDatabaseForScope, checkLocalVsDriveDivergence, googleUser?.email, recordSyncActivity, toast],
  );

  const dismissConflictHistoryEntry = useCallback((entryId: string) => {
    const scope = activeScopeRef.current;
    updateConflictHistoryStatus(scope, entryId, 'dismissed', 'Dispensado manualmente pelo usuário.');
  }, []);

  const clearResolvedConflictHistory = useCallback(() => {
    clearResolvedConflictHistoryForScope(activeScopeRef.current);
  }, []);

  const disconnectGoogleDrive = useCallback(async () => {
    if (isGasSessionActive()) {
      await disconnectAppsScript();
      return;
    }
    window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
    const prevScope = activeScopeRef.current;
    const nowIso = new Date().toISOString();
    if (prevScope !== 'offline_guest') {
      const prevSnapshot = JSON.stringify(dbRef.current);
      persistLocalDatabaseForScope(
        prevScope,
        prevSnapshot,
        nowIso,
        pendingCloudSyncRef.current ? { lastLocalEditAt: nowIso } : undefined,
      );
      if (driveConnected && driveTokenReady && pendingCloudSyncRef.current) {
        try {
          await flushCloudSyncNow();
        } catch {
          // ignore pre-logout cloud flush failure
        }
      }
    }
    await googleSignOut();
    syncedScopeOnceRef.current = null;
    const newScope = 'offline_guest';
    if (newScope !== activeScopeRef.current) {
      const snapshotBeforeSwitch = JSON.stringify(dbRef.current);
      persistLocalDatabaseForScope(activeScopeRef.current, snapshotBeforeSwitch, nowIso);
      try {
        localStorage.setItem(getTimerStorageKey(activeScopeRef.current), JSON.stringify(timerStateRef.current));
      } catch {
        // ignore
      }
      activeScopeRef.current = newScope;
      setStorageUserScope(newScope);
      const nextDb = loadStoredDatabase(newScope);
      isRestoringRef.current = true;
      skipPersistDbRef.current = nextDb;
      lastPersistedDbRef.current = nextDb;
      lastPersistedDbHashRef.current = computeDatabaseContentHash(nextDb);
      setDb(nextDb);
      dbRef.current = nextDb;
      window.setTimeout(() => {
        isRestoringRef.current = false;
      }, 80);
      const nextTimer = loadTimer(newScope);
      setTimerState(nextTimer);
      timerStateRef.current = nextTimer;
      setActiveTimerTopic(loadTimerTopic(newScope));
      setQuiz(null);
      void loadScopedDatabaseJson(newScope).then((idbSnap) => {
        if (!idbSnap || activeScopeRef.current !== newScope) return;
        let lsHas = false;
        try {
          lsHas = Boolean(localStorage.getItem(getDbStorageKey(newScope)));
        } catch {
          lsHas = false;
        }
        if (!shouldPreferIdbSnapshot(newScope, idbSnap, lsHas)) return;
        try {
          const idbParsed = applyTombstonesToMergedDatabase(
            normalizeAndMergeDatabase(JSON.parse(idbSnap.raw)),
            newScope,
          );
          isRestoringRef.current = true;
          skipPersistDbRef.current = idbParsed;
          lastPersistedDbRef.current = idbParsed;
          lastPersistedDbHashRef.current = computeDatabaseContentHash(idbParsed);
          setDb(idbParsed);
          dbRef.current = idbParsed;
          window.setTimeout(() => {
            isRestoringRef.current = false;
          }, 60);
        } catch {
          // ignore
        }
      });
    }
    lastCloudDbRef.current = null;
    lastBackupDbRef.current = null;
    lastCloudHashRef.current = null;
    lastBackupHashRef.current = null;
    lastBackupIsoRef.current = null;
    setGoogleUser(null);
    setDriveConnected(false);
    setDriveTokenReady(false);
    setDriveFolderUrl(null);
    setLastCloudSyncAt(null);
    setLastCacheVerifiedAt(null);
    setDriveSyncConflicts([]);
    setDriveConflictErrors({});
    dismissedConflictIdsRef.current.clear();
    toast('Conta desconectada. Alternado para ambiente local/offline.');
  }, [toast]);

  const clearDriveBrowserCache = useCallback(async () => {
    const scope = activeScopeRef.current;
    await clearDriveJsonCacheForScope(scope);
    invalidateDriveBrowserCacheMeta(scope);
    syncedScopeOnceRef.current = null;
    setLastCacheVerifiedAt(null);
    toast(
      'Cache local do navegador limpo. A próxima verificação buscará os backups e arquivos diretamente do Google Drive.',
    );
  }, [toast]);

  const ensureDriveToken = useCallback(async (): Promise<string | null> => {
    // Check cached/persisted token synchronously first so connectGoogleDrive() runs inside the user gesture
    let activeToken = await getAccessToken({ allowSilentRefresh: false });
    if (!activeToken) {
      const ok = await connectGoogleDrive();
      if (!ok) return null;
      activeToken = await getAccessToken({ allowSilentRefresh: false });
    }
    if (activeToken) {
      setDriveTokenReady(true);
    }
    return activeToken;
  }, [connectGoogleDrive]);

  const authorizeDriveFolderViaPicker = useCallback(async (): Promise<boolean> => {
    const token = await ensureDriveToken();
    if (!token) return false;

    const targetFolderId =
      drivePermissionNeedsPicker?.folderId || getPreferredStudyFolder().id || DEFAULT_STUDY_FOLDER_ID;
    const isMobileViewport =
      typeof window !== 'undefined' &&
      (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

    let picked: { folders: Array<{ id: string; name: string; url?: string }>; files: Array<{ id: string; name: string; mimeType: string }> } | null = null;
    if (!isMobileViewport) {
      try {
        picked = await openDrivePicker({
          token,
          parentFolderId: targetFolderId,
          mode: 'folders-and-files',
          title: 'Selecione a pasta/arquivos de backup para autorizar a sincronização',
        });
      } catch {
        picked = null;
      }
    }

    setIsSyncingDrive(true);
    try {
      const scope = activeScopeRef.current;
      let activeFolderId = picked?.folders?.[0]?.id || targetFolderId;
      let activeFolderName =
        picked?.folders?.[0]?.name || drivePermissionNeedsPicker?.folderName || DRIVE_FOLDER_NAME;

      if (picked?.folders?.[0]) {
        const pickedFolder = picked.folders[0];
        associateAccountDefaultDriveFolder({
          id: pickedFolder.id,
          name: pickedFolder.name,
          url: pickedFolder.url || `https://drive.google.com/drive/folders/${pickedFolder.id}`,
        });
      }

      const jsonCandidates = (picked?.files || []).filter(
        (f) => f.name.toLowerCase().endsWith('.json') || f.mimeType === 'application/json',
      );
      const backupsList = await listDatabaseBackupsFromDrive(token, { activeFolderId }).catch(() => []);
      const latestCloud = await downloadLatestCloudSync(token, {
        activeFolderId,
        expectedEmail: googleUser?.email || undefined,
        prefetchedBackups: backupsList,
        bypassCache: true,
      }).catch(() => null);

      let restoredAny = false;
      let nextDb = dbRef.current;
      if (latestCloud?.payload || latestCloud?.incrementalDeltas?.length) {
        let cloudDb = latestCloud.payload ? normalizeAndMergeDatabase(latestCloud.payload) : nextDb;
        if (latestCloud.incrementalDeltas?.length) {
          for (const incDelta of latestCloud.incrementalDeltas) {
            cloudDb = applyIncrementalDeltaToDatabase(cloudDb, incDelta);
          }
        }
        nextDb = cloudDb;
        restoredAny = true;
      } else if (jsonCandidates.length > 0) {
        const pickedPayload = await downloadBackupFileFromDrive(jsonCandidates[0].id, token, {
          bypassCache: true,
        }).catch(() => null);
        if (pickedPayload && typeof pickedPayload === 'object') {
          nextDb = isIncrementalBackupPayload(pickedPayload)
            ? applyIncrementalDeltaToDatabase(dbRef.current, pickedPayload)
            : normalizeAndMergeDatabase(pickedPayload);
          restoredAny = true;
        }
      }

      const flushedPicker = await flushPendingDriveDeletes(scope, token).catch(() => ({
        deletedIds: [] as string[],
        remainingCount: 0,
      }));
      if (flushedPicker.deletedIds.length > 0) {
        removeFileIdsFromCacheMeta(scope, flushedPicker.deletedIds);
      }

      const driveFiles = await listAllStudyFilesInDrive(token).catch(() => []);
      const studyFiles = (picked?.files || []).filter((f) => !jsonCandidates.some((j) => j.id === f.id));
      const res = await restoreFilesAndOrphansFromDriveList(
        nextDb,
        driveFiles,
        token,
        scope,
        (current, total, label) => setRestoreProgress({ current, total, label }),
        studyFiles.length > 0
          ? {
              onlyFileIds: studyFiles.map((f) => f.id),
              importFromAnyFolder: true,
              skipTargetDbBlobs: !restoredAny,
            }
          : { importFromAnyFolder: false, skipTargetDbBlobs: !restoredAny },
      );

      if (restoredAny || res.filesRestored > 0 || res.orphansImported > 0) {
        applyRestoredDatabaseForScope(scope, res.updatedDb);
      }

      let writableNow = await verifyDriveFolderWritable(activeFolderId, token).catch(() => false);
      if (!writableNow) {
        // Automatically create or switch to an app-owned writable study folder so mobile/Drive never stays blocked
        setPreferredStudyFolder({ id: null, name: activeFolderName || DRIVE_FOLDER_NAME });
        const resolvedFolder = await getOrCreateStudyFolder(token);
        activeFolderId = resolvedFolder.id;
        activeFolderName = resolvedFolder.name;
        associateAccountDefaultDriveFolder({
          id: resolvedFolder.id,
          name: resolvedFolder.name,
          url: resolvedFolder.webViewLink || `https://drive.google.com/drive/folders/${resolvedFolder.id}`,
        });
        await syncStudySubFoldersInDrive(resolvedFolder.id, token).catch(() => ({}));
        writableNow = true;
      }

      setDrivePermissionNeedsPicker(null);
      syncedScopeOnceRef.current = scope;
      if (writableNow) {
        const nowIso = new Date().toISOString();
        const payload = {
          version: 2,
          app: 'Central de Estudos',
          updatedAt: nowIso,
          contentHash: computeDatabaseContentHash(res.updatedDb),
          userEmail: googleUser?.email || undefined,
          data: res.updatedDb,
        };
        await saveCloudSyncSnapshot(payload, token).catch(() => {});
        setLastCloudSyncAt(nowIso);
        pendingCloudSyncRef.current = false;
        setHasPendingCloudChanges(false);
      }
      toast(`Pasta sincronizada "${activeFolderName}" ativada e gravação liberada no Google Drive!`);
      return true;
    } catch (err: any) {
      toast(`Não foi possível ativar a pasta do Drive: ${err?.message || 'Erro'}`, true);
      return false;
    } finally {
      setRestoreProgress(null);
      setIsSyncingDrive(false);
    }
  }, [
    applyRestoredDatabaseForScope,
    drivePermissionNeedsPicker?.folderId,
    drivePermissionNeedsPicker?.folderName,
    ensureDriveToken,
    googleUser?.email,
    toast,
  ]);

  const syncAllLocalFilesToDrive = useCallback(async (): Promise<{
    synced: number;
    errors: number;
    folderUrl?: string;
  }> => {
    const activeToken = await ensureDriveToken();
    if (!activeToken) return { synced: 0, errors: 1 };

    setIsSyncingDrive(true);
    let synced = 0;
    let errors = 0;
    let folderLink = driveFolderUrl || undefined;

    try {
      const folder = await getOrCreateStudyFolder(activeToken);
      folderLink = folder.webViewLink;
      if (folderLink) setDriveFolderUrl(folderLink);

      const scope = activeScopeRef.current || 'offline_guest';
      const cur = dbRef.current;
      const existingDriveFiles = await listAllStudyFilesInDrive(activeToken);
      const report = runDriveTimestampComparison(cur, existingDriveFiles, scope, {
        includeDismissed: true,
        sourceLabel: 'Comparação de timestamps na sincronização manual',
      });

      const allBlobs = await getAllFileBlobs();
      const blobByKey = new Map(allBlobs.map((b) => [b.key, b.blob]));
      const handledBlobKeys = new Set<string>();
      const uploadedDriveFiles: DriveFileInfo[] = [];
      const failedFileEvents: SyncAffectedFile[] = [];
      let skipped = report.inSync.length + report.driveNewer.length;

      for (const comp of [...report.localOnly, ...report.localNewer]) {
        handledBlobKeys.add(comp.blobKey);
        const blob = blobByKey.get(comp.blobKey);
        if (!blob) continue;
        try {
          const uploadedFile = await uploadFileToDrive(
            blob,
            comp.name,
            activeToken,
            comp.subfolder,
            {
              ...(comp.driveFile ? { existingFileId: comp.driveFile.id } : {}),
              moduleTag: comp.moduleLabel,
              sourceAction: comp.status === 'local-newer' ? 'manual-update' : 'manual-upload',
            },
          );
          uploadedDriveFiles.push(uploadedFile);
          synced += 1;
        } catch (err) {
          console.error(`Erro ao sincronizar ${comp.blobKey}:`, err);
          failedFileEvents.push({
            name: comp.name,
            action: 'failed',
            module: comp.moduleLabel,
            detail: err instanceof Error ? err.message : 'Falha ao enviar arquivo',
          });
          errors += 1;
        }
      }

      // Fallback for any orphaned local blobs not referenced in StudyDatabase
      const existingNamesLower = new Set(
        [...existingDriveFiles, ...uploadedDriveFiles].map((f) => f.name.toLowerCase()),
      );
      for (const item of allBlobs) {
        if (handledBlobKeys.has(item.key) || item.key.endsWith('::clean')) continue;
        const targetName = item.key.endsWith('.pdf') ? item.key : `${item.key}.pdf`;
        if (existingNamesLower.has(targetName.toLowerCase())) {
          skipped += 1;
          continue;
        }
        try {
          const uploadedFile = await uploadFileToDrive(item.blob, targetName, activeToken, undefined, {
            moduleTag: 'LocalBlob',
            sourceAction: 'manual-upload',
          });
          existingNamesLower.add(targetName.toLowerCase());
          uploadedDriveFiles.push(uploadedFile);
          synced += 1;
        } catch (err) {
          console.error(`Erro ao sincronizar ${item.key}:`, err);
          failedFileEvents.push({
            name: targetName,
            action: 'failed',
            detail: err instanceof Error ? err.message : 'Falha ao enviar arquivo',
          });
          errors += 1;
        }
      }

      // Sync the database snapshot to Drive only if altered since last sync
      const curHash = computeDatabaseContentHash(dbRef.current);
      let savedSyncFile: DriveFileInfo | null = null;
      if (lastCloudHashRef.current !== curHash) {
        const nowIso = new Date().toISOString();
        savedSyncFile = await saveCloudSyncSnapshot(
          {
            version: 2,
            app: 'Central de Estudos',
            updatedAt: nowIso,
            contentHash: curHash,
            userEmail: googleUser?.email || undefined,
            data: dbRef.current,
          },
          activeToken,
        );
        lastCloudDbRef.current = dbRef.current;
        lastCloudHashRef.current = curHash;
        saveSyncMeta(scope, {
          lastCloudSyncAt: nowIso,
          lastCloudContentHash: curHash,
        });
        setLastCloudSyncAt(nowIso);
      }

      if (uploadedDriveFiles.length > 0 || savedSyncFile) {
        const combinedFilesMap = buildDriveSignatureMap([...existingDriveFiles, ...uploadedDriveFiles]);
        const updatedMeta = recordUploadedFilesInCacheMeta(scope, {
          backupFiles: savedSyncFile ? [savedSyncFile] : [],
          driveFiles: uploadedDriveFiles,
          folderId: folder.id,
          extraPatch: {
            cachedDriveFilesSignatureMap: combinedFilesMap,
            lastDriveFilesSignature: serializeDriveSignatureMap(combinedFilesMap),
          },
        });
        if (updatedMeta.lastCacheVerifiedAt) setLastCacheVerifiedAt(updatedMeta.lastCacheVerifiedAt);
      }

      recordSyncActivity({
        category: 'drive-upload',
        operation: 'Sincronização manual do acervo local',
        status: errors > 0 || report.deletedConflicts.length > 0 ? 'warning' : 'success',
        message:
          synced > 0
            ? `${synced} arquivo(s) enviado(s)/atualizado(s) no Drive; ${skipped} já atualizado(s).`
            : `Todos os ${skipped} arquivo(s) locais já estão atualizados no Google Drive.`,
        affectedFiles: [
          ...uploadedDriveFiles.map((uf) => ({
            name: uf.name,
            action: 'uploaded' as const,
            driveFileId: uf.id,
            syncOrigin: uf.syncOrigin || 'internal',
          })),
          ...(savedSyncFile
            ? [
                {
                  name: savedSyncFile.name,
                  action: 'uploaded' as const,
                  driveFileId: savedSyncFile.id,
                  syncOrigin: savedSyncFile.syncOrigin || 'internal',
                },
              ]
            : []),
          ...failedFileEvents,
        ],
        stats: { uploaded: synced + (savedSyncFile ? 1 : 0) },
      });

      if (synced > 0) {
        toast(`Sincronização concluída! ${synced} arquivo(s) e banco de dados salvos no Drive.`);
      } else if (errors === 0) {
        toast(`Banco de dados sincronizado! Todos os ${skipped} arquivo(s) já estão atualizados no Google Drive.`);
      } else {
        toast('Banco sincronizado, mas houve falha em alguns arquivos.', true);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
      recordSyncActivity({
        category: 'drive-upload',
        operation: 'Falha ao sincronizar acervo local com o Drive',
        status: 'error',
        errorCode: msg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
        message: msg || 'Falha geral na sincronização do acervo.',
      });
      toast(`Erro na sincronização: ${err?.message || 'Falha geral'}`, true);
      errors += 1;
    } finally {
      setIsSyncingDrive(false);
    }

    return { synced, errors, folderUrl: folderLink };
  }, [driveFolderUrl, ensureDriveToken, googleUser?.email, recordSyncActivity, runDriveTimestampComparison, toast]);

  const selectDriveStudyFolder = useCallback(
    async (folder: { id?: string; name?: string }): Promise<boolean> => {
      const activeToken = await ensureDriveToken();
      if (!activeToken) return false;

      const rawNameOrLink = (folder.name || '').trim();
      const rawId = (folder.id || '').trim() || extractDriveFolderId(rawNameOrLink) || '';

      try {
        if (rawId) {
          const meta = await getDriveFolderMetadata(rawId, activeToken);
          if (!meta) {
            toast(
              'Não foi possível acessar essa pasta por link/ID. Criando ou vinculando pasta gravável no seu Google Drive...',
            );
            setPreferredStudyFolder({ id: null, name: DRIVE_FOLDER_NAME });
            const fallbackResolved = await getOrCreateStudyFolder(activeToken);
            associateAccountDefaultDriveFolder({
              id: fallbackResolved.id,
              name: fallbackResolved.name,
              url: fallbackResolved.webViewLink || `https://drive.google.com/drive/folders/${fallbackResolved.id}`,
            });
            setDrivePermissionNeedsPicker(null);
            toast(`Pasta padrão da conta ativada no Google Drive: "${fallbackResolved.name}".`);
            return true;
          }

          const targetId = meta.id;
          const targetName = meta.name;
          const targetUrl = meta.webViewLink || `https://drive.google.com/drive/folders/${meta.id}`;
          const writable = await verifyDriveFolderWritable(meta.id, activeToken).catch(() => false);

          const scope = activeScopeRef.current;
          const prevSyncedFolder = loadSyncMeta(scope).lastSyncedFolderId;
          associateAccountDefaultDriveFolder({ id: targetId, name: targetName, url: targetUrl });
          if (writable) {
            setDrivePermissionNeedsPicker(null);
            await syncStudySubFoldersInDrive(targetId, activeToken).catch(() => ({}));
          } else {
            setDrivePermissionNeedsPicker({
              folderId: targetId,
              folderName: targetName,
              count: 1,
            });
          }
          if (prevSyncedFolder && prevSyncedFolder !== targetId) {
            invalidateDriveBrowserCacheMeta(scope);
            syncedScopeOnceRef.current = null;
            setLastCacheVerifiedAt(null);
          }
          toast(
            `Pasta "${targetName}" associada como padrão da conta para todos os salvamentos e leituras!`,
          );
          return true;
        }

        const cleanName = rawNameOrLink || 'Central de Estudos - Materiais';
        setPreferredStudyFolder({ id: null, name: cleanName });
        const resolved = await getOrCreateStudyFolder(activeToken);
        const scope = activeScopeRef.current;
        const prevSyncedFolder = loadSyncMeta(scope).lastSyncedFolderId;
        associateAccountDefaultDriveFolder({
          id: resolved.id,
          name: resolved.name,
          url: resolved.webViewLink || `https://drive.google.com/drive/folders/${resolved.id}`,
        });
        setDrivePermissionNeedsPicker(null);
        await syncStudySubFoldersInDrive(resolved.id, activeToken).catch(() => ({}));
        if (prevSyncedFolder && prevSyncedFolder !== resolved.id) {
          invalidateDriveBrowserCacheMeta(scope);
          syncedScopeOnceRef.current = null;
          setLastCacheVerifiedAt(null);
        }
        toast(
          `Pasta "${resolved.name}" associada como padrão da conta para todos os salvamentos e leituras!`,
        );
        return true;
      } catch (err: any) {
        if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        toast(`Erro ao selecionar pasta do Drive: ${err?.message || 'Falha'}`, true);
        return false;
      }
    },
    [associateAccountDefaultDriveFolder, ensureDriveToken, toast],
  );

  const restoreAllFromGoogleDrive = useCallback(
    async (options?: {
      silentIfEmpty?: boolean;
      folderId?: string;
      forceModule?: 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries';
      associateAsDefault?: boolean;
    }): Promise<{
      restoredDb: boolean;
      filesRestored: number;
      orphansImported: number;
      permissionBlockedCount?: number;
    }> => {
      let activeToken = await ensureDriveToken();
      if (!activeToken) return { restoredDb: false, filesRestored: 0, orphansImported: 0, permissionBlockedCount: 0 };

      const isExplicitAll = options?.folderId === 'all';
      const explicitFolderId =
        options?.folderId && options.folderId !== 'all' ? options.folderId : undefined;
      const forceModule = options?.forceModule || 'auto';

      setIsSyncingDrive(true);
      try {
        const executeRestore = async (tokenToUse: string) => {
          const scope = activeScopeRef.current;
          if (
            explicitFolderId &&
            explicitFolderId !== 'root' &&
            options?.associateAsDefault !== false
          ) {
            const meta = await getDriveFolderMetadata(explicitFolderId, tokenToUse).catch(() => null);
            if (meta) {
              associateAccountDefaultDriveFolder({
                id: meta.id,
                name: meta.name,
                url: meta.webViewLink || `https://drive.google.com/drive/folders/${meta.id}`,
              });
            }
          }

          const isGasMode = isGasSessionActive();
          let folder = await getOrCreateStudyFolder(tokenToUse);
          if (folder.id && folder.id !== 'gas_root') {
            associateAccountDefaultDriveFolder({
              id: folder.id,
              name: folder.name || getPreferredStudyFolder().name,
              url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
            });
          }

          let backupsList: DriveFileInfo[] = [];
          let driveFiles: DriveFileInfo[] = [];
          let latestCloud: Awaited<ReturnType<typeof downloadLatestCloudSync>> = null;
          let gasListWarning: string | null = null;

          if (isGasMode) {
            // In Apps Script mode, run sequentially to avoid concurrent DriveApp contention/timeouts
            // and skip redundant listBackups (derived from driveFiles instead).
            setRestoreProgress({
              current: 1,
              total: 3,
              label: 'Carregando banco de dados do Google Apps Script...',
            });
            latestCloud = await downloadLatestCloudSync(tokenToUse, {
              activeFolderId: folder.id,
              expectedEmail: googleUser?.email || undefined,
              bypassCache: true,
            });

            // Re-read folder now that gasPullState may have synced the real root Drive folderId
            folder = await getOrCreateStudyFolder(tokenToUse);

            setRestoreProgress({
              current: 2,
              total: 3,
              label: 'Listando arquivos e subpastas no Google Drive (pode levar alguns instantes)...',
            });
            try {
              driveFiles = await listAllStudyFilesInDrive(tokenToUse);
            } catch (listErr: any) {
              if (latestCloud?.payload) {
                gasListWarning = String(listErr?.message || 'Não foi possível listar a pasta de arquivos agora.');
                console.warn('Falha ao listar arquivos do Drive via Apps Script; prosseguindo com o banco restaurado:', listErr);
                driveFiles = [];
              } else {
                throw listErr;
              }
            }

            // Re-read folder again in case gasListFiles resolved the real root folderId
            folder = await getOrCreateStudyFolder(tokenToUse);
            if (folder.id && folder.id !== 'gas_root') {
              associateAccountDefaultDriveFolder({
                id: folder.id,
                name: folder.name || getPreferredStudyFolder().name,
                url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
              });
            }

            backupsList = driveFiles.filter(
              (df) =>
                df.subfolderName === 'Backups' ||
                df.name.startsWith('backup_central_estudos') ||
                df.name.startsWith('backup_incremental_central_estudos') ||
                df.name === CLOUD_SYNC_FILENAME,
            );
          } else {
            const targetFolderIdPre = isExplicitAll ? undefined : explicitFolderId || folder.id;
            const [, fetchedBackups, fetchedFiles] = await Promise.all([
              syncStudySubFoldersInDrive(folder.id, tokenToUse).catch(() => ({})),
              listDatabaseBackupsFromDrive(tokenToUse, { activeFolderId: folder.id }),
              listAllStudyFilesInDrive(tokenToUse),
            ]);
            backupsList = fetchedBackups;
            driveFiles = fetchedFiles;

            latestCloud = await downloadLatestCloudSync(
              tokenToUse,
              targetFolderIdPre
                ? {
                    onlyFolderId: explicitFolderId ? targetFolderIdPre : undefined,
                    activeFolderId: folder.id,
                    strictFolder: Boolean(explicitFolderId),
                    expectedEmail: googleUser?.email || undefined,
                    prefetchedBackups: backupsList,
                    bypassCache: true,
                  }
                : {
                    activeFolderId: folder.id,
                    expectedEmail: googleUser?.email || undefined,
                    prefetchedBackups: backupsList,
                    bypassCache: true,
                  },
            );
          }

          const targetFolderId = isExplicitAll
            ? undefined
            : explicitFolderId || (folder.id && folder.id !== 'gas_root' ? folder.id : undefined);

          const folderFilteredFiles = targetFolderId
            ? driveFiles.filter((df) =>
                targetFolderId === 'root'
                  ? !df.parents || df.parents.length === 0 || df.folderPath === 'Meu Drive (Raiz)'
                  : Boolean(df.parents?.includes(targetFolderId) || df.ancestorFolderIds?.includes(targetFolderId)),
              )
            : driveFiles;
          const matchingFolderFiles =
            !explicitFolderId && folderFilteredFiles.length === 0 ? driveFiles : folderFilteredFiles;

          const hasCloudData = Boolean(latestCloud?.payload || latestCloud?.incrementalDeltas?.length);
          if (!hasCloudData && matchingFolderFiles.length === 0) {
            recordSyncActivity({
              category: 'drive-restore',
              operation: 'Restauração do Google Drive',
              status: 'warning',
              message: targetFolderId
                ? 'Nenhum backup ou arquivo compatível encontrado na pasta selecionada.'
                : 'Nenhum backup ou arquivo encontrado nas pastas do Google Drive.',
            });
            if (!options?.silentIfEmpty) {
              toast(
                targetFolderId
                  ? 'Nenhum backup ou arquivo compatível encontrado dentro da pasta selecionada.'
                  : 'Nenhum backup ou arquivo encontrado nas pastas do Google Drive desta conta.',
                true,
              );
            }
            return { restoredDb: false, filesRestored: 0, orphansImported: 0, permissionBlockedCount: 0 };
          }

          let baseDb = dbRef.current;
          let restoredDb = false;
          let cloudIso = new Date().toISOString();

          if (hasCloudData && latestCloud) {
            baseDb = latestCloud.payload
              ? normalizeAndMergeDatabase(latestCloud.payload)
              : dbRef.current;
            if (latestCloud.incrementalDeltas?.length) {
              for (const incDelta of latestCloud.incrementalDeltas) {
                baseDb = applyIncrementalDeltaToDatabase(baseDb, incDelta);
              }
            }
            const latestDeltaIso =
              latestCloud.incrementalDeltas?.[latestCloud.incrementalDeltas.length - 1]?.updatedAt;
            restoredDb = true;
            cloudIso =
              latestDeltaIso ||
              latestCloud.payload?.updatedAt ||
              latestCloud.payload?.exportedAt ||
              latestCloud.file.modifiedTime ||
              latestCloud.file.createdTime ||
              cloudIso;
          }

          const hasStudyFolderFiles = driveFiles.some((df) => df.isInStudyFolder);
          const effectiveOnlyFolderId =
            isGasMode && !explicitFolderId
              ? undefined
              : targetFolderId;
          const {
            updatedDb,
            filesRestored,
            orphansImported,
            permissionBlockedCount,
            skippedTombstonesCount,
            fileEvents,
          } =
            await restoreFilesAndOrphansFromDriveList(
              baseDb,
              driveFiles,
              tokenToUse,
              scope,
              (current, total, label) => setRestoreProgress({ current, total, label }),
              effectiveOnlyFolderId
                ? {
                    onlyFolderId: effectiveOnlyFolderId,
                    forceModule,
                    importFromAnyFolder: true,
                    skipTargetDbBlobs: !restoredDb,
                    lazyBinaryBlobs: isGasMode,
                  }
                : {
                    importFromAnyFolder: !hasStudyFolderFiles || isGasMode,
                    forceModule,
                    lazyBinaryBlobs: isGasMode,
                  },
            );

          if (gasListWarning) {
            toast(
              `Banco de dados restaurado, mas a listagem de arquivos do Drive demorou demais (${gasListWarning}).`,
              true,
            );
          }

          applyRestoredDatabaseForScope(scope, updatedDb, restoredDb ? cloudIso : undefined);
          if (restoredDb) {
            const restoredHash = computeDatabaseContentHash(updatedDb);
            lastCloudDbRef.current = updatedDb;
            lastCloudHashRef.current = restoredHash;
            lastBackupDbRef.current = updatedDb;
            lastBackupHashRef.current = restoredHash;
            lastBackupIsoRef.current = cloudIso;
            saveSyncMeta(scope, {
              lastCloudContentHash: restoredHash,
              lastBackupContentHash: restoredHash,
            });
          }
          if (!targetFolderId) {
            const scopedB = selectScopedBackupList(backupsList, { activeFolderId: folder.id });
            const backupMap = buildDriveSignatureMap(scopedB);
            const filesMap = buildDriveSignatureMap(driveFiles);
            const verifiedAt = new Date().toISOString();
            saveSyncMeta(scope, {
              lastSyncedFolderId: folder.id,
              lastSubfoldersSyncedFolderId: folder.id,
              cachedBackupSignatureMap: backupMap,
              lastCloudBackupSignature: serializeDriveSignatureMap(backupMap),
              cachedDriveFilesSignatureMap: filesMap,
              lastDriveFilesSignature: serializeDriveSignatureMap(filesMap),
              lastCacheVerifiedAt: verifiedAt,
            });
            setLastCacheVerifiedAt(verifiedAt);
          }
          syncedScopeOnceRef.current = scope;

          const restoreTimestampReport = runDriveTimestampComparison(updatedDb, driveFiles, scope, {
            onlyFolderId: targetFolderId,
            includeDismissed: true,
            sourceLabel: 'Comparação de timestamps na restauração do Drive',
          });

          const totalFiles = filesRestored + orphansImported;
          recordSyncActivity({
            category: 'drive-restore',
            operation: targetFolderId ? 'Restauração de pasta do Google Drive' : 'Restauração completa do Google Drive',
            status: permissionBlockedCount > 0 || restoreTimestampReport.deletedConflicts.length > 0 ? 'warning' : 'success',
            message: `${restoredDb ? 'Banco restaurado' : 'Pasta verificada'}. ${filesRestored} arquivo(s) baixado(s)/atualizado(s), ${orphansImported} órfão(s) importado(s), ${skippedTombstonesCount} bloqueado(s) por exclusão (${restoreTimestampReport.deletedConflicts.length} conflito(s) aguardando decisão).`,
            affectedFiles: [...fileEvents],
            stats: {
              restored: filesRestored,
              imported: orphansImported,
              skippedTombstones: skippedTombstonesCount,
            },
          });

          if (permissionBlockedCount > 0 && totalFiles === 0) {
            toast(
              'Esses arquivos foram enviados fora do app. Use "Selecionar arquivos dentro da pasta no Drive" para autorizar o download pelo Google.',
              true,
            );
          } else {
            toast(
              restoredDb
                ? `Restauração concluída! Banco de dados e ${totalFiles} arquivo(s) restaurados do Google Drive.`
                : totalFiles > 0
                ? `${totalFiles} arquivo(s) restaurado(s) da pasta selecionada para o sistema!`
                : 'Pasta verificada — todos os arquivos encontrados já estão atualizados localmente.',
            );
          }

          return { restoredDb, filesRestored, orphansImported, permissionBlockedCount };
        };

        try {
          return await executeRestore(activeToken);
        } catch (err: any) {
          if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
            clearAccessTokenOnly();
            setDriveTokenReady(false);
            const reconnected = await connectGoogleDrive();
            activeToken = reconnected ? await getAccessToken() : null;
            if (activeToken) {
              return await executeRestore(activeToken);
            }
          }
          throw err;
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        recordSyncActivity({
          category: 'drive-restore',
          operation: 'Falha ao restaurar do Google Drive',
          status: 'error',
          errorCode: msg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
          message: msg || 'Falha na restauração do Google Drive.',
        });
        toast(`Erro ao restaurar dados do Google Drive: ${err?.message || 'Falha'}`, true);
        return { restoredDb: false, filesRestored: 0, orphansImported: 0, permissionBlockedCount: 0 };
      } finally {
        setRestoreProgress(null);
        setIsSyncingDrive(false);
      }
    },
    [applyRestoredDatabaseForScope, connectGoogleDrive, ensureDriveToken, googleUser?.email, recordSyncActivity, runDriveTimestampComparison, toast],
  );

  const pickDriveFolderOrFiles = useCallback(
    async (options?: {
      parentFolderId?: string;
      mode?: 'folders-and-files' | 'files-only' | 'folders-only';
      targetModule?: 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries';
      autoRestore?: boolean;
    }): Promise<{
      folder?: { id: string; name: string };
      restoredDb: boolean;
      filesRestored: number;
      orphansImported: number;
      permissionBlockedCount: number;
    } | null> => {
      const activeToken = await ensureDriveToken();
      if (!activeToken) return null;

      try {
        const picked = await openDrivePicker({
          token: activeToken,
          parentFolderId: options?.parentFolderId,
          mode: options?.mode || 'folders-and-files',
        });
        if (!picked) return null;

        const scope = activeScopeRef.current;
        const targetModule = options?.targetModule || 'auto';

        // Always register picked folder as the account's default folder for all saves and reads
        if (picked.folders.length > 0) {
          const folder = picked.folders[0];
          const writable = await verifyDriveFolderWritable(folder.id, activeToken).catch(() => false);
          const prevSyncedFolder = loadSyncMeta(scope).lastSyncedFolderId;
          associateAccountDefaultDriveFolder({
            id: folder.id,
            name: folder.name,
            url: folder.url || `https://drive.google.com/drive/folders/${folder.id}`,
          });
          if (writable) {
            setDrivePermissionNeedsPicker(null);
            await syncStudySubFoldersInDrive(folder.id, activeToken).catch(() => ({}));
          } else {
            setDrivePermissionNeedsPicker({
              folderId: folder.id,
              folderName: folder.name,
              count: 1,
            });
          }
          if (prevSyncedFolder && prevSyncedFolder !== folder.id) {
            invalidateDriveBrowserCacheMeta(scope);
            syncedScopeOnceRef.current = null;
            setLastCacheVerifiedAt(null);
          }
        }

        if (picked.files.length > 0) {
          setIsSyncingDrive(true);
          try {
            let baseDb = dbRef.current;
            let restoredDb = false;
            let cloudIso = new Date().toISOString();

            const jsonFile = picked.files.find(
              (f) => f.name.toLowerCase().endsWith('.json') || f.mimeType === 'application/json',
            );
            if (jsonFile) {
              const payload = await downloadBackupFileFromDrive(jsonFile.id, activeToken);
              baseDb = isIncrementalBackupPayload(payload)
                ? applyIncrementalDeltaToDatabase(dbRef.current, payload)
                : normalizeAndMergeDatabase(payload);
              restoredDb = true;
              cloudIso = payload?.updatedAt || payload?.exportedAt || cloudIso;
            }

            const studyCandidates: DriveFileInfo[] = picked.files
              .filter((f) => f.id !== jsonFile?.id)
              .map((f) => ({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType || 'application/pdf',
                webViewLink: f.url,
              }));

            let filesRestored = 0;
            let orphansImported = 0;
            let permissionBlockedCount = 0;
            let skippedTombstonesCount = 0;
            let fileEvents: SyncAffectedFile[] = [];

            if (studyCandidates.length > 0) {
              const res = await restoreFilesAndOrphansFromDriveList(
                baseDb,
                studyCandidates,
                activeToken,
                scope,
                (current, total, label) => setRestoreProgress({ current, total, label }),
                {
                  onlyFileIds: studyCandidates.map((c) => c.id),
                  forceModule: targetModule,
                  importFromAnyFolder: true,
                  skipTargetDbBlobs: true,
                },
              );
              baseDb = res.updatedDb;
              filesRestored = res.filesRestored;
              orphansImported = res.orphansImported;
              permissionBlockedCount = res.permissionBlockedCount;
              skippedTombstonesCount = res.skippedTombstonesCount;
              fileEvents = res.fileEvents;
            }

            if (restoredDb || filesRestored > 0 || orphansImported > 0) {
              applyRestoredDatabaseForScope(scope, baseDb, restoredDb ? cloudIso : undefined);
            }

            const total = filesRestored + orphansImported;
            recordSyncActivity({
              category: 'drive-restore',
              operation: 'Importação via seletor do Google Drive',
              status: permissionBlockedCount > 0 && total === 0 ? 'warning' : 'success',
              message: restoredDb
                ? `Backup JSON e ${total} arquivo(s) selecionados importados; ${skippedTombstonesCount} ignorado(s) por exclusão.`
                : total > 0
                  ? `${total} arquivo(s) importado(s) do Google Drive; ${skippedTombstonesCount} ignorado(s) por exclusão.`
                  : 'Nenhum arquivo novo foi importado pelo seletor.',
              affectedFiles: fileEvents,
              stats: {
                restored: filesRestored,
                imported: orphansImported,
                skippedTombstones: skippedTombstonesCount,
              },
            });
            toast(
              restoredDb
                ? `Backup JSON e ${total} arquivo(s) selecionados restaurados do Google Drive!`
                : total > 0
                ? `${total} arquivo(s) importado(s) do Google Drive!`
                : 'Nenhum arquivo compatível foi importado.',
              total === 0 && !restoredDb,
            );

            return {
              folder: picked.folders[0] ? { id: picked.folders[0].id, name: picked.folders[0].name } : undefined,
              restoredDb,
              filesRestored,
              orphansImported,
              permissionBlockedCount,
            };
          } finally {
            setRestoreProgress(null);
            setIsSyncingDrive(false);
          }
        }

        if (picked.folders.length > 0) {
          const folder = picked.folders[0];

          if (options?.autoRestore !== false) {
            const res = await restoreAllFromGoogleDrive({
              folderId: folder.id,
              forceModule: targetModule,
            });
            return {
              folder: { id: folder.id, name: folder.name },
              restoredDb: res.restoredDb,
              filesRestored: res.filesRestored,
              orphansImported: res.orphansImported,
              permissionBlockedCount: res.permissionBlockedCount || 0,
            };
          }

          toast(
            `Pasta "${folder.name}" definida para salvar todos os arquivos e backups no Google Drive!`,
          );
          return {
            folder: { id: folder.id, name: folder.name },
            restoredDb: false,
            filesRestored: 0,
            orphansImported: 0,
            permissionBlockedCount: 0,
          };
        }

        return null;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        recordSyncActivity({
          category: 'drive-restore',
          operation: 'Falha no seletor do Google Drive',
          status: 'error',
          errorCode: msg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
          message: msg || 'Falha ao abrir seletor do Google Drive.',
        });
        toast(`Erro ao abrir seletor do Google Drive: ${err?.message || 'Falha'}`, true);
        return null;
      }
    },
    [applyRestoredDatabaseForScope, ensureDriveToken, recordSyncActivity, restoreAllFromGoogleDrive, toast],
  );

  const inspectDriveFolders = useCallback(async (): Promise<DriveFolderSummary[]> => {
    let activeToken = await ensureDriveToken();
    if (!activeToken) return [];
    try {
      return await listDriveFoldersOverview(activeToken);
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        clearAccessTokenOnly();
        setDriveTokenReady(false);
        const reconnected = await connectGoogleDrive();
        activeToken = reconnected ? await getAccessToken() : null;
        if (activeToken) {
          return await listDriveFoldersOverview(activeToken);
        }
      }
      toast(`Erro ao verificar pastas do Google Drive: ${err?.message || 'Falha'}`, true);
      return [];
    }
  }, [connectGoogleDrive, ensureDriveToken, toast]);

  const importDriveFolderFiles = useCallback(
    async (
      folderId: string,
      targetModule: 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries' = 'auto',
    ): Promise<number> => {
      const activeToken = await ensureDriveToken();
      if (!activeToken) return 0;

      setIsSyncingDrive(true);
      try {
        const driveFiles = await listAllStudyFilesInDrive(activeToken);
        const scope = activeScopeRef.current;
        const {
          updatedDb,
          filesRestored,
          orphansImported,
          skippedTombstonesCount,
          fileEvents,
        } = await restoreFilesAndOrphansFromDriveList(
          dbRef.current,
          driveFiles,
          activeToken,
          scope,
          (current, total, label) => setRestoreProgress({ current, total, label }),
          {
            onlyFolderId: folderId,
            forceModule: targetModule,
            skipTargetDbBlobs: true,
            lazyBinaryBlobs: isGasSessionActive(),
          },
        );

        const total = filesRestored + orphansImported;
        if (total > 0) {
          applyRestoredDatabaseForScope(scope, updatedDb);
          toast(`${total} arquivo(s) importado(s) da pasta do Google Drive!`);
        } else {
          toast('Nenhum arquivo novo suportado encontrado nesta pasta (ou já foram importados).');
        }
        recordSyncActivity({
          category: 'drive-restore',
          operation: 'Importação de pasta do Google Drive',
          status: 'success',
          message:
            total > 0
              ? `${total} arquivo(s) importado(s); ${skippedTombstonesCount} ignorado(s) por exclusão.`
              : `Pasta verificada; ${skippedTombstonesCount} arquivo(s) ignorado(s) por exclusão.`,
          affectedFiles: fileEvents,
          stats: {
            restored: filesRestored,
            imported: orphansImported,
            skippedTombstones: skippedTombstonesCount,
          },
        });
        return total;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        recordSyncActivity({
          category: 'drive-restore',
          operation: 'Falha ao importar pasta do Google Drive',
          status: 'error',
          errorCode: msg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
          message: msg || 'Falha ao importar pasta do Drive.',
        });
        toast(`Erro ao importar pasta do Drive: ${err?.message || 'Falha'}`, true);
        return 0;
      } finally {
        setRestoreProgress(null);
        setIsSyncingDrive(false);
      }
    },
    [applyRestoredDatabaseForScope, ensureDriveToken, recordSyncActivity, toast],
  );

  const recoverFileFromDrive = useCallback(
    async (blobKey: string, filename?: string): Promise<Blob | null> => {
      const existing = await getFileBlob(blobKey, activeScopeRef.current);
      if (existing) return existing;

      const activeToken = await ensureDriveToken();
      if (!activeToken) return null;

      try {
        // Fast path: when blobKey already encodes the Google Drive file ID (`drive_<id>`),
        // download directly by ID without listing the entire Drive folder first.
        if (blobKey.startsWith('drive_')) {
          const directFileId = blobKey.replace(/^drive_/, '').trim();
          if (directFileId) {
            const lowerName = String(filename || '').toLowerCase();
            const mimeHint = lowerName.endsWith('.pdf')
              ? 'application/pdf'
              : lowerName.endsWith('.txt') || lowerName.endsWith('.md')
                ? 'text/plain'
                : undefined;
            try {
              const directBlob = await downloadDriveFileBlob(directFileId, activeToken, mimeHint);
              if (directBlob && directBlob.size > 0) {
                await saveFileBlob(blobKey, directBlob, activeScopeRef.current);
                return directBlob;
              }
            } catch (directErr: any) {
              const directMsg = String(directErr?.message || '');
              if (directMsg.includes('TOKEN_EXPIRED') || directMsg.includes('PICKER_FILE_PERMISSION')) {
                throw directErr;
              }
              // Fall back to full folder search if file ID changed or was replaced
            }
          }
        }

        const driveFiles = await listAllStudyFilesInDrive(activeToken);
        const candidates = [
          filename,
          filename ? `LEI - ${filename}` : '',
          filename ? `PROVA - ${filename}` : '',
          filename ? `RESUMO - ${filename}` : '',
          filename ? `DISCURSIVA - ${filename}` : '',
          filename ? `CORRECAO - ${filename}` : '',
          blobKey,
          `${blobKey}.pdf`,
        ]
          .filter((c): c is string => Boolean(c))
          .map((c) => c.toLowerCase());

        const prefFolderId =
          dbRef.current.preferences?.default_drive_folder?.id || getPreferredStudyFolder().id;
        const sortedFiles = prefFolderId
          ? [...driveFiles].sort((a, b) => {
              const aInPref = Boolean(
                a.parents?.includes(prefFolderId) || a.ancestorFolderIds?.includes(prefFolderId),
              );
              const bInPref = Boolean(
                b.parents?.includes(prefFolderId) || b.ancestorFolderIds?.includes(prefFolderId),
              );
              return Number(bInPref) - Number(aInPref);
            })
          : driveFiles;

        const match =
          sortedFiles.find((df) => candidates.includes(df.name.toLowerCase())) ||
          (blobKey.startsWith('drive_')
            ? sortedFiles.find((df) => df.id === blobKey.replace(/^drive_/, ''))
            : undefined);

        if (!match) return null;
        const blob = await downloadDriveFileBlob(match.id, activeToken, match.mimeType);
        await saveFileBlob(blobKey, blob, activeScopeRef.current);
        return blob;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) {
          setDriveTokenReady(false);
        } else if (msg.includes('PICKER_FILE_PERMISSION')) {
          toast(
            'Este arquivo foi enviado ao Google Drive fora do app. Use "Selecionar arquivo no Drive" para autorizar o acesso.',
            true,
          );
        }
        return null;
      }
    },
    [ensureDriveToken, toast],
  );

  const refreshLocalOutboxAndRestorePoints = useCallback(async (explicitScope?: string) => {
    const scope = explicitScope || activeScopeRef.current || 'offline_guest';
    const [outbox, points] = await Promise.all([
      getDriveUploadOutbox(scope),
      listLocalRestorePoints(scope),
    ]);
    if (scope === activeScopeRef.current) {
      setDriveUploadOutboxItems(outbox);
      setLocalRestorePoints(points);
    }
  }, []);

  useEffect(() => {
    void refreshLocalOutboxAndRestorePoints();
  }, [googleUser?.uid, refreshLocalOutboxAndRestorePoints]);

  const autoSyncFileToDrive = useCallback(
    async (
      fileOrBlob: File | Blob,
      filename: string,
      subfolderName?: string | string[],
      blobKeyHint?: string,
    ): Promise<boolean> => {
      const scope = activeScopeRef.current || 'offline_guest';
      const moduleTag = Array.isArray(subfolderName) ? subfolderName[0] : subfolderName;
      const subfolderStr = Array.isArray(subfolderName) ? subfolderName.join('/') : subfolderName;
      const outboxId = `${scope}::${subfolderStr || 'root'}::${filename}`;

      const queueForRetry = async (errMsg: string) => {
        if (blobKeyHint) {
          await enqueueDriveUploadOutbox(
            {
              id: outboxId,
              blobKey: blobKeyHint,
              filename,
              subfolder: subfolderStr,
              moduleTag,
              queuedAt: new Date().toISOString(),
              attempts: 1,
              lastError: errMsg,
            },
            scope,
          );
          void refreshLocalOutboxAndRestorePoints(scope);
        }
      };

      if (!driveConnected) {
        await queueForRetry('Google Drive desconectado');
        return false;
      }
      const notifyThrottle = (msg: string) => {
        const now = Date.now();
        if (now - lastDriveUploadAlertAtRef.current > 4000) {
          lastDriveUploadAlertAtRef.current = now;
          toast(msg, true);
        }
      };

      const token = await getAccessToken();
      if (!token) {
        if (!isGasSessionActive()) {
          setDriveTokenReady(false);
        }
        await queueForRetry('Sessão em nuvem desconectada');
        recordSyncActivity({
          category: 'drive-upload',
          operation: 'Envio automático enfileirado (Outbox)',
          status: 'warning',
          message: `Sem sessão ativa para enviar "${filename}". O arquivo foi salvo na Fila Persistente (Outbox) e será enviado ao conectar.`,
          affectedFiles: [{ name: filename, action: 'failed', detail: 'Salvo na fila Outbox' }],
        });
        notifyThrottle(
          'Você está desconectado da nuvem. O arquivo foi guardado na fila segura e será enviado assim que fizer login.',
        );
        return false;
      }
      setDriveTokenReady(true);

      try {
        const uploaded = await uploadFileToDrive(fileOrBlob, filename, token, subfolderName, {
          moduleTag,
          sourceAction: 'auto-upload',
        });
        await removeDriveUploadOutboxItem(outboxId, scope);
        void refreshLocalOutboxAndRestorePoints(scope);
        const updatedMeta = recordUploadedFilesInCacheMeta(activeScopeRef.current, {
          driveFiles: [uploaded],
        });
        if (updatedMeta.lastCacheVerifiedAt) setLastCacheVerifiedAt(updatedMeta.lastCacheVerifiedAt);
        recordSyncActivity({
          category: 'drive-upload',
          operation: 'Arquivo enviado ao Google Drive',
          status: 'success',
          message: `Arquivo "${filename}" enviado e etiquetado para sincronização no Google Drive.`,
          affectedFiles: [
            {
              name: uploaded.name || filename,
              action: 'uploaded',
              driveFileId: uploaded.id,
              module: Array.isArray(subfolderName) ? subfolderName.join(' / ') : subfolderName,
              syncOrigin: uploaded.syncOrigin || 'internal',
            },
          ],
          stats: { uploaded: 1 },
        });
        return true;
      } catch (err: any) {
        const msg = String(err?.message || '');
        await queueForRetry(msg || 'Erro de rede no upload');
        if (msg.includes('TOKEN_EXPIRED')) {
          setDriveTokenReady(false);
          notifyThrottle(
            'Sua sessão do Google Drive expirou. O arquivo ficou na fila segura (Outbox) para reenvio automático.',
          );
        } else if (msg.includes('DRIVE_FOLDER_PERMISSION')) {
          notifyThrottle(
            `O Google Drive bloqueou o envio para a pasta "${activeDriveFolderNameRef.current}". Em Backup e Restauração, clique em "Escolher pasta no Drive" para liberar a gravação.`,
          );
        } else {
          notifyThrottle(`Falha ao salvar "${filename}" no Google Drive: ${msg || 'Mantido na fila Outbox'}`);
        }
        recordSyncActivity({
          category: 'drive-upload',
          operation: 'Falha ao enviar arquivo ao Drive (mantido na fila Outbox)',
          status: 'error',
          errorCode: msg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
          message: `Não foi possível enviar "${filename}" agora; mantido na fila segura (Outbox).`,
          affectedFiles: [
            {
              name: filename,
              action: 'failed',
              detail: msg || 'Na fila Outbox',
              module: Array.isArray(subfolderName) ? subfolderName.join(' / ') : subfolderName,
            },
          ],
        });
        console.warn(`[Auto-sync Drive] Falha ao enviar ${filename}:`, err);
        return false;
      }
    },
    [driveConnected, recordSyncActivity, refreshLocalOutboxAndRestorePoints, toast],
  );

  const flushDriveUploadOutboxNow = useCallback(async (): Promise<number> => {
    const scope = activeScopeRef.current || 'offline_guest';
    const items = await getDriveUploadOutbox(scope);
    if (!items.length) return 0;
    const token = await getAccessToken();
    if (!token) {
      toast('Conecte ou renove a sessão do Google Drive para reenviar a fila Outbox.', true);
      return 0;
    }
    let sent = 0;
    for (const item of items) {
      try {
        const blob = await getFileBlob(item.blobKey);
        if (!blob) {
          await removeDriveUploadOutboxItem(item.id, scope);
          continue;
        }
        await uploadFileToDrive(blob, item.filename, token, item.subfolder, {
          moduleTag: item.moduleTag,
          sourceAction: 'auto-upload',
        });
        await removeDriveUploadOutboxItem(item.id, scope);
        sent += 1;
      } catch {
        // Keep in outbox for future retry
      }
    }
    await refreshLocalOutboxAndRestorePoints(scope);
    if (sent > 0) {
      toast(`${sent} arquivo(s) pendente(s) da fila Outbox enviado(s) ao Google Drive!`);
    }
    return sent;
  }, [refreshLocalOutboxAndRestorePoints, toast]);

  const createManualRestorePoint = useCallback(
    async (label = 'Ponto de restauração manual'): Promise<LocalRestorePointMeta | null> => {
      const scope = activeScopeRef.current || 'offline_guest';
      const curDb = dbRef.current;
      const points = await createLocalRestorePoint(scope, JSON.stringify(curDb), {
        label,
        reason: 'manual',
        contentHash: computeDatabaseContentHash(curDb),
        stats: {
          laws: Object.keys(curDb.laws || {}).length,
          questions: curDb.questions?.length || 0,
          contests: curDb.contests?.length || 0,
          errors: curDb.annotations?.length || 0,
        },
      });
      await refreshLocalOutboxAndRestorePoints(scope);
      if (points[0]) {
        toast('Ponto de restauração local criado com sucesso!');
      }
      return points[0] || null;
    },
    [refreshLocalOutboxAndRestorePoints, toast],
  );

  const restoreFromLocalRestorePoint = useCallback(
    async (pointId: string): Promise<boolean> => {
      const scope = activeScopeRef.current || 'offline_guest';
      const rawJson = await loadLocalRestorePointJson(scope, pointId);
      if (!rawJson) {
        toast('Não foi possível localizar os dados deste ponto de restauração.', true);
        return false;
      }
      try {
        const parsed = normalizeAndMergeDatabase(JSON.parse(rawJson));
        const curDb = dbRef.current;
        await createLocalRestorePoint(scope, JSON.stringify(curDb), {
          label: 'Snapshot automático antes de reverter versão',
          reason: 'auto-pre-restore',
          contentHash: computeDatabaseContentHash(curDb),
          stats: {
            laws: Object.keys(curDb.laws || {}).length,
            questions: curDb.questions?.length || 0,
            contests: curDb.contests?.length || 0,
            errors: curDb.annotations?.length || 0,
          },
        });
        applyRestoredDatabaseForScope(scope, parsed, new Date().toISOString());
        await refreshLocalOutboxAndRestorePoints(scope);
        toast('Banco de dados restaurado a partir do ponto de restauração local!');
        return true;
      } catch {
        toast('Arquivo do ponto de restauração inválido ou corrompido.', true);
        return false;
      }
    },
    [applyRestoredDatabaseForScope, refreshLocalOutboxAndRestorePoints, toast],
  );

  const deleteLocalRestorePointById = useCallback(
    async (pointId: string): Promise<void> => {
      const scope = activeScopeRef.current || 'offline_guest';
      await deleteLocalRestorePoint(scope, pointId);
      await refreshLocalOutboxAndRestorePoints(scope);
      toast('Ponto de restauração removido.');
    },
    [refreshLocalOutboxAndRestorePoints, toast],
  );

  const driveSyncConflictsRef = useRef<DeletedDriveConflict[]>(driveSyncConflicts);
  driveSyncConflictsRef.current = driveSyncConflicts;

  const finalizeDriveConflictRemoved = useCallback(
    (conflictId: string, target: DeletedDriveConflict, scope: string, customMessage?: string) => {
      removePendingDriveDeletesForDriveFile(scope, target.driveFile);
      removeIgnoredDriveConflictFileId(scope, target.driveFile.id);
      removeFileIdsFromCacheMeta(scope, [target.driveFile.id]);
      dismissedConflictIdsRef.current.delete(conflictId);
      setDriveSyncConflicts((prev) => prev.filter((c) => c.id !== conflictId));
      setDriveConflictErrors((prev) => {
        if (!(conflictId in prev)) return prev;
        const copy = { ...prev };
        delete copy[conflictId];
        return copy;
      });
      lastDeletionMsRef.current = Date.now();
      pendingCloudSyncRef.current = true;
      setHasPendingCloudChanges(true);
      saveSyncMeta(scope, { hasPendingCloudSync: true });
      void flushCloudSyncNow();

      recordSyncActivity(
        {
          category: 'drive-delete',
          operation: 'Conflito resolvido: cópia removida do Drive',
          status: 'success',
          message:
            customMessage ||
            `O arquivo "${target.displayName}" foi movido para a lixeira do Google Drive conforme escolha do usuário.`,
          affectedFiles: [
            {
              name: target.displayName,
              action: 'trashed',
              module: target.moduleLabel,
              driveFileId: target.driveFile.id,
              syncOrigin: target.syncOrigin,
            },
          ],
          stats: { trashed: 1 },
        },
        scope,
      );
      toast(`"${target.displayName}" removido do Google Drive (movido para a lixeira).`);
    },
    [flushCloudSyncNow, recordSyncActivity, toast],
  );

  const resolveDriveConflictRemoveCloud = useCallback(
    async (conflictId: string): Promise<boolean> => {
      const target = driveSyncConflictsRef.current.find((c) => c.id === conflictId);
      if (!target) return false;
      const activeToken = await ensureDriveToken();
      if (!activeToken) return false;

      const scope = activeScopeRef.current || 'offline_guest';
      setResolvingDriveConflictId(conflictId);
      try {
        const trashRes = await trashFileInDriveDetailed(target.driveFile.id, activeToken);
        if (!trashRes.ok) {
          if (trashRes.reason === 'token-expired') {
            setDriveTokenReady(false);
          }
          const detailMsg =
            trashRes.detail ||
            'Não foi possível mover o arquivo para a lixeira do Google Drive.';
          setDriveConflictErrors((prev) => ({
            ...prev,
            [conflictId]: {
              reason: trashRes.reason || 'unknown',
              message: detailMsg,
            },
          }));
          recordSyncActivity(
            {
              category: 'drive-delete',
              operation:
                trashRes.reason === 'picker-permission'
                  ? 'Exclusão bloqueada por permissão externa do Drive'
                  : 'Falha ao remover conflito da nuvem',
              status: trashRes.reason === 'picker-permission' ? 'warning' : 'error',
              errorCode:
                trashRes.reason === 'token-expired' ? 'oauth/drive-token-expired' : undefined,
              message: `"${target.displayName}": ${detailMsg}`,
              affectedFiles: [
                {
                  name: target.displayName,
                  action: 'failed',
                  module: target.moduleLabel,
                  driveFileId: target.driveFile.id,
                  detail: detailMsg,
                },
              ],
            },
            scope,
          );
          if (trashRes.reason === 'picker-permission') {
            toast(
              `"${target.displayName}" foi enviado ao Drive fora do app. Clique em "Autorizar no Drive e apagar" para movê-lo à lixeira.`,
              true,
            );
          } else if (trashRes.reason === 'token-expired') {
            toast(
              'Sessão OAuth do Google Drive expirada. Reconecte sua conta Google e tente novamente.',
              true,
            );
          } else {
            toast(
              `Não foi possível mover "${target.displayName}" para a lixeira: ${detailMsg}`,
              true,
            );
          }
          return false;
        }

        finalizeDriveConflictRemoved(conflictId, target, scope);
        return true;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        setDriveConflictErrors((prev) => ({
          ...prev,
          [conflictId]: {
            reason: msg.includes('TOKEN_EXPIRED') ? 'token-expired' : 'unknown',
            message: msg || 'Erro inesperado ao remover arquivo do Google Drive.',
          },
        }));
        toast(`Erro ao remover arquivo do Drive: ${msg || 'Falha'}`, true);
        return false;
      } finally {
        setResolvingDriveConflictId((prev) => (prev === conflictId ? null : prev));
      }
    },
    [ensureDriveToken, finalizeDriveConflictRemoved, recordSyncActivity, toast],
  );

  const authorizeAndRemoveDriveConflict = useCallback(
    async (conflictId: string): Promise<boolean> => {
      const target = driveSyncConflictsRef.current.find((c) => c.id === conflictId);
      if (!target) return false;
      const activeToken = await ensureDriveToken();
      if (!activeToken) return false;

      const scope = activeScopeRef.current || 'offline_guest';
      setResolvingDriveConflictId(conflictId);
      try {
        const picked = await openDrivePicker({
          token: activeToken,
          parentFolderId: target.driveFile.parents?.[0],
          mode: 'files-only',
          title: `Selecione "${target.displayName}" para autorizar a exclusão no Drive`,
        });

        if (!picked) {
          return false;
        }
        if (picked.files.length === 0) {
          toast(
            `Nenhum arquivo selecionado. Selecione "${target.displayName}" no seletor do Google Drive.`,
            true,
          );
          return false;
        }

        const pickedIds = new Set(picked.files.map((f) => f.id));
        const pickedMatchingName = picked.files.find(
          (f) =>
            normalizeFileLookup(f.name) === normalizeFileLookup(target.driveFile.name) ||
            normalizeFileLookup(stripDrivePrefix(f.name)) === normalizeFileLookup(target.displayName),
        );
        const primaryDeleteId = pickedIds.has(target.driveFile.id)
          ? target.driveFile.id
          : pickedMatchingName?.id || picked.files[0]?.id || target.driveFile.id;

        let trashRes = await trashFileInDriveDetailed(primaryDeleteId, activeToken);
        // Google Drive ACL propagation after Picker selection can take ~500-800ms; retry once automatically
        if (!trashRes.ok && trashRes.reason === 'picker-permission') {
          await new Promise((r) => window.setTimeout(r, 800));
          trashRes = await trashFileInDriveDetailed(primaryDeleteId, activeToken);
        }
        // If user selected a duplicate copy with matching name whose ID differed from target.driveFile.id, also try trashing target.driveFile.id if it was picked
        if (trashRes.ok && primaryDeleteId !== target.driveFile.id && pickedIds.has(target.driveFile.id)) {
          void trashFileInDriveDetailed(target.driveFile.id, activeToken).catch(() => {});
        }
        if (!trashRes.ok) {
          if (trashRes.reason === 'token-expired') setDriveTokenReady(false);
          const notSelectedHint =
            !pickedIds.has(target.driveFile.id) &&
            !pickedMatchingName &&
            trashRes.reason === 'picker-permission'
              ? `Selecione especificamente o arquivo "${target.displayName}" no seletor do Drive para liberar a exclusão.`
              : trashRes.reason === 'picker-permission'
                ? 'O Google Drive manteve a restrição neste arquivo (ele pode pertencer a outra conta ou estar em pasta compartilhada). Use "Abrir no Drive" para apagá-lo diretamente ou clique em "Ignorar neste app".'
                : trashRes.detail || 'Não foi possível mover o arquivo para a lixeira após a seleção.';
          setDriveConflictErrors((prev) => ({
            ...prev,
            [conflictId]: {
              reason: trashRes.reason || 'unknown',
              message: notSelectedHint,
            },
          }));
          toast(notSelectedHint, true);
          return false;
        }

        finalizeDriveConflictRemoved(
          conflictId,
          target,
          scope,
          `O arquivo "${target.displayName}" foi autorizado pelo Seletor do Drive e movido para a lixeira.`,
        );

        // If user multi-selected other conflicted files in the same Picker session, trash them too
        const otherPickedConflicts = driveSyncConflictsRef.current.filter(
          (c) => c.id !== conflictId && pickedIds.has(c.driveFile.id),
        );
        for (const extra of otherPickedConflicts) {
          const extraRes = await trashFileInDriveDetailed(extra.driveFile.id, activeToken);
          if (extraRes.ok) {
            finalizeDriveConflictRemoved(extra.id, extra, scope);
          }
        }

        return true;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        setDriveConflictErrors((prev) => ({
          ...prev,
          [conflictId]: {
            reason: msg.includes('TOKEN_EXPIRED') ? 'token-expired' : 'unknown',
            message: msg || 'Não foi possível abrir o Seletor do Google Drive.',
          },
        }));
        toast(`Falha ao autorizar arquivo no Drive: ${msg || 'Erro'}`, true);
        return false;
      } finally {
        setResolvingDriveConflictId((prev) => (prev === conflictId ? null : prev));
      }
    },
    [ensureDriveToken, finalizeDriveConflictRemoved, toast],
  );

  const ignoreDriveConflict = useCallback(
    (conflictId: string) => {
      const target = driveSyncConflictsRef.current.find((c) => c.id === conflictId);
      if (!target) return;
      const scope = activeScopeRef.current || 'offline_guest';
      addIgnoredDriveConflictFileId(scope, target.driveFile.id);
      removePendingDriveDeletesForDriveFile(scope, target.driveFile);
      dismissedConflictIdsRef.current.add(conflictId);
      setDriveSyncConflicts((prev) => prev.filter((c) => c.id !== conflictId));
      setDriveConflictErrors((prev) => {
        if (!(conflictId in prev)) return prev;
        const copy = { ...prev };
        delete copy[conflictId];
        return copy;
      });
      recordSyncActivity(
        {
          category: 'drive-delete',
          operation: 'Arquivo mantido somente no Google Drive',
          status: 'warning',
          message: `"${target.displayName}" foi removido da fila de conflitos locais e permanecerá apenas no Google Drive sem voltar ao app.`,
          affectedFiles: [
            {
              name: target.displayName,
              action: 'skipped-tombstone',
              module: target.moduleLabel,
              driveFileId: target.driveFile.id,
              detail: 'Ignorado neste dispositivo',
            },
          ],
        },
        scope,
      );
      toast(`"${target.displayName}" ignorado neste app (mantido apenas no Google Drive).`);
    },
    [recordSyncActivity, toast],
  );

  const resolveDriveConflictRestoreLocal = useCallback(
    async (conflictId: string): Promise<boolean> => {
      const target = driveSyncConflictsRef.current.find((c) => c.id === conflictId);
      if (!target) return false;
      const activeToken = await ensureDriveToken();
      if (!activeToken) return false;

      const scope = activeScopeRef.current || 'offline_guest';
      setResolvingDriveConflictId(conflictId);
      try {
        const nextTombstones = removeDeletedTombstoneKeys(
          scope,
          target.tombstoneCompositeKeys,
          dbRef.current.deletedTombstones,
        );
        if (scope !== 'offline_guest') {
          removeDeletedTombstoneKeys('offline_guest', target.tombstoneCompositeKeys);
        }
        removePendingDriveDeletesForDriveFile(scope, target.driveFile);

        const baseDbWithoutTombstone: StudyDatabase = {
          ...dbRef.current,
          deletedTombstones: nextTombstones,
        };

        const res = await restoreFilesAndOrphansFromDriveList(
          baseDbWithoutTombstone,
          [target.driveFile],
          activeToken,
          scope,
          undefined,
          {
            onlyFileIds: [target.driveFile.id],
            importFromAnyFolder: true,
            skipTargetDbBlobs: true,
            lazyBinaryBlobs: false,
          },
        );

        const changed =
          res.filesRestored > 0 ||
          res.orphansImported > 0 ||
          computeDatabaseContentHash(res.updatedDb) !== computeDatabaseContentHash(dbRef.current);

        if (!changed && res.permissionBlockedCount > 0) {
          toast(
            `O Google Drive exige autorização pelo Seletor para baixar "${target.displayName}".`,
            true,
          );
          return false;
        }

        const updatedDbToApply = changed ? res.updatedDb : baseDbWithoutTombstone;
        applyRestoredDatabaseForScope(scope, updatedDbToApply);
        removeIgnoredDriveConflictFileId(scope, target.driveFile.id);
        pendingCloudSyncRef.current = true;
        setHasPendingCloudChanges(true);
        dismissedConflictIdsRef.current.delete(conflictId);
        setDriveSyncConflicts((prev) => prev.filter((c) => c.id !== conflictId));
        setDriveConflictErrors((prev) => {
          if (!(conflictId in prev)) return prev;
          const copy = { ...prev };
          delete copy[conflictId];
          return copy;
        });

        recordSyncActivity(
          {
            category: 'drive-restore',
            operation: 'Conflito resolvido: arquivo restaurado localmente',
            status: 'success',
            message: `"${target.displayName}" foi restaurado no dispositivo local a partir do Google Drive e liberado do bloqueio de exclusão.`,
            affectedFiles: [
              {
                name: target.displayName,
                action: 'restored',
                module: target.moduleLabel,
                driveFileId: target.driveFile.id,
                syncOrigin: target.syncOrigin,
              },
            ],
            stats: { restored: Math.max(1, res.filesRestored + res.orphansImported) },
          },
          scope,
        );
        toast(`"${target.displayName}" restaurado localmente a partir do Google Drive!`);
        return true;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        recordSyncActivity(
          {
            category: 'drive-restore',
            operation: 'Falha ao restaurar arquivo em conflito',
            status: 'error',
            errorCode: msg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
            message: msg || `Não foi possível restaurar "${target.displayName}".`,
            affectedFiles: [
              {
                name: target.displayName,
                action: 'failed',
                module: target.moduleLabel,
                driveFileId: target.driveFile.id,
              },
            ],
          },
          scope,
        );
        toast(`Erro ao restaurar "${target.displayName}": ${msg || 'Falha'}`, true);
        return false;
      } finally {
        setResolvingDriveConflictId((prev) => (prev === conflictId ? null : prev));
      }
    },
    [applyRestoredDatabaseForScope, ensureDriveToken, recordSyncActivity, toast],
  );

  const resolveAllDriveConflictsRemoveCloud = useCallback(async () => {
    const list = [...driveSyncConflictsRef.current];
    for (const conflict of list) {
      const ok = await resolveDriveConflictRemoveCloud(conflict.id);
      if (!ok) break;
    }
  }, [resolveDriveConflictRemoveCloud]);

  const resolveAllDriveConflictsRestoreLocal = useCallback(async () => {
    const list = [...driveSyncConflictsRef.current];
    for (const conflict of list) {
      const ok = await resolveDriveConflictRestoreLocal(conflict.id);
      if (!ok) break;
    }
  }, [resolveDriveConflictRestoreLocal]);

  const dismissDriveSyncConflicts = useCallback(() => {
    for (const c of driveSyncConflictsRef.current) {
      dismissedConflictIdsRef.current.add(c.id);
    }
    setDriveSyncConflicts([]);
  }, []);

  const checkDriveTimestampConflictsNow = useCallback(async (): Promise<DeletedDriveConflict[]> => {
    const activeToken = await ensureDriveToken();
    if (!activeToken) return [];
    const scope = activeScopeRef.current || 'offline_guest';
    setIsSyncingDrive(true);
    try {
      const driveFiles = await listAllStudyFilesInDrive(activeToken);
      const report = runDriveTimestampComparison(dbRef.current, driveFiles, scope, {
        includeDismissed: true,
        sourceLabel: 'Verificação manual de timestamps (Local × Drive)',
      });
      if (report.deletedConflicts.length === 0) {
        if (report.localNewer.length > 0 || report.driveNewer.length > 0) {
          toast(
            `Comparação concluída: ${report.localNewer.length} arquivo(s) mais recente(s) localmente e ${report.driveNewer.length} no Google Drive. Nenhum arquivo excluído encontrado na nuvem.`,
          );
        } else {
          toast('Timestamps comparados — tudo sincronizado e sem arquivos excluídos divergentes no Drive.');
        }
      }
      return report.deletedConflicts;
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
      toast(`Erro ao comparar datas com o Google Drive: ${msg || 'Falha'}`, true);
      return [];
    } finally {
      setIsSyncingDrive(false);
    }
  }, [ensureDriveToken, runDriveTimestampComparison, toast]);

  const saveCloudBackup = useCallback(async (): Promise<boolean> => {
    window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
    const activeToken = await ensureDriveToken();
    if (!activeToken) return false;
    setIsSyncingDrive(true);
    try {
      const scope = activeScopeRef.current;
      const currentDb = dbRef.current;
      const curHash = computeDatabaseContentHash(currentDb);
      const baselineDb = lastBackupDbRef.current || lastCloudDbRef.current;
      const nowIso = new Date().toISOString();

      const { hasChanges, envelope } = buildIncrementalDatabaseBackup(baselineDb, currentDb, {
        updatedAt: nowIso,
        baseUpdatedAt: lastBackupIsoRef.current || undefined,
        userEmail: googleUser?.email || undefined,
      });

      if (
        baselineDb &&
        ((lastBackupHashRef.current && curHash === lastBackupHashRef.current) || !hasChanges) &&
        lastCloudHashRef.current === curHash
      ) {
        toast('Nenhuma alteração desde o último backup — os arquivos existentes no Drive foram preservados sem duplicação.');
        return true;
      }

      if (
        lastCloudDbRef.current &&
        !isUntouchedSeedDatabase(lastCloudDbRef.current) &&
        isUntouchedSeedDatabase(currentDb)
      ) {
        toast('Backup bloqueado para proteger os dados da nuvem contra sobrescrita por dados vazios.', true);
        return false;
      }

      toast(
        baselineDb
          ? 'Gerando backup incremental das alterações e enviando ao Google Drive...'
          : 'Gerando snapshot inicial e enviando ao Google Drive...',
      );

      const mergedCloudDb: StudyDatabase = currentDb;
      const mergedHash = computeDatabaseContentHash(mergedCloudDb);

      const fullSyncPayload = {
        version: 2,
        app: 'Central de Estudos',
        updatedAt: nowIso,
        contentHash: mergedHash,
        userEmail: googleUser?.email || undefined,
        data: mergedCloudDb,
      };

      const datedPayload = envelope;
      const savedDatedFile = hasChanges
        ? await saveDatabaseBackupToDrive(datedPayload, activeToken)
        : null;
      const savedSyncFile =
        lastCloudHashRef.current !== mergedHash
          ? await saveCloudSyncSnapshot(fullSyncPayload, activeToken)
          : null;

      lastAutoBackupAtRef.current = Date.now();
      lastCloudDbRef.current = mergedCloudDb;
      lastCloudHashRef.current = mergedHash;
      lastBackupDbRef.current = currentDb;
      lastBackupHashRef.current = curHash;
      lastBackupIsoRef.current = nowIso;
      const updatedMeta = recordUploadedFilesInCacheMeta(scope, {
        backupFiles: [savedDatedFile, savedSyncFile],
        extraPatch: {
          lastCloudSyncAt: nowIso,
          lastCloudContentHash: mergedHash,
          lastBackupContentHash: curHash,
        },
      });
      setLastCloudSyncAt(nowIso);
      if (updatedMeta.lastCacheVerifiedAt) setLastCacheVerifiedAt(updatedMeta.lastCacheVerifiedAt);
      pendingCloudSyncRef.current = false;
      setHasPendingCloudChanges(false);
      recordSyncActivity({
        category: 'drive-backup',
        operation: 'Backup incremental manual no Google Drive',
        status: 'success',
        message: `Backup salvo no Drive (${envelope.changesSummary.addedOrUpdated} item(ns) alterado(s) em ${envelope.changedSections.length} seção(ões)).`,
        affectedFiles: [
          ...(savedDatedFile ? [{ name: savedDatedFile.name, action: 'uploaded' as const, driveFileId: savedDatedFile.id }] : []),
          ...(savedSyncFile ? [{ name: savedSyncFile.name, action: 'uploaded' as const, driveFileId: savedSyncFile.id }] : []),
        ],
        stats: { uploaded: (savedDatedFile ? 1 : 0) + (savedSyncFile ? 1 : 0) },
      });
      toast(
        `Backup salvo no Drive (${envelope.changesSummary.addedOrUpdated} item(ns) alterado(s) em ${envelope.changedSections.length} seção(ões))!`,
      );
      return true;
    } catch (err: any) {
      if (err?.queued) {
        pendingCloudSyncRef.current = true;
        setHasPendingCloudChanges(true);
        toast('Sem conexão estável no momento — backup salvo na fila local para reenvio automático.');
        return true;
      }
      const msg = String(err?.message || '');
      if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
      recordSyncActivity({
        category: 'drive-backup',
        operation: 'Falha no backup manual do Google Drive',
        status: 'error',
        errorCode: msg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
        message: msg || 'Falha ao enviar backup para o Google Drive.',
      });
      toast(`Erro ao salvar backup no Drive: ${err?.message || 'Falha no upload'}`, true);
      return false;
    } finally {
      setIsSyncingDrive(false);
    }
  }, [ensureDriveToken, googleUser?.email, recordSyncActivity, toast]);

  const listCloudBackups = useCallback(async (): Promise<DriveFileInfo[]> => {
    const activeToken = await getAccessToken();
    if (!activeToken) return [];
    try {
      const folder = await getOrCreateStudyFolder(activeToken).catch(() => null);
      return await listDatabaseBackupsFromDrive(activeToken, {
        activeFolderId: folder?.id || getPreferredStudyFolder().id || undefined,
      });
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        clearAccessTokenOnly();
        setDriveTokenReady(false);
      }
      return [];
    }
  }, []);

  const restoreCloudBackup = useCallback(
    async (fileId: string): Promise<boolean> => {
      const activeToken = await ensureDriveToken();
      if (!activeToken) return false;
      setIsSyncingDrive(true);
      try {
        toast('Baixando backup e restaurando arquivos do Google Drive...');
        const folder = await getOrCreateStudyFolder(activeToken).catch(() => null);
        const [snapshot, driveFiles, latestCloud] = await Promise.all([
          downloadBackupFileFromDrive(fileId, activeToken, { bypassCache: true }),
          listAllStudyFilesInDrive(activeToken),
          downloadLatestCloudSync(activeToken, {
            activeFolderId: folder?.id,
            expectedEmail: googleUser?.email || undefined,
            bypassCache: true,
          }).catch(() => null),
        ]);
        if (!snapshot || typeof snapshot !== 'object') {
          throw new Error('Arquivo de backup corrompido ou inválido.');
        }

        const isIncremental = isIncrementalBackupPayload(snapshot);
        let merged: StudyDatabase;
        if (isIncremental) {
          let baseDb = latestCloud?.payload
            ? normalizeAndMergeDatabase(latestCloud.payload)
            : dbRef.current;
          if (latestCloud?.incrementalDeltas?.length) {
            for (const incDelta of latestCloud.incrementalDeltas) {
              baseDb = applyIncrementalDeltaToDatabase(baseDb, incDelta);
            }
          }
          merged = applyIncrementalDeltaToDatabase(baseDb, snapshot);
        } else {
          merged = normalizeAndMergeDatabase(snapshot);
          const isLatestSyncFile =
            fileId === latestCloud?.file?.id ||
            (Boolean(snapshot?.updatedAt) &&
              Boolean(latestCloud?.payload?.updatedAt) &&
              snapshot.updatedAt === latestCloud?.payload?.updatedAt);
          if (isLatestSyncFile && latestCloud?.incrementalDeltas?.length) {
            for (const incDelta of latestCloud.incrementalDeltas) {
              merged = applyIncrementalDeltaToDatabase(merged, incDelta);
            }
          }
        }

        const scope = activeScopeRef.current;
        const {
          updatedDb,
          filesRestored,
          orphansImported,
          skippedTombstonesCount,
          fileEvents,
        } = await restoreFilesAndOrphansFromDriveList(
          merged,
          driveFiles,
          activeToken,
          scope,
          (current, total, label) => setRestoreProgress({ current, total, label }),
        );

        const cloudIso =
          snapshot?.updatedAt || snapshot?.exportedAt || new Date().toISOString();
        applyRestoredDatabaseForScope(scope, updatedDb, cloudIso);
        const restoredHash = computeDatabaseContentHash(updatedDb);
        lastCloudDbRef.current = updatedDb;
        lastCloudHashRef.current = restoredHash;
        lastBackupDbRef.current = updatedDb;
        lastBackupHashRef.current = restoredHash;
        lastBackupIsoRef.current = cloudIso;
        saveSyncMeta(scope, {
          lastCloudContentHash: restoredHash,
          lastBackupContentHash: restoredHash,
        });
        syncedScopeOnceRef.current = scope;

        const totalFiles = filesRestored + orphansImported;
        recordSyncActivity({
          category: 'drive-restore',
          operation: isIncremental
            ? 'Aplicação de backup incremental do Drive'
            : 'Restauração de backup específico do Drive',
          status: 'success',
          message: `Snapshot aplicado (${filesRestored} arquivo(s) baixado(s), ${orphansImported} órfão(s) importado(s), ${skippedTombstonesCount} ignorado(s) por exclusão).`,
          affectedFiles: fileEvents,
          stats: {
            restored: filesRestored,
            imported: orphansImported,
            skippedTombstones: skippedTombstonesCount,
          },
        });
        toast(
          isIncremental
            ? totalFiles > 0
              ? `Alterações incrementais e ${totalFiles} arquivo(s) mesclados sem apagar os demais dados!`
              : 'Alterações incrementais mescladas com sucesso sem substituir os demais itens!'
            : totalFiles > 0
            ? `Backup e ${totalFiles} arquivo(s) restaurados do Google Drive com sucesso!`
            : 'Backup restaurado do Google Drive com sucesso!',
        );
        return true;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        recordSyncActivity({
          category: 'drive-restore',
          operation: 'Falha ao restaurar backup específico do Drive',
          status: 'error',
          errorCode: msg.includes('TOKEN_EXPIRED') ? 'oauth/drive-token-expired' : undefined,
          message: msg || 'Erro ao restaurar backup.',
        });
        toast(`Falha ao restaurar backup da nuvem: ${err?.message || 'Erro'}`, true);
        return false;
      } finally {
        setRestoreProgress(null);
        setIsSyncingDrive(false);
      }
    },
    [applyRestoredDatabaseForScope, ensureDriveToken, recordSyncActivity, toast],
  );

  const deleteCloudBackup = useCallback(
    async (fileId: string): Promise<boolean> => {
      const activeToken = await ensureDriveToken();
      if (!activeToken) return false;
      try {
        await deleteFileFromDrive(fileId, activeToken);
        removeFileIdsFromCacheMeta(activeScopeRef.current, [fileId]);
        toast('Arquivo de backup excluído do Google Drive.');
        return true;
      } catch (err: any) {
        toast(`Erro ao excluir backup da nuvem: ${err?.message || 'Erro'}`, true);
        return false;
      }
    },
    [ensureDriveToken, toast],
  );

  const pruneOldCloudBackups = useCallback(
    async (maxKeep = 20): Promise<number> => {
      const activeToken = await ensureDriveToken();
      if (!activeToken) return 0;
      setIsSyncingDrive(true);
      try {
        const { deleted } = await pruneOldDatabaseBackupsFromDrive(activeToken, maxKeep);
        if (deleted > 0) {
          invalidateDriveBrowserCacheMeta(activeScopeRef.current);
          setLastCacheVerifiedAt(null);
        }
        toast(
          deleted > 0
            ? `${deleted} backup(s) antigo(s) removido(s) do Drive (mantidos os ${maxKeep} mais recentes).`
            : `Nenhuma limpeza necessária — há até ${maxKeep} cópia(s) datada(s) no Drive.`,
        );
        return deleted;
      } catch (err: any) {
        toast(`Falha ao limpar backups antigos: ${err?.message || 'Erro'}`, true);
        return 0;
      } finally {
        setIsSyncingDrive(false);
      }
    },
    [ensureDriveToken, toast],
  );

  // Daily focus quote logic
  const pickQuote = useCallback(
    (forceNew = false) => {
      const phrases = [...new Set(db.phrases.map((p) => p.trim()).filter(Boolean))];
      if (!phrases.length) phrases.push('Foco na missão.');
      const today = localDateIso();
      let saved: { date?: string; quote?: string } | null = null;
      try {
        saved = JSON.parse(
          localStorage.getItem(getQuoteStorageKey(activeScopeRef.current)) ||
            localStorage.getItem(QUOTE_STORAGE_KEY_LEGACY) ||
            'null',
        );
      } catch {
        saved = null;
      }
      const current = saved?.date === today ? saved.quote || '' : '';
      const available = phrases.filter((p) => p !== current);
      const quote =
        !forceNew && current && phrases.includes(current)
          ? current
          : (available.length ? available : phrases)[
              Math.floor(Math.random() * (available.length || phrases.length))
            ];
      setFocusQuote(quote);
      try {
        localStorage.setItem(
          getQuoteStorageKey(activeScopeRef.current),
          JSON.stringify({ date: today, quote }),
        );
      } catch {
        // Ignore
      }
    },
    [db.phrases],
  );

  useEffect(() => {
    pickQuote(false);
  }, [pickQuote]);

  const changeFocusQuote = useCallback(() => {
    pickQuote(true);
  }, [pickQuote]);

  const toggleTimer = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    setTimerState((prev) => {
      if (prev.startedAt) {
        const stoppedElapsed = computeCurrentTimerSeconds(prev, now);
        lastTimerSecRef.current = stoppedElapsed;
        return { elapsed: stoppedElapsed, startedAt: 0 };
      }
      const next = { elapsed: prev.elapsed, startedAt: now };
      lastTimerSecRef.current = prev.elapsed;
      return next;
    });
  }, [computeCurrentTimerSeconds]);

  const resetTimer = useCallback(() => {
    lastTimerSecRef.current = 0;
    setTimerState({ elapsed: 0, startedAt: 0 });
    quizTimerBaselineRef.current = 0;
    setQuiz((prev) => (prev && !prev.completed ? { ...prev, timerBaseline: 0 } : prev));
    toast('Cronômetro zerado.');
  }, [toast]);

  const ensureTimerRunning = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    setTimerState((prev) => {
      if (prev.startedAt) return prev;
      lastTimerSecRef.current = prev.elapsed;
      return { ...prev, startedAt: now };
    });
  }, []);

  const setPomodoroMode = useCallback(
    (mode: PomodoroMode) => {
      pomodoroModeRef.current = mode;
      pomodoroPhaseRef.current = 'focus';
      setPomodoroModeState(mode);
      setPomodoroPhase('focus');
      if (mode === '25-5') {
        setPomodoroRemainingSeconds(25 * 60);
        toast('Modo Pomodoro 25/5 ativado.');
      } else if (mode === '50-10') {
        setPomodoroRemainingSeconds(50 * 60);
        toast('Modo Pomodoro 50/10 ativado.');
      } else {
        setPomodoroRemainingSeconds(0);
        toast('Cronômetro em modo contínuo.');
      }
    },
    [toast],
  );

  const linkTimerToScheduleTopic = useCallback(
    (day: WeekdayName, topic: ScheduleTopic, startNow = false) => {
      const fixedList = dbRef.current.fixedSubjects?.length
        ? dbRef.current.fixedSubjects
        : DEFAULT_FIXED_SUBJECTS;
      const disciplinaFixa =
        topic.disciplina_fixa?.trim() ||
        inferFixedSubjectFromTopic(topic, fixedList) ||
        undefined;
      const concursoAlvo = topic.concurso_alvo?.trim() || undefined;
      const materia = topic.materia.trim() || disciplinaFixa || 'Estudo Geral';
      setActiveTimerTopic({
        day,
        topicId: topic.id,
        materia,
        disciplinaFixa,
        concursoAlvo,
        tempoPrevisto: topic.tempo,
        observacoes: topic.observacoes,
      });
      if (startNow) {
        ensureTimerRunning();
      }
      const label = disciplinaFixa && disciplinaFixa !== materia
        ? `${visibleName(disciplinaFixa)} — ${visibleName(materia)}`
        : visibleName(materia);
      toast(
        startNow
          ? `Cronômetro iniciado e vinculado a: ${label} (${day}).`
          : `Cronômetro vinculado a: ${label} (${day}).`,
      );
    },
    [ensureTimerRunning, toast],
  );

  const clearTimerLink = useCallback(() => {
    setActiveTimerTopic(null);
  }, []);

  const commitTimerToSchedule = useCallback(
    (overrideTarget?: {
      day: WeekdayName;
      topicId?: string;
      materia: string;
      disciplinaFixa?: string;
      concursoAlvo?: string;
      observacoes?: string;
    }): boolean => {
      const nowMs = Date.now();
      const elapsed = computeCurrentTimerSeconds(timerStateRef.current, nowMs);
      if (elapsed < 1) {
        toast('Inicie o cronômetro para acumular tempo antes de contabilizar.', true);
        return false;
      }

      const target = overrideTarget || activeTimerTopic;
      if (!target || (!target.materia.trim() && !target.disciplinaFixa?.trim())) {
        toast('Selecione um tópico do cronograma ou uma matéria para contabilizar o tempo.', true);
        return false;
      }

      const targetDay = target.day;
      const targetMateria = target.materia.trim() || target.disciplinaFixa?.trim() || 'Estudo Geral';
      const targetTopicId = target.topicId;
      const targetObs = target.observacoes?.trim() || undefined;
      const todayIso = localDateIso(new Date(nowMs));

      let launchedSubject = target.disciplinaFixa?.trim() || targetMateria;
      let launchedContest = target.concursoAlvo?.trim() || undefined;

      setDb((prev) => {
        const fixedList = prev.fixedSubjects?.length ? prev.fixedSubjects : DEFAULT_FIXED_SUBJECTS;
        const currentDayTopics = [...(prev.schedule[targetDay] || [])];
        const matchIdx = targetTopicId
          ? currentDayTopics.findIndex((t) => t.id === targetTopicId)
          : currentDayTopics.findIndex(
              (t) => t.materia.trim().toLowerCase() === targetMateria.toLowerCase(),
            );

        let matchedTopic: ScheduleTopic | undefined;
        if (matchIdx >= 0) {
          matchedTopic = currentDayTopics[matchIdx];
          currentDayTopics[matchIdx] = {
            ...matchedTopic,
            estudado_segundos: (matchedTopic.estudado_segundos || 0) + elapsed,
          };
        }

        const effectiveFixedSubject =
          target.disciplinaFixa?.trim() ||
          matchedTopic?.disciplina_fixa?.trim() ||
          inferFixedSubjectFromTopic(
            { disciplina_fixa: matchedTopic?.disciplina_fixa, materia: targetMateria },
            fixedList,
          ) ||
          targetMateria;

        const effectiveContest =
          target.concursoAlvo?.trim() ||
          matchedTopic?.concurso_alvo?.trim() ||
          undefined;

        launchedSubject = effectiveFixedSubject;
        launchedContest = effectiveContest;

        const specificAssunto =
          matchedTopic?.materia?.trim() &&
          normalizeSearch(matchedTopic.materia) !== normalizeSearch(effectiveFixedSubject)
            ? matchedTopic.materia.trim()
            : normalizeSearch(targetMateria) !== normalizeSearch(effectiveFixedSubject)
            ? targetMateria
            : '';

        const combinedLabel = [specificAssunto, targetObs || matchedTopic?.observacoes?.trim()]
          .filter(Boolean)
          .join(' · ') || undefined;

        const record: StudyTimeRecord = {
          quizId: `timer-${uid(12)}`,
          day: targetDay,
          date: todayIso,
          source: 'schedule',
          recordedAt: new Date(nowMs).toISOString(),
          allocations: [
            {
              subject: effectiveFixedSubject,
              seconds: elapsed,
              topicId: targetTopicId,
              topicLabel: combinedLabel,
              ...(effectiveContest ? { concursoAlvo: effectiveContest } : {}),
            },
          ],
        };

        const withUpdatedTime: StudyDatabase = {
          ...prev,
          schedule: { ...prev.schedule, [targetDay]: currentDayTopics },
          studyTimeRecords: [...prev.studyTimeRecords, record],
        };
        return buildUpdatedWeeklyScheduleState(
          withUpdatedTime,
          withUpdatedTime.schedule,
          prev.scheduleDayDates,
        );
      });

      setTimerState({ elapsed: 0, startedAt: 0 });
      quizTimerBaselineRef.current = 0;
      setQuiz((prev) => (prev && !prev.completed ? { ...prev, timerBaseline: 0 } : prev));
      toast(
        `+${formatScheduleDuration(elapsed)} lançados em Matéria: ${visibleName(launchedSubject)}${
          launchedContest ? ` (${launchedContest})` : ''
        } · ${targetDay}.`,
      );
      return true;
    },
    [activeTimerTopic, computeCurrentTimerSeconds, toast],
  );

  const logQuickStudyMinutes = useCallback(
    (day: WeekdayName, topic: ScheduleTopic, minutes: number): boolean => {
      const addedSeconds = Math.max(60, Math.round(minutes * 60));
      const nowMs = Date.now();
      const todayIso = localDateIso(new Date(nowMs));
      const targetMateria = (topic.materia || topic.disciplina_fixa || 'Estudo Geral').trim();

      let launchedSubject = topic.disciplina_fixa?.trim() || targetMateria;

      setDb((prev) => {
        const fixedList = prev.fixedSubjects?.length ? prev.fixedSubjects : DEFAULT_FIXED_SUBJECTS;
        const currentDayTopics = [...(prev.schedule[day] || [])];
        const matchIdx = currentDayTopics.findIndex((t) => t.id === topic.id);

        if (matchIdx >= 0) {
          const cur = currentDayTopics[matchIdx];
          currentDayTopics[matchIdx] = {
            ...cur,
            estudado_segundos: (cur.estudado_segundos || 0) + addedSeconds,
          };
        }

        const effectiveFixedSubject =
          topic.disciplina_fixa?.trim() ||
          inferFixedSubjectFromTopic(
            { disciplina_fixa: topic.disciplina_fixa, materia: targetMateria },
            fixedList,
          ) ||
          targetMateria;

        launchedSubject = effectiveFixedSubject;
        const effectiveContest = topic.concurso_alvo?.trim() || undefined;
        const specificAssunto =
          normalizeSearch(targetMateria) !== normalizeSearch(effectiveFixedSubject)
            ? targetMateria
            : '';
        const combinedLabel = [specificAssunto, topic.observacoes?.trim()].filter(Boolean).join(' · ') || undefined;

        const record: StudyTimeRecord = {
          quizId: `manual-${uid(12)}`,
          day,
          date: todayIso,
          source: 'manual',
          recordedAt: new Date(nowMs).toISOString(),
          allocations: [
            {
              subject: effectiveFixedSubject,
              seconds: addedSeconds,
              topicId: topic.id,
              topicLabel: combinedLabel,
              ...(effectiveContest ? { concursoAlvo: effectiveContest } : {}),
            },
          ],
        };

        const withUpdatedTime: StudyDatabase = {
          ...prev,
          schedule: { ...prev.schedule, [day]: currentDayTopics },
          studyTimeRecords: [...prev.studyTimeRecords, record],
        };
        return buildUpdatedWeeklyScheduleState(
          withUpdatedTime,
          withUpdatedTime.schedule,
          prev.scheduleDayDates,
        );
      });

      toast(`+${minutes}min registrados em ${visibleName(launchedSubject)} (${day}).`);
      return true;
    },
    [toast],
  );

  const deleteStudyTimeRecord = useCallback(
    (quizId: string) => {
      setDb((prev) => {
        const target = prev.studyTimeRecords.find((r) => r.quizId === quizId);
        let nextSchedule = prev.schedule;
        if (target) {
          const dayTopics = [...(prev.schedule[target.day] || [])];
          let modified = false;
          target.allocations.forEach((alloc) => {
            if (!alloc.topicId) return;
            const idx = dayTopics.findIndex((t) => t.id === alloc.topicId);
            if (idx >= 0 && dayTopics[idx].estudado_segundos) {
              dayTopics[idx] = {
                ...dayTopics[idx],
                estudado_segundos: Math.max(0, (dayTopics[idx].estudado_segundos || 0) - alloc.seconds),
              };
              modified = true;
            }
          });
          if (modified) {
            nextSchedule = { ...prev.schedule, [target.day]: dayTopics };
          }
        }
        return {
          ...prev,
          schedule: nextSchedule,
          studyTimeRecords: prev.studyTimeRecords.filter((r) => r.quizId !== quizId),
        };
      });
      toast('Registro de tempo removido.');
    },
    [toast],
  );

  // Derived disciplines & Fixed Subjects
  const disciplines = useMemo(
    () => [...new Set(db.questions.map((q) => q.materia).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [db.questions],
  );

  const fixedSubjects = useMemo(() => {
    const base = Array.isArray(db.fixedSubjects) ? db.fixedSubjects : DEFAULT_FIXED_SUBJECTS;
    const seen = new Set<string>();
    const list: string[] = [];
    const pushUnique = (raw?: string) => {
      const clean = visibleName(String(raw || ''));
      if (!clean) return;
      const key = normalizeSearch(clean);
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push(clean);
    };
    base.forEach(pushUnique);
    return list;
  }, [db.fixedSubjects]);

  const addFixedSubject = useCallback(
    (subject: string) => {
      const clean = visibleName(subject);
      if (!clean) {
        toast('Informe o nome da matéria para fixar.', true);
        return;
      }
      setDb((prev) => {
        const current = Array.isArray(prev.fixedSubjects)
          ? prev.fixedSubjects
          : DEFAULT_FIXED_SUBJECTS;
        if (current.some((s) => normalizeSearch(s) === normalizeSearch(clean))) {
          return prev;
        }
        return {
          ...prev,
          fixedSubjects: [...current, clean],
        };
      });
      toast(`Matéria fixa "${clean}" adicionada.`);
    },
    [toast],
  );

  const renameFixedSubject = useCallback(
    (oldName: string, newName: string) => {
      const cleanOld = visibleName(oldName);
      const cleanNew = visibleName(newName);
      const oldNorm = normalizeSearch(cleanOld);
      const newNorm = normalizeSearch(cleanNew);

      if (!cleanOld || !oldNorm) return;
      if (!cleanNew || !newNorm) {
        toast('Informe o novo nome da matéria fixada.', true);
        return;
      }
      if (cleanOld === cleanNew) {
        return;
      }

      setDb((prev) => {
        const current = Array.isArray(prev.fixedSubjects)
          ? prev.fixedSubjects
          : DEFAULT_FIXED_SUBJECTS;

        const nextFixed: string[] = [];
        const seen = new Set<string>();
        let replaced = false;

        for (const item of current) {
          const itemNorm = normalizeSearch(item);
          const candidate = itemNorm === oldNorm ? cleanNew : visibleName(item);
          if (itemNorm === oldNorm) replaced = true;
          const candNorm = normalizeSearch(candidate);
          if (candNorm && !seen.has(candNorm)) {
            seen.add(candNorm);
            nextFixed.push(candidate);
          }
        }
        if (!replaced && !seen.has(newNorm)) {
          nextFixed.push(cleanNew);
        }

        const nextSchedule = { ...prev.schedule };
        WEEKDAYS.forEach((d) => {
          const list = nextSchedule[d] || [];
          if (list.some((t) => normalizeSearch(t.disciplina_fixa || '') === oldNorm)) {
            nextSchedule[d] = list.map((t) =>
              normalizeSearch(t.disciplina_fixa || '') === oldNorm
                ? { ...t, disciplina_fixa: cleanNew }
                : t,
            );
          }
        });

        let nextWeeklySchedules = prev.weeklySchedules;
        if (prev.weeklySchedules) {
          const updatedWeekly: typeof prev.weeklySchedules = {};
          let weeklyChanged = false;
          for (const [wk, rec] of Object.entries(prev.weeklySchedules)) {
            const sched = { ...rec.schedule };
            let recChanged = false;
            WEEKDAYS.forEach((d) => {
              const list = sched[d] || [];
              if (list.some((t) => normalizeSearch(t.disciplina_fixa || '') === oldNorm)) {
                sched[d] = list.map((t) =>
                  normalizeSearch(t.disciplina_fixa || '') === oldNorm
                    ? { ...t, disciplina_fixa: cleanNew }
                    : t,
                );
                recChanged = true;
                weeklyChanged = true;
              }
            });
            updatedWeekly[wk] = recChanged ? { ...rec, schedule: sched } : rec;
          }
          if (weeklyChanged) nextWeeklySchedules = updatedWeekly;
        }

        const nextQuestions = prev.questions.map((q) =>
          normalizeSearch(q.materia) === oldNorm ? { ...q, materia: cleanNew } : q,
        );

        const nextHistory = prev.history.map((h) =>
          normalizeSearch(h.subject) === oldNorm ? { ...h, subject: cleanNew } : h,
        );

        const nextStudyTimeRecords = prev.studyTimeRecords.map((rec) => {
          const hasMatch = rec.allocations.some((a) => normalizeSearch(a.subject) === oldNorm);
          if (!hasMatch) return rec;
          return {
            ...rec,
            allocations: rec.allocations.map((a) =>
              normalizeSearch(a.subject) === oldNorm ? { ...a, subject: cleanNew } : a,
            ),
          };
        });

        const nextAnnotations = prev.annotations.map((ann) =>
          normalizeSearch(ann.materia) === oldNorm ? { ...ann, materia: cleanNew } : ann,
        );

        const nextProofFiles = prev.proofFiles.map((pf) => {
          const hasMatch = pf.correcoes.some((c) => normalizeSearch(c.materia || '') === oldNorm);
          if (!hasMatch) return pf;
          return {
            ...pf,
            correcoes: pf.correcoes.map((c) =>
              normalizeSearch(c.materia || '') === oldNorm ? { ...c, materia: cleanNew } : c,
            ),
          };
        });

        return {
          ...prev,
          fixedSubjects: nextFixed,
          schedule: nextSchedule,
          ...(nextWeeklySchedules ? { weeklySchedules: nextWeeklySchedules } : {}),
          questions: nextQuestions,
          history: nextHistory,
          studyTimeRecords: nextStudyTimeRecords,
          annotations: nextAnnotations,
          proofFiles: nextProofFiles,
        };
      });

      setActiveTimerTopic((prev) => {
        if (!prev) return prev;
        if (normalizeSearch(prev.disciplinaFixa || '') === oldNorm) {
          return { ...prev, disciplinaFixa: cleanNew };
        }
        return prev;
      });

      toast(`Matéria fixada renomeada de "${cleanOld}" para "${cleanNew}".`);
    },
    [toast],
  );

  const removeFixedSubject = useCallback(
    (subject: string) => {
      const norm = normalizeSearch(visibleName(subject));
      setDb((prev) => {
        const current = Array.isArray(prev.fixedSubjects)
          ? prev.fixedSubjects
          : DEFAULT_FIXED_SUBJECTS;
        return {
          ...prev,
          fixedSubjects: current.filter((s) => normalizeSearch(visibleName(s)) !== norm),
        };
      });
      toast(`Matéria fixa "${visibleName(subject)}" removida da lista.`);
    },
    [toast],
  );

  const questionsByDiscipline = useMemo(() => {
    const counts: Record<string, number> = {};
    db.questions.forEach((q) => {
      counts[q.materia] = (counts[q.materia] || 0) + 1;
    });
    return counts;
  }, [db.questions]);

  const allQuestions = useCallback(
    (includeSubmitted = false, subjectFilter = 'Todas as Matérias') => {
      const pool: Question[] = [...db.questions];
      if (includeSubmitted) {
        db.submittedSimulations.forEach((sim) => {
          const ordered = [...sim.questoes].sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
          pool.push(...ordered);
        });
      }
      if (subjectFilter && subjectFilter !== 'Todas as Matérias') {
        return pool.filter((q) => q.materia === subjectFilter);
      }
      return pool;
    },
    [db.questions, db.submittedSimulations],
  );

  const allErrorEntries = useMemo<ErrorNotebookEntry[]>(() => {
    const proofEntries: ErrorNotebookEntry[] = [];
    db.proofFiles.forEach((pf) => {
      pf.correcoes.forEach((corr) => {
        const q = corr.questao.trim();
        if (!q) return;
        const datePart = corr.criado_em.split('T')[0];
        const formattedDate = datePart.includes('-')
          ? datePart.split('-').reverse().join('/')
          : localDateBrazilian();
        proofEntries.push({
          id: `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}`,
          data: formattedDate,
          materia: corr.materia?.trim() || `Provas · ${pf.bank}`,
          tipo: corr.tipo?.trim() || 'Questão errada (prova)',
          texto: corr.texto?.trim() || `Questão errada na prova: ${q}`,
          corrigido: Boolean(corr.corrigido),
          corrigido_em: corr.corrigido_em,
          proxima_revisao: corr.proxima_revisao,
          nivel_revisao: corr.nivel_revisao,
          revisado_em: corr.revisado_em,
          questao: {
            enunciado: q,
            alternativas: [],
            resposta: '',
            gabarito: '',
            comentario: corr.observacoes || '',
          },
          correcao_prova: true,
          correcao_id: corr.id,
          tipo_arquivo: pf.kind,
          banca: pf.bank,
          arquivo_prova: pf.name,
        });
      });
    });
    return [...proofEntries, ...db.annotations];
  }, [db.proofFiles, db.annotations]);

  const moduleVisibility = useCallback(
    (name: string): ModuleVisibility => {
      return db.preferences.modules?.[name] || { hide_upload: false, hide_search: false };
    },
    [db.preferences.modules],
  );

  // Answer recording & quiz completion
  const persistAnswerToHistory = useCallback(
    (question: Question, selectedAnswer: string) => {
      const normalized = normalizeAnswer(selectedAnswer);
      const correct = normalized === question.gabarito;
      const todayIso = localDateIso();
      const todayBr = localDateBrazilian();

      setDb((prev) => {
        const nextHistory: HistoryRecord[] = [
          ...prev.history,
          { id: uid(12), date: todayIso, subject: question.materia, correct },
        ];
        let nextAnnotations = prev.annotations;
        if (!correct) {
          const split = splitExamQuestion(question.enunciado);
          const alternatives = question.alternativas?.length ? question.alternativas : split.alternatives;
          nextAnnotations = [
            {
              id: uid(12),
              data: todayBr,
              materia: question.materia,
              tipo: 'Erro em Treino Diário',
              texto:
                question.comentario.trim() ||
                'Revisar a regra aplicada e comparar a alternativa marcada com o gabarito.',
              corrigido: false, // Pendente de Correção
              origem: 'Treino Diário',
              questao: {
                enunciado: question.alternativas?.length ? question.enunciado : split.statement,
                alternativas: alternatives,
                resposta: normalized,
                gabarito: question.gabarito,
                comentario: question.comentario,
              },
            },
            ...prev.annotations,
          ];
        }
        return {
          ...prev,
          history: nextHistory,
          annotations: nextAnnotations,
        };
      });
      return { correta: correct, gabarito: question.gabarito, tipo: question.tipo };
    },
    [],
  );

  const allocateQuizStudyTimeToDb = useCallback((session: QuizSession, secondsToRecord: number): boolean => {
    const counts: Record<string, number> = {};
    session.answers.forEach((ans, idx) => {
      if (!ans) return;
      const q = session.questions[idx];
      if (!q?.materia) return;
      counts[q.materia] = (counts[q.materia] || 0) + 1;
    });
    const entries = Object.entries(counts);
    const totalCount = entries.reduce((sum, [, c]) => sum + c, 0);
    const elapsed = Math.floor(secondsToRecord);
    if (elapsed < 1 || totalCount === 0) return false;

    const baseAllocations: Record<string, number> = {};
    entries.forEach(([subject, count]) => {
      baseAllocations[subject] = Math.floor((elapsed * count) / totalCount);
    });
    const remaining = elapsed - Object.values(baseAllocations).reduce((s, v) => s + v, 0);
    const sorted = [...entries].sort(
      (a, b) => (elapsed * b[1]) % totalCount - (elapsed * a[1]) % totalCount,
    );
    sorted.slice(0, remaining).forEach(([subject]) => {
      baseAllocations[subject] += 1;
    });

    const now = new Date();
    const weekday = WEEKDAYS[(now.getDay() + 6) % 7];
    const todayBr = localDateBrazilian(now);
    const todayIso = localDateIso(now);

    setDb((prev) => {
      if (prev.studyTimeRecords.some((r) => r.quizId === session.id)) return prev;
      const dayTopics = [...(prev.schedule[weekday] || [])];
      const allocations: { subject: string; seconds: number }[] = [];

      Object.entries(baseAllocations).forEach(([subject, sec]) => {
        if (!sec) return;
        allocations.push({ subject, seconds: sec });
        const idx = dayTopics.findIndex(
          (t) => t.materia.trim().toLowerCase() === subject.trim().toLowerCase(),
        );
        if (idx >= 0) {
          const totalSec = scheduleDurationSeconds(dayTopics[idx].tempo) + sec;
          dayTopics[idx] = { ...dayTopics[idx], tempo: formatScheduleDuration(totalSec) };
        } else {
          dayTopics.push({
            id: uid(8),
            data: todayBr,
            materia: subject,
            tempo: formatScheduleDuration(sec),
            observacoes: '',
          });
        }
      });

      const nextRecords: StudyTimeRecord[] = [
        ...prev.studyTimeRecords,
        { quizId: session.id, day: weekday, date: todayIso, allocations },
      ];

      return {
        ...prev,
        schedule: { ...prev.schedule, [weekday]: dayTopics },
        studyTimeRecords: nextRecords,
      };
    });
    return true;
  }, []);

  const buildCompletedSimulationRecord = useCallback(
    (session: QuizSession, elapsedSeconds: number): CompletedSimulation => {
      const results = session.questions.map((q, idx) => {
        const selected = session.answers[idx]?.resposta || '';
        const correctAns = normalizeAnswer(q.gabarito);
        return {
          ...q,
          numero: idx + 1,
          resposta: selected,
          gabarito: correctAns,
          correta: selected === correctAns,
        };
      });
      const correctCount = results.filter((r) => r.correta).length;
      const wrongCount = results.filter((r) => Boolean(r.resposta) && !r.correta).length;
      const blankCount = results.filter((r) => !r.resposta).length;
      const pontosLiquidos = correctCount - wrongCount;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 19);
      const dateBr = localDateTimeBrazilian(now);
      const submittedSim = session.submittedSimulationId
        ? db.submittedSimulations.find((s) => s.id === session.submittedSimulationId)
        : undefined;
      const rawTitle = submittedSim?.titulo || session.titulo || 'Simulado por disciplinas';
      const title =
        session.submittedSimulationId && submittedSim
          ? `Simulado enviado - ${submittedSim.arquivo || submittedSim.titulo} - ${localDateBrazilian(now)}`
          : `Montado por disciplinas - ${localDateBrazilian(now)}`;

      return {
        id: session.id,
        prova_id: session.submittedSimulationId || 'montado',
        titulo: title || rawTitle,
        materia: submittedSim?.materia || session.materia || 'Geral',
        arquivo: submittedSim?.arquivo || '',
        data: dateBr,
        criado_em: dateStr,
        tempo_segundos: elapsedSeconds,
        total: results.length,
        acertos: correctCount,
        erros: wrongCount,
        em_branco: blankCount,
        pontos_liquidos: pontosLiquidos,
        aproveitamento: results.length ? Math.round((correctCount / results.length) * 100) : 0,
        banca: session.banca || undefined,
        questoes: results,
      };
    },
    [db.submittedSimulations],
  );

  const submitQuizAnswer = useCallback(
    (answerKey: string) => {
      setQuiz((prev) => {
        if (!prev || prev.index >= prev.questions.length) return prev;
        if (prev.kind === 'training' && prev.answers[prev.index]) return prev;
        const question = prev.questions[prev.index];
        const nextAnswers = [...prev.answers];

        if (prev.kind === 'simulation' || prev.submittedSimulationId) {
          nextAnswers[prev.index] = { resposta: answerKey, tipo: question.tipo, pending: true };
        } else {
          const res = persistAnswerToHistory(question, answerKey);
          nextAnswers[prev.index] = {
            resposta: answerKey,
            correta: res.correta,
            gabarito: res.gabarito,
            tipo: res.tipo,
          };
        }
        return { ...prev, answers: nextAnswers };
      });
    },
    [persistAnswerToHistory],
  );

  const changeQuizAnswer = useCallback((questionIndex: number, answerKey: string) => {
    setQuiz((prev) => {
      if (!prev || questionIndex < 0 || questionIndex >= prev.questions.length) return prev;
      const question = prev.questions[questionIndex];
      const nextAnswers = [...prev.answers];
      if (!answerKey || answerKey.trim() === '') {
        nextAnswers[questionIndex] = undefined;
      } else {
        nextAnswers[questionIndex] = {
          resposta: answerKey.trim().toUpperCase(),
          tipo: question.tipo,
          pending: prev.kind === 'simulation' || Boolean(prev.submittedSimulationId),
        };
      }
      return { ...prev, answers: nextAnswers };
    });
  }, []);

  const previousQuizQuestion = useCallback(() => {
    setQuiz((prev) => {
      if (!prev || prev.index <= 0) return prev;
      return { ...prev, index: prev.index - 1 };
    });
  }, []);

  const goToQuizQuestion = useCallback((index: number) => {
    setQuiz((prev) => {
      if (!prev || index < 0 || index >= prev.questions.length) return prev;
      return { ...prev, index };
    });
  }, []);

  const finishQuizSession = useCallback(() => {
    const currentQuiz = quizRef.current;
    if (!currentQuiz) return;
    const updatedAnswers = [...currentQuiz.answers];
    const newErrorAnnotations: ErrorNotebookEntry[] = [];
    const todayBr = localDateBrazilian();

    if (currentQuiz.kind === 'simulation' || currentQuiz.submittedSimulationId) {
      currentQuiz.questions.forEach((q, idx) => {
        const ans = updatedAnswers[idx];
        if (ans?.resposta) {
          const correctAns = normalizeAnswer(q.gabarito);
          const isCorrect = ans.resposta === correctAns;
          updatedAnswers[idx] = {
            ...ans,
            correta: isCorrect,
            gabarito: correctAns,
            pending: false,
          };
          if (!isCorrect) {
            const split = splitExamQuestion(q.enunciado);
            const alternatives = q.alternativas?.length ? q.alternativas : split.alternatives;
            newErrorAnnotations.push({
              id: `sim-err-${currentQuiz.id}-${idx + 1}-${uid(6)}`,
              data: todayBr,
              materia: q.materia,
              tipo: 'Erro em Simulado Fechado',
              texto:
                q.comentario?.trim() ||
                `Questão ${idx + 1} errada no simulado fechado (marcou ${ans.resposta}, gabarito ${correctAns}). Revisar conteúdo.`,
              corrigido: false, // Pendente de Correção
              origem: 'Simulado Fechado',
              questao: {
                enunciado: q.alternativas?.length ? q.enunciado : split.statement,
                alternativas: alternatives,
                resposta: ans.resposta,
                gabarito: correctAns,
                comentario: q.comentario || '',
              },
            });
          }
        }
      });
    }

    const now = Date.now();
    const currentTimerSec = computeCurrentTimerSeconds(timerState, now);
    const extraDelta = timerState.startedAt ? Math.max(0, currentTimerSec - currentQuiz.timerBaseline) : 0;
    const totalStudySeconds = currentQuiz.studySeconds + extraDelta;
    const elapsedSeconds = currentQuiz.startedAt ? Math.max(0, Math.floor((now - currentQuiz.startedAt) / 1000)) : 0;

    const snapshot: QuizSession = {
      ...currentQuiz,
      answers: updatedAnswers,
      index: currentQuiz.questions.length,
      completed: true,
      studySeconds: totalStudySeconds,
      timerBaseline: currentTimerSec,
      elapsedSeconds,
    };

    if (!snapshot.studyTimeRecorded && totalStudySeconds > 0 && updatedAnswers.some(Boolean)) {
      snapshot.studyTimeRecorded = allocateQuizStudyTimeToDb(snapshot, totalStudySeconds);
    }

    let record: CompletedSimulation | null = null;
    if (snapshot.kind === 'simulation' && !snapshot.savedResult) {
      record = buildCompletedSimulationRecord(snapshot, elapsedSeconds);
      snapshot.savedResult = record;
    }

    setDb((oldDb) => {
      const nextCompleted = record
        ? [record, ...oldDb.completedSimulations.filter((s) => s.id !== record.id)]
        : oldDb.completedSimulations;
      const nextAnnotations = newErrorAnnotations.length
        ? [...newErrorAnnotations, ...oldDb.annotations]
        : oldDb.annotations;
      return {
        ...oldDb,
        completedSimulations: nextCompleted,
        annotations: nextAnnotations,
      };
    });

    setQuiz(snapshot);

    if (newErrorAnnotations.length > 0) {
      toast(
        `${newErrorAnnotations.length} questão(ões) errada(s) adicionada(s) ao Caderno de Erros (Pendentes de Correção).`,
      );
    }
  }, [
    allocateQuizStudyTimeToDb,
    buildCompletedSimulationRecord,
    computeCurrentTimerSeconds,
    timerState,
    toast,
  ]);
  finishQuizSessionRef.current = finishQuizSession;

  const advanceQuizQuestion = useCallback(() => {
    if (!quiz) return;
    if (quiz.index + 1 >= quiz.questions.length) {
      finishQuizSession();
      return;
    }
    setQuiz((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        index: prev.index + 1,
      };
    });
  }, [finishQuizSession, quiz]);

  const cancelQuizSession = useCallback(() => {
    setQuiz(null);
  }, []);

  const retryRecordStudyTime = useCallback(
    (session: QuizSession) => {
      const ok = allocateQuizStudyTimeToDb(session, session.studySeconds);
      setQuiz((prev) => (prev ? { ...prev, studyTimeRecorded: ok, studyTimeError: '' } : prev));
    },
    [allocateQuizStudyTimeToDb],
  );

  const retryArchiveSimulation = useCallback(
    (session: QuizSession) => {
      const record = buildCompletedSimulationRecord(session, session.elapsedSeconds || 0);
      const todayBr = localDateBrazilian();
      const errorItems: ErrorNotebookEntry[] = [];
      session.questions.forEach((q, idx) => {
        const ans = session.answers[idx];
        const correctAns = normalizeAnswer(q.gabarito);
        if (ans?.resposta && ans.resposta !== correctAns) {
          const split = splitExamQuestion(q.enunciado);
          const alternatives = q.alternativas?.length ? q.alternativas : split.alternatives;
          errorItems.push({
            id: `sim-err-${session.id}-${idx + 1}-${uid(6)}`,
            data: todayBr,
            materia: q.materia,
            tipo: 'Erro em Simulado Fechado',
            texto:
              q.comentario?.trim() ||
              `Questão ${idx + 1} errada no simulado fechado (marcou ${ans.resposta}, gabarito ${correctAns}). Revisar conteúdo.`,
            corrigido: false,
            origem: 'Simulado Fechado',
            questao: {
              enunciado: q.alternativas?.length ? q.enunciado : split.statement,
              alternativas: alternatives,
              resposta: ans.resposta,
              gabarito: correctAns,
              comentario: q.comentario || '',
            },
          });
        }
      });

      setDb((oldDb) => {
        const existingAnnotationTexts = new Set(oldDb.annotations.map((a) => a.questao?.enunciado || a.texto));
        const filteredNewErrors = errorItems.filter((e) => !existingAnnotationTexts.has(e.questao?.enunciado || e.texto));
        return {
          ...oldDb,
          completedSimulations: [record, ...oldDb.completedSimulations.filter((s) => s.id !== record.id)],
          annotations: [...filteredNewErrors, ...oldDb.annotations],
        };
      });
      setQuiz((prev) => (prev ? { ...prev, savedResult: record, resultSaveError: '' } : prev));
      toast('Resultado do simulado e erros salvos no Caderno de Erros com sucesso.');
    },
    [buildCompletedSimulationRecord, toast],
  );

  const deleteSubmittedSimulation = useCallback(
    async (simulationId: string) => {
      const targetSim = dbRef.current.submittedSimulations.find((s) => s.id === simulationId);
      const ok = await requestConfirm({
        title: 'Excluir simulado enviado',
        description:
          'Excluir este simulado enviado e apagar também suas tentativas e estatísticas salvas?',
        confirmLabel: 'Excluir simulado',
        danger: true,
      });
      if (!ok) return;

      const removedAttempts = dbRef.current.completedSimulations.filter(
        (c) => c.prova_id === simulationId,
      ).length;
      if (targetSim?.arquivo) {
        deleteOrQueueDriveFiles({
          names: [
            `PROVA - ${targetSim.arquivo}`,
            targetSim.arquivo,
            `${targetSim.arquivo}.gabarito.txt`,
          ],
          subfolderHints: ['Provas e Gabaritos', 'Questões', 'Simulados'],
        });
      }
      setDb((prev) => ({
        ...prev,
        submittedSimulations: prev.submittedSimulations.filter((s) => s.id !== simulationId),
        completedSimulations: prev.completedSimulations.filter((c) => c.prova_id !== simulationId),
      }));
      toast(`Simulado removido. ${removedAttempts} tentativa(s) e estatísticas excluídas.`);
    },
    [deleteOrQueueDriveFiles, requestConfirm, toast],
  );

  // Annotations (Error Notebook)
  const addAnnotation = useCallback(
    (materia: string, tipo: string, texto: string) => {
      if (!texto.trim()) {
        toast('O texto da anotação não pode ficar vazio.', true);
        return;
      }
      setDb((prev) => ({
        ...prev,
        annotations: [
          {
            id: uid(12),
            data: localDateBrazilian(),
            materia: materia.trim() || 'Geral',
            tipo: tipo.trim() || 'Ponto Importante',
            texto: texto.trim(),
          },
          ...prev.annotations,
        ],
      }));
      toast('Anotação salva.');
    },
    [toast],
  );

  const updateAnnotation = useCallback(
    (
      id: string,
      materia: string,
      tipo: string,
      texto: string,
      questionPatch?: {
        enunciado?: string;
        gabarito?: string;
        resposta?: string;
        comentario?: string;
      },
      silent = false,
    ) => {
      const cleanMateria = materia.trim() || 'Geral';
      const cleanTipo = tipo.trim() || 'Ponto Importante';
      const cleanTexto = texto.trim();

      let changed = false;
      if (id.startsWith('correcao-prova:')) {
        const now = new Date().toISOString().slice(0, 19);
        setDb((prev) => {
          let localMutated = false;
          const nextProofFiles = prev.proofFiles.map((pf) => {
            let pfMutated = false;
            const nextCorrecoes = pf.correcoes.map((corr) => {
              const entryId = `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}`;
              if (entryId !== id) return corr;
              const nextTexto = cleanTexto || corr.texto;
              const nextQuestao =
                questionPatch?.enunciado !== undefined && questionPatch.enunciado.trim()
                  ? questionPatch.enunciado.trim()
                  : corr.questao;
              const nextObservacoes =
                questionPatch?.comentario !== undefined
                  ? questionPatch.comentario.trim()
                  : corr.observacoes;
              if (
                corr.materia === cleanMateria &&
                corr.tipo === cleanTipo &&
                corr.texto === nextTexto &&
                corr.questao === nextQuestao &&
                corr.observacoes === nextObservacoes
              ) {
                return corr;
              }
              pfMutated = true;
              localMutated = true;
              return {
                ...corr,
                materia: cleanMateria,
                tipo: cleanTipo,
                texto: nextTexto,
                questao: nextQuestao,
                observacoes: nextObservacoes,
                atualizado_em: now,
              };
            });
            return pfMutated ? { ...pf, correcoes: nextCorrecoes } : pf;
          });
          if (!localMutated) return prev;
          changed = true;
          return {
            ...prev,
            proofFiles: nextProofFiles,
          };
        });
      } else {
        setDb((prev) => {
          let localMutated = false;
          const nextAnnotations = prev.annotations.map((item) => {
            if (item.id !== id) return item;
            const updatedQuestao =
              item.questao && questionPatch
                ? {
                    ...item.questao,
                    ...(questionPatch.enunciado !== undefined
                      ? { enunciado: questionPatch.enunciado.trim() }
                      : {}),
                    ...(questionPatch.gabarito !== undefined
                      ? { gabarito: questionPatch.gabarito.trim().toUpperCase() }
                      : {}),
                    ...(questionPatch.resposta !== undefined
                      ? { resposta: questionPatch.resposta.trim().toUpperCase() }
                      : {}),
                    ...(questionPatch.comentario !== undefined
                      ? { comentario: questionPatch.comentario.trim() }
                      : {}),
                  }
                : item.questao;
            const questaoUnchanged =
              item.questao === updatedQuestao ||
              (item.questao &&
                updatedQuestao &&
                item.questao.enunciado === updatedQuestao.enunciado &&
                item.questao.gabarito === updatedQuestao.gabarito &&
                item.questao.resposta === updatedQuestao.resposta &&
                item.questao.comentario === updatedQuestao.comentario);
            if (
              item.materia === cleanMateria &&
              item.tipo === cleanTipo &&
              item.texto === cleanTexto &&
              questaoUnchanged
            ) {
              return item;
            }
            localMutated = true;
            return {
              ...item,
              materia: cleanMateria,
              tipo: cleanTipo,
              texto: cleanTexto,
              ...(updatedQuestao ? { questao: updatedQuestao } : {}),
            };
          });
          if (!localMutated) return prev;
          changed = true;
          return {
            ...prev,
            annotations: nextAnnotations,
          };
        });
      }
      if (!silent && changed) toast('Registro atualizado.');
    },
    [toast],
  );

  const updateErrorEntrySubject = useCallback(
    (id: string, materia: string) => {
      const cleanMateria = visibleName(materia) || 'Geral';
      if (id.startsWith('correcao-prova:')) {
        const now = new Date().toISOString().slice(0, 19);
        setDb((prev) => ({
          ...prev,
          proofFiles: prev.proofFiles.map((pf) => ({
            ...pf,
            correcoes: pf.correcoes.map((corr) => {
              const entryId = `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}`;
              return entryId === id
                ? { ...corr, materia: cleanMateria, atualizado_em: now }
                : corr;
            }),
          })),
        }));
      } else {
        setDb((prev) => ({
          ...prev,
          annotations: prev.annotations.map((item) =>
            item.id === id ? { ...item, materia: cleanMateria } : item,
          ),
        }));
      }
      toast(`Matéria atribuída: ${cleanMateria}.`);
    },
    [toast],
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      if (id.startsWith('correcao-prova:')) {
        setDb((prev) => ({
          ...prev,
          proofFiles: prev.proofFiles.map((pf) => ({
            ...pf,
            correcoes: pf.correcoes.filter(
              (corr) => `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}` !== id,
            ),
          })),
        }));
      } else {
        setDb((prev) => ({
          ...prev,
          annotations: prev.annotations.filter((item) => item.id !== id),
        }));
      }
      toast('Registro excluído.');
    },
    [toast],
  );

  const markAnnotationCorrected = useCallback(
    (id: string) => {
      const today = localDateBrazilian();
      const todayIso = localDateIso();
      const nextReviewIso = addDaysIso(todayIso, 1);
      if (id.startsWith('correcao-prova:')) {
        const now = new Date().toISOString().slice(0, 19);
        setDb((prev) => ({
          ...prev,
          proofFiles: prev.proofFiles.map((pf) => ({
            ...pf,
            correcoes: pf.correcoes.map((corr) => {
              const entryId = `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}`;
              return entryId === id
                ? {
                    ...corr,
                    corrigido: true,
                    corrigido_em: today,
                    nivel_revisao: 1,
                    revisado_em: todayIso,
                    proxima_revisao: nextReviewIso,
                    atualizado_em: now,
                  }
                : corr;
            }),
          })),
        }));
      } else {
        setDb((prev) => ({
          ...prev,
          annotations: prev.annotations.map((item) =>
            item.id === id
              ? {
                  ...item,
                  corrigido: true,
                  corrigido_em: today,
                  nivel_revisao: 1,
                  revisado_em: todayIso,
                  proxima_revisao: nextReviewIso,
                }
              : item,
          ),
        }));
      }
      toast('Questão marcada como corrigida! 1ª revisão espaçada agendada para amanhã.');
    },
    [toast],
  );

  const reopenAnnotation = useCallback(
    (id: string) => {
      if (id.startsWith('correcao-prova:')) {
        const now = new Date().toISOString().slice(0, 19);
        setDb((prev) => ({
          ...prev,
          proofFiles: prev.proofFiles.map((pf) => ({
            ...pf,
            correcoes: pf.correcoes.map((corr) => {
              const entryId = `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}`;
              return entryId === id
                ? { ...corr, corrigido: false, corrigido_em: undefined, atualizado_em: now }
                : corr;
            }),
          })),
        }));
      } else {
        setDb((prev) => ({
          ...prev,
          annotations: prev.annotations.map((item) =>
            item.id === id ? { ...item, corrigido: false, corrigido_em: undefined } : item,
          ),
        }));
      }
      toast('Questão reaberta como Pendente de Correção.');
    },
    [toast],
  );

  const toggleAnnotationCorrected = useCallback(
    (id: string) => {
      const today = localDateBrazilian();
      const todayIso = localDateIso();
      if (id.startsWith('correcao-prova:')) {
        const now = new Date().toISOString().slice(0, 19);
        setDb((prev) => ({
          ...prev,
          proofFiles: prev.proofFiles.map((pf) => ({
            ...pf,
            correcoes: pf.correcoes.map((corr) => {
              const entryId = `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}`;
              if (entryId !== id) return corr;
              const nextState = !corr.corrigido;
              return {
                ...corr,
                corrigido: nextState,
                corrigido_em: nextState ? today : undefined,
                nivel_revisao: nextState ? Math.max(1, corr.nivel_revisao || 1) : corr.nivel_revisao,
                revisado_em: nextState ? todayIso : corr.revisado_em,
                proxima_revisao: nextState
                  ? corr.proxima_revisao || addDaysIso(todayIso, 1)
                  : corr.proxima_revisao,
                atualizado_em: now,
              };
            }),
          })),
        }));
      } else {
        setDb((prev) => ({
          ...prev,
          annotations: prev.annotations.map((item) => {
            if (item.id !== id) return item;
            const nextState = !item.corrigido;
            return {
              ...item,
              corrigido: nextState,
              corrigido_em: nextState ? today : undefined,
              nivel_revisao: nextState ? Math.max(1, item.nivel_revisao || 1) : item.nivel_revisao,
              revisado_em: nextState ? todayIso : item.revisado_em,
              proxima_revisao: nextState ? item.proxima_revisao || addDaysIso(todayIso, 1) : item.proxima_revisao,
            };
          }),
        }));
      }
    },
    [],
  );

  const advanceErrorReview = useCallback(
    (id: string) => {
      const today = localDateBrazilian();
      const todayIso = localDateIso();
      const intervals = [1, 7, 15, 30];
      let scheduledDays = 7;

      if (id.startsWith('correcao-prova:')) {
        const now = new Date().toISOString().slice(0, 19);
        setDb((prev) => ({
          ...prev,
          proofFiles: prev.proofFiles.map((pf) => ({
            ...pf,
            correcoes: pf.correcoes.map((corr) => {
              const entryId = `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}`;
              if (entryId !== id) return corr;
              const currentLevel = corr.nivel_revisao ?? (corr.corrigido ? 1 : 0);
              const nextLevel = currentLevel + 1;
              scheduledDays = intervals[Math.min(nextLevel, intervals.length - 1)];
              return {
                ...corr,
                corrigido: true,
                corrigido_em: corr.corrigido_em || today,
                nivel_revisao: nextLevel,
                revisado_em: todayIso,
                proxima_revisao: addDaysIso(todayIso, scheduledDays),
                atualizado_em: now,
              };
            }),
          })),
        }));
      } else {
        setDb((prev) => ({
          ...prev,
          annotations: prev.annotations.map((item) => {
            if (item.id !== id) return item;
            const currentLevel = item.nivel_revisao ?? (item.corrigido ? 1 : 0);
            const nextLevel = currentLevel + 1;
            scheduledDays = intervals[Math.min(nextLevel, intervals.length - 1)];
            return {
              ...item,
              corrigido: true,
              corrigido_em: item.corrigido_em || today,
              nivel_revisao: nextLevel,
              revisado_em: todayIso,
              proxima_revisao: addDaysIso(todayIso, scheduledDays),
            };
          }),
        }));
      }
      toast(`Revisão concluída! Próxima revisão agendada para daqui a ${scheduledDays} dia(s).`);
    },
    [toast],
  );

  const startErrorNotebookQuiz = useCallback(
    (subjectFilter = 'Todas as Matérias', onlyPending = true) => {
      const entries = allErrorEntries.filter((entry) => {
        if (!entry.questao?.enunciado) return false;
        if (onlyPending && entry.corrigido) return false;
        if (subjectFilter !== 'Todas as Matérias' && entry.materia !== subjectFilter) return false;
        return true;
      });

      if (!entries.length) {
        toast('Nenhuma questão vinculada encontrada com os filtros atuais para refazer.', true);
        return;
      }

      const questions: Question[] = entries.map((entry, idx) => {
        const q = entry.questao!;
        const alts = q.alternativas || [];
        const answer = normalizeAnswer(q.gabarito || 'C');
        return {
          id: `err-quiz-${entry.id}`,
          numero: idx + 1,
          materia: entry.materia || 'Geral',
          enunciado: q.enunciado,
          alternativas: alts,
          gabarito: answer,
          comentario: q.comentario || entry.texto || '',
          tipo: alts.length > 0 ? 'ME' : 'CE',
        };
      });

      ensureTimerRunning();
      setQuiz({
        id: uid(16),
        kind: 'training',
        titulo: 'Revisão do Caderno de Erros',
        materia: subjectFilter,
        questions,
        index: 0,
        answers: Array(questions.length),
        studySeconds: 0,
        timerBaseline: getCurrentTimerSeconds(),
      });
      setActivePage('Treino Diário');
      toast(`Iniciando bateria com ${questions.length} questão(ões) do Caderno de Erros!`);
    },
    [allErrorEntries, ensureTimerRunning, getCurrentTimerSeconds, toast],
  );

  // Case Law
  const saveCaseLaw = useCallback(
    (payload: Omit<CaseLawItem, 'id' | 'criado_em'> & { id?: string }) => {
      const now = new Date().toISOString().slice(0, 19);
      if (payload.id) {
        setDb((prev) => ({
          ...prev,
          caseLaw: prev.caseLaw.map((item) =>
            item.id === payload.id
              ? {
                  ...item,
                  categoria: payload.categoria,
                  titulo: payload.titulo,
                  tribunal: payload.tribunal,
                  identificador: payload.identificador,
                  fonte: payload.fonte,
                  texto: payload.texto,
                  atualizado_em: now,
                }
              : item,
          ),
        }));
        toast('Alterações salvas.');
      } else {
        setDb((prev) => ({
          ...prev,
          caseLaw: [
            {
              id: uid(16),
              categoria: payload.categoria || 'Jurisprudência',
              titulo: payload.titulo,
              tribunal: payload.tribunal,
              identificador: payload.identificador,
              fonte: payload.fonte,
              texto: payload.texto,
              criado_em: now,
            },
            ...prev.caseLaw,
          ],
        }));
        toast('Referência adicionada.');
      }
    },
    [toast],
  );

  const deleteCaseLaw = useCallback(
    (id: string) => {
      setDb((prev) => ({
        ...prev,
        caseLaw: prev.caseLaw.filter((item) => item.id !== id),
      }));
      toast('Referência excluída.');
    },
    [toast],
  );

  // Contests, Datas & Locais, Editais & Weekly Schedule TXT Folder Sync
  const contestTxtSyncTimerRef = useRef<number | null>(null);
  const scheduleTxtSyncTimerRef = useRef<number | null>(null);

  const syncContestsAndEditaisTxtToFolder = useCallback(
    async (options?: {
      contestId?: string;
      downloadContestId?: string;
      downloadEditalContestId?: string;
      downloadMaster?: boolean;
      silent?: boolean;
    }): Promise<void> => {
      const scope = activeScopeRef.current;
      const allContests = dbRef.current.contests || [];
      const targetContests = options?.contestId
        ? allContests.filter((c) => c.id === options.contestId)
        : allContests;

      try {
        // 1. Master file for Datas & Locais folder
        const masterTxt = serializeAllContestsMasterTxt(allContests);
        const masterFileName = 'DATAS E LOCAIS - Controle Geral de Inscricoes Boletos e Locais.txt';
        const masterBlob = new Blob([masterTxt], { type: 'text/plain;charset=utf-8' });
        await saveFileBlob('contest_txt_master', masterBlob, scope);
        if (options?.downloadMaster) {
          triggerBlobDownload(masterBlob, masterFileName);
        }

        // 2. Per-contest registration/boleto/location TXT and Edital TXT
        for (const c of targetContests) {
          const regTxt = serializeContestRegistrationTxt(c);
          const regFileName = buildContestTxtFileName(c);
          const regBlob = new Blob([regTxt], { type: 'text/plain;charset=utf-8' });
          await saveFileBlob(`contest_txt_${c.id}`, regBlob, scope);
          if (options?.downloadContestId === c.id) {
            triggerBlobDownload(regBlob, regFileName);
          }

          if ((c.edital_pontos?.length || 0) > 0 || options?.downloadEditalContestId === c.id) {
            const editalTxt = serializeContestEditalTxt(c);
            const editalFileName = buildEditalTxtFileName(c);
            const editalBlob = new Blob([editalTxt], { type: 'text/plain;charset=utf-8' });
            await saveFileBlob(`edital_txt_${c.id}`, editalBlob, scope);
            if (options?.downloadEditalContestId === c.id) {
              triggerBlobDownload(editalBlob, editalFileName);
            }
          }
        }

        // 3. Upsert into Google Drive folders ('Datas e Locais' & 'Editais') if connected
        const token = driveConnected && driveTokenReady ? await getAccessToken() : null;
        if (token) {
          const uploadedDriveFiles: DriveFileInfo[] = [];
          const savedMaster = await upsertTextFileInDriveSubFolder(
            masterTxt,
            masterFileName,
            'Datas e Locais',
            token,
          ).catch(() => null);
          if (savedMaster) uploadedDriveFiles.push(savedMaster);

          for (const c of targetContests) {
            const regTxt = serializeContestRegistrationTxt(c);
            const regFileName = buildContestTxtFileName(c);
            const savedReg = await upsertTextFileInDriveSubFolder(
              regTxt,
              regFileName,
              'Datas e Locais',
              token,
            ).catch(() => null);
            if (savedReg) uploadedDriveFiles.push(savedReg);

            if ((c.edital_pontos?.length || 0) > 0) {
              const editalTxt = serializeContestEditalTxt(c);
              const editalFileName = buildEditalTxtFileName(c);
              const savedEdital = await upsertTextFileInDriveSubFolder(
                editalTxt,
                editalFileName,
                'Editais',
                token,
              ).catch(() => null);
              if (savedEdital) uploadedDriveFiles.push(savedEdital);
            }
          }

          if (uploadedDriveFiles.length > 0) {
            recordUploadedFilesInCacheMeta(scope, { driveFiles: uploadedDriveFiles });
          }
        }

        if (!options?.silent) {
          toast(
            token
              ? 'Arquivos .txt salvos nas pastas "Datas e Locais" e "Editais" do Google Drive.'
              : 'Arquivos .txt de Datas & Locais e Editais salvos localmente no navegador.',
          );
        }
      } catch (err: any) {
        if (!options?.silent) {
          toast(`Erro ao salvar arquivos .txt: ${err?.message || 'Falha'}`, true);
        }
      }
    },
    [driveConnected, driveTokenReady, toast],
  );

  const scheduleAutoContestTxtSync = useCallback(
    (contestId?: string) => {
      if (contestTxtSyncTimerRef.current) {
        window.clearTimeout(contestTxtSyncTimerRef.current);
      }
      contestTxtSyncTimerRef.current = window.setTimeout(() => {
        contestTxtSyncTimerRef.current = null;
        void syncContestsAndEditaisTxtToFolder({ contestId, silent: true });
      }, 800);
    },
    [syncContestsAndEditaisTxtToFolder],
  );

  const importContestsOrEditalTxtFile = useCallback(
    async (file: File): Promise<number> => {
      const rawText = await readStudyTextFile(file);
      const parsedContests = parseContestOrEditalTxt(rawText, file.name);
      if (!parsedContests.length) {
        throw new Error('Nenhum concurso ou edital válido encontrado no arquivo .txt.');
      }

      setDb((prev) => {
        const merged = [...prev.contests];
        for (const pc of parsedContests) {
          const idx = merged.findIndex(
            (existing) =>
              (pc.id && existing.id === pc.id) ||
              normalizeSearch(existing.concurso) === normalizeSearch(pc.concurso),
          );
          if (idx === -1) {
            merged.unshift(pc);
          } else {
            const cur = merged[idx];
            const curPts = cur.edital_pontos || [];
            const byKey = new Map<string, ContestEditalPoint>();
            curPts.forEach((p) =>
              byKey.set(`${normalizeSearch(p.materia)}::${normalizeSearch(p.titulo)}`, p),
            );
            const combined = [...curPts];
            for (const incPt of pc.edital_pontos || []) {
              const k = `${normalizeSearch(incPt.materia)}::${normalizeSearch(incPt.titulo)}`;
              const existingPt = byKey.get(k);
              if (!existingPt) {
                combined.push(incPt);
                byKey.set(k, incPt);
              } else if (incPt.estudado && !existingPt.estudado) {
                existingPt.estudado = true;
                existingPt.estudado_em = incPt.estudado_em || localDateBrazilian();
              }
            }
            merged[idx] = {
              ...cur,
              data_abertura: pc.data_abertura || cur.data_abertura,
              data_pagamento: pc.data_pagamento || cur.data_pagamento,
              status_pagamento: pc.status_pagamento || cur.status_pagamento,
              local_prova: pc.local_prova || cur.local_prova,
              observacoes: pc.observacoes || cur.observacoes,
              edital_arquivo: pc.edital_arquivo || file.name || cur.edital_arquivo,
              edital_pontos: combined,
            };
          }
        }
        const next: StudyDatabase = { ...prev, contests: merged };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });

      scheduleAutoContestTxtSync();
      toast(`${parsedContests.length} registro(s) de concurso/edital importado(s) do arquivo .txt!`);
      return parsedContests.length;
    },
    [scheduleAutoContestTxtSync, toast],
  );

  // Contests & Editais
  const addContest = useCallback(
    (payload: Omit<ContestItem, 'id'>): ContestItem => {
      const created: ContestItem = {
        id: uid(12),
        ...payload,
        edital_pontos: Array.isArray(payload.edital_pontos) ? payload.edital_pontos : [],
      };
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: [created, ...prev.contests],
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      setSelectedEditalContestId(created.id);
      scheduleAutoContestTxtSync(created.id);
      toast(
        created.edital_pontos && created.edital_pontos.length > 0
          ? `Concurso cadastrado e salvo em .txt com ${created.edital_pontos.length} ponto(s) no edital.`
          : 'Concurso cadastrado e salvo na pasta Datas e Locais (.txt).',
      );
      return created;
    },
    [scheduleAutoContestTxtSync, toast],
  );

  const updateContest = useCallback(
    (id: string, patch: Partial<Omit<ContestItem, 'id'>>) => {
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(id);
      toast('Concurso atualizado e salvo em .txt.');
    },
    [scheduleAutoContestTxtSync, toast],
  );

  const toggleContestPayment = useCallback(
    (id: string) => {
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) =>
            c.id === id
              ? { ...c, status_pagamento: c.status_pagamento === 'Pago' ? 'Não Pago' : 'Pago' }
              : c,
          ),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(id);
    },
    [scheduleAutoContestTxtSync],
  );

  const deleteContest = useCallback(
    (id: string) => {
      const target = dbRef.current.contests.find((c) => c.id === id);
      if (contestTxtSyncTimerRef.current) {
        window.clearTimeout(contestTxtSyncTimerRef.current);
        contestTxtSyncTimerRef.current = null;
      }
      void deleteFileBlob(`contest_txt_${id}`);
      void deleteFileBlob(`edital_txt_${id}`);
      if (target) {
        const namesToDelete = [
          buildContestTxtFileName(target),
          buildEditalTxtFileName(target),
          ...(target.edital_arquivo
            ? [`EDITAL - ${target.edital_arquivo}`, target.edital_arquivo]
            : []),
        ].filter(Boolean);
        deleteOrQueueDriveFiles({
          names: namesToDelete,
          subfolderHints: ['Datas e Locais', 'Editais'],
        });
      }
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.filter((c) => c.id !== id),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      setSelectedEditalContestId((prevId) => (prevId === id ? null : prevId));
      scheduleAutoContestTxtSync();
      toast('Concurso excluído.');
    },
    [deleteOrQueueDriveFiles, scheduleAutoContestTxtSync, toast],
  );

  const openContestEdital = useCallback((contestId: string) => {
    setSelectedEditalContestId(contestId);
    setActivePage('Editais');
    setMobileOpen(false);
  }, []);

  const saveContestEditalPoints = useCallback(
    (
      contestId: string,
      points: Array<{ materia: string; titulo: string; observacao?: string }>,
      options?: { replace?: boolean; arquivo?: string; silent?: boolean },
    ): number => {
      const cleanPoints = points
        .map((p) => ({
          materia: String(p.materia || 'Geral').trim() || 'Geral',
          titulo: String(p.titulo || '').trim(),
          observacao: p.observacao?.trim() || undefined,
        }))
        .filter((p) => Boolean(p.titulo));

      if (!cleanPoints.length && !options?.replace) {
        if (!options?.silent) toast('Nenhum ponto válido informado.', true);
        return 0;
      }

      let addedCount = 0;
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) => {
            if (c.id !== contestId) return c;
            const existing = options?.replace ? [] : [...(c.edital_pontos || [])];
            const seen = new Set(
              existing.map((item) => `${normalizeSearch(item.materia)}::${normalizeSearch(item.titulo)}`),
            );
            const nextPoints: ContestEditalPoint[] = [...existing];
            for (const pt of cleanPoints) {
              const key = `${normalizeSearch(pt.materia)}::${normalizeSearch(pt.titulo)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              nextPoints.push({
                id: uid(10),
                materia: pt.materia,
                titulo: pt.titulo,
                estudado: false,
                observacao: pt.observacao,
              });
              addedCount += 1;
            }
            return {
              ...c,
              edital_arquivo: options?.arquivo !== undefined ? options.arquivo : c.edital_arquivo,
              edital_pontos: nextPoints,
            };
          }),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });

      scheduleAutoContestTxtSync(contestId);

      if (!options?.silent) {
        if (addedCount > 0) {
          toast(`${addedCount} ponto(s) adicionado(s) ao edital e salvo(s) na pasta Editais (.txt).`);
        } else {
          toast('Os pontos informados já existem neste edital.');
        }
      }
      return addedCount;
    },
    [scheduleAutoContestTxtSync, toast],
  );

  const importContestEditalFile = useCallback(
    async (
      contestId: string,
      file: File,
      options?: { replace?: boolean; defaultSubject?: string },
    ): Promise<{ added: number; rawText: string; fileName: string }> => {
      const rawText = await readStudyTextFile(file);
      const parsed = parseEditalTopicsText(rawText, options?.defaultSubject || 'Geral');
      if (!parsed.length) {
        throw new Error('Não foi possível identificar pontos/tópicos do edital neste arquivo.');
      }
      const added = saveContestEditalPoints(contestId, parsed, {
        replace: options?.replace,
        arquivo: file.name,
        silent: true,
      });
      await autoSyncFileToDrive(file, `EDITAL - ${file.name}`, 'Editais');
      scheduleAutoContestTxtSync(contestId);
      toast(
        added > 0
          ? `Edital "${file.name}" importado e salvo em .txt: ${added} ponto(s) adicionado(s).`
          : `Edital "${file.name}" lido (${parsed.length} pontos já cadastrados).`,
      );
      return { added, rawText, fileName: file.name };
    },
    [autoSyncFileToDrive, saveContestEditalPoints, scheduleAutoContestTxtSync, toast],
  );

  const toggleContestEditalPoint = useCallback(
    (contestId: string, pointId: string) => {
      const today = localDateBrazilian();
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) => {
            if (c.id !== contestId) return c;
            return {
              ...c,
              edital_pontos: (c.edital_pontos || []).map((pt) => {
                if (pt.id !== pointId) return pt;
                const nextDone = !pt.estudado;
                return {
                  ...pt,
                  estudado: nextDone,
                  estudado_em: nextDone ? today : undefined,
                };
              }),
            };
          }),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(contestId);
    },
    [scheduleAutoContestTxtSync],
  );

  const setContestEditalPointsStudied = useCallback(
    (contestId: string, pointIds: string[], studied: boolean) => {
      const idSet = new Set(pointIds);
      if (!idSet.size) return;
      const today = localDateBrazilian();
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) => {
            if (c.id !== contestId) return c;
            return {
              ...c,
              edital_pontos: (c.edital_pontos || []).map((pt) =>
                idSet.has(pt.id)
                  ? {
                      ...pt,
                      estudado: studied,
                      estudado_em: studied ? pt.estudado_em || today : undefined,
                    }
                  : pt,
              ),
            };
          }),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(contestId);
      toast(
        studied
          ? `${pointIds.length} ponto(s) marcado(s) como estudados e atualizados no .txt.`
          : `${pointIds.length} ponto(s) desmarcado(s) e atualizados no .txt.`,
      );
    },
    [scheduleAutoContestTxtSync, toast],
  );

  const updateContestEditalPoint = useCallback(
    (
      contestId: string,
      pointId: string,
      patch: Partial<Pick<ContestEditalPoint, 'materia' | 'titulo' | 'observacao'>>,
    ) => {
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) => {
            if (c.id !== contestId) return c;
            return {
              ...c,
              edital_pontos: (c.edital_pontos || []).map((pt) =>
                pt.id === pointId
                  ? {
                      ...pt,
                      materia: patch.materia !== undefined ? patch.materia.trim() || 'Geral' : pt.materia,
                      titulo: patch.titulo !== undefined ? patch.titulo.trim() || pt.titulo : pt.titulo,
                      observacao: patch.observacao !== undefined ? patch.observacao.trim() : pt.observacao,
                    }
                  : pt,
              ),
            };
          }),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(contestId);
      toast('Ponto do edital atualizado.');
    },
    [scheduleAutoContestTxtSync, toast],
  );

  const deleteContestEditalPoint = useCallback(
    (contestId: string, pointId: string) => {
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) => {
            if (c.id !== contestId) return c;
            return {
              ...c,
              edital_pontos: (c.edital_pontos || []).filter((pt) => pt.id !== pointId),
            };
          }),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(contestId);
      toast('Ponto removido do edital.');
    },
    [scheduleAutoContestTxtSync, toast],
  );

  const linkEditalPointToLaw = useCallback(
    (
      contestId: string,
      pointId: string,
      link: { pastaLei: string; filtroArtigos: string; label?: string },
    ): boolean => {
      const pastaLei = String(link.pastaLei || '').trim();
      const filtroArtigos = String(link.filtroArtigos || '').trim();
      const label = link.label ? String(link.label).trim() : undefined;
      if (!pastaLei || !filtroArtigos) {
        toast('Selecione uma lei e informe o(s) artigo(s) para vincular.', true);
        return false;
      }

      const contest = dbRef.current.contests.find((c) => c.id === contestId);
      const targetPt = (contest?.edital_pontos || []).find((p) => p.id === pointId);
      if (!contest || !targetPt) {
        toast('Ponto do edital não encontrado.', true);
        return false;
      }

      const normLaw = normalizeSearch(pastaLei);
      const normSpec = normalizeSearch(filtroArtigos);
      const duplicate = (targetPt.artigos_vinculados || []).some(
        (existing) =>
          normalizeSearch(existing.pastaLei) === normLaw &&
          normalizeSearch(existing.filtroArtigos) === normSpec,
      );
      if (duplicate) {
        toast('Este artigo/faixa já está vinculado a este ponto do edital.');
        return false;
      }

      const newLink: EditalLawLink = {
        id: uid(10),
        pastaLei,
        filtroArtigos,
        ...(label && label !== filtroArtigos ? { label } : {}),
      };

      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) => {
            if (c.id !== contestId) return c;
            return {
              ...c,
              edital_pontos: (c.edital_pontos || []).map((pt) =>
                pt.id === pointId
                  ? {
                      ...pt,
                      artigos_vinculados: [...(pt.artigos_vinculados || []), newLink],
                    }
                  : pt,
              ),
            };
          }),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(contestId);
      toast(`Vinculado: ${visibleName(pastaLei)} · ${label || filtroArtigos}.`);
      return true;
    },
    [scheduleAutoContestTxtSync, toast],
  );

  const unlinkEditalPointFromLaw = useCallback(
    (contestId: string, pointId: string, linkId: string) => {
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) => {
            if (c.id !== contestId) return c;
            return {
              ...c,
              edital_pontos: (c.edital_pontos || []).map((pt) =>
                pt.id === pointId
                  ? {
                      ...pt,
                      artigos_vinculados: (pt.artigos_vinculados || []).filter(
                        (l) => l.id !== linkId,
                      ),
                    }
                  : pt,
              ),
            };
          }),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(contestId);
      toast('Vínculo entre Edital e Lei Seca removido.');
    },
    [scheduleAutoContestTxtSync, toast],
  );

  const clearContestEdital = useCallback(
    async (contestId: string): Promise<boolean> => {
      const contest = dbRef.current.contests.find((c) => c.id === contestId);
      const total = contest?.edital_pontos?.length || 0;
      if (!total) return false;
      const accepted = await requestConfirm({
        title: 'Limpar edital do concurso?',
        description: `Todos os ${total} ponto(s) do edital de "${contest?.concurso || 'concurso'}" serão removidos.`,
        confirmLabel: 'Limpar edital',
        danger: true,
      });
      if (!accepted) return false;

      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          contests: prev.contests.map((c) =>
            c.id === contestId ? { ...c, edital_pontos: [], edital_arquivo: undefined } : c,
          ),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoContestTxtSync(contestId);
      toast('Edital limpo.');
      return true;
    },
    [requestConfirm, scheduleAutoContestTxtSync, toast],
  );

  // Schedule & Goals (with Weekly TXT Folder Persistence)
  const buildUpdatedWeeklyScheduleState = (
    prev: StudyDatabase,
    nextSchedule: ScheduleMap,
    nextDayDates?: Partial<Record<WeekdayName, string>>,
    explicitWeekKey?: string,
  ): StudyDatabase => {
    const dayDates = nextDayDates || prev.scheduleDayDates || getCurrentWeekDates();
    const resolvedKey =
      explicitWeekKey || resolveActiveScheduleWeekKey(dayDates, nextSchedule);
    const meta = buildScheduleWeekMetadata(resolvedKey, dayDates);
    const weekRecord: WeeklyScheduleFileRecord = {
      weekKey: meta.weekKey,
      label: meta.label,
      fileName: meta.fileName,
      updatedAt: localDateTimeBrazilian(),
      blobKey: `schedule_week_${meta.weekKey}`,
      schedule: nextSchedule,
      scheduleDayDates: meta.dayDates,
    };
    const next: StudyDatabase = {
      ...prev,
      schedule: nextSchedule,
      scheduleDayDates: meta.dayDates,
      weeklySchedules: {
        ...(prev.weeklySchedules || {}),
        [meta.weekKey]: weekRecord,
      },
    };
    dbRef.current = next;
    pendingCloudSyncRef.current = true;
    return next;
  };

  const saveScheduleWeekToTxtFolder = useCallback(
    async (
      weekInput?: string,
      options?: { silent?: boolean; download?: boolean },
    ): Promise<void> => {
      window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
      const scope = activeScopeRef.current;
      const curDb = dbRef.current;
      const activeWeekKey =
        weekInput && /^\d{4}-W\d{2}$/i.test(weekInput.trim())
          ? weekInput.trim().toUpperCase()
          : resolveActiveScheduleWeekKey(curDb.scheduleDayDates, curDb.schedule);

      const savedRecord = curDb.weeklySchedules?.[activeWeekKey];
      const scheduleToSerialize =
        weekInput && savedRecord && activeWeekKey !== resolveActiveScheduleWeekKey(curDb.scheduleDayDates, curDb.schedule)
          ? savedRecord.schedule
          : curDb.schedule;
      const datesToSerialize =
        weekInput && savedRecord && activeWeekKey !== resolveActiveScheduleWeekKey(curDb.scheduleDayDates, curDb.schedule)
          ? savedRecord.scheduleDayDates
          : curDb.scheduleDayDates;

      const meta = buildScheduleWeekMetadata(activeWeekKey, datesToSerialize);
      removePendingDriveDeletesForTarget(scope, { names: [meta.fileName] });
      const txtContent = serializeScheduleWeekToText(
        meta.weekKey,
        scheduleToSerialize,
        meta.dayDates,
      );
      const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
      const blobKey = `schedule_week_${meta.weekKey}`;
      await saveFileBlob(blobKey, blob, scope);

      if (options?.download) {
        triggerBlobDownload(blob, meta.fileName);
      }

      if (!options?.silent) {
        lastUrgentSaveMsRef.current = Date.now();
      }

      setDb((prev) => {
        const prevRec = prev.weeklySchedules?.[meta.weekKey];
        const scheduleUnchanged =
          prevRec &&
          prevRec.blobKey === blobKey &&
          prevRec.fileName === meta.fileName &&
          JSON.stringify(prevRec.schedule) === JSON.stringify(scheduleToSerialize) &&
          JSON.stringify(prevRec.scheduleDayDates || {}) === JSON.stringify(meta.dayDates || {});
        if (scheduleUnchanged && options?.silent) {
          return prev;
        }
        const nextRecord: WeeklyScheduleFileRecord = {
          weekKey: meta.weekKey,
          label: meta.label,
          fileName: meta.fileName,
          updatedAt: localDateTimeBrazilian(),
          blobKey,
          schedule: scheduleToSerialize,
          scheduleDayDates: meta.dayDates,
        };
        const next: StudyDatabase = {
          ...prev,
          weeklySchedules: {
            ...(prev.weeklySchedules || {}),
            [meta.weekKey]: nextRecord,
          },
        };
        dbRef.current = next;
        return next;
      });

      const token = driveConnected && driveTokenReady ? await getAccessToken() : null;
      if (token) {
        try {
          const uploaded = await upsertTextFileInDriveSubFolder(
            txtContent,
            meta.fileName,
            'Cronogramas',
            token,
          );
          recordUploadedFilesInCacheMeta(scope, { driveFiles: [uploaded] });
        } catch (err: any) {
          if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
            setDriveTokenReady(false);
          }
          if (!options?.silent) {
            toast(`Cronograma salvo no navegador; aviso no Drive: ${err?.message || 'Falha'}`, true);
            return;
          }
        }
      }

      if (!options?.silent) {
        toast(
          token
            ? `Arquivo "${meta.fileName}" salvo na pasta Cronogramas do Google Drive!`
            : `Arquivo "${meta.fileName}" salvo no navegador!`,
        );
      }
    },
    [driveConnected, driveTokenReady, toast],
  );

  const scheduleAutoScheduleTxtSync = useCallback(
    (weekKey?: string) => {
      if (scheduleTxtSyncTimerRef.current) {
        window.clearTimeout(scheduleTxtSyncTimerRef.current);
      }
      scheduleTxtSyncTimerRef.current = window.setTimeout(() => {
        scheduleTxtSyncTimerRef.current = null;
        void saveScheduleWeekToTxtFolder(weekKey, { silent: true });
      }, 750);
    },
    [saveScheduleWeekToTxtFolder],
  );

  const loadSavedScheduleWeek = useCallback(
    (weekKey: string): boolean => {
      window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
      const cleanKey = weekKey.trim().toUpperCase();
      const target = dbRef.current.weeklySchedules?.[cleanKey];
      if (!target) {
        toast('Semana não encontrada na pasta de cronogramas.', true);
        return false;
      }
      lastUrgentSaveMsRef.current = Date.now();
      setDb((prev) => {
        // Save current active week first before switching
        const curWeekKey = resolveActiveScheduleWeekKey(prev.scheduleDayDates, prev.schedule);
        const curMeta = buildScheduleWeekMetadata(curWeekKey, prev.scheduleDayDates);
        const updatedMap: Record<string, WeeklyScheduleFileRecord> = {
          ...(prev.weeklySchedules || {}),
          [curMeta.weekKey]: {
            weekKey: curMeta.weekKey,
            label: curMeta.label,
            fileName: curMeta.fileName,
            updatedAt: localDateTimeBrazilian(),
            blobKey: `schedule_week_${curMeta.weekKey}`,
            schedule: prev.schedule,
            scheduleDayDates: curMeta.dayDates,
          },
        };
        const chosen = updatedMap[cleanKey] || target;
        const next: StudyDatabase = {
          ...prev,
          schedule: chosen.schedule,
          scheduleDayDates: chosen.scheduleDayDates,
          weeklySchedules: updatedMap,
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      toast(`Cronograma carregado: ${target.label}.`);
      return true;
    },
    [toast],
  );

  const deleteSavedScheduleWeek = useCallback(
    (weekKey: string) => {
      const cleanKey = weekKey.trim().toUpperCase();
      const target = dbRef.current.weeklySchedules?.[cleanKey];
      if (scheduleTxtSyncTimerRef.current) {
        window.clearTimeout(scheduleTxtSyncTimerRef.current);
        scheduleTxtSyncTimerRef.current = null;
      }
      const fileName = target?.fileName || buildScheduleWeekMetadata(cleanKey).fileName;
      if (fileName) {
        deleteOrQueueDriveFiles({
          names: [fileName],
          subfolderHints: ['Cronogramas'],
        });
      }
      setDb((prev) => {
        const nextMap = { ...(prev.weeklySchedules || {}) };
        delete nextMap[cleanKey];
        const next: StudyDatabase = {
          ...prev,
          weeklySchedules: nextMap,
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      lastDeletionMsRef.current = Date.now();
      pendingCloudSyncRef.current = true;
      void deleteFileBlob(`schedule_week_${cleanKey}`);
      toast('Arquivo semanal removido da lista.');
    },
    [deleteOrQueueDriveFiles, toast],
  );

  const saveScheduleDay = useCallback(
    (day: WeekdayName, topics: ScheduleTopic[], silent?: boolean) => {
      if (!silent) {
        lastUrgentSaveMsRef.current = Date.now();
      }
      setDb((prev) => {
        const nextSchedule = { ...prev.schedule, [day]: topics };
        return buildUpdatedWeeklyScheduleState(prev, nextSchedule, prev.scheduleDayDates);
      });
      scheduleAutoScheduleTxtSync();
      if (!silent) {
        toast(`Cronograma de ${day} salvo na semana atual (.txt).`);
      }
    },
    [scheduleAutoScheduleTxtSync, toast],
  );

  const setScheduleDayDate = useCallback(
    (
      day: WeekdayName,
      dateBr: string,
      options?: { overwriteCustomized?: boolean; silent?: boolean },
    ) => {
      const cleanDate = dateBr.trim() || localDateBrazilian();
      if (!options?.silent) {
        lastUrgentSaveMsRef.current = Date.now();
      }
      setDb((prev) => {
        const nextDayDates = { ...(prev.scheduleDayDates || {}), [day]: cleanDate };
        const curTopics = prev.schedule[day] || [];
        const nextTopics = curTopics.map((topic) => {
          if (!options?.overwriteCustomized && topic.data_personalizada) {
            return topic;
          }
          return {
            ...topic,
            data: cleanDate,
            data_personalizada: false,
          };
        });
        const nextSchedule = { ...prev.schedule, [day]: nextTopics };
        return buildUpdatedWeeklyScheduleState(prev, nextSchedule, nextDayDates);
      });
      scheduleAutoScheduleTxtSync();
      if (!options?.silent) {
        toast(
          options?.overwriteCustomized
            ? `Data ${cleanDate} aplicada a todos os tópicos de ${day}.`
            : `Data geral de ${day} definida para ${cleanDate}.`,
        );
      }
    },
    [scheduleAutoScheduleTxtSync, toast],
  );

  const applyScheduleWeekDates = useCallback(
    (
      weekInput: string,
      options?: { overwriteCustomized?: boolean; silent?: boolean },
    ) => {
      window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
      const cleanWeekKey = weekInput.trim().toUpperCase();
      const weekDates = getWeekDatesForIsoWeek(cleanWeekKey);
      if (!weekDates) {
        if (!options?.silent) {
          toast('Selecione uma semana válida do ano.', true);
        }
        return;
      }
      lastUrgentSaveMsRef.current = Date.now();
      setDb((prev) => {
        // Save the previous week's snapshot into weeklySchedules before switching
        const prevWeekKey = resolveActiveScheduleWeekKey(prev.scheduleDayDates, prev.schedule);
        const prevMeta = buildScheduleWeekMetadata(prevWeekKey, prev.scheduleDayDates);
        const mapWithPrev: Record<string, WeeklyScheduleFileRecord> = {
          ...(prev.weeklySchedules || {}),
          [prevMeta.weekKey]: {
            weekKey: prevMeta.weekKey,
            label: prevMeta.label,
            fileName: prevMeta.fileName,
            updatedAt: localDateTimeBrazilian(),
            blobKey: `schedule_week_${prevMeta.weekKey}`,
            schedule: prev.schedule,
            scheduleDayDates: prevMeta.dayDates,
          },
        };

        // If switching to another week that already has a saved schedule WITH topics (and not forcing date overwrite), load it.
        // Never wipe a populated active schedule with an empty placeholder record!
        const existingTargetWeek =
          cleanWeekKey !== prevMeta.weekKey && !options?.overwriteCustomized
            ? mapWithPrev[cleanWeekKey]
            : undefined;
        const existingTargetTopics = existingTargetWeek
          ? WEEKDAYS.reduce((sum, d) => sum + (existingTargetWeek.schedule?.[d]?.length || 0), 0)
          : 0;
        const prevTopics = WEEKDAYS.reduce((sum, d) => sum + (prev.schedule?.[d]?.length || 0), 0);

        if (existingTargetWeek && (existingTargetTopics > 0 || prevTopics === 0)) {
          const next: StudyDatabase = {
            ...prev,
            schedule: existingTargetWeek.schedule,
            scheduleDayDates: existingTargetWeek.scheduleDayDates,
            weeklySchedules: mapWithPrev,
          };
          dbRef.current = next;
          pendingCloudSyncRef.current = true;
          return next;
        }

        const nextDayDates: Partial<Record<WeekdayName, string>> = {};
        const nextSchedule = { ...prev.schedule };
        WEEKDAYS.forEach((day) => {
          const dayDate = weekDates[day];
          nextDayDates[day] = dayDate;
          nextSchedule[day] = (prev.schedule[day] || []).map((topic) => {
            if (!options?.overwriteCustomized && topic.data_personalizada) {
              return topic;
            }
            return {
              ...topic,
              data: dayDate,
              data_personalizada: false,
            };
          });
        });

        const targetMeta = buildScheduleWeekMetadata(cleanWeekKey, nextDayDates);
        const next: StudyDatabase = {
          ...prev,
          schedule: nextSchedule,
          scheduleDayDates: targetMeta.dayDates,
          weeklySchedules: {
            ...mapWithPrev,
            [targetMeta.weekKey]: {
              weekKey: targetMeta.weekKey,
              label: targetMeta.label,
              fileName: targetMeta.fileName,
              updatedAt: localDateTimeBrazilian(),
              blobKey: `schedule_week_${targetMeta.weekKey}`,
              schedule: nextSchedule,
              scheduleDayDates: targetMeta.dayDates,
            },
          },
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      scheduleAutoScheduleTxtSync(cleanWeekKey);
      if (!options?.silent) {
        const weekMatch = cleanWeekKey.match(/^(\d{4})-W(\d{2})$/);
        const weekLabel = weekMatch
          ? `Semana ${weekMatch[2]}/${weekMatch[1]} (${weekDates['Segunda-feira']} a ${weekDates['Domingo']})`
          : `${weekDates['Segunda-feira']} a ${weekDates['Domingo']}`;
        toast(`Semana ${weekLabel} aplicada e salva na pasta Cronogramas (.txt).`);
      }
    },
    [scheduleAutoScheduleTxtSync, toast],
  );

  const addTopicToDay = useCallback(
    (
      day: WeekdayName,
      preset?: {
        disciplina_fixa?: string;
        concurso_alvo?: string;
        materia?: string;
        tempo?: string;
        observacoes?: string;
      },
    ) => {
      setDb((prev) => {
        const dayDate =
          prev.scheduleDayDates?.[day] || getCurrentWeekDates()[day] || localDateBrazilian();
        const existingTopics = prev.schedule[day] || [];
        const lastTopic = existingTopics[existingTopics.length - 1];
        const defaultContest =
          preset?.concurso_alvo !== undefined
            ? preset.concurso_alvo
            : lastTopic?.concurso_alvo || prev.contests?.[0]?.concurso || '';
        const defaultFixedSubject =
          preset?.disciplina_fixa !== undefined
            ? preset.disciplina_fixa
            : lastTopic?.disciplina_fixa || '';

        const nextSchedule: ScheduleMap = {
          ...prev.schedule,
          [day]: [
            ...existingTopics,
            {
              id: uid(8),
              data: dayDate,
              data_personalizada: false,
              ...(defaultFixedSubject ? { disciplina_fixa: defaultFixedSubject } : {}),
              ...(defaultContest ? { concurso_alvo: defaultContest } : {}),
              materia: preset?.materia || '',
              tempo: preset?.tempo || '1h',
              observacoes: preset?.observacoes || '',
            },
          ],
        };
        return buildUpdatedWeeklyScheduleState(prev, nextSchedule, prev.scheduleDayDates);
      });
      scheduleAutoScheduleTxtSync();
    },
    [scheduleAutoScheduleTxtSync],
  );

  const deleteScheduleTopic = useCallback(
    (day: WeekdayName, index: number) => {
      setDb((prev) => {
        const nextDay = [...(prev.schedule[day] || [])];
        nextDay.splice(index, 1);
        const nextSchedule = { ...prev.schedule, [day]: nextDay };
        return buildUpdatedWeeklyScheduleState(prev, nextSchedule, prev.scheduleDayDates);
      });
      lastDeletionMsRef.current = Date.now();
      scheduleAutoScheduleTxtSync();
    },
    [scheduleAutoScheduleTxtSync],
  );

  const completeScheduleTopic = useCallback(
    (day: WeekdayName, index: number, currentDayTopics?: ScheduleTopic[]) => {
      lastUrgentSaveMsRef.current = Date.now();
      setDb((prev) => {
        const list = [...(currentDayTopics || prev.schedule[day] || [])];
        const [removed] = list.splice(index, 1);
        if (!removed) return prev;
        const nextSchedule = { ...prev.schedule, [day]: list };
        const withCompleted: StudyDatabase = {
          ...prev,
          completedGoals: [
            {
              id: uid(10),
              data:
                removed.data ||
                prev.scheduleDayDates?.[day] ||
                getCurrentWeekDates()[day] ||
                localDateBrazilian(),
              dia_semana: day,
              materia: removed.materia || 'Tópico concluído',
              tempo: removed.tempo || '0min',
              observacoes: removed.observacoes || '',
            },
            ...prev.completedGoals,
          ],
        };
        return buildUpdatedWeeklyScheduleState(withCompleted, nextSchedule, prev.scheduleDayDates);
      });
      scheduleAutoScheduleTxtSync();
      toast('Meta concluída e arquivada.');
    },
    [scheduleAutoScheduleTxtSync, toast],
  );

  const archiveTopicAsIncomplete = useCallback(
    (day: WeekdayName, index: number, currentSchedule: ScheduleMap) => {
      const dayList = [...(currentSchedule[day] || [])];
      const [topic] = dayList.splice(index, 1);
      if (!topic) return;
      if (!topic.materia.trim() && !topic.observacoes.trim()) {
        toast('Preencha a matéria ou as observações antes de arquivar.', true);
        return;
      }
      const archivedAt = localDateTimeBrazilian();
      setDb((prev) => {
        const nextSchedule = { ...currentSchedule, [day]: dayList };
        const withIncomplete: StudyDatabase = {
          ...prev,
          incompleteGoals: [
            {
              id: uid(10),
              data:
                topic.data ||
                prev.scheduleDayDates?.[day] ||
                getCurrentWeekDates()[day] ||
                localDateBrazilian(),
              dia_semana: day,
              materia: topic.materia,
              tempo: topic.tempo,
              observacoes: topic.observacoes,
              arquivado_em: archivedAt,
            },
            ...prev.incompleteGoals,
          ],
        };
        return buildUpdatedWeeklyScheduleState(withIncomplete, nextSchedule, prev.scheduleDayDates);
      });
      scheduleAutoScheduleTxtSync();
      toast(`"${visibleName(topic.materia || 'Tópico')}" salvo em Metas Não Concluídas.`);
    },
    [scheduleAutoScheduleTxtSync, toast],
  );

  const archiveFullWeek = useCallback(
    (currentSchedule: ScheduleMap): number => {
      const archivedAt = localDateTimeBrazilian();
      const pending: Array<{ day: WeekdayName; topic: ScheduleTopic }> = [];
      WEEKDAYS.forEach((day) => {
        (currentSchedule[day] || []).forEach((t) => {
          if (t.materia.trim() || t.observacoes.trim()) {
            pending.push({ day, topic: t });
          }
        });
      });
      if (!pending.length) return 0;

      const emptySchedule = WEEKDAYS.reduce<ScheduleMap>(
        (acc, d) => ({ ...acc, [d]: [] }),
        {} as ScheduleMap,
      );
      setDb((prev) => {
        const withIncomplete: StudyDatabase = {
          ...prev,
          incompleteGoals: [
            ...pending.map(({ day, topic }) => ({
              id: uid(10),
              data:
                topic.data ||
                prev.scheduleDayDates?.[day] ||
                getCurrentWeekDates()[day] ||
                localDateBrazilian(),
              dia_semana: day,
              materia: topic.materia,
              tempo: topic.tempo,
              observacoes: topic.observacoes,
              arquivado_em: archivedAt,
            })),
            ...prev.incompleteGoals,
          ],
        };
        return buildUpdatedWeeklyScheduleState(withIncomplete, emptySchedule, prev.scheduleDayDates);
      });
      scheduleAutoScheduleTxtSync();
      return pending.length;
    },
    [scheduleAutoScheduleTxtSync],
  );

  const importScheduleTxt = useCallback(
    async (file: File): Promise<number> => {
      if (!file.name.toLowerCase().endsWith('.txt')) {
        throw new Error('Selecione um arquivo .txt.');
      }
      if (file.size > 1024 * 1024) {
        throw new Error('O arquivo de cronograma excede 1 MB.');
      }
      const text = await readStudyTextFile(file);
      const parsedWeek = parseScheduleWeekText(text, file.name);
      const imported = parseScheduleText(text);
      const importedMeta = buildScheduleWeekMetadata(parsedWeek.weekKey, parsedWeek.scheduleDayDates);
      removePendingDriveDeletesForTarget(activeScopeRef.current, { names: [importedMeta.fileName] });
      lastUrgentSaveMsRef.current = Date.now();
      setDb((prev) => {
        const curWeekKey = resolveActiveScheduleWeekKey(prev.scheduleDayDates, prev.schedule);
        const curMeta = buildScheduleWeekMetadata(curWeekKey, prev.scheduleDayDates);
        const isSwitchingWeek = parsedWeek.weekKey !== curMeta.weekKey;
        const baseWeeklyMap: Record<string, WeeklyScheduleFileRecord> = isSwitchingWeek
          ? {
              ...(prev.weeklySchedules || {}),
              [curMeta.weekKey]: {
                weekKey: curMeta.weekKey,
                label: curMeta.label,
                fileName: curMeta.fileName,
                updatedAt: localDateTimeBrazilian(),
                blobKey: `schedule_week_${curMeta.weekKey}`,
                schedule: prev.schedule,
                scheduleDayDates: curMeta.dayDates,
              },
            }
          : { ...(prev.weeklySchedules || {}) };

        const emptyWeekSchedule = Object.fromEntries(WEEKDAYS.map((d) => [d, [] as ScheduleTopic[]])) as ScheduleMap;
        const targetExistingSchedule = isSwitchingWeek
          ? baseWeeklyMap[parsedWeek.weekKey]?.schedule || emptyWeekSchedule
          : prev.schedule;
        const nextSchedule: ScheduleMap = { ...targetExistingSchedule };

        const touchedDays = new Set(imported.map((item) => item.day));
        touchedDays.forEach((day) => {
          // Remove default untouched seed items (sch-1..sch-8) on days being imported
          nextSchedule[day] = (nextSchedule[day] || []).filter(
            (t) => !/^sch-[1-8]$/.test(t.id || ''),
          );
        });
        imported.forEach(({ day, topic }) => {
          const existingDay = nextSchedule[day] || [];
          const dupKey = `${normalizeSearch(topic.data || '')}::${normalizeSearch(topic.materia || '')}::${normalizeSearch(topic.tempo || '')}::${normalizeSearch(topic.observacoes || '')}`;
          const alreadyExists = existingDay.some(
            (e) =>
              `${normalizeSearch(e.data || '')}::${normalizeSearch(e.materia || '')}::${normalizeSearch(e.tempo || '')}::${normalizeSearch(e.observacoes || '')}` ===
              dupKey,
          );
          if (!alreadyExists) {
            nextSchedule[day] = [...existingDay, topic];
          }
        });
        const nextDayDates = isSwitchingWeek
          ? {
              ...(baseWeeklyMap[parsedWeek.weekKey]?.scheduleDayDates || {}),
              ...(parsedWeek.scheduleDayDates || {}),
            }
          : {
              ...(prev.scheduleDayDates || {}),
              ...(parsedWeek.scheduleDayDates || {}),
            };
        return buildUpdatedWeeklyScheduleState(
          { ...prev, weeklySchedules: baseWeeklyMap },
          nextSchedule,
          nextDayDates,
          parsedWeek.weekKey,
        );
      });
      await saveScheduleWeekToTxtFolder(parsedWeek.weekKey, { silent: true });
      return imported.length;
    },
    [saveScheduleWeekToTxtFolder],
  );

  const deleteCompletedGoal = useCallback(
    (id: string) => {
      setDb((prev) => ({
        ...prev,
        completedGoals: prev.completedGoals.filter((g) => g.id !== id),
      }));
      toast('Meta excluída.');
    },
    [toast],
  );

  const updateCompletedGoal = useCallback(
    (
      id: string,
      patch: {
        data?: string;
        dia_semana?: string;
        materia?: string;
        tempo?: string;
        observacoes?: string;
      },
    ) => {
      setDb((prev) => ({
        ...prev,
        completedGoals: prev.completedGoals.map((g) => {
          if (g.id !== id) return g;
          const nextMateria =
            patch.materia !== undefined ? patch.materia.trim() || g.materia : g.materia;
          return {
            ...g,
            data: patch.data !== undefined ? patch.data.trim() || g.data : g.data,
            dia_semana:
              patch.dia_semana !== undefined ? patch.dia_semana.trim() : g.dia_semana,
            materia: nextMateria,
            tempo: patch.tempo !== undefined ? patch.tempo.trim() : g.tempo,
            observacoes:
              patch.observacoes !== undefined ? patch.observacoes.trim() : g.observacoes,
          };
        }),
      }));
      toast('Meta concluída atualizada.');
    },
    [toast],
  );

  const reopenCompletedGoal = useCallback(
    (id: string) => {
      const target = db.completedGoals.find((g) => g.id === id);
      if (!target) return;
      const reopenedAt = localDateTimeBrazilian();
      setDb((prev) => ({
        ...prev,
        completedGoals: prev.completedGoals.filter((g) => g.id !== id),
        incompleteGoals: [
          {
            id: uid(10),
            data: target.data,
            dia_semana: target.dia_semana,
            materia: target.materia,
            tempo: target.tempo,
            observacoes: target.observacoes,
            arquivado_em: reopenedAt,
          },
          ...prev.incompleteGoals,
        ],
      }));
      toast('Meta movida para Metas Não Concluídas.');
    },
    [db.completedGoals, toast],
  );

  const saveWeeklyGoalNote = useCallback(
    (weekMondayIso: string, notes: string, silent = false) => {
      setDb((prev) => {
        const next = { ...prev.weeklyGoalNotes };
        const trimmed = notes.trim();
        if ((next[weekMondayIso] || '') === trimmed) return prev;
        if (trimmed) next[weekMondayIso] = trimmed;
        else delete next[weekMondayIso];
        return { ...prev, weeklyGoalNotes: next };
      });
      if (!silent) toast('Observações semanais salvas.');
    },
    [toast],
  );

  const completeIncompleteGoal = useCallback(
    (id: string) => {
      const target = db.incompleteGoals.find((g) => g.id === id);
      if (!target) return;
      setDb((prev) => ({
        ...prev,
        incompleteGoals: prev.incompleteGoals.filter((g) => g.id !== id),
        completedGoals: [
          {
            id: uid(10),
            data: target.data || localDateBrazilian(),
            dia_semana: target.dia_semana,
            materia: target.materia,
            tempo: target.tempo,
            observacoes: target.observacoes,
          },
          ...prev.completedGoals,
        ],
      }));
      toast('Meta movida para Metas Concluídas.');
    },
    [db.incompleteGoals, toast],
  );

  const deleteIncompleteGoal = useCallback(
    (id: string) => {
      setDb((prev) => ({
        ...prev,
        incompleteGoals: prev.incompleteGoals.filter((g) => g.id !== id),
      }));
      toast('Meta pendente excluída.');
    },
    [toast],
  );

  // Laws & Incidence Matrix
  const createLawFolder = useCallback(
    (rawName: string, options?: { silent?: boolean }): string => {
      const name = cleanSafeName(rawName, 'Legislacao').replace(/\s+/g, '_');
      removePendingDriveDeletesForTarget(activeScopeRef.current, {
        folderNames: [name, visibleName(name)],
      });
      lastUrgentSaveMsRef.current = Date.now();
      setDb((prev) => {
        if (prev.laws[name]) return prev;
        return {
          ...prev,
          laws: { ...prev.laws, [name]: { name, items: [], pdfs: [] } },
        };
      });
      if (!options?.silent) {
        toast('Pasta de legislação criada.');
      }
      return name;
    },
    [toast],
  );

  const uploadLawFile = useCallback(
    async (rawFolder: string, file: File, options?: { silent?: boolean }): Promise<number> => {
      const lower = file.name.toLowerCase();
      if (!/\.(txt|md|pdf)$/i.test(lower)) {
        throw new Error('Selecione um arquivo .txt, .md ou .pdf.');
      }
      const extractedText = await readStudyTextFile(file);
      if (
        isScheduleTxtDescriptor(file.name, undefined, extractedText) ||
        isContestOrEditalTxtDescriptor(file.name, undefined, extractedText)
      ) {
        throw new Error(
          `O arquivo "${file.name}" pertence a Cronograma, Datas e Locais ou Edital e deve ser importado no módulo correspondente, não em Lei Seca.`,
        );
      }
      const parsedItems = parseLawTextToItems(file.name, extractedText);
      if (parsedItems.length === 0) {
        throw new Error(`Não foi possível extrair artigos ou texto legível de "${file.name}".`);
      }

      const scope = activeScopeRef.current;
      const folder = dbRef.current.laws[rawFolder]
        ? rawFolder
        : resolveLawFolderKey(dbRef.current.laws, rawFolder);

      removePendingDriveDeletesForTarget(scope, {
        names: [file.name, `LEI - ${file.name}`],
        folderNames: [folder, visibleName(folder)],
      });

      const blobKey = lower.endsWith('.pdf') ? `lawpdf-${uid(16)}` : `lawfile-${uid(16)}`;
      await saveFileBlob(blobKey, file, scope);

      const nowIso = new Date().toISOString();
      const fileEntry = {
        id: uid(12),
        name: file.name,
        size: file.size,
        blobKey,
        createdAt: localDateIso(),
        updatedAt: nowIso,
      };

      lastUrgentSaveMsRef.current = Date.now();
      pendingCloudSyncRef.current = true;
      setDb((prev) => {
        const resolvedKey = prev.laws[folder] ? folder : resolveLawFolderKey(prev.laws, folder);
        const existing = prev.laws[resolvedKey] || { name: resolvedKey, items: [], pdfs: [] };
        const next: StudyDatabase = {
          ...prev,
          laws: {
            ...prev.laws,
            [resolvedKey]: {
              name: resolvedKey,
              items: sortLawItemsInOrder([...existing.items, ...parsedItems]),
              pdfs: [...existing.pdfs, fileEntry],
            },
          },
        };
        dbRef.current = next;
        return next;
      });

      const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
      const driveSubfolders = folderLabel ? ['Lei Seca', folderLabel] : 'Lei Seca';
      void autoSyncFileToDrive(file, file.name, driveSubfolders, blobKey);

      if (!options?.silent) {
        toast(`Arquivo de legislação enviado (${parsedItems.length} dispositivo(s) extraído(s)).`);
      }
      return parsedItems.length;
    },
    [autoSyncFileToDrive, toast],
  );

  const reprocessLawFolder = useCallback(
    async (folder: string): Promise<number> => {
      const folderData = dbRef.current.laws[folder];
      if (!folderData?.pdfs?.length) {
        throw new Error('Esta pasta não possui arquivo original anexado para reprocessar.');
      }
      const recoveredItems: LawItem[] = [];
      for (const pdf of folderData.pdfs) {
        let blob = pdf.blobKey ? await getFileBlob(pdf.blobKey) : null;
        if (!blob && pdf.blobKey && driveConnectedRef.current) {
          try {
            const recovered = await recoverFileFromDrive(pdf.blobKey, pdf.name);
            if (recovered) {
              blob = recovered;
            }
          } catch {
            // fallback to non-recovered error below
          }
        }
        if (!blob) continue;
        const text = await readStudyBlobText(blob, pdf.name);
        const items = parseLawTextToItems(pdf.name, text);
        if (items.length > 0) {
          recoveredItems.push(...items);
        }
      }

      if (recoveredItems.length === 0) {
        throw new Error(
          'Não foi possível extrair dispositivos legíveis do arquivo anexado (verifique se o arquivo possui texto selecionável).',
        );
      }

      setDb((prev) => {
        const cur = prev.laws[folder];
        if (!cur) return prev;
        const oldReadSet = new Set(prev.readLawItems?.[folder] || []);
        const nextReadSet = new Set<string>(oldReadSet);

        // Index existing items by (artigo_base + dispositivo) so user annotations, tips, and read status are preserved
        const prevByDeviceKey = new Map<string, LawItem[]>();
        for (const oldIt of cur.items || []) {
          const dk = `${normalizeSearch(oldIt.artigo_base || '')}::${normalizeSearch(oldIt.dispositivo || '')}`;
          const list = prevByDeviceKey.get(dk) || [];
          list.push(oldIt);
          prevByDeviceKey.set(dk, list);
        }

        const usedOldIds = new Set<string>();
        const mergedRecovered = recoveredItems.map((newIt) => {
          const dk = `${normalizeSearch(newIt.artigo_base || '')}::${normalizeSearch(newIt.dispositivo || '')}`;
          const candidates = (prevByDeviceKey.get(dk) || []).filter((c) => !usedOldIds.has(c.id));
          const matchedOld =
            candidates.find(
              (c) =>
                normalizeSearch(c.texto).slice(0, 32) ===
                normalizeSearch(newIt.texto).slice(0, 32),
            ) || candidates[0];

          if (!matchedOld) return newIt;
          usedOldIds.add(matchedOld.id);
          if (oldReadSet.has(matchedOld.id)) {
            nextReadSet.add(matchedOld.id);
          }
          return {
            ...newIt,
            id: matchedOld.id,
            grau:
              newIt.grau !== 'Não Classificado'
                ? newIt.grau
                : matchedOld.grau || newIt.grau,
            dica: newIt.dica || matchedOld.dica || '',
            observacao: matchedOld.observacao || newIt.observacao || '',
            ...(matchedOld.leituras?.length ? { leituras: matchedOld.leituras } : {}),
          };
        });

        return {
          ...prev,
          readLawItems: {
            ...(prev.readLawItems || {}),
            [folder]: Array.from(nextReadSet),
          },
          laws: {
            ...prev.laws,
            [folder]: {
              ...cur,
              items: sortLawItemsInOrder(mergedRecovered),
            },
          },
        };
      });
      toast(
        `Legislação "${visibleName(folder)}" reprocessada com ${recoveredItems.length} dispositivo(s)!`,
      );
      return recoveredItems.length;
    },
    [recoverFileFromDrive, toast],
  );

  // Silent auto-heal for any local law folders currently stuck at (0) that already have valid local blobs
  const attemptedLocalLawHealRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isRestoringRef.current) return;
    const scope = activeScopeRef.current;
    const zeroFolders = Object.entries(db.laws || {}).filter(
      ([folderKey, folderData]) =>
        (folderData.items?.length || 0) === 0 &&
        (folderData.pdfs?.length || 0) > 0 &&
        !attemptedLocalLawHealRef.current.has(
          `${scope}::${folderKey}::${folderData.pdfs.map((p) => p.blobKey).join(',')}`,
        ),
    );
    if (!zeroFolders.length) return;

    let cancelled = false;
    void (async () => {
      for (const [folderKey, folderData] of zeroFolders) {
        if (cancelled) return;
        const sig = `${scope}::${folderKey}::${folderData.pdfs.map((p) => p.blobKey).join(',')}`;
        attemptedLocalLawHealRef.current.add(sig);

        const recoveredItems: LawItem[] = [];
        for (const pdf of folderData.pdfs) {
          if (!pdf.blobKey) continue;
          try {
            const blob = await getFileBlob(pdf.blobKey, scope);
            if (!blob) continue;
            const text = await readStudyBlobText(blob, pdf.name);
            const items = parseLawTextToItems(pdf.name, text);
            if (items.length > 0) {
              recoveredItems.push(...items);
            }
          } catch {
            // ignore unparseable blobs
          }
        }
        if (cancelled || recoveredItems.length === 0) continue;

        setDb((prev) => {
          const cur = prev.laws[folderKey];
          if (!cur || (cur.items?.length || 0) > 0) return prev;
          return {
            ...prev,
            laws: {
              ...prev.laws,
              [folderKey]: {
                ...cur,
                items: sortLawItemsInOrder(recoveredItems),
              },
            },
          };
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db.laws]);

  const deleteLawFolder = useCallback(
    async (folder: string): Promise<number> => {
      const target = dbRef.current.laws[folder];
      if (!target) return 0;

      if (target.pdfs && target.pdfs.length) {
        for (const p of target.pdfs) {
          if (p.blobKey) await deleteFileBlob(p.blobKey);
        }
      }

      deleteOrQueueDriveFiles({
        fileIds: (target.pdfs || [])
          .map((p) => p.blobKey)
          .filter((k) => Boolean(k && k.startsWith('drive_'))),
        names: (target.pdfs || []).flatMap((p) => [`LEI - ${p.name}`, p.name]).filter(Boolean),
        subfolderHints: ['Lei Seca', visibleName(folder)].filter(Boolean),
        folderNames: [folder, visibleName(folder)],
      });

      const itemCount = (target.items || []).length;

      setDb((prev) => {
        const nextLaws = { ...prev.laws };
        delete nextLaws[folder];

        const nextHighlights = { ...prev.lawHighlights };
        delete nextHighlights[folder];

        const nextReadDates = { ...(prev.lawReadDates || {}) };
        delete nextReadDates[folder];

        const nextReadLawItems = { ...(prev.readLawItems || {}) };
        delete nextReadLawItems[folder];

        const nextLastReadPos = { ...(prev.lawLastReadPosition || {}) };
        delete nextLastReadPos[folder];

        const nextLawNotes = { ...(prev.lawNotes || {}) };
        delete nextLawNotes[folder];

        return {
          ...prev,
          laws: nextLaws,
          lawHighlights: nextHighlights,
          lawReadDates: nextReadDates,
          readLawItems: nextReadLawItems,
          lawLastReadPosition: nextLastReadPos,
          lawNotes: nextLawNotes,
        };
      });

      toast(`Pasta de legislação "${visibleName(folder)}" removida.`);
      return itemCount;
    },
    [deleteOrQueueDriveFiles, toast],
  );

  const deleteLawPdf = useCallback(
    async (folder: string, pdfId: string) => {
      const folderData = dbRef.current.laws[folder];
      const target = folderData?.pdfs?.find((p) => p.id === pdfId);
      if (!target) return;

      if (target.blobKey) {
        await deleteFileBlob(target.blobKey);
      }

      deleteOrQueueDriveFiles({
        fileIds: target.blobKey?.startsWith('drive_') ? [target.blobKey] : undefined,
        names: [`LEI - ${target.name}`, target.name],
        subfolderHints: ['Lei Seca', visibleName(folder)].filter(Boolean),
      });

      setDb((prev) => {
        const cur = prev.laws[folder];
        if (!cur) return prev;
        return {
          ...prev,
          laws: {
            ...prev.laws,
            [folder]: {
              ...cur,
              pdfs: (cur.pdfs || []).filter((p) => p.id !== pdfId),
            },
          },
        };
      });
      toast(`Arquivo "${visibleName(target.name)}" excluído da legislação.`);
    },
    [deleteOrQueueDriveFiles, toast],
  );

  const addManualLawItem = useCallback(
    (folder: string, dispositivo: string, texto: string, dica: string, grau: IncidenceGrade) => {
      if (!dispositivo.trim() || !texto.trim()) {
        toast('Informe o dispositivo e o texto.', true);
        return;
      }
      const artMatch = dispositivo.trim().match(/^(Art(?:igo)?\.?\s*\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/i);
      const newItem: LawItem = {
        id: `artigos_adicionados.txt::${uid(8)}`,
        arquivo: 'artigos_adicionados.txt',
        dispositivo: dispositivo.trim(),
        grau,
        texto: texto.replace(/\s+/g, ' ').trim(),
        dica: dica.replace(/\s+/g, ' ').trim(),
        observacao: '',
        artigo_base: artMatch ? artMatch[1] : '',
        tipo_dispositivo: 'Dispositivo',
      };
      lastUrgentSaveMsRef.current = Date.now();
      setDb((prev) => {
        const existing = prev.laws[folder] || { name: folder, items: [], pdfs: [] };
        return {
          ...prev,
          laws: {
            ...prev.laws,
            [folder]: { ...existing, items: sortLawItemsInOrder([...existing.items, newItem]) },
          },
        };
      });
      toast('Dispositivo adicionado.');
    },
    [toast],
  );

  const updateLawItem = useCallback(
    (
      folder: string,
      itemId: string,
      grau: IncidenceGrade,
      observacao: string,
      dispositivo?: string,
      texto?: string,
      dica?: string,
      silent = false,
    ) => {
      setDb((prev) => {
        const current = prev.laws[folder];
        if (!current) return prev;
        let changed = false;
        const nextItems = current.items.map((item) => {
          if (item.id !== itemId) return item;
          const nextObs = observacao.trim();
          const nextDisp = dispositivo !== undefined ? dispositivo.trim() : item.dispositivo;
          const nextTexto = texto !== undefined ? texto.trim() : item.texto;
          const nextDica = dica !== undefined ? dica.trim() : item.dica;
          if (
            item.grau === grau &&
            (item.observacao || '') === nextObs &&
            item.dispositivo === nextDisp &&
            item.texto === nextTexto &&
            (item.dica || '') === (nextDica || '')
          ) {
            return item;
          }
          changed = true;
          const artMatch = nextDisp.match(
            /^(Art(?:igo)?\.?\s*\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/i,
          );
          return {
            ...item,
            grau,
            observacao: nextObs,
            dispositivo: nextDisp,
            texto: nextTexto,
            dica: nextDica,
            artigo_base: artMatch ? artMatch[1] : item.artigo_base,
          };
        });
        if (!changed) return prev;
        return {
          ...prev,
          laws: {
            ...prev.laws,
            [folder]: {
              ...current,
              items: sortLawItemsInOrder(nextItems),
            },
          },
        };
      });
      if (!silent) {
        lastUrgentSaveMsRef.current = Date.now();
        toast('Dispositivo atualizado.');
      }
    },
    [toast],
  );

  const deleteLawItem = useCallback(
    (folder: string, itemId: string) => {
      setDb((prev) => {
        const current = prev.laws[folder];
        if (!current) return prev;
        return {
          ...prev,
          laws: {
            ...prev.laws,
            [folder]: {
              ...current,
              items: current.items.filter((item) => item.id !== itemId),
            },
          },
        };
      });
      toast('Dispositivo excluído.');
    },
    [toast],
  );

  const toggleLawItemRead = useCallback((folder: string, itemId: string) => {
    const todayIso = localDateIso();
    setDb((prev) => {
      const map = prev.readLawItems || {};
      const current = map[folder] || [];
      const exists = current.includes(itemId);
      const nextReadIds = exists ? current.filter((id) => id !== itemId) : [...current, itemId];
      const folderData = prev.laws[folder];
      let lastPosKey = prev.lawLastReadPosition?.[folder] || '';

      const nextFolderData = folderData
        ? {
            ...folderData,
            items: folderData.items.map((item) => {
              if (item.id !== itemId) return item;
              if (!exists) {
                lastPosKey = (item.artigo_base || item.dispositivo || item.id).trim();
                const existing = item.leituras || [];
                if (existing.some((e) => e.data === todayIso)) return item;
                return {
                  ...item,
                  leituras: [{ id: uid(8), data: todayIso }, ...existing].sort((a, b) =>
                    b.data.localeCompare(a.data),
                  ),
                };
              }
              return item;
            }),
          }
        : undefined;

      const next: StudyDatabase = {
        ...prev,
        ...(nextFolderData
          ? {
              laws: {
                ...prev.laws,
                [folder]: nextFolderData,
              },
            }
          : {}),
        readLawItems: {
          ...map,
          [folder]: nextReadIds,
        },
        lawLastReadPosition: lastPosKey
          ? {
              ...(prev.lawLastReadPosition || {}),
              [folder]: lastPosKey,
            }
          : prev.lawLastReadPosition,
      };
      dbRef.current = next;
      pendingCloudSyncRef.current = true;
      return next;
    });
  }, []);

  const markLawItemsRead = useCallback((folder: string, itemIds: string[], markAsRead: boolean) => {
    const idSet = new Set(itemIds.filter(Boolean));
    if (!idSet.size) return;
    const todayIso = localDateIso();

    setDb((prev) => {
      const map = prev.readLawItems || {};
      const currentSet = new Set(map[folder] || []);
      idSet.forEach((id) => {
        if (markAsRead) currentSet.add(id);
        else currentSet.delete(id);
      });

      const folderData = prev.laws[folder];
      let lastPosKey = prev.lawLastReadPosition?.[folder] || '';
      const nextFolderData =
        folderData && markAsRead
          ? {
              ...folderData,
              items: folderData.items.map((item) => {
                if (!idSet.has(item.id)) return item;
                lastPosKey = (item.artigo_base || item.dispositivo || item.id).trim();
                const existing = item.leituras || [];
                if (existing.some((e) => e.data === todayIso)) return item;
                return {
                  ...item,
                  leituras: [{ id: uid(8), data: todayIso }, ...existing].sort((a, b) =>
                    b.data.localeCompare(a.data),
                  ),
                };
              }),
            }
          : folderData;

      const next: StudyDatabase = {
        ...prev,
        ...(nextFolderData
          ? {
              laws: {
                ...prev.laws,
                [folder]: nextFolderData,
              },
            }
          : {}),
        readLawItems: {
          ...map,
          [folder]: [...currentSet],
        },
        lawLastReadPosition: lastPosKey
          ? {
              ...(prev.lawLastReadPosition || {}),
              [folder]: lastPosKey,
            }
          : prev.lawLastReadPosition,
      };
      dbRef.current = next;
      pendingCloudSyncRef.current = true;
      return next;
    });
  }, []);

  const addLawReadDate = useCallback(
    (folder: string, dateIso: string, observacao?: string) => {
      const cleanDate = String(dateIso || '').trim() || localDateIso();
      const cleanNote = observacao?.trim() || undefined;
      const existingList = dbRef.current.lawReadDates?.[folder] || [];
      if (!cleanNote && existingList.some((e) => e.data === cleanDate && !e.observacao)) {
        toast(`Leitura em ${formatIsoDateBr(cleanDate)} já está registrada para esta lei.`);
        return;
      }

      setDb((prev) => {
        const map = prev.lawReadDates || {};
        const current = map[folder] || [];
        const nextList: LawReadingEntry[] = [
          {
            id: uid(8),
            data: cleanDate,
            observacao: cleanNote,
          },
          ...current,
        ].sort((a, b) => b.data.localeCompare(a.data));

        const next: StudyDatabase = {
          ...prev,
          lawReadDates: {
            ...map,
            [folder]: nextList,
          },
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });

      toast(`Leitura registrada em ${formatIsoDateBr(cleanDate)}.`);
    },
    [toast],
  );

  const removeLawReadDate = useCallback(
    (folder: string, entryId: string) => {
      setDb((prev) => {
        const map = prev.lawReadDates || {};
        const nextList = (map[folder] || []).filter((e) => e.id !== entryId);
        const next: StudyDatabase = {
          ...prev,
          lawReadDates: {
            ...map,
            [folder]: nextList,
          },
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      toast('Data de leitura removida.');
    },
    [toast],
  );

  const addLawItemReadDate = useCallback(
    (
      folder: string,
      itemIds: string | string[],
      dateIso: string,
      observacao?: string,
    ) => {
      const targetIds = Array.isArray(itemIds) ? itemIds : [itemIds];
      const idSet = new Set(targetIds.filter(Boolean));
      if (!idSet.size) return;

      const cleanDate = String(dateIso || '').trim() || localDateIso();
      const cleanNote = observacao?.trim() || undefined;
      let addedCount = 0;

      setDb((prev) => {
        const folderData = prev.laws[folder];
        if (!folderData) return prev;

        let lastPosKey = prev.lawLastReadPosition?.[folder] || '';
        const nextItems = folderData.items.map((item) => {
          if (!idSet.has(item.id)) return item;
          lastPosKey = (item.artigo_base || item.dispositivo || item.id).trim();
          const existing = item.leituras || [];
          if (!cleanNote && existing.some((e) => e.data === cleanDate && !e.observacao)) {
            return item;
          }
          addedCount += 1;
          const nextLeituras: LawReadingEntry[] = [
            {
              id: uid(8),
              data: cleanDate,
              observacao: cleanNote,
            },
            ...existing,
          ].sort((a, b) => b.data.localeCompare(a.data));
          return {
            ...item,
            leituras: nextLeituras,
          };
        });

        const readMap = prev.readLawItems || {};
        const readSet = new Set(readMap[folder] || []);
        idSet.forEach((id) => readSet.add(id));

        const next: StudyDatabase = {
          ...prev,
          laws: {
            ...prev.laws,
            [folder]: {
              ...folderData,
              items: nextItems,
            },
          },
          readLawItems: {
            ...readMap,
            [folder]: [...readSet],
          },
          lawLastReadPosition: lastPosKey
            ? {
                ...(prev.lawLastReadPosition || {}),
                [folder]: lastPosKey,
              }
            : prev.lawLastReadPosition,
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });

      if (addedCount > 0) {
        toast(
          targetIds.length > 1
            ? `Leitura de ${addedCount} dispositivo(s) registrada em ${formatIsoDateBr(cleanDate)}.`
            : `Leitura do artigo registrada em ${formatIsoDateBr(cleanDate)}.`,
        );
      } else {
        toast(`Leitura em ${formatIsoDateBr(cleanDate)} já está registrada.`);
      }
    },
    [toast],
  );

  const removeLawItemReadDate = useCallback(
    (folder: string, itemId: string, entryId: string) => {
      setDb((prev) => {
        const folderData = prev.laws[folder];
        if (!folderData) return prev;
        let hasRemainingDates = true;
        const nextItems = folderData.items.map((item) => {
          if (item.id !== itemId) return item;
          const remaining = (item.leituras || []).filter((e) => e.id !== entryId);
          hasRemainingDates = remaining.length > 0;
          return {
            ...item,
            leituras: remaining,
          };
        });
        const readMap = prev.readLawItems || {};
        const currentRead = readMap[folder] || [];
        const nextRead = hasRemainingDates
          ? currentRead
          : currentRead.filter((id) => id !== itemId);

        const next: StudyDatabase = {
          ...prev,
          laws: {
            ...prev.laws,
            [folder]: {
              ...folderData,
              items: nextItems,
            },
          },
          readLawItems: {
            ...readMap,
            [folder]: nextRead,
          },
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      toast('Data de leitura do artigo removida.');
    },
    [toast],
  );

  const setLawLastPosition = useCallback((folder: string, articleKey: string) => {
    const cleanFolder = String(folder || '').trim();
    const cleanKey = String(articleKey || '').trim();
    if (!cleanFolder || !cleanKey) return;
    setDb((prev) => {
      if (prev.lawLastReadPosition?.[cleanFolder] === cleanKey) return prev;
      const next: StudyDatabase = {
        ...prev,
        lawLastReadPosition: {
          ...(prev.lawLastReadPosition || {}),
          [cleanFolder]: cleanKey,
        },
      };
      dbRef.current = next;
      pendingCloudSyncRef.current = true;
      return next;
    });
  }, []);

  const saveIncidenceFilter = useCallback(
    (
      payload: Omit<SavedIncidenceFilter, 'id' | 'criado_em'> & { id?: string },
    ): SavedIncidenceFilter => {
      const cleanName = String(payload.nome || '').trim() || 'Filtro salvo';
      const record: SavedIncidenceFilter = {
        id: payload.id || uid(10),
        nome: cleanName,
        pastaLei: payload.pastaLei,
        gradeFilter: payload.gradeFilter,
        readStatusFilter: payload.readStatusFilter,
        editalContestId: payload.editalContestId || 'all',
        multiArticleQuery: String(payload.multiArticleQuery || '').trim(),
        selectedArticleKeys: Array.isArray(payload.selectedArticleKeys)
          ? payload.selectedArticleKeys
          : [],
        search: String(payload.search || '').trim(),
        criado_em: localDateTimeBrazilian(),
      };

      setDb((prev) => {
        const list = prev.savedIncidenceFilters || [];
        const existsIdx = list.findIndex(
          (f) => f.id === record.id || normalizeSearch(f.nome) === normalizeSearch(record.nome),
        );
        const nextList =
          existsIdx >= 0
            ? list.map((f, idx) => (idx === existsIdx ? { ...record, id: f.id } : f))
            : [record, ...list];
        const next: StudyDatabase = {
          ...prev,
          savedIncidenceFilters: nextList,
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      toast(`Filtro "${cleanName}" salvo com a lei "${visibleName(payload.pastaLei)}".`);
      return record;
    },
    [toast],
  );

  const deleteIncidenceFilter = useCallback(
    (id: string) => {
      setDb((prev) => {
        const next: StudyDatabase = {
          ...prev,
          savedIncidenceFilters: (prev.savedIncidenceFilters || []).filter((f) => f.id !== id),
        };
        dbRef.current = next;
        pendingCloudSyncRef.current = true;
        return next;
      });
      toast('Filtro salvo removido.');
    },
    [toast],
  );

  const addLawHighlight = useCallback(
    (
      folder: string,
      text: string,
      color: HighlightColorKey,
      options?: { itemId?: string; startOffset?: number; endOffset?: number },
    ) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toast('Selecione um trecho da lei antes de grifar.', true);
        return;
      }
      let changed = false;
      setDb((prev) => {
        const existing = prev.lawHighlights[folder] || [];
        const matchIdx = existing.findIndex(
          (h) =>
            h.text === trimmed &&
            (!options?.itemId || !h.itemId || h.itemId === options.itemId),
        );
        if (
          matchIdx >= 0 &&
          existing[matchIdx].color === color &&
          existing[matchIdx].itemId === options?.itemId &&
          existing[matchIdx].startOffset === options?.startOffset &&
          existing[matchIdx].endOffset === options?.endOffset
        ) {
          return prev;
        }
        changed = true;
        const nextEntry: LawHighlight = {
          id: matchIdx >= 0 && existing[matchIdx].id ? existing[matchIdx].id : uid(8),
          text: trimmed,
          color,
          ...(options?.itemId ? { itemId: options.itemId } : {}),
          ...(typeof options?.startOffset === 'number' ? { startOffset: options.startOffset } : {}),
          ...(typeof options?.endOffset === 'number' ? { endOffset: options.endOffset } : {}),
        };
        const next =
          matchIdx >= 0
            ? existing.map((h, i) => (i === matchIdx ? { ...h, ...nextEntry } : h))
            : [...existing, nextEntry];
        return {
          ...prev,
          lawHighlights: { ...prev.lawHighlights, [folder]: next },
        };
      });
      if (changed) {
        toast('Trecho salvo nos grifos.');
      }
    },
    [setDb, toast],
  );

  const cycleLawHighlightColor = useCallback(
    (folder: string, targetTextOrId: string, itemId?: string) => {
      const COLOR_ORDER: HighlightColorKey[] = ['yellow', 'green', 'blue', 'pink', 'orange'];
      const COLOR_LABELS: Record<HighlightColorKey, string> = {
        yellow: 'Amarelo',
        green: 'Verde',
        blue: 'Azul',
        pink: 'Rosa',
        orange: 'Laranja',
      };
      const cleanTarget = String(targetTextOrId || '').trim();
      if (!cleanTarget) return;
      let nextColorLabel: string | null = null;
      setDb((prev) => {
        const existing = prev.lawHighlights[folder] || [];
        const idx = existing.findIndex(
          (h) =>
            h.id === cleanTarget ||
            (h.text.toLowerCase() === cleanTarget.toLowerCase() &&
              (!itemId || !h.itemId || h.itemId === itemId)),
        );
        if (idx < 0) return prev;
        const currentColor = existing[idx].color;
        const nextColor =
          COLOR_ORDER[(COLOR_ORDER.indexOf(currentColor) + 1) % COLOR_ORDER.length];
        nextColorLabel = COLOR_LABELS[nextColor];
        const next = existing.map((h, i) => (i === idx ? { ...h, color: nextColor } : h));
        return {
          ...prev,
          lawHighlights: { ...prev.lawHighlights, [folder]: next },
        };
      });
      if (nextColorLabel) {
        toast(`Cor da marcação alterada para ${nextColorLabel}.`);
      }
    },
    [setDb, toast],
  );

  const removeLawHighlightText = useCallback(
    (folder: string, text: string): boolean => {
      const normalize = (v: string) =>
        String(v || '')
          .replace(/\u2013|\u2014/g, '-')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      const targetNorm = normalize(text);
      if (!targetNorm) {
        toast('Selecione um trecho grifado para remover a marcação.', true);
        return false;
      }

      const existing = dbRef.current.lawHighlights[folder] || [];
      if (!existing.length) {
        toast('Não há marcações salvas nesta lei.', true);
        return false;
      }

      const next = existing.filter((h) => {
        const hNorm = normalize(h.text);
        if (!hNorm) return false;
        return hNorm !== targetNorm && !hNorm.includes(targetNorm) && !targetNorm.includes(hNorm);
      });

      if (next.length === existing.length) {
        toast('Nenhuma marcação encontrada no trecho selecionado.', true);
        return false;
      }

      setDb((prev) => ({
        ...prev,
        lawHighlights: { ...prev.lawHighlights, [folder]: next },
      }));
      toast('Marcação removida do texto.');
      return true;
    },
    [setDb, toast],
  );

  const removeLastLawHighlight = useCallback(
    (folder: string) => {
      let removed = false;
      setDb((prev) => {
        const existing = prev.lawHighlights[folder] || [];
        if (!existing.length) return prev;
        removed = true;
        return {
          ...prev,
          lawHighlights: { ...prev.lawHighlights, [folder]: existing.slice(0, -1) },
        };
      });
      if (removed) {
        toast('Último grifo removido.');
      }
    },
    [setDb, toast],
  );

  const saveLawNote = useCallback(
    (folder: string, note: string, silent = false) => {
      const cleanFolder = String(folder || '').trim();
      if (!cleanFolder) return;
      let changed = false;
      setDb((prev) => {
        const prevMap = prev.lawNotes || {};
        if ((prevMap[cleanFolder] || '') === note) return prev;
        changed = true;
        const nextMap = { ...prevMap };
        if (note.trim()) {
          nextMap[cleanFolder] = note;
        } else {
          delete nextMap[cleanFolder];
        }
        return {
          ...prev,
          lawNotes: nextMap,
        };
      });
      if (changed) {
        lastUrgentSaveMsRef.current = Date.now();
      }
      if (!silent && changed) {
        toast('Observações da lei salvas.');
      }
    },
    [setDb, toast],
  );

  // Personal PDFs (protecting reserved backup folders from view/edit/deletion)
  const isProtectedPdfFolder = useCallback(
    (folderName: string) => {
      const known = [
        activeDriveFolderName,
        getPreferredStudyFolder().name,
        ...getKnownStudyDriveFolderNames(),
      ];
      return isReservedBackupFolderName(folderName, known, db.pdfFolders[folderName]);
    },
    [activeDriveFolderName, db.pdfFolders],
  );

  const createPdfFolder = useCallback(
    (rawName: string): string => {
      const name = cleanSafeName(rawName, 'Pasta').replace(/\s+/g, '_');
      if (isProtectedPdfFolder(name)) {
        toast('Este nome pertence à pasta reservada de backup e não pode ser usado aqui.', true);
        return '';
      }
      setDb((prev) => {
        if (prev.pdfFolders[name]) return prev;
        return { ...prev, pdfFolders: { ...prev.pdfFolders, [name]: [] } };
      });
      toast('Pasta criada.');
      return name;
    },
    [isProtectedPdfFolder, toast],
  );

  const renamePdfFolder = useCallback(
    (oldName: string, rawNewName: string): string => {
      if (isProtectedPdfFolder(oldName)) return oldName;
      const newName = cleanSafeName(rawNewName, 'Nova_Pasta').replace(/\s+/g, '_');
      if (!oldName || !newName || oldName === newName) return oldName;
      if (isProtectedPdfFolder(newName)) {
        toast('Este nome pertence à pasta reservada de backup e não pode ser usado.', true);
        return oldName;
      }

      setDb((prev) => {
        if (!prev.pdfFolders[oldName]) return prev;
        const nextFolders = { ...prev.pdfFolders };
        const existingFiles = nextFolders[oldName] || [];
        delete nextFolders[oldName];
        nextFolders[newName] = existingFiles;
        return {
          ...prev,
          pdfFolders: nextFolders,
        };
      });
      toast(`Pasta renomeada para "${visibleName(newName)}".`);
      return newName;
    },
    [isProtectedPdfFolder, toast],
  );

  const uploadPersonalPdfs = useCallback(async (folder: string, files: File[]): Promise<number> => {
    if (isProtectedPdfFolder(folder)) {
      throw new Error('A pasta de backup é protegida e não aceita envios manuais.');
    }
    const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) throw new Error('Selecione arquivos PDF para enviar.');

    const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
    const driveSubfolders = folderLabel ? ['PDFs Pessoais', folderLabel] : 'PDFs Pessoais';
    const created: PersonalPdfFile[] = [];
    for (const file of pdfs) {
      const blobKey = `pdf-${uid(16)}`;
      await saveFileBlob(blobKey, file);
      await autoSyncFileToDrive(file, file.name, driveSubfolders);
      created.push({
        id: uid(12),
        name: file.name,
        size: file.size,
        blobKey,
        createdAt: localDateIso(),
        updatedAt: new Date().toISOString(),
      });
    }

    setDb((prev) => ({
      ...prev,
      pdfFolders: {
        ...prev.pdfFolders,
        [folder]: [...(prev.pdfFolders[folder] || []), ...created],
      },
    }));
    return created.length;
  }, [autoSyncFileToDrive, isProtectedPdfFolder]);

  const replacePersonalPdf = useCallback(
    async (folder: string, fileId: string, replacement: File) => {
      if (isProtectedPdfFolder(folder)) return;
      if (!replacement.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Selecione um arquivo PDF para substituir o original.');
      }
      const target = (db.pdfFolders[folder] || []).find((f) => f.id === fileId);
      if (!target) throw new Error('PDF não encontrado.');
      await saveFileBlob(target.blobKey, replacement);
      await deleteFileBlob(`${target.blobKey}::clean`);
      const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
      await autoSyncFileToDrive(
        replacement,
        target.name,
        folderLabel ? ['PDFs Pessoais', folderLabel] : 'PDFs Pessoais',
      );
      setDb((prev) => {
        const nextAnnotations = { ...(prev.pdfAnnotations || {}) };
        delete nextAnnotations[target.blobKey];
        return {
          ...prev,
          pdfFolders: {
            ...prev.pdfFolders,
            [folder]: (prev.pdfFolders[folder] || []).map((f) =>
              f.id === fileId
                ? { ...f, size: replacement.size, updatedAt: new Date().toISOString(), hasAnnotations: false }
                : f,
            ),
          },
          pdfAnnotations: nextAnnotations,
        };
      });
      toast(`PDF "${visibleName(target.name)}" substituído.`);
    },
    [autoSyncFileToDrive, db.pdfFolders, isProtectedPdfFolder, toast],
  );

  const savePdfAnnotations = useCallback((blobKey: string, annotations: PdfFileAnnotations) => {
    if (!blobKey) return;
    setDb((prev) => {
      const prevMap = prev.pdfAnnotations || {};
      const existing = prevMap[blobKey];
      const isEmpty = annotations.strokes.length === 0 && annotations.notes.length === 0;
      if (isEmpty && !existing) return prev;
      if (!isEmpty && existing === annotations) return prev;
      const nextMap = { ...prevMap };
      if (isEmpty) {
        delete nextMap[blobKey];
      } else {
        nextMap[blobKey] = annotations;
      }
      return {
        ...prev,
        pdfAnnotations: nextMap,
      };
    });
  }, []);

  const commitAnnotatedPersonalPdf = useCallback(
    async (
      folder: string,
      fileId: string,
      updatedBlob: Blob,
      hasAnnotations: boolean,
      options?: { silent?: boolean },
    ): Promise<boolean> => {
      if (isProtectedPdfFolder(folder)) return false;
      const target = (dbRef.current.pdfFolders[folder] || []).find((f) => f.id === fileId);
      if (!target) return false;

      await saveFileBlob(target.blobKey, updatedBlob);

      const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
      const syncedRemote = await autoSyncFileToDrive(
        updatedBlob,
        target.name,
        folderLabel ? ['PDFs Pessoais', folderLabel] : 'PDFs Pessoais',
      );

      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        pdfFolders: {
          ...prev.pdfFolders,
          [folder]: (prev.pdfFolders[folder] || []).map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  size: updatedBlob.size,
                  updatedAt: nowIso,
                  hasAnnotations,
                }
              : f,
          ),
        },
      }));

      if (!options?.silent) {
        toast(
          syncedRemote
            ? `Alterações salvas automaticamente no PDF "${visibleName(target.name)}" e sincronizadas.`
            : `Alterações salvas automaticamente no PDF "${visibleName(target.name)}".`,
        );
      }
      return syncedRemote;
    },
    [autoSyncFileToDrive, isProtectedPdfFolder, toast],
  );

  const deletePersonalPdf = useCallback(
    async (folder: string, fileId: string) => {
      if (isProtectedPdfFolder(folder)) return;
      const target = (dbRef.current.pdfFolders[folder] || []).find((f) => f.id === fileId);
      if (target) {
        await deleteFileBlob(target.blobKey);
        await deleteFileBlob(`${target.blobKey}::clean`);
        deleteOrQueueDriveFiles({
          fileIds: target.blobKey?.startsWith('drive_') ? [target.blobKey] : undefined,
          names: [target.name],
          subfolderHints: ['PDFs Pessoais', visibleName(folder)].filter(Boolean),
        });
      }
      setDb((prev) => {
        const nextAnnotations = { ...(prev.pdfAnnotations || {}) };
        if (target?.blobKey) delete nextAnnotations[target.blobKey];
        return {
          ...prev,
          pdfFolders: {
            ...prev.pdfFolders,
            [folder]: (prev.pdfFolders[folder] || []).filter((f) => f.id !== fileId),
          },
          pdfAnnotations: nextAnnotations,
        };
      });
      toast('PDF removido.');
    },
    [deleteOrQueueDriveFiles, isProtectedPdfFolder, toast],
  );

  const deletePdfFolder = useCallback(
    async (folder: string): Promise<number> => {
      if (isProtectedPdfFolder(folder)) {
        toast('Pasta de backup protegida — não pode ser removida.', true);
        return 0;
      }
      const files = dbRef.current.pdfFolders[folder] || [];
      for (const f of files) {
        await deleteFileBlob(f.blobKey);
        await deleteFileBlob(`${f.blobKey}::clean`);
      }
      deleteOrQueueDriveFiles({
        fileIds: files.map((f) => f.blobKey).filter((k) => Boolean(k && k.startsWith('drive_'))),
        names: files.map((f) => f.name).filter(Boolean),
        subfolderHints: ['PDFs Pessoais', visibleName(folder)].filter(Boolean),
        folderNames: [folder, visibleName(folder)],
      });
      setDb((prev) => {
        const next = { ...prev.pdfFolders };
        delete next[folder];
        const nextAnnotations = { ...(prev.pdfAnnotations || {}) };
        for (const f of files) {
          delete nextAnnotations[f.blobKey];
        }
        return { ...prev, pdfFolders: next, pdfAnnotations: nextAnnotations };
      });
      return files.length;
    },
    [deleteOrQueueDriveFiles, isProtectedPdfFolder, toast],
  );

  // Summaries
  const createSummaryFolder = useCallback(
    (rawName: string): string => {
      const name = cleanSafeName(rawName, 'Resumo').replace(/\s+/g, '_');
      setDb((prev) => {
        if (prev.summaryFolders[name]) return prev;
        return { ...prev, summaryFolders: { ...prev.summaryFolders, [name]: [] } };
      });
      toast('Pasta temática criada.');
      return name;
    },
    [toast],
  );

  const uploadSummaryFile = useCallback(
    async (folder: string, file: File) => {
      if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
        throw new Error('Permitidos apenas PDF ou imagens (.png, .jpg, .jpeg).');
      }
      const blobKey = `summary-${uid(16)}`;
      await saveFileBlob(blobKey, file);
      const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
      const driveSubfolders = folderLabel ? ['Resumos e Mapas', folderLabel] : 'Resumos e Mapas';
      await autoSyncFileToDrive(file, file.name, driveSubfolders);
      const record: SummaryFile = {
        id: uid(12),
        name: file.name,
        size: file.size,
        mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'),
        blobKey,
        createdAt: localDateIso(),
        updatedAt: new Date().toISOString(),
      };
      setDb((prev) => ({
        ...prev,
        summaryFolders: {
          ...prev.summaryFolders,
          [folder]: [...(prev.summaryFolders[folder] || []), record],
        },
      }));
      toast('Arquivo enviado.');
    },
    [autoSyncFileToDrive, toast],
  );

  const deleteSummaryFile = useCallback(
    async (folder: string, fileId: string) => {
      const target = (dbRef.current.summaryFolders[folder] || []).find((f) => f.id === fileId);
      if (target) {
        await deleteFileBlob(target.blobKey);
        deleteOrQueueDriveFiles({
          fileIds: target.blobKey?.startsWith('drive_') ? [target.blobKey] : undefined,
          names: [`RESUMO - ${target.name}`, target.name],
          subfolderHints: ['Resumos e Mapas', visibleName(folder)].filter(Boolean),
        });
      }
      setDb((prev) => ({
        ...prev,
        summaryFolders: {
          ...prev.summaryFolders,
          [folder]: (prev.summaryFolders[folder] || []).filter((f) => f.id !== fileId),
        },
      }));
      toast('Arquivo excluído.');
    },
    [deleteOrQueueDriveFiles, toast],
  );

  // Proofs
  const createProofBank = useCallback(
    (rawName: string): string => {
      const name = cleanSafeName(rawName, 'Geral');
      if (db.proofBanks.includes(name)) {
        throw new Error('Essa banca já existe.');
      }
      setDb((prev) => ({ ...prev, proofBanks: [...prev.proofBanks, name] }));
      toast('Banca criada.');
      return name;
    },
    [db.proofBanks, toast],
  );

  const uploadProofOnly = useCallback(
    async (bank: string, file: File) => {
      if (!/\.(pdf|txt|md)$/i.test(file.name)) {
        throw new Error('Selecione um arquivo de prova em PDF ou TXT.');
      }
      if (/\.(txt|md)$/i.test(file.name)) {
        const previewTxt = await file.text();
        if (
          isScheduleTxtDescriptor(file.name, undefined, previewTxt) ||
          isContestOrEditalTxtDescriptor(file.name, undefined, previewTxt)
        ) {
          throw new Error(
            `O arquivo "${file.name}" pertence a Cronograma, Datas e Locais ou Edital e não deve ser enviado como prova/simulado.`,
          );
        }
      }
      const blobKey = `proof-${uid(16)}`;
      await saveFileBlob(blobKey, file);
      const bankSeg = bank && bank.trim() && bank !== 'Geral' ? visibleName(bank).replace(/[\\/]+/g, ' - ').trim() : '';
      const proofSubfolder: string | string[] = bankSeg ? ['Provas e Gabaritos', bankSeg] : 'Provas e Gabaritos';
      await autoSyncFileToDrive(file, `PROVA - ${file.name}`, proofSubfolder);

      let gabaritoArquivo: string | undefined;
      let gabaritoConteudo: string | undefined;
      let gabaritoQuestoes = 0;
      let simQuestions: Question[] = [];

      if (/\.(txt|md)$/i.test(file.name)) {
        const text = await file.text();
        simQuestions = parseUploadedQuestions(text, displayBaseName(file.name) || bank || 'Geral');
        if (simQuestions.length > 0) {
          gabaritoQuestoes = simQuestions.length;
          gabaritoArquivo = `${file.name}.gabarito.txt`;
          gabaritoConteudo =
            'GABARITO EXTRAÍDO DA PROVA\n' +
            simQuestions.map((q, idx) => `${q.numero ?? idx + 1}-${q.gabarito}`).join('\n') +
            '\n';
        }
      }

      const record: ProofFileRecord = {
        id: uid(14),
        name: file.name,
        size: file.size,
        bank: bank || 'Geral',
        kind: gabaritoQuestoes > 0 ? 'provas-com-gabarito' : 'provas',
        blobKey,
        ...(gabaritoArquivo ? { gabarito_arquivo: gabaritoArquivo } : {}),
        ...(gabaritoConteudo ? { gabarito_conteudo: gabaritoConteudo } : {}),
        gabarito_questoes: gabaritoQuestoes,
        observacoes: '',
        correcoes: [],
        createdAt: localDateIso(),
        updatedAt: new Date().toISOString(),
      };
      setDb((prev) => {
        const nextSubmitted = [...prev.submittedSimulations];
        if (
          simQuestions.length > 0 &&
          !nextSubmitted.some((s) => normalizeFileLookup(s.arquivo) === normalizeFileLookup(file.name))
        ) {
          const simSubject = visibleName(bank && bank !== 'Geral' ? bank : displayBaseName(file.name)) || 'Geral';
          nextSubmitted.unshift({
            id: uid(32),
            titulo: displayBaseName(file.name),
            materia: simSubject,
            arquivo: file.name,
            data: localDateTimeBrazilian(),
            criado_em: new Date().toISOString().slice(0, 19),
            questoes: simQuestions.map((q, idx) => ({
              ...q,
              numero: q.numero || idx + 1,
              materia: simSubject,
            })),
          });
        }
        return {
          ...prev,
          proofBanks: prev.proofBanks.includes(bank) ? prev.proofBanks : [...prev.proofBanks, bank],
          proofFiles: [record, ...prev.proofFiles],
          submittedSimulations: nextSubmitted,
        };
      });
      toast(
        simQuestions.length > 0
          ? `Prova .txt enviada (${simQuestions.length} questão(ões) disponível(eis) também em Simulado Fechado).`
          : 'Prova enviada.',
      );
    },
    [autoSyncFileToDrive, toast],
  );

  const uploadProofWithAnswer = useCallback(
    async (
      bank: string,
      kind: 'provas' | 'provas-com-gabarito',
      proofFile: File,
      answerFile: File | null,
      answerText: string,
      observacoes: string,
    ): Promise<number> => {
      if (!/\.(pdf|txt|md)$/i.test(proofFile.name)) {
        throw new Error('Selecione a prova em PDF ou TXT.');
      }
      const isTxtProof = /\.(txt|md)$/i.test(proofFile.name);
      const proofRawText = isTxtProof ? await proofFile.text() : '';
      if (
        isTxtProof &&
        (isScheduleTxtDescriptor(proofFile.name, undefined, proofRawText) ||
          isContestOrEditalTxtDescriptor(proofFile.name, undefined, proofRawText))
      ) {
        throw new Error(
          `O arquivo "${proofFile.name}" pertence a Cronograma, Datas e Locais ou Edital e não deve ser enviado como prova/simulado.`,
        );
      }
      const rawKey = await readAnswerKeyInput(answerFile, answerText);
      const hasExplicitAnswer = Boolean(rawKey.trim());

      let answers: Record<number, string> = {};
      if (hasExplicitAnswer) {
        answers = parseAnswerKeyWithMode(rawKey).answers;
      }

      let simQuestions: Question[] = isTxtProof
        ? parseUploadedQuestions(
            proofRawText,
            displayBaseName(proofFile.name) || bank || 'Geral',
            Object.keys(answers).length ? answers : undefined,
          )
        : [];

      if (!Object.keys(answers).length && simQuestions.length > 0) {
        const derived: Record<number, string> = {};
        simQuestions.forEach((q, idx) => {
          derived[q.numero ?? idx + 1] = q.gabarito;
        });
        answers = derived;
      }

      const answerCount = Object.keys(answers).length;
      if (kind === 'provas-com-gabarito' && !answerCount) {
        throw new Error('Não consegui identificar respostas válidas no gabarito.');
      }

      const answerContent =
        answerCount > 0
          ? 'GABARITO ASSOCIADO À PROVA\n' +
            Object.keys(answers)
              .map(Number)
              .sort((a, b) => a - b)
              .map((num) => `${num}-${answers[num]}`)
              .join('\n') +
            '\n'
          : '';

      const blobKey = `proof-${uid(16)}`;
      await saveFileBlob(blobKey, proofFile);
      const bankSeg = bank && bank.trim() && bank !== 'Geral' ? visibleName(bank).replace(/[\\/]+/g, ' - ').trim() : '';
      const proofSubfolder: string | string[] = bankSeg ? ['Provas e Gabaritos', bankSeg] : 'Provas e Gabaritos';
      await autoSyncFileToDrive(proofFile, `PROVA - ${proofFile.name}`, proofSubfolder);
      if (answerFile) {
        await autoSyncFileToDrive(answerFile, `GABARITO - ${answerFile.name}`, proofSubfolder);
      } else if (answerContent) {
        await autoSyncFileToDrive(
          new Blob([answerContent], { type: 'text/plain;charset=utf-8' }),
          `${proofFile.name}.gabarito.txt`,
          proofSubfolder,
        );
      }

      const record: ProofFileRecord = {
        id: uid(14),
        name: proofFile.name,
        size: proofFile.size,
        bank: bank || 'Geral',
        kind: answerCount > 0 ? 'provas-com-gabarito' : kind,
        blobKey,
        ...(answerContent ? { gabarito_arquivo: `${proofFile.name}.gabarito.txt`, gabarito_conteudo: answerContent } : {}),
        gabarito_questoes: answerCount,
        observacoes: observacoes.trim(),
        correcoes: [],
        createdAt: localDateIso(),
        updatedAt: new Date().toISOString(),
      };
      setDb((prev) => {
        const nextSubmitted = [...prev.submittedSimulations];
        if (
          simQuestions.length > 0 &&
          !nextSubmitted.some((s) => normalizeFileLookup(s.arquivo) === normalizeFileLookup(proofFile.name))
        ) {
          const simSubject = visibleName(bank && bank !== 'Geral' ? bank : displayBaseName(proofFile.name)) || 'Geral';
          nextSubmitted.unshift({
            id: uid(32),
            titulo: displayBaseName(proofFile.name),
            materia: simSubject,
            arquivo: proofFile.name,
            data: localDateTimeBrazilian(),
            criado_em: new Date().toISOString().slice(0, 19),
            questoes: simQuestions.map((q, idx) => ({
              ...q,
              numero: q.numero || idx + 1,
              materia: simSubject,
            })),
          });
        }
        return {
          ...prev,
          proofBanks: prev.proofBanks.includes(bank) ? prev.proofBanks : [...prev.proofBanks, bank],
          proofFiles: [record, ...prev.proofFiles],
          submittedSimulations: nextSubmitted,
        };
      });
      return answerCount;
    },
    [autoSyncFileToDrive],
  );

  const replaceProofPdf = useCallback(
    async (proofId: string, replacement: File) => {
      if (!/\.(pdf|txt|md)$/i.test(replacement.name)) {
        throw new Error('Selecione um arquivo PDF ou TXT para substituir o original.');
      }
      const target = db.proofFiles.find((p) => p.id === proofId);
      if (!target) throw new Error('Prova não encontrada.');
      await saveFileBlob(target.blobKey, replacement);
      const bankSeg =
        target.bank && target.bank.trim() && target.bank !== 'Geral'
          ? visibleName(target.bank).replace(/[\\/]+/g, ' - ').trim()
          : '';
      const proofSubfolder: string | string[] = bankSeg ? ['Provas e Gabaritos', bankSeg] : 'Provas e Gabaritos';
      await autoSyncFileToDrive(replacement, `PROVA - ${replacement.name}`, proofSubfolder);
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        proofFiles: prev.proofFiles.map((p) =>
          p.id === proofId ? { ...p, name: replacement.name, size: replacement.size, updatedAt: nowIso } : p,
        ),
      }));
      toast(`Arquivo "${visibleName(target.name)}" substituído por "${visibleName(replacement.name)}".`);
    },
    [autoSyncFileToDrive, db.proofFiles, toast],
  );

  const deleteProofFile = useCallback(
    async (proofId: string) => {
      const target = dbRef.current.proofFiles.find((p) => p.id === proofId);
      if (target) {
        await deleteFileBlob(target.blobKey);
        const bankSeg =
          target.bank && target.bank.trim() && target.bank !== 'Geral'
            ? visibleName(target.bank).replace(/[\\/]+/g, ' - ').trim()
            : '';
        deleteOrQueueDriveFiles({
          fileIds: target.blobKey?.startsWith('drive_') ? [target.blobKey] : undefined,
          names: [
            `PROVA - ${target.name}`,
            target.name,
            `${target.name}.gabarito.txt`,
            ...(target.gabarito_arquivo
              ? [`GABARITO - ${target.gabarito_arquivo}`, target.gabarito_arquivo]
              : []),
          ].filter(Boolean),
          subfolderHints: bankSeg ? ['Provas e Gabaritos', bankSeg] : ['Provas e Gabaritos'],
        });
      }
      setDb((prev) => ({
        ...prev,
        proofFiles: prev.proofFiles.filter((p) => p.id !== proofId),
      }));
      toast('Prova excluída.');
    },
    [deleteOrQueueDriveFiles, toast],
  );

  const updateProofObservations = useCallback(
    (proofId: string, observacoes: string, silent = false) => {
      setDb((prev) => {
        const trimmed = observacoes.trim();
        const target = prev.proofFiles.find((p) => p.id === proofId);
        if (!target || (target.observacoes || '') === trimmed) return prev;
        return {
          ...prev,
          proofFiles: prev.proofFiles.map((p) =>
            p.id === proofId ? { ...p, observacoes: trimmed } : p,
          ),
        };
      });
      if (!silent) {
        toast(observacoes.trim() ? 'Observações da prova salvas.' : 'Observações removidas.');
      }
    },
    [toast],
  );

  const addOrUpdateProofCorrection = useCallback(
    (proofId: string, questao: string, observacoes: string, correctionId?: string) => {
      if (!questao.trim()) {
        toast('Informe a questão errada.', true);
        return;
      }
      const now = new Date().toISOString().slice(0, 19);
      setDb((prev) => ({
        ...prev,
        proofFiles: prev.proofFiles.map((p) => {
          if (p.id !== proofId) return p;
          if (correctionId) {
            return {
              ...p,
              correcoes: p.correcoes.map((c) =>
                c.id === correctionId
                  ? {
                      ...c,
                      questao: questao.trim(),
                      observacoes: observacoes.trim(),
                      atualizado_em: now,
                    }
                  : c,
              ),
            };
          }
          return {
            ...p,
            correcoes: [
              {
                id: uid(14),
                questao: questao.trim(),
                observacoes: observacoes.trim(),
                criado_em: now,
              },
              ...p.correcoes,
            ],
          };
        }),
      }));
      toast(
        correctionId
          ? 'Correção atualizada.'
          : 'Questão adicionada à prova e ao Caderno de Erros.',
      );
    },
    [toast],
  );

  const deleteProofCorrection = useCallback(
    (proofId: string, correctionId: string) => {
      setDb((prev) => ({
        ...prev,
        proofFiles: prev.proofFiles.map((p) =>
          p.id === proofId
            ? { ...p, correcoes: p.correcoes.filter((c) => c.id !== correctionId) }
            : p,
        ),
      }));
      toast('Correção excluída da prova e do Caderno de Erros.');
    },
    [toast],
  );

  // Discursive Essays
  const submitEssay = useCallback(
    async (titulo: string, file: File): Promise<EssayRecord> => {
      if (!titulo.trim()) throw new Error('Informe o título da redação.');
      if (!/\.(txt|pdf|docx)$/i.test(file.name)) {
        throw new Error('Anexe a redação em TXT, PDF ou DOCX.');
      }
      const blobKey = `essay-${uid(16)}`;
      await saveFileBlob(blobKey, file);
      await autoSyncFileToDrive(file, `DISCURSIVA - ${file.name}`, 'Discursivas');
      const nowIso = new Date().toISOString();
      const record: EssayRecord = {
        id: uid(16),
        titulo: titulo.trim(),
        data: localDateTimeBrazilian(),
        created_at: nowIso.slice(0, 19),
        updatedAt: nowIso,
        original_arquivo: file.name,
        original_blobKey: blobKey,
        original_mime: file.type || 'application/octet-stream',
        corrigido_arquivo: '',
        feedback: '',
      };
      setDb((prev) => ({ ...prev, essays: [record, ...prev.essays] }));
      toast(`Redação "${visibleName(record.titulo)}" enviada.`);
      return record;
    },
    [autoSyncFileToDrive, toast],
  );

  const updateEssayCorrection = useCallback(
    async (
      essayId: string,
      feedback: string,
      correctedFile?: File | null,
    ): Promise<EssayRecord> => {
      const target = db.essays.find((e) => e.id === essayId);
      if (!target) throw new Error('Redação não encontrada.');
      const trimmedFeedback = feedback.trim();
      const hasFile = !!(correctedFile && correctedFile.size > 0);
      if (!hasFile && trimmedFeedback === target.feedback.trim()) {
        throw new Error('Anexe a redação corrigida ou atualize os comentários.');
      }

      let corrigido_arquivo = target.corrigido_arquivo;
      let corrigido_blobKey = target.corrigido_blobKey;
      let corrigido_mime = target.corrigido_mime;
      if (hasFile && correctedFile) {
        if (!/\.(txt|pdf|docx)$/i.test(correctedFile.name)) {
          throw new Error('Formato inválido para redação corrigida (.txt, .pdf ou .docx).');
        }
        const key = `essay-corr-${uid(16)}`;
        await saveFileBlob(key, correctedFile);
        await autoSyncFileToDrive(correctedFile, `CORRECAO - ${correctedFile.name}`, 'Discursivas');
        if (target.corrigido_blobKey) await deleteFileBlob(target.corrigido_blobKey);
        corrigido_arquivo = correctedFile.name;
        corrigido_blobKey = key;
        corrigido_mime = correctedFile.type || 'application/octet-stream';
      }

      const nowIso = new Date().toISOString();
      const updated: EssayRecord = {
        ...target,
        feedback: trimmedFeedback,
        corrigido_arquivo,
        corrigido_blobKey,
        corrigido_mime,
        corrigida_em: nowIso.slice(0, 19),
        updatedAt: nowIso,
      };
      setDb((prev) => ({
        ...prev,
        essays: prev.essays.map((e) => (e.id === essayId ? updated : e)),
      }));
      toast(`Correção de "${visibleName(updated.titulo)}" salva.`);
      return updated;
    },
    [autoSyncFileToDrive, db.essays, toast],
  );

  const deleteEssay = useCallback(
    async (essayId: string) => {
      const target = dbRef.current.essays.find((e) => e.id === essayId);
      if (!target) return;

      if (target.original_blobKey) {
        await deleteFileBlob(target.original_blobKey);
      }
      if (target.corrigido_blobKey) {
        await deleteFileBlob(target.corrigido_blobKey);
      }

      const fileIds: string[] = [];
      const names: string[] = [];
      if (target.original_blobKey?.startsWith('drive_')) fileIds.push(target.original_blobKey);
      if (target.corrigido_blobKey?.startsWith('drive_')) fileIds.push(target.corrigido_blobKey);
      if (target.original_arquivo) {
        names.push(`DISCURSIVA - ${target.original_arquivo}`, target.original_arquivo);
      }
      if (target.corrigido_arquivo) {
        names.push(`CORRECAO - ${target.corrigido_arquivo}`, target.corrigido_arquivo);
      }
      if (fileIds.length > 0 || names.length > 0) {
        deleteOrQueueDriveFiles({
          fileIds: fileIds.length > 0 ? fileIds : undefined,
          names: names.length > 0 ? names : undefined,
          subfolderHints: ['Discursivas'],
        });
      }

      setDb((prev) => ({
        ...prev,
        essays: prev.essays.filter((e) => e.id !== essayId),
      }));
      toast(`Redação "${visibleName(target.titulo)}" excluída.`);
    },
    [deleteOrQueueDriveFiles, toast],
  );

  // Critical Points
  const addCriticalPoint = useCallback(
    (data: string, materia: string, titulo: string, texto: string) => {
      if (!titulo.trim() || !texto.trim()) {
        toast('Informe o título e o conteúdo.', true);
        return;
      }
      setDb((prev) => ({
        ...prev,
        criticalPoints: [
          {
            id: uid(12),
            data: data.trim() || String(new Date().getFullYear()),
            materia: materia.trim() || 'Geral',
            titulo: titulo.trim(),
            texto: texto.trim(),
          },
          ...prev.criticalPoints,
        ],
      }));
      toast('Atualização cadastrada.');
    },
    [toast],
  );

  const deleteCriticalPoint = useCallback(
    (id: string) => {
      setDb((prev) => ({
        ...prev,
        criticalPoints: prev.criticalPoints.filter((c) => c.id !== id),
      }));
      toast('Atualização excluída.');
    },
    [toast],
  );

  // Utilities
  const importQuestionsTxt = useCallback(
    async (
      file: File,
      subjectInput: string,
      asSimulation: boolean,
    ): Promise<{ count: number; materia: string; simulado: boolean }> => {
      if (!/\.(txt|md)$/i.test(file.name)) {
        throw new Error('Selecione um arquivo .txt ou .md.');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('O arquivo de questões excede o limite de 5 MB.');
      }
      const subject = subjectInput.trim() || displayBaseName(file.name);
      const text = await file.text();
      if (
        isScheduleTxtDescriptor(file.name, undefined, text) ||
        isContestOrEditalTxtDescriptor(file.name, undefined, text)
      ) {
        throw new Error(
          `O arquivo "${file.name}" pertence a Cronograma, Datas e Locais ou Edital e não deve ser importado como questões/simulado.`,
        );
      }
      const parsed = parseUploadedQuestions(text, subject);
      if (!parsed.length) {
        throw new Error(
          "Não encontrei questões reconhecidas. Use linhas 'enunciado | gabarito | comentário' ou questões numeradas com gabarito.",
        );
      }

      if (asSimulation) {
        const sim: SubmittedSimulation = {
          id: uid(32),
          titulo: displayBaseName(file.name),
          materia: visibleName(subject),
          arquivo: file.name,
          data: localDateTimeBrazilian(),
          criado_em: new Date().toISOString().slice(0, 19),
          questoes: parsed.map((q, idx) => ({ ...q, numero: q.numero || idx + 1, materia: visibleName(subject) })),
        };
        setDb((prev) => ({
          ...prev,
          submittedSimulations: [sim, ...prev.submittedSimulations],
        }));
        await autoSyncFileToDrive(file, file.name, 'Provas e Gabaritos');
        return { count: parsed.length, materia: sim.materia, simulado: true };
      }

      setDb((prev) => ({
        ...prev,
        questions: [...prev.questions, ...parsed],
      }));
      await autoSyncFileToDrive(file, file.name, 'Questões');
      return { count: parsed.length, materia: subject, simulado: false };
    },
    [autoSyncFileToDrive],
  );

  const addManualQuestion = useCallback(
    (payload: {
      materia: string;
      enunciado: string;
      alternativasText: string;
      gabarito: string;
      comentario: string;
    }): { materia: string } => {
      const materia = payload.materia.trim();
      const enunciado = payload.enunciado.trim();
      if (!materia || !enunciado) {
        throw new Error('Informe a disciplina e o enunciado da questão.');
      }
      const alternatives: QuestionAlternative[] = [];
      if (payload.alternativasText.trim()) {
        const pattern = /^\s*(?:\[([A-E])\]|([A-E])[).:\-])\s*(.+?)\s*$/i;
        for (const line of payload.alternativasText.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const m = line.match(pattern);
          if (!m) {
            throw new Error('Cada alternativa deve estar em uma linha no formato A) texto.');
          }
          alternatives.push({ letra: (m[1] || m[2]).toUpperCase(), texto: m[3].trim() });
        }
        if (
          alternatives.length < 2 ||
          new Set(alternatives.map((a) => a.letra)).size !== alternatives.length
        ) {
          throw new Error('Informe pelo menos duas alternativas com letras diferentes.');
        }
      }

      const answer = normalizeAnswer(payload.gabarito);
      const allowed = alternatives.length
        ? new Set(alternatives.map((a) => a.letra))
        : new Set(['C', 'E']);
      if (!allowed.has(answer)) {
        throw new Error(
          alternatives.length
            ? 'Informe um gabarito válido correspondente a uma das alternativas.'
            : 'Informe um gabarito válido: C (Certo) ou E (Errado).',
        );
      }

      const q: Question = {
        id: uid(16),
        materia,
        enunciado,
        alternativas: alternatives,
        gabarito: answer,
        comentario: payload.comentario.trim(),
        tipo: alternatives.length ? 'ME' : 'CE',
      };
      setDb((prev) => ({ ...prev, questions: [...prev.questions, q] }));
      return { materia };
    },
    [],
  );

  const updateQuestion = useCallback(
    (
      id: string,
      patch: Partial<Pick<Question, 'materia' | 'enunciado' | 'alternativas' | 'gabarito' | 'comentario' | 'tipo'>>,
    ) => {
      setDb((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
      }));
      toast('Questão atualizada no banco.');
    },
    [toast],
  );

  const deleteQuestion = useCallback(
    (id: string) => {
      setDb((prev) => ({
        ...prev,
        questions: prev.questions.filter((q) => q.id !== id),
      }));
      toast('Questão removida do banco.');
    },
    [toast],
  );

  const convertLawPdf = useCallback(
    async (file: File, customFolder: string): Promise<{ pasta: string; dispositivos: number }> => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Selecione um PDF.');
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('O PDF excede o limite de 25 MB.');
      }
      const text = await extractTextFromPdfFile(file, 'legislação');
      const devices = splitLawDevices(text.replace(/\f/g, '\n'));
      if (!devices.length) {
        throw new Error('Não foi possível identificar artigos e dispositivos legais no texto do PDF.');
      }
      const folder = resolveLawFolderKey(dbRef.current.laws, customFolder || displayBaseName(file.name));
      const existingFolder = dbRef.current.laws[folder];
      if (existingFolder && (existingFolder.items?.length || 0) > 0) {
        throw new Error(`A pasta de legislação '${visibleName(folder)}' já existe; escolha outro nome.`);
      }
      const blobKey = `lawpdf-${uid(16)}`;
      await saveFileBlob(blobKey, file);
      const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
      await autoSyncFileToDrive(file, file.name, folderLabel ? ['Lei Seca', folderLabel] : 'Lei Seca');
      const items: LawItem[] = sortLawItemsInOrder(
        devices.map((d, idx) => ({
          id: `${folder}_formatada.txt::${idx}`,
          arquivo: `${folder}_formatada.txt`,
          dispositivo: d.dispositivo,
          grau: 'Não Classificado',
          texto: d.texto,
          dica: '',
          observacao: '',
          artigo_base: d.artigo_base,
          tipo_dispositivo: d.tipo_dispositivo,
        })),
      );
      const newPdfEntry: LawPdfEntry = {
        id: uid(12),
        name: file.name,
        size: file.size,
        blobKey,
        createdAt: localDateIso(),
        updatedAt: new Date().toISOString(),
      };
      setDb((prev) => {
        const cur = prev.laws[folder];
        const prevPdfs = cur?.pdfs || [];
        const hasPdf = prevPdfs.some((p) => p.name.toLowerCase() === file.name.toLowerCase());
        return {
          ...prev,
          laws: {
            ...prev.laws,
            [folder]: {
              name: folder,
              items,
              pdfs: hasPdf ? prevPdfs : [...prevPdfs, newPdfEntry],
            },
          },
        };
      });
      return { pasta: folder, dispositivos: items.length };
    },
    [autoSyncFileToDrive],
  );

  const convertExamPdf = useCallback(
    async (
      pdfFile: File,
      subjectInput: string,
      answerFile: File | null,
      answerText: string,
      asSimulation: boolean,
    ): Promise<{ count: number; materia: string; simulado: boolean }> => {
      if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Selecione o PDF da prova.');
      }
      await autoSyncFileToDrive(pdfFile, `PROVA - ${pdfFile.name}`, 'Provas e Gabaritos');
      if (answerFile) {
        await autoSyncFileToDrive(answerFile, `GABARITO - ${answerFile.name}`, 'Provas e Gabaritos');
      }
      const materia = subjectInput.trim() || displayBaseName(pdfFile.name);
      const rawKey = await readAnswerKeyInput(answerFile, answerText);
      const { answers: answerMap, positional } = parseAnswerKeyWithMode(rawKey);
      const answerKeys = Object.keys(answerMap).map(Number);
      if (!answerKeys.length) {
        throw new Error(
          'Não consegui identificar o gabarito. Use, por exemplo, 1-A, 2: C, 3) ERRADO ou uma sequência (A B C D E).',
        );
      }

      const examText = await extractTextFromPdfFile(pdfFile, 'prova');
      const { extractExamQuestionBlocks } = await import('../lib/parsers');
      const blocks = extractExamQuestionBlocks(examText, materia);
      if (!blocks.length) {
        throw new Error('Não consegui identificar questões numeradas no PDF da prova.');
      }

      if (positional && answerKeys.length !== blocks.length) {
        throw new Error(
          `O gabarito tem ${answerKeys.length} resposta(s), mas a prova contém ${blocks.length} questão(ões).`,
        );
      }

      const orderedAnswers = answerKeys.sort((a, b) => a - b).map((k) => answerMap[k]);
      const parsedQuestions: Question[] = [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const answer = positional ? orderedAnswers[i] : answerMap[b.numero] || '';
        if (!answer) continue;
        parsedQuestions.push({
          id: uid(20),
          numero: b.numero,
          materia: visibleName(materia),
          enunciado: b.enunciado,
          alternativas: b.alternativas,
          gabarito: answer,
          comentario: '',
          tipo: b.alternativas.length ? 'ME' : 'CE',
        });
      }

      if (!parsedQuestions.length) {
        throw new Error('Não foi possível associar respostas válidas às questões extraídas.');
      }

      if (asSimulation) {
        const sim: SubmittedSimulation = {
          id: uid(32),
          titulo: displayBaseName(pdfFile.name),
          materia: visibleName(materia),
          arquivo: pdfFile.name,
          data: localDateTimeBrazilian(),
          criado_em: new Date().toISOString().slice(0, 19),
          questoes: parsedQuestions,
        };
        setDb((prev) => ({
          ...prev,
          submittedSimulations: [sim, ...prev.submittedSimulations],
        }));
        return { count: parsedQuestions.length, materia: sim.materia, simulado: true };
      }

      setDb((prev) => ({
        ...prev,
        questions: [...prev.questions, ...parsedQuestions],
      }));
      return { count: parsedQuestions.length, materia: visibleName(materia), simulado: false };
    },
    [autoSyncFileToDrive],
  );

  const convertExamToStructuredTxt = useCallback(
    async (
      pdfFile: File,
      answerFile: File | null,
      answerText: string,
    ): Promise<string> => {
      if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Selecione o PDF da prova.');
      }
      const examText = await extractTextFromPdfFile(pdfFile, 'prova');
      const { extractExamQuestionBlocks, buildStructuredExamTxt } = await import('../lib/parsers');
      const blocks = extractExamQuestionBlocks(examText);
      if (!blocks.length) {
        throw new Error('Não consegui identificar questões numeradas no PDF da prova.');
      }

      const rawKey = await readAnswerKeyInput(answerFile, answerText);
      let answerMap: Record<number, string> = {};
      let positional = false;
      if (rawKey.trim()) {
        const parsed = parseAnswerKeyWithMode(rawKey);
        answerMap = parsed.answers;
        positional = parsed.positional;
        if (!Object.keys(answerMap).length) {
          throw new Error('Não consegui identificar respostas válidas no gabarito.');
        }
      }

      const output = buildStructuredExamTxt(pdfFile.name, blocks, answerMap, positional);
      const outName = `${displayBaseName(pdfFile.name).replace(/\s+/g, '_')}_estruturada.txt`;
      const outBlob = new Blob([output], { type: 'text/plain;charset=utf-8' });
      await autoSyncFileToDrive(outBlob, outName, 'Provas e Gabaritos');
      triggerBlobDownload(outBlob, outName);
      return outName;
    },
    [autoSyncFileToDrive],
  );

  // Backup & Settings
  const exportBackupJson = useCallback(
    async (options?: { passphrase?: string }): Promise<{ fileCount: number }> => {
      const payload = {
        app: 'Central de Estudos',
        exportedAt: new Date().toISOString(),
        data: db,
      };
      const plainJson = JSON.stringify(payload, null, 2);
      const cleanPass = options?.passphrase?.trim() || '';
      let outputText = plainJson;
      let filename = `backup_central_estudos_${localDateIso()}.json`;
      if (cleanPass) {
        const encryptedEnvelope = await encryptBackupJson(plainJson, cleanPass);
        outputText = JSON.stringify(encryptedEnvelope, null, 2);
        filename = `backup_criptografado_central_estudos_${localDateIso()}.json`;
      }
      triggerBlobDownload(new Blob([outputText], { type: 'application/json;charset=utf-8' }), filename);
      const itemCount =
        db.questions.length +
        db.completedSimulations.length +
        db.annotations.length +
        db.caseLaw.length +
        Object.keys(db.laws).length;
      toast(
        cleanPass
          ? `Backup criptografado (AES-256-GCM) exportado com sucesso (${filename}).`
          : `Backup exportado com sucesso (${filename}).`,
      );
      return { fileCount: itemCount };
    },
    [db, toast],
  );

  const importBackupJson = useCallback(
    async (file: File, options?: { passphrase?: string }) => {
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Selecione um arquivo de backup .json.');
      }
      const raw = await file.text();
      let parsed = JSON.parse(raw) as unknown;
      if (isEncryptedBackupEnvelope(parsed)) {
        const decryptedText = await decryptBackupEnvelope(parsed, options?.passphrase || '');
        parsed = JSON.parse(decryptedText) as unknown;
      }
      if (isIncrementalBackupPayload(parsed)) {
        const merged = applyIncrementalDeltaToDatabase(dbRef.current, parsed);
        setDb(merged);
        toast('Backup incremental mesclado com sucesso sem apagar os demais dados!');
        return;
      }
      const parsedObj = parsed as { data?: Partial<StudyDatabase> } | Partial<StudyDatabase>;
      const dataObj: Partial<StudyDatabase> =
        parsedObj && typeof parsedObj === 'object' && 'data' in parsedObj && parsedObj.data
          ? parsedObj.data
          : (parsedObj as Partial<StudyDatabase>);
      if (!dataObj || !Array.isArray(dataObj.questions)) {
        throw new Error('O arquivo selecionado não contém uma estrutura válida da Central de Estudos.');
      }
      const merged = normalizeAndMergeDatabase(dataObj);
      setDb(merged);
      toast('Backup restaurado com sucesso.');
    },
    [setDb, toast],
  );

  const resetDemoData = useCallback(async () => {
    const ok = await requestConfirm({
      title: 'Restaurar dados iniciais',
      description:
        'Esta ação substituirá os registros atuais pelos dados iniciais de exemplo. Deseja continuar?',
      confirmLabel: 'Restaurar dados',
      danger: true,
    });
    if (!ok) return;
    if (contestTxtSyncTimerRef.current) {
      window.clearTimeout(contestTxtSyncTimerRef.current);
      contestTxtSyncTimerRef.current = null;
    }
    if (scheduleTxtSyncTimerRef.current) {
      window.clearTimeout(scheduleTxtSyncTimerRef.current);
      scheduleTxtSyncTimerRef.current = null;
    }
    const scope = activeScopeRef.current || 'offline_guest';
    clearDeletedTombstones(scope);
    clearDeletedTombstones('offline_guest');
    clearPendingDriveDeletes(scope);
    clearPendingDriveDeletes('offline_guest');
    lastDeletionMsRef.current = 0;
    await clearAllFileBlobs();
    await ensureSeededBlobs();
    setDb(createInitialDatabase());
    setQuiz(null);
    toast('Dados iniciais restaurados com segurança.');
  }, [requestConfirm, toast]);

  const testLocalIntegrity = useCallback(() => {
    const totalRecords =
      db.questions.length +
      db.submittedSimulations.length +
      db.completedSimulations.length +
      db.history.length +
      db.annotations.length +
      db.caseLaw.length +
      db.contests.length +
      Object.keys(db.laws).length;
    toast(`Armazenamento local íntegro · ${totalRecords} registros verificados.`);
    return { status: 'OK', totalRecords };
  }, [db, toast]);

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    setDb((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, ...patch },
    }));
  }, []);

  const updateModuleVisibility = useCallback(
    (moduleName: string, key: keyof ModuleVisibility, value: boolean) => {
      setDb((prev) => {
        const current = prev.preferences.modules?.[moduleName] || {
          hide_upload: false,
          hide_search: false,
        };
        return {
          ...prev,
          preferences: {
            ...prev.preferences,
            modules: {
              ...(prev.preferences.modules || {}),
              [moduleName]: { ...current, [key]: value },
            },
          },
        };
      });
    },
    [],
  );

  return (
    <StudyContext.Provider
      value={{
        db,
        activePage,
        setActivePage: (p) => {
          setActivePage(p);
          setMobileOpen(false);
        },
        lawDeepLink,
        openLawAt: (folder, search, options) => {
          setLawDeepLink({
            folder,
            search,
            tab: options?.tab,
            onlyMatches: options?.onlyMatches,
            nonce: Date.now(),
          });
          setActivePage('Lei Seca');
          setMobileOpen(false);
        },
        clearLawDeepLink: () => setLawDeepLink(null),
        selectedEditalContestId,
        setSelectedEditalContestId,
        openContestEdital,
        mobileOpen,
        setMobileOpen,
        toasts,
        toast,
        dismissToast,
        confirmDialog,
        requestConfirm,
        focusQuote,
        changeFocusQuote,
        nowTick,
        timerSeconds,
        getCurrentTimerSeconds,
        timerRunning,
        toggleTimer,
        resetTimer,
        ensureTimerRunning,
        pomodoroMode,
        pomodoroPhase,
        pomodoroRemainingSeconds,
        setPomodoroMode,
        activeTimerTopic,
        linkTimerToScheduleTopic,
        clearTimerLink,
        commitTimerToSchedule,
        logQuickStudyMinutes,
        deleteStudyTimeRecord,
        disciplines,
        fixedSubjects,
        addFixedSubject,
        renameFixedSubject,
        removeFixedSubject,
        questionsByDiscipline,
        allQuestions,
        allErrorEntries,
        moduleVisibility,
        quiz,
        setQuiz,
        submitQuizAnswer,
        changeQuizAnswer,
        advanceQuizQuestion,
        previousQuizQuestion,
        goToQuizQuestion,
        finishQuizSession,
        cancelQuizSession,
        retryRecordStudyTime,
        retryArchiveSimulation,
        deleteSubmittedSimulation,
        updateQuestion,
        deleteQuestion,
        addAnnotation,
        updateAnnotation,
        updateErrorEntrySubject,
        deleteAnnotation,
        markAnnotationCorrected,
        reopenAnnotation,
        toggleAnnotationCorrected,
        advanceErrorReview,
        startErrorNotebookQuiz,
        saveCaseLaw,
        deleteCaseLaw,
        addContest,
        updateContest,
        toggleContestPayment,
        deleteContest,
        saveContestEditalPoints,
        importContestEditalFile,
        toggleContestEditalPoint,
        setContestEditalPointsStudied,
        updateContestEditalPoint,
        deleteContestEditalPoint,
        linkEditalPointToLaw,
        unlinkEditalPointFromLaw,
        clearContestEdital,
        syncContestsAndEditaisTxtToFolder,
        importContestsOrEditalTxtFile,
        saveScheduleDay,
        setScheduleDayDate,
        applyScheduleWeekDates,
        saveScheduleWeekToTxtFolder,
        loadSavedScheduleWeek,
        deleteSavedScheduleWeek,
        addTopicToDay,
        deleteScheduleTopic,
        completeScheduleTopic,
        archiveTopicAsIncomplete,
        archiveFullWeek,
        importScheduleTxt,
        deleteCompletedGoal,
        updateCompletedGoal,
        reopenCompletedGoal,
        saveWeeklyGoalNote,
        completeIncompleteGoal,
        deleteIncompleteGoal,
        createLawFolder,
        uploadLawFile,
        reprocessLawFolder,
        deleteLawFolder,
        deleteLawPdf,
        addManualLawItem,
        updateLawItem,
        deleteLawItem,
        toggleLawItemRead,
        markLawItemsRead,
        addLawReadDate,
        removeLawReadDate,
        addLawItemReadDate,
        removeLawItemReadDate,
        setLawLastPosition,
        saveIncidenceFilter,
        deleteIncidenceFilter,
        addLawHighlight,
        cycleLawHighlightColor,
        removeLawHighlightText,
        removeLastLawHighlight,
        saveLawNote,
        createPdfFolder,
        renamePdfFolder,
        uploadPersonalPdfs,
        replacePersonalPdf,
        savePdfAnnotations,
        commitAnnotatedPersonalPdf,
        deletePersonalPdf,
        deletePdfFolder,
        createSummaryFolder,
        uploadSummaryFile,
        deleteSummaryFile,
        createProofBank,
        uploadProofOnly,
        uploadProofWithAnswer,
        replaceProofPdf,
        deleteProofFile,
        updateProofObservations,
        addOrUpdateProofCorrection,
        deleteProofCorrection,
        submitEssay,
        updateEssayCorrection,
        deleteEssay,
        addCriticalPoint,
        deleteCriticalPoint,
        importQuestionsTxt,
        addManualQuestion,
        convertLawPdf,
        convertExamPdf,
        convertExamToStructuredTxt,
        exportBackupJson,
        importBackupJson,
        resetDemoData,
        testLocalIntegrity,
        updatePreferences,
        updateModuleVisibility,
        lastLocalWriteMs,
        googleUser,
        driveConnected,
        driveTokenReady,
        isRenewingDriveToken,
        driveFolderUrl,
        activeDriveFolderId,
        activeDriveFolderName,
        lastCloudSyncAt,
        lastCacheVerifiedAt,
        isSyncingDrive,
        hasPendingCloudChanges,
        drivePermissionNeedsPicker,
        authorizeDriveFolderViaPicker,
        restoreProgress,
        authError,
        connectGoogleDrive,
        disconnectGoogleDrive,
        clearDriveBrowserCache,
        selectDriveStudyFolder,
        syncAllLocalFilesToDrive,
        restoreAllFromGoogleDrive,
        pickDriveFolderOrFiles,
        inspectDriveFolders,
        importDriveFolderFiles,
        recoverFileFromDrive,
        saveCloudBackup,
        listCloudBackups,
        restoreCloudBackup,
        deleteCloudBackup,
        pruneOldCloudBackups,
        syncActivityLogs,
        clearSyncActivityLogs,
        gasSession,
        gasConnected,
        gasApiUrl: gasApiUrl || GAS_DEFAULT_API_URL,
        gasConnectionHealth,
        checkGasConnectionNow,
        forceReconnectAppsScript,
        setGasApiUrl,
        connectAppsScript,
        disconnectAppsScript,
        testAppsScriptConnection,
        setAppsScriptStudyFolder,
        setupAppsScriptDailyBackup,
        gasOperationQueue,
        gasQueueProcessing,
        localGasAuditLogs,
        processGasQueueNow,
        removeGasQueueItem,
        clearFailedGasQueueItems,
        fetchGasAuditLogs,
        activeSyncState,
        verifyActiveSyncChecksumNow,
        triggerActiveSyncPushNow,
        conflictHistory,
        latestVersionComparison,
        isCheckingDivergence,
        resolvingConflictAction,
        checkLocalVsDriveDivergence,
        resolveVersionDivergenceKeepLocal,
        resolveVersionDivergenceKeepDrive,
        dismissConflictHistoryEntry,
        clearResolvedConflictHistory,
        driveSyncConflicts,
        driveConflictErrors,
        resolvingDriveConflictId,
        resolveDriveConflictRemoveCloud,
        authorizeAndRemoveDriveConflict,
        ignoreDriveConflict,
        resolveDriveConflictRestoreLocal,
        resolveAllDriveConflictsRemoveCloud,
        resolveAllDriveConflictsRestoreLocal,
        dismissDriveSyncConflicts,
        checkDriveTimestampConflictsNow,
        driveUploadOutboxItems,
        driveUploadOutboxCount: driveUploadOutboxItems.length,
        flushDriveUploadOutboxNow,
        localRestorePoints,
        createManualRestorePoint,
        restoreFromLocalRestorePoint,
        deleteLocalRestorePointById,
        examFocusMode,
        setExamFocusMode,
      }}
    >
      {children}
    </StudyContext.Provider>
  );
};

export function useStudy(): StudyContextValue {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('useStudy deve ser usado dentro de StudyProvider.');
  return ctx;
}
