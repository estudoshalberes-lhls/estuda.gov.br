import { supabase } from './supabase';
import { StudyDatabase } from '../types/study';
import { decomposeDatabaseToFirestoreChunks, sanitizeForFirestore } from './firebaseDb';

export { decomposeDatabaseToFirestoreChunks, sanitizeForFirestore };

export async function supabaseGoogleSignIn() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function supabaseSignOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadDatabaseFromSupabase(userId: string) {
  try {
    const { data, error } = await supabase
      .from('study_records')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    if (!data || data.length === 0) return null;

    const reconstructedDb: Record<string, any> = {};
    let latestUpdatedAt = new Date().toISOString();
    let sectionCount = data.length;

    for (const row of data) {
      if (row.section === '__workspace_meta__' || row.section === '__timer_state__') continue;
      const section = row.section;
      const payload = row.payload || {};
      if (row.updated_at && row.updated_at > latestUpdatedAt) {
        latestUpdatedAt = row.updated_at;
      }

      if (payload.kind === 'array') {
        if (!reconstructedDb[section]) reconstructedDb[section] = [];
        const entriesObj = payload.entries || {};
        const sortedKeys = Object.keys(entriesObj).sort((a, b) => Number(a) - Number(b));
        for (const k of sortedKeys) {
          reconstructedDb[section].push(entriesObj[k]);
        }
      } else {
        reconstructedDb[section] = payload;
      }
    }

    return {
      db: reconstructedDb as Partial<StudyDatabase>,
      updatedAt: latestUpdatedAt,
      sectionCount,
    };
  } catch (err) {
    console.error('[Supabase Sync] Falha ao carregar do Supabase:', err);
    throw err;
  }
}

export async function saveDatabaseToSupabase(
  userId: string,
  db: StudyDatabase,
  contentHash: string,
  timerState?: { elapsed: number; startedAt: number; activeTopic?: unknown },
  _options?: { forceFullWrite?: boolean; forceRefreshToken?: boolean },
) {
  const rawChunks = decomposeDatabaseToFirestoreChunks(db);
  const updatedAt = new Date().toISOString();

  const rowsToUpsert = rawChunks.map((chunk) => ({
    user_id: userId,
    section: chunk.section,
    chunk_index: chunk.chunkIndex,
    chunk_total: chunk.chunkTotal,
    content_hash: chunk.contentHash,
    payload: sanitizeForFirestore(chunk.payload),
    updated_at: updatedAt,
  }));

  rowsToUpsert.push({
    user_id: userId,
    section: '__workspace_meta__',
    chunk_index: 0,
    chunk_total: 1,
    content_hash: contentHash,
    payload: sanitizeForFirestore({
      contentHash,
      schemaVersion: 2,
      sectionCount: rawChunks.length,
      timerState: timerState || {},
    }),
    updated_at: updatedAt,
  });

  const { error } = await supabase
    .from('study_records')
    .upsert(rowsToUpsert, {
      onConflict: 'user_id,section,chunk_index',
    });

  if (error) throw error;

  return {
    updatedAt,
    writtenChunks: rowsToUpsert.length,
    totalChunks: rawChunks.length,
  };
}

// Compatibility Aliases for Firebase-to-Supabase full integration
export const loadDatabaseFromFirestore = loadDatabaseFromSupabase;
export const saveDatabaseToFirestore = saveDatabaseToSupabase;
export const syncTimerStateToFirestore = async (userId: string, timerState: any) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return;
  await supabase.from('study_records').upsert({
    user_id: userId,
    section: '__timer_state__',
    chunk_index: 0,
    chunk_total: 1,
    content_hash: 'timer',
    payload: timerState,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,section,chunk_index' });
};

export const subscribeToFirestoreWorkspace = (
  userId: string,
  onRemoteUpdate: (meta: { contentHash: string; updatedAt: string }) => void,
  onListenerError?: (err: any) => void,
) => {
  const channel = supabase
    .channel('study_records_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'study_records', filter: `user_id=eq.${userId}` },
      () => {
        onRemoteUpdate({ contentHash: 'updated', updatedAt: new Date().toISOString() });
      }
    )
    .subscribe((status, err) => {
      if (err && onListenerError) onListenerError(err);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
};

export interface ParsedFirestoreError {
  category: string;
  code: string;
  userMessage: string;
  technicalMessage: string;
  path: string | null;
  operationType: string;
  timestamp: string;
}

export function parseFirestoreError(err: unknown): ParsedFirestoreError {
  const msg = err instanceof Error ? err.message : String(err || 'Erro Supabase');
  return {
    category: 'unknown',
    code: 'supabase-error',
    userMessage: msg,
    technicalMessage: msg,
    path: null,
    operationType: 'write',
    timestamp: new Date().toISOString(),
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
  _expectedUserId?: string | null,
  _expectedEmail?: string | null,
): Promise<FirestoreAuthHealthReport> {
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  if (!user) {
    return {
      status: 'expired',
      code: 'session-missing',
      message: 'Sessão Supabase expirada.',
      checkedAt: now,
      uid: null,
      email: null,
      emailVerified: null,
      tokenExpiresAt: null,
    };
  }
  return {
    status: 'healthy',
    code: 'ok',
    message: 'Sessão Supabase validada.',
    checkedAt: now,
    uid: user.id,
    email: user.email || null,
    emailVerified: true,
    tokenExpiresAt: null,
  };
}

export function getFirestoreConfigDiagnostics() {
  return {
    projectId: 'supabase-cloud',
    authDomain: 'supabase.co',
    firestoreDatabaseId: 'supabase-db',
    hasApiKey: true,
    hasAppId: true,
    isValid: true,
    issues: [],
  };
}

export const FIREBASE_RECONNECT_BACKOFF_DELAYS_MS = [1000, 2000, 4000];

export async function executeWithFirebaseBackoff<T>(
  _options: { operationName?: string; delaysMs?: readonly number[]; shouldCancel?: () => boolean; onBeforeRetry?: (info: any) => Promise<void> | void },
  task: (attemptIndex: number) => Promise<T>,
): Promise<T> {
  return await task(0);
}

export function clearUserFirestoreCacheState(_userId?: string) {}
