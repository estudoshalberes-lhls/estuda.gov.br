import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, ensureFirebaseSessionAlive, firebaseApp, firebaseConfig } from './googleDrive';
import { StudyDatabase } from '../types/study';

export const DEFAULT_FIRESTORE_DATABASE_ID =
  'ai-studio-estudagovbr-caf99b2c-85a9-4971-83d6-5ebd5dcbae8f';

const resolvedFirestoreDatabaseId =
  String(firebaseConfig.firestoreDatabaseId || '').trim() || DEFAULT_FIRESTORE_DATABASE_ID;

export const db = resolvedFirestoreDatabaseId
  ? getFirestore(firebaseApp, resolvedFirestoreDatabaseId)
  : getFirestore(firebaseApp);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const QUOTA_COOLDOWN_STORAGE_KEY = 'ce_firestore_quota_cooldown_v1';
const DAILY_QUOTA_USAGE_STORAGE_KEY = 'ce_firestore_daily_usage_v1';
const QUOTA_COOLDOWN_STEPS_MS = [5 * 60_000, 15 * 60_000, 45 * 60_000, 120 * 60_000] as const;

interface QuotaCooldownRecord {
  blockedUntilMs: number;
  consecutiveHits: number;
  lastErrorAtMs: number;
}

export interface FirestoreDailyUsageStats {
  pacificDate: string;
  reads: number;
  writes: number;
  deletes: number;
}

let inMemoryQuotaCooldown: QuotaCooldownRecord = {
  blockedUntilMs: 0,
  consecutiveHits: 0,
  lastErrorAtMs: 0,
};

function getPacificDateKey(nowMs = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(nowMs));
  } catch {
    return new Date(nowMs).toISOString().slice(0, 10);
  }
}

function readQuotaCooldownRecord(): QuotaCooldownRecord {
  try {
    const raw = localStorage.getItem(QUOTA_COOLDOWN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<QuotaCooldownRecord>;
      const rec: QuotaCooldownRecord = {
        blockedUntilMs: Number(parsed?.blockedUntilMs || 0),
        consecutiveHits: Number(parsed?.consecutiveHits || 0),
        lastErrorAtMs: Number(parsed?.lastErrorAtMs || 0),
      };
      if (rec.blockedUntilMs > inMemoryQuotaCooldown.blockedUntilMs) {
        inMemoryQuotaCooldown = rec;
      }
    }
  } catch {
    // ignore storage errors
  }
  return inMemoryQuotaCooldown;
}

function writeQuotaCooldownRecord(next: QuotaCooldownRecord): void {
  inMemoryQuotaCooldown = next;
  try {
    localStorage.setItem(QUOTA_COOLDOWN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function getFirestoreQuotaCooldownStatus(): {
  blocked: boolean;
  blockedUntilMs: number;
  remainingMs: number;
  consecutiveHits: number;
} {
  const rec = readQuotaCooldownRecord();
  const now = Date.now();
  const remainingMs = Math.max(0, rec.blockedUntilMs - now);
  return {
    blocked: remainingMs > 0,
    blockedUntilMs: rec.blockedUntilMs,
    remainingMs,
    consecutiveHits: rec.consecutiveHits,
  };
}

export function activateFirestoreQuotaCooldown(): number {
  const now = Date.now();
  const prev = readQuotaCooldownRecord();
  const recentWindow = now - prev.lastErrorAtMs < 4 * 60 * 60_000;
  const consecutiveHits = recentWindow ? prev.consecutiveHits + 1 : 1;
  const stepIdx = Math.min(consecutiveHits - 1, QUOTA_COOLDOWN_STEPS_MS.length - 1);
  const durationMs = QUOTA_COOLDOWN_STEPS_MS[stepIdx];
  const blockedUntilMs = now + durationMs;
  writeQuotaCooldownRecord({
    blockedUntilMs,
    consecutiveHits,
    lastErrorAtMs: now,
  });
  console.warn('[Firebase Quota Guard] Cota do Firestore protegida — pausa automática ativada.', {
    cooldownMinutes: Math.round(durationMs / 60_000),
    consecutiveHits,
    resumeAt: new Date(blockedUntilMs).toISOString(),
  });
  return blockedUntilMs;
}

export function clearFirestoreQuotaCooldown(): void {
  if (inMemoryQuotaCooldown.blockedUntilMs === 0 && inMemoryQuotaCooldown.consecutiveHits === 0) {
    try {
      localStorage.removeItem(QUOTA_COOLDOWN_STORAGE_KEY);
    } catch {
      // ignore
    }
    return;
  }
  writeQuotaCooldownRecord({
    blockedUntilMs: 0,
    consecutiveHits: 0,
    lastErrorAtMs: 0,
  });
}

export function getFirestoreDailyUsageEstimate(): FirestoreDailyUsageStats {
  const today = getPacificDateKey();
  try {
    const raw = localStorage.getItem(DAILY_QUOTA_USAGE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FirestoreDailyUsageStats>;
      if (parsed?.pacificDate === today) {
        return {
          pacificDate: today,
          reads: Number(parsed.reads || 0),
          writes: Number(parsed.writes || 0),
          deletes: Number(parsed.deletes || 0),
        };
      }
    }
  } catch {
    // ignore
  }
  return { pacificDate: today, reads: 0, writes: 0, deletes: 0 };
}

function recordFirestoreQuotaOps(delta: { reads?: number; writes?: number; deletes?: number }): void {
  const r = Math.max(0, Number(delta.reads || 0));
  const w = Math.max(0, Number(delta.writes || 0));
  const d = Math.max(0, Number(delta.deletes || 0));
  if (r === 0 && w === 0 && d === 0) return;
  const cur = getFirestoreDailyUsageEstimate();
  const next: FirestoreDailyUsageStats = {
    pacificDate: cur.pacificDate,
    reads: cur.reads + r,
    writes: cur.writes + w,
    deletes: cur.deletes + d,
  };
  try {
    localStorage.setItem(DAILY_QUOTA_USAGE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function isQuotaErrorLike(error: unknown): boolean {
  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    rawCode === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota exceeded')
  );
}

function throwIfFirestoreQuotaBlocked(
  operationType: OperationType,
  path: string | null,
  bypassCooldown = false,
): void {
  if (bypassCooldown) return;
  const status = getFirestoreQuotaCooldownStatus();
  if (!status.blocked) return;
  const mins = Math.max(1, Math.ceil(status.remainingMs / 60_000));
  const err = Object.assign(
    new Error(
      `Quota exceeded (proteção local ativa por mais ${mins} min para evitar estouro do teto diário gratuito).`,
    ),
    { code: 'resource-exhausted' },
  );
  handleFirestoreError(err, operationType, path);
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  if (isQuotaErrorLike(error)) {
    const status = getFirestoreQuotaCooldownStatus();
    if (!status.blocked) {
      activateFirestoreQuotaCooldown();
    }
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const wrapped = new Error(JSON.stringify(errInfo)) as Error & { code?: string };
  if (rawCode) wrapped.code = rawCode;
  throw wrapped;
}

async function testConnection() {
  console.log('[Firebase Config] Verificando conectividade inicial com Firestore...', {
    projectId: firebaseConfig.projectId,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
  });
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    recordFirestoreQuotaOps({ reads: 1 });
    console.log('[Firebase Firestore] Conectividade confirmada com o servidor Firestore.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.', error);
    } else {
      console.log('[Firebase Firestore] Conectividade confirmada com o servidor Firestore.');
    }
  }
}
void testConnection();

const MAX_ITEMS_PER_CHUNK = 180;
const MAX_RECORD_ENTRIES_PER_CHUNK = 80;
const MAX_LAW_ITEMS_PER_SLICE = 120;
const MAX_CHUNK_BYTES = 420_000;
const MAX_CHUNK_BYTES_COMPACT = 640_000;
const SCHEMA_VERSION = 2;

const ARRAY_SECTIONS = [
  'questions',
  'submittedSimulations',
  'completedSimulations',
  'history',
  'studyTimeRecords',
  'annotations',
  'caseLaw',
  'contests',
  'completedGoals',
  'incompleteGoals',
  'savedIncidenceFilters',
  'fixedSubjects',
  'proofBanks',
  'proofFiles',
  'essays',
  'criticalPoints',
  'phrases',
] as const;

const RECORD_SECTIONS = [
  'weeklySchedules',
  'weeklyGoalNotes',
  'lawHighlights',
  'readLawItems',
  'lawReadDates',
  'lawLastReadPosition',
  'lawNotes',
  'pdfFolders',
  'pdfAnnotations',
  'summaryFolders',
  'deletedTombstones',
] as const;

const OBJECT_SECTIONS = ['schedule', 'scheduleDayDates', 'preferences'] as const;

export interface StudyDbRecordChunk {
  recordId: string;
  section: string;
  chunkIndex: number;
  chunkTotal: number;
  contentHash: string;
  payload: Record<string, unknown>;
}

export interface LoadedFirestoreDatabase {
  db: Partial<StudyDatabase>;
  updatedAt: string;
  sectionCount: number;
  contentHash: string;
  timerSig: string;
  revision?: number;
  chunkHashes?: Record<string, string>;
}

export interface UserFirestoreCacheState {
  workspaceExists: boolean;
  chunkHashes: Map<string, string>;
  rawDocsById: Map<string, RawRecordDoc>;
  revision: number;
  hydratedFromServer: boolean;
  lastWorkspaceContentHash: string;
  lastWorkspaceTimerSig: string;
  lastUpdatedAt: string;
  lastLocalWriteMs: number;
  lastLoadCompletedMs: number;
  lastLoadedSnapshot: LoadedFirestoreDatabase | null;
}

const LOAD_COALESCE_TTL_MS = 15_000;
const MAX_FIRESTORE_CHUNKS_SAFE = 480;
const DIFFERENTIAL_GET_DOC_THRESHOLD = 12;
const userCacheByUid = new Map<string, UserFirestoreCacheState>();
const inFlightLoadByUid = new Map<string, Promise<LoadedFirestoreDatabase | null>>();

function getOrCreateUserCache(userId: string): UserFirestoreCacheState {
  let entry = userCacheByUid.get(userId);
  if (!entry) {
    entry = {
      workspaceExists: false,
      chunkHashes: new Map<string, string>(),
      rawDocsById: new Map<string, RawRecordDoc>(),
      revision: 0,
      hydratedFromServer: false,
      lastWorkspaceContentHash: '',
      lastWorkspaceTimerSig: '',
      lastUpdatedAt: '',
      lastLocalWriteMs: 0,
      lastLoadCompletedMs: 0,
      lastLoadedSnapshot: null,
    };
    userCacheByUid.set(userId, entry);
  }
  return entry;
}

function buildChunkHashesMapObject(
  chunks: Array<{ recordId: string; contentHash: string }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const c of chunks.slice(0, 500)) {
    if (c.recordId) {
      result[c.recordId] = String(c.contentHash || '').slice(0, 128);
    }
  }
  return result;
}

function normalizeRemoteChunkHashes(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && k) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function compactStudyDatabaseForChunkBudget(studyDb: StudyDatabase): StudyDatabase {
  const next: StudyDatabase = { ...studyDb };
  // Trim oversized ephemeral history/time logs cleanly if user data exceeds ~480 Firestore chunks
  if (Array.isArray(next.history) && next.history.length > 2500) {
    next.history = next.history.slice(-2500);
  }
  if (Array.isArray(next.studyTimeRecords) && next.studyTimeRecords.length > 2500) {
    next.studyTimeRecords = next.studyTimeRecords.slice(-2500);
  }
  if (Array.isArray(next.completedSimulations) && next.completedSimulations.length > 400) {
    next.completedSimulations = next.completedSimulations.slice(-400);
  }
  return next;
}

export function markLocalFirestoreActivity(userId: string): void {
  if (!userId) return;
  const state = getOrCreateUserCache(userId);
  state.lastLocalWriteMs = Date.now();
}

export function clearUserFirestoreCacheState(userId?: string): void {
  if (userId) {
    userCacheByUid.delete(userId);
    inFlightLoadByUid.delete(userId);
  } else {
    userCacheByUid.clear();
    inFlightLoadByUid.clear();
  }
}

export function computeFastHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}_${(h1 >>> 0).toString(36)}_${input.length}`;
}

export function sanitizeForFirestore<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    return (Number.isFinite(value.getTime()) ? value.toISOString() : '') as unknown as T;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as unknown as T;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
    clean[k] = sanitizeForFirestore(v);
  }
  return clean as T;
}

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function estimatePayloadBytes(obj: unknown): number {
  try {
    const serialized = JSON.stringify(obj);
    return utf8Encoder ? utf8Encoder.encode(serialized).length : Math.ceil(serialized.length * 1.5);
  } catch {
    return 0;
  }
}

function timestampToIso(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (val as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return '';
    }
  }
  return '';
}

export function computeTimerSyncSignature(timerState?: {
  elapsed?: number;
  startedAt?: number;
  activeTopic?: unknown;
} | null): string {
  const safeElapsed = Number.isFinite(Number(timerState?.elapsed)) ? Number(timerState?.elapsed) : 0;
  const safeStartedAt = Number.isFinite(Number(timerState?.startedAt)) ? Number(timerState?.startedAt) : 0;
  const safeTopic =
    timerState?.activeTopic !== undefined && timerState.activeTopic !== null
      ? sanitizeForFirestore(timerState.activeTopic)
      : null;
  return JSON.stringify({
    elapsed: safeElapsed,
    startedAt: safeStartedAt,
    activeTopic: safeTopic,
  });
}

function buildSafeTimerState(timerState?: {
  elapsed?: number;
  startedAt?: number;
  activeTopic?: unknown;
}): Record<string, unknown> {
  const safe: Record<string, unknown> = {
    elapsed: Number.isFinite(Number(timerState?.elapsed)) ? Number(timerState?.elapsed) : 0,
    startedAt: Number.isFinite(Number(timerState?.startedAt)) ? Number(timerState?.startedAt) : 0,
    syncedAt: new Date().toISOString(),
  };
  if (timerState?.activeTopic !== undefined && timerState.activeTopic !== null) {
    safe.activeTopic = sanitizeForFirestore(timerState.activeTopic);
  }
  return safe;
}

export function decomposeDatabaseToFirestoreChunks(
  studyDb: StudyDatabase,
  options?: { maxChunkBytes?: number },
): StudyDbRecordChunk[] {
  const chunkByteBudget = options?.maxChunkBytes || MAX_CHUNK_BYTES;
  const chunks: StudyDbRecordChunk[] = [];
  const rawDb = studyDb as unknown as Record<string, any>;

  const pushChunk = (
    section: string,
    chunkIndex: number,
    chunkTotal: number,
    payload: Record<string, unknown>,
  ) => {
    const cleanPayload = sanitizeForFirestore(payload);
    const serialized = JSON.stringify(cleanPayload);
    chunks.push({
      recordId: `${section}__${chunkIndex}`,
      section,
      chunkIndex,
      chunkTotal,
      contentHash: computeFastHash(serialized),
      payload: cleanPayload,
    });
  };

  for (const section of ARRAY_SECTIONS) {
    const arr = Array.isArray(rawDb[section]) ? rawDb[section] : [];
    const groupedPayloads: Array<Record<string, unknown>> = [];
    let currentEntries: Record<string, unknown> = {};
    let currentCount = 0;

    for (let i = 0; i < arr.length; i++) {
      const item = sanitizeForFirestore(arr[i]);
      currentEntries[String(i)] = item;
      currentCount += 1;

      const exceedsCount = currentCount >= MAX_ITEMS_PER_CHUNK;
      const exceedsBytes = currentCount > 1 && estimatePayloadBytes(currentEntries) >= chunkByteBudget;

      if (exceedsCount || exceedsBytes) {
        if (exceedsBytes && currentCount > 1) {
          delete currentEntries[String(i)];
          groupedPayloads.push({
            kind: 'array',
            count: currentCount - 1,
            entries: currentEntries,
          });
          currentEntries = { [String(i)]: item };
          currentCount = 1;
        } else {
          groupedPayloads.push({
            kind: 'array',
            count: currentCount,
            entries: currentEntries,
          });
          currentEntries = {};
          currentCount = 0;
        }
      }
    }

    if (currentCount > 0 || groupedPayloads.length === 0) {
      groupedPayloads.push({
        kind: 'array',
        count: currentCount,
        entries: currentEntries,
      });
    }

    groupedPayloads.forEach((p, idx) => {
      pushChunk(section, idx, groupedPayloads.length, p);
    });
  }

  for (const section of RECORD_SECTIONS) {
    const mapObj =
      rawDb[section] && typeof rawDb[section] === 'object' && !Array.isArray(rawDb[section])
        ? (rawDb[section] as Record<string, unknown>)
        : {};
    const entries = Object.entries(mapObj);
    const groupedPayloads: Array<Record<string, unknown>> = [];
    let currentMap: Record<string, unknown> = {};
    let currentCount = 0;

    for (const [k, val] of entries) {
      const cleanVal = sanitizeForFirestore(val);
      currentMap[k] = cleanVal;
      currentCount += 1;

      const exceedsCount = currentCount >= MAX_RECORD_ENTRIES_PER_CHUNK;
      const exceedsBytes = currentCount > 1 && estimatePayloadBytes(currentMap) >= chunkByteBudget;
      if (exceedsCount || exceedsBytes) {
        if (exceedsBytes && currentCount > 1) {
          delete currentMap[k];
          groupedPayloads.push({
            kind: 'record',
            count: currentCount - 1,
            entries: currentMap,
          });
          currentMap = { [k]: cleanVal };
          currentCount = 1;
        } else {
          groupedPayloads.push({
            kind: 'record',
            count: currentCount,
            entries: currentMap,
          });
          currentMap = {};
          currentCount = 0;
        }
      }
    }

    if (currentCount > 0 || groupedPayloads.length === 0) {
      groupedPayloads.push({
        kind: 'record',
        count: currentCount,
        entries: currentMap,
      });
    }

    groupedPayloads.forEach((p, idx) => {
      pushChunk(section, idx, groupedPayloads.length, p);
    });
  }

  for (const section of OBJECT_SECTIONS) {
    const objVal =
      rawDb[section] && typeof rawDb[section] === 'object' ? sanitizeForFirestore(rawDb[section]) : {};
    pushChunk(section, 0, 1, {
      kind: 'object',
      value: objVal,
    });
  }

  const lawsMap =
    rawDb.laws && typeof rawDb.laws === 'object'
      ? (rawDb.laws as Record<string, { name: string; items: unknown[]; pdfs: unknown[] }>)
      : {};
  const lawPayloads: Array<Record<string, unknown>> = [];
  let curSliceMap: Record<string, { name: string; items: unknown[]; pdfs: unknown[] }> = {};
  let curSliceCount = 0;

  const flushLawChunk = () => {
    if (curSliceCount > 0) {
      lawPayloads.push({
        kind: 'laws',
        count: curSliceCount,
        slices: curSliceMap,
      });
      curSliceMap = {};
      curSliceCount = 0;
    }
  };

  const addLawSliceToChunk = (
    folderKey: string,
    sliceObj: { name: string; items: unknown[]; pdfs: unknown[] },
  ) => {
    // CRITICAL: Never overwrite an existing slice for the same folderKey inside curSliceMap!
    if (folderKey in curSliceMap) {
      flushLawChunk();
    }

    curSliceMap[folderKey] = sliceObj;
    curSliceCount += 1;

    const totalBytes = estimatePayloadBytes(curSliceMap);
    if (totalBytes >= chunkByteBudget) {
      if (curSliceCount > 1) {
        delete curSliceMap[folderKey];
        curSliceCount -= 1;
        flushLawChunk();
        curSliceMap[folderKey] = sliceObj;
        curSliceCount = 1;
        if (estimatePayloadBytes(curSliceMap) >= chunkByteBudget) {
          flushLawChunk();
        }
      } else {
        flushLawChunk();
      }
    } else if (curSliceCount >= 12) {
      flushLawChunk();
    }
  };

  for (const [folderKey, folderData] of Object.entries(lawsMap)) {
    const safeFolderName = folderData?.name || folderKey;
    const allItems = Array.isArray(folderData?.items) ? sanitizeForFirestore(folderData.items) : [];
    const allPdfs = Array.isArray(folderData?.pdfs) ? sanitizeForFirestore(folderData.pdfs) : [];

    if (allItems.length === 0) {
      addLawSliceToChunk(folderKey, {
        name: safeFolderName,
        items: [],
        pdfs: allPdfs,
      });
      continue;
    }

    // Dynamically pack items into byte-safe slices so a single slice never exceeds Firestore's 1 MiB doc limit
    let sliceItems: unknown[] = [];
    let isFirstSlice = true;
    const maxSingleSliceBytes = Math.min(chunkByteBudget, 580_000);

    for (let i = 0; i < allItems.length; i++) {
      const nextItem = allItems[i];
      sliceItems.push(nextItem);
      const candidatePdfs = isFirstSlice ? allPdfs : [];
      const candidateObj = {
        name: safeFolderName,
        items: sliceItems,
        pdfs: candidatePdfs,
      };
      const exceedsBytes =
        sliceItems.length > 1 && estimatePayloadBytes(candidateObj) >= maxSingleSliceBytes;
      const exceedsCount = sliceItems.length >= MAX_LAW_ITEMS_PER_SLICE;

      if (exceedsBytes) {
        sliceItems.pop();
        addLawSliceToChunk(folderKey, {
          name: safeFolderName,
          items: sliceItems,
          pdfs: candidatePdfs,
        });
        isFirstSlice = false;
        sliceItems = [nextItem];
      } else if (exceedsCount) {
        addLawSliceToChunk(folderKey, candidateObj);
        isFirstSlice = false;
        sliceItems = [];
      }
    }

    if (sliceItems.length > 0) {
      addLawSliceToChunk(folderKey, {
        name: safeFolderName,
        items: sliceItems,
        pdfs: isFirstSlice ? allPdfs : [],
      });
    }
  }

  flushLawChunk();

  if (lawPayloads.length === 0) {
    lawPayloads.push({
      kind: 'laws',
      count: 0,
      slices: {},
    });
  }

  lawPayloads.forEach((p, idx) => {
    pushChunk('laws', idx, lawPayloads.length, p);
  });

  return chunks;
}

interface RawRecordDoc {
  id: string;
  section: string;
  chunkIndex: number;
  chunkTotal: number;
  contentHash: string;
  payload: any;
  updatedAt?: string;
}

const ARRAY_VALUED_RECORD_SECTIONS = new Set<string>([
  'lawHighlights',
  'readLawItems',
  'lawReadDates',
  'pdfFolders',
  'summaryFolders',
]);

function coerceFirestoreArray<T = any>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (!val || typeof val !== 'object') return [];
  const obj = val as Record<string, unknown>;
  if ('entries' in obj && obj.entries && typeof obj.entries === 'object') {
    return coerceFirestoreArray<T>(obj.entries);
  }
  const numericEntries: Array<{ idx: number; item: T }> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (/^\d+$/.test(k)) {
      numericEntries.push({ idx: Number(k), item: v as T });
    }
  }
  if (numericEntries.length > 0) {
    numericEntries.sort((a, b) => a.idx - b.idx);
    return numericEntries.map((e) => e.item);
  }
  return [];
}

function normalizeWeeklyScheduleEntry(rawRec: unknown): unknown {
  if (!rawRec || typeof rawRec !== 'object') return rawRec;
  const rec = rawRec as Record<string, any>;
  if (!rec.schedule || typeof rec.schedule !== 'object') return rec;
  const nextSchedule: Record<string, any[]> = {};
  for (const [day, list] of Object.entries(rec.schedule as Record<string, unknown>)) {
    nextSchedule[day] = coerceFirestoreArray(list);
  }
  return {
    ...rec,
    schedule: nextSchedule,
  };
}

function reassembleDatabaseFromDocs(
  docsList: RawRecordDoc[],
  workspaceUpdatedAt?: string,
): {
  db: Partial<StudyDatabase>;
  updatedAt: string;
  sectionCount: number;
} {
  const reconstructed: Record<string, any> = {};
  const arrayBuckets: Record<string, Array<{ idx: number; item: any }>> = {};
  let latestUpdatedAt = '';

  const sortedDocs = [...docsList].sort((a, b) => {
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    return Number(a.chunkIndex || 0) - Number(b.chunkIndex || 0);
  });

  const mergeLawSlice = (folderKey: string, slice: any) => {
    if (!slice || typeof slice !== 'object') return;
    if (!reconstructed.laws || typeof reconstructed.laws !== 'object') {
      reconstructed.laws = {};
    }
    const existingRaw = reconstructed.laws[folderKey];
    const existingItems = coerceFirestoreArray(existingRaw?.items);
    const existingPdfs = coerceFirestoreArray(existingRaw?.pdfs);
    const nextItems = coerceFirestoreArray(slice.items);
    const nextPdfs = coerceFirestoreArray(slice.pdfs);
    const seenItemIds = new Set(existingItems.map((it: any) => it?.id).filter(Boolean));
    const mergedItems = [...existingItems];
    for (const it of nextItems) {
      if (!it) continue;
      if (it.id && seenItemIds.has(it.id)) continue;
      if (it.id) seenItemIds.add(it.id);
      mergedItems.push(it);
    }
    const mergedPdfs = [...existingPdfs];
    for (const p of nextPdfs) {
      if (p && !mergedPdfs.some((ep: any) => ep?.id && ep.id === p.id)) {
        mergedPdfs.push(p);
      }
    }
    reconstructed.laws[folderKey] = {
      name: slice.name || existingRaw?.name || folderKey,
      items: mergedItems,
      pdfs: mergedPdfs,
    };
  };

  for (const row of sortedDocs) {
    if (!row?.section) continue;
    const rowTs = String(row.updatedAt || '');
    if (rowTs && (!latestUpdatedAt || rowTs > latestUpdatedAt)) {
      latestUpdatedAt = rowTs;
    }

    const section = row.section;
    const payload = row.payload;
    if (!payload || typeof payload !== 'object') continue;

    if (payload.kind === 'array') {
      if (!arrayBuckets[section]) arrayBuckets[section] = [];
      if (Array.isArray(payload.entries)) {
        payload.entries.forEach((val: unknown, idx: number) => {
          arrayBuckets[section].push({ idx, item: val });
        });
      } else {
        const entriesObj =
          payload.entries && typeof payload.entries === 'object' ? payload.entries : {};
        for (const [key, val] of Object.entries(entriesObj)) {
          const numericKey = Number(key);
          arrayBuckets[section].push({
            idx: Number.isFinite(numericKey) ? numericKey : arrayBuckets[section].length,
            item: val,
          });
        }
      }
      continue;
    }

    if (payload.kind === 'record') {
      if (!reconstructed[section] || typeof reconstructed[section] !== 'object' || Array.isArray(reconstructed[section])) {
        reconstructed[section] = {};
      }
      const entriesObj =
        payload.entries && typeof payload.entries === 'object' ? payload.entries : {};
      for (const [k, v] of Object.entries(entriesObj)) {
        if (ARRAY_VALUED_RECORD_SECTIONS.has(section)) {
          reconstructed[section][k] = coerceFirestoreArray(v);
        } else if (section === 'weeklySchedules') {
          reconstructed[section][k] = normalizeWeeklyScheduleEntry(v);
        } else if (section === 'pdfAnnotations' && v && typeof v === 'object') {
          const rawAnn = v as Record<string, unknown>;
          reconstructed[section][k] = {
            strokes: coerceFirestoreArray(rawAnn.strokes),
            notes: coerceFirestoreArray(rawAnn.notes),
            updatedAt: typeof rawAnn.updatedAt === 'string' ? rawAnn.updatedAt : '',
            ...(typeof rawAnn.lastBakedAt === 'string' ? { lastBakedAt: rawAnn.lastBakedAt } : {}),
          };
        } else {
          reconstructed[section][k] = v;
        }
      }
      continue;
    }

    if (payload.kind === 'object') {
      if (ARRAY_SECTIONS.includes(section as any)) {
        reconstructed[section] = coerceFirestoreArray(payload.value);
      } else if (section === 'schedule') {
        const rawSched = payload.value && typeof payload.value === 'object' ? payload.value : {};
        const safeSched: Record<string, any[]> = {};
        for (const [day, list] of Object.entries(rawSched as Record<string, unknown>)) {
          safeSched[day] = coerceFirestoreArray(list);
        }
        reconstructed[section] = safeSched;
      } else {
        reconstructed[section] =
          payload.value && typeof payload.value === 'object' ? payload.value : {};
      }
      continue;
    }

    if (payload.kind === 'laws') {
      const slices =
        payload.slices && typeof payload.slices === 'object'
          ? (payload.slices as Record<string, { name?: string; items?: any[]; pdfs?: any[] }>)
          : {};
      for (const [folderKey, slice] of Object.entries(slices)) {
        mergeLawSlice(folderKey, slice);
      }
      continue;
    }

    if (section === 'laws') {
      const candidateSlices =
        payload.slices && typeof payload.slices === 'object'
          ? (payload.slices as Record<string, unknown>)
          : (payload as Record<string, unknown>);
      for (const [folderKey, slice] of Object.entries(candidateSlices)) {
        mergeLawSlice(folderKey, slice);
      }
      continue;
    }

    if (Array.isArray(payload)) {
      reconstructed[section] = payload;
    } else if (ARRAY_SECTIONS.includes(section as any)) {
      if (!arrayBuckets[section]) arrayBuckets[section] = [];
      if ('entries' in payload && payload.entries && typeof payload.entries === 'object') {
        Object.entries(payload.entries as Record<string, unknown>).forEach(([k, v]) => {
          const num = Number(k);
          arrayBuckets[section].push({
            idx: Number.isFinite(num) ? num : arrayBuckets[section].length,
            item: v,
          });
        });
      } else {
        Object.entries(payload).forEach(([k, v]) => {
          if (/^\d+$/.test(k)) {
            arrayBuckets[section].push({
              idx: Number(k),
              item: v,
            });
          }
        });
      }
    } else if (RECORD_SECTIONS.includes(section as any)) {
      if (!reconstructed[section] || typeof reconstructed[section] !== 'object' || Array.isArray(reconstructed[section])) {
        reconstructed[section] = {};
      }
      const sourceEntries =
        'entries' in payload && payload.entries && typeof payload.entries === 'object'
          ? (payload.entries as Record<string, unknown>)
          : (payload as Record<string, unknown>);
      for (const [k, v] of Object.entries(sourceEntries)) {
        if (ARRAY_VALUED_RECORD_SECTIONS.has(section)) {
          reconstructed[section][k] = coerceFirestoreArray(v);
        } else if (section === 'weeklySchedules') {
          reconstructed[section][k] = normalizeWeeklyScheduleEntry(v);
        } else {
          reconstructed[section][k] = v;
        }
      }
    } else {
      reconstructed[section] = payload;
    }
  }

  for (const [section, bucket] of Object.entries(arrayBuckets)) {
    bucket.sort((a, b) => a.idx - b.idx);
    reconstructed[section] = bucket.map((entry) => entry.item);
  }

  // Garante invariantes de array em todas as seções reconstruídas antes de entregar à aplicação
  for (const section of ARRAY_SECTIONS) {
    if (section in reconstructed) {
      reconstructed[section] = coerceFirestoreArray(reconstructed[section]);
    }
  }

  if (reconstructed.schedule && typeof reconstructed.schedule === 'object') {
    const safeSched: Record<string, any[]> = {};
    for (const [day, list] of Object.entries(reconstructed.schedule as Record<string, unknown>)) {
      safeSched[day] = coerceFirestoreArray(list);
    }
    reconstructed.schedule = safeSched;
  }

  for (const recSec of ARRAY_VALUED_RECORD_SECTIONS) {
    if (reconstructed[recSec] && typeof reconstructed[recSec] === 'object') {
      const safeMap: Record<string, any[]> = {};
      for (const [k, v] of Object.entries(reconstructed[recSec] as Record<string, unknown>)) {
        safeMap[k] = coerceFirestoreArray(v);
      }
      reconstructed[recSec] = safeMap;
    }
  }

  if (reconstructed.weeklySchedules && typeof reconstructed.weeklySchedules === 'object') {
    const safeWeekly: Record<string, unknown> = {};
    for (const [wk, rec] of Object.entries(reconstructed.weeklySchedules as Record<string, unknown>)) {
      safeWeekly[wk] = normalizeWeeklyScheduleEntry(rec);
    }
    reconstructed.weeklySchedules = safeWeekly;
  }

  return {
    db: reconstructed as Partial<StudyDatabase>,
    updatedAt: workspaceUpdatedAt || latestUpdatedAt || new Date().toISOString(),
    sectionCount: sortedDocs.length,
  };
}

export async function loadDatabaseFromFirestore(
  userId: string,
  _fallbackEmail?: string | null,
  options?: { forceRefresh?: boolean; bypassQuotaCooldown?: boolean },
): Promise<LoadedFirestoreDatabase | null> {
  const diag = getFirestoreConfigDiagnostics();
  if (!diag.isValid) {
    throw Object.assign(new Error(`FIREBASE_CONFIG_MISSING: ${diag.issues.join(' ')}`), {
      code: 'firebase/config-missing',
    });
  }

  const workspacePath = `users/${userId}`;
  const cache = getOrCreateUserCache(userId);

  if (
    !options?.forceRefresh &&
    cache.hydratedFromServer &&
    cache.lastLoadCompletedMs > 0 &&
    Date.now() - cache.lastLoadCompletedMs < LOAD_COALESCE_TTL_MS
  ) {
    return cache.lastLoadedSnapshot;
  }

  const existingInFlight = inFlightLoadByUid.get(userId);
  if (existingInFlight && !options?.forceRefresh) {
    return existingInFlight;
  }

  throwIfFirestoreQuotaBlocked(
    OperationType.GET,
    workspacePath,
    Boolean(options?.bypassQuotaCooldown),
  );

  const task = (async (): Promise<LoadedFirestoreDatabase | null> => {
    await ensureFirebaseSessionAlive(false);
    const recordsPath = `users/${userId}/dbRecords`;

    console.log('[Firebase Sync][Load] Lendo workspace e partições...', {
      workspacePath,
      recordsPath,
    });

    const userDocRef = doc(db, 'users', userId);
    let workspaceSnap;
    try {
      workspaceSnap = await getDoc(userDocRef);
      recordFirestoreQuotaOps({ reads: 1 });
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, workspacePath);
    }

    cache.workspaceExists = workspaceSnap.exists();

    if (!workspaceSnap.exists()) {
      cache.hydratedFromServer = true;
      cache.chunkHashes.clear();
      cache.rawDocsById.clear();
      cache.revision = 0;
      cache.lastWorkspaceContentHash = '';
      cache.lastWorkspaceTimerSig = '';
      cache.lastUpdatedAt = '';
      cache.lastLoadCompletedMs = Date.now();
      cache.lastLoadedSnapshot = null;
      return null;
    }

    const workspaceData = workspaceSnap.data();
    const workspaceUpdatedAt = timestampToIso(workspaceData?.updatedAt);
    const workspaceContentHash = String(workspaceData?.contentHash || '');
    const workspaceTimerSig = computeTimerSyncSignature(workspaceData?.timerState);
    const workspaceRevision = Number(workspaceData?.revision || 0);
    cache.lastWorkspaceContentHash = workspaceContentHash;
    cache.lastWorkspaceTimerSig = workspaceTimerSig;
    cache.lastUpdatedAt = workspaceUpdatedAt;
    cache.revision = Number.isFinite(workspaceRevision) ? workspaceRevision : 0;

    const recordsQuery = query(
      collection(db, 'users', userId, 'dbRecords'),
      where('ownerId', '==', userId),
    );

    let recordsSnap;
    try {
      recordsSnap = await getDocs(recordsQuery);
      recordFirestoreQuotaOps({ reads: Math.max(1, recordsSnap.size) });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, recordsPath);
    }

    cache.chunkHashes.clear();
    cache.rawDocsById.clear();
    const rawDocs: RawRecordDoc[] = [];
    recordsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const contentHash = String(data?.contentHash || '');
      const rawDoc: RawRecordDoc = {
        id: docSnap.id,
        section: String(data?.section || ''),
        chunkIndex: Number(data?.chunkIndex || 0),
        chunkTotal: Number(data?.chunkTotal || 1),
        contentHash,
        payload: data?.payload,
        updatedAt: timestampToIso(data?.updatedAt),
      };
      cache.chunkHashes.set(docSnap.id, contentHash);
      cache.rawDocsById.set(docSnap.id, rawDoc);
      rawDocs.push(rawDoc);
    });
    cache.hydratedFromServer = true;
    cache.lastLoadCompletedMs = Date.now();
    if (options?.bypassQuotaCooldown) {
      clearFirestoreQuotaCooldown();
    }

    console.log('[Firebase Sync][Load] Leitura concluída.', {
      workspacePath,
      recordCount: rawDocs.length,
      revision: cache.revision,
      workspaceUpdatedAt,
    });

    if (rawDocs.length === 0) {
      cache.lastLoadedSnapshot = null;
      return null;
    }

    const reassembled = reassembleDatabaseFromDocs(rawDocs, workspaceUpdatedAt);
    const result: LoadedFirestoreDatabase = {
      ...reassembled,
      contentHash: workspaceContentHash,
      timerSig: workspaceTimerSig,
      revision: cache.revision,
      chunkHashes: Object.fromEntries(cache.chunkHashes),
    };
    cache.lastLoadedSnapshot = result;
    return result;
  })();

  inFlightLoadByUid.set(userId, task);
  try {
    return await task;
  } finally {
    if (inFlightLoadByUid.get(userId) === task) {
      inFlightLoadByUid.delete(userId);
    }
  }
}

export async function loadDifferentialChangesFromFirestore(
  userId: string,
  remoteMeta: {
    contentHash: string;
    updatedAt: string;
    revision?: number;
    chunkHashes?: Record<string, string>;
  },
): Promise<LoadedFirestoreDatabase | null> {
  const diag = getFirestoreConfigDiagnostics();
  if (!diag.isValid) {
    throw Object.assign(new Error(`FIREBASE_CONFIG_MISSING: ${diag.issues.join(' ')}`), {
      code: 'firebase/config-missing',
    });
  }

  const cache = getOrCreateUserCache(userId);
  const remoteHashes = normalizeRemoteChunkHashes(remoteMeta.chunkHashes);
  if (!cache.hydratedFromServer || cache.rawDocsById.size === 0 || !remoteHashes) {
    return loadDatabaseFromFirestore(userId, null, { forceRefresh: true });
  }

  const changedIds: string[] = [];
  const removedIds: string[] = [];
  for (const [docId, remoteHash] of Object.entries(remoteHashes)) {
    if (cache.chunkHashes.get(docId) !== remoteHash) {
      changedIds.push(docId);
    }
  }
  for (const localDocId of cache.chunkHashes.keys()) {
    if (!(localDocId in remoteHashes)) {
      removedIds.push(localDocId);
    }
  }

  if (changedIds.length > DIFFERENTIAL_GET_DOC_THRESHOLD) {
    return loadDatabaseFromFirestore(userId, null, { forceRefresh: true });
  }

  throwIfFirestoreQuotaBlocked(OperationType.GET, `users/${userId}/dbRecords`);
  await ensureFirebaseSessionAlive(false);

  if (changedIds.length > 0) {
    try {
      const snaps = await Promise.all(
        changedIds.map((docId) => getDoc(doc(db, 'users', userId, 'dbRecords', docId))),
      );
      recordFirestoreQuotaOps({ reads: snaps.length });
      snaps.forEach((docSnap) => {
        if (!docSnap.exists()) {
          cache.chunkHashes.delete(docSnap.id);
          cache.rawDocsById.delete(docSnap.id);
          return;
        }
        const data = docSnap.data();
        const contentHash = String(data?.contentHash || '');
        const rawDoc: RawRecordDoc = {
          id: docSnap.id,
          section: String(data?.section || ''),
          chunkIndex: Number(data?.chunkIndex || 0),
          chunkTotal: Number(data?.chunkTotal || 1),
          contentHash,
          payload: data?.payload,
          updatedAt: timestampToIso(data?.updatedAt),
        };
        cache.chunkHashes.set(docSnap.id, contentHash);
        cache.rawDocsById.set(docSnap.id, rawDoc);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${userId}/dbRecords`);
    }
  }

  for (const removedId of removedIds) {
    cache.chunkHashes.delete(removedId);
    cache.rawDocsById.delete(removedId);
  }

  if (remoteMeta.contentHash) {
    cache.lastWorkspaceContentHash = remoteMeta.contentHash;
  }
  if (typeof remoteMeta.revision === 'number' && Number.isFinite(remoteMeta.revision)) {
    cache.revision = Math.max(cache.revision, remoteMeta.revision);
  }
  cache.lastUpdatedAt = remoteMeta.updatedAt || cache.lastUpdatedAt;
  cache.lastLoadCompletedMs = Date.now();

  const docsList = Array.from(cache.rawDocsById.values());
  if (docsList.length === 0) {
    cache.lastLoadedSnapshot = null;
    return null;
  }

  const reassembled = reassembleDatabaseFromDocs(docsList, remoteMeta.updatedAt);
  const result: LoadedFirestoreDatabase = {
    ...reassembled,
    contentHash: remoteMeta.contentHash || cache.lastWorkspaceContentHash,
    timerSig: cache.lastWorkspaceTimerSig,
    revision: cache.revision,
    chunkHashes: Object.fromEntries(cache.chunkHashes),
  };
  cache.lastLoadedSnapshot = result;

  console.log('[Firebase Sync][DiffLoad] Sincronização diferencial aplicada:', {
    userId,
    fetchedDocs: changedIds.length,
    removedDocs: removedIds.length,
    totalDocs: docsList.length,
  });

  return result;
}

export async function saveDatabaseToFirestore(
  userId: string,
  studyDb: StudyDatabase,
  contentHash: string,
  timerState?: { elapsed: number; startedAt: number; activeTopic?: unknown },
  options?: {
    forceFullWrite?: boolean;
    forceRefreshToken?: boolean;
    bypassQuotaCooldown?: boolean;
    _retriedAfterRehydrate?: boolean;
  },
): Promise<{
  updatedAt: string;
  writtenChunks: number;
  totalChunks: number;
  revision?: number;
}> {
  const diag = getFirestoreConfigDiagnostics();
  if (!diag.isValid) {
    throw Object.assign(new Error(`FIREBASE_CONFIG_MISSING: ${diag.issues.join(' ')}`), {
      code: 'firebase/config-missing',
    });
  }

  const workspacePath = `users/${userId}`;
  throwIfFirestoreQuotaBlocked(
    OperationType.WRITE,
    workspacePath,
    Boolean(options?.bypassQuotaCooldown),
  );

  await ensureFirebaseSessionAlive(Boolean(options?.forceRefreshToken));

  const recordsPath = `users/${userId}/dbRecords`;
  const userDocRef = doc(db, 'users', userId);
  const cache = getOrCreateUserCache(userId);
  cache.lastLocalWriteMs = Date.now();
  cache.lastLoadCompletedMs = 0;
  cache.lastLoadedSnapshot = null;

  let effectiveStudyDb = studyDb;
  let rawChunks = decomposeDatabaseToFirestoreChunks(effectiveStudyDb);
  if (rawChunks.length > MAX_FIRESTORE_CHUNKS_SAFE) {
    effectiveStudyDb = compactStudyDatabaseForChunkBudget(studyDb);
    rawChunks = decomposeDatabaseToFirestoreChunks(effectiveStudyDb, {
      maxChunkBytes: MAX_CHUNK_BYTES_COMPACT,
    });
  }
  if (rawChunks.length > 500) {
    // Prioritize preserving laws, schedules, and core user records if chunk cap is ever hit
    const prioritized = [
      ...rawChunks.filter((c) => c.section === 'laws' || c.section === 'schedule' || c.section === 'scheduleDayDates' || c.section === 'weeklySchedules' || c.section === 'preferences'),
      ...rawChunks.filter((c) => c.section !== 'laws' && c.section !== 'schedule' && c.section !== 'scheduleDayDates' && c.section !== 'weeklySchedules' && c.section !== 'preferences'),
    ];
    rawChunks = prioritized.slice(0, 500);
  }

  const chunkHashesMapObj = buildChunkHashesMapObject(rawChunks);
  const safeContentHash = (contentHash || computeFastHash(JSON.stringify(rawChunks))).slice(0, 128);
  const timerSig = computeTimerSyncSignature(timerState);
  const safeTimerState = buildSafeTimerState(timerState);

  if (!cache.hydratedFromServer || options?.forceFullWrite) {
    let wsSnap;
    try {
      wsSnap = await getDoc(userDocRef);
      recordFirestoreQuotaOps({ reads: 1 });
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, workspacePath);
    }
    cache.workspaceExists = wsSnap.exists();

    if (wsSnap.exists()) {
      const wsData = wsSnap.data();
      cache.lastWorkspaceContentHash = String(wsData?.contentHash || '');
      cache.lastWorkspaceTimerSig = computeTimerSyncSignature(wsData?.timerState);
      cache.lastUpdatedAt = timestampToIso(wsData?.updatedAt);
      const wsRevision = Number(wsData?.revision || 0);
      cache.revision = Math.max(cache.revision, Number.isFinite(wsRevision) ? wsRevision : 0);
      const existingQuery = query(
        collection(db, 'users', userId, 'dbRecords'),
        where('ownerId', '==', userId),
      );
      let existingSnap;
      try {
        existingSnap = await getDocs(existingQuery);
        recordFirestoreQuotaOps({ reads: Math.max(1, existingSnap.size) });
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, recordsPath);
      }
      cache.chunkHashes.clear();
      cache.rawDocsById.clear();
      existingSnap.forEach((d) => {
        const dData = d.data();
        const ch = String(dData?.contentHash || '');
        cache.chunkHashes.set(d.id, ch);
        cache.rawDocsById.set(d.id, {
          id: d.id,
          section: String(dData?.section || ''),
          chunkIndex: Number(dData?.chunkIndex || 0),
          chunkTotal: Number(dData?.chunkTotal || 1),
          contentHash: ch,
          payload: dData?.payload,
          updatedAt: timestampToIso(dData?.updatedAt),
        });
      });
    } else {
      cache.chunkHashes.clear();
      cache.rawDocsById.clear();
      cache.revision = 0;
      cache.lastWorkspaceContentHash = '';
      cache.lastWorkspaceTimerSig = '';
      cache.lastUpdatedAt = '';
    }
    cache.hydratedFromServer = true;
  }

  const nextRevision = Math.max(1, (cache.revision || 0) + 1);

  // Ensure parent workspace document exists BEFORE subcollection writes (required by isWorkspaceOwner rule)
  let createdWorkspaceJustNow = false;
  if (!cache.workspaceExists) {
    try {
      await setDoc(userDocRef, {
        ownerId: userId,
        contentHash: safeContentHash,
        schemaVersion: SCHEMA_VERSION,
        sectionCount: rawChunks.length,
        revision: nextRevision,
        chunkHashes: chunkHashesMapObj,
        timerState: safeTimerState,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      recordFirestoreQuotaOps({ writes: 1 });
      cache.workspaceExists = true;
      cache.revision = nextRevision;
      cache.lastWorkspaceContentHash = safeContentHash;
      cache.lastWorkspaceTimerSig = timerSig;
      createdWorkspaceJustNow = true;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, workspacePath);
    }
  }

  const desiredRecordIds = new Set<string>();
  const ops: Array<
    | { type: 'create'; chunk: StudyDbRecordChunk }
    | { type: 'update'; chunk: StudyDbRecordChunk }
    | { type: 'delete'; recordId: string }
  > = [];

  for (const chunk of rawChunks) {
    desiredRecordIds.add(chunk.recordId);
    const existingHash = cache.chunkHashes.get(chunk.recordId);
    if (existingHash === undefined) {
      ops.push({ type: 'create', chunk });
    } else if (options?.forceFullWrite || existingHash !== chunk.contentHash) {
      ops.push({ type: 'update', chunk });
    }
  }

  for (const oldRecordId of cache.chunkHashes.keys()) {
    if (!desiredRecordIds.has(oldRecordId)) {
      ops.push({ type: 'delete', recordId: oldRecordId });
    }
  }

  if (
    !options?.forceFullWrite &&
    !createdWorkspaceJustNow &&
    ops.length === 0 &&
    cache.lastWorkspaceContentHash === safeContentHash &&
    cache.lastWorkspaceTimerSig === timerSig
  ) {
    const cleanUpdatedAt = cache.lastUpdatedAt || new Date().toISOString();
    console.log('[Firebase Sync][Save] Dirty check: nenhuma alteração detectada — escrita evitada.', {
      workspacePath,
      totalChunks: rawChunks.length,
    });
    return {
      updatedAt: cleanUpdatedAt,
      writtenChunks: 0,
      totalChunks: rawChunks.length,
    };
  }

  console.log('[Firebase Sync][Save] Planejamento de gravação:', {
    workspacePath,
    totalChunks: rawChunks.length,
    pendingOps: ops.length,
  });

  const workspaceMetaDirty =
    Boolean(options?.forceFullWrite) ||
    ops.length > 0 ||
    cache.lastWorkspaceContentHash !== safeContentHash ||
    cache.lastWorkspaceTimerSig !== timerSig;

  const BATCH_LIMIT = 400;
  let workspaceMetaCommittedInBatch = false;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const slice = ops.slice(i, i + BATCH_LIMIT);
    const isLastSlice = i + BATCH_LIMIT >= ops.length;
    const batch = writeBatch(db);
    let batchWrites = 0;
    let batchDeletes = 0;
    for (const op of slice) {
      const id = op.type === 'delete' ? op.recordId : op.chunk.recordId;
      const ref = doc(db, 'users', userId, 'dbRecords', id);
      if (op.type === 'create') {
        batch.set(ref, {
          ownerId: userId,
          section: op.chunk.section,
          chunkIndex: op.chunk.chunkIndex,
          chunkTotal: op.chunk.chunkTotal,
          contentHash: op.chunk.contentHash,
          payload: op.chunk.payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batchWrites += 1;
      } else if (op.type === 'update') {
        batch.update(ref, {
          chunkIndex: op.chunk.chunkIndex,
          chunkTotal: op.chunk.chunkTotal,
          contentHash: op.chunk.contentHash,
          payload: op.chunk.payload,
          updatedAt: serverTimestamp(),
        });
        batchWrites += 1;
      } else {
        batch.delete(ref);
        batchDeletes += 1;
      }
    }

    const includeWorkspaceMetaInBatch =
      isLastSlice && !createdWorkspaceJustNow && workspaceMetaDirty;
    if (includeWorkspaceMetaInBatch) {
      batch.update(userDocRef, {
        contentHash: safeContentHash,
        schemaVersion: SCHEMA_VERSION,
        sectionCount: rawChunks.length,
        revision: nextRevision,
        chunkHashes: chunkHashesMapObj,
        timerState: safeTimerState,
        updatedAt: serverTimestamp(),
      });
      batchWrites += 1;
    }

    try {
      cache.lastLocalWriteMs = Date.now();
      await batch.commit();
      recordFirestoreQuotaOps({ writes: batchWrites, deletes: batchDeletes });
      if (includeWorkspaceMetaInBatch) {
        workspaceMetaCommittedInBatch = true;
      }
    } catch (error: any) {
      const errCode = String(error?.code || '').toLowerCase();
      const errMsg = String(error?.message || '').toLowerCase();
      const isRecoverableCacheDrift =
        !options?._retriedAfterRehydrate &&
        (errCode === 'not-found' ||
          errCode === 'failed-precondition' ||
          errCode === 'permission-denied' ||
          errMsg.includes('no document to update'));
      if (isRecoverableCacheDrift) {
        console.warn('[Firebase Sync][Save] Cache local desalinhado detectado — reidratando do servidor e retentando gravação...', {
          errCode,
          workspacePath,
        });
        cache.hydratedFromServer = false;
        cache.chunkHashes.clear();
        cache.rawDocsById.clear();
        return saveDatabaseToFirestore(userId, studyDb, contentHash, timerState, {
          ...options,
          forceRefreshToken: true,
          _retriedAfterRehydrate: true,
        });
      }
      handleFirestoreError(error, OperationType.WRITE, recordsPath);
    }

    const committedNowIso = new Date().toISOString();
    for (const op of slice) {
      if (op.type === 'delete') {
        cache.chunkHashes.delete(op.recordId);
        cache.rawDocsById.delete(op.recordId);
      } else {
        cache.chunkHashes.set(op.chunk.recordId, op.chunk.contentHash);
        cache.rawDocsById.set(op.chunk.recordId, {
          id: op.chunk.recordId,
          section: op.chunk.section,
          chunkIndex: op.chunk.chunkIndex,
          chunkTotal: op.chunk.chunkTotal,
          contentHash: op.chunk.contentHash,
          payload: op.chunk.payload,
          updatedAt: committedNowIso,
        });
        console.log('[Firebase Sync][Save] Partição atualizada:', {
          recordId: op.chunk.recordId,
          section: op.chunk.section,
        });
      }
    }
  }

  // Fallback atomic update when only workspace metadata or timer changed (ops.length === 0)
  if (!createdWorkspaceJustNow && workspaceMetaDirty && !workspaceMetaCommittedInBatch) {
    try {
      cache.lastLocalWriteMs = Date.now();
      await updateDoc(userDocRef, {
        contentHash: safeContentHash,
        schemaVersion: SCHEMA_VERSION,
        sectionCount: rawChunks.length,
        revision: nextRevision,
        chunkHashes: chunkHashesMapObj,
        timerState: safeTimerState,
        updatedAt: serverTimestamp(),
      });
      recordFirestoreQuotaOps({ writes: 1 });
    } catch (error: any) {
      const errCode = String(error?.code || '').toLowerCase();
      if (
        !options?._retriedAfterRehydrate &&
        (errCode === 'not-found' || errCode === 'failed-precondition' || errCode === 'permission-denied')
      ) {
        cache.hydratedFromServer = false;
        return saveDatabaseToFirestore(userId, studyDb, contentHash, timerState, {
          ...options,
          forceRefreshToken: true,
          _retriedAfterRehydrate: true,
        });
      }
      handleFirestoreError(error, OperationType.UPDATE, workspacePath);
    }
  }

  const updatedAt = new Date().toISOString();
  cache.revision = Math.max(cache.revision, nextRevision);
  cache.lastWorkspaceContentHash = safeContentHash;
  cache.lastWorkspaceTimerSig = timerSig;
  cache.lastUpdatedAt = updatedAt;
  cache.lastLocalWriteMs = Date.now();
  clearFirestoreQuotaCooldown();

  console.log('[Firebase Sync][Save] Sincronização concluída com sucesso:', {
    workspacePath,
    writtenChunks: ops.length,
    totalChunks: rawChunks.length,
    revision: cache.revision,
    updatedAt,
  });

  return {
    updatedAt,
    writtenChunks: ops.length,
    totalChunks: rawChunks.length,
    revision: cache.revision,
  };
}

export const syncTimerStateToFirestore = async (userId: string, timerState: any): Promise<void> => {
  const diag = getFirestoreConfigDiagnostics();
  if (!diag.isValid) return;
  if (getFirestoreQuotaCooldownStatus().blocked) return;
  const activeUser = auth.currentUser;
  if (!activeUser?.uid || activeUser.uid !== userId) return;

  // Só sincroniza quando pausado, zerado ou finalizado (startedAt === 0); nunca enquanto estiver rodando continuamente
  if (Number(timerState?.startedAt || 0) > 0) {
    return;
  }

  const cache = getOrCreateUserCache(userId);
  const timerSig = computeTimerSyncSignature(timerState);
  if (cache.hydratedFromServer && !cache.workspaceExists) {
    return;
  }
  if (cache.hydratedFromServer && cache.workspaceExists && cache.lastWorkspaceTimerSig === timerSig) {
    return;
  }

  cache.lastLocalWriteMs = Date.now();
  const userDocRef = doc(db, 'users', userId);
  const workspacePath = `users/${userId}`;

  if (!cache.workspaceExists) {
    try {
      const snap = await getDoc(userDocRef);
      recordFirestoreQuotaOps({ reads: 1 });
      cache.workspaceExists = snap.exists();
      cache.hydratedFromServer = true;
      if (snap.exists()) {
        const wsData = snap.data();
        cache.lastWorkspaceContentHash = String(wsData?.contentHash || '');
        cache.lastWorkspaceTimerSig = computeTimerSyncSignature(wsData?.timerState);
        cache.lastUpdatedAt = timestampToIso(wsData?.updatedAt);
        const wsRev = Number(wsData?.revision || 0);
        cache.revision = Math.max(cache.revision, Number.isFinite(wsRev) ? wsRev : 0);
      }
    } catch {
      return;
    }
    if (!cache.workspaceExists || cache.lastWorkspaceTimerSig === timerSig) return;
  }

  const nextRevision = Math.max(1, (cache.revision || 0) + 1);
  try {
    await updateDoc(userDocRef, {
      timerState: buildSafeTimerState(timerState),
      revision: nextRevision,
      updatedAt: serverTimestamp(),
    });
    recordFirestoreQuotaOps({ writes: 1 });
    cache.revision = nextRevision;
    cache.lastWorkspaceTimerSig = timerSig;
    cache.lastUpdatedAt = new Date().toISOString();
    cache.lastLocalWriteMs = Date.now();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, workspacePath);
  }
};

export const subscribeToFirestoreWorkspace = (
  userId: string,
  onRemoteUpdate: (meta: {
    contentHash: string;
    updatedAt: string;
    revision?: number;
    chunkHashes?: Record<string, string>;
  }) => void,
  onListenerError?: (err: unknown) => void,
): (() => void) => {
  const diag = getFirestoreConfigDiagnostics();
  if (!diag.isValid || !userId) {
    return () => {};
  }

  const workspacePath = `users/${userId}`;
  const userDocRef = doc(db, 'users', userId);
  let isInitialSnapshot = true;

  console.log('[Firebase Sync][Listener] Escuta em tempo real conectada em:', {
    workspacePath,
    firestoreDatabaseId: diag.firestoreDatabaseId,
  });

  return onSnapshot(
    userDocRef,
    (snapshot) => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }
      if (!snapshot.exists() || snapshot.metadata.hasPendingWrites) {
        return;
      }
      const cache = getOrCreateUserCache(userId);
      if (Date.now() - cache.lastLocalWriteMs < 10_000) {
        return;
      }
      const data = snapshot.data();
      const remoteContentHash = String(data?.contentHash || '');
      const remoteRevision = Number(data?.revision || 0);
      const remoteChunkHashes = normalizeRemoteChunkHashes(data?.chunkHashes);
      if (remoteRevision > 0 && cache.revision > 0 && remoteRevision < cache.revision) {
        return;
      }
      if (remoteContentHash && remoteContentHash !== cache.lastWorkspaceContentHash) {
        cache.lastLoadCompletedMs = 0;
        cache.lastLoadedSnapshot = null;
      }
      onRemoteUpdate({
        contentHash: remoteContentHash,
        updatedAt: timestampToIso(data?.updatedAt) || new Date().toISOString(),
        revision: Number.isFinite(remoteRevision) ? remoteRevision : undefined,
        chunkHashes: remoteChunkHashes,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, workspacePath);
      } catch (wrappedErr) {
        if (onListenerError) {
          onListenerError(wrappedErr);
        }
      }
    },
  );
};

export interface ParsedFirestoreError {
  category: 'auth' | 'permission' | 'config' | 'network' | 'quota' | 'unknown';
  code: string;
  userMessage: string;
  technicalMessage: string;
  path: string | null;
  operationType: string;
  timestamp: string;
}

export function parseFirestoreError(err: unknown): ParsedFirestoreError {
  const rawObj = (err && typeof err === 'object' ? (err as Record<string, any>) : {}) || {};
  const rawCode = String(rawObj.code || '');
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String(rawObj.message || '');

  let parsedInfo: Partial<FirestoreErrorInfo> | null = null;
  if (rawMessage.startsWith('{') && rawMessage.includes('"operationType"')) {
    try {
      parsedInfo = JSON.parse(rawMessage) as Partial<FirestoreErrorInfo>;
    } catch {
      parsedInfo = null;
    }
  }

  const technicalMessage =
    (parsedInfo?.error && String(parsedInfo.error)) ||
    rawMessage ||
    'Falha desconhecida ao comunicar com o Firebase Firestore.';
  const lower = technicalMessage.toLowerCase();
  const path = parsedInfo?.path ?? null;
  const operationType = String(parsedInfo?.operationType || 'write');
  const timestamp = new Date().toISOString();

  if (
    rawCode === 'firebase/config-missing' ||
    technicalMessage.includes('FIREBASE_CONFIG_MISSING') ||
    lower.includes('invalid-argument') ||
    lower.includes('failed-precondition')
  ) {
    return {
      category: 'config',
      code: rawCode || 'firebase/config-missing',
      userMessage:
        'Configuração do Firebase Firestore incompleta ou incompatível com o esquema de segurança.',
      technicalMessage,
      path,
      operationType,
      timestamp,
    };
  }

  if (
    rawCode === 'resource-exhausted' ||
    lower.includes('resource-exhausted') ||
    lower.includes('quota exceeded')
  ) {
    return {
      category: 'quota',
      code: rawCode || 'resource-exhausted',
      userMessage:
        'Limite diário de cota gratuita do Firestore atingido temporariamente. Seus dados continuam salvos localmente e na pasta local.',
      technicalMessage,
      path,
      operationType,
      timestamp,
    };
  }

  if (
    rawCode === 'permission-denied' ||
    lower.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions')
  ) {
    return {
      category: 'permission',
      code: rawCode || 'permission-denied',
      userMessage:
        'Permissão negada pelas regras do Firestore. Confirme se você está conectado com sua conta Google verificada.',
      technicalMessage,
      path,
      operationType,
      timestamp,
    };
  }

  if (
    rawCode === 'unauthenticated' ||
    rawCode.startsWith('auth/') ||
    lower.includes('unauthenticated') ||
    lower.includes('id token')
  ) {
    return {
      category: 'auth',
      code: rawCode || 'unauthenticated',
      userMessage:
        'Sua sessão de autenticação do Firebase expirou ou foi desconectada. Clique em "Reconectar Google".',
      technicalMessage,
      path,
      operationType,
      timestamp,
    };
  }

  if (
    rawCode === 'unavailable' ||
    rawCode === 'deadline-exceeded' ||
    lower.includes('the client is offline') ||
    lower.includes('unavailable') ||
    lower.includes('network') ||
    lower.includes('failed to fetch')
  ) {
    return {
      category: 'network',
      code: rawCode || 'unavailable',
      userMessage:
        'Sem conexão estável com o servidor Firestore no momento. As alterações ficam salvas localmente e serão enviadas assim que a rede estabilizar.',
      technicalMessage,
      path,
      operationType,
      timestamp,
    };
  }

  return {
    category: 'unknown',
    code: rawCode || 'firestore-error',
    userMessage: technicalMessage,
    technicalMessage,
    path,
    operationType,
    timestamp,
  };
}

export interface FirestoreAuthHealthReport {
  status: 'healthy' | 'warning' | 'expired' | 'inconsistent';
  code: string;
  message: string;
  checkedAt: string;
  uid: string | null;
  email: string | null;
  emailVerified: boolean | null;
  tokenExpiresAt: string | null;
}

export async function validateFirestoreAuthConnection(
  expectedUserId?: string | null,
  expectedEmail?: string | null,
): Promise<FirestoreAuthHealthReport> {
  const now = new Date().toISOString();
  const diag = getFirestoreConfigDiagnostics();

  if (!diag.isValid) {
    return {
      status: 'expired',
      code: 'firebase/config-missing',
      message: diag.issues.join(' '),
      checkedAt: now,
      uid: auth.currentUser?.uid || expectedUserId || null,
      email: auth.currentUser?.email || expectedEmail || null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      tokenExpiresAt: null,
    };
  }

  await ensureFirebaseSessionAlive(false).catch(() => null);
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return {
      status: 'expired',
      code: 'auth/session-missing',
      message: 'Sessão do Firebase Authentication expirada ou desconectada.',
      checkedAt: now,
      uid: null,
      email: null,
      emailVerified: null,
      tokenExpiresAt: null,
    };
  }

  if (expectedUserId && currentUser.uid !== expectedUserId) {
    return {
      status: 'inconsistent',
      code: 'auth/uid-mismatch',
      message: 'Divergência entre o usuário ativo do Firebase e a sessão carregada.',
      checkedAt: now,
      uid: currentUser.uid,
      email: currentUser.email,
      emailVerified: currentUser.emailVerified,
      tokenExpiresAt: null,
    };
  }

  if (!currentUser.emailVerified) {
    return {
      status: 'inconsistent',
      code: 'auth/email-not-verified',
      message: 'O e-mail da conta Google precisa estar verificado para gravar no Firestore.',
      checkedAt: now,
      uid: currentUser.uid,
      email: currentUser.email,
      emailVerified: false,
      tokenExpiresAt: null,
    };
  }

  try {
    let tokenResult = await currentUser.getIdTokenResult(false);
    const expiresMs = Date.parse(tokenResult.expirationTime || '') || 0;
    if (expiresMs > 0 && expiresMs - Date.now() < 5 * 60 * 1000) {
      await currentUser.getIdToken(true);
      tokenResult = await currentUser.getIdTokenResult(false);
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        status: 'warning',
        code: 'network/offline',
        message: 'Navegador offline no momento. A sincronização será retomada ao reconectar.',
        checkedAt: now,
        uid: currentUser.uid,
        email: currentUser.email,
        emailVerified: currentUser.emailVerified,
        tokenExpiresAt: tokenResult.expirationTime || null,
      };
    }

    return {
      status: 'healthy',
      code: 'ok',
      message: `Firebase Firestore conectado (${diag.projectId} · ${diag.firestoreDatabaseId || 'default'}).`,
      checkedAt: now,
      uid: currentUser.uid,
      email: currentUser.email || expectedEmail || null,
      emailVerified: currentUser.emailVerified,
      tokenExpiresAt: tokenResult.expirationTime || null,
    };
  } catch (err: any) {
    return {
      status: 'warning',
      code: String(err?.code || 'auth/token-check-failed'),
      message: err?.message || 'Não foi possível validar o token do Firebase Authentication.',
      checkedAt: now,
      uid: currentUser.uid,
      email: currentUser.email,
      emailVerified: currentUser.emailVerified,
      tokenExpiresAt: null,
    };
  }
}

export function getFirestoreConfigDiagnostics() {
  const projectId = String(firebaseConfig?.projectId || '').trim();
  const authDomain = String(firebaseConfig?.authDomain || '').trim();
  const firestoreDatabaseId =
    String(firebaseConfig?.firestoreDatabaseId || '').trim() || DEFAULT_FIRESTORE_DATABASE_ID;
  const hasApiKey = Boolean(String(firebaseConfig?.apiKey || '').trim());
  const hasAppId = Boolean(String(firebaseConfig?.appId || '').trim());
  const issues: string[] = [];

  if (!projectId) issues.push('projectId do Firebase ausente em firebase-applet-config.json.');
  if (!hasApiKey) issues.push('apiKey do Firebase ausente em firebase-applet-config.json.');
  if (!hasAppId) issues.push('appId do Firebase ausente em firebase-applet-config.json.');

  return {
    projectId: projectId || 'não configurado',
    authDomain: authDomain || 'não configurado',
    firestoreDatabaseId: firestoreDatabaseId || '(default)',
    hasApiKey,
    hasAppId,
    isValid: issues.length === 0,
    issues,
  };
}

export const FIREBASE_RECONNECT_BACKOFF_DELAYS_MS = [1200, 2500, 5000] as const;

export async function executeWithFirebaseBackoff<T>(
  options: {
    operationName?: string;
    delaysMs?: readonly number[];
    shouldCancel?: () => boolean;
    onBeforeRetry?: (info: {
      attempt: number;
      maxRetries: number;
      delayMs: number;
      parsedError: ParsedFirestoreError;
    }) => Promise<void> | void;
  },
  task: (attemptIndex: number) => Promise<T>,
): Promise<T> {
  const delays = options.delaysMs || FIREBASE_RECONNECT_BACKOFF_DELAYS_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (options.shouldCancel?.()) {
      throw new Error('Operação cancelada.');
    }
    try {
      return await task(attempt);
    } catch (err) {
      lastError = err;
      const parsed = parseFirestoreError(err);
      if (parsed.category === 'config' || parsed.category === 'permission' || parsed.category === 'quota') {
        throw err;
      }
      if (attempt >= delays.length) {
        throw err;
      }
      const delayMs = delays[attempt];
      if (options.onBeforeRetry) {
        await options.onBeforeRetry({
          attempt: attempt + 1,
          maxRetries: delays.length,
          delayMs,
          parsedError: parsed,
        });
      }
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
