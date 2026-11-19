import type { DriveFileInfo, DriveFolderSummary } from './googleDrive';

/**
 * URL oficial da implantação do Google Apps Script (App para a Web).
 * Configurada uma única vez no código para funcionar automaticamente em qualquer computador ou celular.
 */
export const API_URL =
  'https://script.google.com/macros/s/AKfycbwCEUCbBif0IB53aXsmtxVBTG5sXnUpqSSiYkyBAQM-Wn412iqG1zHwjVtVr25mT5KS/exec';

const GAS_SESSION_KEY = 'ce_gas_session_v2';
const GAS_CUSTOM_URL_KEY = 'ce_gas_custom_api_url_v2';
const GAS_DEVICE_ID_KEY = 'ce_gas_device_id_v1';

// Chunks de ~3 MB de string base64 (seguro contra limites de memória e timeout do Apps Script)
const CHUNKED_UPLOAD_THRESHOLD_BYTES = 3_500_000;
const CHUNK_BASE64_CHAR_SIZE = 2_800_000;

export interface GasVersionSummary {
  laws: number;
  scheduleTopics: number;
  questions: number;
  annotations: number;
  pdfs: number;
}

export interface GasSession {
  token: string;
  username: string;
  displayName: string;
  apiUrl: string;
  folderId: string;
  folderName: string;
  folderUrl: string;
  serverVersion: number;
  expiresAt: number;
  deviceId: string;
  lastSyncedAt?: string | null;
}

export interface GasServerConflictRow {
  id: string;
  timestamp: string;
  deviceId: string;
  action: string;
  reason: string;
  localVersion: number;
  serverVersion: number;
  status: string;
  resolution?: string;
  resolvedAt?: string;
}

export interface GasLoginResponse {
  ok: boolean;
  error?: string;
  code?: string;
  version?: string;
  sessionToken?: string;
  expiresAt?: number;
  username?: string;
  displayName?: string;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  serverVersion?: number;
  updatedAt?: string | null;
  contentHash?: string;
  payload?: any;
  summary?: GasVersionSummary;
  postIt?: {
    exists: boolean;
    fileId: string | null;
    content: string;
    modifiedTime: string | null;
  };
  conflicts?: GasServerConflictRow[];
}

export interface GasPushStateResult {
  ok: boolean;
  code?: string;
  error?: string;
  conflictId?: string;
  serverVersion?: number;
  updatedAt?: string;
  contentHash?: string;
  summary?: GasVersionSummary;
  remoteUpdatedAt?: string | null;
  remoteContentHash?: string;
  remoteSummary?: GasVersionSummary;
  file?: DriveFileInfo;
}

type GasSessionListener = (session: GasSession | null) => void;
const sessionListeners = new Set<GasSessionListener>();

let cachedSession: GasSession | null | undefined = undefined;

export function getOrCreateGasDeviceId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = window.localStorage.getItem(GAS_DEVICE_ID_KEY);
      if (existing && existing.trim()) return existing.trim();
      const created = `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      window.localStorage.setItem(GAS_DEVICE_ID_KEY, created);
      return created;
    }
  } catch {
    // ignore storage errors
  }
  return 'web_client';
}

export function getConfiguredGasApiUrl(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const custom = window.localStorage.getItem(GAS_CUSTOM_URL_KEY);
      if (custom && custom.trim().startsWith('https://script.google.com/')) {
        return custom.trim();
      }
    }
  } catch {
    // ignore
  }
  return API_URL;
}

export function setConfiguredGasApiUrl(url: string): string {
  const clean = String(url || '').trim();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (!clean || clean === API_URL) {
        window.localStorage.removeItem(GAS_CUSTOM_URL_KEY);
      } else {
        window.localStorage.setItem(GAS_CUSTOM_URL_KEY, clean);
      }
    }
  } catch {
    // ignore
  }
  const activeUrl = clean || API_URL;
  const current = getGasSession();
  if (current && current.apiUrl !== activeUrl) {
    saveGasSession({ ...current, apiUrl: activeUrl });
  }
  return activeUrl;
}

export function getGasSession(): GasSession | null {
  if (cachedSession !== undefined) {
    if (cachedSession && cachedSession.expiresAt && Date.now() >= cachedSession.expiresAt) {
      clearGasSession();
      return null;
    }
    return cachedSession;
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(GAS_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GasSession>;
        if (
          parsed &&
          typeof parsed.token === 'string' &&
          parsed.token.trim().length > 0 &&
          typeof parsed.username === 'string' &&
          (!parsed.expiresAt || Date.now() < parsed.expiresAt)
        ) {
          cachedSession = {
            token: parsed.token,
            username: parsed.username,
            displayName: parsed.displayName || parsed.username,
            apiUrl: parsed.apiUrl || getConfiguredGasApiUrl(),
            folderId: parsed.folderId || '',
            folderName: parsed.folderName || 'Central de Estudos - Materiais',
            folderUrl: parsed.folderUrl || '',
            serverVersion: typeof parsed.serverVersion === 'number' ? parsed.serverVersion : 0,
            expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : Date.now() + 29 * 86400000,
            deviceId: parsed.deviceId || getOrCreateGasDeviceId(),
            lastSyncedAt: parsed.lastSyncedAt || null,
          };
          return cachedSession;
        }
      }
    }
  } catch {
    // ignore corrupted session
  }

  cachedSession = null;
  return null;
}

export function isGasSessionActive(): boolean {
  return Boolean(getGasSession()?.token);
}

export function saveGasSession(session: GasSession): void {
  cachedSession = session;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GAS_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore storage errors
  }
  notifyGasSessionListeners(session);
}

export function updateGasSessionMetadata(patch: Partial<GasSession>): GasSession | null {
  const cur = getGasSession();
  if (!cur) return null;
  const next: GasSession = { ...cur, ...patch };
  saveGasSession(next);
  return next;
}

export function clearGasSession(): void {
  cachedSession = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(GAS_SESSION_KEY);
    }
  } catch {
    // ignore
  }
  notifyGasSessionListeners(null);
}

function notifyGasSessionListeners(session: GasSession | null): void {
  sessionListeners.forEach((listener) => {
    try {
      listener(session);
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeGasSession(listener: GasSessionListener): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/**
 * Executa chamada POST CORS-safe (text/plain) contra o Web App do Google Apps Script.
 */
async function gasPost<T = any>(
  action: string,
  payload: Record<string, unknown> = {},
  options?: { apiUrl?: string; timeoutMs?: number; skipAuth?: boolean },
): Promise<T> {
  const session = getGasSession();
  const targetUrl = (options?.apiUrl || session?.apiUrl || getConfiguredGasApiUrl()).trim();
  if (!targetUrl) {
    throw new Error('URL do Google Apps Script não configurada.');
  }

  const bodyObj: Record<string, unknown> = {
    action,
    deviceId: session?.deviceId || getOrCreateGasDeviceId(),
    ...payload,
  };
  if (!options?.skipAuth && session?.token && !bodyObj.sessionToken) {
    bodyObj.sessionToken = session.token;
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const looksHtml = text.trim().startsWith('<') || text.toLowerCase().includes('<html');
      if (looksHtml) {
        throw new Error(
          'O Google Apps Script retornou uma página HTML em vez de JSON. Verifique se o código Code.gs foi colado, implantado como "Nova versão" e configurado para "Quem pode acessar: Qualquer pessoa".',
        );
      }
      throw new Error(`Resposta inesperada do Google Apps Script (HTTP ${res.status}).`);
    }

    if (parsed && parsed.code === 'UNAUTHORIZED' && !options?.skipAuth) {
      clearGasSession();
    }

    return parsed as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Tempo esgotado ao aguardar o Google Apps Script. Tente novamente.');
    }
    throw err;
  } finally {
    window.clearTimeout(timerId);
  }
}

export async function gasPing(customApiUrl?: string): Promise<{
  ok: boolean;
  version?: string;
  serverVersion?: number;
  lastUpdatedAt?: string | null;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  error?: string;
}> {
  try {
    return await gasPost('ping', {}, { apiUrl: customApiUrl, skipAuth: true, timeoutMs: 25_000 });
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Falha ao conectar com o Google Apps Script.',
    };
  }
}

export async function gasLogin(
  username: string,
  password: string,
  customApiUrl?: string,
): Promise<GasLoginResponse> {
  const apiUrl = (customApiUrl || getConfiguredGasApiUrl()).trim();
  const res = await gasPost<GasLoginResponse>(
    'login',
    { username: username.trim(), password: password.trim() },
    { apiUrl, skipAuth: true, timeoutMs: 45_000 },
  );

  if (res.ok && res.sessionToken) {
    if (customApiUrl) setConfiguredGasApiUrl(apiUrl);
    saveGasSession({
      token: res.sessionToken,
      username: res.username || username.trim().toLowerCase(),
      displayName: res.displayName || username.trim(),
      apiUrl,
      folderId: res.folderId || '',
      folderName: res.folderName || 'Central de Estudos - Materiais',
      folderUrl: res.folderUrl || '',
      serverVersion: typeof res.serverVersion === 'number' ? res.serverVersion : 0,
      expiresAt: typeof res.expiresAt === 'number' ? res.expiresAt : Date.now() + 29 * 86400000,
      deviceId: getOrCreateGasDeviceId(),
      lastSyncedAt: res.updatedAt || new Date().toISOString(),
    });
  }

  return res;
}

export async function gasLogout(): Promise<void> {
  const session = getGasSession();
  if (session?.token) {
    try {
      await gasPost('logout', {}, { timeoutMs: 12_000 });
    } catch {
      // ignore network error on logout
    }
  }
  clearGasSession();
}

export async function gasPullState(): Promise<{
  ok: boolean;
  error?: string;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  serverVersion: number;
  updatedAt: string | null;
  contentHash?: string;
  fileId?: string | null;
  fileName?: string;
  payload: any;
  summary?: GasVersionSummary;
  postIt?: {
    exists: boolean;
    fileId: string | null;
    content: string;
    modifiedTime: string | null;
  };
}> {
  const res = await gasPost<any>('pullState', {}, { timeoutMs: 55_000 });
  if (res?.ok) {
    updateGasSessionMetadata({
      ...(typeof res.serverVersion === 'number' ? { serverVersion: res.serverVersion } : {}),
      ...(res.folderId ? { folderId: res.folderId } : {}),
      ...(res.folderName ? { folderName: res.folderName } : {}),
      ...(res.folderUrl ? { folderUrl: res.folderUrl } : {}),
    });
  }
  return res;
}

export async function gasInspectRemoteVersion(): Promise<{
  ok: boolean;
  error?: string;
  serverVersion: number;
  updatedAt: string | null;
  contentHash?: string;
  fileId?: string | null;
  fileName?: string;
  summary?: GasVersionSummary;
  hasRemoteData?: boolean;
}> {
  return await gasPost('inspectVersion', {}, { timeoutMs: 30_000 });
}

export async function gasPushState(
  payload: unknown,
  options?: { force?: boolean; baseVersion?: number; contentHash?: string },
): Promise<GasPushStateResult> {
  const session = getGasSession();
  const baseVersion =
    typeof options?.baseVersion === 'number'
      ? options.baseVersion
      : typeof session?.serverVersion === 'number'
        ? session.serverVersion
        : 0;

  const res = await gasPost<GasPushStateResult>(
    'pushState',
    {
      payload,
      force: Boolean(options?.force),
      baseVersion,
      contentHash: options?.contentHash || '',
    },
    { timeoutMs: 75_000 },
  );

  if (res?.ok && typeof res.serverVersion === 'number') {
    updateGasSessionMetadata({
      serverVersion: res.serverVersion,
      lastSyncedAt: res.updatedAt || new Date().toISOString(),
    });
  }

  return res;
}

export async function gasCreateBackup(payload: unknown): Promise<{ ok: boolean; file?: DriveFileInfo; error?: string }> {
  return await gasPost('createBackup', { payload }, { timeoutMs: 75_000 });
}

export async function gasListBackups(): Promise<DriveFileInfo[]> {
  const res = await gasPost<{ ok: boolean; files?: DriveFileInfo[]; error?: string }>('listBackups', {}, { timeoutMs: 35_000 });
  if (!res.ok) throw new Error(res.error || 'Falha ao listar backups no Apps Script.');
  return Array.isArray(res.files) ? res.files : [];
}

export async function gasDownloadBackup(fileId: string): Promise<{ payload: any; file?: DriveFileInfo }> {
  const res = await gasPost<{ ok: boolean; payload?: any; file?: DriveFileInfo; error?: string }>(
    'downloadBackup',
    { fileId },
    { timeoutMs: 55_000 },
  );
  if (!res.ok) throw new Error(res.error || 'Falha ao baixar backup do Apps Script.');
  return { payload: res.payload, file: res.file };
}

export async function gasPruneBackups(maxKeep = 15): Promise<number> {
  const res = await gasPost<{ ok: boolean; removed?: number; error?: string }>(
    'pruneBackups',
    { maxKeep },
    { timeoutMs: 35_000 },
  );
  if (!res.ok) throw new Error(res.error || 'Falha ao limpar backups antigos.');
  return Number(res.removed || 0);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo local para envio.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

export async function gasUploadFile(
  fileOrBlob: File | Blob,
  filename: string,
  subfolderName?: string | string[],
  moduleTag?: string,
): Promise<DriveFileInfo> {
  const subfolder = Array.isArray(subfolderName)
    ? subfolderName.filter(Boolean).join('/')
    : String(subfolderName || '').trim();
  const mimeType =
    fileOrBlob.type ||
    (filename.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : filename.toLowerCase().endsWith('.txt')
        ? 'text/plain'
        : 'application/octet-stream');

  const base64Data = await blobToBase64(fileOrBlob);

  // Arquivos grandes (>3.5MB) são divididos em partes seguras automaticamente
  if (fileOrBlob.size > CHUNKED_UPLOAD_THRESHOLD_BYTES || base64Data.length > CHUNK_BASE64_CHAR_SIZE) {
    const uploadId = `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const totalChunks = Math.ceil(base64Data.length / CHUNK_BASE64_CHAR_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      const slice = base64Data.slice(i * CHUNK_BASE64_CHAR_SIZE, (i + 1) * CHUNK_BASE64_CHAR_SIZE);
      const chunkRes = await gasPost<{ ok: boolean; error?: string }>(
        'uploadFileChunk',
        { uploadId, chunkIndex: i, chunkData: slice },
        { timeoutMs: 75_000 },
      );
      if (!chunkRes.ok) {
        throw new Error(chunkRes.error || `Falha ao enviar parte ${i + 1}/${totalChunks} do arquivo.`);
      }
    }

    const finRes = await gasPost<{ ok: boolean; file?: DriveFileInfo; error?: string }>(
      'finalizeChunkedUpload',
      {
        uploadId,
        totalChunks,
        filename,
        mimeType,
        subfolder,
        moduleTag: moduleTag || subfolder || 'Geral',
      },
      { timeoutMs: 120_000 },
    );
    if (!finRes.ok || !finRes.file) {
      throw new Error(finRes.error || 'Falha ao montar arquivo enviado em partes no Google Drive.');
    }
    return finRes.file;
  }

  const res = await gasPost<{ ok: boolean; file?: DriveFileInfo; error?: string }>(
    'uploadFile',
    {
      filename,
      base64Data,
      mimeType,
      subfolder,
      moduleTag: moduleTag || subfolder || 'Geral',
      replaceExisting: true,
    },
    { timeoutMs: 90_000 },
  );

  if (!res.ok || !res.file) {
    throw new Error(res.error || `Falha ao enviar "${filename}" via Google Apps Script.`);
  }
  return res.file;
}

export async function gasListFiles(): Promise<{
  files: DriveFileInfo[];
  folders: DriveFolderSummary[];
  folderId: string;
  folderName: string;
  folderUrl: string;
}> {
  const res = await gasPost<any>('listFiles', {}, { timeoutMs: 55_000 });
  if (!res.ok) throw new Error(res.error || 'Falha ao listar arquivos do Google Drive via Apps Script.');
  return {
    files: Array.isArray(res.files) ? res.files : [],
    folders: Array.isArray(res.folders) ? res.folders : [],
    folderId: res.folderId || '',
    folderName: res.folderName || '',
    folderUrl: res.folderUrl || '',
  };
}

export async function gasDownloadFileBlob(fileId: string, fallbackMime = 'application/octet-stream'): Promise<Blob | null> {
  const res = await gasPost<{
    ok: boolean;
    base64Data?: string;
    mimeType?: string;
    error?: string;
  }>('downloadFile', { fileId }, { timeoutMs: 90_000 });
  if (!res.ok || !res.base64Data) return null;
  return base64ToBlob(res.base64Data, res.mimeType || fallbackMime);
}

export async function gasDeleteFile(fileId: string): Promise<{ ok: boolean; error?: string; code?: string }> {
  return await gasPost('deleteFile', { fileId }, { timeoutMs: 35_000 });
}

export async function gasReadPostIt(): Promise<{
  exists: boolean;
  fileId: string | null;
  content: string;
  modifiedTime: string | null;
}> {
  const res = await gasPost<any>('readPostIt', {}, { timeoutMs: 25_000 });
  if (!res.ok) throw new Error(res.error || 'Falha ao ler Post-it.txt via Apps Script.');
  return {
    exists: Boolean(res.exists),
    fileId: res.fileId || null,
    content: typeof res.content === 'string' ? res.content : '',
    modifiedTime: res.modifiedTime || null,
  };
}

export async function gasSavePostIt(
  content: string,
  options?: { expectedModifiedTime?: string | null; force?: boolean },
): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
  fileId?: string;
  modifiedTime?: string;
  remoteContent?: string;
  remoteModifiedTime?: string;
}> {
  return await gasPost(
    'savePostIt',
    {
      content,
      expectedModifiedTime: options?.expectedModifiedTime || '',
      force: Boolean(options?.force),
    },
    { timeoutMs: 30_000 },
  );
}

export async function gasSetStudyFolder(input: {
  folderId?: string;
  folderName?: string;
}): Promise<{ ok: boolean; folderId?: string; folderName?: string; folderUrl?: string; error?: string }> {
  const res = await gasPost<any>('setStudyFolder', input, { timeoutMs: 35_000 });
  if (res.ok && res.folderId) {
    updateGasSessionMetadata({
      folderId: res.folderId,
      folderName: res.folderName || 'Central de Estudos - Materiais',
      folderUrl: res.folderUrl || '',
    });
  }
  return res;
}

export async function gasListConflicts(): Promise<GasServerConflictRow[]> {
  const res = await gasPost<{ ok: boolean; conflicts?: GasServerConflictRow[] }>('listConflicts', {}, { timeoutMs: 25_000 });
  if (!res.ok || !Array.isArray(res.conflicts)) return [];
  return res.conflicts;
}

export async function gasResolveConflict(
  conflictId: string,
  status: 'resolved-local' | 'resolved-drive' | 'dismissed',
  resolution: string,
): Promise<boolean> {
  try {
    const res = await gasPost<{ ok: boolean }>('resolveConflict', { conflictId, status, resolution }, { timeoutMs: 20_000 });
    return Boolean(res.ok);
  } catch {
    return false;
  }
}

export async function gasSetupDailyBackupTrigger(): Promise<{ ok: boolean; message?: string; error?: string }> {
  return await gasPost('setupDailyBackupTrigger', {}, { timeoutMs: 25_000 });
}

export async function gasChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  return await gasPost('changePassword', { currentPassword, newPassword }, { timeoutMs: 25_000 });
}
