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
  loadLocalDirectoryHandle,
  loadScopedDatabaseJson,
  loadScopedSyncMeta,
  saveFileBlob,
  saveScopedDatabaseJson,
  saveScopedSyncMeta,
  StoredDatabaseSnapshot,
  triggerBlobDownload,
  setStorageUserScope,
} from '../lib/fileStorage';
import {
  CANONICAL_LOCAL_SUBFOLDERS,
  deleteDirectoryFromLocalDirectory,
  deleteFileFromLocalDirectory,
  deleteLocalBackupFile,
  ensureLocalStudySubfolders,
  extractLatestBackupFromLocalFiles,
  forgetSavedLocalDirectory,
  listLocalFolderBackups,
  loadSavedLocalFolderMeta,
  LocalBackupFileInfo,
  LocalDiskFileEntry,
  LocalFolderScanSummary,
  pickLocalStudyDirectory,
  readLocalBackupFile,
  reconnectSavedLocalDirectory,
  saveLocalFolderBackupFile,
  saveLocalFolderSyncSnapshot,
  scanDirectoryHandle,
  scanFileListFromInput,
  toDriveCompatibleEntries,
  writeFileToLocalDirectory,
} from '../lib/localFolderSync';
import { User } from 'firebase/auth';
import {
  CLOUD_SYNC_FILENAME,
  DEFAULT_STUDY_FOLDER_ID,
  DRIVE_FOLDER_NAME,
  initDriveAuth,
  googleSignIn,
  googleSignOut,
  getOrCreateStudyFolder,
  syncStudySubFoldersInDrive,
  uploadFileToDrive,
  upsertTextFileInDriveSubFolder,
  getAccessToken,
  clearAccessTokenOnly,
  subscribeDriveTokenChanges,
  refreshDriveAccessTokenSilently,
  ensureFirebaseSessionAlive,
  isDriveAccessTokenExpiringSoon,
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
  getPreferredStudyFolder,
  setPreferredStudyFolder,
  getKnownStudyDriveFolderNames,
  rememberKnownStudyDriveFolderName,
  getDriveFolderMetadata,
  verifyDriveFolderWritable,
  extractDriveFolderId,
  openDrivePicker,
  auth,
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
  splitExamQuestion,
  splitLawDevices,
  uid,
  visibleName,
} from '../lib/parsers';
import {
  applyIncrementalDeltaToDatabase,
  buildIncrementalDatabaseBackup,
  computeDatabaseContentHash,
  isIncrementalBackupPayload,
} from '../lib/incrementalBackup';
import {
  extractTextFromPdfFile,
  readAnswerKeyInput,
  readStudyBlobText,
  readStudyTextFile,
} from '../lib/pdfExtract';
import {
  loadDatabaseFromSupabase,
  saveDatabaseToSupabase,
  supabaseGoogleSignIn,
  supabaseSignOut,
  loadDatabaseFromFirestore,
  saveDatabaseToFirestore,
  syncTimerStateToFirestore,
  subscribeToFirestoreWorkspace,
  ParsedFirestoreError,
  parseFirestoreError,
  FirestoreAuthHealthReport,
  validateFirestoreAuthConnection,
  getFirestoreConfigDiagnostics,
  FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
  executeWithFirebaseBackoff,
  decomposeDatabaseToFirestoreChunks,
  clearUserFirestoreCacheState,
} from '../lib/supabaseSync';
import { supabase } from '../lib/supabase';
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
  LawItem,
  LawPdfEntry,
  LawReadingEntry,
  ModuleName,
  ModuleVisibility,
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

export function getUserScopeKey(user: { uid?: string; email?: string | null } | null): string {
  if (!user) return 'offline_guest';
  if (user.uid && user.uid.trim()) return `user_${user.uid.trim()}`;
  if (user.email && user.email.trim()) {
    const clean = user.email.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
    return `user_${clean}`;
  }
  return 'offline_guest';
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
    // Keep a secondary redundant recovery copy in localStorage when payload fits comfortably (<1.8 MB)
    if (serialized.length < 1_800_000) {
      try {
        localStorage.setItem(backupKey, serialized);
      } catch {
        try {
          localStorage.removeItem(backupKey);
        } catch {
          // ignore
        }
      }
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

export interface FirestoreConnectionMonitorState {
  status: 'idle' | 'healthy' | 'warning' | 'expired' | 'inconsistent';
  code: string | null;
  message: string | null;
  lastCheckedAt: string | null;
  tokenExpiresAt: string | null;
  consecutiveFailures: number;
  oauthDriveExpired: boolean;
  dismissed: boolean;
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
  addLawHighlight: (folder: string, text: string, color: HighlightColorKey) => void;
  removeLastLawHighlight: (folder: string) => void;

  // Personal PDFs
  createPdfFolder: (name: string) => string;
  renamePdfFolder: (oldName: string, newName: string) => string;
  uploadPersonalPdfs: (folder: string, files: File[]) => Promise<number>;
  replacePersonalPdf: (folder: string, fileId: string, replacement: File) => Promise<void>;
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
  exportBackupJson: () => { fileCount: number };
  importBackupJson: (file: File) => Promise<void>;
  resetDemoData: () => Promise<void>;
  testLocalIntegrity: () => { status: string; totalRecords: number };
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  updateModuleVisibility: (moduleName: string, key: keyof ModuleVisibility, value: boolean) => void;

  // Firebase Firestore Cloud Database integration
  firebaseConnected: boolean;
  isSyncingFirebase: boolean;
  lastFirebaseSyncAt: string | null;
  firebaseChunkCount: number;
  firebaseLastError: ParsedFirestoreError | null;
  clearFirebaseError: () => void;
  firestoreConnectionMonitor: FirestoreConnectionMonitorState;
  validateFirestoreConnectionNow: (options?: { silent?: boolean }) => Promise<FirestoreAuthHealthReport | null>;
  dismissFirestoreConnectionAlert: () => void;
  syncNowWithFirebase: (options?: { forceFullWrite?: boolean; silent?: boolean }) => Promise<boolean>;
  restoreFromFirebase: () => Promise<boolean>;
  migrateDriveToFirebase: () => Promise<boolean>;

  // Google Drive integration
  googleUser: User | null;
  driveConnected: boolean;
  driveTokenReady: boolean;
  isRenewingDriveToken: boolean;
  driveFolderUrl: string | null;
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

  // Local Folder (Computer Directory) integration
  localFolderConnected: boolean;
  localFolderWritable: boolean;
  localFolderName: string | null;
  localFolderSummary: LocalFolderScanSummary | null;
  savedLocalFolderMeta: LocalFolderScanSummary | null;
  hasSavedLocalFolderHandle: boolean;
  lastLocalFolderSyncAt: string | null;
  lastLocalIncrementalBackupAt: string | null;
  isSyncingLocalFolder: boolean;
  connectLocalStudyFolder: () => Promise<{ ok: boolean; needsInputFallback?: boolean; aborted?: boolean }>;
  reconnectLocalStudyFolder: () => Promise<boolean>;
  importLocalStudyFolderFromFiles: (files: FileList | File[]) => Promise<boolean>;
  syncNowWithLocalStudyFolder: () => Promise<boolean>;
  disconnectLocalStudyFolder: (forgetSaved?: boolean) => Promise<void>;
  saveLocalIncrementalBackupNow: () => Promise<boolean>;
  listLocalBackups: () => Promise<LocalBackupFileInfo[]>;
  restoreLocalBackup: (backup: LocalBackupFileInfo) => Promise<boolean>;
  deleteLocalBackup: (backup: LocalBackupFileInfo) => Promise<boolean>;
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

  const loadedAnnotations = [...(dataObj.annotations || seed.annotations || [])];
  const existingIds = new Set(loadedAnnotations.map((a) => a.id));

  // Reconcile completed simulations errors into annotations (Pendentes de Correção)
  (dataObj.completedSimulations || []).forEach((sim) => {
    (sim.questoes || []).forEach((q) => {
      if (!q.correta && Boolean(q.resposta)) {
        const simErrId = `sim-err-${sim.id}-${q.numero}`;
        if (!existingIds.has(simErrId)) {
          const split = splitExamQuestion(q.enunciado);
          const alternatives = q.alternativas?.length ? q.alternativas : split.alternatives;
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
              enunciado: q.alternativas?.length ? q.enunciado : split.statement,
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

  const normalizedContests = (dataObj.contests || seed.contests || []).map((c) => ({
    ...c,
    edital_pontos: Array.isArray(c.edital_pontos)
      ? c.edital_pontos
          .map((p) => {
            const rawLinks = Array.isArray(p.artigos_vinculados) ? p.artigos_vinculados : [];
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
          .filter((p) => Boolean(p.titulo))
      : [],
  }));

  const normalizedLawReadDates: Record<string, LawReadingEntry[]> = {};
  Object.entries(dataObj.lawReadDates || {}).forEach(([folder, list]) => {
    if (Array.isArray(list)) {
      normalizedLawReadDates[folder] = list
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
  const rawLaws = dataObj.laws && typeof dataObj.laws === 'object' ? dataObj.laws : seed.laws || {};
  const normalizedLaws: Record<string, LawFolderData> = {};
  const normalizedLawHighlights = { ...(seed.lawHighlights || {}), ...(dataObj.lawHighlights || {}) };
  const normalizedReadLawItems = { ...(seed.readLawItems || {}), ...(dataObj.readLawItems || {}) };
  const normalizedLawLastReadPosition: Record<string, string> = {
    ...(seed.lawLastReadPosition || {}),
    ...(dataObj.lawLastReadPosition || {}),
  };

  const dropLawFolderMetadata = (folderKey: string) => {
    delete normalizedLawHighlights[folderKey];
    delete normalizedReadLawItems[folderKey];
    delete normalizedLawReadDates[folderKey];
    delete normalizedLawLastReadPosition[folderKey];
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

    const rawItems = Array.isArray(val.items) ? val.items : [];
    const rawPdfs = Array.isArray(val.pdfs) ? val.pdfs : [];
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
      const existingReadSet = new Set(normalizedReadLawItems[only.key] || []);
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

      if (normalizedLawHighlights[loser.key]?.length) {
        normalizedLawHighlights[winner.key] = [
          ...(normalizedLawHighlights[winner.key] || []),
          ...normalizedLawHighlights[loser.key],
        ];
      }
      delete normalizedLawHighlights[loser.key];

      if (normalizedReadLawItems[loser.key]?.length) {
        normalizedReadLawItems[winner.key] = Array.from(
          new Set([...(normalizedReadLawItems[winner.key] || []), ...normalizedReadLawItems[loser.key]]),
        );
      }
      delete normalizedReadLawItems[loser.key];

      if (normalizedLawReadDates[loser.key]?.length) {
        normalizedLawReadDates[winner.key] = [
          ...(normalizedLawReadDates[winner.key] || []),
          ...normalizedLawReadDates[loser.key],
        ];
      }
      delete normalizedLawReadDates[loser.key];

      if (normalizedLawLastReadPosition[loser.key] && !normalizedLawLastReadPosition[winner.key]) {
        normalizedLawLastReadPosition[winner.key] = normalizedLawLastReadPosition[loser.key];
      }
      delete normalizedLawLastReadPosition[loser.key];
    }

    const healedMergedItems = healAndNormalizeLawItems(mergedItems);
    const winnerReadSet = new Set(normalizedReadLawItems[winner.key] || []);
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

  const normalizedSavedFilters: SavedIncidenceFilter[] = Array.isArray(
    dataObj.savedIncidenceFilters,
  )
    ? dataObj.savedIncidenceFilters
        .filter((f) => Boolean(f && f.nome && f.pastaLei))
        .map((f) => ({
          id: f.id || uid(10),
          nome: String(f.nome).trim(),
          pastaLei: String(f.pastaLei).trim(),
          gradeFilter: f.gradeFilter || 'Todas',
          readStatusFilter: f.readStatusFilter || 'all',
          editalContestId: f.editalContestId || 'all',
          multiArticleQuery: String(f.multiArticleQuery || ''),
          selectedArticleKeys: Array.isArray(f.selectedArticleKeys) ? f.selectedArticleKeys : [],
          search: String(f.search || ''),
          criado_em: f.criado_em || localDateTimeBrazilian(),
        }))
    : seed.savedIncidenceFilters || [];

  const normalizedFixedSubjects = Array.from(
    new Set(
      (Array.isArray(dataObj.fixedSubjects)
        ? dataObj.fixedSubjects
        : DEFAULT_FIXED_SUBJECTS
      )
        .map((s) => visibleName(String(s || '')))
        .filter(Boolean),
    ),
  );

  const normalizedSubmittedSimulations = (
    Array.isArray(dataObj.submittedSimulations)
      ? dataObj.submittedSimulations
      : seed.submittedSimulations || []
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

  const normalizedProofFiles = (
    Array.isArray(dataObj.proofFiles)
      ? dataObj.proofFiles
      : seed.proofFiles || []
  ).filter((pf) => {
    if (!pf || typeof pf !== 'object') return false;
    const obsPath = extractSourcePathFromObs(pf.observacoes);
    const pathHint = [pf.bank, obsPath].filter(Boolean).join(' / ');
    return !(
      isScheduleTxtDescriptor(pf.name, pathHint) ||
      isContestOrEditalTxtDescriptor(pf.name, pathHint)
    );
  });

  return {
    ...seed,
    ...dataObj,
    laws: normalizedLaws,
    submittedSimulations: normalizedSubmittedSimulations,
    proofFiles: normalizedProofFiles,
    lawHighlights: normalizedLawHighlights,
    readLawItems: normalizedReadLawItems,
    lawLastReadPosition: normalizedLawLastReadPosition,
    savedIncidenceFilters: normalizedSavedFilters,
    fixedSubjects: normalizedFixedSubjects,
    contests: normalizedContests,
    lawReadDates: normalizedLawReadDates,
    annotations: loadedAnnotations,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...(dataObj.preferences || {}),
      modules: { ...(dataObj.preferences?.modules || {}) },
    },
    schedule: {
      ...seed.schedule,
      ...(dataObj.schedule || {}),
    },
    scheduleDayDates: {
      ...(seed.scheduleDayDates || {}),
      ...(dataObj.scheduleDayDates || {}),
    },
    weeklySchedules: {
      ...(dataObj.weeklySchedules || {}),
    },
  };
}

function loadStoredDatabase(scope: string): StudyDatabase {
  const tryParseRaw = (raw: string | null): StudyDatabase | null => {
    if (!raw) return null;
    try {
      return normalizeAndMergeDatabase(JSON.parse(raw));
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
): Promise<{ uploadedCount: number; uploadedFiles: DriveFileInfo[] }> {
  const toDriveSeg = (raw: string) => visibleName(raw).replace(/[\\/]+/g, ' - ').trim();
  const blobMeta = new Map<
    string,
    { filename: string; altNames?: string[]; subfolder?: string | string[] }
  >();

  const knownBackupRoots = [
    getPreferredStudyFolder().name,
    ...getKnownStudyDriveFolderNames(),
  ];

  Object.entries(targetDb.pdfFolders || {}).forEach(([folderKey, list]) => {
    if (isReservedBackupFolderName(folderKey, knownBackupRoots, list)) return;
    list.forEach((f) =>
      blobMeta.set(f.blobKey, {
        filename: f.name,
        subfolder: ['PDFs Pessoais', toDriveSeg(folderKey)].filter(Boolean),
      }),
    );
  });
  Object.entries(targetDb.summaryFolders || {}).forEach(([folderKey, list]) =>
    list.forEach((s) =>
      blobMeta.set(s.blobKey, {
        filename: s.name,
        altNames: [`RESUMO - ${s.name}`],
        subfolder: ['Resumos e Mapas', toDriveSeg(folderKey)].filter(Boolean),
      }),
    ),
  );
  Object.entries(targetDb.laws || {}).forEach(([folderKey, folderObj]) =>
    (folderObj.pdfs || []).forEach((p) =>
      blobMeta.set(p.blobKey, {
        filename: p.name,
        altNames: [`LEI - ${p.name}`],
        subfolder: ['Lei Seca', toDriveSeg(folderKey)].filter(Boolean),
      }),
    ),
  );
  (targetDb.proofFiles || []).forEach((pf) =>
    blobMeta.set(pf.blobKey, {
      filename: pf.name,
      altNames: [`PROVA - ${pf.name}`],
      subfolder:
        pf.bank && pf.bank !== 'Geral'
          ? ['Provas e Gabaritos', toDriveSeg(pf.bank)]
          : 'Provas e Gabaritos',
    }),
  );
  (targetDb.essays || []).forEach((e) => {
    blobMeta.set(e.original_blobKey, {
      filename: `DISCURSIVA - ${e.original_arquivo}`,
      altNames: [e.original_arquivo],
      subfolder: 'Discursivas',
    });
    if (e.corrigido_blobKey && e.corrigido_arquivo) {
      blobMeta.set(e.corrigido_blobKey, {
        filename: `CORRECAO - ${e.corrigido_arquivo}`,
        altNames: [e.corrigido_arquivo],
        subfolder: 'Discursivas',
      });
    }
  });

  if (blobMeta.size === 0) return { uploadedCount: 0, uploadedFiles: [] };

  const existingNamesLower = new Set(driveFiles.map((f) => normalizeFileLookup(f.name)));
  const existingStrippedLower = new Set(
    driveFiles.map((f) => normalizeFileLookup(stripDrivePrefix(f.name))),
  );
  const allBlobs = await getAllFileBlobs();
  let uploadedCount = 0;
  const uploadedFiles: DriveFileInfo[] = [];

  for (const item of allBlobs) {
    const mapped = blobMeta.get(item.key);
    if (!mapped) continue;
    const candidates = [mapped.filename, ...(mapped.altNames || [])];
    const alreadyExists = candidates.some((c) => {
      const norm = normalizeFileLookup(c);
      const stripped = normalizeFileLookup(stripDrivePrefix(c));
      return existingNamesLower.has(norm) || existingStrippedLower.has(stripped);
    });
    if (alreadyExists) continue;

    try {
      const uploaded = await uploadFileToDrive(item.blob, mapped.filename, token, mapped.subfolder);
      existingNamesLower.add(normalizeFileLookup(mapped.filename));
      existingStrippedLower.add(normalizeFileLookup(stripDrivePrefix(mapped.filename)));
      uploadedFiles.push(uploaded);
      uploadedCount += 1;
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) throw err;
      console.warn(`[Login Sync Drive] Falha ao enviar ${mapped.filename} para o Drive:`, err);
    }
  }

  return { uploadedCount, uploadedFiles };
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
    localFileMap?: Map<string, File>;
  },
): Promise<{
  updatedDb: StudyDatabase;
  filesRestored: number;
  orphansImported: number;
  healedLawsCount: number;
  permissionBlockedCount: number;
}> {
  if (!driveFiles.length) {
    return {
      updatedDb: targetDb,
      filesRestored: 0,
      orphansImported: 0,
      healedLawsCount: 0,
      permissionBlockedCount: 0,
    };
  }

  // Index Drive files by normalized exact name, stripped name, and Drive file ID (preferring active/selected folder)
  const driveByName = new Map<string, DriveFileInfo>();
  const driveByStripped = new Map<string, DriveFileInfo>();
  const driveById = new Map<string, DriveFileInfo>();

  const matchesPreferredFolder = (df: DriveFileInfo) =>
    Boolean(
      options?.onlyFolderId &&
        options.onlyFolderId !== 'all' &&
        (df.parents?.includes(options.onlyFolderId) ||
          df.ancestorFolderIds?.includes(options.onlyFolderId)),
    );

  const orderedDriveFiles = options?.onlyFolderId
    ? [...driveFiles].sort((a, b) => Number(matchesPreferredFolder(b)) - Number(matchesPreferredFolder(a)))
    : driveFiles;

  orderedDriveFiles.forEach((df) => {
    driveById.set(df.id, df);
    const norm = normalizeFileLookup(df.name);
    if (!driveByName.has(norm)) driveByName.set(norm, df);
    const stripped = normalizeFileLookup(stripDrivePrefix(df.name));
    if (stripped && !driveByStripped.has(stripped)) driveByStripped.set(stripped, df);
  });

  const matchedDriveFileIds = new Set<string>();
  const knownFileNames = new Set<string>();
  let filesRestored = 0;
  let permissionBlockedCount = 0;

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
    return false;
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

  const tryRestoreBlob = async (blobKey: string | undefined, candidates: string[], mimeHint?: string) => {
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

    // When lazyBinaryBlobs or skipTargetDbBlobs is enabled (e.g. instant login hydration),
    // we register the file in knownFileNames/matchedDriveFileIds and skip downloading the binary blob.
    // The PDF/file binary will be downloaded on-demand via recoverFileFromDrive only when the user opens it.
    if (skipBlobDownload) {
      return;
    }

    const existing = await getFileBlob(blobKey, scope);
    if (existing && existing.size > 0) {
      emitProgress(candidates[0] || 'Arquivo local verificado');
      return;
    }

    if (match) {
      emitProgress(`Carregando ${stripDrivePrefix(match.name) || match.name}`);
      try {
        const localFile = options?.localFileMap?.get(match.id);
        const blob =
          localFile ||
          (token ? await downloadDriveFileBlob(match.id, token, mimeHint || match.mimeType) : null);
        if (!blob) return;
        await saveFileBlob(blobKey, blob, scope);
        filesRestored += 1;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) throw err;
        if (msg.includes('PICKER_FILE_PERMISSION')) permissionBlockedCount += 1;
        console.warn(`Falha ao carregar ${match.name}:`, err);
      }
    }
  };

  // Always index known files from targetDb (and download blobs only if skipBlobDownload is false)
  // 1. PDFs Pessoais
  for (const files of Object.values(targetDb.pdfFolders || {})) {
    for (const f of files) {
      await tryRestoreBlob(f.blobKey, [f.name, f.blobKey, `${f.blobKey}.pdf`], 'application/pdf');
    }
  }

  // 2. Resumos e Mapas
  for (const files of Object.values(targetDb.summaryFolders || {})) {
    for (const s of files) {
      await tryRestoreBlob(
        s.blobKey,
        [`RESUMO - ${s.name}`, s.name, s.blobKey, `${s.blobKey}.pdf`],
        s.mimeType,
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
    );
    if (e.corrigido_blobKey && e.corrigido_arquivo) {
      await tryRestoreBlob(
        e.corrigido_blobKey,
        [`CORRECAO - ${e.corrigido_arquivo}`, e.corrigido_arquivo, e.corrigido_blobKey, `${e.corrigido_blobKey}.pdf`],
        e.corrigido_mime,
      );
    }
  }

  // 6. Recover orphaned/unlinked study files in Drive folders
  let nextDb: StudyDatabase = targetDb;
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

  const onlyFileIdSet = options?.onlyFileIds?.length ? new Set(options.onlyFileIds) : null;

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
      const localFile = options?.localFileMap?.get(gdf.id);
      const gBlob =
        localFile || (token ? await downloadDriveFileBlob(gdf.id, token, gdf.mimeType) : null);
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
      return !isBackupFile(df) && isSupportedRestorableStudyFile(df);
    }
    if (!inSelectedFolder(df)) return false;
    if (matchedDriveFileIds.has(df.id)) return false;
    if (isBackupFile(df)) return false;
    if (!isSupportedRestorableStudyFile(df)) return false;
    if (isGabaritoFilename(df.name)) return false;
    if (options?.lazyBinaryBlobs && dbAlreadyHydrated && knownSyncedIds?.has(df.id)) return false;

    const normName = normalizeFileLookup(df.name);
    const normStripped = normalizeFileLookup(stripDrivePrefix(df.name));
    if (knownFileNames.has(normName) || knownFileNames.has(normStripped)) return false;

    if (options?.onlyFolderId || options?.importFromAnyFolder) return true;
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

        // When lazyBinaryBlobs is active, binary PDFs/images are cataloged by metadata without downloading the file blob on login
        const needsBlobForParsing = isTxtOrMd || isLaw;
        let blob: Blob | null = null;
        if (!options?.lazyBinaryBlobs || needsBlobForParsing) {
          emitProgress(`Importando ${cleanName}`);
          const localFile = options?.localFileMap?.get(df.id);
          blob =
            localFile || (token ? await downloadDriveFileBlob(df.id, token, df.mimeType) : null);
          if (!blob) continue;
        }
        const blobKey = options?.localFileMap ? `local_${uid(14)}` : `drive_${df.id}`;
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
            const simSubject = visibleName(bankName === 'Pasta Local' || bankName === 'Recuperadas do Drive' ? displayBaseName(cleanName) : bankName) || displayBaseName(cleanName) || 'Geral';
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
            items: shouldAppendParsedItems ? [...existingFolder.items, ...parsedItems] : existingFolder.items,
            pdfs: updatedPdfs,
          };
          orphansImported += 1;
        } else if (isProof) {
          const bankName =
            extractNestedFolderName(df, 'Provas e Gabaritos') ||
            (options?.localFileMap ? 'Pasta Local' : 'Recuperadas do Drive');
          const sourceLabel = options?.localFileMap
            ? `Arquivo importado da pasta local (${df.folderPath || 'Pasta Local'}).`
            : `Arquivo restaurado do Google Drive (${df.folderPath || 'Drive'}).`;

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
            feedback: options?.localFileMap
              ? 'Recuperada automaticamente da pasta local.'
              : 'Recuperada automaticamente do Google Drive.',
          });
          orphansImported += 1;
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
              options?.localFileMap ? 'Pasta Local' : 'Recuperadas do Drive',
              options?.localFileMap
                ? `Prova .txt importada da pasta local (${df.folderPath || 'Pasta Local'}).`
                : `Prova .txt restaurada do Drive (${df.folderPath || 'Drive'}).`,
            );
            orphansImported += 1;
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
                items: existingFolder.items.length ? existingFolder.items : detectedLaw,
                pdfs: [
                  ...existingFolder.pdfs,
                  { id: uid(10), name: cleanName, size: sizeNum, blobKey, createdAt: nowIso },
                ],
              };
              orphansImported += 1;
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
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) throw err;
        if (msg.includes('PICKER_FILE_PERMISSION')) permissionBlockedCount += 1;
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
        items: recoveredItems,
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
    return df.subfolderName === 'Cronogramas' || /^CRONOGRAMA\s*-\s*/i.test(df.name);
  });

  if (scheduleTxtDriveFiles.length > 0) {
    const nextWeeklySchedules: Record<string, WeeklyScheduleFileRecord> = {
      ...(nextDb.weeklySchedules || {}),
    };
    let latestRecoveredWeek: WeeklyScheduleFileRecord | null = null;
    let latestRecoveredMs = 0;

    for (const df of scheduleTxtDriveFiles) {
      try {
        const localFile = options?.localFileMap?.get(df.id);
        const blob =
          localFile || (token ? await downloadDriveFileBlob(df.id, token, df.mimeType) : null);
        if (!blob) continue;
        const text = await readStudyBlobText(blob, df.name);
        const parsedWeek = parseScheduleWeekText(text, df.name);
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
        if (!existingWeek || parsedTopicsCount >= existingTopicsCount) {
          nextWeeklySchedules[parsedWeek.weekKey] = {
            ...parsedWeek,
            blobKey,
          };
        }
        if (parsedTopicsCount > 0 && fileMs >= latestRecoveredMs) {
          latestRecoveredMs = fileMs;
          latestRecoveredWeek = nextWeeklySchedules[parsedWeek.weekKey];
        }
      } catch {
        // ignore unparseable schedule txt
      }
    }

    const currentScheduleHasCustom = WEEKDAYS.some((d) =>
      (nextDb.schedule?.[d] || []).some((t) => !/^sch-[1-8]$/.test(t.id || '')),
    );
    const activeWeekKey = resolveActiveScheduleWeekKey(nextDb.scheduleDayDates, nextDb.schedule);
    const matchingActiveWeek = nextWeeklySchedules[activeWeekKey] || latestRecoveredWeek;

    nextDb = {
      ...nextDb,
      weeklySchedules: nextWeeklySchedules,
      ...(!currentScheduleHasCustom && matchingActiveWeek
        ? {
            schedule: matchingActiveWeek.schedule,
            scheduleDayDates: matchingActiveWeek.scheduleDayDates,
          }
        : {}),
    };
  }

  const contestAndEditalTxtFiles = driveFiles.filter((df) => {
    if (!inSelectedFolder(df) || isBackupFile(df) || !shouldInspectDriveTxtOnAuth(df)) return false;
    const lower = df.name.toLowerCase();
    if (!lower.endsWith('.txt')) return false;
    return (
      df.subfolderName === 'Datas e Locais' ||
      df.subfolderName === 'Editais' ||
      /^(?:DATAS\s*E\s*LOCAIS|EDITAL)\s*-\s*/i.test(df.name)
    );
  });

  if (contestAndEditalTxtFiles.length > 0) {
    const mergedContests = [...(nextDb.contests || [])];
    let contestsChanged = false;

    for (const df of contestAndEditalTxtFiles) {
      try {
        const localFile = options?.localFileMap?.get(df.id);
        const blob =
          localFile || (token ? await downloadDriveFileBlob(df.id, token, df.mimeType) : null);
        if (!blob) continue;
        const text = await readStudyBlobText(blob, df.name);
        const parsedContests = parseContestOrEditalTxt(text, df.name);
        for (const pc of parsedContests) {
          const matchIdx = mergedContests.findIndex(
            (existing) =>
              (pc.id && existing.id === pc.id) ||
              normalizeSearch(existing.concurso) === normalizeSearch(pc.concurso),
          );
          if (matchIdx === -1) {
            mergedContests.push(pc);
            contestsChanged = true;
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
      } catch {
        // ignore unparseable contest/edital txt
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
    return (
      df.subfolderName === 'Questões' ||
      df.subfolderName === 'Provas e Gabaritos' ||
      /^PROVA\s*-\s*/i.test(df.name) ||
      lower.includes('_estruturada.')
    );
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

        const localFile = options?.localFileMap?.get(df.id);
        const blob =
          localFile || (token ? await downloadDriveFileBlob(df.id, token, df.mimeType) : null);
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
      } catch {
        // ignore unparseable question/exam txt
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

  return { updatedDb: nextDb, filesRestored, orphansImported, healedLawsCount, permissionBlockedCount };
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
  const [googleUser, setGoogleUser] = useState<User | null>(() => auth.currentUser);
  const initialScope = useMemo(() => getUserScopeKey(auth.currentUser), []);
  const activeScopeRef = useRef<string>(initialScope);

  // Set active storage scope immediately so blob reads/writes use active account
  if (typeof window !== 'undefined') {
    setStorageUserScope(activeScopeRef.current);
  }

  const [db, setDb] = useState<StudyDatabase>(() => loadStoredDatabase(initialScope));
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

  const [driveConnected, setDriveConnected] = useState<boolean>(false);
  const [driveTokenReady, setDriveTokenReady] = useState<boolean>(false);
  const [isRenewingDriveToken, setIsRenewingDriveToken] = useState<boolean>(false);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [activeDriveFolderName, setActiveDriveFolderName] = useState<string>(() => getPreferredStudyFolder().name);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(() => loadSyncMeta(initialScope).lastCloudSyncAt || null);
  const [lastCacheVerifiedAt, setLastCacheVerifiedAt] = useState<string | null>(
    () => loadSyncMeta(initialScope).lastCacheVerifiedAt || null,
  );
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
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

  // Firebase Firestore state
  const [isSyncingFirebase, setIsSyncingFirebase] = useState<boolean>(false);
  const [lastFirebaseSyncAt, setLastFirebaseSyncAt] = useState<string | null>(
    () => loadSyncMeta(initialScope).lastCloudSyncAt || null,
  );
  const [firebaseChunkCount, setFirebaseChunkCount] = useState<number>(() =>
    decomposeDatabaseToFirestoreChunks(db).length,
  );
  const [firebaseLastError, setFirebaseLastError] = useState<ParsedFirestoreError | null>(null);
  const [firestoreConnectionMonitor, setFirestoreConnectionMonitor] = useState<FirestoreConnectionMonitorState>({
    status: 'idle',
    code: null,
    message: null,
    lastCheckedAt: null,
    tokenExpiresAt: null,
    consecutiveFailures: 0,
    oauthDriveExpired: false,
    dismissed: false,
  });
  const firebaseSyncTimerRef = useRef<number | null>(null);
  const firebaseInFlightRef = useRef<boolean>(false);
  const firebaseHydratedUidRef = useRef<string | null>(null);
  const activeFirebaseOpsRef = useRef<number>(0);
  const lastFirebaseErrorToastAtRef = useRef<number>(0);
  const monitorInFlightRef = useRef<boolean>(false);
  const lastMonitorCheckAtRef = useRef<number>(0);
  const googleUserRef = useRef<User | null>(googleUser);
  googleUserRef.current = googleUser;
  const activeTimerTopicRef = useRef<ActiveTimerLink | null>(activeTimerTopic);
  activeTimerTopicRef.current = activeTimerTopic;

  const beginFirebaseSyncOp = useCallback(() => {
    activeFirebaseOpsRef.current += 1;
    setIsSyncingFirebase(true);
  }, []);

  const endFirebaseSyncOp = useCallback(() => {
    activeFirebaseOpsRef.current = Math.max(0, activeFirebaseOpsRef.current - 1);
    if (activeFirebaseOpsRef.current === 0) {
      setIsSyncingFirebase(false);
    }
  }, []);

  const clearFirebaseError = useCallback(() => {
    setFirebaseLastError(null);
  }, []);

  const dismissFirestoreConnectionAlert = useCallback(() => {
    setFirestoreConnectionMonitor((prev) => ({
      ...prev,
      dismissed: true,
    }));
  }, []);

  // Safety watchdog: never leave the Firebase UI locked in "Sincronizando..." indefinitely
  useEffect(() => {
    if (!isSyncingFirebase) return;
    const watchdogId = window.setTimeout(() => {
      console.warn('[StudyProvider][Firebase] Watchdog liberou trava de sincronização após 180s.');
      activeFirebaseOpsRef.current = 0;
      firebaseInFlightRef.current = false;
      setIsSyncingFirebase(false);
    }, 180_000);
    return () => window.clearTimeout(watchdogId);
  }, [isSyncingFirebase]);

  // Local Folder (Computer Directory) state
  const [localFolderConnected, setLocalFolderConnected] = useState<boolean>(false);
  const [localFolderWritable, setLocalFolderWritable] = useState<boolean>(false);
  const [localFolderName, setLocalFolderName] = useState<string | null>(null);
  const [localFolderSummary, setLocalFolderSummary] = useState<LocalFolderScanSummary | null>(null);
  const [savedLocalFolderMeta, setSavedLocalFolderMetaState] = useState<LocalFolderScanSummary | null>(
    () => loadSavedLocalFolderMeta(),
  );
  const [hasSavedLocalFolderHandle, setHasSavedLocalFolderHandle] = useState<boolean>(false);
  const [lastLocalFolderSyncAt, setLastLocalFolderSyncAt] = useState<string | null>(null);
  const [lastLocalIncrementalBackupAt, setLastLocalIncrementalBackupAt] = useState<string | null>(null);
  const [isSyncingLocalFolder, setIsSyncingLocalFolder] = useState<boolean>(false);
  const localFolderHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const localFolderWritableRef = useRef<boolean>(false);
  const localFolderSyncTimerRef = useRef<number | null>(null);
  const pendingLocalFolderWriteRef = useRef<number>(0);
  const localAutoBackupInFlightRef = useRef<boolean>(false);
  const lastLocalAutoBackupAtRef = useRef<number>(Date.now());
  const lastLocalBackupDbRef = useRef<StudyDatabase | null>(null);
  const lastLocalBackupHashRef = useRef<string | null>(null);
  const lastLocalBackupIsoRef = useRef<string | null>(null);
  const autoReconnectedLocalRef = useRef<boolean>(false);

  const dbRef = useRef<StudyDatabase>(db);
  const timerStateRef = useRef<TimerStored>(timerState);
  const quizRef = useRef<QuizSession | null>(quiz);
  const activeDriveFolderNameRef = useRef<string>(activeDriveFolderName);
  const driveConnectedRef = useRef<boolean>(driveConnected);
  const skipPersistDbRef = useRef<StudyDatabase | null>(db);
  const lastPersistedDbRef = useRef<StudyDatabase>(db);
  const lastDriveUploadAlertAtRef = useRef<number>(0);
  const isRestoringRef = useRef<boolean>(false);
  const syncedScopeOnceRef = useRef<string | null>(null);
  const activeCloudSyncPromiseRef = useRef<Promise<void> | null>(null);
  const pendingCloudSyncRef = useRef<boolean>(
    initialScope !== 'offline_guest' && hasPersistedPendingSync(loadSyncMeta(initialScope)),
  );
  const cloudSaveInFlightRef = useRef<boolean>(false);
  const lastAutoBackupAtRef = useRef<number>(Date.now());
  const pendingGuestDbRef = useRef<{ db: StudyDatabase; updatedAtMs: number } | null>(null);
  const lastCloudDbRef = useRef<StudyDatabase | null>(null);
  const lastCloudHashRef = useRef<string | null>(loadSyncMeta(initialScope).lastCloudContentHash || null);
  const lastBackupDbRef = useRef<StudyDatabase | null>(null);
  const lastBackupHashRef = useRef<string | null>(loadSyncMeta(initialScope).lastBackupContentHash || null);
  const lastBackupIsoRef = useRef<string | null>(loadSyncMeta(initialScope).lastCloudSyncAt || null);
  dbRef.current = db;
  timerStateRef.current = timerState;
  quizRef.current = quiz;
  activeDriveFolderNameRef.current = activeDriveFolderName;
  driveConnectedRef.current = driveConnected;
  localFolderWritableRef.current = localFolderWritable;

  // Check if a previously saved FileSystemDirectoryHandle exists in IndexedDB
  useEffect(() => {
    void loadLocalDirectoryHandle().then((h) => {
      if (h) {
        setHasSavedLocalFolderHandle(true);
        setSavedLocalFolderMetaState((prev) =>
          prev || {
            rootFolderName: h.name || 'Pasta Local',
            totalFiles: 0,
            totalFolders: CANONICAL_LOCAL_SUBFOLDERS.length,
            writable: true,
            categories: {
              backups: 0,
              pdfs: 0,
              laws: 0,
              proofs: 0,
              summaries: 0,
              essays: 0,
              schedules: 0,
              editais: 0,
              contests: 0,
              questions: 0,
              others: 0,
            },
            folderNames: [...CANONICAL_LOCAL_SUBFOLDERS],
            scannedAt: new Date().toISOString(),
          },
        );
      }
    });
  }, []);

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
          const parsed = normalizeAndMergeDatabase(JSON.parse(idbSnap.raw));
          isRestoringRef.current = true;
          skipPersistDbRef.current = parsed;
          lastPersistedDbRef.current = parsed;
          setDb(parsed);
          dbRef.current = parsed;
        } catch {
          // Ignore malformed IndexedDB snapshot
        }
      }
    })();
  }, []);

  // Persist DB to IndexedDB (unlimited capacity) and localStorage (fast cache) only on real user changes
  useEffect(() => {
    if (db === skipPersistDbRef.current) {
      skipPersistDbRef.current = null;
      lastPersistedDbRef.current = db;
      isRestoringRef.current = false;
      return;
    }
    if (db === lastPersistedDbRef.current) {
      return;
    }
    isRestoringRef.current = false;
    lastPersistedDbRef.current = db;

    const scope = activeScopeRef.current;
    const serialized = JSON.stringify(db);
    const nowIso = new Date().toISOString();
    const hasCustomOfflineData = scope !== 'offline_guest' || !isUntouchedSeedDatabase(db);
    persistLocalDatabaseForScope(scope, serialized, nowIso, {
      lastLocalEditAt: nowIso,
      ...(hasCustomOfflineData ? { hasPendingCloudSync: true } : {}),
    });
    if (hasCustomOfflineData) {
      pendingCloudSyncRef.current = true;
      setHasPendingCloudChanges(true);
    }

    // Automatically mirror every database change to the connected Local Folder on disk
    if (localFolderHandleRef.current && localFolderWritableRef.current) {
      if (localFolderSyncTimerRef.current) {
        window.clearTimeout(localFolderSyncTimerRef.current);
      }
      localFolderSyncTimerRef.current = window.setTimeout(() => {
        localFolderSyncTimerRef.current = null;
        const handle = localFolderHandleRef.current;
        if (!handle || !localFolderWritableRef.current) return;
        const curDb = dbRef.current;
        const syncIso = new Date().toISOString();
        const payload = {
          version: 2,
          app: 'Central de Estudos',
          updatedAt: syncIso,
          contentHash: computeDatabaseContentHash(curDb),
          data: curDb,
        };
        pendingLocalFolderWriteRef.current += 1;
        void saveLocalFolderSyncSnapshot(handle, payload)
          .then((ok) => {
            if (ok) {
              setLastLocalFolderSyncAt(syncIso);
            }
          })
          .finally(() => {
            pendingLocalFolderWriteRef.current = Math.max(
              0,
              pendingLocalFolderWriteRef.current - 1,
            );
          });
      }, 450);
    }

    // Automatically persist every database change incrementally to Firebase Firestore when authenticated & online
    const activeUser = auth.currentUser;
    const isBrowserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (activeUser?.uid && isEmailAuthorized(activeUser.email)) {
      if (!isBrowserOnline) {
        console.log('[StudyProvider][autoSync] Navegador offline — dados persistidos localmente em localStorage e IndexedDB para sincronização automática quando a rede voltar.', {
          scope,
          uid: activeUser.uid,
          bytes: serialized.length,
        });
        return;
      }
      if (firebaseSyncTimerRef.current) {
        window.clearTimeout(firebaseSyncTimerRef.current);
      }
      const scheduleIncrementalFirebaseSave = (delayMs: number) => {
        firebaseSyncTimerRef.current = window.setTimeout(() => {
          firebaseSyncTimerRef.current = null;
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            return;
          }
          const currentUser = auth.currentUser;
          if (!currentUser?.uid) return;
          if (firebaseInFlightRef.current) {
            scheduleIncrementalFirebaseSave(1200);
            return;
          }
          const curDb = dbRef.current;
          const curScope = activeScopeRef.current;
          const curHash = computeDatabaseContentHash(curDb);
          const configDiag = getFirestoreConfigDiagnostics();
          const targetCollectionPath = `users/${currentUser.uid}/dbRecords`;
          console.log('[StudyProvider][autoSync] Status da conexão e destino Firestore:', {
            connectionStatus: {
              online: typeof navigator !== 'undefined' ? navigator.onLine : true,
              firebaseAuthenticated: Boolean(currentUser.uid),
              uid: currentUser.uid,
              email: currentUser.email || null,
              emailVerified: currentUser.emailVerified,
              driveConnected: driveConnectedRef.current,
              activeScope: curScope,
            },
            firestoreTarget: {
              projectId: configDiag.projectId,
              firestoreDatabaseId: configDiag.firestoreDatabaseId,
              workspaceCollectionId: 'users',
              recordsCollectionId: 'dbRecords',
              targetCollectionPath,
            },
          });
          firebaseInFlightRef.current = true;
          beginFirebaseSyncOp();
          void (async () => {
            try {
              const res = await executeWithFirebaseBackoff(
                {
                  operationName: 'StudyProvider.autoSync',
                  delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
                  shouldCancel: () => auth.currentUser?.uid !== currentUser.uid,
                  onBeforeRetry: async (info) => {
                    console.log('[StudyProvider][autoSync] Tentativa de reconexão automática agendada:', {
                      attempt: info.attempt,
                      maxRetries: info.maxRetries,
                      delaySeconds: info.delayMs / 1000,
                      targetCollectionPath,
                      errorCode: info.parsedError.code,
                    });
                    await ensureFirebaseSessionAlive(true);
                  },
                },
                () =>
                  saveDatabaseToFirestore(
                    currentUser.uid,
                    curDb,
                    curHash,
                    {
                      elapsed: timerStateRef.current.elapsed,
                      startedAt: timerStateRef.current.startedAt,
                      activeTopic: activeTimerTopicRef.current,
                    },
                  ),
              );
              console.log('[StudyProvider][autoSync] Sincronização automática concluída:', {
                targetCollectionPath,
                writtenChunks: res.writtenChunks,
                totalChunks: res.totalChunks,
                updatedAt: res.updatedAt,
              });
              setFirebaseLastError(null);
              setLastFirebaseSyncAt(res.updatedAt);
              setFirebaseChunkCount(res.totalChunks);
              setLastCloudSyncAt(res.updatedAt);
              pendingCloudSyncRef.current = false;
              setHasPendingCloudChanges(false);
              saveSyncMeta(curScope, {
                lastCloudSyncAt: res.updatedAt,
                lastCloudContentHash: curHash,
                hasPendingCloudSync: false,
              });
            } catch (err) {
              console.log('[StudyProvider][autoSync] Erro capturado na comunicação com Firestore após retentativas:', {
                online: typeof navigator !== 'undefined' ? navigator.onLine : true,
                uid: currentUser.uid,
                firestoreDatabaseId: configDiag.firestoreDatabaseId,
                targetCollectionPath,
                error: err,
              });
              reportFirebaseSyncError('auto-incremental', err);
            } finally {
              firebaseInFlightRef.current = false;
              endFirebaseSyncOp();
            }
          })();
        }, delayMs);
      };
      scheduleIncrementalFirebaseSave(600);
    }
  }, [beginFirebaseSyncOp, db, endFirebaseSyncOp]);

  // Apply theme attribute & meta color
  useEffect(() => {
    const tema = db.preferences.tema || 'gov-padrao';
    document.documentElement.dataset.theme = tema;
    const theme = THEMES.find((t) => t.id === tema);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme && meta) meta.content = theme.colors[0];
  }, [db.preferences.tema]);

  // Persist timer state to user-scoped localStorage and Firebase Firestore
  useEffect(() => {
    try {
      localStorage.setItem(getTimerStorageKey(activeScopeRef.current), JSON.stringify(timerState));
    } catch {
      // Ignore storage error
    }
    const currentUser = auth.currentUser;
    if (!currentUser?.uid || firebaseHydratedUidRef.current !== currentUser.uid) {
      return;
    }
    const timerId = window.setTimeout(() => {
      if (firebaseInFlightRef.current) return;
      const liveUser = auth.currentUser;
      if (!liveUser?.uid || firebaseHydratedUidRef.current !== liveUser.uid) return;
      void syncTimerStateToFirestore(liveUser.uid, {
        elapsed: timerState.elapsed,
        startedAt: timerState.startedAt,
        activeTopic: activeTimerTopicRef.current,
      }).catch((err) => {
        reportFirebaseSyncError('timer', err);
      });
    }, 1500);
    return () => window.clearTimeout(timerId);
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
  const lastWallSecRef = useRef<number>(Math.floor(Date.now() / 1000));
  const lastTimerSecRef = useRef<number>(computeCurrentTimerSeconds(timerState, Date.now()));
  pomodoroModeRef.current = pomodoroMode;
  pomodoroPhaseRef.current = pomodoroPhase;

  // Synchronized precision ticker: drives wall clock, stopwatch, Pomodoro & quiz without 1s jitter/drift
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const wallSec = Math.floor(now / 1000);
      const t = timerStateRef.current;
      const curTimerSec = computeCurrentTimerSeconds(t, now);

      const wallChanged = wallSec !== lastWallSecRef.current;
      const timerChanged = curTimerSec !== lastTimerSecRef.current;

      if (!wallChanged && !timerChanged) return;

      lastWallSecRef.current = wallSec;
      const prevTimerSec = lastTimerSecRef.current;
      const deltaSec = t.startedAt > 0 ? Math.max(0, curTimerSec - prevTimerSec) : 0;
      lastTimerSecRef.current = curTimerSec;

      setNowTick(now);

      if (pomodoroModeRef.current !== 'continuous' && t.startedAt > 0 && deltaSec > 0) {
        const mode = pomodoroModeRef.current;
        const focusSec = mode === '25-5' ? 25 * 60 : 50 * 60;
        const breakSec = mode === '25-5' ? 5 * 60 : 10 * 60;
        setPomodoroRemainingSeconds((prev) => {
          if (prev > deltaSec) return prev - deltaSec;
          playPomodoroChime();
          const nextPhase = pomodoroPhaseRef.current === 'focus' ? 'break' : 'focus';
          pomodoroPhaseRef.current = nextPhase;
          setPomodoroPhase(nextPhase);
          window.setTimeout(() => {
            toast(
              nextPhase === 'break'
                ? `Ciclo Pomodoro concluído! Faça uma pausa de ${breakSec / 60} min.`
                : 'Pausa encerrada! Hora de voltar ao foco.',
            );
          }, 0);
          return nextPhase === 'break' ? breakSec : focusSec;
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
    }, 200);
    return () => window.clearInterval(id);
  }, [computeCurrentTimerSeconds, toast]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const reportFirebaseSyncError = useCallback(
    (
      phase: string,
      err: unknown,
      options?: { notifyUser?: boolean; phaseLabel?: string },
    ): ParsedFirestoreError => {
      const parsed = parseFirestoreError(err);
      const currentUser = auth.currentUser;
      const configDiag = getFirestoreConfigDiagnostics();

      console.error(`[StudyProvider][Firebase][${phase}] Falha na sincronização:`, {
        category: parsed.category,
        code: parsed.code,
        operationType: parsed.operationType,
        path: parsed.path,
        userMessage: parsed.userMessage,
        technicalMessage: parsed.technicalMessage,
        auth: {
          uid: currentUser?.uid || null,
          email: currentUser?.email || null,
          emailVerified: currentUser?.emailVerified ?? null,
        },
        config: {
          projectId: configDiag.projectId,
          firestoreDatabaseId: configDiag.firestoreDatabaseId,
          isValid: configDiag.isValid,
          issues: configDiag.issues,
        },
      });

      setFirebaseLastError(parsed);

      if (parsed.category === 'auth' && currentUser) {
        void ensureFirebaseSessionAlive(true);
      }

      const isCriticalAuthOrPerm =
        parsed.category === 'auth' ||
        parsed.category === 'permission' ||
        parsed.category === 'config';
      const now = Date.now();
      const canShowBackgroundToast =
        isCriticalAuthOrPerm && now - lastFirebaseErrorToastAtRef.current > 25_000;

      if (options?.notifyUser || canShowBackgroundToast) {
        if (!options?.notifyUser) {
          lastFirebaseErrorToastAtRef.current = now;
        }
        const prefix = options?.phaseLabel || 'Erro ao sincronizar com Firebase Firestore';
        toast(`${prefix}: ${parsed.userMessage}`, true);
      }

      return parsed;
    },
    [toast],
  );

  const reportFirebaseErrorRef = useRef(reportFirebaseSyncError);
  reportFirebaseErrorRef.current = reportFirebaseSyncError;

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

  const applyRestoredDatabaseForScope = useCallback(
    (
      scope: string,
      nextDb: StudyDatabase,
      cloudTimestamp?: string,
      options?: { skipFirestorePush?: boolean },
    ) => {
      const sanitizedDb = normalizeAndMergeDatabase(nextDb);
      isRestoringRef.current = true;
      skipPersistDbRef.current = sanitizedDb;
      lastPersistedDbRef.current = sanitizedDb;
      setDb(sanitizedDb);
      dbRef.current = sanitizedDb;
      setFirebaseChunkCount(decomposeDatabaseToFirestoreChunks(sanitizedDb).length);
      const serialized = JSON.stringify(sanitizedDb);
      const ts = cloudTimestamp || new Date().toISOString();
      persistLocalDatabaseForScope(scope, serialized, ts, {
        lastCloudSyncAt: ts,
        lastLocalEditAt: ts,
        hasPendingCloudSync: false,
      });
      setLastCloudSyncAt(ts);
      setLastFirebaseSyncAt(ts);
      pendingCloudSyncRef.current = false;
      setHasPendingCloudChanges(false);

      // Automatically mirror any database restored from Google Drive, Local Folder, or JSON Backup into Firebase Firestore
      const currentUser = auth.currentUser;
      if (
        !options?.skipFirestorePush &&
        currentUser?.uid &&
        isEmailAuthorized(currentUser.email) &&
        !isUntouchedSeedDatabase(sanitizedDb) &&
        !firebaseInFlightRef.current
      ) {
        const nextHash = computeDatabaseContentHash(sanitizedDb);
        beginFirebaseSyncOp();
        firebaseInFlightRef.current = true;
        void executeWithFirebaseBackoff(
          {
            operationName: 'StudyProvider.mirrorRestored',
            delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
            shouldCancel: () => auth.currentUser?.uid !== currentUser.uid,
            onBeforeRetry: async () => {
              await ensureFirebaseSessionAlive(true);
            },
          },
          () =>
            saveDatabaseToFirestore(
              currentUser.uid,
              sanitizedDb,
              nextHash,
              {
                elapsed: timerStateRef.current.elapsed,
                startedAt: timerStateRef.current.startedAt,
                activeTopic: activeTimerTopicRef.current,
              },
            ),
        )
          .then((saved) => {
            setFirebaseLastError(null);
            setLastFirebaseSyncAt(saved.updatedAt);
            setFirebaseChunkCount(saved.totalChunks);
          })
          .catch((err) => {
            reportFirebaseErrorRef.current('mirror-restored', err);
          })
          .finally(() => {
            firebaseInFlightRef.current = false;
            endFirebaseSyncOp();
          });
      }
    },
    [beginFirebaseSyncOp, endFirebaseSyncOp],
  );

  const syncNowWithFirebase = useCallback(
    async (options?: { forceFullWrite?: boolean; silent?: boolean }): Promise<boolean> => {
      const configDiag = getFirestoreConfigDiagnostics();
      console.log('[StudyProvider][syncNowWithFirebase] Iniciando sincronização:', {
        connectionStatus: {
          online: typeof navigator !== 'undefined' ? navigator.onLine : true,
          hasAuthUser: Boolean(auth.currentUser?.uid),
          uid: auth.currentUser?.uid || null,
          email: auth.currentUser?.email || null,
          emailVerified: auth.currentUser?.emailVerified ?? null,
          driveConnected: driveConnectedRef.current,
          firebaseInFlight: firebaseInFlightRef.current,
          activeScope: activeScopeRef.current,
        },
        firestoreTarget: {
          projectId: configDiag.projectId,
          firestoreDatabaseId: configDiag.firestoreDatabaseId,
          workspaceCollectionId: 'users',
          recordsCollectionId: 'dbRecords',
          targetCollectionPath: auth.currentUser?.uid
            ? `users/${auth.currentUser.uid}/dbRecords`
            : 'users/{uid}/dbRecords',
        },
        options: {
          forceFullWrite: Boolean(options?.forceFullWrite),
          silent: Boolean(options?.silent),
        },
      });

      let currentUser = await ensureFirebaseSessionAlive(false);
      if (!currentUser?.uid) {
        try {
          const res = await googleSignIn();
          if (!res?.user?.uid) {
            console.log('[StudyProvider][syncNowWithFirebase] Login cancelado ou sem UID retornado.');
            if (!options?.silent) {
              toast('Faça login com sua conta Google para sincronizar com o Firebase Firestore.', true);
            }
            return false;
          }
          currentUser = res.user;
        } catch (loginErr) {
          console.log('[StudyProvider][syncNowWithFirebase] Erro capturado no try-catch de login:', {
            online: typeof navigator !== 'undefined' ? navigator.onLine : true,
            firestoreDatabaseId: configDiag.firestoreDatabaseId,
            error: loginErr,
          });
          reportFirebaseSyncError('manual-login', loginErr, {
            notifyUser: !options?.silent,
            phaseLabel: 'Erro de autenticação Google/Firebase',
          });
          return false;
        }
      }

      if (!isEmailAuthorized(currentUser.email)) {
        const msg = `O e-mail "${currentUser.email || 'informado'}" não está autorizado a gravar neste portal.`;
        console.log('[StudyProvider][syncNowWithFirebase] Acesso bloqueado por e-mail não autorizado:', {
          email: currentUser.email,
          targetCollectionPath: `users/${currentUser.uid}/dbRecords`,
        });
        if (!options?.silent) {
          toast(msg, true);
        }
        return false;
      }

      if (currentUser.emailVerified === false) {
        const err = new Error(
          `A conta "${currentUser.email}" não possui e-mail verificado no Firebase Auth (exigido pelas regras do Firestore).`,
        );
        console.log('[StudyProvider][syncNowWithFirebase] Bloqueado: emailVerified=false:', {
          uid: currentUser.uid,
          email: currentUser.email,
          targetCollectionPath: `users/${currentUser.uid}/dbRecords`,
        });
        reportFirebaseSyncError('manual-email-unverified', err, {
          notifyUser: !options?.silent,
          phaseLabel: 'Falha de autenticação Firebase',
        });
        return false;
      }

      if (firebaseSyncTimerRef.current) {
        window.clearTimeout(firebaseSyncTimerRef.current);
        firebaseSyncTimerRef.current = null;
      }

      if (firebaseInFlightRef.current) {
        console.log('[StudyProvider][syncNowWithFirebase] Aguardando gravação em andamento finalizar...');
        const waitStart = Date.now();
        while (firebaseInFlightRef.current && Date.now() - waitStart < 8000) {
          await new Promise((r) => window.setTimeout(r, 200));
        }
      }

      const targetCollectionPath = `users/${currentUser.uid}/dbRecords`;
      beginFirebaseSyncOp();
      firebaseInFlightRef.current = true;
      try {
        window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
        const curDb = dbRef.current;
        const curScope = activeScopeRef.current;
        const curHash = computeDatabaseContentHash(curDb);
        console.log('[StudyProvider][syncNowWithFirebase] Enviando gravação para coleção Firestore:', {
          online: typeof navigator !== 'undefined' ? navigator.onLine : true,
          uid: currentUser.uid,
          email: currentUser.email,
          firestoreDatabaseId: configDiag.firestoreDatabaseId,
          workspaceCollectionId: 'users',
          recordsCollectionId: 'dbRecords',
          targetCollectionPath,
          contentHash: curHash,
          forceFullWrite: Boolean(options?.forceFullWrite),
        });
        const result = await executeWithFirebaseBackoff(
          {
            operationName: 'StudyProvider.syncNowWithFirebase',
            delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
            shouldCancel: () => auth.currentUser?.uid !== currentUser.uid,
            onBeforeRetry: async (info) => {
              console.log('[StudyProvider][syncNowWithFirebase] Tentativa de reconexão automática agendada:', {
                attempt: info.attempt,
                maxRetries: info.maxRetries,
                delaySeconds: info.delayMs / 1000,
                targetCollectionPath,
                errorCode: info.parsedError.code,
              });
              await ensureFirebaseSessionAlive(true);
            },
          },
          () =>
            saveDatabaseToFirestore(
              currentUser.uid,
              curDb,
              curHash,
              {
                elapsed: timerStateRef.current.elapsed,
                startedAt: timerStateRef.current.startedAt,
                activeTopic: activeTimerTopicRef.current,
              },
              { forceFullWrite: options?.forceFullWrite },
            ),
        );
        console.log('[StudyProvider][syncNowWithFirebase] Gravação concluída com sucesso:', {
          targetCollectionPath,
          writtenChunks: result.writtenChunks,
          totalChunks: result.totalChunks,
          updatedAt: result.updatedAt,
        });
        setFirebaseLastError(null);
        setLastFirebaseSyncAt(result.updatedAt);
        setFirebaseChunkCount(result.totalChunks);
        setLastCloudSyncAt(result.updatedAt);
        pendingCloudSyncRef.current = false;
        setHasPendingCloudChanges(false);
        saveSyncMeta(curScope, {
          lastCloudSyncAt: result.updatedAt,
          lastCloudContentHash: curHash,
          hasPendingCloudSync: false,
        });
        if (!options?.silent) {
          toast(
            result.writtenChunks > 0
              ? `Banco de dados salvo no Firebase Firestore (${result.writtenChunks} de ${result.totalChunks} partições atualizadas).`
              : `Firebase Firestore já está 100% atualizado (${result.totalChunks} partições verificadas).`,
          );
        }
        return true;
      } catch (err) {
        const parsedErr = reportFirebaseSyncError('manual', err, {
          notifyUser: !options?.silent,
          phaseLabel: 'Erro ao gravar no Firebase Firestore',
        });
        console.log('[StudyProvider][syncNowWithFirebase] Erro capturado no try-catch após retentativas:', {
          connectionStatus: {
            online: typeof navigator !== 'undefined' ? navigator.onLine : true,
            uid: currentUser.uid,
            email: currentUser.email,
            emailVerified: currentUser.emailVerified,
            driveConnected: driveConnectedRef.current,
          },
          firestoreTarget: {
            projectId: configDiag.projectId,
            firestoreDatabaseId: configDiag.firestoreDatabaseId,
            targetCollectionPath,
          },
          parsedError: parsedErr,
          rawError: err,
        });
        return false;
      } finally {
        firebaseInFlightRef.current = false;
        endFirebaseSyncOp();
      }
    },
    [beginFirebaseSyncOp, endFirebaseSyncOp, reportFirebaseSyncError, toast],
  );

  const restoreFromFirebase = useCallback(async (): Promise<boolean> => {
    const configDiag = getFirestoreConfigDiagnostics();
    console.log('[StudyProvider][restoreFromFirebase] Iniciando restauração do Firestore:', {
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      hasAuthUser: Boolean(auth.currentUser?.uid),
      uid: auth.currentUser?.uid || null,
      firestoreDatabaseId: configDiag.firestoreDatabaseId,
      targetCollectionPath: auth.currentUser?.uid
        ? `users/${auth.currentUser.uid}/dbRecords`
        : 'users/{uid}/dbRecords',
    });
    let currentUser = await ensureFirebaseSessionAlive(false);
    if (!currentUser?.uid) {
      try {
        const res = await googleSignIn();
        if (!res?.user?.uid) {
          toast('Faça login com sua conta Google para restaurar do Firebase Firestore.', true);
          return false;
        }
        currentUser = res.user;
      } catch (loginErr) {
        console.log('[StudyProvider][restoreFromFirebase] Erro capturado no try-catch de login:', loginErr);
        reportFirebaseSyncError('restore-login', loginErr, {
          notifyUser: true,
          phaseLabel: 'Erro de autenticação Google/Firebase',
        });
        return false;
      }
    }

    if (!isEmailAuthorized(currentUser.email)) {
      toast(`O e-mail "${currentUser.email || 'informado'}" não está autorizado.`, true);
      return false;
    }

    const targetCollectionPath = `users/${currentUser.uid}/dbRecords`;
    beginFirebaseSyncOp();
    try {
      const loaded = await executeWithFirebaseBackoff(
        {
          operationName: 'StudyProvider.restoreFromFirebase',
          delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
          shouldCancel: () => auth.currentUser?.uid !== currentUser.uid,
          onBeforeRetry: async (info) => {
            console.log('[StudyProvider][restoreFromFirebase] Tentativa de reconexão automática agendada:', {
              attempt: info.attempt,
              maxRetries: info.maxRetries,
              delaySeconds: info.delayMs / 1000,
              targetCollectionPath,
              errorCode: info.parsedError.code,
            });
            await ensureFirebaseSessionAlive(true);
          },
        },
        () => loadDatabaseFromFirestore(currentUser.uid),
      );
      if (!loaded) {
        console.log('[StudyProvider][restoreFromFirebase] Nenhum registro encontrado na coleção:', {
          firestoreDatabaseId: configDiag.firestoreDatabaseId,
          targetCollectionPath,
        });
        toast('Nenhum banco de dados encontrado no Firebase Firestore para esta conta. Gravando dados atuais...', false);
        return await syncNowWithFirebase({ forceFullWrite: true });
      }
      const normalized = normalizeAndMergeDatabase(loaded.db);
      const scope = getUserScopeKey(currentUser);
      applyRestoredDatabaseForScope(scope, normalized, loaded.updatedAt, { skipFirestorePush: true });
      setFirebaseLastError(null);
      setFirebaseChunkCount(loaded.sectionCount);
      console.log('[StudyProvider][restoreFromFirebase] Restauração concluída:', {
        targetCollectionPath,
        sectionCount: loaded.sectionCount,
        updatedAt: loaded.updatedAt,
      });
      toast(`Banco de dados restaurado do Firebase Firestore (${loaded.sectionCount} partições carregadas)!`);
      return true;
    } catch (err) {
      const parsedErr = reportFirebaseSyncError('restore', err, {
        notifyUser: true,
        phaseLabel: 'Falha ao restaurar do Firebase Firestore',
      });
      console.log('[StudyProvider][restoreFromFirebase] Erro capturado no try-catch após retentativas:', {
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        uid: currentUser.uid,
        firestoreDatabaseId: configDiag.firestoreDatabaseId,
        targetCollectionPath,
        parsedError: parsedErr,
        rawError: err,
      });
      return false;
    } finally {
      endFirebaseSyncOp();
    }
  }, [applyRestoredDatabaseForScope, beginFirebaseSyncOp, endFirebaseSyncOp, reportFirebaseSyncError, syncNowWithFirebase, toast]);

  // Automatic Firebase Firestore Hydration, Migration & Real-Time Listener on Auth
  const googleUid = googleUser?.uid || null;
  const googleEmail = googleUser?.email || null;
  useEffect(() => {
    if (!googleUid || !isEmailAuthorized(googleEmail)) {
      firebaseHydratedUidRef.current = null;
      return;
    }

    let cancelled = false;
    const userObj = auth.currentUser || googleUser;
    const scope = userObj ? getUserScopeKey(userObj) : `user_${googleUid}`;

    if (firebaseHydratedUidRef.current !== googleUid) {
      void (async () => {
        beginFirebaseSyncOp();
        try {
          console.info('[StudyProvider][Firebase][hydrate] Validando sessão Auth e carregando Firestore...', {
            uid: googleUid,
            email: googleEmail,
          });
          await ensureFirebaseSessionAlive(false);
          const [loadedFirestore, idbSnap, guestIdbSnap, guestIdbMeta] = await Promise.all([
            executeWithFirebaseBackoff(
              {
                operationName: 'StudyProvider.hydrate.load',
                delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
                shouldCancel: () => cancelled,
                onBeforeRetry: async () => {
                  await ensureFirebaseSessionAlive(true);
                },
              },
              () => loadDatabaseFromFirestore(googleUid),
            ),
            loadScopedDatabaseJson(scope),
            loadScopedDatabaseJson('offline_guest'),
            loadScopedSyncMeta<ScopeSyncMeta>('offline_guest'),
          ]);
          if (cancelled) return;

          let localDb = dbRef.current;
          if (idbSnap?.raw && shouldPreferIdbSnapshot(scope, idbSnap, true)) {
            try {
              localDb = normalizeAndMergeDatabase(JSON.parse(idbSnap.raw));
            } catch {
              // ignore
            }
          }

          let localMeta = loadSyncMeta(scope);
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
              persistedGuestDb = normalizeAndMergeDatabase(JSON.parse(guestIdbSnap.raw));
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
          const lastMergedGuestMs = Date.parse(localMeta.lastMergedGuestEditAt || '') || 0;

          let rescuedGuestEdits = false;
          if (
            candidateGuestDb &&
            !isUntouchedSeedDatabase(candidateGuestDb) &&
            (Boolean(guestPending) || candidateGuestMs > lastMergedGuestMs + 500 || isUntouchedSeedDatabase(localDb))
          ) {
            if (isUntouchedSeedDatabase(localDb)) {
              localDb = candidateGuestDb;
            } else {
              const guestDelta = buildIncrementalDatabaseBackup(createInitialDatabase(), candidateGuestDb, {
                updatedAt: new Date(candidateGuestMs || Date.now()).toISOString(),
                userEmail: googleEmail || undefined,
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
                localDb = applyIncrementalDeltaToDatabase(localDb, additiveGuestEnvelope);
              }
            }
            rescuedGuestEdits = true;
            const mergedIso = new Date(Math.max(candidateGuestMs, Date.now())).toISOString();
            localMeta = saveSyncMeta(scope, {
              lastMergedGuestEditAt: mergedIso,
              lastLocalEditAt: mergedIso,
              hasPendingCloudSync: true,
            });
          }

          const localUntouched = isUntouchedSeedDatabase(localDb);
          const localEditMs = Date.parse(localMeta.lastLocalEditAt || '') || 0;

          if (loadedFirestore) {
            const rawRemoteDb = loadedFirestore.db as StudyDatabase;
            const remoteNormalized = normalizeAndMergeDatabase(rawRemoteDb);
            const remoteUntouched = isUntouchedSeedDatabase(remoteNormalized);
            const remoteMs = Date.parse(loadedFirestore.updatedAt || '') || 0;
            const remoteHash = computeDatabaseContentHash(remoteNormalized);
            const localHash = computeDatabaseContentHash(localDb);

            const rawLawFoldersCount = Object.keys(rawRemoteDb?.laws || {}).length;
            const cleanLawFoldersCount = Object.keys(remoteNormalized.laws || {}).length;
            const rawLawItemsTotal = Object.values(rawRemoteDb?.laws || {}).reduce(
              (s, f) => s + (f?.items?.length || 0) + (f?.pdfs?.length || 0),
              0,
            );
            const cleanLawItemsTotal = Object.values(remoteNormalized.laws || {}).reduce(
              (s, f) => s + (f?.items?.length || 0) + (f?.pdfs?.length || 0),
              0,
            );
            const remoteHadDirtyClassification =
              cleanLawFoldersCount < rawLawFoldersCount ||
              cleanLawItemsTotal < rawLawItemsTotal ||
              (remoteNormalized.submittedSimulations || []).length <
                (rawRemoteDb?.submittedSimulations || []).length ||
              (remoteNormalized.proofFiles || []).length < (rawRemoteDb?.proofFiles || []).length;

            if (remoteUntouched && !localUntouched) {
              // Firestore only had default seed data while local/Drive has the user's real study database: push local/Drive DB to Firestore!
              applyRestoredDatabaseForScope(scope, localDb, new Date().toISOString(), { skipFirestorePush: true });
              firebaseInFlightRef.current = true;
              try {
                const saved = await executeWithFirebaseBackoff(
                  {
                    operationName: 'StudyProvider.hydrate.pushSeedReplace',
                    delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
                    shouldCancel: () => cancelled,
                    onBeforeRetry: async () => {
                      await ensureFirebaseSessionAlive(true);
                    },
                  },
                  () =>
                    saveDatabaseToFirestore(
                      googleUid,
                      localDb,
                      localHash,
                      {
                        elapsed: timerStateRef.current.elapsed,
                        startedAt: timerStateRef.current.startedAt,
                        activeTopic: activeTimerTopicRef.current,
                      },
                      { forceFullWrite: true },
                    ),
                );
                if (!cancelled) {
                  setLastFirebaseSyncAt(saved.updatedAt);
                  setFirebaseChunkCount(saved.totalChunks);
                }
              } finally {
                firebaseInFlightRef.current = false;
              }
            } else if (!rescuedGuestEdits && (localUntouched || (!localMeta.hasPendingCloudSync && remoteMs >= localEditMs - 1500))) {
              if (!remoteUntouched && (remoteHash !== localHash || localDb !== dbRef.current || remoteHadDirtyClassification)) {
                applyRestoredDatabaseForScope(scope, remoteNormalized, loadedFirestore.updatedAt, {
                  skipFirestorePush: !remoteHadDirtyClassification,
                });
              } else {
                setLastFirebaseSyncAt(loadedFirestore.updatedAt);
              }
              setFirebaseChunkCount(loadedFirestore.sectionCount);
            } else {
              // Merge local/folder/Drive changes additively over Firestore baseline and push to Firestore
              const delta = buildIncrementalDatabaseBackup(createInitialDatabase(), localDb, {
                updatedAt: new Date().toISOString(),
                userEmail: googleEmail || undefined,
              });
              const additiveEnvelope = {
                ...delta.envelope,
                delta: Object.fromEntries(
                  Object.entries(delta.envelope.delta).map(([sec, val]) => {
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
              const mergedDb = delta.hasChanges
                ? applyIncrementalDeltaToDatabase(remoteNormalized, additiveEnvelope)
                : localDb;
              const mergedHash = computeDatabaseContentHash(mergedDb);
              applyRestoredDatabaseForScope(scope, mergedDb, new Date().toISOString(), { skipFirestorePush: true });
              firebaseInFlightRef.current = true;
              try {
                const saved = await executeWithFirebaseBackoff(
                  {
                    operationName: 'StudyProvider.hydrate.pushMerge',
                    delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
                    shouldCancel: () => cancelled,
                    onBeforeRetry: async () => {
                      await ensureFirebaseSessionAlive(true);
                    },
                  },
                  () =>
                    saveDatabaseToFirestore(googleUid, mergedDb, mergedHash, {
                      elapsed: timerStateRef.current.elapsed,
                      startedAt: timerStateRef.current.startedAt,
                      activeTopic: activeTimerTopicRef.current,
                    }),
                );
                if (!cancelled) {
                  setLastFirebaseSyncAt(saved.updatedAt);
                  setFirebaseChunkCount(saved.totalChunks);
                  saveSyncMeta(scope, {
                    lastCloudSyncAt: saved.updatedAt,
                    lastCloudContentHash: mergedHash,
                    hasPendingCloudSync: false,
                  });
                }
              } finally {
                firebaseInFlightRef.current = false;
              }
            }
          } else if (!localUntouched) {
            // First-time migration when local/Drive DB already has user data: push the entire StudyDatabase to Firebase Firestore
            const hash = computeDatabaseContentHash(localDb);
            firebaseInFlightRef.current = true;
            try {
              const saved = await executeWithFirebaseBackoff(
                {
                  operationName: 'StudyProvider.hydrate.firstMigration',
                  delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
                  shouldCancel: () => cancelled,
                  onBeforeRetry: async () => {
                    await ensureFirebaseSessionAlive(true);
                  },
                },
                () =>
                  saveDatabaseToFirestore(
                    googleUid,
                    localDb,
                    hash,
                    {
                      elapsed: timerStateRef.current.elapsed,
                      startedAt: timerStateRef.current.startedAt,
                      activeTopic: activeTimerTopicRef.current,
                    },
                    { forceFullWrite: true },
                  ),
              );
              if (!cancelled) {
                setLastFirebaseSyncAt(saved.updatedAt);
                setFirebaseChunkCount(saved.totalChunks);
                setLastCloudSyncAt(saved.updatedAt);
                saveSyncMeta(scope, {
                  lastCloudSyncAt: saved.updatedAt,
                  lastCloudContentHash: hash,
                  hasPendingCloudSync: false,
                });
              }
            } finally {
              firebaseInFlightRef.current = false;
            }
          }

          if (rescuedGuestEdits && !cancelled) {
            toast('Dados salvos na pasta local/modo offline foram mesclados e preservados na sua conta Google!');
          }

          firebaseHydratedUidRef.current = googleUid;
          setFirebaseLastError(null);
        } catch (err) {
          reportFirebaseSyncError('hydrate', err, {
            phaseLabel: 'Erro ao carregar dados do Firebase Firestore',
          });
        } finally {
          endFirebaseSyncOp();
        }
      })();
    }

    const unsubscribeSnapshot = subscribeToFirestoreWorkspace(
      googleUid,
      (remoteMeta) => {
        if (cancelled || firebaseInFlightRef.current) return;
        const curHash = computeDatabaseContentHash(dbRef.current);
        if (remoteMeta.contentHash && remoteMeta.contentHash !== curHash) {
          void executeWithFirebaseBackoff(
            {
              operationName: 'StudyProvider.realtimeReload',
              delaysMs: FIREBASE_RECONNECT_BACKOFF_DELAYS_MS,
              shouldCancel: () => cancelled,
              onBeforeRetry: async () => {
                await ensureFirebaseSessionAlive(true);
              },
            },
            () => loadDatabaseFromFirestore(googleUid),
          )
            .then((reloaded) => {
              if (!reloaded || cancelled || firebaseInFlightRef.current) return;
              const normalized = normalizeAndMergeDatabase(reloaded.db);
              if (isUntouchedSeedDatabase(normalized) && !isUntouchedSeedDatabase(dbRef.current)) {
                return;
              }
              applyRestoredDatabaseForScope(scope, normalized, reloaded.updatedAt, { skipFirestorePush: true });
              setFirebaseLastError(null);
              setFirebaseChunkCount(reloaded.sectionCount);
            })
            .catch((err) => {
              reportFirebaseSyncError('realtime-reload', err);
            });
        }
      },
      (listenerErr) => {
        reportFirebaseSyncError('realtime-listener', listenerErr, {
          phaseLabel: 'Erro na escuta em tempo real do Firestore',
        });
      },
    );

    return () => {
      cancelled = true;
      unsubscribeSnapshot();
    };
  }, [applyRestoredDatabaseForScope, beginFirebaseSyncOp, endFirebaseSyncOp, googleEmail, googleUid, reportFirebaseSyncError, toast]);

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
        const dbAtSyncStart = dbRef.current;
        try {
          const folder = await getOrCreateStudyFolder(token);
          const resolvedFolderName = folder.name || getPreferredStudyFolder().name;
          rememberKnownStudyDriveFolderName(resolvedFolderName);
          setActiveDriveFolderName(resolvedFolderName);
          if (folder.webViewLink) setDriveFolderUrl(folder.webViewLink);

          const preSyncMeta = loadSyncMeta(scope);
          const skipSubfolderEnsure = preSyncMeta.lastSubfoldersSyncedFolderId === folder.id;

          const folderWritable = await verifyDriveFolderWritable(folder.id, token).catch(() => false);

          // Fetch Drive file/backup metadata and Firebase Firestore state in parallel
          const [, backupsList, driveFiles, idbSnap, idbMeta, guestIdbSnap, guestIdbMeta, firestoreLoaded] = await Promise.all([
            skipSubfolderEnsure || !folderWritable
              ? Promise.resolve({})
              : syncStudySubFoldersInDrive(folder.id, token).catch(() => ({})),
            listDatabaseBackupsFromDrive(token, { activeFolderId: folder.id }),
            listAllStudyFilesInDrive(token),
            loadScopedDatabaseJson(scope),
            loadScopedSyncMeta<ScopeSyncMeta>(scope),
            loadScopedDatabaseJson('offline_guest'),
            loadScopedSyncMeta<ScopeSyncMeta>('offline_guest'),
            user.uid ? loadDatabaseFromFirestore(user.uid).catch(() => null) : Promise.resolve(null),
          ]);

          let currentDb = dbRef.current;
          let hasLocalAny = hadLocalDbBeforeLoad || Boolean(idbSnap?.byteLength);
          if (idbSnap?.raw && shouldPreferIdbSnapshot(scope, idbSnap, hadLocalDbBeforeLoad)) {
            try {
              currentDb = normalizeAndMergeDatabase(JSON.parse(idbSnap.raw));
              hasLocalAny = true;
            } catch {
              // ignore malformed idb snapshot
            }
          }

          const firestoreUpdatedMs = Date.parse(firestoreLoaded?.updatedAt || '') || 0;
          const idbEditMs = Math.max(
            Date.parse(preSyncMeta.lastLocalEditAt || '') || 0,
            Date.parse(idbMeta?.lastLocalEditAt || '') || 0,
            Date.parse(idbSnap?.updatedAt || '') || 0,
          );
          if (firestoreLoaded?.db) {
            const firestoreNormalized = normalizeAndMergeDatabase(firestoreLoaded.db);
            if (!isUntouchedSeedDatabase(firestoreNormalized)) {
              if (!hasLocalAny || isUntouchedSeedDatabase(currentDb) || firestoreUpdatedMs >= idbEditMs - 1500) {
                currentDb = firestoreNormalized;
                hasLocalAny = true;
              }
            }
          }

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
              persistedGuestDb = normalizeAndMergeDatabase(JSON.parse(guestIdbSnap.raw));
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
              currentDb = candidateGuestDb;
            } else {
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
                currentDb = applyIncrementalDeltaToDatabase(currentDb, additiveGuestEnvelope);
              }
            }
            hasLocalAny = true;
            rescuedGuestEdits = true;
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

          if (
            !rescuedGuestEdits &&
            folderWritable &&
            localReadyForCache &&
            driveBackupsMatchCache &&
            driveFilesMatchCache &&
            dbMatchesLastCloud &&
            !hasPersistedPendingSync(metaAfterLoad)
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
              firestoreUpdatedMs,
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
              firestoreUpdatedMs,
            );
            const hasPersistedUnsyncedLocal =
              hasPersistedPendingSync(syncMeta) ||
              Boolean(pendingCloudSyncRef.current) ||
              rescuedGuestEdits ||
              firestoreUpdatedMs > cloudMs + 1500;
            const offlineLocalContinuation =
              localIsNewer &&
              !cloudOutsideActiveFolder &&
              (syncMeta.lastSyncedFolderId === folder.id || hasPersistedUnsyncedLocal) &&
              (lastCloudSyncMs > 0 || rescuedGuestEdits) &&
              localEditMs > Math.max(lastCloudSyncMs, cloudMs) + 1500 &&
              !hasMoreCustomEntities(cloudDb, currentDb);

            let useCloudSnapshot = true;
            if (sameSessionRenewal || offlineLocalContinuation) {
              useCloudSnapshot = false;
              let baseLocalDb = currentDb;
              if (computeDatabaseContentHash(dbRef.current) !== hydratedBaselineHash && dbRef.current !== dbAtSyncStart) {
                const concurrentDelta = buildIncrementalDatabaseBackup(hydratedBaselineDb, dbRef.current, {
                  updatedAt: new Date().toISOString(),
                  userEmail: user.email || undefined,
                });
                if (concurrentDelta.hasChanges) {
                  baseLocalDb = applyIncrementalDeltaToDatabase(baseLocalDb, concurrentDelta.envelope);
                }
              }
              const { updatedDb, filesRestored, orphansImported, healedLawsCount } =
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
              const { uploadedCount: filesUploaded, uploadedFiles } = await syncMissingReferencedBlobsToDrive(
                updatedDb,
                driveFiles,
                token,
              );
              uploadedFiles.forEach((uf) => addUploadedToLocalSigMaps(uf, false));
              setRestoreProgress(null);
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
              toast(
                totalFiles > 0
                  ? `Dados mantidos e pastas do Drive sincronizadas (${totalFiles} arquivo(s)).`
                  : 'Dados sincronizados instantaneamente com o Firebase Firestore e Google Drive.',
              );
            }

            if (useCloudSnapshot) {
              // Non-destructive safeguard: merge unsynced local/Firestore additions/edits made after last sync instead of discarding them
              let baseMergedCloudDb = cloudDb;
              let preservedLocalEdits = false;
              const localEditedAfterLastSync =
                localHasCustom &&
                hashesDiffer &&
                (rescuedGuestEdits ||
                  firestoreUpdatedMs > cloudMs + 1500 ||
                  (hasPersistedUnsyncedLocal &&
                    (localIsNewer || localHasUnsavedEdge || (lastCloudSyncMs > 0 && localEditMs > lastCloudSyncMs + 1500))));
              if (localEditedAfterLastSync) {
                const localDiff = buildIncrementalDatabaseBackup(cloudDb, currentDb, {
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
                  baseMergedCloudDb = applyIncrementalDeltaToDatabase(cloudDb, additiveLocalEnvelope);
                  preservedLocalEdits = true;
                }
              }

              const { updatedDb, filesRestored, orphansImported, healedLawsCount } =
                await restoreFilesAndOrphansFromDriveList(
                  baseMergedCloudDb,
                  driveFiles,
                  token,
                  scope,
                  isUntouchedSeedDatabase(baseMergedCloudDb)
                    ? (current, total, label) => setRestoreProgress({ current, total, label })
                    : undefined,
                  { importFromAnyFolder: false, lazyBinaryBlobs: true, knownSyncedFileIds },
                );
              let finalUpdatedDb = updatedDb;
              let hadConcurrentLocalEdits = preservedLocalEdits;
              if (computeDatabaseContentHash(dbRef.current) !== hydratedBaselineHash && dbRef.current !== dbAtSyncStart) {
                const concurrentDelta = buildIncrementalDatabaseBackup(hydratedBaselineDb, dbRef.current, {
                  updatedAt: new Date().toISOString(),
                  userEmail: user.email || undefined,
                });
                if (concurrentDelta.hasChanges) {
                  finalUpdatedDb = applyIncrementalDeltaToDatabase(finalUpdatedDb, concurrentDelta.envelope);
                  hadConcurrentLocalEdits = true;
                }
              }
              const { uploadedCount: filesUploaded, uploadedFiles } = await syncMissingReferencedBlobsToDrive(
                finalUpdatedDb,
                driveFiles,
                token,
              );
              uploadedFiles.forEach((uf) => addUploadedToLocalSigMaps(uf, false));
              setRestoreProgress(null);
              applyRestoredDatabaseForScope(scope, finalUpdatedDb, hadConcurrentLocalEdits ? undefined : cloudIso);
              const updatedHash = computeDatabaseContentHash(finalUpdatedDb);

              if (folderWritable && (orphansImported > 0 || healedLawsCount > 0 || hadConcurrentLocalEdits)) {
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
                  );
                  addUploadedToLocalSigMaps(savedSync, true);
                } catch {
                  // non-fatal background sync error
                }
              }

              lastCloudDbRef.current = finalUpdatedDb;
              lastCloudHashRef.current = updatedHash;
              lastBackupDbRef.current = finalUpdatedDb;
              lastBackupHashRef.current = updatedHash;
              lastBackupIsoRef.current = cloudIso;
              persistCacheState(updatedHash, updatedHash, { hasPendingCloudSync: !folderWritable && hadConcurrentLocalEdits });
              if (!folderWritable && hadConcurrentLocalEdits) {
                pendingCloudSyncRef.current = true;
                setHasPendingCloudChanges(true);
              }

              const totalFiles = filesRestored + orphansImported + filesUploaded;
              const incCount = latestCloud.incrementalDeltas?.length || 0;
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
                baseLocalDb = applyIncrementalDeltaToDatabase(baseLocalDb, concurrentDelta.envelope);
              }
            }
            const { updatedDb, filesRestored, orphansImported, healedLawsCount } =
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
            const { uploadedCount: filesUploaded, uploadedFiles } = await syncMissingReferencedBlobsToDrive(
              updatedDb,
              driveFiles,
              token,
            );
            uploadedFiles.forEach((uf) => addUploadedToLocalSigMaps(uf, false));
            setRestoreProgress(null);
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
          }

          lastAutoBackupAtRef.current = Date.now();
          syncedScopeOnceRef.current = scope;
        } catch (err: any) {
          console.warn('[Cloud Sync Auth] Falha na verificação inicial do Drive:', err);
          const isTokenErr = String(err?.message || '').includes('TOKEN_EXPIRED');
          if (isTokenErr) {
            setDriveTokenReady(false);
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
    [applyRestoredDatabaseForScope, toast],
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
    if (lastCloudHashRef.current && curHash === lastCloudHashRef.current) {
      pendingCloudSyncRef.current = false;
      setHasPendingCloudChanges(false);
      return;
    }

    const { hasChanges, envelope } = buildIncrementalDatabaseBackup(
      lastCloudDbRef.current,
      currentDb,
      {
        updatedAt: new Date().toISOString(),
        baseUpdatedAt: lastBackupIsoRef.current || undefined,
        userEmail: googleUser?.email || undefined,
      },
    );
    if (lastCloudDbRef.current && !hasChanges) {
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
    try {
      const nowIso = new Date().toISOString();
      const mergedCloudDb: StudyDatabase = currentDb;
      const mergedHash = computeDatabaseContentHash(mergedCloudDb);

      const savedSync = await saveCloudSyncSnapshot(
        {
          version: 2,
          app: 'Central de Estudos',
          updatedAt: nowIso,
          contentHash: mergedHash,
          userEmail: googleUser?.email || undefined,
          data: mergedCloudDb,
        },
        token,
      );

      lastCloudDbRef.current = mergedCloudDb;
      lastCloudHashRef.current = mergedHash;
      const updatedMeta = recordUploadedFilesInCacheMeta(scope, {
        backupFiles: [savedSync],
        extraPatch: { lastCloudSyncAt: nowIso, lastCloudContentHash: mergedHash, hasPendingCloudSync: false },
      });
      setLastCloudSyncAt(nowIso);
      if (updatedMeta.lastCacheVerifiedAt) setLastCacheVerifiedAt(updatedMeta.lastCacheVerifiedAt);
      if (computeDatabaseContentHash(dbRef.current) !== curHash) {
        pendingCloudSyncRef.current = true;
        setHasPendingCloudChanges(true);
      } else {
        setHasPendingCloudChanges(false);
      }
    } catch (err: any) {
      pendingCloudSyncRef.current = true;
      setHasPendingCloudChanges(true);
      saveSyncMeta(scope, { hasPendingCloudSync: true });
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        setDriveTokenReady(false);
      } else if (String(err?.message || '').includes('DRIVE_FOLDER_PERMISSION')) {
        const pref = getPreferredStudyFolder();
        setDrivePermissionNeedsPicker({
          folderId: pref.id || DEFAULT_STUDY_FOLDER_ID,
          folderName: activeDriveFolderNameRef.current || pref.name,
          count: 1,
        });
      }
    } finally {
      cloudSaveInFlightRef.current = false;
      if (pendingCloudSyncRef.current && syncedScopeOnceRef.current === activeScopeRef.current) {
        window.setTimeout(() => {
          void flushCloudSyncNow();
        }, 350);
      }
    }
  }, [driveConnected, driveTokenReady, googleUser?.email]);

  // Fast debounced auto-sync ONLY for real user edits AFTER initial Drive verification finishes
  useEffect(() => {
    if (!driveConnected || !driveTokenReady) return;
    const scope = activeScopeRef.current;
    if (scope === 'offline_guest') return;
    if (syncedScopeOnceRef.current !== scope) return;
    if (isRestoringRef.current || activeCloudSyncPromiseRef.current || isSyncingDrive) return;
    if (!pendingCloudSyncRef.current) return;

    const timer = window.setTimeout(() => {
      if (
        syncedScopeOnceRef.current !== activeScopeRef.current ||
        activeCloudSyncPromiseRef.current ||
        isRestoringRef.current ||
        !pendingCloudSyncRef.current
      ) {
        return;
      }
      void flushCloudSyncNow();
    }, 900);

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
      toast('Backup incremental automático salvo no Google Drive.');
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        setDriveTokenReady(false);
      } else {
        // Backoff 1 minute before retrying failed periodic backup
        lastAutoBackupAtRef.current = Date.now() - AUTO_BACKUP_INTERVAL_MS + 60 * 1000;
      }
      console.warn('[Auto-backup 30min] Falha ao salvar backup automático no Drive:', err);
    } finally {
      cloudSaveInFlightRef.current = false;
    }
  }, [driveConnected, googleUser?.email, toast]);

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

  const flushLocalFolderSyncNow = useCallback(async () => {
    if (localFolderSyncTimerRef.current) {
      window.clearTimeout(localFolderSyncTimerRef.current);
      localFolderSyncTimerRef.current = null;
    }
    const handle = localFolderHandleRef.current;
    if (!handle || !localFolderWritableRef.current) return;
    const curDb = dbRef.current;
    const syncIso = new Date().toISOString();
    const payload = {
      version: 2,
      app: 'Central de Estudos',
      updatedAt: syncIso,
      contentHash: computeDatabaseContentHash(curDb),
      data: curDb,
    };
    pendingLocalFolderWriteRef.current += 1;
    try {
      const ok = await saveLocalFolderSyncSnapshot(handle, payload);
      if (ok) {
        setLastLocalFolderSyncAt(syncIso);
      }
    } finally {
      pendingLocalFolderWriteRef.current = Math.max(0, pendingLocalFolderWriteRef.current - 1);
    }
  }, []);

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
      // Immediately flush any pending debounced Firebase Firestore writes before tab hides/closes
      if (firebaseSyncTimerRef.current) {
        window.clearTimeout(firebaseSyncTimerRef.current);
        firebaseSyncTimerRef.current = null;
        const currentUser = auth.currentUser;
        if (currentUser?.uid && isEmailAuthorized(currentUser.email) && !firebaseInFlightRef.current) {
          const curDb = dbRef.current;
          const curHash = computeDatabaseContentHash(curDb);
          firebaseInFlightRef.current = true;
          void saveDatabaseToFirestore(currentUser.uid, curDb, curHash, {
            elapsed: timerStateRef.current.elapsed,
            startedAt: timerStateRef.current.startedAt,
            activeTopic: activeTimerTopicRef.current,
          })
            .then((res) => {
              setFirebaseLastError(null);
              saveSyncMeta(scope, {
                lastCloudSyncAt: res.updatedAt,
                lastCloudContentHash: curHash,
                hasPendingCloudSync: false,
              });
            })
            .catch((err) => {
              reportFirebaseErrorRef.current('pagehide-flush', err);
            })
            .finally(() => {
              firebaseInFlightRef.current = false;
            });
        }
      }
      if (localFolderSyncTimerRef.current && localFolderHandleRef.current && localFolderWritableRef.current) {
        void flushLocalFolderSyncNow();
      }
      if (pendingCloudSyncRef.current && driveConnected && driveTokenReady) {
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
        pendingLocalFolderWriteRef.current > 0 ||
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
  }, [driveConnected, driveTokenReady, flushCloudSyncNow, flushLocalFolderSyncNow, hasPendingCloudChanges]);

const AUTHORIZED_EMAILS = [
  'estudos.halberes@gmail.com',
  'ayla.tayna22@gmail.com',
];

function isEmailAuthorized(email?: string | null): boolean {
  if (!email) return false;
  return AUTHORIZED_EMAILS.includes(email.trim().toLowerCase());
}

  // Google Drive Auth Listener - Isolates database & storage per connected account
  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user, token) => {
        const userEmail = user.email || '';
        if (!isEmailAuthorized(userEmail)) {
          void googleSignOut();
          setAuthError(`O e-mail "${userEmail || 'informado'}" não está autorizado a acessar este sistema.`);
          return;
        }

        const newScope = getUserScopeKey(user);
        const checkHasScopedLocal = (scopeKey: string) => {
          try {
            if (localStorage.getItem(getDbStorageKey(scopeKey))) return true;
          } catch {
            // ignore
          }
          return Boolean(loadSyncMeta(scopeKey).lastSavedByteLength);
        };
        let hadScopedLocal = true;
        if (newScope !== activeScopeRef.current) {
          window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
          const prevScope = activeScopeRef.current;
          const prevSnapshot = JSON.stringify(dbRef.current);
          const nowIso = new Date().toISOString();
          persistLocalDatabaseForScope(prevScope, prevSnapshot, nowIso);
          try {
            localStorage.setItem(getTimerStorageKey(prevScope), JSON.stringify(timerStateRef.current));
          } catch {
            // ignore
          }
          if (prevScope === 'offline_guest' && !isUntouchedSeedDatabase(dbRef.current)) {
            pendingGuestDbRef.current = { db: dbRef.current, updatedAtMs: Date.now() };
          }

          hadScopedLocal = checkHasScopedLocal(newScope);
          activeScopeRef.current = newScope;
          setStorageUserScope(newScope);
          const nextDb = loadStoredDatabase(newScope);
          isRestoringRef.current = true;
          skipPersistDbRef.current = nextDb;
          lastPersistedDbRef.current = nextDb;
          setDb(nextDb);
          dbRef.current = nextDb;

          const nextTimer = loadTimer(newScope);
          setTimerState(nextTimer);
          timerStateRef.current = nextTimer;
          setActiveTimerTopic(loadTimerTopic(newScope));
          setQuiz(null);
          const nextMeta = loadSyncMeta(newScope);
          const nextHasPending = hasPersistedPendingSync(nextMeta);
          pendingCloudSyncRef.current = nextHasPending;
          setHasPendingCloudChanges(nextHasPending);
          lastCloudDbRef.current = null;
          lastBackupDbRef.current = null;
          lastCloudHashRef.current = nextMeta.lastCloudContentHash || null;
          lastBackupHashRef.current = nextMeta.lastBackupContentHash || null;
          lastBackupIsoRef.current = nextMeta.lastCloudSyncAt || null;
          setLastCloudSyncAt(nextMeta.lastCloudSyncAt || null);
          setLastCacheVerifiedAt(nextMeta.lastCacheVerifiedAt || null);
          void ensureSeededBlobs();

          void loadScopedDatabaseJson(newScope).then((idbSnap) => {
            if (!idbSnap || activeScopeRef.current !== newScope || activeCloudSyncPromiseRef.current) return;
            let lsHas = false;
            try {
              lsHas = Boolean(localStorage.getItem(getDbStorageKey(newScope)));
            } catch {
              lsHas = false;
            }
            if (!shouldPreferIdbSnapshot(newScope, idbSnap, lsHas)) return;
            try {
              const idbParsed = normalizeAndMergeDatabase(JSON.parse(idbSnap.raw));
              isRestoringRef.current = true;
              skipPersistDbRef.current = idbParsed;
              lastPersistedDbRef.current = idbParsed;
              setDb(idbParsed);
              dbRef.current = idbParsed;
            } catch {
              // ignore
            }
          });
        } else {
          hadScopedLocal = checkHasScopedLocal(newScope);
        }

        setAuthError(null);
        setGoogleUser((prev) =>
          prev?.uid === user.uid && prev?.email === user.email ? prev : user,
        );
        setDriveConnected(true);
        setDriveTokenReady(Boolean(token));

        if (token) {
          if (syncedScopeOnceRef.current !== newScope) {
            void syncAccountWithDriveOnAuth(user, token, newScope, hadScopedLocal);
          }
        } else {
          // OAuth access token expired (~60 min TTL) or cleared across restart while Firebase Auth persisted:
          // Keep account connected and silently renew Drive access in the background.
          setIsRenewingDriveToken(true);
          void refreshDriveAccessTokenSilently({ email: user.email })
            .then((renewedToken) => {
              if (renewedToken && auth.currentUser?.uid === user.uid) {
                setDriveTokenReady(true);
                if (syncedScopeOnceRef.current !== newScope) {
                  void syncAccountWithDriveOnAuth(user, renewedToken, newScope, hadScopedLocal);
                } else if (pendingCloudSyncRef.current) {
                  void flushCloudSyncNow();
                }
              }
            })
            .finally(() => {
              setIsRenewingDriveToken(false);
            });
        }
      },
      () => {
        const newScope = 'offline_guest';
        syncedScopeOnceRef.current = null;
        if (newScope !== activeScopeRef.current) {
          const prevScope = activeScopeRef.current;
          const prevSnapshot = JSON.stringify(dbRef.current);
          persistLocalDatabaseForScope(prevScope, prevSnapshot, new Date().toISOString());
          try {
            localStorage.setItem(getTimerStorageKey(prevScope), JSON.stringify(timerStateRef.current));
          } catch {
            // ignore
          }
          activeScopeRef.current = newScope;
          setStorageUserScope(newScope);
          const nextDb = loadStoredDatabase(newScope);
          isRestoringRef.current = true;
          skipPersistDbRef.current = nextDb;
          lastPersistedDbRef.current = nextDb;
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
          lastCloudDbRef.current = null;
          lastBackupDbRef.current = null;
          lastCloudHashRef.current = null;
          lastBackupHashRef.current = null;
          lastBackupIsoRef.current = null;

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
              const idbParsed = normalizeAndMergeDatabase(JSON.parse(idbSnap.raw));
              isRestoringRef.current = true;
              skipPersistDbRef.current = idbParsed;
              lastPersistedDbRef.current = idbParsed;
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

        setGoogleUser(null);
        setDriveConnected(false);
        setDriveTokenReady(false);
        setDriveFolderUrl(null);
        setLastCloudSyncAt(null);
        setLastCacheVerifiedAt(null);
      },
    );
    return () => unsubscribe();
  }, [flushCloudSyncNow, syncAccountWithDriveOnAuth]);

  // Keep React driveTokenReady synchronized whenever Drive OAuth token is silently renewed or cleared
  useEffect(() => {
    return subscribeDriveTokenChanges((hasToken) => {
      setDriveTokenReady(hasToken);
    });
  }, []);

  // Permanent Google Session Keep-Alive:
  // Keeps Firebase Auth ID token alive and proactively renews Drive OAuth token before the 60-min limit
  // as well as whenever the user returns to the app or regains connectivity.
  useEffect(() => {
    if (!driveConnected) return;

    let cancelled = false;
    const maintainPermanentSession = async (forceRefresh = false) => {
      await ensureFirebaseSessionAlive(false);
      const currentUser = auth.currentUser;
      if (!currentUser || !isEmailAuthorized(currentUser.email)) return;

      const needsRenewal = forceRefresh || isDriveAccessTokenExpiringSoon(10 * 60 * 1000);
      if (!needsRenewal) return;

      setIsRenewingDriveToken(true);
      try {
        const renewed = await refreshDriveAccessTokenSilently({
          email: currentUser.email,
          force: forceRefresh,
        });
        if (cancelled || !renewed || auth.currentUser?.uid !== currentUser.uid) return;

        setDriveTokenReady(true);
        const scope = activeScopeRef.current;
        if (scope !== 'offline_guest' && syncedScopeOnceRef.current !== scope) {
          await syncAccountWithDriveOnAuth(currentUser, renewed, scope, true);
        } else if (pendingCloudSyncRef.current) {
          void flushCloudSyncNow();
        }
      } finally {
        if (!cancelled) {
          setIsRenewingDriveToken(false);
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void maintainPermanentSession(false);
    }, 4 * 60 * 1000);

    const handleWakeOrOnline = () => {
      if (document.visibilityState === 'visible') {
        void maintainPermanentSession(false);
      }
    };
    const handleOnline = () => {
      void maintainPermanentSession(true);
    };

    document.addEventListener('visibilitychange', handleWakeOrOnline);
    window.addEventListener('focus', handleWakeOrOnline);
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleWakeOrOnline);
      window.removeEventListener('focus', handleWakeOrOnline);
      window.removeEventListener('online', handleOnline);
    };
  }, [driveConnected, flushCloudSyncNow, syncAccountWithDriveOnAuth]);

  // Persistent Firestore Auth & OAuth Session Health Monitor (every 30s)
  const validateFirestoreConnectionNow = useCallback(
    async (options?: { silent?: boolean }): Promise<FirestoreAuthHealthReport | null> => {
      if (monitorInFlightRef.current) return null;

      const expectedUid = googleUserRef.current?.uid || auth.currentUser?.uid || null;
      const expectedEmail = googleUserRef.current?.email || auth.currentUser?.email || null;
      const expectsSession = Boolean(expectedUid || driveConnectedRef.current);

      if (!expectsSession) {
        setFirestoreConnectionMonitor((prev) =>
          prev.status === 'idle'
            ? prev
            : {
                status: 'idle',
                code: null,
                message: null,
                lastCheckedAt: null,
                tokenExpiresAt: null,
                consecutiveFailures: 0,
                oauthDriveExpired: false,
                dismissed: false,
              },
        );
        return null;
      }

      monitorInFlightRef.current = true;
      lastMonitorCheckAtRef.current = Date.now();
      const configDiag = getFirestoreConfigDiagnostics();

      try {
        if (expectedEmail && !isEmailAuthorized(expectedEmail)) {
          const checkedAt = new Date().toISOString();
          const unauthorizedReport: FirestoreAuthHealthReport = {
            status: 'inconsistent',
            code: 'auth/unauthorized-email',
            message: `Inconsistência de conta: o e-mail "${expectedEmail}" não está autorizado neste portal.`,
            checkedAt,
            uid: expectedUid,
            email: expectedEmail,
            emailVerified: auth.currentUser?.emailVerified ?? null,
            tokenExpiresAt: null,
          };
          setFirestoreConnectionMonitor((prev) => ({
            status: 'inconsistent',
            code: unauthorizedReport.code,
            message: unauthorizedReport.message,
            lastCheckedAt: checkedAt,
            tokenExpiresAt: null,
            consecutiveFailures: prev.consecutiveFailures + 1,
            oauthDriveExpired: false,
            dismissed:
              prev.status === 'inconsistent' && prev.code === unauthorizedReport.code
                ? prev.dismissed
                : false,
          }));
          return unauthorizedReport;
        }

        const report = await validateFirestoreAuthConnection(expectedUid, expectedEmail);

        let oauthDriveExpired = false;
        if (driveConnectedRef.current && report.status === 'healthy') {
          if (isDriveAccessTokenExpiringSoon(90_000)) {
            await refreshDriveAccessTokenSilently({ email: expectedEmail }).catch(() => null);
          }
          oauthDriveExpired = isDriveAccessTokenExpiringSoon(15_000);
        }

        console.log('[StudyProvider][AuthMonitor] Validação periódica de autenticação Firestore (30s):', {
          status: oauthDriveExpired ? 'oauth-expired' : report.status,
          code: oauthDriveExpired ? 'oauth/drive-token-expired' : report.code,
          uid: report.uid,
          email: report.email,
          emailVerified: report.emailVerified,
          tokenExpiresAt: report.tokenExpiresAt,
          firestoreDatabaseId: configDiag.firestoreDatabaseId,
          oauthDriveExpired,
          checkedAt: report.checkedAt,
        });

        setFirestoreConnectionMonitor((prev) => {
          if (report.status === 'expired' || report.status === 'inconsistent') {
            const sameIssue = prev.status === report.status && prev.code === report.code;
            return {
              status: report.status,
              code: report.code,
              message: report.message,
              lastCheckedAt: report.checkedAt,
              tokenExpiresAt: report.tokenExpiresAt,
              consecutiveFailures: prev.consecutiveFailures + 1,
              oauthDriveExpired,
              dismissed: sameIssue ? prev.dismissed : false,
            };
          }

          if (report.status === 'warning') {
            const nextFailures = prev.consecutiveFailures + 1;
            const sameIssue = prev.status === 'warning' && prev.code === report.code;
            return {
              status: 'warning',
              code: report.code,
              message: report.message,
              lastCheckedAt: report.checkedAt,
              tokenExpiresAt: report.tokenExpiresAt,
              consecutiveFailures: nextFailures,
              oauthDriveExpired,
              dismissed: nextFailures >= 2 ? (sameIssue ? prev.dismissed : false) : true,
            };
          }

          if (oauthDriveExpired) {
            const sameOAuthIssue = prev.code === 'oauth/drive-token-expired';
            return {
              status: 'expired',
              code: 'oauth/drive-token-expired',
              message:
                'A sessão OAuth do Google Drive expirou neste navegador. Clique em "Reconectar Conta Google" para restaurar o envio completo de backups e PDFs.',
              lastCheckedAt: report.checkedAt,
              tokenExpiresAt: report.tokenExpiresAt,
              consecutiveFailures: prev.consecutiveFailures + 1,
              oauthDriveExpired: true,
              dismissed: sameOAuthIssue ? prev.dismissed : false,
            };
          }

          return {
            status: 'healthy',
            code: report.code,
            message: report.message,
            lastCheckedAt: report.checkedAt,
            tokenExpiresAt: report.tokenExpiresAt,
            consecutiveFailures: 0,
            oauthDriveExpired: false,
            dismissed: false,
          };
        });

        if (report.status === 'healthy' && !oauthDriveExpired) {
          setFirebaseLastError((prev) => (prev?.category === 'auth' ? null : prev));
        }

        if (!options?.silent) {
          if (report.status === 'healthy' && !oauthDriveExpired) {
            toast('Autenticação e conexão com o Firebase Firestore validadas!');
          } else if (report.status === 'expired' || report.status === 'inconsistent' || oauthDriveExpired) {
            toast(
              oauthDriveExpired
                ? 'Sessão OAuth do Google Drive expirada. Reconecte sua conta.'
                : report.message,
              true,
            );
          }
        }

        return report;
      } finally {
        monitorInFlightRef.current = false;
      }
    },
    [toast],
  );

  const monitorUid = googleUser?.uid || null;
  useEffect(() => {
    if (!monitorUid && !driveConnected) {
      setFirestoreConnectionMonitor((prev) =>
        prev.status === 'idle'
          ? prev
          : {
              status: 'idle',
              code: null,
              message: null,
              lastCheckedAt: null,
              tokenExpiresAt: null,
              consecutiveFailures: 0,
              oauthDriveExpired: false,
              dismissed: false,
            },
      );
      return;
    }

    const initialTimerId = window.setTimeout(() => {
      void validateFirestoreConnectionNow({ silent: true });
    }, 1500);

    const intervalId = window.setInterval(() => {
      void validateFirestoreConnectionNow({ silent: true });
    }, 30_000);

    const handleResumeCheck = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastMonitorCheckAtRef.current >= 15_000) {
        void validateFirestoreConnectionNow({ silent: true });
      }
    };
    const handleOnlineCheck = () => {
      if (Date.now() - lastMonitorCheckAtRef.current >= 5_000) {
        void validateFirestoreConnectionNow({ silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleResumeCheck);
    window.addEventListener('focus', handleResumeCheck);
    window.addEventListener('online', handleOnlineCheck);

    return () => {
      window.clearTimeout(initialTimerId);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleResumeCheck);
      window.removeEventListener('focus', handleResumeCheck);
      window.removeEventListener('online', handleOnlineCheck);
    };
  }, [driveConnected, monitorUid, validateFirestoreConnectionNow]);

  // Flush locally queued edits to Firebase Firestore & Google Drive automatically as soon as network connectivity is restored
  useEffect(() => {
    let flushInProgress = false;
    const syncPendingOfflineChanges = async (reason: 'online-event' | 'mount-check') => {
      if (flushInProgress) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const currentUser = auth.currentUser;
      const scope = activeScopeRef.current;
      if (!currentUser?.uid || !isEmailAuthorized(currentUser.email) || scope === 'offline_guest') {
        return;
      }

      const meta = loadSyncMeta(scope);
      const hasPending = pendingCloudSyncRef.current || hasPersistedPendingSync(meta);
      if (!hasPending) return;
      if (firebaseHydratedUidRef.current !== currentUser.uid || firebaseInFlightRef.current) {
        return;
      }

      flushInProgress = true;
      try {
        console.log('[StudyProvider][OfflineQueue] Rede detectada — sincronizando alterações locais pendentes com a nuvem...', {
          reason,
          uid: currentUser.uid,
          scope,
        });
        const ok = await syncNowWithFirebase({ silent: true });
        if (ok && reason === 'online-event') {
          toast('Conexão restabelecida! Alterações salvas offline foram sincronizadas com o Firebase.');
        }
        if (driveConnectedRef.current && pendingCloudSyncRef.current) {
          void flushCloudSyncNow();
        }
      } finally {
        flushInProgress = false;
      }
    };

    const handleNetworkRestored = () => {
      window.setTimeout(() => {
        void syncPendingOfflineChanges('online-event');
      }, 800);
    };

    window.addEventListener('online', handleNetworkRestored);
    const startupFlushId = window.setTimeout(() => {
      void syncPendingOfflineChanges('mount-check');
    }, 3500);

    return () => {
      window.clearTimeout(startupFlushId);
      window.removeEventListener('online', handleNetworkRestored);
    };
  }, [flushCloudSyncNow, googleUid, syncNowWithFirebase, toast]);

  const connectGoogleDrive = useCallback(async (options?: { forceAccountPicker?: boolean }): Promise<boolean> => {
    setAuthError(null);
    try {
      const currentUser = auth.currentUser;
      if (currentUser && isEmailAuthorized(currentUser.email) && !options?.forceAccountPicker) {
        setIsRenewingDriveToken(true);
        try {
          const silentToken = await refreshDriveAccessTokenSilently({
            email: currentUser.email,
            force: true,
          });
          if (silentToken) {
            const currentScope = getUserScopeKey(currentUser);
            setDriveConnected(true);
            setGoogleUser((prev) =>
              prev?.uid === currentUser.uid && prev?.email === currentUser.email ? prev : currentUser,
            );
            setDriveTokenReady(true);
            if (syncedScopeOnceRef.current !== currentScope) {
              void syncAccountWithDriveOnAuth(currentUser, silentToken, currentScope, true);
            } else if (pendingCloudSyncRef.current) {
              void flushCloudSyncNow();
            }
            void validateFirestoreConnectionNow({ silent: true });
            toast(`Sessão do Google Drive renovada automaticamente (${currentUser.email})!`);
            return true;
          }
        } finally {
          setIsRenewingDriveToken(false);
        }
      }

      const res = await googleSignIn({
        loginHint: options?.forceAccountPicker ? null : currentUser?.email,
        forceAccountPicker: options?.forceAccountPicker,
      });
      if (res?.user) {
        const userEmail = res.user.email || '';
        if (!isEmailAuthorized(userEmail)) {
          await googleSignOut();
          const msg = `O e-mail "${userEmail || 'informado'}" não está autorizado a acessar este sistema.`;
          setAuthError(msg);
          toast(msg, true);
          return false;
        }

        const newScope = getUserScopeKey(res.user);
        const checkHasScopedLocal = (scopeKey: string) => {
          try {
            if (localStorage.getItem(getDbStorageKey(scopeKey))) return true;
          } catch {
            // ignore
          }
          return Boolean(loadSyncMeta(scopeKey).lastSavedByteLength);
        };
        let hadScopedLocal = true;
        if (newScope !== activeScopeRef.current) {
          window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
          const prevScope = activeScopeRef.current;
          const prevSnapshot = JSON.stringify(dbRef.current);
          persistLocalDatabaseForScope(prevScope, prevSnapshot, new Date().toISOString());
          try {
            localStorage.setItem(getTimerStorageKey(prevScope), JSON.stringify(timerStateRef.current));
          } catch {
            // ignore
          }
          if (prevScope === 'offline_guest' && !isUntouchedSeedDatabase(dbRef.current)) {
            pendingGuestDbRef.current = { db: dbRef.current, updatedAtMs: Date.now() };
          }
          hadScopedLocal = checkHasScopedLocal(newScope);
          activeScopeRef.current = newScope;
          setStorageUserScope(newScope);
          let nextDb = loadStoredDatabase(newScope);
          try {
            const idbSnap = await loadScopedDatabaseJson(newScope);
            if (idbSnap?.raw && shouldPreferIdbSnapshot(newScope, idbSnap, hadScopedLocal)) {
              nextDb = normalizeAndMergeDatabase(JSON.parse(idbSnap.raw));
              hadScopedLocal = true;
            }
          } catch {
            // ignore idb read error on login switch
          }
          isRestoringRef.current = true;
          skipPersistDbRef.current = nextDb;
          lastPersistedDbRef.current = nextDb;
          setDb(nextDb);
          dbRef.current = nextDb;
          const nextTimer = loadTimer(newScope);
          setTimerState(nextTimer);
          timerStateRef.current = nextTimer;
          setActiveTimerTopic(loadTimerTopic(newScope));
          setQuiz(null);
          const nextMeta = loadSyncMeta(newScope);
          const nextHasPending = hasPersistedPendingSync(nextMeta);
          pendingCloudSyncRef.current = nextHasPending;
          setHasPendingCloudChanges(nextHasPending);
          lastCloudDbRef.current = null;
          lastBackupDbRef.current = null;
          lastCloudHashRef.current = nextMeta.lastCloudContentHash || null;
          lastBackupHashRef.current = nextMeta.lastBackupContentHash || null;
          lastBackupIsoRef.current = nextMeta.lastCloudSyncAt || null;
          setLastCloudSyncAt(nextMeta.lastCloudSyncAt || null);
          setLastCacheVerifiedAt(nextMeta.lastCacheVerifiedAt || null);
          void ensureSeededBlobs();
        } else {
          hadScopedLocal = checkHasScopedLocal(newScope);
        }

        setAuthError(null);
        setGoogleUser(res.user);
        setDriveConnected(true);
        setDriveTokenReady(Boolean(res.accessToken));
        toast(`Conectado como ${res.user.email || 'usuário Google'}! Sincronizando dados na nuvem...`);

        if (res.accessToken) {
          void (async () => {
            try {
              const folder = await getOrCreateStudyFolder(res.accessToken);
              const resolvedFolderName = folder.name || getPreferredStudyFolder().name;
              rememberKnownStudyDriveFolderName(resolvedFolderName);
              setActiveDriveFolderName(resolvedFolderName);
              if (folder.webViewLink) setDriveFolderUrl(folder.webViewLink);
              await syncAccountWithDriveOnAuth(res.user, res.accessToken, newScope, hadScopedLocal);
            } catch (driveErr: any) {
              console.warn('[Google Drive] Login OK, mas houve aviso ao preparar pasta do Drive:', driveErr);
            }
          })();
        }
        return true;
      }
      return false;
    } catch (e: any) {
      const msg = e?.message || 'Falha na autenticação com o Google.';
      setAuthError(msg);
      toast(`Erro ao conectar ao Google: ${msg}`, true);
      return false;
    }
  }, [flushCloudSyncNow, syncAccountWithDriveOnAuth, toast]);

  const disconnectGoogleDrive = useCallback(async () => {
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
          const idbParsed = normalizeAndMergeDatabase(JSON.parse(idbSnap.raw));
          isRestoringRef.current = true;
          skipPersistDbRef.current = idbParsed;
          lastPersistedDbRef.current = idbParsed;
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
    setLastFirebaseSyncAt(null);
    setLastCacheVerifiedAt(null);
    activeFirebaseOpsRef.current = 0;
    firebaseInFlightRef.current = false;
    firebaseHydratedUidRef.current = null;
    setIsSyncingFirebase(false);
    clearUserFirestoreCacheState();
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
    let activeToken = await getAccessToken({ allowSilentRefresh: true });
    if (!activeToken) {
      const ok = await connectGoogleDrive();
      if (!ok) return null;
      activeToken = await getAccessToken({ allowSilentRefresh: true });
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
        setPreferredStudyFolder({ id: pickedFolder.id, name: pickedFolder.name });
        setActiveDriveFolderName(pickedFolder.name);
        setDriveFolderUrl(pickedFolder.url || `https://drive.google.com/drive/folders/${pickedFolder.id}`);
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
        setPreferredStudyFolder({ id: resolvedFolder.id, name: resolvedFolder.name });
        setActiveDriveFolderName(resolvedFolder.name);
        setDriveFolderUrl(resolvedFolder.webViewLink || `https://drive.google.com/drive/folders/${resolvedFolder.id}`);
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

      // Map known blobKeys to proper Drive filenames and nested subfolders inside active root folder
      const blobMeta = new Map<string, { filename: string; altNames?: string[]; subfolder?: string | string[] }>();
      const cur = dbRef.current;
      const toDriveSeg = (raw: string) => visibleName(raw).replace(/[\\/]+/g, ' - ').trim();
      Object.entries(cur.pdfFolders || {}).forEach(([folderKey, list]) =>
        list.forEach((f) =>
          blobMeta.set(f.blobKey, {
            filename: f.name,
            subfolder: ['PDFs Pessoais', toDriveSeg(folderKey)].filter(Boolean),
          }),
        ),
      );
      Object.entries(cur.summaryFolders || {}).forEach(([folderKey, list]) =>
        list.forEach((s) =>
          blobMeta.set(s.blobKey, {
            filename: s.name,
            altNames: [`RESUMO - ${s.name}`],
            subfolder: ['Resumos e Mapas', toDriveSeg(folderKey)].filter(Boolean),
          }),
        ),
      );
      Object.entries(cur.laws || {}).forEach(([folderKey, folderObj]) =>
        (folderObj.pdfs || []).forEach((p) =>
          blobMeta.set(p.blobKey, {
            filename: p.name,
            altNames: [`LEI - ${p.name}`],
            subfolder: ['Lei Seca', toDriveSeg(folderKey)].filter(Boolean),
          }),
        ),
      );
      (cur.proofFiles || []).forEach((pf) =>
        blobMeta.set(pf.blobKey, {
          filename: pf.name,
          altNames: [`PROVA - ${pf.name}`],
          subfolder: 'Provas e Gabaritos',
        }),
      );
      (cur.essays || []).forEach((e) => {
        blobMeta.set(e.original_blobKey, {
          filename: `DISCURSIVA - ${e.original_arquivo}`,
          altNames: [e.original_arquivo],
          subfolder: 'Discursivas',
        });
        if (e.corrigido_blobKey && e.corrigido_arquivo) {
          blobMeta.set(e.corrigido_blobKey, {
            filename: `CORRECAO - ${e.corrigido_arquivo}`,
            altNames: [e.corrigido_arquivo],
            subfolder: 'Discursivas',
          });
        }
      });

      const existingDriveFiles = await listAllStudyFilesInDrive(activeToken);
      const existingNamesLower = new Set(existingDriveFiles.map((f) => f.name.toLowerCase()));

      const allBlobs = await getAllFileBlobs();
      let skipped = 0;
      const uploadedDriveFiles: DriveFileInfo[] = [];

      for (const item of allBlobs) {
        const mapped = blobMeta.get(item.key);
        const targetName = mapped?.filename || (item.key.endsWith('.pdf') ? item.key : `${item.key}.pdf`);
        const targetSub = mapped?.subfolder;
        const alreadyExists =
          existingNamesLower.has(targetName.toLowerCase()) ||
          (mapped?.altNames || []).some((alt) => existingNamesLower.has(alt.toLowerCase()));

        if (alreadyExists) {
          skipped += 1;
          continue;
        }
        try {
          const uploadedFile = await uploadFileToDrive(item.blob, targetName, activeToken, targetSub);
          existingNamesLower.add(targetName.toLowerCase());
          uploadedDriveFiles.push(uploadedFile);
          synced += 1;
        } catch (err) {
          console.error(`Erro ao sincronizar ${item.key}:`, err);
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
        saveSyncMeta(activeScopeRef.current, {
          lastCloudSyncAt: nowIso,
          lastCloudContentHash: curHash,
        });
        setLastCloudSyncAt(nowIso);
      }

      if (uploadedDriveFiles.length > 0 || savedSyncFile) {
        const combinedFilesMap = buildDriveSignatureMap([...existingDriveFiles, ...uploadedDriveFiles]);
        const updatedMeta = recordUploadedFilesInCacheMeta(activeScopeRef.current, {
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

      if (synced > 0) {
        toast(`Sincronização concluída! ${synced} novo(s) arquivo(s) e banco de dados salvos no Drive.`);
      } else if (errors === 0) {
        toast(`Banco de dados sincronizado! Todos os ${skipped} arquivo(s) já estão no Google Drive.`);
      } else {
        toast('Banco sincronizado, mas houve falha em alguns arquivos.', true);
      }
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
      toast(`Erro na sincronização: ${err?.message || 'Falha geral'}`, true);
      errors += 1;
    } finally {
      setIsSyncingDrive(false);
    }

    return { synced, errors, folderUrl: folderLink };
  }, [driveFolderUrl, ensureDriveToken, googleUser?.email, toast]);

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
            setPreferredStudyFolder({ id: fallbackResolved.id, name: fallbackResolved.name });
            setActiveDriveFolderName(fallbackResolved.name);
            setDriveFolderUrl(
              fallbackResolved.webViewLink || `https://drive.google.com/drive/folders/${fallbackResolved.id}`,
            );
            setDrivePermissionNeedsPicker(null);
            toast(`Pasta gravável ativada no Google Drive: "${fallbackResolved.name}".`);
            return true;
          }

          let targetId = meta.id;
          let targetName = meta.name;
          let targetUrl = meta.webViewLink || `https://drive.google.com/drive/folders/${meta.id}`;
          const writable = await verifyDriveFolderWritable(meta.id, activeToken);

          if (!writable) {
            // Automatically create/resolve a writable folder with the same name so mobile users never get blocked by Google Picker
            setPreferredStudyFolder({ id: null, name: meta.name || DRIVE_FOLDER_NAME });
            const resolvedWritable = await getOrCreateStudyFolder(activeToken);
            targetId = resolvedWritable.id;
            targetName = resolvedWritable.name;
            targetUrl =
              resolvedWritable.webViewLink || `https://drive.google.com/drive/folders/${resolvedWritable.id}`;
          }

          const scope = activeScopeRef.current;
          const prevSyncedFolder = loadSyncMeta(scope).lastSyncedFolderId;
          setPreferredStudyFolder({ id: targetId, name: targetName });
          setActiveDriveFolderName(targetName);
          setDriveFolderUrl(targetUrl);
          setDrivePermissionNeedsPicker(null);
          if (prevSyncedFolder && prevSyncedFolder !== targetId) {
            invalidateDriveBrowserCacheMeta(scope);
            syncedScopeOnceRef.current = null;
            setLastCacheVerifiedAt(null);
          }
          toast(`Pasta ativa definida para salvar dados e arquivos: "${targetName}".`);
          return true;
        }

        const cleanName = rawNameOrLink || 'Central de Estudos - Materiais';
        setPreferredStudyFolder({ id: null, name: cleanName });
        const resolved = await getOrCreateStudyFolder(activeToken);
        const scope = activeScopeRef.current;
        const prevSyncedFolder = loadSyncMeta(scope).lastSyncedFolderId;
        setPreferredStudyFolder({ id: resolved.id, name: resolved.name });
        setActiveDriveFolderName(resolved.name);
        setDriveFolderUrl(resolved.webViewLink || `https://drive.google.com/drive/folders/${resolved.id}`);
        setDrivePermissionNeedsPicker(null);
        if (prevSyncedFolder && prevSyncedFolder !== resolved.id) {
          invalidateDriveBrowserCacheMeta(scope);
          syncedScopeOnceRef.current = null;
          setLastCacheVerifiedAt(null);
        }
        toast(`Pasta ativa definida para salvar dados e arquivos: "${resolved.name}".`);
        return true;
      } catch (err: any) {
        if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        toast(`Erro ao selecionar pasta do Drive: ${err?.message || 'Falha'}`, true);
        return false;
      }
    },
    [ensureDriveToken, toast],
  );

  const restoreAllFromGoogleDrive = useCallback(
    async (options?: {
      silentIfEmpty?: boolean;
      folderId?: string;
      forceModule?: 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries';
    }): Promise<{
      restoredDb: boolean;
      filesRestored: number;
      orphansImported: number;
      permissionBlockedCount?: number;
    }> => {
      let activeToken = await ensureDriveToken();
      if (!activeToken) return { restoredDb: false, filesRestored: 0, orphansImported: 0, permissionBlockedCount: 0 };

      const targetFolderId = options?.folderId && options.folderId !== 'all' ? options.folderId : undefined;
      const forceModule = options?.forceModule || 'auto';

      setIsSyncingDrive(true);
      try {
        const executeRestore = async (tokenToUse: string) => {
          const folder = await getOrCreateStudyFolder(tokenToUse);
          setActiveDriveFolderName(folder.name || getPreferredStudyFolder().name);
          if (folder.webViewLink) setDriveFolderUrl(folder.webViewLink);

          const [, backupsList, driveFiles] = await Promise.all([
            syncStudySubFoldersInDrive(folder.id, tokenToUse).catch(() => ({})),
            listDatabaseBackupsFromDrive(tokenToUse, { activeFolderId: folder.id }),
            listAllStudyFilesInDrive(tokenToUse),
          ]);

          const latestCloud = await downloadLatestCloudSync(
            tokenToUse,
            targetFolderId
              ? {
                  onlyFolderId: targetFolderId,
                  strictFolder: true,
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

          const scope = activeScopeRef.current;

          const matchingFolderFiles = targetFolderId
            ? driveFiles.filter((df) =>
                targetFolderId === 'root'
                  ? !df.parents || df.parents.length === 0 || df.folderPath === 'Meu Drive (Raiz)'
                  : Boolean(df.parents?.includes(targetFolderId) || df.ancestorFolderIds?.includes(targetFolderId)),
              )
            : driveFiles;

          const hasCloudData = Boolean(latestCloud?.payload || latestCloud?.incrementalDeltas?.length);
          if (!hasCloudData && matchingFolderFiles.length === 0) {
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
          const { updatedDb, filesRestored, orphansImported, permissionBlockedCount } =
            await restoreFilesAndOrphansFromDriveList(
              baseDb,
              driveFiles,
              tokenToUse,
              scope,
              (current, total, label) => setRestoreProgress({ current, total, label }),
              targetFolderId
                ? {
                    onlyFolderId: targetFolderId,
                    forceModule,
                    importFromAnyFolder: true,
                    skipTargetDbBlobs: !restoredDb,
                  }
                : { importFromAnyFolder: !hasStudyFolderFiles, forceModule },
            );

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

          const totalFiles = filesRestored + orphansImported;
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
        if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        toast(`Erro ao restaurar dados do Google Drive: ${err?.message || 'Falha'}`, true);
        return { restoredDb: false, filesRestored: 0, orphansImported: 0, permissionBlockedCount: 0 };
      } finally {
        setRestoreProgress(null);
        setIsSyncingDrive(false);
      }
    },
    [applyRestoredDatabaseForScope, connectGoogleDrive, ensureDriveToken, googleUser?.email, toast],
  );

  const migrateDriveToFirebase = useCallback(async (): Promise<boolean> => {
    const driveRes = await restoreAllFromGoogleDrive({ silentIfEmpty: false });
    const fbOk = await syncNowWithFirebase({ forceFullWrite: true, silent: true });
    if (fbOk) {
      toast(
        driveRes.restoredDb || driveRes.filesRestored + driveRes.orphansImported > 0
          ? `Migração concluída! Todos os dados e backups do Google Drive foram importados e gravados no Firebase Firestore.`
          : `Seus dados já estavam atualizados e foram gravados integralmente no Firebase Firestore!`,
      );
    }
    return fbOk;
  }, [restoreAllFromGoogleDrive, syncNowWithFirebase, toast]);

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

        // Always register picked folder as the active save folder first (and verify write access)
        if (picked.folders.length > 0) {
          const folder = picked.folders[0];
          const writable = await verifyDriveFolderWritable(folder.id, activeToken);
          if (!writable) {
            toast(
              `A pasta "${folder.name}" não permite gravação por este aplicativo. Escolha uma pasta sua com permissão de edição.`,
              true,
            );
            return null;
          }
          const prevSyncedFolder = loadSyncMeta(scope).lastSyncedFolderId;
          setPreferredStudyFolder({ id: folder.id, name: folder.name });
          setActiveDriveFolderName(folder.name);
          setDriveFolderUrl(folder.url || `https://drive.google.com/drive/folders/${folder.id}`);
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
            }

            if (restoredDb || filesRestored > 0 || orphansImported > 0) {
              applyRestoredDatabaseForScope(scope, baseDb, restoredDb ? cloudIso : undefined);
            }

            const total = filesRestored + orphansImported;
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
        if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        toast(`Erro ao abrir seletor do Google Drive: ${err?.message || 'Falha'}`, true);
        return null;
      }
    },
    [applyRestoredDatabaseForScope, ensureDriveToken, restoreAllFromGoogleDrive, toast],
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
        const { updatedDb, filesRestored, orphansImported } = await restoreFilesAndOrphansFromDriveList(
          dbRef.current,
          driveFiles,
          activeToken,
          scope,
          (current, total, label) => setRestoreProgress({ current, total, label }),
          { onlyFolderId: folderId, forceModule: targetModule, skipTargetDbBlobs: true },
        );

        const total = filesRestored + orphansImported;
        if (total > 0) {
          applyRestoredDatabaseForScope(scope, updatedDb);
          toast(`${total} arquivo(s) importado(s) da pasta do Google Drive!`);
        } else {
          toast('Nenhum arquivo novo suportado encontrado nesta pasta (ou já foram importados).');
        }
        return total;
      } catch (err: any) {
        if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        toast(`Erro ao importar pasta do Drive: ${err?.message || 'Falha'}`, true);
        return 0;
      } finally {
        setRestoreProgress(null);
        setIsSyncingDrive(false);
      }
    },
    [applyRestoredDatabaseForScope, ensureDriveToken, toast],
  );

  const recoverFileFromDrive = useCallback(
    async (blobKey: string, filename?: string): Promise<Blob | null> => {
      const existing = await getFileBlob(blobKey, activeScopeRef.current);
      if (existing) return existing;

      const activeToken = await ensureDriveToken();
      if (!activeToken) return null;

      try {
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

        const match =
          driveFiles.find((df) => candidates.includes(df.name.toLowerCase())) ||
          (blobKey.startsWith('drive_')
            ? driveFiles.find((df) => df.id === blobKey.replace(/^drive_/, ''))
            : undefined);

        if (!match) return null;
        const blob = await downloadDriveFileBlob(match.id, activeToken, match.mimeType);
        await saveFileBlob(blobKey, blob, activeScopeRef.current);
        return blob;
      } catch (err: any) {
        if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        return null;
      }
    },
    [ensureDriveToken],
  );

  const autoSyncFileToDrive = useCallback(
    async (
      fileOrBlob: File | Blob,
      filename: string,
      subfolderName?: string | string[],
    ): Promise<boolean> => {
      let savedToLocalDisk = false;
      if (localFolderHandleRef.current && localFolderWritableRef.current) {
        savedToLocalDisk = await writeFileToLocalDirectory(
          localFolderHandleRef.current,
          subfolderName,
          filename,
          fileOrBlob,
        );
        if (savedToLocalDisk) {
          setLastLocalFolderSyncAt(new Date().toISOString());
        }
      }

      if (!driveConnected) return savedToLocalDisk;
      const notifyThrottle = (msg: string) => {
        const now = Date.now();
        if (now - lastDriveUploadAlertAtRef.current > 4000) {
          lastDriveUploadAlertAtRef.current = now;
          toast(msg, true);
        }
      };

      const token = await getAccessToken();
      if (!token) {
        setDriveTokenReady(false);
        notifyThrottle(
          'Sua permissão temporária do Google Drive expirou. Clique em "Reconectar Drive" em Backup e Restauração para enviar arquivos na nuvem.',
        );
        return savedToLocalDisk;
      }
      setDriveTokenReady(true);

      try {
        const uploaded = await uploadFileToDrive(fileOrBlob, filename, token, subfolderName);
        const updatedMeta = recordUploadedFilesInCacheMeta(activeScopeRef.current, {
          driveFiles: [uploaded],
        });
        if (updatedMeta.lastCacheVerifiedAt) setLastCacheVerifiedAt(updatedMeta.lastCacheVerifiedAt);
        return true;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('TOKEN_EXPIRED')) {
          setDriveTokenReady(false);
          notifyThrottle(
            'Sua sessão do Google Drive expirou. Reconecte a conta em Backup e Restauração para enviar o arquivo.',
          );
        } else if (msg.includes('DRIVE_FOLDER_PERMISSION')) {
          notifyThrottle(
            `O Google Drive bloqueou o envio para a pasta "${activeDriveFolderNameRef.current}". Em Backup e Restauração, clique em "Escolher pasta de salvamento no Drive" para liberar a gravação.`,
          );
        } else {
          notifyThrottle(`Falha ao salvar "${filename}" no Google Drive: ${msg || 'Erro no envio'}`);
        }
        console.warn(`[Auto-sync Drive] Falha ao enviar ${filename}:`, err);
        return savedToLocalDisk;
      }
    },
    [driveConnected, toast],
  );

  const syncAllDatabaseAndFilesToLocalFolder = useCallback(
    async (
      rootHandle: FileSystemDirectoryHandle,
      targetDb: StudyDatabase,
      scope: string,
      existingEntries: LocalDiskFileEntry[] = [],
    ): Promise<number> => {
      await ensureLocalStudySubfolders(rootHandle);

      const existingNames = new Set<string>();
      for (const e of existingEntries) {
        existingNames.add(normalizeFileLookup(e.name));
        existingNames.add(normalizeFileLookup(stripDrivePrefix(e.name)));
      }

      let writtenFilesCount = 0;
      const toLocalSeg = (raw: string) => visibleName(raw).replace(/[\\/]+/g, ' - ').trim();
      const knownBackupRoots = [
        rootHandle.name,
        getPreferredStudyFolder().name,
        ...getKnownStudyDriveFolderNames(),
      ];

      // 1. Write Backups/central_estudos_sync_latest.json
      const nowIso = new Date().toISOString();
      const syncPayload = {
        version: 2,
        app: 'Central de Estudos',
        updatedAt: nowIso,
        contentHash: computeDatabaseContentHash(targetDb),
        data: targetDb,
      };
      const okSync = await saveLocalFolderSyncSnapshot(rootHandle, syncPayload);
      if (okSync) writtenFilesCount += 1;

      // 2. Write referenced blobs from IndexedDB into their respective local subfolders
      const blobMeta = new Map<
        string,
        { filename: string; altNames?: string[]; subfolder?: string | string[] }
      >();

      Object.entries(targetDb.pdfFolders || {}).forEach(([folderKey, list]) => {
        if (isReservedBackupFolderName(folderKey, knownBackupRoots, list)) return;
        list.forEach((f) =>
          blobMeta.set(f.blobKey, {
            filename: f.name,
            subfolder: ['PDFs Pessoais', toLocalSeg(folderKey)].filter(Boolean),
          }),
        );
      });
      Object.entries(targetDb.summaryFolders || {}).forEach(([folderKey, list]) =>
        list.forEach((s) =>
          blobMeta.set(s.blobKey, {
            filename: s.name,
            altNames: [`RESUMO - ${s.name}`],
            subfolder: ['Resumos e Mapas', toLocalSeg(folderKey)].filter(Boolean),
          }),
        ),
      );
      Object.entries(targetDb.laws || {}).forEach(([folderKey, folderObj]) =>
        (folderObj.pdfs || []).forEach((p) =>
          blobMeta.set(p.blobKey, {
            filename: p.name,
            altNames: [`LEI - ${p.name}`],
            subfolder: ['Lei Seca', toLocalSeg(folderKey)].filter(Boolean),
          }),
        ),
      );
      for (const pf of targetDb.proofFiles || []) {
        blobMeta.set(pf.blobKey, {
          filename: `PROVA - ${pf.name}`,
          altNames: [pf.name],
          subfolder:
            pf.bank && pf.bank !== 'Geral'
              ? ['Provas e Gabaritos', toLocalSeg(pf.bank)]
              : 'Provas e Gabaritos',
        });
        if (pf.gabarito_conteudo) {
          const gabName = pf.gabarito_arquivo || `${pf.name}.gabarito.txt`;
          if (!existingNames.has(normalizeFileLookup(gabName))) {
            const okGab = await writeFileToLocalDirectory(
              rootHandle,
              pf.bank ? ['Provas e Gabaritos', toLocalSeg(pf.bank)] : 'Provas e Gabaritos',
              gabName,
              new Blob([pf.gabarito_conteudo], { type: 'text/plain;charset=utf-8' }),
            );
            if (okGab) writtenFilesCount += 1;
          }
        }
      }
      for (const e of targetDb.essays || []) {
        blobMeta.set(e.original_blobKey, {
          filename: `DISCURSIVA - ${e.original_arquivo}`,
          altNames: [e.original_arquivo],
          subfolder: 'Discursivas',
        });
        if (e.corrigido_blobKey && e.corrigido_arquivo) {
          blobMeta.set(e.corrigido_blobKey, {
            filename: `CORRECAO - ${e.corrigido_arquivo}`,
            altNames: [e.corrigido_arquivo],
            subfolder: 'Discursivas',
          });
        }
      }

      if (blobMeta.size > 0) {
        const allBlobs = await getAllFileBlobs(scope);
        for (const item of allBlobs) {
          const mapped = blobMeta.get(item.key);
          if (!mapped) continue;
          const candidates = [mapped.filename, ...(mapped.altNames || [])];
          const alreadyOnDisk = candidates.some(
            (c) =>
              existingNames.has(normalizeFileLookup(c)) ||
              existingNames.has(normalizeFileLookup(stripDrivePrefix(c))),
          );
          if (alreadyOnDisk) continue;
          const ok = await writeFileToLocalDirectory(
            rootHandle,
            mapped.subfolder,
            mapped.filename,
            item.blob,
          );
          if (ok) {
            existingNames.add(normalizeFileLookup(mapped.filename));
            writtenFilesCount += 1;
          }
        }
      }

      // 3. Write Cronogramas .txt files
      const activeWeekKey = resolveActiveScheduleWeekKey(
        targetDb.scheduleDayDates,
        targetDb.schedule,
      );
      const activeWeekMeta = buildScheduleWeekMetadata(activeWeekKey, targetDb.scheduleDayDates);
      const activeScheduleTxt = serializeScheduleWeekToText(
        activeWeekMeta.weekKey,
        targetDb.schedule,
        activeWeekMeta.dayDates,
      );
      await writeFileToLocalDirectory(
        rootHandle,
        'Cronogramas',
        activeWeekMeta.fileName,
        activeScheduleTxt,
      );

      for (const rec of Object.values(targetDb.weeklySchedules || {})) {
        if (!rec || rec.weekKey === activeWeekMeta.weekKey) continue;
        const wkTxt = serializeScheduleWeekToText(
          rec.weekKey,
          rec.schedule,
          rec.scheduleDayDates || {},
        );
        await writeFileToLocalDirectory(rootHandle, 'Cronogramas', rec.fileName, wkTxt);
      }

      // 4. Write Datas e Locais & Editais .txt files
      const allContests = targetDb.contests || [];
      if (allContests.length > 0) {
        const masterTxt = serializeAllContestsMasterTxt(allContests);
        await writeFileToLocalDirectory(
          rootHandle,
          'Datas e Locais',
          'DATAS E LOCAIS - Controle Geral de Inscricoes Boletos e Locais.txt',
          masterTxt,
        );
        for (const c of allContests) {
          const regTxt = serializeContestRegistrationTxt(c);
          await writeFileToLocalDirectory(
            rootHandle,
            'Datas e Locais',
            buildContestTxtFileName(c),
            regTxt,
          );
          if ((c.edital_pontos?.length || 0) > 0) {
            const editalTxt = serializeContestEditalTxt(c);
            await writeFileToLocalDirectory(
              rootHandle,
              'Editais',
              buildEditalTxtFileName(c),
              editalTxt,
            );
          }
        }
      }

      setLastLocalFolderSyncAt(nowIso);
      return writtenFilesCount;
    },
    [],
  );

  const processScannedLocalFolder = useCallback(
    async (
      entries: LocalDiskFileEntry[],
      summary: LocalFolderScanSummary,
      handle: FileSystemDirectoryHandle | null,
      writable: boolean,
    ): Promise<boolean> => {
      setIsSyncingLocalFolder(true);
      try {
        window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
        const scope = activeScopeRef.current;
        rememberKnownStudyDriveFolderName(summary.rootFolderName);

        // 1. Check for database backups inside the local folder
        const backupRes = await extractLatestBackupFromLocalFiles(entries);
        const hasDiskBackup = Boolean(
          backupRes.basePayload || backupRes.incrementalDeltas.length > 0,
        );

        let workingDb = dbRef.current;
        const localHasCustom = !isUntouchedSeedDatabase(workingDb);

        if (hasDiskBackup) {
          let diskDb = backupRes.basePayload
            ? normalizeAndMergeDatabase(backupRes.basePayload)
            : workingDb;
          if (backupRes.incrementalDeltas.length > 0) {
            for (const incDelta of backupRes.incrementalDeltas) {
              diskDb = applyIncrementalDeltaToDatabase(diskDb, incDelta);
            }
          }

          // If current local browser DB also has custom edits not yet in diskDb, merge them non-destructively
          if (
            localHasCustom &&
            computeDatabaseContentHash(workingDb) !== computeDatabaseContentHash(diskDb)
          ) {
            const syncMeta = loadSyncMeta(scope);
            const localEditMs = Date.parse(syncMeta.lastLocalEditAt || '') || 0;
            if (localEditMs > backupRes.baseTimestampMs + 1500) {
              const localDiff = buildIncrementalDatabaseBackup(diskDb, workingDb, {
                updatedAt: new Date(localEditMs || Date.now()).toISOString(),
              });
              if (localDiff.hasChanges) {
                const additiveEnvelope = {
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
                diskDb = applyIncrementalDeltaToDatabase(diskDb, additiveEnvelope);
              }
            }
          }
          workingDb = diskDb;
        }

        // 2. Restore referenced blobs and import all study files from the local folder
        const { driveFiles, fileById } = toDriveCompatibleEntries(entries);
        const { updatedDb, filesRestored, orphansImported, healedLawsCount } =
          await restoreFilesAndOrphansFromDriveList(
            workingDb,
            driveFiles,
            '',
            scope,
            (current, total, label) => setRestoreProgress({ current, total, label }),
            {
              importFromAnyFolder: true,
              localFileMap: fileById,
            },
          );

        applyRestoredDatabaseForScope(scope, updatedDb);

        localFolderHandleRef.current = handle;
        localFolderWritableRef.current = writable;
        setLocalFolderConnected(true);
        setLocalFolderWritable(writable);
        setLocalFolderName(summary.rootFolderName);
        setLocalFolderSummary(summary);
        setSavedLocalFolderMetaState(summary);
        if (handle) {
          setHasSavedLocalFolderHandle(true);
        }

        const syncIsoNow = new Date().toISOString();
        const baselineIso = backupRes.baseTimestampMs
          ? new Date(backupRes.baseTimestampMs).toISOString()
          : syncIsoNow;
        lastLocalBackupDbRef.current = updatedDb;
        lastLocalBackupHashRef.current = computeDatabaseContentHash(updatedDb);
        lastLocalBackupIsoRef.current = baselineIso;
        lastLocalAutoBackupAtRef.current = Date.now();
        if (hasDiskBackup || writable) {
          setLastLocalIncrementalBackupAt(baselineIso);
        }

        // 3. If writable directory handle, ensure all subfolders exist and write updated state/files to disk
        if (handle && writable) {
          await syncAllDatabaseAndFilesToLocalFolder(handle, updatedDb, scope, entries);
          const refreshed = await scanDirectoryHandle(handle, writable);
          setLocalFolderSummary(refreshed.summary);
          setSavedLocalFolderMetaState(refreshed.summary);
        } else {
          setLastLocalFolderSyncAt(syncIsoNow);
        }

        const totalLoaded = filesRestored + orphansImported;
        toast(
          hasDiskBackup
            ? `Pasta local "${summary.rootFolderName}" carregada! Backup e ${totalLoaded} arquivo(s) identificados e sincronizados localmente.`
            : totalLoaded > 0 || healedLawsCount > 0
            ? `Pasta local "${summary.rootFolderName}" conectada! ${totalLoaded} arquivo(s) identificado(s) e salvo(s) localmente.`
            : `Pasta local "${summary.rootFolderName}" vinculada! Todas as alterações e pastas serão salvas localmente.`,
        );
        return true;
      } catch (err: any) {
        toast(`Erro ao ler pasta local: ${err?.message || 'Falha'}`, true);
        return false;
      } finally {
        setRestoreProgress(null);
        setIsSyncingLocalFolder(false);
      }
    },
    [applyRestoredDatabaseForScope, syncAllDatabaseAndFilesToLocalFolder, toast],
  );

  // Silent auto-reconnect when the browser session still holds permission for the saved local folder
  useEffect(() => {
    if (autoReconnectedLocalRef.current) return;
    autoReconnectedLocalRef.current = true;
    if (auth.currentUser || localFolderHandleRef.current) return;
    void reconnectSavedLocalDirectory(false).then(async (reconnected) => {
      if (!reconnected || auth.currentUser || localFolderHandleRef.current) return;
      try {
        const { entries, summary } = await scanDirectoryHandle(
          reconnected.handle,
          reconnected.writable,
        );
        await processScannedLocalFolder(
          entries,
          summary,
          reconnected.handle,
          reconnected.writable,
        );
      } catch {
        // Ignore silent reconnect error; user can manually reconnect from Login or Backup
      }
    });
  }, [processScannedLocalFolder]);

  const connectLocalStudyFolder = useCallback(async (): Promise<{
    ok: boolean;
    needsInputFallback?: boolean;
    aborted?: boolean;
  }> => {
    const res = await pickLocalStudyDirectory();
    if (res.aborted) return { ok: false, aborted: true };
    if (res.needsInputFallback || !res.handle) {
      return { ok: false, needsInputFallback: true };
    }
    const { entries, summary } = await scanDirectoryHandle(res.handle, Boolean(res.writable));
    const ok = await processScannedLocalFolder(
      entries,
      summary,
      res.handle,
      Boolean(res.writable),
    );
    return { ok };
  }, [processScannedLocalFolder]);

  const reconnectLocalStudyFolder = useCallback(async (): Promise<boolean> => {
    const reconnected = await reconnectSavedLocalDirectory(true);
    if (!reconnected) {
      const picked = await connectLocalStudyFolder();
      return picked.ok;
    }
    const { entries, summary } = await scanDirectoryHandle(
      reconnected.handle,
      reconnected.writable,
    );
    return processScannedLocalFolder(
      entries,
      summary,
      reconnected.handle,
      reconnected.writable,
    );
  }, [connectLocalStudyFolder, processScannedLocalFolder]);

  const importLocalStudyFolderFromFiles = useCallback(
    async (files: FileList | File[]): Promise<boolean> => {
      if (!files || files.length === 0) return false;
      const { entries, summary } = scanFileListFromInput(files);
      return processScannedLocalFolder(entries, summary, null, false);
    },
    [processScannedLocalFolder],
  );

  const syncNowWithLocalStudyFolder = useCallback(async (): Promise<boolean> => {
    if (localFolderHandleRef.current) {
      const { entries, summary } = await scanDirectoryHandle(
        localFolderHandleRef.current,
        localFolderWritableRef.current,
      );
      return processScannedLocalFolder(
        entries,
        summary,
        localFolderHandleRef.current,
        localFolderWritableRef.current,
      );
    }
    const reconnected = await reconnectSavedLocalDirectory(true);
    if (reconnected) {
      const { entries, summary } = await scanDirectoryHandle(
        reconnected.handle,
        reconnected.writable,
      );
      return processScannedLocalFolder(
        entries,
        summary,
        reconnected.handle,
        reconnected.writable,
      );
    }
    const picked = await connectLocalStudyFolder();
    return picked.ok;
  }, [connectLocalStudyFolder, processScannedLocalFolder]);

  const disconnectLocalStudyFolder = useCallback(
    async (forgetSaved = false) => {
      window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
      if (localFolderSyncTimerRef.current) {
        window.clearTimeout(localFolderSyncTimerRef.current);
        localFolderSyncTimerRef.current = null;
      }
      if (localFolderHandleRef.current && localFolderWritableRef.current) {
        const handle = localFolderHandleRef.current;
        const curDb = dbRef.current;
        const nowIso = new Date().toISOString();
        const curHash = computeDatabaseContentHash(curDb);
        const baselineDb = lastLocalBackupDbRef.current;
        if (baselineDb && lastLocalBackupHashRef.current !== curHash) {
          const { hasChanges, envelope } = buildIncrementalDatabaseBackup(baselineDb, curDb, {
            updatedAt: nowIso,
            baseUpdatedAt: lastLocalBackupIsoRef.current || undefined,
          });
          if (hasChanges) {
            await saveLocalFolderBackupFile(handle, envelope).catch(() => {});
          }
        }
        await saveLocalFolderSyncSnapshot(handle, {
          version: 2,
          app: 'Central de Estudos',
          updatedAt: nowIso,
          contentHash: curHash,
          data: curDb,
        }).catch(() => {});
      }
      localFolderHandleRef.current = null;
      localFolderWritableRef.current = false;
      lastLocalBackupDbRef.current = null;
      lastLocalBackupHashRef.current = null;
      lastLocalBackupIsoRef.current = null;
      setLocalFolderConnected(false);
      setLocalFolderWritable(false);
      setLastLocalIncrementalBackupAt(null);
      if (forgetSaved) {
        await forgetSavedLocalDirectory();
        setHasSavedLocalFolderHandle(false);
        setSavedLocalFolderMetaState(null);
        setLocalFolderName(null);
        setLocalFolderSummary(null);
        toast('Vínculo com a pasta local removido.');
      } else {
        toast('Pasta local desconectada (seus dados permanecem salvos localmente).');
      }
    },
    [toast],
  );

  const runLocalIncrementalBackupIfDue = useCallback(async () => {
    const LOCAL_INCREMENTAL_BACKUP_INTERVAL_MS = 10 * 60 * 1000;
    const handle = localFolderHandleRef.current;
    if (!handle || !localFolderWritableRef.current) return;
    if (isRestoringRef.current || localAutoBackupInFlightRef.current) return;
    if (Date.now() - lastLocalAutoBackupAtRef.current < LOCAL_INCREMENTAL_BACKUP_INTERVAL_MS) return;

    const currentDb = dbRef.current;
    const curHash = computeDatabaseContentHash(currentDb);
    const baselineDb = lastLocalBackupDbRef.current;
    const nowIso = new Date().toISOString();
    const { hasChanges, envelope } = buildIncrementalDatabaseBackup(baselineDb, currentDb, {
      updatedAt: nowIso,
      baseUpdatedAt: lastLocalBackupIsoRef.current || undefined,
    });

    // Skip creating redundant dated backup if nothing changed since last local backup
    if ((lastLocalBackupHashRef.current && curHash === lastLocalBackupHashRef.current) || (baselineDb && !hasChanges)) {
      lastLocalAutoBackupAtRef.current = Date.now();
      return;
    }

    localAutoBackupInFlightRef.current = true;
    pendingLocalFolderWriteRef.current += 1;
    try {
      const savedIncName = await saveLocalFolderBackupFile(handle, envelope);
      const syncOk = await saveLocalFolderSyncSnapshot(handle, {
        version: 2,
        app: 'Central de Estudos',
        updatedAt: nowIso,
        contentHash: curHash,
        data: currentDb,
      });

      if (savedIncName || syncOk) {
        lastLocalAutoBackupAtRef.current = Date.now();
        lastLocalBackupDbRef.current = currentDb;
        lastLocalBackupHashRef.current = curHash;
        lastLocalBackupIsoRef.current = nowIso;
        setLastLocalIncrementalBackupAt(nowIso);
        setLastLocalFolderSyncAt(nowIso);
        if (savedIncName) {
          setLocalFolderSummary((prev) =>
            prev
              ? {
                  ...prev,
                  totalFiles: prev.totalFiles + 1,
                  categories: {
                    ...prev.categories,
                    backups: (prev.categories.backups || 0) + 1,
                  },
                }
              : prev,
          );
          toast(`Backup incremental local automático (10 min) salvo em "${handle.name}/Backups".`);
        }
      } else {
        lastLocalAutoBackupAtRef.current = Date.now() - LOCAL_INCREMENTAL_BACKUP_INTERVAL_MS + 60 * 1000;
      }
    } catch (err) {
      lastLocalAutoBackupAtRef.current = Date.now() - LOCAL_INCREMENTAL_BACKUP_INTERVAL_MS + 60 * 1000;
      console.warn('[Auto-backup local 10min] Falha ao salvar backup incremental local:', err);
    } finally {
      pendingLocalFolderWriteRef.current = Math.max(0, pendingLocalFolderWriteRef.current - 1);
      localAutoBackupInFlightRef.current = false;
    }
  }, [toast]);

  // Automatic incremental backup to connected Local Folder every 10 minutes
  useEffect(() => {
    if (!localFolderConnected || !localFolderWritable) return;
    const intervalId = window.setInterval(() => {
      void runLocalIncrementalBackupIfDue();
    }, 30 * 1000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void runLocalIncrementalBackupIfDue();
      }
    };
    document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('focus', onFocusOrVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('focus', onFocusOrVisible);
    };
  }, [localFolderConnected, localFolderWritable, runLocalIncrementalBackupIfDue]);

  const saveLocalIncrementalBackupNow = useCallback(async (): Promise<boolean> => {
    window.dispatchEvent(new CustomEvent('central-estudos:flush-drafts'));
    const handle = localFolderHandleRef.current;
    if (!handle || !localFolderWritableRef.current) {
      toast(
        localFolderConnected
          ? 'A pasta atual foi importada em modo somente leitura. Use "Selecionar Pasta Local" para permitir gravação direta.'
          : 'Selecione uma Pasta Local para gravar backups incrementais diretamente no computador.',
        true,
      );
      return false;
    }

    const currentDb = dbRef.current;
    const curHash = computeDatabaseContentHash(currentDb);
    const baselineDb = lastLocalBackupDbRef.current;
    const nowIso = new Date().toISOString();
    const { hasChanges, envelope } = buildIncrementalDatabaseBackup(baselineDb, currentDb, {
      updatedAt: nowIso,
      baseUpdatedAt: lastLocalBackupIsoRef.current || undefined,
    });

    if (baselineDb && (!hasChanges || lastLocalBackupHashRef.current === curHash)) {
      await saveLocalFolderSyncSnapshot(handle, {
        version: 2,
        app: 'Central de Estudos',
        updatedAt: nowIso,
        contentHash: curHash,
        data: currentDb,
      }).catch(() => false);
      toast('Nenhuma alteração desde o último backup incremental local — cópias existentes preservadas.');
      return true;
    }

    setIsSyncingLocalFolder(true);
    pendingLocalFolderWriteRef.current += 1;
    try {
      const savedName = await saveLocalFolderBackupFile(handle, envelope);
      const syncOk = await saveLocalFolderSyncSnapshot(handle, {
        version: 2,
        app: 'Central de Estudos',
        updatedAt: nowIso,
        contentHash: curHash,
        data: currentDb,
      });
      if (!savedName && !syncOk) {
        toast('Não foi possível gravar o backup incremental na pasta local.', true);
        return false;
      }
      lastLocalAutoBackupAtRef.current = Date.now();
      lastLocalBackupDbRef.current = currentDb;
      lastLocalBackupHashRef.current = curHash;
      lastLocalBackupIsoRef.current = nowIso;
      setLastLocalIncrementalBackupAt(nowIso);
      setLastLocalFolderSyncAt(nowIso);
      const refreshed = await scanDirectoryHandle(handle, localFolderWritableRef.current);
      setLocalFolderSummary(refreshed.summary);
      setSavedLocalFolderMetaState(refreshed.summary);
      toast(
        `Backup incremental local salvo em "${handle.name}/Backups" (${envelope.changesSummary.addedOrUpdated} item(ns) em ${envelope.changedSections.length} seção(ões))!`,
      );
      return true;
    } catch (err: any) {
      toast(`Erro ao salvar backup incremental local: ${err?.message || 'Falha'}`, true);
      return false;
    } finally {
      pendingLocalFolderWriteRef.current = Math.max(0, pendingLocalFolderWriteRef.current - 1);
      setIsSyncingLocalFolder(false);
    }
  }, [localFolderConnected, toast]);

  const listLocalBackups = useCallback(async (): Promise<LocalBackupFileInfo[]> => {
    const handle = localFolderHandleRef.current;
    if (!handle) return [];
    try {
      return await listLocalFolderBackups(handle);
    } catch {
      return [];
    }
  }, []);

  const restoreLocalBackup = useCallback(
    async (backup: LocalBackupFileInfo): Promise<boolean> => {
      const handle = localFolderHandleRef.current;
      if (!handle) {
        toast('Nenhuma pasta local conectada para restaurar.', true);
        return false;
      }
      setIsSyncingLocalFolder(true);
      try {
        const snapshot = await readLocalBackupFile(handle, backup.name, backup.subfolder);
        if (!snapshot || typeof snapshot !== 'object') {
          throw new Error('Arquivo de backup local inválido ou corrompido.');
        }

        const isIncremental = isIncrementalBackupPayload(snapshot);
        let merged: StudyDatabase;
        if (isIncremental) {
          const { entries } = await scanDirectoryHandle(handle, localFolderWritableRef.current);
          const backupRes = await extractLatestBackupFromLocalFiles(entries);
          let baseDb = backupRes.basePayload
            ? normalizeAndMergeDatabase(backupRes.basePayload)
            : dbRef.current;
          if (backupRes.incrementalDeltas.length > 0) {
            for (const incDelta of backupRes.incrementalDeltas) {
              if ((Date.parse(incDelta.updatedAt || '') || 0) <= backup.modifiedMs) {
                baseDb = applyIncrementalDeltaToDatabase(baseDb, incDelta);
              }
            }
          }
          merged = applyIncrementalDeltaToDatabase(baseDb, snapshot);
        } else {
          merged = normalizeAndMergeDatabase(snapshot);
        }

        const scope = activeScopeRef.current;
        const restoredIso =
          snapshot?.updatedAt || snapshot?.exportedAt || new Date().toISOString();
        applyRestoredDatabaseForScope(scope, merged, restoredIso);
        const restoredHash = computeDatabaseContentHash(merged);
        lastLocalBackupDbRef.current = merged;
        lastLocalBackupHashRef.current = restoredHash;
        lastLocalBackupIsoRef.current = restoredIso;
        lastLocalAutoBackupAtRef.current = Date.now();
        setLastLocalIncrementalBackupAt(restoredIso);
        setLastLocalFolderSyncAt(new Date().toISOString());

        toast(
          isIncremental
            ? `Alterações incrementais de "${backup.name}" mescladas sem apagar os demais dados!`
            : `Backup local "${backup.name}" restaurado com sucesso!`,
        );
        return true;
      } catch (err: any) {
        toast(`Falha ao restaurar backup local: ${err?.message || 'Erro'}`, true);
        return false;
      } finally {
        setIsSyncingLocalFolder(false);
      }
    },
    [applyRestoredDatabaseForScope, toast],
  );

  const deleteLocalBackup = useCallback(
    async (backup: LocalBackupFileInfo): Promise<boolean> => {
      const handle = localFolderHandleRef.current;
      if (!handle || !localFolderWritableRef.current) {
        toast('Pasta local em modo somente leitura ou desconectada.', true);
        return false;
      }
      const removed = await deleteLocalBackupFile(handle, backup.name, backup.subfolder);
      if (removed) {
        const refreshed = await scanDirectoryHandle(handle, localFolderWritableRef.current).catch(
          () => null,
        );
        if (refreshed) {
          setLocalFolderSummary(refreshed.summary);
          setSavedLocalFolderMetaState(refreshed.summary);
        }
        toast(`Backup local "${backup.name}" excluído.`);
        return true;
      }
      toast(`Não foi possível excluir "${backup.name}".`, true);
      return false;
    },
    [toast],
  );

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
      toast(
        `Backup salvo no Drive (${envelope.changesSummary.addedOrUpdated} item(ns) alterado(s) em ${envelope.changedSections.length} seção(ões))!`,
      );
      return true;
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
      toast(`Erro ao salvar backup no Drive: ${err?.message || 'Falha no upload'}`, true);
      return false;
    } finally {
      setIsSyncingDrive(false);
    }
  }, [ensureDriveToken, googleUser?.email, toast]);

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
        const { updatedDb, filesRestored, orphansImported } = await restoreFilesAndOrphansFromDriveList(
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
        if (String(err?.message || '').includes('TOKEN_EXPIRED')) setDriveTokenReady(false);
        toast(`Falha ao restaurar backup da nuvem: ${err?.message || 'Erro'}`, true);
        return false;
      } finally {
        setRestoreProgress(null);
        setIsSyncingDrive(false);
      }
    },
    [applyRestoredDatabaseForScope, ensureDriveToken, toast],
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
      const targetSim = db.submittedSimulations.find((s) => s.id === simulationId);
      const ok = await requestConfirm({
        title: 'Excluir simulado enviado',
        description:
          'Excluir este simulado enviado e apagar também suas tentativas e estatísticas salvas?',
        confirmLabel: 'Excluir simulado',
        danger: true,
      });
      if (!ok) return;

      const removedAttempts = db.completedSimulations.filter((c) => c.prova_id === simulationId).length;
      if (targetSim?.arquivo && localFolderHandleRef.current && localFolderWritableRef.current) {
        const stillReferencedInProofs = db.proofFiles.some(
          (p) => normalizeFileLookup(p.name) === normalizeFileLookup(targetSim.arquivo),
        );
        await deleteFileFromLocalDirectory(localFolderHandleRef.current, 'Questões', targetSim.arquivo);
        if (!stillReferencedInProofs) {
          await deleteFileFromLocalDirectory(
            localFolderHandleRef.current,
            'Provas e Gabaritos',
            targetSim.arquivo,
          );
          await deleteFileFromLocalDirectory(
            localFolderHandleRef.current,
            'Provas e Gabaritos',
            `PROVA - ${targetSim.arquivo}`,
          );
          await deleteFileFromLocalDirectory(
            localFolderHandleRef.current,
            'Provas e Gabaritos',
            `${targetSim.arquivo}.gabarito.txt`,
          );
          await deleteFileFromLocalDirectory(
            localFolderHandleRef.current,
            'Provas e Gabaritos',
            `GABARITO - ${targetSim.arquivo}`,
          );
        }
        setLastLocalFolderSyncAt(new Date().toISOString());
      }
      setDb((prev) => ({
        ...prev,
        submittedSimulations: prev.submittedSimulations.filter((s) => s.id !== simulationId),
        completedSimulations: prev.completedSimulations.filter((c) => c.prova_id !== simulationId),
      }));
      toast(`Simulado removido. ${removedAttempts} tentativa(s) e estatísticas excluídas.`);
    },
    [db.completedSimulations, db.proofFiles, db.submittedSimulations, requestConfirm, toast],
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
    ) => {
      const cleanMateria = materia.trim() || 'Geral';
      const cleanTipo = tipo.trim() || 'Ponto Importante';
      const cleanTexto = texto.trim();

      if (id.startsWith('correcao-prova:')) {
        const now = new Date().toISOString().slice(0, 19);
        setDb((prev) => ({
          ...prev,
          proofFiles: prev.proofFiles.map((pf) => ({
            ...pf,
            correcoes: pf.correcoes.map((corr) => {
              const entryId = `correcao-prova:${pf.kind}:${pf.bank}:${pf.name}:${corr.id}`;
              if (entryId !== id) return corr;
              return {
                ...corr,
                materia: cleanMateria,
                tipo: cleanTipo,
                texto: cleanTexto || corr.texto,
                questao:
                  questionPatch?.enunciado !== undefined && questionPatch.enunciado.trim()
                    ? questionPatch.enunciado.trim()
                    : corr.questao,
                observacoes:
                  questionPatch?.comentario !== undefined
                    ? questionPatch.comentario.trim()
                    : corr.observacoes,
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
            return {
              ...item,
              materia: cleanMateria,
              tipo: cleanTipo,
              texto: cleanTexto,
              ...(updatedQuestao ? { questao: updatedQuestao } : {}),
            };
          }),
        }));
      }
      toast('Registro atualizado.');
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
        timerBaseline: timerSeconds,
      });
      setActivePage('Treino Diário');
      toast(`Iniciando bateria com ${questions.length} questão(ões) do Caderno de Erros!`);
    },
    [allErrorEntries, ensureTimerRunning, timerSeconds, toast],
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

        // 2b. Write into connected Local Folder ('Datas e Locais' & 'Editais') if writable
        if (localFolderHandleRef.current && localFolderWritableRef.current) {
          await writeFileToLocalDirectory(
            localFolderHandleRef.current,
            'Datas e Locais',
            masterFileName,
            masterTxt,
          );
          for (const c of targetContests) {
            await writeFileToLocalDirectory(
              localFolderHandleRef.current,
              'Datas e Locais',
              buildContestTxtFileName(c),
              serializeContestRegistrationTxt(c),
            );
            if ((c.edital_pontos?.length || 0) > 0) {
              await writeFileToLocalDirectory(
                localFolderHandleRef.current,
                'Editais',
                buildEditalTxtFileName(c),
                serializeContestEditalTxt(c),
              );
            }
          }
          setLastLocalFolderSyncAt(new Date().toISOString());
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
              ? 'Arquivos .txt salvos nas pastas "Datas e Locais" e "Editais" (local + Google Drive).'
              : 'Arquivos .txt de Datas & Locais e Editais salvos na pasta local.',
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
      const remainingCount = dbRef.current.contests.filter((c) => c.id !== id).length;
      if (target && localFolderHandleRef.current && localFolderWritableRef.current) {
        const handle = localFolderHandleRef.current;
        void deleteFileFromLocalDirectory(handle, 'Datas e Locais', buildContestTxtFileName(target));
        void deleteFileFromLocalDirectory(handle, 'Editais', buildEditalTxtFileName(target));
        if (remainingCount === 0) {
          void deleteFileFromLocalDirectory(
            handle,
            'Datas e Locais',
            'DATAS E LOCAIS - Controle Geral de Inscricoes Boletos e Locais.txt',
          );
        }
        setLastLocalFolderSyncAt(new Date().toISOString());
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
    [scheduleAutoContestTxtSync, toast],
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

      setDb((prev) => {
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

      if (localFolderHandleRef.current && localFolderWritableRef.current) {
        await writeFileToLocalDirectory(
          localFolderHandleRef.current,
          'Cronogramas',
          meta.fileName,
          txtContent,
        );
        setLastLocalFolderSyncAt(new Date().toISOString());
      }

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
            toast(`Cronograma salvo localmente; aviso no Drive: ${err?.message || 'Falha'}`, true);
            return;
          }
        }
      }

      if (!options?.silent) {
        toast(
          token
            ? `Arquivo "${meta.fileName}" salvo na pasta Cronogramas (local + Google Drive)!`
            : `Arquivo "${meta.fileName}" salvo na pasta Cronogramas local!`,
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
      if (target?.fileName && localFolderHandleRef.current && localFolderWritableRef.current) {
        void deleteFileFromLocalDirectory(
          localFolderHandleRef.current,
          'Cronogramas',
          target.fileName,
        );
        setLastLocalFolderSyncAt(new Date().toISOString());
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
      void deleteFileBlob(`schedule_week_${cleanKey}`);
      toast('Arquivo semanal removido da lista local.');
    },
    [toast],
  );

  const saveScheduleDay = useCallback(
    (day: WeekdayName, topics: ScheduleTopic[], silent?: boolean) => {
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

        // If switching to another week that already has a saved schedule (and not forcing date overwrite on current), load it
        const existingTargetWeek =
          cleanWeekKey !== prevMeta.weekKey && !options?.overwriteCustomized
            ? mapWithPrev[cleanWeekKey]
            : undefined;

        if (existingTargetWeek) {
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
      scheduleAutoScheduleTxtSync();
    },
    [scheduleAutoScheduleTxtSync],
  );

  const completeScheduleTopic = useCallback(
    (day: WeekdayName, index: number, currentDayTopics?: ScheduleTopic[]) => {
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
      setDb((prev) => {
        const nextSchedule = { ...prev.schedule };
        const touchedDays = new Set(imported.map((item) => item.day));
        touchedDays.forEach((day) => {
          // Remove default untouched seed items (sch-1..sch-8) on days being imported
          nextSchedule[day] = (nextSchedule[day] || []).filter(
            (t) => !/^sch-[1-8]$/.test(t.id || ''),
          );
        });
        imported.forEach(({ day, topic }) => {
          nextSchedule[day] = [...(nextSchedule[day] || []), topic];
        });
        const nextDayDates = {
          ...(prev.scheduleDayDates || {}),
          ...(parsedWeek.scheduleDayDates || {}),
        };
        return buildUpdatedWeeklyScheduleState(
          prev,
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

      const folder = dbRef.current.laws[rawFolder]
        ? rawFolder
        : resolveLawFolderKey(dbRef.current.laws, rawFolder);

      const blobKey = lower.endsWith('.pdf') ? `lawpdf-${uid(16)}` : `lawfile-${uid(16)}`;
      await saveFileBlob(blobKey, file);

      const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
      const driveSubfolders = folderLabel ? ['Lei Seca', folderLabel] : 'Lei Seca';
      await autoSyncFileToDrive(file, file.name, driveSubfolders);

      const fileEntry = {
        id: uid(12),
        name: file.name,
        size: file.size,
        blobKey,
        createdAt: localDateIso(),
      };

      setDb((prev) => {
        const resolvedKey = prev.laws[folder] ? folder : resolveLawFolderKey(prev.laws, folder);
        const existing = prev.laws[resolvedKey] || { name: resolvedKey, items: [], pdfs: [] };
        return {
          ...prev,
          laws: {
            ...prev.laws,
            [resolvedKey]: {
              name: resolvedKey,
              items: [...existing.items, ...parsedItems],
              pdfs: [...existing.pdfs, fileEntry],
            },
          },
        };
      });
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
              items: mergedRecovered,
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
                items: recoveredItems,
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
      const target = db.laws[folder];
      if (!target) return 0;

      if (target.pdfs && target.pdfs.length) {
        for (const p of target.pdfs) {
          if (p.blobKey) await deleteFileBlob(p.blobKey);
        }
      }

      if (localFolderHandleRef.current && localFolderWritableRef.current) {
        const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
        if (folderLabel) {
          await deleteDirectoryFromLocalDirectory(localFolderHandleRef.current, ['Lei Seca', folderLabel]);
        }
        await deleteDirectoryFromLocalDirectory(localFolderHandleRef.current, ['Lei Seca', folder]);
        for (const p of target.pdfs || []) {
          await deleteFileFromLocalDirectory(localFolderHandleRef.current, 'Lei Seca', p.name);
          await deleteFileFromLocalDirectory(localFolderHandleRef.current, 'Lei Seca', `LEI - ${p.name}`);
        }
        setLastLocalFolderSyncAt(new Date().toISOString());
      }

      const itemCount = (target.items || []).length;

      setDb((prev) => {
        const nextLaws = { ...prev.laws };
        delete nextLaws[folder];

        const nextHighlights = { ...prev.lawHighlights };
        delete nextHighlights[folder];

        const nextReadDates = { ...(prev.lawReadDates || {}) };
        delete nextReadDates[folder];

        return {
          ...prev,
          laws: nextLaws,
          lawHighlights: nextHighlights,
          lawReadDates: nextReadDates,
        };
      });

      toast(`Pasta de legislação "${visibleName(folder)}" removida.`);
      return itemCount;
    },
    [db.laws, toast],
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
      setDb((prev) => {
        const existing = prev.laws[folder] || { name: folder, items: [], pdfs: [] };
        return {
          ...prev,
          laws: {
            ...prev.laws,
            [folder]: { ...existing, items: [...existing.items, newItem] },
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
              items: nextItems,
            },
          },
        };
      });
      if (!silent) toast('Dispositivo atualizado.');
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
    (folder: string, text: string, color: HighlightColorKey) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toast('Selecione um trecho da lei antes de grifar.', true);
        return;
      }
      setDb((prev) => {
        const existing = prev.lawHighlights[folder] || [];
        const matchIdx = existing.findIndex((h) => h.text === trimmed);
        const next =
          matchIdx >= 0
            ? existing.map((h, i) => (i === matchIdx ? { ...h, color } : h))
            : [...existing, { text: trimmed, color }];
        return {
          ...prev,
          lawHighlights: { ...prev.lawHighlights, [folder]: next },
        };
      });
      toast('Trecho salvo nos grifos.');
    },
    [toast],
  );

  const removeLastLawHighlight = useCallback(
    (folder: string) => {
      setDb((prev) => {
        const existing = [...(prev.lawHighlights[folder] || [])];
        if (existing.length) existing.pop();
        return {
          ...prev,
          lawHighlights: { ...prev.lawHighlights, [folder]: existing },
        };
      });
      toast('Último grifo removido.');
    },
    [toast],
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
      const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
      await autoSyncFileToDrive(
        replacement,
        target.name,
        folderLabel ? ['PDFs Pessoais', folderLabel] : 'PDFs Pessoais',
      );
      setDb((prev) => ({
        ...prev,
        pdfFolders: {
          ...prev.pdfFolders,
          [folder]: (prev.pdfFolders[folder] || []).map((f) =>
            f.id === fileId ? { ...f, size: replacement.size } : f,
          ),
        },
      }));
      toast(`PDF "${visibleName(target.name)}" substituído.`);
    },
    [autoSyncFileToDrive, db.pdfFolders, isProtectedPdfFolder, toast],
  );

  const deletePersonalPdf = useCallback(
    async (folder: string, fileId: string) => {
      if (isProtectedPdfFolder(folder)) return;
      const target = (db.pdfFolders[folder] || []).find((f) => f.id === fileId);
      if (target) {
        await deleteFileBlob(target.blobKey);
        if (localFolderHandleRef.current && localFolderWritableRef.current) {
          const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
          if (folderLabel) {
            await deleteFileFromLocalDirectory(
              localFolderHandleRef.current,
              ['PDFs Pessoais', folderLabel],
              target.name,
            );
          }
          await deleteFileFromLocalDirectory(
            localFolderHandleRef.current,
            ['PDFs Pessoais', folder],
            target.name,
          );
          await deleteFileFromLocalDirectory(localFolderHandleRef.current, 'PDFs Pessoais', target.name);
          setLastLocalFolderSyncAt(new Date().toISOString());
        }
      }
      setDb((prev) => ({
        ...prev,
        pdfFolders: {
          ...prev.pdfFolders,
          [folder]: (prev.pdfFolders[folder] || []).filter((f) => f.id !== fileId),
        },
      }));
      toast('PDF removido.');
    },
    [db.pdfFolders, isProtectedPdfFolder, toast],
  );

  const deletePdfFolder = useCallback(
    async (folder: string): Promise<number> => {
      if (isProtectedPdfFolder(folder)) {
        toast('Pasta de backup protegida — não pode ser removida.', true);
        return 0;
      }
      const files = db.pdfFolders[folder] || [];
      for (const f of files) {
        await deleteFileBlob(f.blobKey);
      }
      if (localFolderHandleRef.current && localFolderWritableRef.current) {
        const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
        if (folderLabel) {
          await deleteDirectoryFromLocalDirectory(localFolderHandleRef.current, [
            'PDFs Pessoais',
            folderLabel,
          ]);
        }
        await deleteDirectoryFromLocalDirectory(localFolderHandleRef.current, [
          'PDFs Pessoais',
          folder,
        ]);
        for (const f of files) {
          await deleteFileFromLocalDirectory(localFolderHandleRef.current, 'PDFs Pessoais', f.name);
        }
        setLastLocalFolderSyncAt(new Date().toISOString());
      }
      setDb((prev) => {
        const next = { ...prev.pdfFolders };
        delete next[folder];
        return { ...prev, pdfFolders: next };
      });
      return files.length;
    },
    [db.pdfFolders, isProtectedPdfFolder, toast],
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
      const target = (db.summaryFolders[folder] || []).find((f) => f.id === fileId);
      if (target) {
        await deleteFileBlob(target.blobKey);
        if (localFolderHandleRef.current && localFolderWritableRef.current) {
          const folderLabel = visibleName(folder).replace(/[\\/]+/g, ' - ').trim();
          const dirs: Array<string | string[]> = folderLabel
            ? [['Resumos e Mapas', folderLabel], ['Resumos e Mapas', folder], 'Resumos e Mapas']
            : ['Resumos e Mapas'];
          for (const d of dirs) {
            await deleteFileFromLocalDirectory(localFolderHandleRef.current, d, target.name);
            await deleteFileFromLocalDirectory(
              localFolderHandleRef.current,
              d,
              `RESUMO - ${target.name}`,
            );
          }
          setLastLocalFolderSyncAt(new Date().toISOString());
        }
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
    [db.summaryFolders, toast],
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
      if (
        localFolderHandleRef.current &&
        localFolderWritableRef.current &&
        normalizeFileLookup(target.name) !== normalizeFileLookup(replacement.name)
      ) {
        await deleteFileFromLocalDirectory(localFolderHandleRef.current, proofSubfolder, target.name);
        await deleteFileFromLocalDirectory(
          localFolderHandleRef.current,
          proofSubfolder,
          `PROVA - ${target.name}`,
        );
      }
      await autoSyncFileToDrive(replacement, `PROVA - ${replacement.name}`, proofSubfolder);
      setDb((prev) => ({
        ...prev,
        proofFiles: prev.proofFiles.map((p) =>
          p.id === proofId ? { ...p, name: replacement.name, size: replacement.size } : p,
        ),
      }));
      toast(`Arquivo "${visibleName(target.name)}" substituído por "${visibleName(replacement.name)}".`);
    },
    [autoSyncFileToDrive, db.proofFiles, toast],
  );

  const deleteProofFile = useCallback(
    async (proofId: string) => {
      const target = db.proofFiles.find((p) => p.id === proofId);
      if (target) {
        await deleteFileBlob(target.blobKey);
        if (localFolderHandleRef.current && localFolderWritableRef.current) {
          const bankSeg =
            target.bank && target.bank.trim() && target.bank !== 'Geral'
              ? visibleName(target.bank).replace(/[\\/]+/g, ' - ').trim()
              : '';
          const dirs: Array<string | string[]> = bankSeg
            ? [['Provas e Gabaritos', bankSeg], 'Provas e Gabaritos']
            : ['Provas e Gabaritos'];
          const namesToDelete = [
            target.name,
            `PROVA - ${target.name}`,
            ...(target.gabarito_arquivo
              ? [target.gabarito_arquivo, `GABARITO - ${target.gabarito_arquivo}`]
              : []),
            `${target.name}.gabarito.txt`,
          ];
          for (const d of dirs) {
            for (const fname of namesToDelete) {
              await deleteFileFromLocalDirectory(localFolderHandleRef.current, d, fname);
            }
          }
          setLastLocalFolderSyncAt(new Date().toISOString());
        }
      }
      setDb((prev) => ({
        ...prev,
        proofFiles: prev.proofFiles.filter((p) => p.id !== proofId),
      }));
      toast('Prova excluída.');
    },
    [db.proofFiles, toast],
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
      const record: EssayRecord = {
        id: uid(16),
        titulo: titulo.trim(),
        data: localDateTimeBrazilian(),
        created_at: new Date().toISOString().slice(0, 19),
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

      const updated: EssayRecord = {
        ...target,
        feedback: trimmedFeedback,
        corrigido_arquivo,
        corrigido_blobKey,
        corrigido_mime,
        corrigida_em: new Date().toISOString().slice(0, 19),
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
      const items: LawItem[] = devices.map((d, idx) => ({
        id: `${folder}_formatada.txt::${idx}`,
        arquivo: `${folder}_formatada.txt`,
        dispositivo: d.dispositivo,
        grau: 'Não Classificado',
        texto: d.texto,
        dica: '',
        observacao: '',
        artigo_base: d.artigo_base,
        tipo_dispositivo: d.tipo_dispositivo,
      }));
      const newPdfEntry: LawPdfEntry = {
        id: uid(12),
        name: file.name,
        size: file.size,
        blobKey,
        createdAt: localDateIso(),
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
  const exportBackupJson = useCallback((): { fileCount: number } => {
    const payload = {
      app: 'Central de Estudos',
      exportedAt: new Date().toISOString(),
      data: db,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = `backup_central_estudos_${localDateIso()}.json`;
    triggerBlobDownload(new Blob([json], { type: 'application/json;charset=utf-8' }), filename);
    const itemCount =
      db.questions.length +
      db.completedSimulations.length +
      db.annotations.length +
      db.caseLaw.length +
      Object.keys(db.laws).length;
    toast(`Backup exportado com sucesso (${filename}).`);
    return { fileCount: itemCount };
  }, [db, toast]);

  const importBackupJson = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Selecione um arquivo de backup .json.');
      }
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
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
    [toast],
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
        removeLastLawHighlight,
        createPdfFolder,
        renamePdfFolder,
        uploadPersonalPdfs,
        replacePersonalPdf,
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
        firebaseConnected: Boolean(googleUser?.uid),
        isSyncingFirebase,
        lastFirebaseSyncAt,
        firebaseChunkCount,
        firebaseLastError,
        clearFirebaseError,
        firestoreConnectionMonitor,
        validateFirestoreConnectionNow,
        dismissFirestoreConnectionAlert,
        syncNowWithFirebase,
        restoreFromFirebase,
        migrateDriveToFirebase,
        googleUser,
        driveConnected,
        driveTokenReady,
        isRenewingDriveToken,
        driveFolderUrl,
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
        localFolderConnected,
        localFolderWritable,
        localFolderName,
        localFolderSummary,
        savedLocalFolderMeta,
        hasSavedLocalFolderHandle,
        lastLocalFolderSyncAt,
        lastLocalIncrementalBackupAt,
        isSyncingLocalFolder,
        connectLocalStudyFolder,
        reconnectLocalStudyFolder,
        importLocalStudyFolderFromFiles,
        syncNowWithLocalStudyFolder,
        disconnectLocalStudyFolder,
        saveLocalIncrementalBackupNow,
        listLocalBackups,
        restoreLocalBackup,
        deleteLocalBackup,
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
