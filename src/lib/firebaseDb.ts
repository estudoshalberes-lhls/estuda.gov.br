import { getApps, getApp, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc as sdkDoc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore as getFirestoreLite,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore/lite';
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
export const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const firestoreLiteDb = getFirestoreLite(app, firebaseConfig.firestoreDatabaseId);
export const firebaseAuth = getAuth(app);

const FIRESTORE_READ_TIMEOUT_MS = 25_000;
const FIRESTORE_WRITE_TIMEOUT_MS = 30_000;
const FIRESTORE_BATCH_TIMEOUT_MS = 35_000;

export interface FirestoreConfigDiagnostics {
  projectId: string;
  authDomain: string;
  firestoreDatabaseId: string;
  hasApiKey: boolean;
  hasAppId: boolean;
  isValid: boolean;
  issues: string[];
}

export function getFirestoreConfigDiagnostics(): FirestoreConfigDiagnostics {
  const projectId = String(firebaseConfig?.projectId || '').trim();
  const authDomain = String(firebaseConfig?.authDomain || '').trim();
  const firestoreDatabaseId = String(firebaseConfig?.firestoreDatabaseId || '').trim();
  const hasApiKey = Boolean(String(firebaseConfig?.apiKey || '').trim());
  const hasAppId = Boolean(String(firebaseConfig?.appId || '').trim());

  const issues: string[] = [];
  if (!projectId || projectId === 'remixed-project-id') {
    issues.push('projectId ausente ou inválido em firebase-applet-config.json');
  }
  if (!firestoreDatabaseId) {
    issues.push('firestoreDatabaseId ausente em firebase-applet-config.json');
  }
  if (!authDomain) {
    issues.push('authDomain ausente em firebase-applet-config.json');
  }
  if (!hasApiKey) {
    issues.push('apiKey ausente em firebase-applet-config.json');
  }
  if (!hasAppId) {
    issues.push('appId ausente em firebase-applet-config.json');
  }

  return {
    projectId,
    authDomain,
    firestoreDatabaseId,
    hasApiKey,
    hasAppId,
    isValid: issues.length === 0,
    issues,
  };
}

let configLoggedOnce = false;
function assertValidFirestoreConfig(operationType: OperationType, path: string | null): void {
  const diag = getFirestoreConfigDiagnostics();
  if (!configLoggedOnce) {
    configLoggedOnce = true;
    console.info('[Firebase Config]', {
      projectId: diag.projectId,
      firestoreDatabaseId: diag.firestoreDatabaseId,
      authDomain: diag.authDomain,
      hasApiKey: diag.hasApiKey,
      hasAppId: diag.hasAppId,
      isValid: diag.isValid,
      issues: diag.issues,
    });
  }
  if (!diag.isValid) {
    handleFirestoreError(
      new Error(`Configuração inválida do Firebase: ${diag.issues.join('; ')}`),
      operationType,
      path,
      { categoryOverride: 'config', errorCodeOverride: 'failed-precondition' },
    );
  }
}

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
          const err = new Error(
            `Tempo limite excedido (${Math.round(timeoutMs / 1000)}s) em ${operationLabel}.`,
          ) as Error & { code?: string };
          err.code = 'deadline-exceeded';
          reject(err);
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

export type FirestoreErrorCategory =
  | 'auth'
  | 'permission'
  | 'config'
  | 'quota'
  | 'network'
  | 'payload'
  | 'unknown';

export interface FirestoreErrorInfo {
  error: string;
  errorCode?: string;
  category?: FirestoreErrorCategory;
  userMessage?: string;
  details?: string;
  databaseId?: string;
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

export interface ParsedFirestoreError {
  category: FirestoreErrorCategory;
  code: string;
  userMessage: string;
  technicalMessage: string;
  path: string | null;
  operationType: string;
  timestamp: string;
}

function extractFirestoreErrorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) {
      return code.trim().toLowerCase();
    }
  }
  const msg = error instanceof Error ? error.message : String(error || '');
  const lower = msg.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return 'permission-denied';
  }
  if (
    lower.includes('unauthenticated') ||
    lower.includes('auth/user-token-expired') ||
    lower.includes('auth/id-token-expired') ||
    lower.includes('not authenticated') ||
    lower.includes('não autenticado')
  ) {
    return 'unauthenticated';
  }
  if (lower.includes('deadline-exceeded') || lower.includes('tempo limite excedido')) {
    return 'deadline-exceeded';
  }
  if (lower.includes('resource-exhausted') || lower.includes('quota exceeded')) {
    return 'resource-exhausted';
  }
  if (lower.includes('invalid-argument') || lower.includes('exceeds maximum allowed size')) {
    return 'invalid-argument';
  }
  if (lower.includes('unavailable') || lower.includes('failed to fetch') || lower.includes('network')) {
    return 'unavailable';
  }
  if (lower.includes('not-found') || lower.includes('no document to update')) {
    return 'not-found';
  }
  return '';
}

function classifyFirestoreError(
  rawMessage: string,
  code: string,
  overrideCategory?: FirestoreErrorCategory,
): { category: FirestoreErrorCategory; userMessage: string } {
  const lower = rawMessage.toLowerCase();
  const category: FirestoreErrorCategory =
    overrideCategory ||
    (code === 'unauthenticated' ||
    code.startsWith('auth/') ||
    lower.includes('email_verified') ||
    lower.includes('não verificado') ||
    lower.includes('token') ||
    lower.includes('não autenticado')
      ? 'auth'
      : code === 'permission-denied' ||
          lower.includes('insufficient permissions') ||
          lower.includes('permissão')
        ? 'permission'
        : code === 'resource-exhausted' || lower.includes('quota')
          ? 'quota'
          : code === 'invalid-argument' || lower.includes('maximum allowed size')
            ? 'payload'
            : code === 'deadline-exceeded' ||
                code === 'unavailable' ||
                lower.includes('tempo limite') ||
                lower.includes('offline') ||
                lower.includes('failed to fetch') ||
                lower.includes('network')
              ? 'network'
              : code === 'failed-precondition' || lower.includes('configuração')
                ? 'config'
                : 'unknown');

  switch (category) {
    case 'auth':
      return {
        category,
        userMessage:
          'Falha de autenticação no Firebase (sessão ausente, e-mail não verificado ou token expirado). Clique em "Conectar / Renovar Google" ou faça login novamente.',
      };
    case 'permission':
      return {
        category,
        userMessage:
          'Permissão negada pelas regras de segurança do Firestore. Verifique se você entrou com a conta autorizada e se as regras estão compatíveis.',
      };
    case 'config':
      return {
        category,
        userMessage:
          'Configuração do Firebase/Firestore incompleta ou inconsistente em firebase-applet-config.json.',
      };
    case 'quota':
      return {
        category,
        userMessage:
          'Cota diária gratuita de operações do Firestore atingida. A cota será redefinida automaticamente no próximo ciclo.',
      };
    case 'payload':
      return {
        category,
        userMessage:
          'Algum registro excedeu o limite estrutural ou de tamanho (1 MB) de um documento no Firestore.',
      };
    case 'network':
      return {
        category,
        userMessage: `Falha de rede ou tempo limite ao comunicar com o Firestore: ${rawMessage}`,
      };
    default:
      return {
        category,
        userMessage: rawMessage || 'Falha desconhecida ao sincronizar com o Firebase Firestore.',
      };
  }
}

export function parseFirestoreError(err: unknown): ParsedFirestoreError {
  const rawMessage = err instanceof Error ? err.message : String(err || 'Erro desconhecido');
  try {
    const parsed = JSON.parse(rawMessage) as Partial<FirestoreErrorInfo>;
    if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
      const code = parsed.errorCode || extractFirestoreErrorCode(parsed.error);
      const classified = classifyFirestoreError(parsed.error, code, parsed.category);
      return {
        category: parsed.category || classified.category,
        code: code || 'unknown',
        userMessage: parsed.userMessage || classified.userMessage,
        technicalMessage: parsed.details ? `${parsed.error} (${parsed.details})` : parsed.error,
        path: parsed.path ?? null,
        operationType: parsed.operationType || 'unknown',
        timestamp: new Date().toISOString(),
      };
    }
  } catch {
    // raw non-JSON error
  }

  const code = extractFirestoreErrorCode(err);
  const classified = classifyFirestoreError(rawMessage, code);
  return {
    category: classified.category,
    code: code || 'unknown',
    userMessage: classified.userMessage,
    technicalMessage: rawMessage,
    path: null,
    operationType: 'unknown',
    timestamp: new Date().toISOString(),
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  options?: {
    details?: string;
    categoryOverride?: FirestoreErrorCategory;
    errorCodeOverride?: string;
  },
): never {
  const rawMessage = error instanceof Error ? error.message : String(error);
  // If already formatted as FirestoreErrorInfo JSON, preserve inner context instead of double-wrapping
  try {
    const maybeAlready = JSON.parse(rawMessage) as Partial<FirestoreErrorInfo>;
    if (maybeAlready && typeof maybeAlready.error === 'string' && maybeAlready.operationType) {
      throw error instanceof Error ? error : new Error(rawMessage);
    }
  } catch (e) {
    if (e === error) throw e;
  }

  const currentUser = firebaseAuth.currentUser;
  const errorCode = options?.errorCodeOverride || extractFirestoreErrorCode(error);
  const classified = classifyFirestoreError(rawMessage, errorCode, options?.categoryOverride);

  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    errorCode: errorCode || undefined,
    category: classified.category,
    userMessage: classified.userMessage,
    ...(options?.details ? { details: options.details } : {}),
    databaseId: firebaseConfig.firestoreDatabaseId,
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
  console.error('[Firebase Firestore Error]', {
    category: errInfo.category,
    errorCode: errInfo.errorCode,
    operationType: errInfo.operationType,
    path: errInfo.path,
    databaseId: errInfo.databaseId,
    details: errInfo.details,
    uid: errInfo.authInfo.userId,
    email: errInfo.authInfo.email,
    emailVerified: errInfo.authInfo.emailVerified,
    message: errInfo.error,
  });
  throw new Error(JSON.stringify(errInfo));
}

async function verifyFirestoreAuthSession(
  expectedUserId: string,
  operationType: OperationType,
  path: string | null,
  forceRefreshToken = false,
): Promise<string> {
  assertValidFirestoreConfig(operationType, path);

  const currentUser = firebaseAuth.currentUser;
  if (!expectedUserId || !currentUser || currentUser.uid !== expectedUserId) {
    console.warn('[Firebase Auth Preflight] Sessão inválida ou divergente:', {
      expectedUserId,
      actualUid: currentUser?.uid || null,
      email: currentUser?.email || null,
    });
    handleFirestoreError(
      new Error('Sessão do Firebase Auth ausente ou diferente do usuário ativo.'),
      operationType,
      path,
      { categoryOverride: 'auth', errorCodeOverride: 'unauthenticated' },
    );
  }

  if (currentUser.emailVerified === false) {
    console.warn('[Firebase Auth Preflight] E-mail não verificado bloqueado pelas regras:', {
      uid: currentUser.uid,
      email: currentUser.email,
    });
    handleFirestoreError(
      new Error(`O e-mail "${currentUser.email || ''}" não está marcado como verificado no Firebase Auth.`),
      operationType,
      path,
      { categoryOverride: 'auth', errorCodeOverride: 'unauthenticated' },
    );
  }

  try {
    const idToken = await withFirestoreTimeout(
      currentUser.getIdToken(forceRefreshToken),
      12_000,
      'validação do token de autenticação Firebase',
    );
    if (!idToken) {
      throw new Error('Firebase Auth retornou token vazio.');
    }
    return idToken;
  } catch (tokenErr) {
    console.error('[Firebase Auth Preflight] Falha ao obter/renovar ID Token:', tokenErr);
    handleFirestoreError(tokenErr, operationType, path, {
      categoryOverride: 'auth',
      errorCodeOverride: extractFirestoreErrorCode(tokenErr) || 'unauthenticated',
      details: forceRefreshToken ? 'forced-token-refresh' : 'initial-token-check',
    });
  }
}

function isRecoverableAuthFailure(err: unknown): boolean {
  const parsed = parseFirestoreError(err);
  return (
    parsed.category === 'auth' ||
    parsed.code === 'unauthenticated' ||
    parsed.code === 'auth/id-token-expired' ||
    parsed.code === 'auth/user-token-expired'
  );
}

export const FIREBASE_RECONNECT_BACKOFF_DELAYS_MS = [2000, 4000, 8000] as const;

export interface FirebaseBackoffRetryInfo {
  operationName: string;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  parsedError: ParsedFirestoreError;
  rawError: unknown;
}

export function isRetryableFirestoreConnectionError(err: unknown): boolean {
  const parsed = parseFirestoreError(err);
  const combined = `${parsed.technicalMessage} ${parsed.userMessage}`.toLowerCase();

  // Do not waste 14s retrying deterministic rule, configuration, quota, or payload size errors
  if (
    parsed.category === 'permission' ||
    parsed.category === 'config' ||
    parsed.category === 'quota' ||
    parsed.category === 'payload' ||
    parsed.code === 'permission-denied' ||
    parsed.code === 'failed-precondition' ||
    parsed.code === 'resource-exhausted' ||
    parsed.code === 'invalid-argument'
  ) {
    return false;
  }

  // Unverified e-mail or explicitly missing session must be fixed by user action, not timed retries
  if (
    combined.includes('não está marcado como verificado') ||
    combined.includes('email_verified') ||
    combined.includes('sessão do firebase auth ausente')
  ) {
    return false;
  }

  if (parsed.category === 'network') {
    return true;
  }

  if (
    parsed.code === 'unavailable' ||
    parsed.code === 'deadline-exceeded' ||
    parsed.code === 'aborted' ||
    parsed.code === 'internal' ||
    parsed.code === 'auth/network-request-failed'
  ) {
    return true;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  return (
    combined.includes('tempo limite') ||
    combined.includes('timeout') ||
    combined.includes('failed to fetch') ||
    combined.includes('network') ||
    combined.includes('offline') ||
    combined.includes('unavailable') ||
    combined.includes('aborted') ||
    combined.includes('econnreset') ||
    combined.includes('etimedout') ||
    combined.includes('connection')
  );
}

export async function reconnectFirestoreNetwork(): Promise<void> {
  try {
    await enableNetwork(firestoreDb);
  } catch {
    // Best-effort network wake-up before retry
  }
}

export async function executeWithFirebaseBackoff<T>(
  options: {
    operationName: string;
    delaysMs?: readonly number[];
    shouldCancel?: () => boolean;
    onBeforeRetry?: (info: FirebaseBackoffRetryInfo) => Promise<void> | void;
  },
  task: (attemptIndex: number) => Promise<T>,
): Promise<T> {
  const delays = options.delaysMs ?? FIREBASE_RECONNECT_BACKOFF_DELAYS_MS;
  let attemptIndex = 0;

  while (true) {
    if (options.shouldCancel?.()) {
      throw new Error(`Operação "${options.operationName}" cancelada antes da tentativa ${attemptIndex + 1}.`);
    }

    try {
      const result = await task(attemptIndex);
      if (attemptIndex > 0) {
        console.log(`[Firebase Backoff][${options.operationName}] Reconexão bem-sucedida após ${attemptIndex} retentativa(s).`);
      }
      return result;
    } catch (err) {
      if (options.shouldCancel?.() || attemptIndex >= delays.length || !isRetryableFirestoreConnectionError(err)) {
        if (attemptIndex > 0) {
          console.error(
            `[Firebase Backoff][${options.operationName}] Todas as ${delays.length} retentativas de reconexão (${delays.map((d) => `${d / 1000}s`).join(', ')}) falharam. Exibindo erro final.`,
            err,
          );
        }
        throw err;
      }

      const delayMs = delays[attemptIndex];
      const parsedError = parseFirestoreError(err);
      const retryNumber = attemptIndex + 1;

      console.log(`[Firebase Backoff][${options.operationName}] Conexão falhou. Tentando reconectar automaticamente...`, {
        attempt: retryNumber,
        maxRetries: delays.length,
        retryInSeconds: delayMs / 1000,
        delayMs,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        errorCategory: parsedError.category,
        errorCode: parsedError.code,
        errorMessage: parsedError.technicalMessage,
      });

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      });

      if (options.shouldCancel?.()) {
        throw err;
      }

      await reconnectFirestoreNetwork();
      if (options.onBeforeRetry) {
        try {
          await options.onBeforeRetry({
            operationName: options.operationName,
            attempt: retryNumber,
            maxRetries: delays.length,
            delayMs,
            parsedError,
            rawError: err,
          });
        } catch (hookErr) {
          console.warn(`[Firebase Backoff][${options.operationName}] Aviso durante preparação da reconexão:`, hookErr);
        }
      }

      attemptIndex += 1;
    }
  }
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
  details?: string;
}

export async function validateFirestoreAuthConnection(
  expectedUserId: string | null,
  expectedEmail?: string | null,
): Promise<FirestoreAuthHealthReport> {
  const checkedAt = new Date().toISOString();
  const diag = getFirestoreConfigDiagnostics();

  if (!diag.isValid) {
    return {
      status: 'inconsistent',
      code: 'config-invalid',
      message: `Inconsistência na configuração do Firebase: ${diag.issues.join('; ')}`,
      checkedAt,
      uid: firebaseAuth.currentUser?.uid || null,
      email: firebaseAuth.currentUser?.email || null,
      emailVerified: firebaseAuth.currentUser?.emailVerified ?? null,
      tokenExpiresAt: null,
      details: diag.issues.join('; '),
    };
  }

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    return {
      status: 'expired',
      code: 'auth/session-missing',
      message:
        'Sua sessão Google/Firebase expirou ou foi encerrada neste navegador. Reconecte sua conta para manter a sincronização com o Firestore.',
      checkedAt,
      uid: null,
      email: expectedEmail || null,
      emailVerified: null,
      tokenExpiresAt: null,
    };
  }

  if (expectedUserId && currentUser.uid !== expectedUserId) {
    return {
      status: 'inconsistent',
      code: 'auth/uid-mismatch',
      message:
        'Inconsistência detectada entre o usuário ativo na interface e a sessão autenticada no Firebase. Reconecte sua conta Google.',
      checkedAt,
      uid: currentUser.uid,
      email: currentUser.email || null,
      emailVerified: currentUser.emailVerified,
      tokenExpiresAt: null,
      details: `expectedUid=${expectedUserId}, actualUid=${currentUser.uid}`,
    };
  }

  if (
    expectedEmail &&
    currentUser.email &&
    currentUser.email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()
  ) {
    return {
      status: 'inconsistent',
      code: 'auth/email-mismatch',
      message: `Inconsistência de conta detectada (${currentUser.email} diferente de ${expectedEmail}). Reconecte sua conta Google.`,
      checkedAt,
      uid: currentUser.uid,
      email: currentUser.email,
      emailVerified: currentUser.emailVerified,
      tokenExpiresAt: null,
    };
  }

  if (currentUser.emailVerified === false) {
    return {
      status: 'inconsistent',
      code: 'auth/email-not-verified',
      message: `O e-mail "${currentUser.email || ''}" não está verificado no Firebase Auth (exigido pelas regras do Firestore).`,
      checkedAt,
      uid: currentUser.uid,
      email: currentUser.email || null,
      emailVerified: false,
      tokenExpiresAt: null,
    };
  }

  let tokenExpiresAt: string | null = null;
  try {
    let tokenResult = await withFirestoreTimeout(
      currentUser.getIdTokenResult(false),
      10_000,
      'validação periódica do token Firebase',
    );
    const expMs = Date.parse(tokenResult.expirationTime || '');
    if (!Number.isFinite(expMs) || expMs - Date.now() < 4 * 60 * 1000) {
      tokenResult = await withFirestoreTimeout(
        currentUser.getIdTokenResult(true),
        10_000,
        'renovação periódica do token Firebase',
      );
    }
    tokenExpiresAt = tokenResult.expirationTime || null;
  } catch (tokenErr) {
    const code = extractFirestoreErrorCode(tokenErr) || 'unauthenticated';
    const rawMsg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr || '');
    const isNetwork =
      code === 'deadline-exceeded' ||
      code === 'unavailable' ||
      code === 'auth/network-request-failed' ||
      (typeof navigator !== 'undefined' && navigator.onLine === false);

    if (isNetwork) {
      return {
        status: 'warning',
        code,
        message: 'Conexão instável ou offline ao validar o token de autenticação com o Firebase.',
        checkedAt,
        uid: currentUser.uid,
        email: currentUser.email || null,
        emailVerified: currentUser.emailVerified,
        tokenExpiresAt,
        details: rawMsg,
      };
    }

    return {
      status: 'expired',
      code,
      message:
        'A sessão OAuth/Firebase expirou ou foi revogada. Clique em "Reconectar Conta Google" para continuar sincronizando.',
      checkedAt,
      uid: currentUser.uid,
      email: currentUser.email || null,
      emailVerified: currentUser.emailVerified,
      tokenExpiresAt,
      details: rawMsg,
    };
  }

  // Live lightweight server-side probe against Firestore rules (`users/{uid}`)
  const probeRef = doc(firestoreLiteDb, 'users', currentUser.uid);
  try {
    await withFirestoreTimeout(
      getDoc(probeRef),
      12_000,
      'verificação de autenticação no Firestore',
    );
    return {
      status: 'healthy',
      code: 'ok',
      message: 'Sessão autenticada e comunicação com o Firestore validadas.',
      checkedAt,
      uid: currentUser.uid,
      email: currentUser.email || null,
      emailVerified: currentUser.emailVerified,
      tokenExpiresAt,
    };
  } catch (probeErr) {
    const code = extractFirestoreErrorCode(probeErr) || 'unknown';
    if (code === 'unauthenticated') {
      try {
        const refreshed = await withFirestoreTimeout(
          currentUser.getIdTokenResult(true),
          10_000,
          'revalidação do token após rejeição do Firestore',
        );
        tokenExpiresAt = refreshed.expirationTime || tokenExpiresAt;
        await withFirestoreTimeout(
          getDoc(probeRef),
          12_000,
          'segunda verificação de autenticação no Firestore',
        );
        return {
          status: 'healthy',
          code: 'ok-refreshed',
          message: 'Sessão renovada e validada com o Firestore.',
          checkedAt,
          uid: currentUser.uid,
          email: currentUser.email || null,
          emailVerified: currentUser.emailVerified,
          tokenExpiresAt,
        };
      } catch (retryErr) {
        const retryCode = extractFirestoreErrorCode(retryErr) || code;
        return {
          status: retryCode === 'permission-denied' ? 'inconsistent' : 'expired',
          code: retryCode,
          message:
            retryCode === 'permission-denied'
              ? 'Inconsistência de permissão detectada pelas regras de segurança do Firestore. Verifique se a conta Google conectada está autorizada.'
              : 'Sua sessão OAuth/Firebase expirou ou foi rejeitada pelo servidor Firestore. Reconecte sua conta Google.',
          checkedAt,
          uid: currentUser.uid,
          email: currentUser.email || null,
          emailVerified: currentUser.emailVerified,
          tokenExpiresAt,
          details: retryErr instanceof Error ? retryErr.message : String(retryErr || ''),
        };
      }
    }

    if (code === 'permission-denied' || code === 'failed-precondition') {
      return {
        status: 'inconsistent',
        code,
        message:
          'Inconsistência de permissão ou configuração ao validar o acesso ao Firestore. Reconecte sua conta autorizada.',
        checkedAt,
        uid: currentUser.uid,
        email: currentUser.email || null,
        emailVerified: currentUser.emailVerified,
        tokenExpiresAt,
        details: probeErr instanceof Error ? probeErr.message : String(probeErr || ''),
      };
    }

    return {
      status: 'warning',
      code,
      message: 'Não foi possível alcançar o servidor Firestore durante a verificação periódica.',
      checkedAt,
      uid: currentUser.uid,
      email: currentUser.email || null,
      emailVerified: currentUser.emailVerified,
      tokenExpiresAt,
      details: probeErr instanceof Error ? probeErr.message : String(probeErr || ''),
    };
  }
}

let connectionTested = false;

export async function testFirestoreConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  const diag = getFirestoreConfigDiagnostics();
  console.info('[Firebase Config] Verificando conectividade inicial com Firestore...', {
    projectId: diag.projectId,
    databaseId: diag.firestoreDatabaseId,
    authDomain: diag.authDomain,
  });
  try {
    await getDocFromServer(sdkDoc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      console.error('[Firebase Firestore] Cliente offline ao testar conexão com o banco:', diag);
    } else if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
      console.info('[Firebase Firestore] Conectividade confirmada com o servidor Firestore.');
    } else {
      console.warn('[Firebase Firestore] Aviso na verificação inicial de conexão:', msg);
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

const MAX_ITEMS_PER_CHUNK = 45;
const MAX_LAW_ITEMS_PER_SLICE = 25;
const MAX_CHUNK_BYTES = 95_000; // ~95 KB UTF-8 JSON per Firestore document for fast REST commits

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

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
    const serialized = JSON.stringify(value);
    return utf8Encoder ? utf8Encoder.encode(serialized).length : serialized.length * 2;
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
  recordsLoaded: boolean;
  workspaceContentHash: string | null;
  chunkHashes: Map<string, string>;
}

const userCacheStates = new Map<string, UserFirestoreCacheState>();

function getOrCreateUserCacheState(userId: string): UserFirestoreCacheState {
  let st = userCacheStates.get(userId);
  if (!st) {
    st = {
      workspaceExists: false,
      recordsLoaded: false,
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

async function loadDatabaseFromFirestoreInternal(
  userId: string,
  forceRefreshToken = false,
): Promise<LoadedFirestoreWorkspace | null> {
  const workspacePath = `users/${userId}`;
  const recordsPath = `users/${userId}/dbRecords`;
  const startedAt = Date.now();

  await verifyFirestoreAuthSession(userId, OperationType.GET, workspacePath, forceRefreshToken);

  const state = getOrCreateUserCacheState(userId);
  console.info('[Firebase Sync][Load] Lendo workspace e partições...', {
    uid: userId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    forceRefreshToken,
  });

  let workspaceSnap;
  try {
    workspaceSnap = await withFirestoreTimeout(
      getDoc(doc(firestoreLiteDb, 'users', userId)),
      FIRESTORE_READ_TIMEOUT_MS,
      'leitura do workspace no Firestore',
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, workspacePath, {
      details: `elapsedMs=${Date.now() - startedAt}`,
    });
  }

  if (!workspaceSnap.exists()) {
    state.workspaceExists = false;
    state.recordsLoaded = false;
    state.workspaceContentHash = null;
    state.chunkHashes.clear();
    console.info('[Firebase Sync][Load] Workspace ainda não existe no Firestore.', {
      uid: userId,
      elapsedMs: Date.now() - startedAt,
    });
    return null;
  }

  const wsData = workspaceSnap.data() || {};
  state.workspaceExists = true;
  state.workspaceContentHash = typeof wsData.contentHash === 'string' ? wsData.contentHash : null;

  let recordsSnap;
  try {
    const q = query(
      collection(firestoreLiteDb, 'users', userId, 'dbRecords'),
      where('ownerId', '==', userId),
    );
    recordsSnap = await withFirestoreTimeout(
      getDocs(q),
      FIRESTORE_READ_TIMEOUT_MS,
      'leitura das partições no Firestore',
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, recordsPath, {
      details: `elapsedMs=${Date.now() - startedAt}`,
    });
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
  state.recordsLoaded = true;

  if (chunks.length === 0) {
    console.info('[Firebase Sync][Load] Workspace sem partições gravadas.', {
      uid: userId,
      elapsedMs: Date.now() - startedAt,
    });
    return null;
  }

  const assembledDb = reassembleDatabaseFromFirestoreChunks(chunks);
  const updatedAt = timestampToIso(wsData.updatedAt || wsData.createdAt);
  console.info('[Firebase Sync][Load] Leitura concluída.', {
    uid: userId,
    chunksLoaded: chunks.length,
    updatedAt,
    elapsedMs: Date.now() - startedAt,
  });

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

export async function loadDatabaseFromFirestore(
  userId: string,
): Promise<LoadedFirestoreWorkspace | null> {
  if (!userId || !firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== userId) {
    return null;
  }
  try {
    return await loadDatabaseFromFirestoreInternal(userId, false);
  } catch (err) {
    if (isRecoverableAuthFailure(err)) {
      console.warn('[Firebase Sync][Load] Falha de autenticação detectada — renovando ID token e tentando novamente...');
      return await loadDatabaseFromFirestoreInternal(userId, true);
    }
    throw err;
  }
}

async function saveDatabaseToFirestoreInternal(
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
    forceRefreshToken?: boolean;
  },
): Promise<{
  updatedAt: string;
  writtenChunks: number;
  totalChunks: number;
}> {
  const startedAt = Date.now();
  const state = getOrCreateUserCacheState(userId);
  const workspaceRef = doc(firestoreLiteDb, 'users', userId);
  const workspacePath = `users/${userId}`;
  const recordsPath = `users/${userId}/dbRecords`;

  await verifyFirestoreAuthSession(
    userId,
    OperationType.WRITE,
    workspacePath,
    Boolean(options?.forceRefreshToken),
  );

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
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, workspacePath, {
        details: `check-workspace-exists elapsedMs=${Date.now() - startedAt}`,
      });
    }
  }

  // Ensure existing dbRecords IDs/hashes are synchronized from server before deciding create vs update
  if (state.workspaceExists && !state.recordsLoaded) {
    try {
      const existingRecords = await withFirestoreTimeout(
        getDocs(
          query(
            collection(firestoreLiteDb, 'users', userId, 'dbRecords'),
            where('ownerId', '==', userId),
          ),
        ),
        FIRESTORE_READ_TIMEOUT_MS,
        'listagem de partições no Firestore',
      );
      state.chunkHashes.clear();
      existingRecords.forEach((r) => {
        const d = r.data();
        state.chunkHashes.set(r.id, String(d.contentHash || ''));
      });
      state.recordsLoaded = true;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, recordsPath, {
        details: `list-existing-chunks elapsedMs=${Date.now() - startedAt}`,
      });
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
      state.recordsLoaded = true;
      state.workspaceContentHash = safeContentHash;
      createdWorkspaceNow = true;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, workspacePath, {
        details: `create-workspace elapsedMs=${Date.now() - startedAt}`,
      });
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

  // Execute chunk mutations in small, fast REST batches (max 4 docs or ~180KB per batch)
  type BatchOp =
    | { kind: 'create'; chunk: StudyDbRecordChunk; approxBytes: number }
    | { kind: 'update'; chunk: StudyDbRecordChunk; approxBytes: number }
    | { kind: 'delete'; recordId: string; approxBytes: number };

  const allOps: BatchOp[] = [
    ...toCreate.map((chunk): BatchOp => ({
      kind: 'create',
      chunk,
      approxBytes: estimateByteLength(chunk.payload) + 256,
    })),
    ...toUpdate.map((chunk): BatchOp => ({
      kind: 'update',
      chunk,
      approxBytes: estimateByteLength(chunk.payload) + 256,
    })),
    ...toDelete.map((recordId): BatchOp => ({
      kind: 'delete',
      recordId,
      approxBytes: 128,
    })),
  ];

  const MAX_BATCH_OPS = 4;
  const MAX_BATCH_BYTES = 180_000;
  const slices: BatchOp[][] = [];
  let curSlice: BatchOp[] = [];
  let curSliceBytes = 0;

  for (const op of allOps) {
    if (
      curSlice.length > 0 &&
      (curSlice.length >= MAX_BATCH_OPS || curSliceBytes + op.approxBytes > MAX_BATCH_BYTES)
    ) {
      slices.push(curSlice);
      curSlice = [];
      curSliceBytes = 0;
    }
    curSlice.push(op);
    curSliceBytes += op.approxBytes;
  }
  if (curSlice.length > 0) {
    slices.push(curSlice);
  }

  const totalBytes = allOps.reduce((sum, op) => sum + op.approxBytes, 0);
  console.info('[Firebase Sync][Save] Planejamento de gravação:', {
    uid: userId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    forceFullWrite: Boolean(options?.forceFullWrite),
    totalChunks: chunks.length,
    toCreate: toCreate.length,
    toUpdate: toUpdate.length,
    toDelete: toDelete.length,
    batches: slices.length,
    approxKB: Math.round(totalBytes / 1024),
  });

  const commitSingleOp = async (op: BatchOp) => {
    const opStart = Date.now();
    if (op.kind === 'create') {
      const ref = doc(firestoreLiteDb, 'users', userId, 'dbRecords', op.chunk.recordId);
      await withFirestoreTimeout(
        setDoc(ref, {
          ownerId: userId,
          section: op.chunk.section,
          chunkIndex: op.chunk.chunkIndex,
          chunkTotal: op.chunk.chunkTotal,
          contentHash: op.chunk.contentHash,
          payload: op.chunk.payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        FIRESTORE_WRITE_TIMEOUT_MS,
        `criação de partição (${op.chunk.recordId})`,
      );
      state.chunkHashes.set(op.chunk.recordId, op.chunk.contentHash);
      console.info('[Firebase Sync][Save] Partição criada:', {
        recordId: op.chunk.recordId,
        bytes: op.approxBytes,
        elapsedMs: Date.now() - opStart,
      });
    } else if (op.kind === 'update') {
      const ref = doc(firestoreLiteDb, 'users', userId, 'dbRecords', op.chunk.recordId);
      try {
        await withFirestoreTimeout(
          updateDoc(ref, {
            chunkIndex: op.chunk.chunkIndex,
            chunkTotal: op.chunk.chunkTotal,
            contentHash: op.chunk.contentHash,
            payload: op.chunk.payload,
            updatedAt: serverTimestamp(),
          }),
          FIRESTORE_WRITE_TIMEOUT_MS,
          `atualização de partição (${op.chunk.recordId})`,
        );
      } catch (updateErr: unknown) {
        const errCode = (updateErr as { code?: string })?.code || '';
        const errMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);
        if (errCode === 'not-found' || errMsg.includes('NOT_FOUND') || errMsg.includes('No document to update')) {
          console.warn('[Firebase Sync][Save] Partição ausente no servidor durante update; recriando:', op.chunk.recordId);
          await withFirestoreTimeout(
            setDoc(ref, {
              ownerId: userId,
              section: op.chunk.section,
              chunkIndex: op.chunk.chunkIndex,
              chunkTotal: op.chunk.chunkTotal,
              contentHash: op.chunk.contentHash,
              payload: op.chunk.payload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            FIRESTORE_WRITE_TIMEOUT_MS,
            `recriação de partição (${op.chunk.recordId})`,
          );
        } else {
          throw updateErr;
        }
      }
      state.chunkHashes.set(op.chunk.recordId, op.chunk.contentHash);
      console.info('[Firebase Sync][Save] Partição atualizada:', {
        recordId: op.chunk.recordId,
        bytes: op.approxBytes,
        elapsedMs: Date.now() - opStart,
      });
    } else {
      const ref = doc(firestoreLiteDb, 'users', userId, 'dbRecords', op.recordId);
      await withFirestoreTimeout(
        deleteDoc(ref),
        FIRESTORE_WRITE_TIMEOUT_MS,
        `remoção de partição (${op.recordId})`,
      );
      state.chunkHashes.delete(op.recordId);
    }
  };

  let processedCount = 0;
  for (const slice of slices) {
    const startIdx = processedCount + 1;
    const endIdx = processedCount + slice.length;
    processedCount = endIdx;

    if (slice.length === 1) {
      const onlyOp = slice[0];
      const singlePath =
        onlyOp.kind === 'delete'
          ? `${recordsPath}/${onlyOp.recordId}`
          : `${recordsPath}/${onlyOp.chunk.recordId}`;
      try {
        await commitSingleOp(onlyOp);
        continue;
      } catch (singleErr) {
        handleFirestoreError(singleErr, OperationType.WRITE, singlePath, {
          details: `single-op bytes=${onlyOp.approxBytes}`,
        });
      }
    }

    const batchStart = Date.now();
    const batch = writeBatch(firestoreLiteDb);
    let sliceBytes = 0;
    const sliceIds: string[] = [];
    for (const op of slice) {
      sliceBytes += op.approxBytes;
      if (op.kind === 'create') {
        sliceIds.push(op.chunk.recordId);
        const ref = doc(firestoreLiteDb, 'users', userId, 'dbRecords', op.chunk.recordId);
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
        sliceIds.push(op.chunk.recordId);
        const ref = doc(firestoreLiteDb, 'users', userId, 'dbRecords', op.chunk.recordId);
        batch.update(ref, {
          chunkIndex: op.chunk.chunkIndex,
          chunkTotal: op.chunk.chunkTotal,
          contentHash: op.chunk.contentHash,
          payload: op.chunk.payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        sliceIds.push(op.recordId);
        const ref = doc(firestoreLiteDb, 'users', userId, 'dbRecords', op.recordId);
        batch.delete(ref);
      }
    }

    try {
      await withFirestoreTimeout(
        batch.commit(),
        FIRESTORE_BATCH_TIMEOUT_MS,
        `gravação em lote no Firestore (${startIdx}-${endIdx})`,
      );
      for (const op of slice) {
        if (op.kind === 'create' || op.kind === 'update') {
          state.chunkHashes.set(op.chunk.recordId, op.chunk.contentHash);
        } else {
          state.chunkHashes.delete(op.recordId);
        }
      }
      console.info('[Firebase Sync][Save] Lote concluído:', {
        range: `${startIdx}-${endIdx}`,
        ids: sliceIds,
        bytes: sliceBytes,
        elapsedMs: Date.now() - batchStart,
      });
    } catch (batchErr) {
      console.warn('[Firebase Sync][Save] Falha no lote; tentando gravação individual por partição...', {
        range: `${startIdx}-${endIdx}`,
        ids: sliceIds,
        bytes: sliceBytes,
        error: batchErr instanceof Error ? batchErr.message : String(batchErr),
      });
      if (slice.length > 1) {
        // Fallback: commit operations individually (also self-heals not-found docs)
        for (const op of slice) {
          const singlePath =
            op.kind === 'delete'
              ? `${recordsPath}/${op.recordId}`
              : `${recordsPath}/${op.chunk.recordId}`;
          try {
            await commitSingleOp(op);
          } catch (singleErr) {
            handleFirestoreError(singleErr, OperationType.WRITE, singlePath, {
              details: `fallback-single bytes=${op.approxBytes}`,
            });
          }
        }
        continue;
      }
      handleFirestoreError(batchErr, OperationType.WRITE, recordsPath, {
        details: `batch-${startIdx}-${endIdx} bytes=${sliceBytes}`,
      });
    }
  }

  // Step 3: Update the parent /users/{userId} workspace metadata if not just created or if chunks changed
  if (!createdWorkspaceNow && (allOps.length > 0 || state.workspaceContentHash !== safeContentHash || options?.forceFullWrite)) {
    const prevWsHash = state.workspaceContentHash;
    state.workspaceContentHash = safeContentHash;
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
    } catch (error) {
      state.workspaceContentHash = prevWsHash;
      handleFirestoreError(error, OperationType.UPDATE, workspacePath, {
        details: `update-workspace elapsedMs=${Date.now() - startedAt}`,
      });
    }
  }

  console.info('[Firebase Sync][Save] Sincronização concluída com sucesso:', {
    uid: userId,
    writtenChunks: toCreate.length + toUpdate.length,
    deletedChunks: toDelete.length,
    totalChunks: chunks.length,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    updatedAt: new Date().toISOString(),
    writtenChunks: toCreate.length + toUpdate.length,
    totalChunks: chunks.length,
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
  try {
    return await saveDatabaseToFirestoreInternal(userId, db, contentHash, timerState, options);
  } catch (err) {
    if (isRecoverableAuthFailure(err)) {
      console.warn('[Firebase Sync][Save] Falha de autenticação/token — renovando ID token e tentando novamente...');
      return await saveDatabaseToFirestoreInternal(userId, db, contentHash, timerState, {
        ...options,
        forceRefreshToken: true,
      });
    }
    throw err;
  }
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

  const workspacePath = `users/${userId}`;
  await verifyFirestoreAuthSession(userId, OperationType.UPDATE, workspacePath, false);

  const workspaceRef = doc(firestoreLiteDb, 'users', userId);
  const safeTimerState = sanitizeForFirestore({
    elapsed: Number(timerState.elapsed || 0),
    startedAt: Number(timerState.startedAt || 0),
    ...(timerState.activeTopic ? { activeTopic: timerState.activeTopic } : {}),
  });

  try {
    await withFirestoreTimeout(
      updateDoc(workspaceRef, {
        timerState: safeTimerState,
        updatedAt: serverTimestamp(),
      }),
      FIRESTORE_WRITE_TIMEOUT_MS,
      'atualização do cronômetro no Firestore',
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, workspacePath, {
      details: 'timer-state-sync',
    });
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
  onListenerError?: (parsedError: ParsedFirestoreError) => void,
): Unsubscribe {
  if (!userId || !firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== userId) {
    return () => {};
  }

  const workspacePath = `users/${userId}`;
  const workspaceRef = sdkDoc(firestoreDb, 'users', userId);
  console.info('[Firebase Sync][Listener] Escuta em tempo real conectada em:', {
    path: workspacePath,
    databaseId: firebaseConfig.firestoreDatabaseId,
  });

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
        handleFirestoreError(error, OperationType.GET, workspacePath, {
          details: 'realtime-onSnapshot',
        });
      } catch (wrapped) {
        onListenerError?.(parseFirestoreError(wrapped));
      }
    },
  );
}
