import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StudyDatabase } from '../types/study';
import { decomposeDatabaseToFirestoreChunks, computeFastHash, sanitizeForFirestore, StudyDbRecordChunk } from './firebaseDb';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_0Ig341SAVjV80DmrbqsbLg_sh6FisMt';

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

export interface SupabaseConfigDiagnostics {
  hasUrl: boolean;
  hasAnonKey: boolean;
  isValid: boolean;
  issues: string[];
}

export function getSupabaseConfigDiagnostics(): SupabaseConfigDiagnostics {
  const hasUrl = Boolean(SUPABASE_URL && SUPABASE_URL.trim() && !SUPABASE_URL.includes('placeholder'));
  const hasAnonKey = Boolean(SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.trim() && !SUPABASE_ANON_KEY.includes('placeholder'));
  const issues: string[] = [];
  if (!hasUrl) {
    issues.push('VITE_SUPABASE_URL ausente ou inválida nas variáveis de ambiente.');
  }
  if (!hasAnonKey) {
    issues.push('VITE_SUPABASE_ANON_KEY ausente ou inválida nas variáveis de ambiente.');
  }
  return {
    hasUrl,
    hasAnonKey,
    isValid: issues.length === 0,
    issues,
  };
}

export async function loadDatabaseFromSupabase(userId: string): Promise<{
  db: Partial<StudyDatabase>;
  updatedAt: string;
  sectionCount: number;
} | null> {
  const diag = getSupabaseConfigDiagnostics();
  if (!diag.isValid) {
    console.warn('[Supabase] Configuração pendente:', diag.issues);
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('study_records')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const reconstructedDb: Record<string, any> = {};
    let latestUpdatedAt = new Date().toISOString();

    for (const row of data) {
      const section = row.section;
      const payload = row.payload || {};
      if (row.updated_at && row.updated_at > latestUpdatedAt) {
        latestUpdatedAt = row.updated_at;
      }

      if (payload.kind === 'array') {
        if (!reconstructedDb[section]) {
          reconstructedDb[section] = [];
        }
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
      sectionCount: data.length,
    };
  } catch (err) {
    console.error('[Supabase] Falha ao carregar do Supabase:', err);
    throw err;
  }
}

export async function saveDatabaseToSupabase(
  userId: string,
  db: StudyDatabase,
  contentHash: string,
  timerState?: {
    elapsed: number;
    startedAt: number;
    activeTopic?: unknown;
  },
): Promise<{
  updatedAt: string;
  writtenChunks: number;
  totalChunks: number;
}> {
  const diag = getSupabaseConfigDiagnostics();
  if (!diag.isValid) {
    throw new Error(`Configuração do Supabase incompleta: ${diag.issues.join('; ')}`);
  }

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

  // Also upsert workspace metadata row for timer state and hash
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

  if (error) {
    console.error('[Supabase] Erro ao salvar no Supabase:', error);
    throw error;
  }

  return {
    updatedAt,
    writtenChunks: rowsToUpsert.length,
    totalChunks: rawChunks.length,
  };
}
