export type GasAuditOperationType = 'READ' | 'WRITE';
export type GasAuditStatus = 'SUCCESS' | 'FAILURE';

export interface GasAuditLogEntry {
  id: string;
  timestamp: string;
  operationType: GasAuditOperationType;
  action: string;
  actionLabel: string;
  status: GasAuditStatus;
  reason: string;
  details?: string;
  deviceId?: string;
  username?: string;
  serverVersion?: number | null;
  durationMs?: number | null;
  source: 'drive-script' | 'local-client';
  attempts?: number;
}

export type GasQueuedOperationType =
  | 'pushState'
  | 'createBackup'
  | 'savePostIt'
  | 'deleteFile'
  | 'resolveConflict'
  | 'setStudyFolder';

export interface GasQueuedOperation {
  id: string;
  timestamp: string;
  type: GasQueuedOperationType;
  label: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  nextRetryAt: number;
  lastError: string;
  status: 'pending' | 'retrying' | 'waiting-connection' | 'failed-alerted';
  notifiedPersistentFailure: boolean;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}

export interface GasConnectionIntegrityResult {
  ok: boolean;
  reason?: string;
  code?: 'OFFLINE' | 'NO_SESSION' | 'SESSION_EXPIRED' | 'UNREACHABLE';
}

export interface GasWriteExecutionResult<T = any> {
  ok: boolean;
  queued?: boolean;
  queueId?: string;
  code?: string;
  error?: string;
  data?: T;
}

const GAS_QUEUE_STORAGE_KEY = 'ce_gas_operation_queue_v1';
const GAS_LOCAL_AUDIT_STORAGE_KEY = 'ce_gas_local_audit_log_v1';
const MAX_LOCAL_AUDIT_ENTRIES = 200;
const MAX_QUEUE_ITEMS = 60;
const MAX_INLINE_PAYLOAD_CHARS = 1_800_000; // keep LocalStorage safe from QuotaExceededError

// Exponential backoff constants (only used while online for transient server failures): 2s -> 4s -> 8s ... capped at 5 min
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 300_000;
export const GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS = 3;

const ACTION_CATALOG: Record<string, { operationType: GasAuditOperationType; label: string }> = {
  pullState: { operationType: 'READ', label: 'Leitura do estado principal' },
  inspectVersion: { operationType: 'READ', label: 'Verificação de versão/checksum remoto' },
  verifyChecksum: { operationType: 'READ', label: 'Sincronização Ativa (checksum pré-gravação)' },
  listFiles: { operationType: 'READ', label: 'Listagem de arquivos do Drive' },
  listBackups: { operationType: 'READ', label: 'Listagem de backups' },
  downloadFile: { operationType: 'READ', label: 'Download de arquivo do Drive' },
  downloadBackup: { operationType: 'READ', label: 'Download de backup JSON' },
  readPostIt: { operationType: 'READ', label: 'Leitura do Post-it.txt' },
  listConflicts: { operationType: 'READ', label: 'Consulta de histórico de conflitos' },
  pushState: { operationType: 'WRITE', label: 'Salvamento do banco na nuvem' },
  createBackup: { operationType: 'WRITE', label: 'Criação de snapshot de backup' },
  deleteBackup: { operationType: 'WRITE', label: 'Exclusão de backup' },
  pruneBackups: { operationType: 'WRITE', label: 'Limpeza de backups antigos' },
  uploadFile: { operationType: 'WRITE', label: 'Envio de arquivo ao Drive' },
  finalizeChunkedUpload: { operationType: 'WRITE', label: 'Envio de arquivo grande (em partes)' },
  deleteFile: { operationType: 'WRITE', label: 'Exclusão de arquivo no Drive' },
  savePostIt: { operationType: 'WRITE', label: 'Salvamento do Post-it.txt' },
  setStudyFolder: { operationType: 'WRITE', label: 'Alteração da pasta padrão do Drive' },
  resolveConflict: { operationType: 'WRITE', label: 'Resolução de conflito de versão' },
  setupDailyBackupTrigger: { operationType: 'WRITE', label: 'Ativação de backup diário' },
  login: { operationType: 'READ', label: 'Autenticação de sessão' },
  logout: { operationType: 'WRITE', label: 'Encerramento de sessão' },
  changePassword: { operationType: 'WRITE', label: 'Alteração de senha' },
};

export function classifyGasAction(action: string): { operationType: GasAuditOperationType; label: string } {
  const clean = String(action || '').trim();
  if (ACTION_CATALOG[clean]) return ACTION_CATALOG[clean];
  const lower = clean.toLowerCase();
  if (
    lower.startsWith('get') ||
    lower.startsWith('list') ||
    lower.startsWith('read') ||
    lower.startsWith('pull') ||
    lower.startsWith('download') ||
    lower.startsWith('inspect') ||
    lower.startsWith('verify')
  ) {
    return { operationType: 'READ', label: clean || 'Leitura no Drive' };
  }
  return { operationType: 'WRITE', label: clean || 'Escrita no Drive' };
}

function makeUid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// LOCAL STRUCTURED AUDIT LOG MIRROR (captures offline/client errors too)
// ============================================================================

type AuditLogListener = (logs: GasAuditLogEntry[]) => void;
const auditListeners = new Set<AuditLogListener>();

export function getLocalGasAuditLogs(): GasAuditLogEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(GAS_LOCAL_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.timestamp === 'string' && typeof item.action === 'string');
  } catch {
    return [];
  }
}

function persistLocalGasAuditLogs(logs: GasAuditLogEntry[]): void {
  const trimmed = logs.slice(0, MAX_LOCAL_AUDIT_ENTRIES);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GAS_LOCAL_AUDIT_STORAGE_KEY, JSON.stringify(trimmed));
    }
  } catch {
    // ignore storage quota errors on audit mirror
  }
  auditListeners.forEach((fn) => {
    try {
      fn(trimmed);
    } catch {
      // ignore listener errors
    }
  });
}

export function recordLocalGasAuditEntry(input: {
  action: string;
  status: GasAuditStatus;
  reason?: string;
  details?: string;
  deviceId?: string;
  username?: string;
  serverVersion?: number | null;
  durationMs?: number | null;
  attempts?: number;
  operationType?: GasAuditOperationType;
}): GasAuditLogEntry {
  const meta = classifyGasAction(input.action);
  const entry: GasAuditLogEntry = {
    id: makeUid('aud'),
    timestamp: new Date().toISOString(),
    operationType: input.operationType || meta.operationType,
    action: input.action,
    actionLabel: meta.label,
    status: input.status,
    reason: String(input.reason || (input.status === 'SUCCESS' ? 'Operação concluída com sucesso' : 'Falha na operação')),
    details: input.details ? String(input.details).slice(0, 400) : undefined,
    deviceId: input.deviceId,
    username: input.username,
    serverVersion: typeof input.serverVersion === 'number' ? input.serverVersion : null,
    durationMs: typeof input.durationMs === 'number' ? Math.round(input.durationMs) : null,
    source: 'local-client',
    attempts: input.attempts,
  };
  const current = getLocalGasAuditLogs();
  persistLocalGasAuditLogs([entry, ...current]);
  return entry;
}

export function clearLocalGasAuditLogs(): void {
  persistLocalGasAuditLogs([]);
}

export function subscribeLocalGasAuditLogs(listener: AuditLogListener): () => void {
  auditListeners.add(listener);
  return () => {
    auditListeners.delete(listener);
  };
}

// ============================================================================
// PERSISTENT OPERATIONS QUEUE (LOCALSTORAGE + RETRY AO RESTABELECER CONEXÃO)
// ============================================================================

type QueueListener = (items: GasQueuedOperation[], processing: boolean) => void;
const queueListeners = new Set<QueueListener>();

let cachedQueue: GasQueuedOperation[] | null = null;
let isProcessingQueue = false;
let backoffTimerId: number | null = null;
let connectivityListenersBound = false;
let connectionKnownOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

interface RegisteredQueueHandlers {
  checkIntegrity?: (options?: { forceLive?: boolean }) => Promise<GasConnectionIntegrityResult>;
  executeRaw?: (type: GasQueuedOperationType, payload: Record<string, unknown>) => Promise<any>;
  getLatestSyncPayload?: () => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
  onPersistentFailure?: (item: GasQueuedOperation) => void;
  onOperationSucceeded?: (item: GasQueuedOperation, result: any) => void;
  onVersionConflict?: (item: GasQueuedOperation, result: any) => void;
}

const handlers: RegisteredQueueHandlers = {};

export function isGasQueueConnectionOnline(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  return connectionKnownOnline;
}

function clearScheduledRetryTimer(): void {
  if (backoffTimerId !== null && typeof window !== 'undefined') {
    window.clearTimeout(backoffTimerId);
    backoffTimerId = null;
  }
}

/**
 * Atualiza o estado de conectividade conhecido pela fila.
 * Quando offline, pausa todos os timers automáticos e marca itens como 'waiting-connection',
 * evitando tentativas inúteis durante oscilações ou quedas de rede.
 */
export function setGasQueueConnectionOnline(online: boolean): void {
  const prevOnline = connectionKnownOnline;
  connectionKnownOnline = Boolean(online);

  if (!connectionKnownOnline) {
    clearScheduledRetryTimer();
    const current = loadGasOperationQueue();
    if (current.length > 0) {
      let changed = false;
      const updated = current.map((item) => {
        if (item.status !== 'waiting-connection' && item.status !== 'failed-alerted') {
          changed = true;
          return { ...item, status: 'waiting-connection' as const };
        }
        return item;
      });
      if (changed) {
        persistGasOperationQueue(updated);
      } else {
        notifyQueueListeners();
      }
    }
    return;
  }

  if (!prevOnline && connectionKnownOnline) {
    notifyGasConnectionRestored();
  }
}

/**
 * Chamado automaticamente quando o navegador dispara o evento 'online'
 * ou quando o monitor do Google Apps Script confirma o restabelecimento da conexão.
 * Reenvia imediatamente a fila pendente em ordem cronológica (timestamp crescente).
 */
export function notifyGasConnectionRestored(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    connectionKnownOnline = false;
    return;
  }
  connectionKnownOnline = true;
  clearScheduledRetryTimer();
  const pending = loadGasOperationQueue();
  if (pending.length === 0) return;

  const normalized = pending.map((item) =>
    item.status === 'waiting-connection'
      ? { ...item, status: 'retrying' as const, nextRetryAt: Date.now() }
      : { ...item, nextRetryAt: Math.min(item.nextRetryAt || Date.now(), Date.now()) },
  );
  persistGasOperationQueue(normalized);
  void processGasOperationQueue({ forceAll: true });
}

export function registerGasQueueBackend(config: {
  checkIntegrity: (options?: { forceLive?: boolean }) => Promise<GasConnectionIntegrityResult>;
  executeRaw: (type: GasQueuedOperationType, payload: Record<string, unknown>) => Promise<any>;
}): void {
  handlers.checkIntegrity = config.checkIntegrity;
  handlers.executeRaw = config.executeRaw;
  bindConnectivityListeners();
  scheduleNextQueueDrain();
}

export function configureGasOperationQueueCallbacks(config: {
  getLatestSyncPayload?: () => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
  onPersistentFailure?: (item: GasQueuedOperation) => void;
  onOperationSucceeded?: (item: GasQueuedOperation, result: any) => void;
  onVersionConflict?: (item: GasQueuedOperation, result: any) => void;
}): void {
  if (config.getLatestSyncPayload !== undefined) handlers.getLatestSyncPayload = config.getLatestSyncPayload;
  if (config.onPersistentFailure !== undefined) handlers.onPersistentFailure = config.onPersistentFailure;
  if (config.onOperationSucceeded !== undefined) handlers.onOperationSucceeded = config.onOperationSucceeded;
  if (config.onVersionConflict !== undefined) handlers.onVersionConflict = config.onVersionConflict;
  bindConnectivityListeners();
  scheduleNextQueueDrain();
}

function bindConnectivityListeners(): void {
  if (connectivityListenersBound || typeof window === 'undefined') return;
  connectivityListenersBound = true;
  window.addEventListener('online', () => {
    notifyGasConnectionRestored();
  });
  window.addEventListener('offline', () => {
    setGasQueueConnectionOnline(false);
  });
}

export function computeExponentialBackoffMs(attempts: number): number {
  const exp = Math.max(0, Math.min(attempts - 1, 8));
  const raw = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, exp));
  const jitter = Math.floor(Math.random() * 450);
  return raw + jitter;
}

export function loadGasOperationQueue(): GasQueuedOperation[] {
  if (cachedQueue !== null) return cachedQueue;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      cachedQueue = [];
      return cachedQueue;
    }
    const raw = window.localStorage.getItem(GAS_QUEUE_STORAGE_KEY);
    if (!raw) {
      cachedQueue = [];
      return cachedQueue;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedQueue = [];
      return cachedQueue;
    }
    cachedQueue = parsed
      .filter(
        (item): item is GasQueuedOperation =>
          Boolean(item && typeof item.id === 'string' && typeof item.type === 'string'),
      )
      .map((item) => {
        const ts = typeof item.timestamp === 'string' && item.timestamp
          ? item.timestamp
          : item.createdAt || new Date().toISOString();
        return {
          ...item,
          timestamp: ts,
          createdAt: item.createdAt || ts,
        };
      });
    return cachedQueue;
  } catch {
    cachedQueue = [];
    return cachedQueue;
  }
}

function notifyQueueListeners(): void {
  const snapshot = [...loadGasOperationQueue()];
  queueListeners.forEach((listener) => {
    try {
      listener(snapshot, isProcessingQueue);
    } catch {
      // ignore listener errors
    }
  });
}

function sanitizePayloadForStorage(
  type: GasQueuedOperationType,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (type === 'pushState' || type === 'createBackup') {
    try {
      const serialized = JSON.stringify(payload);
      if (serialized.length > MAX_INLINE_PAYLOAD_CHARS) {
        return {
          ...payload,
          payload: undefined,
          useLatestLocalDb: true,
        };
      }
    } catch {
      return {
        force: Boolean(payload.force),
        baseVersion: payload.baseVersion,
        contentHash: payload.contentHash,
        expectedContentHash: payload.expectedContentHash,
        useLatestLocalDb: true,
      };
    }
  }
  return payload;
}

function persistGasOperationQueue(items: GasQueuedOperation[]): void {
  const trimmed = items.slice(-MAX_QUEUE_ITEMS);
  cachedQueue = trimmed;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(GAS_QUEUE_STORAGE_KEY, JSON.stringify(trimmed));
    }
  } catch {
    // If LocalStorage quota is tight, compact pushState/createBackup payloads to reference latest local DB
    const compacted = trimmed.map((item) =>
      item.type === 'pushState' || item.type === 'createBackup'
        ? {
            ...item,
            payload: {
              force: Boolean(item.payload?.force),
              baseVersion: item.payload?.baseVersion,
              contentHash: item.payload?.contentHash,
              expectedContentHash: item.payload?.expectedContentHash,
              useLatestLocalDb: true,
            },
          }
        : item,
    );
    cachedQueue = compacted;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(GAS_QUEUE_STORAGE_KEY, JSON.stringify(compacted));
      }
    } catch {
      // keep in-memory queue active
    }
  }
  notifyQueueListeners();
  scheduleNextQueueDrain();
}

export function subscribeGasOperationQueue(listener: QueueListener): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

export function isGasQueueProcessing(): boolean {
  return isProcessingQueue;
}

function scheduleNextQueueDrain(): void {
  if (typeof window === 'undefined') return;
  clearScheduledRetryTimer();

  const items = loadGasOperationQueue();
  if (items.length === 0) return;

  // Retry automático NUNCA dispara enquanto a conexão estiver offline: aguarda restabelecimento!
  if (!isGasQueueConnectionOnline()) {
    return;
  }

  const retryableItems = items.filter((it) => it.status !== 'waiting-connection');
  if (retryableItems.length === 0) return;

  const now = Date.now();
  const earliestRetryAt = retryableItems.reduce(
    (min, item) => Math.min(min, Number(item.nextRetryAt || now)),
    Number.POSITIVE_INFINITY,
  );
  const delayMs = Math.max(500, Math.min(MAX_BACKOFF_MS, earliestRetryAt - now));
  backoffTimerId = window.setTimeout(() => {
    backoffTimerId = null;
    if (!isGasQueueConnectionOnline()) return;
    void processGasOperationQueue();
  }, delayMs);
}

function defaultDedupeKey(type: GasQueuedOperationType, payload: Record<string, unknown>): string | undefined {
  if (type === 'pushState') return 'singleton:pushState';
  if (type === 'savePostIt') return 'singleton:savePostIt';
  if (type === 'setStudyFolder') return 'singleton:setStudyFolder';
  if (type === 'deleteFile' && payload.fileId) return `deleteFile:${String(payload.fileId)}`;
  if (type === 'resolveConflict' && payload.conflictId) return `resolveConflict:${String(payload.conflictId)}`;
  return undefined;
}

export function enqueueGasOperation(input: {
  type: GasQueuedOperationType;
  label?: string;
  payload: Record<string, unknown>;
  lastError: string;
  initialAttempts?: number;
  waitingForConnection?: boolean;
}): GasQueuedOperation {
  const nowIso = new Date().toISOString();
  const dedupeKey = defaultDedupeKey(input.type, input.payload);
  const safePayload = sanitizePayloadForStorage(input.type, input.payload);
  const current = [...loadGasOperationQueue()];

  const existingIdx = dedupeKey ? current.findIndex((it) => it.dedupeKey === dedupeKey) : -1;
  const attempts = Math.max(1, input.initialAttempts ?? 1);
  const waitingConn = Boolean(input.waitingForConnection) || !isGasQueueConnectionOnline();

  if (existingIdx >= 0) {
    const prev = current[existingIdx];
    const nextAttempts = Math.max(prev.attempts + 1, attempts);
    const delayMs = computeExponentialBackoffMs(nextAttempts);
    const shouldAlert = nextAttempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS && !prev.notifiedPersistentFailure;
    const nextStatus: GasQueuedOperation['status'] = shouldAlert
      ? 'failed-alerted'
      : waitingConn
        ? 'waiting-connection'
        : nextAttempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS
          ? 'failed-alerted'
          : 'retrying';

    const updated: GasQueuedOperation = {
      ...prev,
      timestamp: prev.timestamp || prev.createdAt || nowIso,
      label: input.label || prev.label,
      updatedAt: nowIso,
      attempts: nextAttempts,
      nextRetryAt: waitingConn ? 0 : Date.now() + delayMs,
      lastError: input.lastError,
      status: nextStatus,
      notifiedPersistentFailure: prev.notifiedPersistentFailure || shouldAlert,
      payload: safePayload,
    };
    current[existingIdx] = updated;
    persistGasOperationQueue(current);
    if (shouldAlert) {
      handlers.onPersistentFailure?.(updated);
    }
    return updated;
  }

  const delayMs = computeExponentialBackoffMs(attempts);
  const shouldAlert = attempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS;
  const item: GasQueuedOperation = {
    id: makeUid('gasq'),
    timestamp: nowIso,
    type: input.type,
    label: input.label || classifyGasAction(input.type).label,
    createdAt: nowIso,
    updatedAt: nowIso,
    attempts,
    nextRetryAt: waitingConn ? 0 : Date.now() + delayMs,
    lastError: input.lastError,
    status: shouldAlert ? 'failed-alerted' : waitingConn ? 'waiting-connection' : 'pending',
    notifiedPersistentFailure: shouldAlert,
    payload: safePayload,
    dedupeKey,
  };
  current.push(item);
  persistGasOperationQueue(current);
  if (shouldAlert) {
    handlers.onPersistentFailure?.(item);
  }
  return item;
}

export function removeGasQueueItem(id: string): void {
  const next = loadGasOperationQueue().filter((item) => item.id !== id);
  persistGasOperationQueue(next);
}

export function clearFailedGasQueueItems(): number {
  const current = loadGasOperationQueue();
  const remaining = current.filter((item) => item.attempts <= GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS);
  const removed = current.length - remaining.length;
  if (removed > 0) {
    persistGasOperationQueue(remaining);
  }
  return removed;
}

export function clearGasQueueOnLogout(): void {
  if (backoffTimerId !== null && typeof window !== 'undefined') {
    window.clearTimeout(backoffTimerId);
    backoffTimerId = null;
  }
  cachedQueue = [];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(GAS_QUEUE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  notifyQueueListeners();
}

function isNonRetryableBusinessCode(code?: string): boolean {
  const clean = String(code || '').trim().toUpperCase();
  return (
    clean === 'VERSION_CONFLICT' ||
    clean === 'POSTIT_CONFLICT' ||
    clean === 'OUTSIDE_STUDY_FOLDER' ||
    clean === 'MISSING_PAYLOAD' ||
    clean === 'INVALID_JSON' ||
    clean === 'UNAUTHORIZED'
  );
}

/**
 * Executa uma operação de escrita no Google Apps Script verificando antes a integridade da conexão.
 * Se a conexão estiver indisponível ou ocorrer erro de rede, armazena a operação no LocalStorage
 * com ID único e timestamp ISO, pausando novas tentativas até que a conexão seja restabelecida.
 */
export async function executeGasWriteWithQueue<T = any>(input: {
  type: GasQueuedOperationType;
  label?: string;
  payload: Record<string, unknown>;
  bypassQueue?: boolean;
}): Promise<GasWriteExecutionResult<T>> {
  if (!handlers.executeRaw) {
    throw new Error('Executor do Google Apps Script não inicializado.');
  }

  if (input.bypassQueue) {
    const rawRes = await handlers.executeRaw(input.type, input.payload);
    return {
      ok: Boolean(rawRes?.ok),
      code: rawRes?.code,
      error: rawRes?.error,
      data: rawRes as T,
    };
  }

  // 1. Verifica integridade da conexão ANTES de enviar qualquer alteração
  if (handlers.checkIntegrity) {
    const integrity = await handlers.checkIntegrity({ forceLive: false });
    if (!integrity.ok) {
      const isNetworkDown = integrity.code === 'OFFLINE' || integrity.code === 'UNREACHABLE';
      if (isNetworkDown) {
        connectionKnownOnline = false;
        clearScheduledRetryTimer();
      }
      const reason =
        integrity.reason || 'Falha na verificação de integridade da conexão com o Google Apps Script.';
      const queuedItem = enqueueGasOperation({
        type: input.type,
        label: input.label,
        payload: input.payload,
        lastError: reason,
        initialAttempts: 1,
        waitingForConnection: isNetworkDown,
      });
      recordLocalGasAuditEntry({
        action: input.type,
        operationType: 'WRITE',
        status: 'FAILURE',
        reason: isNetworkDown
          ? `Salvo na fila local [${queuedItem.id}] — aguardando restabelecimento da conexão: ${reason}`
          : `Enfileirado localmente [${queuedItem.id}] (tentativa ${queuedItem.attempts}): ${reason}`,
        attempts: queuedItem.attempts,
      });
      return {
        ok: false,
        queued: true,
        queueId: queuedItem.id,
        code: isNetworkDown ? 'QUEUED_WAITING_CONNECTION' : 'QUEUED_CONNECTION_CHECK',
        error: reason,
      };
    }
  }

  // 2. Executa escrita real contra o Apps Script
  try {
    const rawRes = await handlers.executeRaw(input.type, input.payload);
    if (rawRes?.ok) {
      connectionKnownOnline = true;
      // Remove eventual operação duplicada da fila (ex.: pushState mais antigo)
      const dedupe = defaultDedupeKey(input.type, input.payload);
      if (dedupe) {
        const current = loadGasOperationQueue();
        if (current.some((it) => it.dedupeKey === dedupe)) {
          persistGasOperationQueue(current.filter((it) => it.dedupeKey !== dedupe));
        }
      }
      return {
        ok: true,
        data: rawRes as T,
      };
    }

    // Erros de negócio (ex.: conflito de versão/checksum, sessão revogada, arquivo fora da pasta) nunca são reenfileirados
    if (isNonRetryableBusinessCode(rawRes?.code)) {
      return {
        ok: false,
        queued: false,
        code: rawRes?.code,
        error: rawRes?.error,
        data: rawRes as T,
      };
    }

    const reason = String(rawRes?.error || 'Falha transitória ao gravar no Google Apps Script.');
    const queuedItem = enqueueGasOperation({
      type: input.type,
      label: input.label,
      payload: input.payload,
      lastError: reason,
      initialAttempts: 1,
      waitingForConnection: !isGasQueueConnectionOnline(),
    });
    return {
      ok: false,
      queued: true,
      queueId: queuedItem.id,
      code: 'QUEUED_RETRY',
      error: reason,
      data: rawRes as T,
    };
  } catch (err: any) {
    const reason = String(err?.message || 'Erro de rede ou tempo esgotado ao enviar alteração.');
    const looksNetworkFailure =
      (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      /failed to fetch|network|offline|internet|tempo esgotado|abort/i.test(reason);
    if (looksNetworkFailure) {
      connectionKnownOnline = false;
      clearScheduledRetryTimer();
    }
    const queuedItem = enqueueGasOperation({
      type: input.type,
      label: input.label,
      payload: input.payload,
      lastError: reason,
      initialAttempts: 1,
      waitingForConnection: looksNetworkFailure,
    });
    return {
      ok: false,
      queued: true,
      queueId: queuedItem.id,
      code: looksNetworkFailure ? 'QUEUED_WAITING_CONNECTION' : 'QUEUED_RETRY',
      error: reason,
    };
  }
}

/**
 * Processa a fila persistente de operações no LocalStorage em ordem cronológica (timestamp crescente).
 * Reenvios automáticos só ocorrem quando a conexão está ativa/restabelecida.
 */
export async function processGasOperationQueue(options?: {
  forceAll?: boolean;
  onlyItemId?: string;
}): Promise<{ processed: number; succeeded: number; failed: number; remaining: number }> {
  if (isProcessingQueue || !handlers.executeRaw) {
    return { processed: 0, succeeded: 0, failed: 0, remaining: loadGasOperationQueue().length };
  }

  const initialItems = [...loadGasOperationQueue()];
  if (initialItems.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, remaining: 0 };
  }

  // Sem conexão ativa: não tenta reenviar em loop; aguarda restabelecimento da rede
  if (!options?.forceAll && !options?.onlyItemId && !isGasQueueConnectionOnline()) {
    return { processed: 0, succeeded: 0, failed: 0, remaining: initialItems.length };
  }

  const now = Date.now();
  const dueItems = initialItems
    .filter((item) => {
      if (options?.onlyItemId) return item.id === options.onlyItemId;
      if (options?.forceAll) return true;
      if (item.status === 'waiting-connection') return false;
      return Number(item.nextRetryAt || 0) <= now;
    })
    .sort((a, b) => {
      const ta = Date.parse(a.timestamp || a.createdAt) || 0;
      const tb = Date.parse(b.timestamp || b.createdAt) || 0;
      return ta - tb;
    });

  if (dueItems.length === 0) {
    scheduleNextQueueDrain();
    return { processed: 0, succeeded: 0, failed: 0, remaining: initialItems.length };
  }

  isProcessingQueue = true;
  notifyQueueListeners();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    // Verifica integridade da conexão ao vivo antes de drenar a fila
    if (handlers.checkIntegrity) {
      const integrity = await handlers.checkIntegrity({ forceLive: true });
      if (!integrity.ok) {
        const isNetworkDown = integrity.code === 'OFFLINE' || integrity.code === 'UNREACHABLE';
        if (isNetworkDown) {
          connectionKnownOnline = false;
          clearScheduledRetryTimer();
        }
        const reason =
          integrity.reason || 'Conexão com Google Apps Script indisponível durante reenvio da fila.';
        const updatedQueue = loadGasOperationQueue().map((item) => {
          const isTarget = dueItems.some((d) => d.id === item.id);
          if (!isTarget) return item;
          const nextAttempts = item.attempts + 1;
          const delayMs = computeExponentialBackoffMs(nextAttempts);
          const shouldAlert =
            nextAttempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS && !item.notifiedPersistentFailure;
          const nextItem: GasQueuedOperation = {
            ...item,
            attempts: nextAttempts,
            updatedAt: new Date().toISOString(),
            nextRetryAt: isNetworkDown ? 0 : Date.now() + delayMs,
            lastError: reason,
            status:
              nextAttempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS
                ? 'failed-alerted'
                : isNetworkDown
                  ? 'waiting-connection'
                  : 'retrying',
            notifiedPersistentFailure: item.notifiedPersistentFailure || shouldAlert,
          };
          recordLocalGasAuditEntry({
            action: item.type,
            operationType: 'WRITE',
            status: 'FAILURE',
            reason: isNetworkDown
              ? `Aguardando reconexão [${item.id}] (tentativa #${nextAttempts}): ${reason}`
              : `Reenvio #${nextAttempts} adiado (${Math.round(delayMs / 1000)}s): ${reason}`,
            attempts: nextAttempts,
          });
          if (shouldAlert) {
            handlers.onPersistentFailure?.(nextItem);
          }
          failed += 1;
          processed += 1;
          return nextItem;
        });
        persistGasOperationQueue(updatedQueue);
        return { processed, succeeded, failed, remaining: updatedQueue.length };
      }
      connectionKnownOnline = true;
    }

    for (const target of dueItems) {
      const currentSnapshot = loadGasOperationQueue();
      const liveItem = currentSnapshot.find((it) => it.id === target.id);
      if (!liveItem) continue;

      processed += 1;
      let effectivePayload: Record<string, unknown> = { ...(liveItem.payload || {}) };

      if (
        (liveItem.type === 'pushState' || liveItem.type === 'createBackup') &&
        (effectivePayload.useLatestLocalDb || !effectivePayload.payload)
      ) {
        const fresh = await handlers.getLatestSyncPayload?.();
        if (fresh) {
          effectivePayload = {
            ...effectivePayload,
            payload: fresh,
            contentHash: (fresh as any).contentHash || effectivePayload.contentHash || '',
          };
        }
      }

      try {
        const res = await handlers.executeRaw(liveItem.type, effectivePayload);

        if (res?.ok) {
          succeeded += 1;
          const remaining = loadGasOperationQueue().filter((it) => it.id !== liveItem.id);
          persistGasOperationQueue(remaining);
          handlers.onOperationSucceeded?.(liveItem, res);
          continue;
        }

        if (res?.code === 'VERSION_CONFLICT') {
          failed += 1;
          const remaining = loadGasOperationQueue().filter((it) => it.id !== liveItem.id);
          persistGasOperationQueue(remaining);
          handlers.onVersionConflict?.(liveItem, res);
          continue;
        }

        if (isNonRetryableBusinessCode(res?.code)) {
          failed += 1;
          const remaining = loadGasOperationQueue().filter((it) => it.id !== liveItem.id);
          persistGasOperationQueue(remaining);
          continue;
        }

        throw new Error(res?.error || 'Falha transitória durante reenvio automático.');
      } catch (err: any) {
        failed += 1;
        const reason = String(err?.message || 'Erro ao reenviar operação pendente.');
        const looksNetworkFailure =
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          /failed to fetch|network|offline|internet|tempo esgotado|abort/i.test(reason);
        if (looksNetworkFailure) {
          connectionKnownOnline = false;
          clearScheduledRetryTimer();
        }
        const nextAttempts = liveItem.attempts + 1;
        const delayMs = computeExponentialBackoffMs(nextAttempts);
        const shouldAlert =
          nextAttempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS && !liveItem.notifiedPersistentFailure;

        const updatedItem: GasQueuedOperation = {
          ...liveItem,
          attempts: nextAttempts,
          updatedAt: new Date().toISOString(),
          nextRetryAt: looksNetworkFailure ? 0 : Date.now() + delayMs,
          lastError: reason,
          status:
            nextAttempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS
              ? 'failed-alerted'
              : looksNetworkFailure
                ? 'waiting-connection'
                : 'retrying',
          notifiedPersistentFailure: liveItem.notifiedPersistentFailure || shouldAlert,
        };

        const nextList = loadGasOperationQueue().map((it) =>
          it.id === liveItem.id ? updatedItem : it,
        );
        persistGasOperationQueue(nextList);

        if (shouldAlert) {
          handlers.onPersistentFailure?.(updatedItem);
        }

        // Se a rede caiu no meio da fila, interrompe imediatamente para não gastar tentativas nos demais itens
        if (looksNetworkFailure) {
          break;
        }
      }
    }

    return {
      processed,
      succeeded,
      failed,
      remaining: loadGasOperationQueue().length,
    };
  } finally {
    isProcessingQueue = false;
    notifyQueueListeners();
    scheduleNextQueueDrain();
  }
}
