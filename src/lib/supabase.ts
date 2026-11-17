import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_0Ig341SAVjV80DmrbqsbLg_sh6FisMt';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export interface SupabaseUserProfile {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  role?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseStudyRecord {
  id: string;
  user_id: string;
  section: string;
  chunk_index: number;
  chunk_total: number;
  content_hash: string;
  payload: Record<string, unknown>;
  updated_at: string;
}

export interface SupabaseScheduleDayRecord {
  id: string;
  user_id: string;
  weekday: string;
  date_br?: string;
  topics: Array<Record<string, unknown>>;
  updated_at: string;
}

export interface SupabaseSimulationRecord {
  id: string;
  user_id: string;
  titulo: string;
  materia: string;
  data: string;
  score?: number;
  questoes: Array<Record<string, unknown>>;
  created_at: string;
}

export interface SupabaseErrorNotebookRecord {
  id: string;
  user_id: string;
  materia: string;
  tipo: string;
  texto: string;
  corrigido: boolean;
  origem?: string;
  questao?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SupabaseLawFolderRecord {
  id: string;
  user_id: string;
  folder_name: string;
  items: Array<Record<string, unknown>>;
  pdfs: Array<Record<string, unknown>>;
  updated_at: string;
}

export interface SupabaseContestRecord {
  id: string;
  user_id: string;
  concurso: string;
  orgao?: string;
  banca?: string;
  data_prova?: string;
  edital_pontos: Array<Record<string, unknown>>;
  updated_at: string;
}

export interface SupabaseUserPreferencesRecord {
  user_id: string;
  preferences: Record<string, unknown>;
  updated_at: string;
}

export interface SupabaseMigrationLogRecord {
  id: string;
  user_id: string;
  source: string;
  status: 'success' | 'failed' | 'pending';
  records_count: number;
  details?: string;
  created_at: string;
}

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { ok: false, message: `Erro na sessão Auth do Supabase: ${error.message}` };
    }

    const { error: queryError } = await supabase
      .from('study_records')
      .select('id', { count: 'exact', head: true });

    if (queryError && !queryError.message.includes('relation') && !queryError.message.includes('does not exist')) {
      return { ok: false, message: `Erro ao consultar tabela no Supabase: ${queryError.message}` };
    }

    return { ok: true, message: 'Supabase conectado e respondendo com sucesso!' };
  } catch (err: any) {
    return { ok: false, message: `Falha de conexão com o Supabase: ${err?.message || err}` };
  }
}
