import { getApps, getApp, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AppPreferences,
  LawFolderData,
  LawItem,
  ScheduleMap,
  StudyDatabase,
} from '../types/study';
import { DEFAULT_PREFERENCES, createInitialDatabase } from '../data/seedData';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
function createFirestoreClient() {
  try {
    return initializeFirestore(
      app,
      { experimentalAutoDetectLongPolling: true },
      firebaseConfig.firestoreDatabaseId,
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}
export const firestoreDb = createFirestoreClient();
export const firebaseAuth = getAuth(app);

const FIRESTORE_READ_TIMEOUT_MS = 15_000;
const FIRESTORE_WRITE_TIMEOUT_MS = 18_000;
const FIRESTORE_BATCH_TIMEOUT_MS = 22_000;

async function withFirestoreTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationLabel: string,
): Promise<T> {
  let timerId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timerId = window.setTimeout(() => {
          reject(new Error(`Tempo limite excedido (${Math.round(timeoutMs / 1000)}s) em ${operationLabel}.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }
  }
}

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const currentUser = firebaseAuth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;

export async function testFirestoreConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testFirestoreConnection();

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
  'pdfFolders',
  'summaryFolders',
] as const;

const OBJECT_SECTIONS = ['schedule', 'scheduleDayDates', 'preferences'] as const;

const MAX_ITEMS_PER_CHUNK = 120;
const MAX_LAW_ITEMS_PER_SLICE = 75;
const MAX_CHUNK_BYTES = 240_000; // ~240 KB per Firestore document (well below 1MB limit)

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
  return `fh_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}_${input.length}`;
}

export function sanitizeForFirestore<T>(value: T): T {
  if (value === null || value === undefined) {
    return null as unknown as T;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as unknown as T;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
      if (rawVal === undefined) continue;
      const safeKey =
        !rawKey || /^__.*__$/.test(rawKey)
          ? `k_${rawKey.replace(/^__+|__+$/g, '') || 'empty'}`
          : rawKey;
      result[safeKey] = sanitizeForFirestore(rawVal);
    }
    return result as unknown as T;
  }
  return String(value) as unknown as T;
}

export interface StudyDbRecordChunk {
  recordId: string;
  section: string;
  chunkIndex: number;
  chunkTotal: number;
  contentHash: string;
  payload: Record<string, unknown>;
}

function estimateByteLength(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 1024;
  }
}

function buildArraySectionChunks(section: string, items: unknown[]): StudyDbRecordChunk[] {
  const safeItems = Array.isArray(items) ? items : [];
  if (safeItems.length === 0) {
    const payload = { kind: 'array', count: 0, entries: {} };
    return [
      {
        recordId: `${section}_0`,
        section,
        chunkIndex: 0,
        chunkTotal: 1,
        contentHash: computeFastHash(`${section}:empty`),
        payload,
      },
    ];
  }

  const rawChunks: Array<Record<string, unknown>> = [];
  let currentEntries: Record<string, unknown> = {};
  let currentCount = 0;
  let currentBytes = 64;

  for (let i = 0; i < safeItems.length; i++) {
    const cleanItem = sanitizeForFirestore(safeItems[i]);
    const itemBytes = estimateByteLength(cleanItem);
    if (
      currentCount > 0 &&
      (currentCount >= MAX_ITEMS_PER_CHUNK || currentBytes + itemBytes > MAX_CHUNK_BYTES)
    ) {
      rawChunks.push({
        kind: 'array',
        count: currentCount,
        entries: currentEntries,
      });
      currentEntries = {};
      currentCount = 0;
      currentBytes = 64;
    }
    currentEntries[String(currentCount)] = cleanItem;
    currentCount += 1;
    currentBytes += itemBytes;
  }

  if (currentCount > 0 || rawChunks.length === 0) {
    rawChunks.push({
      kind: 'array',
      count: currentCount,
      entries: currentEntries,
    });
  }

  const chunkTotal = rawChunks.length;
  return rawChunks.map((payload, chunkIndex) => {
    const serialized = JSON.stringify(payload);
    return {
      recordId: `${section}_${chunkIndex}`,
      section,
      chunkIndex,
      chunkTotal,
      contentHash: computeFastHash(`${section}:${chunkIndex}:${chunkTotal}:${serialized}`),
      payload,
    };
  });
}

function buildRecordSectionChunks(
  section: string,
  recordObj: Record<string, unknown> | undefined | null,
): StudyDbRecordChunk[] {
  const entriesList =
    recordObj && typeof recordObj === 'object' ? Object.entries(recordObj) : [];
  if (entriesList.length === 0) {
    const payload = { kind: 'record', count: 0, entries: {} };
    return [
      {
        recordId: `${section}_0`,
        section,
        chunkIndex: 0,
        chunkTotal: 1,
        contentHash: computeFastHash(`${section}:empty`),
        payload,
      },
    ];
  }

  const rawChunks: Array<Record<string, unknown>> = [];
  let currentEntries: Record<string, unknown> = {};
  let currentCount = 0;
  let currentBytes = 64;

  for (const [k, v] of entriesList) {
    if (v === undefined) continue;
    const cleanPair = { k: String(k), v: sanitizeForFirestore(v) };
    const pairBytes = estimateByteLength(cleanPair);
    if (
      currentCount > 0 &&
      (currentCount >= MAX_ITEMS_PER_CHUNK || currentBytes + pairBytes > MAX_CHUNK_BYTES)
    ) {
      rawChunks.push({
        kind: 'record',
        count: currentCount,
        entries: currentEntries,
      });
      currentEntries = {};
      currentCount = 0;
      currentBytes = 64;
    }
    currentEntries[String(currentCount)] = cleanPair;
    currentCount += 1;
    currentBytes += pairBytes;
  }

  if (currentCount > 0 || rawChunks.length === 0) {
    rawChunks.push({
      kind: 'record',
      count: currentCount,
      entries: currentEntries,
    });
  }

  const chunkTotal = rawChunks.length;
  return rawChunks.map((payload, chunkIndex) => {
    const serialized = JSON.stringify(payload);
    return {
      recordId: `${section}_${chunkIndex}`,
      section,
      chunkIndex,
      chunkTotal,
      contentHash: computeFastHash(`${section}:${chunkIndex}:${chunkTotal}:${serialized}`),
      payload,
    };
  });
}

function buildObjectSectionChunks(section: string, obj: unknown): StudyDbRecordChunk[] {
  const cleanObj = sanitizeForFirestore(obj && typeof obj === 'object' ? obj : {});
  const payload = {
    kind: 'object',
    data: cleanObj,
  };
  const serialized = JSON.stringify(payload);
  return [
    {
      recordId: `${section}_0`,
      section,
      chunkIndex: 0,
      chunkTotal: 1,
      contentHash: computeFastHash(`${section}:0:1:${serialized}`),
      payload,
    },
  ];
}

function buildLawsSectionChunks(
  laws: Record<string, LawFolderData> | undefined | null,
): StudyDbRecordChunk[] {
  const folderEntries = laws && typeof laws === 'object' ? Object.entries(laws) : [];
  if (folderEntries.length === 0) {
    const payload = { kind: 'laws', count: 0, slices: {} };
    return [
      {
        recordId: 'laws_0',
        section: 'laws',
        chunkIndex: 0,
        chunkTotal: 1,
        contentHash: computeFastHash('laws:empty'),
        payload,
      },
    ];
  }

  interface LawSlice {
    folderKey: string;
    name: string;
    pdfs: unknown[];
    itemOffset: number;
    itemCount: number;
    items: Record<string, unknown>;
  }

  const allSlices: LawSlice[] = [];
  for (const [folderKey, folderData] of folderEntries) {
    if (!folderData || typeof folderData !== 'object') continue;
    const items = Array.isArray(folderData.items) ? folderData.items : [];
    const pdfs = sanitizeForFirestore(Array.isArray(folderData.pdfs) ? folderData.pdfs : []);
    const folderName = String(folderData.name || folderKey);

    if (items.length === 0) {
      allSlices.push({
        folderKey,
        name: folderName,
        pdfs,
        itemOffset: 0,
        itemCount: 0,
        items: {},
      });
      continue;
    }

    for (let offset = 0; offset < items.length; offset += MAX_LAW_ITEMS_PER_SLICE) {
      const sliceItems = items.slice(offset, offset + MAX_LAW_ITEMS_PER_SLICE);
      const itemMap: Record<string, unknown> = {};
      sliceItems.forEach((item, idx) => {
        itemMap[String(idx)] = sanitizeForFirestore(item);
      });
      allSlices.push({
        folderKey,
        name: folderName,
        pdfs: offset === 0 ? pdfs : [],
        itemOffset: offset,
        itemCount: sliceItems.length,
        items: itemMap,
      });
    }
  }

  const rawChunks: Array<Record<string, unknown>> = [];
  let currentSlices: Record<string, unknown> = {};
  let currentCount = 0;
  let currentBytes = 64;

  for (const slice of allSlices) {
    const sliceBytes = estimateByteLength(slice);
    if (
      currentCount > 0 &&
      (currentCount >= 25 || currentBytes + sliceBytes > MAX_CHUNK_BYTES)
    ) {
      rawChunks.push({
        kind: 'laws',
        count: currentCount,
        slices: currentSlices,
      });
      currentSlices = {};
      currentCount = 0;
      currentBytes = 64;
    }
    currentSlices[String(currentCount)] = slice;
    currentCount += 1;
    currentBytes += sliceBytes;
  }

  if (currentCount > 0 || rawChunks.length === 0) {
    rawChunks.push({
      kind: 'laws',
      count: currentCount,
      slices: currentSlices,
    });
  }

  const chunkTotal = rawChunks.length;
  return rawChunks.map((payload, chunkIndex) => {
    const serialized = JSON.stringify(payload);
    return {
      recordId: `laws_${chunkIndex}`,
      section: 'laws',
      chunkIndex,
      chunkTotal,
      contentHash: computeFastHash(`laws:${chunkIndex}:${chunkTotal}:${serialized}`),
      payload,
    };
  });
}

export function decomposeDatabaseToFirestoreChunks(db: StudyDatabase): StudyDbRecordChunk[] {
  const chunks: StudyDbRecordChunk[] = [];

  for (const section of ARRAY_SECTIONS) {
    const arr = (db as unknown as Record<string, unknown[]>)[section] || [];
    chunks.push(...buildArraySectionChunks(section, arr));
  }

  for (const section of RECORD_SECTIONS) {
    const rec = (db as unknown as Record<string, Record<string, unknown>>)[section] || {};
    chunks.push(...buildRecordSectionChunks(section, rec));
  }

  for (const section of OBJECT_SECTIONS) {
    const obj = (db as unknown as Record<string, unknown>)[section] || {};
    chunks.push(...buildObjectSectionChunks(section, obj));
  }

  chunks.push(...buildLawsSectionChunks(db.laws));
  return chunks;
}

export function reassembleDatabaseFromFirestoreChunks(
  chunks: StudyDbRecordChunk[],
  fallbackSeed?: StudyDatabase,
): StudyDatabase {
  const base = fallbackSeed ? { ...fallbackSeed } : createInitialDatabase();
  if (!chunks || chunks.length === 0) return base;

  const grouped = new Map<string, StudyDbRecordChunk[]>();
  for (const chunk of chunks) {
    if (!chunk?.section) continue;
    const list = grouped.get(chunk.section) || [];
    list.push(chunk);
    grouped.set(chunk.section, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  const assembled: Record<string, unknown> = { ...base };

  for (const section of ARRAY_SECTIONS) {
    const sectionChunks = grouped.get(section);
    if (!sectionChunks || sectionChunks.length === 0) continue;
    const items: unknown[] = [];
    for (const chunk of sectionChunks) {
      const payload = chunk.payload || {};
      const entries = (payload.entries as Record<string, unknown>) || {};
      const count =
        typeof payload.count === 'number'
          ? payload.count
          : Object.keys(entries).length;
      for (let i = 0; i < count; i++) {
        if (String(i) in entries) {
          items.push(entries[String(i)]);
        }
      }
    }
    assembled[section] = items;
  }

  for (const section of RECORD_SECTIONS) {
    const sectionChunks = grouped.get(section);
    if (!sectionChunks || sectionChunks.length === 0) continue;
    const rec: Record<string, unknown> = {};
    for (const chunk of sectionChunks) {
      const payload = chunk.payload || {};
      const entries = (payload.entries as Record<string, unknown>) || {};
      const count =
        typeof payload.count === 'number'
          ? payload.count
          : Object.keys(entries).length;
      for (let i = 0; i < count; i++) {
        const pair = entries[String(i)] as { k?: string; v?: unknown } | undefined;
        if (pair && typeof pair.k === 'string') {
          rec[pair.k] = pair.v;
        }
      }
    }
    assembled[section] = rec;
  }

  for (const section of OBJECT_SECTIONS) {
    const sectionChunks = grouped.get(section);
    if (!sectionChunks || sectionChunks.length === 0) continue;
    const firstPayload = sectionChunks[0]?.payload || {};
    if (firstPayload.data && typeof firstPayload.data === 'object') {
      if (section === 'preferences') {
        assembled.preferences = {
          ...DEFAULT_PREFERENCES,
          ...(firstPayload.data as Partial<AppPreferences>),
          modules: {
            ...DEFAULT_PREFERENCES.modules,
            ...((firstPayload.data as Partial<AppPreferences>).modules || {}),
          },
        };
      } else {
        assembled[section] = firstPayload.data as ScheduleMap;
      }
    }
  }

  const lawChunks = grouped.get('laws');
  if (lawChunks && lawChunks.length > 0) {
    const lawsMap: Record<string, LawFolderData> = {};
    for (const chunk of lawChunks) {
      const payload = chunk.payload || {};
      const slices = (payload.slices as Record<string, unknown>) || {};
      const count =
        typeof payload.count === 'number'
          ? payload.count
          : Object.keys(slices).length;
      for (let i = 0; i < count; i++) {
        const slice = slices[String(i)] as
          | {
              folderKey?: string;
              name?: string;
              pdfs?: unknown[];
              itemOffset?: number;
              itemCount?: number;
              items?: Record<string, LawItem>;
            }
          | undefined;
        if (!slice || typeof slice.folderKey !== 'string') continue;
        const folderKey = slice.folderKey;
        if (!lawsMap[folderKey]) {
          lawsMap[folderKey] = {
            name: String(slice.name || folderKey),
            items: [],
            pdfs: Array.isArray(slice.pdfs) ? (slice.pdfs as LawFolderData['pdfs']) : [],
          };
        } else if (Array.isArray(slice.pdfs) && slice.pdfs.length > 0 && lawsMap[folderKey].pdfs.length === 0) {
          lawsMap[folderKey].pdfs = slice.pdfs as LawFolderData['pdfs'];
        }
        const sliceItems = slice.items || {};
        const itemCount =
          typeof slice.itemCount === 'number'
            ? slice.itemCount
            : Object.keys(sliceItems).length;
        for (let j = 0; j < itemCount; j++) {
          const item = sliceItems[String(j)];
          if (item) {
            lawsMap[folderKey].items.push(item);
          }
        }
      }
    }
    assembled.laws = lawsMap;
  }

  return assembled as unknown as StudyDatabase;
}

interface UserFirestoreCacheState {
  workspaceExists: boolean;
  workspaceContentHash: string | null;
  chunkHashes: Map<string, string>;
}

const userCacheStates = new Map<string, UserFirestoreCacheState>();

function getOrCreateUserCacheState(userId: string): UserFirestoreCacheState {
  let st = userCacheStates.get(userId);
  if (!st) {
    st = {
      workspaceExists: false,
      workspaceContentHash: null,
      chunkHashes: new Map<string, string>(),
    };
    userCacheStates.set(userId, st);
  }
  return st;
}

export function clearUserFirestoreCacheState(userId?: string): void {
  if (userId) {
    userCacheStates.delete(userId);
  } else {
    userCacheStates.clear();
  }
}

export interface LoadedFirestoreWorkspace {
  db: StudyDatabase;
  contentHash: string;
  updatedAt: string;
  sectionCount: number;
  timerState?: {
    elapsed?: number;
    startedAt?: number;
    activeTopic?: unknown;
  };
}

function timestampToIso(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof ts === 'string' && ts.trim()) {
    return ts;
  }
  return new Date().toISOString();
}

export async function loadDatabaseFromFirestore(
  userId: string,
): Promise<LoadedFirestoreWorkspace | null> {
  if (!userId || !firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== userId) {
    return null;
  }

  const workspacePath = `users/${userId}`;
  const recordsPath = `users/${userId}/dbRecords`;
  const state = getOrCreateUserCacheState(userId);

  let workspaceSnap;
  try {
    workspaceSnap = await withFirestoreTimeout(
      getDoc(doc(firestoreDb, 'users', userId)),
      FIRESTORE_READ_TIMEOUT_MS,
      'leitura do workspace no Firestore',
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, workspacePath);
  }

  if (!workspaceSnap.exists()) {
    state.workspaceExists = false;
    state.workspaceContentHash = null;
    state.chunkHashes.clear();
    return null;
  }

  const wsData = workspaceSnap.data() || {};
  state.workspaceExists = true;
  state.workspaceContentHash = typeof wsData.contentHash === 'string' ? wsData.contentHash : null;

  let recordsSnap;
  try {
    const q = query(
      collection(firestoreDb, 'users', userId, 'dbRecords'),
      where('ownerId', '==', userId),
    );
    recordsSnap = await withFirestoreTimeout(
      getDocs(q),
      FIRESTORE_READ_TIMEOUT_MS,
      'leitura das partições no Firestore',
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, recordsPath);
  }

  const chunks: StudyDbRecordChunk[] = [];
  const nextChunkHashes = new Map<string, string>();

  recordsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const recordId = docSnap.id;
    const section = String(data.section || '');
    const chunkIndex = typeof data.chunkIndex === 'number' ? data.chunkIndex : 0;
    const chunkTotal = typeof data.chunkTotal === 'number' ? data.chunkTotal : 1;
    const contentHash = String(data.contentHash || '');
    const payload = (data.payload as Record<string, unknown>) || {};
    if (section) {
      chunks.push({
        recordId,
        section,
        chunkIndex,
        chunkTotal,
        contentHash,
        payload,
      });
      nextChunkHashes.set(recordId, contentHash);
    }
  });

  state.chunkHashes = nextChunkHashes;

  if (chunks.length === 0) {
    return null;
  }

  const assembledDb = reassembleDatabaseFromFirestoreChunks(chunks);
  const updatedAt = timestampToIso(wsData.updatedAt || wsData.createdAt);

  return {
    db: assembledDb,
    contentHash: String(wsData.contentHash || computeFastHash(JSON.stringify(assembledDb))),
    updatedAt,
    sectionCount: chunks.length,
    timerState:
      wsData.timerState && typeof wsData.timerState === 'object'
        ? (wsData.timerState as LoadedFirestoreWorkspace['timerState'])
        : undefined,
  };
}

export async function saveDatabaseToFirestore(
  userId: string,
  db: StudyDatabase,
  contentHash: string,
  timerState?: {
    elapsed: number;
    startedAt: number;
    activeTopic?: unknown;
  },
  options?: {
    forceFullWrite?: boolean;
  },
): Promise<{
  updatedAt: string;
  writtenChunks: number;
  totalChunks: number;
}> {
  if (!userId || !firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== userId) {
    throw new Error('Usuário não autenticado no Firebase.');
  }

  const state = getOrCreateUserCacheState(userId);
  const workspaceRef = doc(firestoreDb, 'users', userId);
  const workspacePath = `users/${userId}`;
  const recordsPath = `users/${userId}/dbRecords`;

  const chunks = decomposeDatabaseToFirestoreChunks(db);
  const safeContentHash = String(contentHash || computeFastHash(JSON.stringify(db))).slice(0, 128);
  const safeTimerState = sanitizeForFirestore({
    elapsed: Number(timerState?.elapsed || 0),
    startedAt: Number(timerState?.startedAt || 0),
    ...(timerState?.activeTopic ? { activeTopic: timerState.activeTopic } : {}),
  });

  // Verify whether the parent /users/{userId} document already exists on server
  if (!state.workspaceExists) {
    try {
      const existingWs = await withFirestoreTimeout(
        getDoc(workspaceRef),
        FIRESTORE_READ_TIMEOUT_MS,
        'verificação do workspace no Firestore',
      );
      if (existingWs.exists()) {
        state.workspaceExists = true;
        const existingData = existingWs.data();
        if (typeof existingData?.contentHash === 'string') {
          state.workspaceContentHash = existingData.contentHash;
        }
        // Also populate existing record IDs so we use updateDoc for existing docs and setDoc for new docs
        if (state.chunkHashes.size === 0) {
          const existingRecords = await withFirestoreTimeout(
            getDocs(
              query(
                collection(firestoreDb, 'users', userId, 'dbRecords'),
                where('ownerId', '==', userId),
              ),
            ),
            FIRESTORE_READ_TIMEOUT_MS,
            'listagem de partições no Firestore',
          );
          existingRecords.forEach((r) => {
            const d = r.data();
            state.chunkHashes.set(r.id, String(d.contentHash || ''));
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, workspacePath);
    }
  }

  // Step 1: If parent workspace does not exist yet, create it FIRST so Pillar 1 Master Gate succeeds
  let createdWorkspaceNow = false;
  if (!state.workspaceExists) {
    try {
      await withFirestoreTimeout(
        setDoc(workspaceRef, {
          ownerId: userId,
          contentHash: safeContentHash,
          schemaVersion: 2,
          sectionCount: chunks.length,
          timerState: safeTimerState,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        FIRESTORE_WRITE_TIMEOUT_MS,
        'criação do workspace no Firestore',
      );
      state.workspaceExists = true;
      state.workspaceContentHash = safeContentHash;
      createdWorkspaceNow = true;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, workspacePath);
    }
  }

  // Step 2: Determine which chunks need create, update, or delete
  const activeRecordIds = new Set<string>();
  const toCreate: StudyDbRecordChunk[] = [];
  const toUpdate: StudyDbRecordChunk[] = [];
  const toDelete: string[] = [];

  for (const chunk of chunks) {
    activeRecordIds.add(chunk.recordId);
    const prevHash = state.chunkHashes.get(chunk.recordId);
    if (prevHash === undefined) {
      toCreate.push(chunk);
    } else if (options?.forceFullWrite || prevHash !== chunk.contentHash) {
      toUpdate.push(chunk);
    }
  }

  for (const oldRecordId of state.chunkHashes.keys()) {
    if (!activeRecordIds.has(oldRecordId)) {
      toDelete.push(oldRecordId);
    }
  }

  // Execute chunk mutations in safe batches of 20 operations
  type BatchOp =
    | { kind: 'create'; chunk: StudyDbRecordChunk }
    | { kind: 'update'; chunk: StudyDbRecordChunk }
    | { kind: 'delete'; recordId: string };

  const allOps: BatchOp[] = [
    ...toCreate.map((chunk): BatchOp => ({ kind: 'create', chunk })),
    ...toUpdate.map((chunk): BatchOp => ({ kind: 'update', chunk })),
    ...toDelete.map((recordId): BatchOp => ({ kind: 'delete', recordId })),
  ];

  const BATCH_SIZE = 20;
  for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
    const slice = allOps.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestoreDb);

    for (const op of slice) {
      if (op.kind === 'create') {
        const ref = doc(firestoreDb, 'users', userId, 'dbRecords', op.chunk.recordId);
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
      } else if (op.kind === 'update') {
        const ref = doc(firestoreDb, 'users', userId, 'dbRecords', op.chunk.recordId);
        batch.update(ref, {
          chunkIndex: op.chunk.chunkIndex,
          chunkTotal: op.chunk.chunkTotal,
          contentHash: op.chunk.contentHash,
          payload: op.chunk.payload,
          updatedAt: serverTimestamp(),
        });
      } else if (op.kind === 'delete') {
        const ref = doc(firestoreDb, 'users', userId, 'dbRecords', op.recordId);
        batch.delete(ref);
      }
    }

    try {
      await withFirestoreTimeout(
        batch.commit(),
        FIRESTORE_BATCH_TIMEOUT_MS,
        `gravação em lote no Firestore (${i + 1}-${i + slice.length})`,
      );
      for (const op of slice) {
        if (op.kind === 'create' || op.kind === 'update') {
          state.chunkHashes.set(op.chunk.recordId, op.chunk.contentHash);
        } else if (op.kind === 'delete') {
          state.chunkHashes.delete(op.recordId);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, recordsPath);
    }
  }

  // Step 3: Update the parent /users/{userId} workspace metadata if not just created or if chunks changed
  if (!createdWorkspaceNow && (allOps.length > 0 || state.workspaceContentHash !== safeContentHash || options?.forceFullWrite)) {
    try {
      await withFirestoreTimeout(
        updateDoc(workspaceRef, {
          contentHash: safeContentHash,
          schemaVersion: 2,
          sectionCount: chunks.length,
          timerState: safeTimerState,
          updatedAt: serverTimestamp(),
        }),
        FIRESTORE_WRITE_TIMEOUT_MS,
        'atualização do workspace no Firestore',
      );
      state.workspaceContentHash = safeContentHash;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, workspacePath);
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    writtenChunks: toCreate.length + toUpdate.length,
    totalChunks: chunks.length,
  };
}

export async function syncTimerStateToFirestore(
  userId: string,
  timerState: {
    elapsed: number;
    startedAt: number;
    activeTopic?: unknown;
  },
): Promise<void> {
  if (!userId || !firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== userId) {
    return;
  }
  const state = getOrCreateUserCacheState(userId);
  if (!state.workspaceExists) return;

  const workspaceRef = doc(firestoreDb, 'users', userId);
  const safeTimerState = sanitizeForFirestore({
    elapsed: Number(timerState.elapsed || 0),
    startedAt: Number(timerState.startedAt || 0),
    ...(timerState.activeTopic ? { activeTopic: timerState.activeTopic } : {}),
  });

  try {
    await updateDoc(workspaceRef, {
      timerState: safeTimerState,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
}

export function subscribeToFirestoreWorkspace(
  userId: string,
  onRemoteUpdate: (meta: {
    contentHash: string;
    updatedAt: string;
    timerState?: {
      elapsed?: number;
      startedAt?: number;
      activeTopic?: unknown;
    };
  }) => void,
): Unsubscribe {
  if (!userId || !firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== userId) {
    return () => {};
  }

  const workspacePath = `users/${userId}`;
  const workspaceRef = doc(firestoreDb, 'users', userId);

  return onSnapshot(
    workspaceRef,
    (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const data = snap.data() || {};
      const state = getOrCreateUserCacheState(userId);
      state.workspaceExists = true;
      const remoteHash = typeof data.contentHash === 'string' ? data.contentHash : '';
      if (!remoteHash || remoteHash === state.workspaceContentHash) {
        return;
      }
      onRemoteUpdate({
        contentHash: remoteHash,
        updatedAt: timestampToIso(data.updatedAt || data.createdAt),
        timerState:
          data.timerState && typeof data.timerState === 'object'
            ? (data.timerState as {
                elapsed?: number;
                startedAt?: number;
                activeTopic?: unknown;
              })
            : undefined,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, workspacePath);
      } catch {
        // Logged by handleFirestoreError
      }
    },
  );
}
