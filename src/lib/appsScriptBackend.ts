import type { DriveFileInfo, DriveFolderSummary } from './googleDrive';
import {
  clearGasQueueOnLogout,
  executeGasWriteWithQueue,
  GasAuditLogEntry,
  GasConnectionIntegrityResult,
  GasQueuedOperationType,
  recordLocalGasAuditEntry,
  registerGasQueueBackend,
} from './gasOperationQueue';

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
  lastContentHash?: string | null;
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
  queued?: boolean;
  queueId?: string;
  code?: string;
  error?: string;
  conflictId?: string;
  serverVersion?: number;
  updatedAt?: string;
  contentHash?: string;
  summary?: GasVersionSummary;
  remoteUpdatedAt?: string | null;
  remoteContentHash?: string;
  remoteDevice?: string | null;
  remoteSummary?: GasVersionSummary;
  file?: DriveFileInfo;
}

export interface GasPreWriteCheckResult {
  ok: boolean;
  allowedToWrite: boolean;
  status: 'in-sync' | 'local-ahead' | 'conflict' | 'remote-empty' | 'network-error';
  localChecksum: string;
  expectedBaseChecksum: string | null;
  remoteChecksum: string | null;
  localBaseVersion: number;
  remoteVersion: number | null;
  remoteDevice: string | null;
  remoteUpdatedAt: string | null;
  remoteSummary?: GasVersionSummary;
  controlSheetTable: string;
  checkedAt: string;
  reason: string;
}

export interface GasActiveSyncEvent {
  type: 'pre-write-check' | 'write-blocked' | 'write-committed';
  checkedAt: string;
  localChecksum?: string;
  expectedBaseChecksum?: string | null;
  remoteChecksum?: string | null;
  localBaseVersion?: number;
  remoteVersion?: number | null;
  remoteDevice?: string | null;
  remoteUpdatedAt?: string | null;
  controlSheetTable?: string;
  reason?: string;
  status?: GasPreWriteCheckResult['status'];
}

type ActiveSyncEventListener = (event: GasActiveSyncEvent) => void;
const activeSyncEventListeners = new Set<ActiveSyncEventListener>();

export function subscribeGasActiveSyncEvents(listener: ActiveSyncEventListener): () => void {
  activeSyncEventListeners.add(listener);
  return () => {
    activeSyncEventListeners.delete(listener);
  };
}

function emitGasActiveSyncEvent(event: GasActiveSyncEvent): void {
  activeSyncEventListeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      // ignore listener errors
    }
  });
}

const GAS_INTEGRITY_CACHE_TTL_MS = 8_000;
let lastVerifiedOnlineAtMs = 0;

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
            lastContentHash: typeof parsed.lastContentHash === 'string' ? parsed.lastContentHash : null,
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
  invalidateGasListFilesCache();
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
  const startedAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const shouldAuditAction =
    action !== 'ping' && action !== 'listAuditLogs' && action !== 'uploadFileChunk';

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

    const elapsedMs = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAtMs),
    );

    if (parsed && parsed.code === 'UNAUTHORIZED' && !options?.skipAuth) {
      lastVerifiedOnlineAtMs = 0;
      clearGasSession();
    } else if (parsed && parsed.ok && !options?.skipAuth) {
      lastVerifiedOnlineAtMs = Date.now();
    }

    if (shouldAuditAction) {
      const isOk = Boolean(parsed && parsed.ok);
      recordLocalGasAuditEntry({
        action,
        status: isOk ? 'SUCCESS' : 'FAILURE',
        reason: isOk
          ? typeof parsed?.serverVersion === 'number'
            ? `Concluído com sucesso (versão v${parsed.serverVersion})`
            : 'Operação concluída com sucesso'
          : String(parsed?.error || parsed?.code || `Falha HTTP ${res.status}`),
        details: parsed?.code ? `Código: ${parsed.code}` : undefined,
        deviceId: String(bodyObj.deviceId || ''),
        username: session?.username || '',
        serverVersion: typeof parsed?.serverVersion === 'number' ? parsed.serverVersion : null,
        durationMs: elapsedMs,
      });
    }

    return parsed as T;
  } catch (err: any) {
    lastVerifiedOnlineAtMs = 0;
    const elapsedMs = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAtMs),
    );
    const wrappedErr =
      err?.name === 'AbortError'
        ? new Error(
            `Tempo esgotado (${Math.round(timeoutMs / 1000)}s) ao aguardar o Google Apps Script (${action}). A pasta do Drive pode estar grande ou o script demorou para responder; aguarde alguns segundos e tente novamente.`,
          )
        : err;
    if (shouldAuditAction) {
      recordLocalGasAuditEntry({
        action,
        status: 'FAILURE',
        reason: String(wrappedErr?.message || 'Erro de rede ao comunicar com o Google Apps Script'),
        deviceId: String(bodyObj.deviceId || ''),
        username: session?.username || '',
        durationMs: elapsedMs,
      });
    }
    throw wrappedErr;
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

export interface GasHealthCheckResult {
  ok: boolean;
  status: 'online' | 'offline' | 'session-expired' | 'disconnected';
  latencyMs: number | null;
  checkedAt: string;
  scriptVersion?: string | null;
  serverVersion?: number | null;
  folderName?: string | null;
  error?: string | null;
}

/**
 * Verifica conectividade real com o Google Apps Script e valida a sessão autenticada (se ativa),
 * medindo a latência sem recarregar a página.
 */
export async function gasCheckHealth(customApiUrl?: string): Promise<GasHealthCheckResult> {
  const checkedAt = new Date().toISOString();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      status: 'offline',
      latencyMs: null,
      checkedAt,
      error: 'Sem conexão com a internet neste dispositivo.',
    };
  }

  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ping = await gasPing(customApiUrl);
  const elapsedMs = Math.max(
    1,
    Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt),
  );

  if (!ping.ok) {
    return {
      ok: false,
      status: 'offline',
      latencyMs: elapsedMs,
      checkedAt,
      error: ping.error || 'O servidor Google Apps Script não respondeu.',
    };
  }

  const session = getGasSession();
  if (!session?.token) {
    return {
      ok: false,
      status: 'disconnected',
      latencyMs: elapsedMs,
      checkedAt,
      scriptVersion: ping.version || null,
      serverVersion: typeof ping.serverVersion === 'number' ? ping.serverVersion : null,
      folderName: ping.folderName || null,
      error: 'Servidor online, mas nenhuma sessão está conectada neste navegador.',
    };
  }

  try {
    const versionRes = await gasPost<{
      ok?: boolean;
      code?: string;
      error?: string;
      serverVersion?: number;
      updatedAt?: string | null;
    }>('inspectVersion', {}, { apiUrl: customApiUrl, timeoutMs: 20_000 });

    if (versionRes?.code === 'UNAUTHORIZED') {
      return {
        ok: false,
        status: 'session-expired',
        latencyMs: elapsedMs,
        checkedAt,
        scriptVersion: ping.version || null,
        serverVersion: typeof ping.serverVersion === 'number' ? ping.serverVersion : null,
        folderName: ping.folderName || session.folderName || null,
        error: 'Sessão expirada no servidor. Reconecte com Usuário e Senha sem atualizar a página.',
      };
    }

    if (!versionRes?.ok) {
      return {
        ok: false,
        status: 'offline',
        latencyMs: elapsedMs,
        checkedAt,
        scriptVersion: ping.version || null,
        serverVersion: typeof ping.serverVersion === 'number' ? ping.serverVersion : null,
        folderName: ping.folderName || session.folderName || null,
        error: versionRes?.error || 'Falha ao validar sessão no Google Apps Script.',
      };
    }

    const resolvedServerVersion =
      typeof versionRes.serverVersion === 'number'
        ? versionRes.serverVersion
        : typeof ping.serverVersion === 'number'
          ? ping.serverVersion
          : session.serverVersion;

    // IMPORTANTE: não sobrescrevemos session.serverVersion durante o health check,
    // pois a Sincronização Ativa precisa preservar a versão-base real sincronizada
    // neste dispositivo para detectar atualizações feitas por outros aparelhos.

    return {
      ok: true,
      status: 'online',
      latencyMs: elapsedMs,
      checkedAt,
      scriptVersion: ping.version || null,
      serverVersion: resolvedServerVersion ?? null,
      folderName: ping.folderName || session.folderName || null,
      error: null,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'offline',
      latencyMs: elapsedMs,
      checkedAt,
      scriptVersion: ping.version || null,
      serverVersion: typeof ping.serverVersion === 'number' ? ping.serverVersion : null,
      folderName: ping.folderName || session.folderName || null,
      error: err?.message || 'Erro de rede ao validar sessão com o Google Apps Script.',
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
      lastContentHash: typeof res.contentHash === 'string' && res.contentHash ? res.contentHash : null,
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
  lastVerifiedOnlineAtMs = 0;
  clearGasQueueOnLogout();
  clearGasSession();
}

type GasListFilesResult = {
  files: DriveFileInfo[];
  folders: DriveFolderSummary[];
  folderId: string;
  folderName: string;
  folderUrl: string;
};

const GAS_LIST_FILES_CACHE_TTL_MS = 20_000;
let cachedGasListFiles: { fetchedAt: number; result: GasListFilesResult } | null = null;
let inflightListFilesPromise: Promise<GasListFilesResult> | null = null;
let inflightPullStatePromise: Promise<any> | null = null;
let inflightListBackupsPromise: Promise<DriveFileInfo[]> | null = null;

export function invalidateGasListFilesCache(): void {
  cachedGasListFiles = null;
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
  if (inflightPullStatePromise) {
    return inflightPullStatePromise;
  }
  const task = (async () => {
    const res = await gasPost<any>('pullState', {}, { timeoutMs: 150_000 });
    if (res?.ok) {
      updateGasSessionMetadata({
        ...(typeof res.serverVersion === 'number' ? { serverVersion: res.serverVersion } : {}),
        ...(typeof res.contentHash === 'string' && res.contentHash
          ? { lastContentHash: res.contentHash }
          : {}),
        ...(res.folderId ? { folderId: res.folderId } : {}),
        ...(res.folderName ? { folderName: res.folderName } : {}),
        ...(res.folderUrl ? { folderUrl: res.folderUrl } : {}),
      });
    }
    return res;
  })();
  inflightPullStatePromise = task;
  try {
    return await task;
  } finally {
    if (inflightPullStatePromise === task) {
      inflightPullStatePromise = null;
    }
  }
}

export async function gasInspectRemoteVersion(): Promise<{
  ok: boolean;
  error?: string;
  serverVersion: number;
  updatedAt: string | null;
  contentHash?: string;
  savedByDevice?: string;
  controlSheetTable?: string;
  controlSheetVersion?: number;
  controlSheetHash?: string;
  controlSheetDevice?: string;
  controlSheetUpdatedAt?: string | null;
  fileId?: string | null;
  fileName?: string;
  summary?: GasVersionSummary;
  hasRemoteData?: boolean;
}> {
  return await gasPost('inspectVersion', {}, { timeoutMs: 45_000 });
}

/**
 * Módulo de Sincronização Ativa (Pré-gravação):
 * Consulta a planilha de controle (tb_estado) / estado canônico no Google Apps Script
 * e compara versão + checksum local com o registro mais recente remoto antes de autorizar escrita.
 */
export async function gasVerifyChecksumBeforeWrite(options: {
  localContentHash: string;
  expectedBaseHash?: string | null;
  expectedBaseVersion?: number | null;
  auditOnResult?: boolean;
}): Promise<GasPreWriteCheckResult> {
  const checkedAt = new Date().toISOString();
  const session = getGasSession();
  const localBaseVersion =
    typeof options.expectedBaseVersion === 'number'
      ? options.expectedBaseVersion
      : typeof session?.serverVersion === 'number'
        ? session.serverVersion
        : 0;
  const expectedBaseChecksum =
    (options.expectedBaseHash && options.expectedBaseHash.trim()) ||
    (session?.lastContentHash && session.lastContentHash.trim()) ||
    null;
  const localChecksum = String(options.localContentHash || '').trim();

  try {
    const remote = await gasInspectRemoteVersion();
    if (!remote?.ok) {
      const reason = remote?.error || 'Não foi possível consultar a planilha de controle no Apps Script.';
      return {
        ok: false,
        allowedToWrite: false,
        status: 'network-error',
        localChecksum,
        expectedBaseChecksum,
        remoteChecksum: null,
        localBaseVersion,
        remoteVersion: null,
        remoteDevice: null,
        remoteUpdatedAt: null,
        controlSheetTable: 'tb_estado',
        checkedAt,
        reason,
      };
    }

    const remoteVersion =
      typeof remote.controlSheetVersion === 'number' && remote.controlSheetVersion > 0
        ? Math.max(remote.controlSheetVersion, Number(remote.serverVersion || 0))
        : Number(remote.serverVersion || 0);
    const remoteChecksum =
      String(remote.controlSheetHash || remote.contentHash || '').trim() || null;
    const remoteDevice = String(remote.controlSheetDevice || remote.savedByDevice || '').trim() || null;
    const remoteUpdatedAt = remote.controlSheetUpdatedAt || remote.updatedAt || null;
    const controlSheetTable = remote.controlSheetTable || 'tb_estado';

    if (!remote.hasRemoteData && remoteVersion === 0 && !remoteChecksum) {
      const result: GasPreWriteCheckResult = {
        ok: true,
        allowedToWrite: true,
        status: 'remote-empty',
        localChecksum,
        expectedBaseChecksum,
        remoteChecksum: null,
        localBaseVersion,
        remoteVersion: 0,
        remoteDevice,
        remoteUpdatedAt,
        remoteSummary: remote.summary,
        controlSheetTable,
        checkedAt,
        reason: 'Planilha de controle sem registro prévio — gravação inicial liberada.',
      };
      emitGasActiveSyncEvent({
        type: 'pre-write-check',
        checkedAt,
        localChecksum,
        expectedBaseChecksum,
        remoteChecksum: null,
        localBaseVersion,
        remoteVersion: 0,
        remoteDevice,
        remoteUpdatedAt,
        controlSheetTable,
        status: result.status,
        reason: result.reason,
      });
      return result;
    }

    // Verifica se o cliente possui o registro mais recente da planilha de controle:
    // Bloqueia se a versão remota avançou OU se o checksum remoto diverge do último checksum sincronizado pelo cliente.
    const versionAdvanced =
      remoteVersion > 0 &&
      ((localBaseVersion > 0 && remoteVersion > localBaseVersion) ||
        (localBaseVersion === 0 &&
          Boolean(remoteChecksum) &&
          expectedBaseChecksum !== remoteChecksum &&
          localChecksum !== remoteChecksum));
    const checksumDiverged = Boolean(
      expectedBaseChecksum && remoteChecksum && expectedBaseChecksum !== remoteChecksum,
    );

    if (versionAdvanced || checksumDiverged) {
      const reason = checksumDiverged
        ? `Sobrescrita bloqueada pela Sincronização Ativa: checksum da planilha de controle (${remoteChecksum?.slice(0, 12)}) diverge da base local (${expectedBaseChecksum?.slice(0, 12)}) na v${remoteVersion}.`
        : `Sobrescrita bloqueada pela Sincronização Ativa: a planilha de controle já está na versão v${remoteVersion} (este dispositivo está na v${localBaseVersion}).`;

      if (options.auditOnResult) {
        recordLocalGasAuditEntry({
          action: 'verifyChecksum',
          operationType: 'READ',
          status: 'FAILURE',
          reason,
          details: `Local base: v${localBaseVersion} (${expectedBaseChecksum?.slice(0, 10) || 'sem base'}) · Remoto (${controlSheetTable}): v${remoteVersion} (${remoteChecksum?.slice(0, 10) || '—'})`,
          serverVersion: remoteVersion,
        });
      }

      const result: GasPreWriteCheckResult = {
        ok: true,
        allowedToWrite: false,
        status: 'conflict',
        localChecksum,
        expectedBaseChecksum,
        remoteChecksum,
        localBaseVersion,
        remoteVersion,
        remoteDevice,
        remoteUpdatedAt,
        remoteSummary: remote.summary,
        controlSheetTable,
        checkedAt,
        reason,
      };
      emitGasActiveSyncEvent({
        type: 'write-blocked',
        checkedAt,
        localChecksum,
        expectedBaseChecksum,
        remoteChecksum,
        localBaseVersion,
        remoteVersion,
        remoteDevice,
        remoteUpdatedAt,
        controlSheetTable,
        status: 'conflict',
        reason,
      });
      return result;
    }

    const isExactMatch = Boolean(remoteChecksum && localChecksum && remoteChecksum === localChecksum);
    const status: GasPreWriteCheckResult['status'] = isExactMatch ? 'in-sync' : 'local-ahead';
    const reason = isExactMatch
      ? `Checksum verificado e idêntico à planilha de controle (v${remoteVersion}).`
      : `Cliente atualizado com a versão mais recente da planilha de controle (v${remoteVersion}) — gravação autorizada.`;

    const result: GasPreWriteCheckResult = {
      ok: true,
      allowedToWrite: true,
      status,
      localChecksum,
      expectedBaseChecksum,
      remoteChecksum,
      localBaseVersion,
      remoteVersion,
      remoteDevice,
      remoteUpdatedAt,
      remoteSummary: remote.summary,
      controlSheetTable,
      checkedAt,
      reason,
    };
    emitGasActiveSyncEvent({
      type: 'pre-write-check',
      checkedAt,
      localChecksum,
      expectedBaseChecksum,
      remoteChecksum,
      localBaseVersion,
      remoteVersion,
      remoteDevice,
      remoteUpdatedAt,
      controlSheetTable,
      status,
      reason,
    });
    return result;
  } catch (err: any) {
    return {
      ok: false,
      allowedToWrite: false,
      status: 'network-error',
      localChecksum,
      expectedBaseChecksum,
      remoteChecksum: null,
      localBaseVersion,
      remoteVersion: null,
      remoteDevice: null,
      remoteUpdatedAt: null,
      controlSheetTable: 'tb_estado',
      checkedAt,
      reason: String(err?.message || 'Erro de rede ao verificar checksum remoto.'),
    };
  }
}

async function gasPushStateRaw(payload: Record<string, unknown>): Promise<GasPushStateResult> {
  const session = getGasSession();
  const force = Boolean(payload.force);
  const baseVersion =
    typeof payload.baseVersion === 'number'
      ? payload.baseVersion
      : typeof session?.serverVersion === 'number'
        ? session.serverVersion
        : 0;
  const contentHash = String(payload.contentHash || '').trim();
  const expectedContentHash = String(
    payload.expectedContentHash || session?.lastContentHash || '',
  ).trim();

  // Sincronização Ativa: compara versão + checksum com a planilha de controle ANTES de gravar
  if (!force) {
    const preCheck = await gasVerifyChecksumBeforeWrite({
      localContentHash: contentHash,
      expectedBaseHash: expectedContentHash || null,
      expectedBaseVersion: baseVersion,
      auditOnResult: true,
    });
    if (!preCheck.ok) {
      throw new Error(preCheck.reason);
    }
    if (!preCheck.allowedToWrite) {
      return {
        ok: false,
        code: 'VERSION_CONFLICT',
        error: `DRIVE_CONFLICT_NEWER_REMOTE: ${preCheck.reason}`,
        serverVersion: preCheck.remoteVersion ?? baseVersion,
        remoteUpdatedAt: preCheck.remoteUpdatedAt,
        remoteContentHash: preCheck.remoteChecksum || undefined,
        remoteDevice: preCheck.remoteDevice,
        remoteSummary: preCheck.remoteSummary,
      };
    }
  }

  const res = await gasPost<GasPushStateResult>(
    'pushState',
    {
      payload: payload.payload,
      force,
      baseVersion,
      contentHash,
      expectedContentHash,
    },
    { timeoutMs: 120_000 },
  );

  if (res?.ok && typeof res.serverVersion === 'number') {
    const committedHash = String(res.contentHash || contentHash || '').trim() || null;
    const committedAt = res.updatedAt || new Date().toISOString();
    updateGasSessionMetadata({
      serverVersion: res.serverVersion,
      lastSyncedAt: committedAt,
      ...(committedHash ? { lastContentHash: committedHash } : {}),
    });
    emitGasActiveSyncEvent({
      type: 'write-committed',
      checkedAt: committedAt,
      localChecksum: committedHash || contentHash,
      expectedBaseChecksum: committedHash,
      remoteChecksum: committedHash,
      localBaseVersion: res.serverVersion,
      remoteVersion: res.serverVersion,
      remoteDevice: session?.deviceId || getOrCreateGasDeviceId(),
      remoteUpdatedAt: committedAt,
      controlSheetTable: 'tb_estado',
      status: 'in-sync',
      reason: `Gravação confirmada na planilha de controle (v${res.serverVersion}).`,
    });
  } else if (res?.code === 'VERSION_CONFLICT') {
    emitGasActiveSyncEvent({
      type: 'write-blocked',
      checkedAt: new Date().toISOString(),
      localChecksum: contentHash,
      expectedBaseChecksum: expectedContentHash || null,
      remoteChecksum: res.remoteContentHash || null,
      localBaseVersion: baseVersion,
      remoteVersion: typeof res.serverVersion === 'number' ? res.serverVersion : null,
      remoteDevice: res.remoteDevice || null,
      remoteUpdatedAt: res.remoteUpdatedAt || null,
      controlSheetTable: 'tb_estado',
      status: 'conflict',
      reason: res.error || 'Conflito de versão/checksum rejeitado pelo Google Apps Script.',
    });
  }

  return res;
}

export async function gasPushState(
  payload: unknown,
  options?: {
    force?: boolean;
    baseVersion?: number;
    contentHash?: string;
    expectedContentHash?: string | null;
    bypassQueue?: boolean;
  },
): Promise<GasPushStateResult> {
  const session = getGasSession();
  const baseVersion =
    typeof options?.baseVersion === 'number'
      ? options.baseVersion
      : typeof session?.serverVersion === 'number'
        ? session.serverVersion
        : 0;
  const expectedContentHash = String(
    options?.expectedContentHash || session?.lastContentHash || '',
  ).trim();

  const queuedRes = await executeGasWriteWithQueue<GasPushStateResult>({
    type: 'pushState',
    label: 'Salvamento do banco na nuvem',
    payload: {
      payload,
      force: Boolean(options?.force),
      baseVersion,
      contentHash: options?.contentHash || '',
      expectedContentHash,
    },
    bypassQueue: options?.bypassQueue,
  });

  if (queuedRes.queued) {
    return {
      ok: false,
      queued: true,
      queueId: queuedRes.queueId,
      code: queuedRes.code || 'QUEUED_RETRY',
      error: queuedRes.error || 'Alteração armazenada na fila local para reenvio automático.',
    };
  }

  return (
    queuedRes.data || {
      ok: queuedRes.ok,
      code: queuedRes.code,
      error: queuedRes.error,
    }
  );
}

async function gasCreateBackupRaw(payload: Record<string, unknown>): Promise<{ ok: boolean; file?: DriveFileInfo; error?: string }> {
  const res = await gasPost<{ ok: boolean; file?: DriveFileInfo; error?: string }>(
    'createBackup',
    { payload: payload.payload },
    { timeoutMs: 120_000 },
  );
  if (res.ok) invalidateGasListFilesCache();
  return res;
}

export async function gasCreateBackup(
  payload: unknown,
  options?: { bypassQueue?: boolean },
): Promise<{ ok: boolean; queued?: boolean; queueId?: string; file?: DriveFileInfo; error?: string }> {
  const queuedRes = await executeGasWriteWithQueue<{ ok: boolean; file?: DriveFileInfo; error?: string }>({
    type: 'createBackup',
    label: 'Criação de backup na nuvem',
    payload: { payload },
    bypassQueue: options?.bypassQueue,
  });

  if (queuedRes.queued) {
    return {
      ok: false,
      queued: true,
      queueId: queuedRes.queueId,
      error: queuedRes.error || 'Backup colocado na fila local para envio automático.',
    };
  }

  return (
    queuedRes.data || {
      ok: queuedRes.ok,
      error: queuedRes.error,
    }
  );
}

export async function gasListBackups(): Promise<DriveFileInfo[]> {
  if (inflightListBackupsPromise) {
    return inflightListBackupsPromise;
  }
  const task = (async () => {
    const res = await gasPost<{ ok: boolean; files?: DriveFileInfo[]; error?: string }>(
      'listBackups',
      {},
      { timeoutMs: 120_000 },
    );
    if (!res.ok) throw new Error(res.error || 'Falha ao listar backups no Apps Script.');
    return Array.isArray(res.files) ? res.files : [];
  })();
  inflightListBackupsPromise = task;
  try {
    return await task;
  } finally {
    if (inflightListBackupsPromise === task) {
      inflightListBackupsPromise = null;
    }
  }
}

export async function gasDownloadBackup(fileId: string): Promise<{ payload: any; file?: DriveFileInfo }> {
  const res = await gasPost<{ ok: boolean; payload?: any; file?: DriveFileInfo; error?: string }>(
    'downloadBackup',
    { fileId },
    { timeoutMs: 120_000 },
  );
  if (!res.ok) throw new Error(res.error || 'Falha ao baixar backup do Apps Script.');
  return { payload: res.payload, file: res.file };
}

export async function gasPruneBackups(maxKeep = 15): Promise<number> {
  const res = await gasPost<{ ok: boolean; removed?: number; error?: string }>(
    'pruneBackups',
    { maxKeep },
    { timeoutMs: 60_000 },
  );
  if (!res.ok) throw new Error(res.error || 'Falha ao limpar backups antigos.');
  invalidateGasListFilesCache();
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
    invalidateGasListFilesCache();
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
    { timeoutMs: 120_000 },
  );

  if (!res.ok || !res.file) {
    throw new Error(res.error || `Falha ao enviar "${filename}" via Google Apps Script.`);
  }
  invalidateGasListFilesCache();
  return res.file;
}

export async function gasListFiles(options?: { forceRefresh?: boolean }): Promise<GasListFilesResult> {
  if (
    !options?.forceRefresh &&
    cachedGasListFiles &&
    Date.now() - cachedGasListFiles.fetchedAt < GAS_LIST_FILES_CACHE_TTL_MS
  ) {
    return cachedGasListFiles.result;
  }
  if (inflightListFilesPromise) {
    return inflightListFilesPromise;
  }

  const task = (async (): Promise<GasListFilesResult> => {
    const res = await gasPost<any>('listFiles', {}, { timeoutMs: 240_000 });
    if (!res.ok) throw new Error(res.error || 'Falha ao listar arquivos do Google Drive via Apps Script.');
    const result: GasListFilesResult = {
      files: Array.isArray(res.files) ? res.files : [],
      folders: Array.isArray(res.folders) ? res.folders : [],
      folderId: res.folderId || '',
      folderName: res.folderName || '',
      folderUrl: res.folderUrl || '',
    };
    if (result.folderId) {
      updateGasSessionMetadata({
        folderId: result.folderId,
        ...(result.folderName ? { folderName: result.folderName } : {}),
        ...(result.folderUrl ? { folderUrl: result.folderUrl } : {}),
      });
    }
    cachedGasListFiles = { fetchedAt: Date.now(), result };
    return result;
  })();

  inflightListFilesPromise = task;
  try {
    return await task;
  } finally {
    if (inflightListFilesPromise === task) {
      inflightListFilesPromise = null;
    }
  }
}

export async function gasDownloadFileBlob(fileId: string, fallbackMime = 'application/octet-stream'): Promise<Blob | null> {
  const res = await gasPost<{
    ok: boolean;
    base64Data?: string;
    mimeType?: string;
    error?: string;
  }>('downloadFile', { fileId }, { timeoutMs: 180_000 });
  if (!res.ok || !res.base64Data) return null;
  return base64ToBlob(res.base64Data, res.mimeType || fallbackMime);
}

async function gasDeleteFileRaw(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; code?: string }> {
  const res = await gasPost<{ ok: boolean; error?: string; code?: string }>(
    'deleteFile',
    { fileId: String(payload.fileId || '') },
    { timeoutMs: 45_000 },
  );
  if (res.ok) invalidateGasListFilesCache();
  return res;
}

export async function gasDeleteFile(
  fileId: string,
  options?: { bypassQueue?: boolean },
): Promise<{ ok: boolean; queued?: boolean; queueId?: string; error?: string; code?: string }> {
  const queuedRes = await executeGasWriteWithQueue<{ ok: boolean; error?: string; code?: string }>({
    type: 'deleteFile',
    label: `Exclusão de arquivo (${fileId.slice(0, 8)}…)`,
    payload: { fileId },
    bypassQueue: options?.bypassQueue,
  });
  if (queuedRes.queued) {
    return {
      ok: false,
      queued: true,
      queueId: queuedRes.queueId,
      code: queuedRes.code,
      error: queuedRes.error,
    };
  }
  return queuedRes.data || { ok: queuedRes.ok, code: queuedRes.code, error: queuedRes.error };
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

async function gasSavePostItRaw(payload: Record<string, unknown>): Promise<{
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
      content: String(payload.content ?? ''),
      expectedModifiedTime: String(payload.expectedModifiedTime || ''),
      force: Boolean(payload.force),
    },
    { timeoutMs: 30_000 },
  );
}

export async function gasSavePostIt(
  content: string,
  options?: { expectedModifiedTime?: string | null; force?: boolean; bypassQueue?: boolean },
): Promise<{
  ok: boolean;
  queued?: boolean;
  queueId?: string;
  code?: string;
  error?: string;
  fileId?: string;
  modifiedTime?: string;
  remoteContent?: string;
  remoteModifiedTime?: string;
}> {
  const queuedRes = await executeGasWriteWithQueue<any>({
    type: 'savePostIt',
    label: 'Salvamento do Post-it.txt',
    payload: {
      content,
      expectedModifiedTime: options?.expectedModifiedTime || '',
      force: Boolean(options?.force),
    },
    bypassQueue: options?.bypassQueue,
  });
  if (queuedRes.queued) {
    return {
      ok: false,
      queued: true,
      queueId: queuedRes.queueId,
      code: queuedRes.code,
      error: queuedRes.error,
    };
  }
  return queuedRes.data || { ok: queuedRes.ok, code: queuedRes.code, error: queuedRes.error };
}

async function gasSetStudyFolderRaw(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  error?: string;
}> {
  const res = await gasPost<any>('setStudyFolder', payload, { timeoutMs: 45_000 });
  if (res.ok && res.folderId) {
    invalidateGasListFilesCache();
    updateGasSessionMetadata({
      folderId: res.folderId,
      folderName: res.folderName || 'Central de Estudos - Materiais',
      folderUrl: res.folderUrl || '',
    });
  }
  return res;
}

export async function gasSetStudyFolder(input: {
  folderId?: string;
  folderName?: string;
  bypassQueue?: boolean;
}): Promise<{ ok: boolean; queued?: boolean; queueId?: string; folderId?: string; folderName?: string; folderUrl?: string; error?: string }> {
  const { bypassQueue, ...rest } = input;
  const queuedRes = await executeGasWriteWithQueue<any>({
    type: 'setStudyFolder',
    label: 'Alteração da pasta padrão do Drive',
    payload: rest,
    bypassQueue,
  });
  if (queuedRes.queued) {
    return {
      ok: false,
      queued: true,
      queueId: queuedRes.queueId,
      error: queuedRes.error,
    };
  }
  return queuedRes.data || { ok: queuedRes.ok, error: queuedRes.error };
}

export async function gasListConflicts(): Promise<GasServerConflictRow[]> {
  const res = await gasPost<{ ok: boolean; conflicts?: GasServerConflictRow[] }>('listConflicts', {}, { timeoutMs: 25_000 });
  if (!res.ok || !Array.isArray(res.conflicts)) return [];
  return res.conflicts;
}

async function gasResolveConflictRaw(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; code?: string }> {
  return await gasPost<{ ok: boolean; error?: string; code?: string }>(
    'resolveConflict',
    {
      conflictId: String(payload.conflictId || ''),
      status: String(payload.status || 'resolved-local'),
      resolution: String(payload.resolution || ''),
    },
    { timeoutMs: 20_000 },
  );
}

export async function gasResolveConflict(
  conflictId: string,
  status: 'resolved-local' | 'resolved-drive' | 'dismissed',
  resolution: string,
): Promise<boolean> {
  try {
    const queuedRes = await executeGasWriteWithQueue<{ ok: boolean }>({
      type: 'resolveConflict',
      label: 'Resolução de conflito de versão',
      payload: { conflictId, status, resolution },
    });
    return Boolean(queuedRes.ok || queuedRes.queued);
  } catch {
    return false;
  }
}

export async function gasListAuditLogs(limit = 150): Promise<{
  ok: boolean;
  logs: GasAuditLogEntry[];
  source: 'drive-json' | 'sheet' | 'unavailable';
  updatedAt?: string | null;
  unsupportedByScript?: boolean;
  error?: string;
}> {
  try {
    const res = await gasPost<{
      ok: boolean;
      code?: string;
      error?: string;
      logs?: GasAuditLogEntry[];
      source?: 'drive-json' | 'sheet';
      updatedAt?: string | null;
    }>('listAuditLogs', { limit }, { timeoutMs: 35_000 });

    if (!res.ok) {
      if (res.code === 'UNKNOWN_ACTION') {
        return {
          ok: false,
          logs: [],
          source: 'unavailable',
          unsupportedByScript: true,
          error:
            'Sua implantação atual do Google Apps Script ainda não possui a rota listAuditLogs. Atualize o Code.gs para habilitar o log remoto no Drive.',
        };
      }
      return {
        ok: false,
        logs: [],
        source: 'unavailable',
        error: res.error || 'Falha ao carregar log de auditoria no Google Drive.',
      };
    }

    const normalized: GasAuditLogEntry[] = (Array.isArray(res.logs) ? res.logs : []).map((row: any, idx: number) => ({
      id: String(row.id || `drv_${idx}_${row.timestamp || ''}`),
      timestamp: String(row.timestamp || ''),
      operationType: row.operationType === 'READ' ? 'READ' : 'WRITE',
      action: String(row.action || ''),
      actionLabel: String(row.actionLabel || row.action || 'Operação'),
      status: row.status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
      reason: String(row.reason || (row.status === 'FAILURE' ? 'Falha registrada' : 'Operação concluída')),
      details: row.details ? String(row.details) : undefined,
      deviceId: row.deviceId ? String(row.deviceId) : undefined,
      username: row.username ? String(row.username) : undefined,
      serverVersion: typeof row.serverVersion === 'number' ? row.serverVersion : null,
      durationMs: typeof row.durationMs === 'number' ? row.durationMs : null,
      source: 'drive-script',
    }));

    return {
      ok: true,
      logs: normalized,
      source: res.source || 'drive-json',
      updatedAt: res.updatedAt || null,
    };
  } catch (err: any) {
    return {
      ok: false,
      logs: [],
      source: 'unavailable',
      error: String(err?.message || 'Erro ao buscar log de auditoria do Drive.'),
    };
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

async function verifyGasConnectionIntegrity(options?: {
  forceLive?: boolean;
}): Promise<GasConnectionIntegrityResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    lastVerifiedOnlineAtMs = 0;
    return {
      ok: false,
      code: 'OFFLINE',
      reason: 'Dispositivo sem conexão com a internet.',
    };
  }

  const session = getGasSession();
  if (!session?.token) {
    lastVerifiedOnlineAtMs = 0;
    return {
      ok: false,
      code: 'NO_SESSION',
      reason: 'Sessão do Google Apps Script não está ativa.',
    };
  }

  // Reaproveita verificação recente (< 8s) para não duplicar latência em rajadas de escrita
  if (!options?.forceLive && Date.now() - lastVerifiedOnlineAtMs < GAS_INTEGRITY_CACHE_TTL_MS) {
    return { ok: true };
  }

  const health = await gasCheckHealth();
  if (health.status === 'online') {
    lastVerifiedOnlineAtMs = Date.now();
    return { ok: true };
  }

  lastVerifiedOnlineAtMs = 0;
  if (health.status === 'session-expired') {
    return {
      ok: false,
      code: 'SESSION_EXPIRED',
      reason: health.error || 'Sessão do Google Apps Script expirada.',
    };
  }
  return {
    ok: false,
    code: 'UNREACHABLE',
    reason: health.error || 'Google Apps Script indisponível na verificação de integridade.',
  };
}

// Registra o verificador de integridade e os executores diretos na fila persistente do Apps Script
registerGasQueueBackend({
  checkIntegrity: verifyGasConnectionIntegrity,
  executeRaw: async (type: GasQueuedOperationType, payload: Record<string, unknown>) => {
    switch (type) {
      case 'pushState':
        return await gasPushStateRaw(payload);
      case 'createBackup':
        return await gasCreateBackupRaw(payload);
      case 'savePostIt':
        return await gasSavePostItRaw(payload);
      case 'deleteFile':
        return await gasDeleteFileRaw(payload);
      case 'resolveConflict':
        return await gasResolveConflictRaw(payload);
      case 'setStudyFolder':
        return await gasSetStudyFolderRaw(payload);
      default:
        return { ok: false, code: 'UNKNOWN_QUEUE_OP', error: `Operação desconhecida na fila: ${type}` };
    }
  },
});
