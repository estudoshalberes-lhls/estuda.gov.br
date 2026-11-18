import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { loadDriveJsonCacheEntry, saveDriveJsonCacheEntry } from './fileStorage';
import { IncrementalBackupEnvelope, isIncrementalBackupPayload } from './incrementalBackup';

export { firebaseConfig };
export type { User };
export type GoogleAccountUser = User;

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const GOOGLE_CLIENT_ID =
  String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim() ||
  String((firebaseConfig as { oAuthClientId?: string }).oAuthClientId || '').trim() ||
  '848919975785-6uthlnjqh75uodmirv21drrddqs969sv.apps.googleusercontent.com';

export const DRIVE_FOLDER_NAME = 'Central de Estudos - Materiais';
export const DEFAULT_STUDY_FOLDER_ID = '';
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const;
export const DRIVE_SCOPE = DRIVE_SCOPES[0];
export const CLOUD_SYNC_FILENAME = 'central_estudos_sync_latest.json';
const DRIVE_FOLDER_PREF_KEY = 'central_estudos_drive_folder_pref_v1';
const KNOWN_DRIVE_ROOTS_KEY = 'central_estudos_known_drive_roots_v1';
const DRIVE_TOKEN_CACHE_KEY = 'central_estudos_drive_token_v1';
const DRIVE_SESSION_TOKEN_KEY = 'central_estudos_drive_session_token_v1';
const LAST_GOOGLE_EMAIL_KEY = 'central_estudos_last_google_email_v1';
const DRIVE_BLOCKED_FILES_KEY = 'central_estudos_drive_blocked_files_v1';
const SILENT_REFRESH_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const DRIVE_TOKEN_DEFAULT_TTL_MS = 55 * 60 * 1000;

void setPersistence(auth, browserLocalPersistence).catch(() => {
  // ignore persistence error in restricted contexts
});

function readBlockedDriveFileIds(): Set<string> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return new Set();
    const raw = window.localStorage.getItem(DRIVE_BLOCKED_FILES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function writeBlockedDriveFileIds(ids: Set<string>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const arr = Array.from(ids);
    if (arr.length === 0) {
      window.localStorage.removeItem(DRIVE_BLOCKED_FILES_KEY);
    } else {
      window.localStorage.setItem(DRIVE_BLOCKED_FILES_KEY, JSON.stringify(arr.slice(-300)));
    }
  } catch {
    // ignore storage errors
  }
}

export function isDriveFilePermissionBlocked(fileId?: string | null): boolean {
  if (!fileId) return false;
  return readBlockedDriveFileIds().has(fileId);
}

export function markDriveFilePermissionBlocked(fileId?: string | null): void {
  if (!fileId) return;
  const ids = readBlockedDriveFileIds();
  if (ids.has(fileId)) return;
  ids.add(fileId);
  writeBlockedDriveFileIds(ids);
}

export function clearDrivePermissionBlockedFiles(fileIds?: string[]): void {
  if (!fileIds || fileIds.length === 0) {
    writeBlockedDriveFileIds(new Set());
    return;
  }
  const ids = readBlockedDriveFileIds();
  let changed = false;
  for (const id of fileIds) {
    if (ids.delete(id)) changed = true;
  }
  if (changed) writeBlockedDriveFileIds(ids);
}

type DriveTokenListener = (hasToken: boolean, token: string | null) => void;
const driveTokenListeners = new Set<DriveTokenListener>();

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;
let isSigningIn = false;
let gsiLoadPromise: Promise<void> | null = null;
let inflightSilentRefreshPromise: Promise<string | null> | null = null;
let lastSilentRefreshFailureAt = 0;
let cachedFolderId: string | null = null;
let cachedFolderLink: string | null = null;
let cachedFolderName: string | null = null;
let inflightStudyFolderPromise: Promise<{ id: string; name: string; webViewLink?: string }> | null = null;
const cachedSubFolderIds: Record<string, string> = {};
const inflightSubFolderPromises = new Map<string, Promise<string>>();

function notifyDriveTokenListeners(): void {
  const valid = Boolean(cachedAccessToken && (!cachedAccessTokenExpiresAt || Date.now() < cachedAccessTokenExpiresAt - 15_000));
  const token = valid ? cachedAccessToken : null;
  driveTokenListeners.forEach((listener) => {
    try {
      listener(valid, token);
    } catch {
      // ignore listener error
    }
  });
}

export function subscribeDriveTokenChanges(listener: DriveTokenListener): () => void {
  driveTokenListeners.add(listener);
  return () => {
    driveTokenListeners.delete(listener);
  };
}

function readLastGoogleEmail(): string | null {
  try {
    const val = localStorage.getItem(LAST_GOOGLE_EMAIL_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

function rememberLastGoogleEmail(email?: string | null): void {
  const clean = typeof email === 'string' ? email.trim() : '';
  if (!clean) return;
  try {
    localStorage.setItem(LAST_GOOGLE_EMAIL_KEY, clean);
  } catch {
    // ignore storage errors
  }
}

function clearRememberedGoogleEmail(): void {
  try {
    localStorage.removeItem(LAST_GOOGLE_EMAIL_KEY);
  } catch {
    // ignore storage errors
  }
}

function persistDriveAccessToken(
  token: string,
  expiresAt: number,
  user?: { uid?: string | null; email?: string | null } | null,
): void {
  cachedAccessToken = token;
  cachedAccessTokenExpiresAt = expiresAt;
  lastSilentRefreshFailureAt = 0;
  const uid = user?.uid || auth.currentUser?.uid || '';
  const email = user?.email || auth.currentUser?.email || readLastGoogleEmail() || undefined;
  if (email) rememberLastGoogleEmail(email);
  const payload = JSON.stringify({ token, expiresAt, uid });
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(DRIVE_TOKEN_CACHE_KEY, payload);
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(DRIVE_SESSION_TOKEN_KEY, payload);
    }
  } catch {
    // ignore storage errors
  }
  notifyDriveTokenListeners();
}

function restorePersistedDriveAccessToken(user?: User | null): string | null {
  if (cachedAccessToken && (!cachedAccessTokenExpiresAt || Date.now() < cachedAccessTokenExpiresAt - 60_000)) {
    return cachedAccessToken;
  }
  const activeUid = user?.uid || auth.currentUser?.uid || '';
  const readValidFromStorage = (storage: Storage | undefined, key: string): string | null => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { token?: string; expiresAt?: number; uid?: string };
      const uidMatches = !parsed.uid || !activeUid || parsed.uid === activeUid;
      if (
        uidMatches &&
        typeof parsed.token === 'string' &&
        parsed.token.trim().length > 0 &&
        typeof parsed.expiresAt === 'number' &&
        Date.now() < parsed.expiresAt - 60_000
      ) {
        cachedAccessToken = parsed.token;
        cachedAccessTokenExpiresAt = parsed.expiresAt;
        return cachedAccessToken;
      }
      if (typeof parsed.expiresAt === 'number' && Date.now() >= parsed.expiresAt - 60_000) {
        storage.removeItem(key);
      }
    } catch {
      // ignore storage errors
    }
    return null;
  };

  if (typeof window !== 'undefined') {
    return (
      readValidFromStorage(window.sessionStorage, DRIVE_SESSION_TOKEN_KEY) ||
      readValidFromStorage(window.localStorage, DRIVE_TOKEN_CACHE_KEY)
    );
  }
  return null;
}

export interface DriveFolderPreference {
  id: string | null;
  name: string;
}

export function getKnownStudyDriveFolderNames(): string[] {
  const result = new Set<string>([DRIVE_FOLDER_NAME, 'central-de-estudos-sigma.verce']);
  try {
    const raw = localStorage.getItem(KNOWN_DRIVE_ROOTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((n) => {
          if (typeof n === 'string' && n.trim()) result.add(n.trim());
        });
      }
    }
    const prefRaw = localStorage.getItem(DRIVE_FOLDER_PREF_KEY);
    if (prefRaw) {
      const prefParsed = JSON.parse(prefRaw) as Partial<DriveFolderPreference>;
      if (typeof prefParsed?.name === 'string' && prefParsed.name.trim()) {
        result.add(prefParsed.name.trim());
      }
    }
  } catch {
    // ignore storage errors
  }
  return Array.from(result);
}

export function rememberKnownStudyDriveFolderName(name?: string | null): void {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean) return;
  try {
    const existing = getKnownStudyDriveFolderNames();
    if (!existing.some((x) => x.toLowerCase() === clean.toLowerCase())) {
      localStorage.setItem(KNOWN_DRIVE_ROOTS_KEY, JSON.stringify([...existing, clean]));
    }
  } catch {
    // ignore storage errors
  }
}

export function getPreferredStudyFolder(): DriveFolderPreference {
  try {
    const raw = localStorage.getItem(DRIVE_FOLDER_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DriveFolderPreference>;
      const name = typeof parsed?.name === 'string' && parsed.name.trim() ? parsed.name.trim() : DRIVE_FOLDER_NAME;
      const hasExplicitNullId = Object.prototype.hasOwnProperty.call(parsed, 'id') && parsed.id === null;
      const id =
        typeof parsed?.id === 'string' && parsed.id.trim()
          ? parsed.id.trim()
          : hasExplicitNullId
            ? null
            : DEFAULT_STUDY_FOLDER_ID;
      return { id, name };
    }
  } catch {
    // ignore storage errors
  }
  return { id: DEFAULT_STUDY_FOLDER_ID, name: DRIVE_FOLDER_NAME };
}

export function setPreferredStudyFolder(pref: { id?: string | null; name?: string | null }): DriveFolderPreference {
  const next: DriveFolderPreference = {
    id: pref.id?.trim() || null,
    name: pref.name?.trim() || DRIVE_FOLDER_NAME,
  };
  rememberKnownStudyDriveFolderName(next.name);
  try {
    localStorage.setItem(DRIVE_FOLDER_PREF_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  cachedFolderId = null;
  cachedFolderLink = null;
  cachedFolderName = null;
  inflightStudyFolderPromise = null;
  inflightSubFolderPromises.clear();
  for (const key of Object.keys(cachedSubFolderIds)) {
    delete cachedSubFolderIds[key];
  }
  return next;
}

export function extractDriveFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const folderUrlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderUrlMatch?.[1]) return folderUrlMatch[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idParamMatch?.[1]) return idParamMatch[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed) && !trimmed.includes(' ')) {
    return trimmed;
  }
  return null;
}

export function clearAccessTokenOnly(): void {
  cachedAccessToken = null;
  cachedAccessTokenExpiresAt = 0;
  try {
    localStorage.removeItem(DRIVE_TOKEN_CACHE_KEY);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(DRIVE_SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
  notifyDriveTokenListeners();
}

export function isDriveAccessTokenExpiringSoon(bufferMs = 5 * 60 * 1000): boolean {
  if (!cachedAccessToken) {
    restorePersistedDriveAccessToken(auth.currentUser);
  }
  if (!cachedAccessToken) return true;
  if (!cachedAccessTokenExpiresAt) return false;
  return Date.now() >= cachedAccessTokenExpiresAt - bufferMs;
}

export function resetDriveCache(): void {
  clearAccessTokenOnly();
  lastSilentRefreshFailureAt = 0;
  cachedFolderId = null;
  cachedFolderLink = null;
  cachedFolderName = null;
  inflightStudyFolderPromise = null;
  inflightSubFolderPromises.clear();
  for (const key of Object.keys(cachedSubFolderIds)) {
    delete cachedSubFolderIds[key];
  }
}

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services indisponível fora do navegador.'));
  }
  const win = window as any;
  if (win.google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve();
  }
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    const onReady = () => {
      if (win.google?.accounts?.oauth2?.initTokenClient) {
        resolve();
      } else {
        gsiLoadPromise = null;
        reject(new Error('Google Identity Services não inicializou oauth2.'));
      }
    };
    const onError = () => {
      gsiLoadPromise = null;
      reject(new Error('Falha ao carregar https://accounts.google.com/gsi/client.'));
    };

    if (existing) {
      if (win.google?.accounts?.oauth2?.initTokenClient) {
        resolve();
        return;
      }
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener('error', onError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = onError;
    document.head.appendChild(script);
  });

  return gsiLoadPromise;
}

export async function ensureFirebaseSessionAlive(forceRefresh = false): Promise<User | null> {
  if (!auth.currentUser && typeof auth.authStateReady === 'function') {
    await auth.authStateReady().catch(() => {});
  }
  const user = auth.currentUser;
  if (!user) return null;
  try {
    await user.getIdToken(forceRefresh);
  } catch {
    // ignore token refresh failure when offline
  }
  return auth.currentUser;
}

export async function refreshDriveAccessTokenSilently(_options?: {
  email?: string | null;
  force?: boolean;
}): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // Never invoke google.accounts.oauth2.initTokenClient().requestAccessToken() automatically or in background,
  // because GIS opens a popup directly from the current preview origin and triggers "Erro 400: origin_mismatch"
  // on dynamic Cloud Run preview URLs, while also consuming the user gesture before Firebase signInWithPopup.
  if (!cachedAccessToken) {
    restorePersistedDriveAccessToken(auth.currentUser);
  }
  if (cachedAccessToken && (!cachedAccessTokenExpiresAt || Date.now() < cachedAccessTokenExpiresAt)) {
    return cachedAccessToken;
  }
  return null;
}

export const DRIVE_SYNC_TAG_VALUE = 'ce-v1';
export type DriveFileSyncOrigin = 'internal' | 'external' | 'external-modified';

export interface DriveFileSyncTagClassification {
  origin: DriveFileSyncOrigin;
  tagPresent: boolean;
  syncedAtMs: number;
  driveModifiedMs: number;
  externalDeltaMs: number;
  deviceId?: string;
  moduleTag?: string;
  sourceAction?: string;
  syncReason: string;
}

const SYNC_DEVICE_ID_STORAGE_KEY = 'ce_sync_device_id_v1';
const DRIVE_CLOCK_OFFSET_STORAGE_KEY = 'ce_drive_clock_offset_v1';
const INTERNAL_CREATION_TOLERANCE_MS = 30_000;
const EXTERNAL_MODIFICATION_TOLERANCE_MS = 120_000;
let memorySyncDeviceId: string | null = null;
let memoryDriveClockOffsetMs: number | null = null;

function getOrCreateSyncDeviceId(): string {
  if (memorySyncDeviceId) return memorySyncDeviceId;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = window.localStorage.getItem(SYNC_DEVICE_ID_STORAGE_KEY);
      if (existing && /^[a-z0-9_-]{6,24}$/i.test(existing)) {
        memorySyncDeviceId = existing;
        return existing;
      }
      const generated = `ce_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(SYNC_DEVICE_ID_STORAGE_KEY, generated);
      memorySyncDeviceId = generated;
      return generated;
    }
  } catch {
    // ignore storage failures
  }
  memorySyncDeviceId = `ce_${Math.random().toString(36).slice(2, 10)}`;
  return memorySyncDeviceId;
}

function getDriveClockOffsetMs(): number {
  if (memoryDriveClockOffsetMs !== null) return memoryDriveClockOffsetMs;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(DRIVE_CLOCK_OFFSET_STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && Math.abs(parsed) <= 7 * 24 * 60 * 60 * 1000) {
          memoryDriveClockOffsetMs = parsed;
          return parsed;
        }
      }
    }
  } catch {
    // ignore storage failures
  }
  memoryDriveClockOffsetMs = 0;
  return 0;
}

function calibrateDriveClockOffsetFromServerIso(serverIso: string | undefined, sentLocalMs: number): void {
  if (!serverIso || !sentLocalMs) return;
  const serverMs = Date.parse(serverIso);
  if (!Number.isFinite(serverMs) || serverMs <= 0) return;
  const offset = serverMs - sentLocalMs;
  if (Math.abs(offset) > 7 * 24 * 60 * 60 * 1000) return;
  memoryDriveClockOffsetMs = offset;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(DRIVE_CLOCK_OFFSET_STORAGE_KEY, String(Math.round(offset)));
    }
  } catch {
    // ignore storage failures
  }
}

export function buildInternalDriveAppProperties(options?: {
  moduleTag?: string;
  sourceAction?: string;
  timestampMs?: number;
}): Record<string, string> {
  const alignedMs = Math.round((options?.timestampMs || Date.now()) + getDriveClockOffsetMs());
  const props: Record<string, string> = {
    ceTag: DRIVE_SYNC_TAG_VALUE,
    ceSrc: 'app',
    ceAt: String(alignedMs),
    ceDev: getOrCreateSyncDeviceId().slice(0, 24),
  };
  if (options?.moduleTag) {
    const cleanMod = String(options.moduleTag)
      .replace(/[^\x20-\x7E]/g, '')
      .trim()
      .slice(0, 48);
    if (cleanMod) props.ceMod = cleanMod;
  }
  if (options?.sourceAction) {
    const cleanAct = String(options.sourceAction)
      .replace(/[^\x20-\x7E]/g, '')
      .trim()
      .slice(0, 24);
    if (cleanAct) props.ceAct = cleanAct;
  }
  return props;
}

export function classifyDriveFileSyncOrigin(
  df: Pick<DriveFileInfo, 'appProperties' | 'createdTime' | 'modifiedTime'>,
): DriveFileSyncTagClassification {
  const props = df.appProperties || {};
  const createdMs = Date.parse(df.createdTime || '') || 0;
  const driveModifiedMs = Date.parse(df.modifiedTime || df.createdTime || '') || 0;
  const tagPresent = props.ceTag === DRIVE_SYNC_TAG_VALUE;

  if (!tagPresent) {
    return {
      origin: 'external',
      tagPresent: false,
      syncedAtMs: 0,
      driveModifiedMs,
      externalDeltaMs: 0,
      syncReason: 'Sem etiqueta de sincronização interna (enviado externamente ao Drive)',
    };
  }

  const parsedCeAt = Number(props.ceAt || 0);
  const syncedAtMs =
    Number.isFinite(parsedCeAt) && parsedCeAt > 0 ? parsedCeAt : createdMs || driveModifiedMs;
  const untouchedSinceCreation =
    createdMs > 0 &&
    driveModifiedMs > 0 &&
    Math.abs(driveModifiedMs - createdMs) <= INTERNAL_CREATION_TOLERANCE_MS;
  const externalDeltaMs =
    syncedAtMs > 0 && driveModifiedMs > 0 ? Math.max(0, driveModifiedMs - syncedAtMs) : 0;
  const modifiedExternallyAfterSync =
    !untouchedSinceCreation &&
    syncedAtMs > 0 &&
    driveModifiedMs > syncedAtMs + EXTERNAL_MODIFICATION_TOLERANCE_MS;

  return {
    origin: modifiedExternallyAfterSync ? 'external-modified' : 'internal',
    tagPresent: true,
    syncedAtMs,
    driveModifiedMs,
    externalDeltaMs,
    deviceId: props.ceDev || undefined,
    moduleTag: props.ceMod || undefined,
    sourceAction: props.ceAct || undefined,
    syncReason: modifiedExternallyAfterSync
      ? 'Etiqueta presente, porém modificado externamente no Drive após a última sincronização do app'
      : 'Etiqueta interna verificada (criado/atualizado pelo app)',
  };
}

export function enrichDriveFileWithSyncTag(file: DriveFileInfo): DriveFileInfo {
  const info = classifyDriveFileSyncOrigin(file);
  return {
    ...file,
    syncOrigin: info.origin,
    syncTagPresent: info.tagPresent,
    syncedAtMs: info.syncedAtMs,
  };
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  ancestorFolderIds?: string[];
  subfolderName?: string;
  folderPath?: string;
  isInStudyFolder?: boolean;
  isInActiveFolder?: boolean;
  appProperties?: Record<string, string>;
  syncOrigin?: DriveFileSyncOrigin;
  syncTagPresent?: boolean;
  syncedAtMs?: number;
}

export interface DriveFolderSummary {
  id: string;
  name: string;
  fullPath: string;
  webViewLink?: string;
  isStudyRoot: boolean;
  isInsideStudyRoot: boolean;
  fileCount: number;
  studyFileCount: number;
  files: DriveFileInfo[];
}

interface RawDriveFolder {
  id: string;
  name: string;
  parents?: string[];
  webViewLink?: string;
}

const CANONICAL_SUBFOLDER_NAMES = [
  'Backups',
  'PDFs Pessoais',
  'Lei Seca',
  'Provas e Gabaritos',
  'Resumos e Mapas',
  'Discursivas',
  'Cronogramas',
  'Editais',
  'Datas e Locais',
];

async function driveFetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastRes: Response | null = null;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status !== 500 && res.status !== 502 && res.status !== 503 && res.status !== 504 && res.status !== 429)) {
        return res;
      }
      lastRes = res;
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) {
      const delayMs = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  if (lastRes) return lastRes;
  throw lastErr instanceof Error ? lastErr : new Error('Falha de rede ao acessar Google Drive.');
}

function parseGoogleDriveErrorMessage(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText);
    const msg = parsed?.error?.message;
    const code = parsed?.error?.code;
    if (msg) {
      return code ? `${msg} (HTTP ${code})` : String(msg);
    }
  } catch {
    // raw text not JSON
  }
  return rawText;
}

async function tryRefreshDriveTokenAfter401(): Promise<string | null> {
  clearAccessTokenOnly();
  return await refreshDriveAccessTokenSilently({
    email: auth.currentUser?.email || readLastGoogleEmail(),
    force: true,
  });
}

async function authorizedDriveFetch(
  url: string,
  buildInit: (token: string) => RequestInit,
  explicitToken?: string,
  options?: { withRetry?: boolean; retries?: number },
): Promise<{ res: Response; usedToken: string }> {
  let tokenToUse = explicitToken || (await getAccessToken()) || '';
  if (!tokenToUse) {
    throw new Error('TOKEN_EXPIRED: Sua sessão do Google Drive expirou. Reconecte sua conta Google.');
  }

  const exec = (t: string) =>
    options?.withRetry
      ? driveFetchWithRetry(url, buildInit(t), options.retries ?? 2)
      : fetch(url, buildInit(t));

  let res = await exec(tokenToUse);
  if (res.status === 401) {
    const renewed = await tryRefreshDriveTokenAfter401();
    if (renewed) {
      tokenToUse = renewed;
      res = await exec(tokenToUse);
    }
  }
  return { res, usedToken: tokenToUse };
}

async function fetchDriveFilesList(
  token: string,
  opts: {
    q: string;
    fields: string;
    fallbackFields?: string;
    pageSize?: number;
    orderBy?: string;
    pageToken?: string;
  },
): Promise<Response> {
  const baseParams = new URLSearchParams({
    q: opts.q,
    fields: opts.fields,
    pageSize: String(opts.pageSize || 100),
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  if (opts.orderBy) baseParams.set('orderBy', opts.orderBy);
  if (opts.pageToken) baseParams.set('pageToken', opts.pageToken);

  let activeToken = token;
  let primaryRes = await driveFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files?${baseParams.toString()}`,
    { headers: { Authorization: `Bearer ${activeToken}` } },
    2,
  );

  if (primaryRes.status === 401) {
    const renewed = await tryRefreshDriveTokenAfter401();
    if (renewed) {
      activeToken = renewed;
      primaryRes = await driveFetchWithRetry(
        `https://www.googleapis.com/drive/v3/files?${baseParams.toString()}`,
        { headers: { Authorization: `Bearer ${activeToken}` } },
        2,
      );
    }
  }

  if (primaryRes.ok || primaryRes.status === 401 || primaryRes.status === 403) {
    return primaryRes;
  }

  // Fallback for Drive v3 500 Internal Error caused by allDrives / complex fields / orderBy
  if (primaryRes.status >= 500) {
    const fallbackParams = new URLSearchParams({
      q: opts.q,
      fields: opts.fallbackFields || opts.fields,
      pageSize: String(Math.min(opts.pageSize || 100, 50)),
      corpora: 'user',
    });
    if (opts.pageToken) fallbackParams.set('pageToken', opts.pageToken);

    let fallbackRes = await driveFetchWithRetry(
      `https://www.googleapis.com/drive/v3/files?${fallbackParams.toString()}`,
      { headers: { Authorization: `Bearer ${activeToken}` } },
      1,
    );
    if (fallbackRes.status === 401) {
      const renewed = await tryRefreshDriveTokenAfter401();
      if (renewed) {
        activeToken = renewed;
        fallbackRes = await driveFetchWithRetry(
          `https://www.googleapis.com/drive/v3/files?${fallbackParams.toString()}`,
          { headers: { Authorization: `Bearer ${activeToken}` } },
          1,
        );
      }
    }
    if (fallbackRes.ok || fallbackRes.status === 401 || fallbackRes.status === 403) {
      return fallbackRes;
    }
    return fallbackRes;
  }

  return primaryRes;
}

async function throwDriveResponseError(res: Response, context: string): Promise<never> {
  if (res.status === 401) {
    clearAccessTokenOnly();
    throw new Error('TOKEN_EXPIRED: Sua sessão do Google Drive expirou. Reconecte sua conta Google.');
  }
  const err = await res.text();
  const errLower = err.toLowerCase();
  if (
    res.status === 403 &&
    (err.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
      err.includes('insufficientPermissions') ||
      errLower.includes('insufficient authentication scopes'))
  ) {
    clearAccessTokenOnly();
    throw new Error(
      'TOKEN_EXPIRED: O login atual não possui permissão do Google Drive. Clique em "Reconectar" e autorize o acesso ao Google Drive.',
    );
  }
  if (
    res.status === 403 &&
    (err.includes('insufficientFilePermissions') ||
      err.includes('appNotAuthorizedToFile') ||
      err.includes('forbidden'))
  ) {
    throw new Error(
      'DRIVE_FOLDER_PERMISSION: O aplicativo não tem permissão de escrita na pasta selecionada do Google Drive. Selecione ou autorize essa pasta pelo seletor oficial do Google Drive.',
    );
  }
  throw new Error(`${context}: ${parseGoogleDriveErrorMessage(err)}`);
}

export function formatGoogleAuthError(error: any): string {
  const code = String(error?.code || error?.type || '');
  const msg = String(error?.message || '');

  if (code === 'auth/unauthorized-domain' || msg.includes('auth/unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return `Domínio "${host}" não autorizado no Firebase Authentication (auth/unauthorized-domain). Adicione este domínio em Authentication → Settings → Authorized domains no Console do Firebase.`;
  }
  if (msg.toLowerCase().includes('origin_mismatch') || msg.toLowerCase().includes('redirect_uri_mismatch')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `Origem JavaScript "${origin}" não registrada no cliente OAuth 2.0 do Google Cloud (origin_mismatch). Adicione esta URL em Origens JavaScript autorizadas no Google Cloud Console.`;
  }
  if (
    code === 'auth/popup-blocked' ||
    code === 'popup_failed_to_open' ||
    msg.includes('popup_failed_to_open') ||
    msg.includes('popup-blocked')
  ) {
    return 'O navegador bloqueou a janela popup de login do Google. Libere pop-ups para este site (ou abra em uma aba comum) e tente novamente.';
  }
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'popup_closed' ||
    msg.includes('popup_closed') ||
    msg.includes('popup-closed-by-user')
  ) {
    return 'A janela de login do Google foi fechada antes de concluir a autenticação. Tente novamente e selecione sua conta.';
  }
  if (code === 'access_denied' || msg.includes('access_denied')) {
    return 'Autorização recusada na conta Google. Conceda acesso ao Google Drive para sincronizar seus backups.';
  }
  if (
    code === 'auth/network-request-failed' ||
    msg.includes('network-request-failed') ||
    msg.includes('Failed to fetch')
  ) {
    return 'Falha de rede ao conectar com o Firebase/Google. Verifique sua conexão e tente novamente.';
  }
  const codeSuffix = code ? ` (${code})` : '';
  return msg ? `${msg}${codeSuffix}` : `Não foi possível concluir o login com o Google${codeSuffix}.`;
}

export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void,
) => {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      rememberLastGoogleEmail(user.email);
      const token = cachedAccessToken || restorePersistedDriveAccessToken(user);
      notifyDriveTokenListeners();
      if (onAuthSuccess) {
        onAuthSuccess(user, token);
      }
    } else if (!isSigningIn) {
      resetDriveCache();
      if (onAuthFailure) {
        onAuthFailure();
      }
    }
  });
};

export const googleSignIn = async (options?: {
  loginHint?: string | null;
  forceAccountPicker?: boolean;
}): Promise<{ user: User; accessToken: string } | null> => {
  const hint =
    (options?.loginHint || (!options?.forceAccountPicker ? auth.currentUser?.email || readLastGoogleEmail() : null) || null)?.trim() ||
    undefined;

  const provider = new GoogleAuthProvider();
  DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: options?.forceAccountPicker ? 'select_account consent' : hint ? 'consent' : 'select_account consent',
    ...(hint ? { login_hint: hint } : {}),
  });

  try {
    isSigningIn = true;
    // Call signInWithPopup synchronously on the first tick of the user click gesture
    // (browserLocalPersistence is already configured at module initialization)
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken =
      credential?.accessToken ||
      String((result as any)?._tokenResponse?.oauthAccessToken || '').trim() ||
      '';

    rememberLastGoogleEmail(result.user.email);
    if (accessToken) {
      clearDrivePermissionBlockedFiles();
      persistDriveAccessToken(accessToken, Date.now() + DRIVE_TOKEN_DEFAULT_TTL_MS, result.user);
    }

    cachedFolderId = null;
    cachedFolderLink = null;
    for (const key of Object.keys(cachedSubFolderIds)) {
      delete cachedSubFolderIds[key];
    }

    return { user: result.user, accessToken };
  } catch (error: any) {
    console.error('Erro de login com Firebase Google Auth:', error);
    const formatted = new Error(formatGoogleAuthError(error)) as Error & { code?: string };
    formatted.code = error?.code || error?.type;
    throw formatted;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (options?: {
  allowSilentRefresh?: boolean;
  forceRefresh?: boolean;
  loginHint?: string | null;
}): Promise<string | null> => {
  if (!options?.forceRefresh) {
    if (!cachedAccessToken && auth.currentUser) {
      restorePersistedDriveAccessToken(auth.currentUser);
    }
    if (cachedAccessToken && !isDriveAccessTokenExpiringSoon(2 * 60 * 1000)) {
      return cachedAccessToken;
    }
  }

  if (options?.allowSilentRefresh !== false && (auth.currentUser || readLastGoogleEmail())) {
    const renewed = await refreshDriveAccessTokenSilently({
      email: options?.loginHint || auth.currentUser?.email,
      force: options?.forceRefresh,
    });
    if (renewed) {
      return renewed;
    }
  }

  if (
    !options?.forceRefresh &&
    cachedAccessToken &&
    (!cachedAccessTokenExpiresAt || Date.now() < cachedAccessTokenExpiresAt - 15_000)
  ) {
    return cachedAccessToken;
  }

  return null;
};

export const googleSignOut = async (): Promise<void> => {
  const tokenToRevoke = cachedAccessToken;
  clearRememberedGoogleEmail();
  resetDriveCache();
  await signOut(auth);
  try {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (tokenToRevoke && win?.google?.accounts?.oauth2?.revoke) {
      win.google.accounts.oauth2.revoke(tokenToRevoke, () => {});
    }
  } catch {
    // ignore revoke errors
  }
};

/**
 * Fetches all non-trashed folders visible in the user's Google Drive account and builds path maps.
 */
interface DriveFolderGraphResult {
  foldersById: Map<string, RawDriveFolder>;
  fullPathById: Map<string, string>;
  ancestorIdsByFolderId: Map<string, string[]>;
  studyRootIds: Set<string>;
  studyDescendantIds: Set<string>;
  canonicalCategoryByFolderId: Map<string, string>;
}

const inflightFolderGraphByToken = new Map<string, Promise<DriveFolderGraphResult>>();

async function fetchDriveFolderGraph(token: string): Promise<DriveFolderGraphResult> {
  const inflight = inflightFolderGraphByToken.get(token);
  if (inflight) return inflight;

  const task = (async (): Promise<DriveFolderGraphResult> => {
    const foldersById = new Map<string, RawDriveFolder>();
    const folderQuery = `mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

    let pageToken = '';
    let pages = 0;

    try {
      do {
        const res = await fetchDriveFilesList(token, {
          q: folderQuery,
          fields: 'nextPageToken,files(id,name,parents,webViewLink)',
          fallbackFields: 'nextPageToken,files(id,name,parents)',
          pageSize: 100,
          pageToken: pageToken || undefined,
        });

        if (!res.ok) {
          if (res.status === 401) {
            await throwDriveResponseError(res, 'Sessão expirada ao listar pastas do Google Drive');
          }
          if (res.status === 403) {
            const errText = await res.clone().text().catch(() => '');
            if (
              errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
              errText.includes('insufficientPermissions') ||
              errText.toLowerCase().includes('insufficient authentication scopes')
            ) {
              clearAccessTokenOnly();
              throw new Error(
                'TOKEN_EXPIRED: O login atual não possui permissão do Google Drive. Clique em "Reconectar" e autorize o acesso ao Google Drive.',
              );
            }
          }
          // Non-fatal fallback: try loading only study folder root + immediate subfolders below
          console.warn('Listagem global de pastas no Drive falhou com status', res.status);
          break;
        }

        const data = await res.json();
        const list = (data.files || []) as RawDriveFolder[];
        list.forEach((f) => {
          foldersById.set(f.id, f);
        });
        pageToken = data.nextPageToken || '';
        pages += 1;
      } while (pageToken && pages < 10);
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        throw err;
      }
      console.warn('Falha ao mapear todas as pastas do Drive, usando pasta de estudo ativa:', err);
    }

    // Fallback: ensure active study folder and its subfolders are present if global folder listing failed/partial
    if (foldersById.size === 0) {
      try {
        const root = await getOrCreateStudyFolder(token);
        foldersById.set(root.id, {
          id: root.id,
          name: root.name,
          webViewLink: root.webViewLink,
        });
        const childRes = await fetchDriveFilesList(token, {
          q: `mimeType = 'application/vnd.google-apps.folder' and '${root.id}' in parents and trashed = false`,
          fields: 'files(id,name,parents,webViewLink)',
          fallbackFields: 'files(id,name,parents)',
          pageSize: 50,
        });
        if (childRes.ok) {
          const childData = await childRes.json();
          ((childData.files || []) as RawDriveFolder[]).forEach((f) => {
            foldersById.set(f.id, f);
          });
        }
      } catch (innerErr: any) {
        if (String(innerErr?.message || '').includes('TOKEN_EXPIRED')) {
          throw innerErr;
        }
      }
    }

  const fullPathById = new Map<string, string>();
  const ancestorIdsByFolderId = new Map<string, string[]>();
  const studyRootIds = new Set<string>();
  const studyDescendantIds = new Set<string>();
  const canonicalCategoryByFolderId = new Map<string, string>();

  const pref = getPreferredStudyFolder();
  const normalizedDefaultName = DRIVE_FOLDER_NAME.toLowerCase();
  const normalizedPrefName = pref.name.toLowerCase();
  const canonicalLowerMap = new Map(CANONICAL_SUBFOLDER_NAMES.map((n) => [n.toLowerCase(), n]));

  for (const folder of foldersById.values()) {
    const lower = folder.name.trim().toLowerCase();
    if (
      (pref.id && folder.id === pref.id) ||
      (DEFAULT_STUDY_FOLDER_ID && folder.id === DEFAULT_STUDY_FOLDER_ID) ||
      lower === normalizedPrefName ||
      lower === normalizedDefaultName
    ) {
      studyRootIds.add(folder.id);
    }
  }

  const resolveInfo = (folderId: string) => {
    const segments: string[] = [];
    const ancestors: string[] = [];
    const visited = new Set<string>();
    let cursorId: string | undefined = folderId;
    let isInsideStudy = false;
    let canonicalCat: string | undefined;

    while (cursorId && !visited.has(cursorId)) {
      visited.add(cursorId);
      ancestors.push(cursorId);
      const node = foldersById.get(cursorId);
      if (!node) break;
      segments.unshift(node.name);
      if (studyRootIds.has(node.id)) {
        isInsideStudy = true;
      }
      const lower = node.name.trim().toLowerCase();
      if (!canonicalCat && canonicalLowerMap.has(lower)) {
        canonicalCat = canonicalLowerMap.get(lower);
      }
      cursorId = node.parents?.[0];
    }

    const path = segments.join(' / ');
    fullPathById.set(folderId, path);
    ancestorIdsByFolderId.set(folderId, ancestors);
    if (isInsideStudy) {
      studyDescendantIds.add(folderId);
      if (canonicalCat) {
        canonicalCategoryByFolderId.set(folderId, canonicalCat);
      }
    }
  };

  for (const folderId of foldersById.keys()) {
    resolveInfo(folderId);
  }

  return {
    foldersById,
    fullPathById,
    ancestorIdsByFolderId,
    studyRootIds,
    studyDescendantIds,
    canonicalCategoryByFolderId,
  };
  })();

  inflightFolderGraphByToken.set(token, task);
  try {
    return await task;
  } finally {
    inflightFolderGraphByToken.delete(token);
  }
}

/**
 * Fetches metadata for a specific Google Drive folder by ID or URL.
 */
export async function getDriveFolderMetadata(
  folderIdOrUrl: string,
  token?: string,
): Promise<{ id: string; name: string; webViewLink?: string } | null> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta Google primeiro.');
  }

  const extractedId = extractDriveFolderId(folderIdOrUrl);
  if (!extractedId) return null;

  const { res } = await authorizedDriveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(extractedId)}?fields=id,name,mimeType,webViewLink,trashed&supportsAllDrives=true`,
    (t) => ({ headers: { Authorization: `Bearer ${t}` } }),
    activeToken,
  );

  if (res.status === 401) {
    await throwDriveResponseError(res, 'Sessão expirada ao consultar pasta do Drive');
  }
  if (res.status === 403) {
    const errText = await res.clone().text().catch(() => '');
    if (
      errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
      errText.includes('insufficientPermissions') ||
      errText.toLowerCase().includes('insufficient authentication scopes')
    ) {
      clearAccessTokenOnly();
      throw new Error(
        'TOKEN_EXPIRED: O login atual não possui permissão do Google Drive. Clique em "Reconectar" e autorize o acesso ao Google Drive.',
      );
    }
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    id: string;
    name: string;
    mimeType?: string;
    webViewLink?: string;
    trashed?: boolean;
  };
  if (data.trashed || data.mimeType !== 'application/vnd.google-apps.folder') {
    return null;
  }
  return { id: data.id, name: data.name, webViewLink: data.webViewLink };
}

/**
 * Verifies whether the OAuth token currently has drive.file write permission inside `folderId`.
 * Creates and immediately removes a 0-byte probe file to test actual API write permission.
 */
export async function verifyDriveFolderWritable(folderId: string, token?: string): Promise<boolean> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta Google primeiro.');
  }

  const { res, usedToken } = await authorizedDriveFetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',
    (t) => ({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '.central_estudos_write_check',
        mimeType: 'text/plain',
        parents: [folderId],
      }),
    }),
    activeToken,
  );

  if (res.status === 401) {
    await throwDriveResponseError(res, 'Sessão expirada ao testar permissão da pasta');
  }
  if (res.status === 403) {
    const errText = await res.clone().text().catch(() => '');
    if (
      errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
      errText.includes('insufficientPermissions') ||
      errText.toLowerCase().includes('insufficient authentication scopes')
    ) {
      clearAccessTokenOnly();
      throw new Error(
        'TOKEN_EXPIRED: O login atual não possui permissão do Google Drive. Clique em "Reconectar" e autorize o acesso ao Google Drive.',
      );
    }
    return false;
  }
  if (!res.ok) {
    return false;
  }

  try {
    const created = (await res.json()) as { id?: string };
    if (created?.id) {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(created.id)}?supportsAllDrives=true`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${usedToken}` },
        },
      ).catch(() => {});
    }
  } catch {
    // ignore cleanup failures
  }
  return true;
}

/**
 * Finds or creates the active dedicated study folder in user's Google Drive.
 * Respects user-selected folder preference when configured; falls back to "Central de Estudos - Materiais".
 */
export async function getOrCreateStudyFolder(token?: string): Promise<{ id: string; name: string; webViewLink?: string }> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('Usuário não autenticado no Google.');
  }

  const pref = getPreferredStudyFolder();

  if (cachedFolderId) {
    return {
      id: cachedFolderId,
      name: cachedFolderName || pref.name,
      webViewLink: cachedFolderLink || undefined,
    };
  }

  if (inflightStudyFolderPromise) {
    return inflightStudyFolderPromise;
  }

  const task = (async (): Promise<{ id: string; name: string; webViewLink?: string }> => {
    let fallbackTargetName = pref.name || DRIVE_FOLDER_NAME;

    if (pref.id) {
      const byId = await getDriveFolderMetadata(pref.id, activeToken);
      if (byId) {
        if (byId.name) {
          fallbackTargetName = byId.name;
          rememberKnownStudyDriveFolderName(byId.name);
        }
        const isWritable = await verifyDriveFolderWritable(byId.id, activeToken).catch(() => false);
        if (isWritable) {
          const link = byId.webViewLink || `https://drive.google.com/drive/folders/${byId.id}`;
          cachedFolderId = byId.id;
          cachedFolderLink = link;
          cachedFolderName = byId.name;
          if (byId.name && byId.name !== pref.name) {
            try {
              localStorage.setItem(DRIVE_FOLDER_PREF_KEY, JSON.stringify({ id: byId.id, name: byId.name }));
            } catch {
              // ignore storage errors
            }
          }
          return { id: byId.id, name: byId.name, webViewLink: link };
        }
      }
    }

    const targetName = fallbackTargetName || DRIVE_FOLDER_NAME;
    const escapedName = targetName.replace(/'/g, "\\'");
    const searchRes = await fetchDriveFilesList(activeToken, {
      q: `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`,
      fields: 'files(id,name,webViewLink,createdTime)',
      fallbackFields: 'files(id,name,createdTime)',
      orderBy: 'createdTime asc',
      pageSize: 20,
    });

    if (!searchRes.ok) {
      await throwDriveResponseError(searchRes, 'Falha ao buscar pasta no Drive');
    }

    const searchData = await searchRes.json();
    const matches = (searchData.files || []) as Array<{ id: string; name: string; webViewLink?: string }>;
    const writableMatches: Array<{ id: string; name: string; webViewLink?: string }> = [];
    for (const folder of matches) {
      if (pref.id && folder.id === pref.id) continue;
      const writable = await verifyDriveFolderWritable(folder.id, activeToken);
      if (writable) {
        writableMatches.push(folder);
      }
    }

    if (writableMatches.length > 0) {
      let chosen = writableMatches[0];
      if (writableMatches.length > 1) {
        // Prefer the matching writable folder that already holds canonical sync or Backups JSON files
        for (const candidate of writableMatches) {
          const backupsCheckRes = await fetchDriveFilesList(activeToken, {
            q: `mimeType = 'application/vnd.google-apps.folder' and name = 'Backups' and '${candidate.id}' in parents and trashed = false`,
            fields: 'files(id,name)',
            pageSize: 5,
          });
          if (backupsCheckRes.ok) {
            const bData = await backupsCheckRes.json();
            const bFolder = bData.files?.[0];
            if (bFolder?.id) {
              const syncCheckRes = await fetchDriveFilesList(activeToken, {
                q: `'${bFolder.id}' in parents and (name = '${CLOUD_SYNC_FILENAME}' or name contains 'backup_incremental_central_estudos' or name contains 'backup_central_estudos') and trashed = false`,
                fields: 'files(id,name)',
                pageSize: 10,
              });
              if (syncCheckRes.ok) {
                const sData = await syncCheckRes.json();
                const filesInBackups = (sData.files || []) as Array<{ id: string; name?: string }>;
                if (filesInBackups.some((f) => f.name === CLOUD_SYNC_FILENAME)) {
                  chosen = candidate;
                  break;
                }
                if (filesInBackups.length > 0) {
                  chosen = candidate;
                }
              }
              if (chosen === writableMatches[0]) {
                chosen = candidate;
              }
            }
          }
        }
      }

      const link = chosen.webViewLink || `https://drive.google.com/drive/folders/${chosen.id}`;
      cachedFolderId = chosen.id;
      cachedFolderLink = link;
      cachedFolderName = chosen.name;
      rememberKnownStudyDriveFolderName(chosen.name);
      try {
        localStorage.setItem(DRIVE_FOLDER_PREF_KEY, JSON.stringify({ id: chosen.id, name: chosen.name }));
      } catch {
        // ignore storage errors
      }
      return { id: chosen.id, name: chosen.name, webViewLink: link };
    }

    const { res: createRes } = await authorizedDriveFetch(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink',
      (t) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: targetName,
          mimeType: 'application/vnd.google-apps.folder',
          description: 'Pasta do acervo de estudos e materiais da Central de Estudos.',
        }),
      }),
      activeToken,
    );

    if (!createRes.ok) {
      await throwDriveResponseError(createRes, 'Falha ao criar pasta no Drive');
    }

    const newFolder = (await createRes.json()) as { id: string; name?: string; webViewLink?: string };
    const resolvedName = newFolder.name || targetName;
    const link = newFolder.webViewLink || `https://drive.google.com/drive/folders/${newFolder.id}`;
    cachedFolderId = newFolder.id;
    cachedFolderLink = link;
    cachedFolderName = resolvedName;
    rememberKnownStudyDriveFolderName(resolvedName);
    try {
      localStorage.setItem(DRIVE_FOLDER_PREF_KEY, JSON.stringify({ id: newFolder.id, name: resolvedName }));
    } catch {
      // ignore storage errors
    }
    return { id: newFolder.id, name: resolvedName, webViewLink: link };
  })();

  inflightStudyFolderPromise = task;
  try {
    return await task;
  } finally {
    inflightStudyFolderPromise = null;
  }
}

async function getOrCreateSingleSubFolder(
  parentId: string,
  segmentName: string,
  activeToken: string,
): Promise<string> {
  const cleanSegment = segmentName.trim();
  if (!cleanSegment) return parentId;

  const cacheKey = `${parentId}::${cleanSegment.toLowerCase()}`;
  if (cachedSubFolderIds[cacheKey]) {
    return cachedSubFolderIds[cacheKey];
  }

  const inflight = inflightSubFolderPromises.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const task = (async () => {
    const escapedSegment = cleanSegment.replace(/'/g, "\\'");
    const query = encodeURIComponent(
      `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedSegment}' and '${parentId}' in parents and trashed = false`,
    );
    const { res: searchRes, usedToken } = await authorizedDriveFetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&includeItemsFromAllDrives=true&supportsAllDrives=true&orderBy=createdTime asc&pageSize=10`,
      (t) => ({ headers: { Authorization: `Bearer ${t}` } }),
      activeToken,
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const subId = searchData.files[0].id as string;
        cachedSubFolderIds[cacheKey] = subId;
        return subId;
      }
    } else if (searchRes.status === 401) {
      await throwDriveResponseError(searchRes, 'Sessão expirada ao buscar subpasta');
    }

    const { res: createRes } = await authorizedDriveFetch(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name',
      (t) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: cleanSegment,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        }),
      }),
      usedToken,
    );

    if (!createRes.ok) {
      await throwDriveResponseError(createRes, `Falha ao criar subpasta "${cleanSegment}" no Drive`);
    }

    const newSub = await createRes.json();
    cachedSubFolderIds[cacheKey] = newSub.id;
    return newSub.id as string;
  })();

  inflightSubFolderPromises.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inflightSubFolderPromises.delete(cacheKey);
  }
}

/**
 * Finds or creates a subfolder (or nested subfolder path) inside Central de Estudos folder.
 */
export async function getOrCreateStudySubFolder(
  parentId: string,
  subfolderName: string | string[],
  token?: string,
): Promise<string> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) throw new Error('Usuário não autenticado no Google.');

  const segments = (Array.isArray(subfolderName) ? subfolderName : [subfolderName])
    .map((s) => s.trim())
    .filter(Boolean);

  let currentParentId = parentId;
  for (const seg of segments) {
    currentParentId = await getOrCreateSingleSubFolder(currentParentId, seg, activeToken);
  }
  return currentParentId;
}

/**
 * Synchronizes all canonical study subfolders inside the active Drive folder in minimal API calls,
 * caching existing folder IDs and creating any missing canonical subfolders.
 */
export async function syncStudySubFoldersInDrive(
  parentId: string,
  token?: string,
): Promise<Record<string, string>> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) throw new Error('Usuário não autenticado no Google.');

  const result: Record<string, string> = {};
  const listRes = await fetchDriveFilesList(activeToken, {
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 50,
  });

  if (listRes.ok) {
    const data = await listRes.json();
    const existing = (data.files || []) as Array<{ id: string; name: string }>;
    for (const f of existing) {
      const clean = f.name.trim();
      if (!clean) continue;
      cachedSubFolderIds[`${parentId}::${clean.toLowerCase()}`] = f.id;
      result[clean] = f.id;
    }
  } else if (listRes.status === 401) {
    await throwDriveResponseError(listRes, 'Sessão expirada ao sincronizar pastas do Drive');
  }

  for (const name of CANONICAL_SUBFOLDER_NAMES) {
    if (!result[name]) {
      try {
        const subId = await getOrCreateSingleSubFolder(parentId, name, activeToken);
        result[name] = subId;
      } catch (err: any) {
        if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
          throw err;
        }
      }
    }
  }

  return result;
}

/**
 * Uploads a file (PDF, TXT, JSON, etc.) to the dedicated Google Drive folder or subfolder using multipart upload.
 */
export async function uploadFileToDrive(
  fileOrBlob: File | Blob,
  filename: string,
  token?: string,
  subfolderName?: string | string[],
  options?: { existingFileId?: string; moduleTag?: string; sourceAction?: string },
): Promise<DriveFileInfo> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta do Google Drive primeiro.');
  }

  const parentFolder = await getOrCreateStudyFolder(activeToken);
  let targetFolderId = parentFolder.id;

  if (subfolderName && (Array.isArray(subfolderName) ? subfolderName.length > 0 : Boolean(subfolderName.trim()))) {
    targetFolderId = await getOrCreateStudySubFolder(parentFolder.id, subfolderName, activeToken);
  }

  let existingFileId = options?.existingFileId ? options.existingFileId.replace(/^drive_/, '').trim() : '';
  if (!existingFileId) {
    try {
      const escapedName = filename.replace(/'/g, "\\'");
      const searchRes = await fetchDriveFilesList(activeToken, {
        q: `'${targetFolderId}' in parents and name = '${escapedName}' and trashed = false`,
        fields: 'files(id,name,modifiedTime,appProperties)',
        fallbackFields: 'files(id,name,modifiedTime)',
        pageSize: 5,
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        existingFileId = searchData.files?.[0]?.id || '';
      }
    } catch {
      // fallback to POST if lookup fails
    }
  }

  const sentLocalMs = Date.now();
  const resolvedSubfolderLabel = Array.isArray(subfolderName)
    ? subfolderName[0]
    : subfolderName;
  const appProperties = buildInternalDriveAppProperties({
    moduleTag: options?.moduleTag || resolvedSubfolderLabel,
    sourceAction: options?.sourceAction || (existingFileId ? 'update' : 'upload'),
    timestampMs: sentLocalMs,
  });

  const metadata: Record<string, any> = {
    name: filename,
    description: `Arquivo sincronizado pela Central de Estudos em ${new Date().toLocaleString('pt-BR')}`,
    appProperties,
  };
  if (!existingFileId) {
    metadata.parents = [targetFolderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const mimeType = fileOrBlob.type || 'application/pdf';
  const buffer = await fileOrBlob.arrayBuffer();

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata,
  )}`;
  const mediaHeader = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const enc = new TextEncoder();
  const part1 = enc.encode(metadataPart);
  const part2 = enc.encode(mediaHeader);
  const part3 = enc.encode(closeDelimiter);

  const fullPayload = new Uint8Array(part1.length + part2.length + buffer.byteLength + part3.length);
  fullPayload.set(part1, 0);
  fullPayload.set(part2, part1.length);
  fullPayload.set(new Uint8Array(buffer), part1.length + part2.length);
  fullPayload.set(part3, part1.length + part2.length + buffer.byteLength);

  const uploadUrl = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties';

  const { res } = await authorizedDriveFetch(
    uploadUrl,
    (t) => ({
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: fullPayload,
    }),
    activeToken,
  );

  if (!res.ok) {
    await throwDriveResponseError(res, 'Falha no upload para o Google Drive');
  }

  const saved = (await res.json()) as DriveFileInfo;
  calibrateDriveClockOffsetFromServerIso(saved.modifiedTime || saved.createdTime, sentLocalMs);
  return enrichDriveFileWithSyncTag(saved);
}

/**
 * Creates or updates (upserts) a UTF-8 .txt file inside a specific study subfolder in Google Drive,
 * avoiding duplicate files when a weekly schedule, contest registration, or edital .txt is updated.
 */
export async function upsertTextFileInDriveSubFolder(
  content: string,
  filename: string,
  subfolderName: string | string[],
  token?: string,
  options?: { moduleTag?: string },
): Promise<DriveFileInfo> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta do Google Drive primeiro.');
  }

  const parentFolder = await getOrCreateStudyFolder(activeToken);
  const targetFolderId = await getOrCreateStudySubFolder(parentFolder.id, subfolderName, activeToken);

  const escapedName = filename.replace(/'/g, "\\'");
  const searchRes = await fetchDriveFilesList(activeToken, {
    q: `'${targetFolderId}' in parents and name = '${escapedName}' and trashed = false`,
    fields: 'files(id,name,modifiedTime,appProperties)',
    fallbackFields: 'files(id,name,modifiedTime)',
    pageSize: 5,
  });

  let existingFileId: string | null = null;
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    existingFileId = searchData.files?.[0]?.id || null;
  }

  const boundary = '-------314159265358979323846TxtUpsert';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const sentLocalMs = Date.now();
  const resolvedSubfolderLabel = Array.isArray(subfolderName)
    ? subfolderName[0]
    : subfolderName;
  const appProperties = buildInternalDriveAppProperties({
    moduleTag: options?.moduleTag || resolvedSubfolderLabel,
    sourceAction: existingFileId ? 'txt-update' : 'txt-upload',
    timestampMs: sentLocalMs,
  });

  const metadata: Record<string, any> = {
    name: filename,
    mimeType: 'text/plain',
    description: `Arquivo TXT sincronizado pela Central de Estudos em ${new Date().toLocaleString('pt-BR')}`,
    appProperties,
  };
  if (!existingFileId) {
    metadata.parents = [targetFolderId];
  }

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata,
  )}`;
  const mediaPart = `${delimiter}Content-Type: text/plain; charset=UTF-8\r\n\r\n${content}${closeDelimiter}`;
  const multipartBody = metadataPart + mediaPart;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties';

  const { res } = await authorizedDriveFetch(
    url,
    (t) => ({
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }),
    activeToken,
    { withRetry: true },
  );

  if (!res.ok) {
    await throwDriveResponseError(res, `Falha ao salvar arquivo TXT "${filename}" no Google Drive`);
  }

  const saved = (await res.json()) as DriveFileInfo;
  calibrateDriveClockOffsetFromServerIso(saved.modifiedTime || saved.createdTime, sentLocalMs);
  return enrichDriveFileWithSyncTag(saved);
}

/**
 * Stamps or refreshes the internal sync-tag metadata on an existing Google Drive file without changing its content.
 */
export async function stampDriveFileSyncTag(
  fileId: string,
  token?: string,
  moduleTag?: string,
): Promise<DriveFileInfo | null> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken || !fileId) return null;

  const sentLocalMs = Date.now();
  const appProperties = buildInternalDriveAppProperties({
    moduleTag,
    sourceAction: 'tag-stamp',
    timestampMs: sentLocalMs,
  });

  try {
    const { res } = await authorizedDriveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties`,
      (t) => ({
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ appProperties }),
      }),
      activeToken,
    );
    if (!res.ok) return null;
    const saved = (await res.json()) as DriveFileInfo;
    calibrateDriveClockOffsetFromServerIso(saved.modifiedTime || saved.createdTime, sentLocalMs);
    return enrichDriveFileWithSyncTag(saved);
  } catch {
    return null;
  }
}

/**
 * Lists ALL non-trashed files visible across the user's Google Drive (all study folders, nested subfolders, and account folders).
 * Throws TOKEN_EXPIRED on 401 so callers can reconnect cleanly instead of assuming Drive is empty.
 */
export async function listAllStudyFilesInDrive(
  token?: string,
  prefetchedGraph?: DriveFolderGraphResult,
): Promise<DriveFileInfo[]> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta Google para listar os arquivos do Drive.');
  }

  const graph = prefetchedGraph || (await fetchDriveFolderGraph(activeToken));
  const filesQuery = `mimeType != 'application/vnd.google-apps.folder' and mimeType != 'application/vnd.google-apps.shortcut' and trashed = false`;

  const allFiles: DriveFileInfo[] = [];
  let pageToken = '';
  let pages = 0;

  const appendFiles = (files: DriveFileInfo[]) => {
    const existingIds = new Set(allFiles.map((item) => item.id));
    files.forEach((f) => {
      if (existingIds.has(f.id)) return;
      existingIds.add(f.id);
      const parentId = f.parents?.[0];
      const parentFolder = parentId ? graph.foldersById.get(parentId) : undefined;
      const folderPath = parentId ? graph.fullPathById.get(parentId) || parentFolder?.name : 'Meu Drive (Raiz)';
      const isInStudyFolder = Boolean(parentId && graph.studyDescendantIds.has(parentId));
      const canonicalCat = parentId ? graph.canonicalCategoryByFolderId.get(parentId) : undefined;
      const ancestorFolderIds = parentId ? graph.ancestorIdsByFolderId.get(parentId) || [parentId] : [];

      allFiles.push(
        enrichDriveFileWithSyncTag({
          ...f,
          ancestorFolderIds,
          subfolderName: canonicalCat || parentFolder?.name,
          folderPath,
          isInStudyFolder,
        }),
      );
    });
  };

  let globalQueryFailed5xx = false;

  do {
    const res = await fetchDriveFilesList(activeToken, {
      q: filesQuery,
      fields: 'nextPageToken,files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties)',
      fallbackFields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      pageToken: pageToken || undefined,
    });

    if (!res.ok) {
      if (res.status >= 500 && graph.foldersById.size > 0) {
        console.warn('Listagem global de arquivos retornou 5xx; usando busca por pastas de estudo.');
        globalQueryFailed5xx = true;
        break;
      }
      await throwDriveResponseError(res, 'Falha ao listar arquivos do Google Drive');
    }

    const data = await res.json();
    appendFiles((data.files || []) as DriveFileInfo[]);

    pageToken = data.nextPageToken || '';
    pages += 1;
  } while (pageToken && pages < 10);

  if (globalQueryFailed5xx) {
    const targetFolderIds = graph.studyDescendantIds.size > 0
      ? Array.from(graph.studyDescendantIds)
      : Array.from(graph.foldersById.keys()).slice(0, 20);

    for (const folderId of targetFolderIds) {
      const folderRes = await fetchDriveFilesList(activeToken, {
        q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties)',
        fallbackFields: 'files(id,name,mimeType,size,createdTime,modifiedTime,parents)',
        pageSize: 100,
      });
      if (folderRes.ok) {
        const folderData = await folderRes.json();
        appendFiles((folderData.files || []) as DriveFileInfo[]);
      }
    }
  }

  return allFiles;
}

/**
 * Inspects all folders associated with the user's Google Drive account along with their contained files.
 */
export async function listDriveFoldersOverview(token?: string): Promise<DriveFolderSummary[]> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta Google para verificar as pastas do Drive.');
  }

  const graph = await fetchDriveFolderGraph(activeToken);
  const files = await listAllStudyFilesInDrive(activeToken, graph);

  const filesByParent = new Map<string, DriveFileInfo[]>();
  const rootFiles: DriveFileInfo[] = [];

  for (const f of files) {
    const parentId = f.parents?.[0];
    if (parentId && graph.foldersById.has(parentId)) {
      const arr = filesByParent.get(parentId) || [];
      arr.push(f);
      filesByParent.set(parentId, arr);
    } else {
      rootFiles.push(f);
    }
  }

  const isStudyCandidateFile = (f: DriveFileInfo) =>
    f.mimeType === 'application/pdf' ||
    f.mimeType === 'application/vnd.google-apps.document' ||
    f.mimeType.startsWith('text/') ||
    /\.(pdf|txt|docx?|md|json)$/i.test(f.name);

  const summaries: DriveFolderSummary[] = [];
  for (const folder of graph.foldersById.values()) {
    const folderFiles = filesByParent.get(folder.id) || [];
    summaries.push({
      id: folder.id,
      name: folder.name,
      fullPath: graph.fullPathById.get(folder.id) || folder.name,
      webViewLink: folder.webViewLink,
      isStudyRoot: graph.studyRootIds.has(folder.id),
      isInsideStudyRoot: graph.studyDescendantIds.has(folder.id),
      fileCount: folderFiles.length,
      studyFileCount: folderFiles.filter(isStudyCandidateFile).length,
      files: folderFiles,
    });
  }

  if (rootFiles.length > 0) {
    summaries.push({
      id: 'root',
      name: 'Meu Drive (Raiz)',
      fullPath: 'Meu Drive (Raiz)',
      isStudyRoot: false,
      isInsideStudyRoot: false,
      fileCount: rootFiles.length,
      studyFileCount: rootFiles.filter(isStudyCandidateFile).length,
      files: rootFiles,
    });
  }

  return summaries.sort((a, b) => {
    if (a.isStudyRoot !== b.isStudyRoot) return a.isStudyRoot ? -1 : 1;
    if (a.isInsideStudyRoot !== b.isInsideStudyRoot) return a.isInsideStudyRoot ? -1 : 1;
    if (a.fileCount !== b.fileCount) return b.fileCount - a.fileCount;
    return a.fullPath.localeCompare(b.fullPath, 'pt-BR');
  });
}

/**
 * Lists all study files currently in the user's Google Drive.
 */
export async function listStudyFilesFromDrive(token?: string): Promise<DriveFileInfo[]> {
  return listAllStudyFilesInDrive(token);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function encodeDriveSnapshotJson(payload: unknown): Promise<string> {
  const plainJson = JSON.stringify(payload);
  if (
    plainJson.length < 8192 ||
    typeof CompressionStream === 'undefined' ||
    !payload ||
    typeof payload !== 'object'
  ) {
    return plainJson;
  }
  try {
    const rawBytes = new TextEncoder().encode(plainJson);
    const stream = new Blob([rawBytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressedBuf = await new Response(stream).arrayBuffer();
    const compressedBytes = new Uint8Array(compressedBuf);
    if (compressedBytes.length >= rawBytes.length * 0.92) {
      return plainJson;
    }
    const obj = payload as Record<string, unknown>;
    return JSON.stringify({
      version: 4,
      encoding: 'gzip-base64',
      app: obj.app || 'Central de Estudos',
      updatedAt: obj.updatedAt,
      exportedAt: obj.exportedAt,
      contentHash: obj.contentHash,
      userEmail: obj.userEmail,
      uncompressedBytes: rawBytes.length,
      payloadBase64: bytesToBase64(compressedBytes),
    });
  } catch {
    return plainJson;
  }
}

async function decodeDriveSnapshotJson(parsed: any): Promise<any> {
  if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.encoding === 'gzip-base64' &&
    typeof parsed.payloadBase64 === 'string' &&
    typeof DecompressionStream !== 'undefined'
  ) {
    const compressedBytes = base64ToBytes(parsed.payloadBase64);
    const stream = new Blob([compressedBytes as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const decompressedText = await new Response(stream).text();
    return JSON.parse(decompressedText);
  }
  return parsed;
}

/**
 * Saves or updates the canonical cloud sync JSON snapshot in Google Drive ("Backups/central_estudos_sync_latest.json").
 */
export async function saveCloudSyncSnapshot(
  payload: unknown,
  token?: string,
  options?: { force?: boolean },
): Promise<DriveFileInfo> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('Usuário não autenticado no Google Drive.');
  }

  const jsonString = await encodeDriveSnapshotJson(payload);
  const blob = new Blob([jsonString], { type: 'application/json' });

  const parentFolder = await getOrCreateStudyFolder(activeToken);
  const backupsFolderId = await getOrCreateStudySubFolder(parentFolder.id, 'Backups', activeToken);

  const searchQuery = encodeURIComponent(
    `'${backupsFolderId}' in parents and name = '${CLOUD_SYNC_FILENAME}' and trashed = false`,
  );
  const { res: searchRes, usedToken } = await authorizedDriveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id,name,modifiedTime,appProperties)&includeItemsFromAllDrives=true&supportsAllDrives=true&orderBy=modifiedTime desc&pageSize=10`,
    (t) => ({ headers: { Authorization: `Bearer ${t}` } }),
    activeToken,
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const existingList = (searchData.files || []) as Array<{ id: string; modifiedTime?: string }>;
    const existing = existingList[0];
    if (existing?.id) {
      const remoteMs = Date.parse(existing.modifiedTime || '') || 0;
      const payloadObj =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
      const localMs =
        Date.parse(String(payloadObj?.updatedAt || payloadObj?.exportedAt || '')) || 0;
      if (!options?.force && remoteMs > 0 && localMs > 0 && remoteMs > localMs + 5000) {
        throw new Error(
          'DRIVE_CONFLICT_NEWER_REMOTE: O arquivo de sincronização no Google Drive é mais recente que o snapshot local.',
        );
      }

      const sentLocalMs = Date.now();
      const boundary = '-------314159265358979323846SyncPatch';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;
      const patchMetadata = {
        name: CLOUD_SYNC_FILENAME,
        description: `Snapshot sincronizado pela Central de Estudos em ${new Date().toLocaleString('pt-BR')}`,
        appProperties: buildInternalDriveAppProperties({
          moduleTag: 'Backups',
          sourceAction: 'cloud-sync',
          timestampMs: sentLocalMs,
        }),
      };
      const multipartBody =
        `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(patchMetadata)}` +
        `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${jsonString}${closeDelimiter}`;

      const { res: patchRes, usedToken: patchToken } = await authorizedDriveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties`,
        (t) => ({
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${t}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }),
        usedToken,
      );
      if (patchRes.ok) {
        // Remove any duplicate canonical sync files in the same Backups folder so only 1 remains
        for (const dup of existingList.slice(1)) {
          if (dup?.id) {
            void deleteFileFromDrive(dup.id, patchToken).catch(() => {});
          }
        }
        const savedPatch = (await patchRes.json()) as DriveFileInfo;
        calibrateDriveClockOffsetFromServerIso(
          savedPatch.modifiedTime || savedPatch.createdTime,
          sentLocalMs,
        );
        return enrichDriveFileWithSyncTag(savedPatch);
      }
      if (patchRes.status === 401) {
        await throwDriveResponseError(patchRes, 'Sessão expirada ao sincronizar Drive');
      }
    }
  } else if (searchRes.status === 401) {
    await throwDriveResponseError(searchRes, 'Sessão expirada ao buscar sincronização no Drive');
  }

  return await uploadFileToDrive(blob, CLOUD_SYNC_FILENAME, usedToken, 'Backups', {
    moduleTag: 'Backups',
    sourceAction: 'cloud-sync',
  });
}

/**
 * Saves a timestamped database JSON backup snapshot (incremental or base) directly to Google Drive Backups folder.
 * Always creates a new timestamped file and never overwrites existing backup files.
 */
export async function saveDatabaseBackupToDrive(
  dbSnapshot: unknown,
  token?: string,
): Promise<DriveFileInfo> {
  const jsonString = await encodeDriveSnapshotJson(dbSnapshot);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}m${String(now.getSeconds()).padStart(2, '0')}s`;
  const isIncremental = isIncrementalBackupPayload(dbSnapshot);
  const prefix = isIncremental ? 'backup_incremental_central_estudos' : 'backup_central_estudos';
  const filename = `${prefix}_${dateStr}_${timeStr}.json`;
  return await uploadFileToDrive(blob, filename, token, 'Backups', {
    moduleTag: 'Backups',
    sourceAction: isIncremental ? 'inc-backup' : 'base-backup',
  });
}

/**
 * Lists JSON backups in Google Drive enriched with their folder path and active-folder flag.
 */
export async function listDatabaseBackupsFromDrive(
  token?: string,
  options?: { activeFolderId?: string; onlyActiveFolder?: boolean },
): Promise<DriveFileInfo[]> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta Google para listar backups.');
  }

  const query = `(name contains 'backup_central_estudos' or name contains 'backup_incremental_central_estudos' or name contains 'central_estudos_sync') and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  const [res, graph] = await Promise.all([
    fetchDriveFilesList(activeToken, {
      q: query,
      fields: 'files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,appProperties)',
      fallbackFields: 'files(id,name,mimeType,size,createdTime,modifiedTime,parents)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    }),
    fetchDriveFolderGraph(activeToken).catch(() => null),
  ]);

  if (!res.ok) {
    await throwDriveResponseError(res, 'Falha ao listar backups no Google Drive');
  }

  const data = await res.json();
  const files = (data.files || []) as DriveFileInfo[];
  const activeId = options?.activeFolderId || cachedFolderId || getPreferredStudyFolder().id || undefined;

  const enriched = files.map((f) => {
    const parentId = f.parents?.[0];
    const parentFolder = parentId ? graph?.foldersById.get(parentId) : undefined;
    const folderPath = parentId
      ? graph?.fullPathById.get(parentId) || parentFolder?.name || undefined
      : 'Meu Drive (Raiz)';
    const ancestorFolderIds = parentId
      ? graph?.ancestorIdsByFolderId.get(parentId) || [parentId]
      : [];
    const isInStudyFolder = Boolean(parentId && graph?.studyDescendantIds.has(parentId));
    const isInActiveFolder = Boolean(
      activeId &&
        (f.parents?.includes(activeId) || ancestorFolderIds.includes(activeId)),
    );

    return enrichDriveFileWithSyncTag({
      ...f,
      folderPath,
      ancestorFolderIds,
      isInStudyFolder,
      isInActiveFolder,
    });
  });

  const filtered =
    options?.onlyActiveFolder && activeId
      ? enriched.filter((b) => b.isInActiveFolder)
      : enriched;

  return filtered.sort((a, b) => {
    const tA = Date.parse(a.modifiedTime || a.createdTime || '') || 0;
    const tB = Date.parse(b.modifiedTime || b.createdTime || '') || 0;
    return tB - tA;
  });
}

/**
 * Keeps at most `maxKeep` timestamped backup snapshots in Google Drive when explicitly invoked by user.
 * Never deletes the canonical `central_estudos_sync_latest.json` file.
 */
export async function pruneOldDatabaseBackupsFromDrive(
  token?: string,
  maxKeep = 25,
): Promise<{ deleted: number; kept: number }> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) return { deleted: 0, kept: 0 };

  const activeFolder = await getOrCreateStudyFolder(activeToken).catch(() => null);
  const allBackups = await listDatabaseBackupsFromDrive(activeToken, {
    activeFolderId: activeFolder?.id,
    onlyActiveFolder: Boolean(activeFolder?.id),
  });
  const newestBaseSnapshot = allBackups.find(
    (b) => b.name !== CLOUD_SYNC_FILENAME && b.name.startsWith('backup_central_estudos_'),
  );
  const protectedIds = new Set<string>(
    newestBaseSnapshot?.id ? [newestBaseSnapshot.id] : [],
  );
  const datedBackups = allBackups.filter(
    (b) =>
      b.name !== CLOUD_SYNC_FILENAME &&
      !protectedIds.has(b.id) &&
      (b.name.startsWith('backup_central_estudos_') ||
        b.name.startsWith('backup_incremental_central_estudos_')),
  );

  if (datedBackups.length <= maxKeep) {
    return { deleted: 0, kept: datedBackups.length };
  }

  const toDelete = datedBackups.slice(maxKeep);
  let deleted = 0;
  for (const oldFile of toDelete) {
    try {
      await deleteFileFromDrive(oldFile.id, activeToken);
      deleted += 1;
    } catch {
      // Ignore individual deletion failure so backup flow never breaks
    }
  }
  return { deleted, kept: maxKeep };
}

/**
 * Builds a deterministic signature map (fileId -> versionStamp) from a list of Drive files.
 */
export function buildDriveSignatureMap(files: DriveFileInfo[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of files) {
    if (!f?.id) continue;
    const parent = f.parents?.[0] || '';
    const syncMarker = f.appProperties?.ceTag === DRIVE_SYNC_TAG_VALUE ? 'ce' : 'ext';
    map[f.id] = `${f.modifiedTime || f.createdTime || ''}:${f.size || ''}:${parent}:${syncMarker}`;
  }
  return map;
}

export function serializeDriveSignatureMap(map: Record<string, string>): string {
  return Object.keys(map)
    .sort()
    .map((id) => `${id}=${map[id]}`)
    .join('|');
}

export function selectScopedBackupList(
  backups: DriveFileInfo[],
  opts?: { onlyFolderId?: string; activeFolderId?: string; strictFolder?: boolean },
): DriveFileInfo[] {
  if (!backups.length) return [];
  if (opts?.onlyFolderId) {
    if (opts.onlyFolderId === 'root') {
      return backups.filter((b) => !b.parents || b.parents.length === 0);
    }
    return backups.filter(
      (b) =>
        b.parents?.includes(opts.onlyFolderId!) ||
        b.ancestorFolderIds?.includes(opts.onlyFolderId!),
    );
  }
  if (opts?.activeFolderId) {
    const activeBackups = backups.filter((b) => b.isInActiveFolder);
    const studyFolderBackups = opts.strictFolder
      ? []
      : backups.filter((b) => !b.isInActiveFolder && b.isInStudyFolder);
    const otherBackups = opts.strictFolder
      ? []
      : backups.filter((b) => !b.isInActiveFolder && !b.isInStudyFolder);
    return activeBackups.length > 0
      ? activeBackups
      : studyFolderBackups.length > 0
      ? studyFolderBackups
      : otherBackups;
  }
  return backups;
}

/**
 * Downloads a JSON backup file content from Google Drive, using IndexedDB cache when versionStamp matches.
 */
export async function downloadBackupFileFromDrive(
  fileId: string,
  token?: string,
  cacheOptions?: { versionStamp?: string; bypassCache?: boolean },
): Promise<any> {
  if (cacheOptions?.versionStamp && !cacheOptions.bypassCache) {
    const cached = await loadDriveJsonCacheEntry(fileId, cacheOptions.versionStamp);
    if (cached !== null) {
      return cached;
    }
  }

  const activeToken = token || (await getAccessToken());
  if (!activeToken) throw new Error('TOKEN_EXPIRED: Não autenticado no Google.');

  const { res } = await authorizedDriveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    (t) => ({ headers: { Authorization: `Bearer ${t}` } }),
    activeToken,
  );

  if (!res.ok) {
    if (res.status === 403) {
      markDriveFilePermissionBlocked(fileId);
    }
    await throwDriveResponseError(res, 'Falha ao baixar backup do Google Drive');
  }

  const rawJson = await res.json();
  const json = await decodeDriveSnapshotJson(rawJson);
  if (cacheOptions?.versionStamp && json && typeof json === 'object') {
    void saveDriveJsonCacheEntry(fileId, cacheOptions.versionStamp, json);
  }
  return json;
}

export interface DownloadLatestCloudSyncOptions {
  onlyFolderId?: string;
  activeFolderId?: string;
  expectedEmail?: string;
  strictFolder?: boolean;
  prefetchedBackups?: DriveFileInfo[];
  bypassCache?: boolean;
}

function orderBackupCandidates(list: DriveFileInfo[]): DriveFileInfo[] {
  if (list.length <= 1) return list;
  const canonical = list.find((b) => b.name === CLOUD_SYNC_FILENAME);
  const newest = list[0];
  const canonicalMs = canonical
    ? Date.parse(canonical.modifiedTime || canonical.createdTime || '') || 0
    : 0;
  const newestMs = newest
    ? Date.parse(newest.modifiedTime || newest.createdTime || '') || 0
    : 0;
  const primary = canonical && canonicalMs >= newestMs - 1000 ? canonical : newest;
  return [primary, ...list.filter((b) => b.id !== primary.id)];
}

function backupMatchesExpectedEmail(payload: any, expectedEmail?: string): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (!expectedEmail) return true;
  const payloadEmail =
    typeof payload.userEmail === 'string' ? payload.userEmail.trim().toLowerCase() : '';
  if (!payloadEmail) return true;
  return payloadEmail === expectedEmail.trim().toLowerCase();
}

function isDrivePermissionError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return (
    msg.includes('insufficientFilePermissions') ||
    msg.includes('appNotAuthorizedToFile') ||
    msg.includes('DRIVE_FOLDER_PERMISSION') ||
    msg.includes('PICKER_FILE_PERMISSION') ||
    msg.includes('cannotDownloadFile') ||
    msg.includes('HTTP 403')
  );
}

/**
 * Finds and downloads the latest valid cloud sync snapshot (plus any newer incremental deltas).
 * Prioritizes backups inside the active study folder and validates payload ownership email.
 */
export async function downloadLatestCloudSync(
  token?: string,
  optionsOrFolderId?: string | DownloadLatestCloudSyncOptions,
): Promise<{
  file: DriveFileInfo;
  payload: any;
  incrementalDeltas: IncrementalBackupEnvelope[];
  fromActiveFolder: boolean;
  folderPath?: string;
  scopedBackups: DriveFileInfo[];
  permissionBlockedCount?: number;
  permissionBlockedFolderId?: string;
} | null> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta Google para restaurar backup.');
  }

  const opts: DownloadLatestCloudSyncOptions =
    typeof optionsOrFolderId === 'string'
      ? { onlyFolderId: optionsOrFolderId, strictFolder: true }
      : optionsOrFolderId || {};

  const targetActiveId = opts.onlyFolderId || opts.activeFolderId;
  const backups =
    opts.prefetchedBackups ||
    (await listDatabaseBackupsFromDrive(activeToken, {
      activeFolderId: targetActiveId,
    }));
  if (!backups.length) return null;

  const scopedList = selectScopedBackupList(backups, opts);
  if (!scopedList.length) return null;

  const fullCandidates = orderBackupCandidates(
    scopedList.filter((b) => !b.name.startsWith('backup_incremental_central_estudos_')),
  );
  const incrementalCandidates = scopedList
    .filter((b) => b.name.startsWith('backup_incremental_central_estudos_'))
    .sort((a, b) => {
      const tA = Date.parse(a.modifiedTime || a.createdTime || '') || 0;
      const tB = Date.parse(b.modifiedTime || b.createdTime || '') || 0;
      return tA - tB; // oldest -> newest for chronological replay
    });

  const permissionBlockedFiles: DriveFileInfo[] = [];

  let baseResult: { file: DriveFileInfo; payload: any } | null = null;
  for (const candidate of fullCandidates) {
    try {
      const versionStamp = `${candidate.modifiedTime || candidate.createdTime || ''}:${candidate.size || ''}`;
      const payload = await downloadBackupFileFromDrive(candidate.id, activeToken, {
        versionStamp,
        bypassCache: opts.bypassCache,
      });
      if (!backupMatchesExpectedEmail(payload, opts.expectedEmail)) {
        continue;
      }
      if (isIncrementalBackupPayload(payload)) {
        continue;
      }
      baseResult = { file: candidate, payload };
      break;
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        throw err;
      }
      if (isDrivePermissionError(err)) {
        permissionBlockedFiles.push(candidate);
      }
    }
  }

  const baseMs = baseResult
    ? Math.max(
        Date.parse(baseResult.payload?.updatedAt || baseResult.payload?.exportedAt || '') || 0,
        Date.parse(baseResult.file.modifiedTime || baseResult.file.createdTime || '') || 0,
      )
    : 0;
  const baseHash =
    typeof baseResult?.payload?.contentHash === 'string' ? baseResult.payload.contentHash : '';

  const incrementalDeltas: IncrementalBackupEnvelope[] = [];
  let newestIncFile: DriveFileInfo | null = null;

  for (const incFile of incrementalCandidates) {
    const fileMs = Date.parse(incFile.modifiedTime || incFile.createdTime || '') || 0;
    if (baseResult && fileMs < baseMs - 2000) continue;
    try {
      const versionStamp = `${incFile.modifiedTime || incFile.createdTime || ''}:${incFile.size || ''}`;
      const incPayload = await downloadBackupFileFromDrive(incFile.id, activeToken, {
        versionStamp,
        bypassCache: opts.bypassCache,
      });
      if (!backupMatchesExpectedEmail(incPayload, opts.expectedEmail)) {
        continue;
      }
      if (isIncrementalBackupPayload(incPayload)) {
        const payloadMs = Date.parse(incPayload.updatedAt || '') || fileMs;
        const incHash = typeof incPayload.contentHash === 'string' ? incPayload.contentHash : '';
        if (baseHash && incHash && baseHash === incHash) {
          continue;
        }
        if (!baseResult || payloadMs > baseMs || (baseHash && incHash && payloadMs >= baseMs - 2000)) {
          incrementalDeltas.push(incPayload);
          newestIncFile = incFile;
        }
      }
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        throw err;
      }
      if (isDrivePermissionError(err)) {
        permissionBlockedFiles.push(incFile);
      }
    }
  }

  if (baseResult) {
    return {
      file: newestIncFile || baseResult.file,
      payload: baseResult.payload,
      incrementalDeltas,
      fromActiveFolder: Boolean((newestIncFile || baseResult.file).isInActiveFolder),
      folderPath: (newestIncFile || baseResult.file).folderPath,
      scopedBackups: scopedList,
      ...(permissionBlockedFiles.length > 0
        ? {
            permissionBlockedCount: permissionBlockedFiles.length,
            permissionBlockedFolderId: permissionBlockedFiles[0].parents?.[0] || targetActiveId,
          }
        : {}),
    };
  }

  if (incrementalDeltas.length > 0 && newestIncFile) {
    return {
      file: newestIncFile,
      payload: null,
      incrementalDeltas,
      fromActiveFolder: Boolean(newestIncFile.isInActiveFolder),
      folderPath: newestIncFile.folderPath,
      scopedBackups: scopedList,
      ...(permissionBlockedFiles.length > 0
        ? {
            permissionBlockedCount: permissionBlockedFiles.length,
            permissionBlockedFolderId: permissionBlockedFiles[0].parents?.[0] || targetActiveId,
          }
        : {}),
    };
  }

  if (permissionBlockedFiles.length > 0) {
    return {
      file: permissionBlockedFiles[0],
      payload: null,
      incrementalDeltas: [],
      fromActiveFolder: Boolean(permissionBlockedFiles[0].isInActiveFolder),
      folderPath: permissionBlockedFiles[0].folderPath,
      scopedBackups: scopedList,
      permissionBlockedCount: permissionBlockedFiles.length,
      permissionBlockedFolderId: permissionBlockedFiles[0].parents?.[0] || targetActiveId,
    };
  }

  return null;
}

/**
 * Downloads binary content of a file stored in Google Drive as a Blob.
 * Automatically exports native Google Workspace files (Docs, Sheets, Slides) as PDF.
 */
export async function downloadDriveFileBlob(
  fileId: string,
  token?: string,
  fallbackMime?: string,
): Promise<Blob> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) throw new Error('TOKEN_EXPIRED: Não autenticado no Google.');

  const isWorkspaceDoc =
    fallbackMime &&
    fallbackMime.startsWith('application/vnd.google-apps.') &&
    fallbackMime !== 'application/vnd.google-apps.folder';

  const url = isWorkspaceDoc
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;

  const { res } = await authorizedDriveFetch(
    url,
    (t) => ({ headers: { Authorization: `Bearer ${t}` } }),
    activeToken,
  );

  if (!res.ok) {
    if (res.status === 403) {
      const errText = await res.text();
      if (
        errText.includes('insufficientFilePermissions') ||
        errText.includes('appNotAuthorizedToFile') ||
        errText.includes('cannotDownloadFile')
      ) {
        markDriveFilePermissionBlocked(fileId);
        throw new Error(
          'PICKER_FILE_PERMISSION: Selecione os arquivos pelo seletor oficial do Google Drive para liberar o download.',
        );
      }
      throw new Error(`Falha ao baixar arquivo do Google Drive: ${errText}`);
    }
    await throwDriveResponseError(res, 'Falha ao baixar arquivo do Google Drive');
  }

  clearDrivePermissionBlockedFiles([fileId]);
  const blob = await res.blob();
  if (!blob.type && fallbackMime && !isWorkspaceDoc) {
    return new Blob([blob], { type: fallbackMime });
  }
  return blob;
}

export type DriveTrashFailureReason =
  | 'token-expired'
  | 'picker-permission'
  | 'forbidden-readonly'
  | 'network'
  | 'unknown';

export interface DriveTrashResult {
  ok: boolean;
  fileId: string;
  alreadyMissing?: boolean;
  reason?: DriveTrashFailureReason;
  httpStatus?: number;
  detail?: string;
}

async function inspectDriveFileTrashCapabilities(
  cleanId: string,
  token: string,
): Promise<{ ownedByMe?: boolean; canTrash?: boolean; canDelete?: boolean } | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}?fields=id,ownedByMe,capabilities(canTrash,canDelete)&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ownedByMe?: boolean;
      capabilities?: { canTrash?: boolean; canDelete?: boolean };
    };
    return {
      ownedByMe: data.ownedByMe,
      canTrash: data.capabilities?.canTrash,
      canDelete: data.capabilities?.canDelete,
    };
  } catch {
    return null;
  }
}

function isDriveScopeInsufficientText(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    raw.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
    raw.includes('insufficientPermissions') ||
    lower.includes('insufficient authentication scopes')
  );
}

function isDrivePickerFilePermissionText(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    raw.includes('appNotAuthorizedToFile') ||
    raw.includes('insufficientFilePermissions') ||
    raw.includes('fileNotAuthorized') ||
    lower.includes('has not granted the app') ||
    lower.includes('not authorized to access')
  );
}

/**
 * Trashes (or permanently deletes as fallback) a file or folder in Google Drive,
 * returning structured failure reasons (token expired, Picker permission needed, read-only shared, etc.).
 */
export async function trashFileInDriveDetailed(
  fileId: string,
  token?: string,
): Promise<DriveTrashResult> {
  const cleanId = String(fileId || '').replace(/^drive_/, '').trim();
  if (!cleanId) {
    return { ok: true, fileId: '', alreadyMissing: true };
  }

  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    return {
      ok: false,
      fileId: cleanId,
      reason: 'token-expired',
      detail: 'Sessão OAuth do Google Drive expirada ou não conectada.',
    };
  }

  try {
    // Prefer moving to Trash via PATCH so recoverable Drive Trash works cleanly
    const { res, usedToken } = await authorizedDriveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}?supportsAllDrives=true`,
      (t) => ({
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trashed: true }),
      }),
      activeToken,
    );

    if (res.ok || res.status === 404) {
      clearDrivePermissionBlockedFiles([cleanId]);
      return { ok: true, fileId: cleanId, alreadyMissing: res.status === 404 };
    }

    if (res.status === 401) {
      clearAccessTokenOnly();
      return {
        ok: false,
        fileId: cleanId,
        reason: 'token-expired',
        httpStatus: 401,
        detail: 'Sessão OAuth do Google Drive expirada ou revogada.',
      };
    }

    const patchErrText = await res.clone().text().catch(() => '');
    if (res.status === 403 && isDriveScopeInsufficientText(patchErrText)) {
      clearAccessTokenOnly();
      return {
        ok: false,
        fileId: cleanId,
        reason: 'token-expired',
        httpStatus: 403,
        detail: 'O token atual não possui permissão do Google Drive. Reconecte sua conta Google.',
      };
    }

    // Fallback: direct DELETE
    const { res: delRes } = await authorizedDriveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}?supportsAllDrives=true`,
      (t) => ({
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      }),
      usedToken,
    );

    if (delRes.ok || delRes.status === 404) {
      clearDrivePermissionBlockedFiles([cleanId]);
      return { ok: true, fileId: cleanId, alreadyMissing: delRes.status === 404 };
    }

    if (delRes.status === 401) {
      clearAccessTokenOnly();
      return {
        ok: false,
        fileId: cleanId,
        reason: 'token-expired',
        httpStatus: 401,
        detail: 'Sessão OAuth do Google Drive expirada ou revogada.',
      };
    }

    const delErrText = await delRes.clone().text().catch(() => '');
    const combinedErr = `${patchErrText}\n${delErrText}`;
    const finalStatus = delRes.status || res.status;

    if (finalStatus === 403 || res.status === 403) {
      if (isDriveScopeInsufficientText(combinedErr)) {
        clearAccessTokenOnly();
        return {
          ok: false,
          fileId: cleanId,
          reason: 'token-expired',
          httpStatus: 403,
          detail: 'O token atual não possui permissão do Google Drive. Reconecte sua conta Google.',
        };
      }

      if (isDrivePickerFilePermissionText(combinedErr)) {
        const meta = await inspectDriveFileTrashCapabilities(cleanId, usedToken);
        if (
          meta &&
          meta.ownedByMe === false &&
          meta.canTrash === false &&
          meta.canDelete === false
        ) {
          return {
            ok: false,
            fileId: cleanId,
            reason: 'forbidden-readonly',
            httpStatus: 403,
            detail:
              'Arquivo compartilhado somente para leitura no Google Drive (você não tem permissão para movê-lo à lixeira).',
          };
        }

        markDriveFilePermissionBlocked(cleanId);
        return {
          ok: false,
          fileId: cleanId,
          reason: 'picker-permission',
          httpStatus: 403,
          detail:
            'Este arquivo foi enviado ao Google Drive fora do app (ou em outra sessão/cliente). Autorize-o pelo Seletor do Drive para movê-lo à lixeira.',
        };
      }

      const rawParsed = parseGoogleDriveErrorMessage(delErrText || patchErrText);
      const isReadonly =
        combinedErr.includes('cannotTrash') ||
        combinedErr.includes('cannotDelete') ||
        combinedErr.toLowerCase().includes('insufficient permissions for this file');
      return {
        ok: false,
        fileId: cleanId,
        reason: isReadonly ? 'forbidden-readonly' : 'unknown',
        httpStatus: 403,
        detail: rawParsed || 'Permissão negada pelo Google Drive ao mover arquivo para a lixeira.',
      };
    }

    const parsedMsg = parseGoogleDriveErrorMessage(delErrText || patchErrText);
    return {
      ok: false,
      fileId: cleanId,
      reason: 'unknown',
      httpStatus: finalStatus,
      detail: parsedMsg || `O Google Drive recusou a exclusão (HTTP ${finalStatus}).`,
    };
  } catch (err: any) {
    return {
      ok: false,
      fileId: cleanId,
      reason: 'network',
      detail: String(err?.message || 'Falha de rede ao se comunicar com o Google Drive.'),
    };
  }
}

/**
 * Trashes (or permanently deletes as fallback) a file or folder in Google Drive.
 * Returns true if removed/already absent, false if auth/network failed.
 */
export async function deleteFileFromDrive(fileId: string, token?: string): Promise<boolean> {
  const result = await trashFileInDriveDetailed(fileId, token);
  return result.ok;
}

export interface DriveDeleteTarget {
  fileIds?: string[];
  names?: string[];
  subfolderHints?: string[];
  folderNames?: string[];
  queuedAt?: number;
}

const PENDING_DRIVE_DELETES_PREFIX = 'ce_pending_drive_deletes_v1_';

function getPendingDriveDeletesKey(scope: string): string {
  return `${PENDING_DRIVE_DELETES_PREFIX}${scope || 'offline_guest'}`;
}

function normalizeDriveMatchName(val?: string): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function stripDriveMatchPrefix(val?: string): string {
  return String(val || '')
    .replace(/^(LEI|PROVA|GABARITO|RESUMO|DISCURSIVA|CORRECAO|CRONOGRAMA|DATAS\s*E\s*LOCAIS|EDITAL)\s*-\s*/i, '')
    .trim();
}

export function getPendingDriveDeletes(scope: string): DriveDeleteTarget[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(getPendingDriveDeletesKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DriveDeleteTarget[]) : [];
  } catch {
    return [];
  }
}

export function clearPendingDriveDeletes(scope: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(getPendingDriveDeletesKey(scope));
  } catch {
    // ignore storage errors
  }
}

export function removePendingDriveDeletesForDriveFile(
  scope: string,
  df: { id?: string; name?: string },
): void {
  const scopesToClean = scope !== 'offline_guest' ? [scope, 'offline_guest'] : [scope];
  const targetId = String(df.id || '').replace(/^drive_/, '').trim();
  const targetFull = normalizeDriveMatchName(df.name);
  const targetStripped = normalizeDriveMatchName(stripDriveMatchPrefix(df.name));

  for (const s of scopesToClean) {
    try {
      const list = getPendingDriveDeletes(s);
      if (!list.length) continue;
      const updated = list
        .map((entry) => {
          const nextIds = (entry.fileIds || []).filter(
            (id) => String(id || '').replace(/^drive_/, '').trim() !== targetId,
          );
          const nextNames = (entry.names || []).filter((n) => {
            const nf = normalizeDriveMatchName(n);
            const ns = normalizeDriveMatchName(stripDriveMatchPrefix(n));
            return nf !== targetFull && ns !== targetStripped && nf !== targetStripped && ns !== targetFull;
          });
          return {
            ...entry,
            ...(entry.fileIds ? { fileIds: nextIds } : {}),
            ...(entry.names ? { names: nextNames } : {}),
          };
        })
        .filter(
          (entry) =>
            Boolean(entry.fileIds?.length) ||
            Boolean(entry.names?.length) ||
            Boolean(entry.folderNames?.length),
        );

      if (typeof window !== 'undefined' && window.localStorage) {
        if (updated.length > 0) {
          window.localStorage.setItem(getPendingDriveDeletesKey(s), JSON.stringify(updated));
        } else {
          window.localStorage.removeItem(getPendingDriveDeletesKey(s));
        }
      }
    } catch {
      // ignore storage errors
    }
  }
}

export function queuePendingDriveDeletes(scope: string, target: DriveDeleteTarget): void {
  const hasContent =
    Boolean(target.fileIds?.length) ||
    Boolean(target.names?.length) ||
    Boolean(target.folderNames?.length);
  if (!hasContent) return;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const existing = getPendingDriveDeletes(scope);
    const cleaned: DriveDeleteTarget = {
      ...(target.fileIds?.length
        ? {
            fileIds: Array.from(
              new Set(target.fileIds.map((id) => String(id || '').replace(/^drive_/, '').trim()).filter(Boolean)),
            ),
          }
        : {}),
      ...(target.names?.length
        ? { names: Array.from(new Set(target.names.map((n) => String(n || '').trim()).filter(Boolean))) }
        : {}),
      ...(target.subfolderHints?.length
        ? {
            subfolderHints: Array.from(
              new Set(target.subfolderHints.map((s) => String(s || '').trim()).filter(Boolean)),
            ),
          }
        : {}),
      ...(target.folderNames?.length
        ? {
            folderNames: Array.from(
              new Set(target.folderNames.map((f) => String(f || '').trim()).filter(Boolean)),
            ),
          }
        : {}),
      queuedAt: typeof target.queuedAt === 'number' && target.queuedAt > 0 ? target.queuedAt : Date.now(),
    };
    const next = [...existing, cleaned].slice(-200);
    window.localStorage.setItem(getPendingDriveDeletesKey(scope), JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

function matchesDriveFileSubfolderHints(df: DriveFileInfo, hints: string[]): boolean {
  if (!hints.length) return true;
  const pathSegments = String(df.folderPath || '')
    .split('/')
    .map((s) => normalizeDriveMatchName(s))
    .filter(Boolean);
  const subNorm = normalizeDriveMatchName(df.subfolderName);
  const normHints = hints.map((h) => normalizeDriveMatchName(h)).filter(Boolean);
  if (!normHints.length) return true;

  // If only category + specific subfolder are provided (e.g. ['PDFs Pessoais', 'Apostilas Base']),
  // require the specific subfolder if present inside another sibling folder, while still allowing legacy flat files directly in category/root
  if (normHints.length >= 2) {
    const [categoryHint, ...specificHints] = normHints;
    if (specificHints.some((sh) => pathSegments.includes(sh))) {
      return true;
    }
    const lastSeg = pathSegments[pathSegments.length - 1] || '';
    const isDirectInCategoryOrRoot =
      lastSeg === categoryHint ||
      lastSeg === 'meu drive (raiz)' ||
      (!subNorm && pathSegments.length === 0);
    return isDirectInCategoryOrRoot;
  }

  return normHints.some((nh) => subNorm === nh || pathSegments.includes(nh));
}

export async function deleteStudyFilesFromDrive(
  target: DriveDeleteTarget,
  token?: string,
  prefetchedFiles?: DriveFileInfo[],
): Promise<{
  deletedCount: number;
  deletedIds: string[];
  deletedNames: string[];
  failed: boolean;
  permissionBlockedIds: string[];
  tokenExpired: boolean;
  firstErrorDetail?: string;
}> {
  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    return {
      deletedCount: 0,
      deletedIds: [],
      deletedNames: [],
      failed: true,
      permissionBlockedIds: [],
      tokenExpired: true,
      firstErrorDetail: 'Sessão OAuth do Google Drive expirada ou não conectada.',
    };
  }

  const directIds = new Set(
    (target.fileIds || [])
      .map((id) => String(id || '').replace(/^drive_/, '').trim())
      .filter(Boolean),
  );
  const nameKeys = new Set<string>();
  for (const rawName of target.names || []) {
    const norm = normalizeDriveMatchName(rawName);
    const stripped = normalizeDriveMatchName(stripDriveMatchPrefix(rawName));
    if (norm) nameKeys.add(norm);
    if (stripped) nameKeys.add(stripped);
  }
  const subfolderHints = (target.subfolderHints || []).filter(Boolean);
  const folderNameKeys = new Set(
    (target.folderNames || []).map((f) => normalizeDriveMatchName(f)).filter(Boolean),
  );

  const idsToDelete = new Set<string>(directIds);
  const idToLabel = new Map<string, string>();
  let filesList: DriveFileInfo[] = prefetchedFiles || [];

  if ((nameKeys.size > 0 || folderNameKeys.size > 0) && filesList.length === 0) {
    try {
      filesList = await listAllStudyFilesInDrive(activeToken);
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        return {
          deletedCount: 0,
          deletedIds: [],
          deletedNames: [],
          failed: true,
          permissionBlockedIds: [],
          tokenExpired: true,
          firstErrorDetail: String(err?.message || ''),
        };
      }
      filesList = [];
    }
  }

  for (const df of filesList) {
    if (!df?.id) continue;
    if (directIds.has(df.id)) {
      idsToDelete.add(df.id);
      if (df.name) idToLabel.set(df.id, df.name);
      continue;
    }
    if (folderNameKeys.size > 0 && df.isInStudyFolder !== false) {
      const segs = String(df.folderPath || '')
        .split('/')
        .map((s) => normalizeDriveMatchName(s))
        .filter(Boolean);
      if (segs.some((s) => folderNameKeys.has(s))) {
        idsToDelete.add(df.id);
        if (df.name) idToLabel.set(df.id, df.name);
        continue;
      }
    }
    if (nameKeys.size > 0) {
      const dfNorm = normalizeDriveMatchName(df.name);
      const dfStripped = normalizeDriveMatchName(stripDriveMatchPrefix(df.name));
      if (nameKeys.has(dfNorm) || (dfStripped && nameKeys.has(dfStripped))) {
        if (matchesDriveFileSubfolderHints(df, subfolderHints)) {
          idsToDelete.add(df.id);
          if (df.name) idToLabel.set(df.id, df.name);
        }
      }
    }
  }

  // Also trash matching study subfolders themselves when deleting a whole folder
  if (folderNameKeys.size > 0) {
    try {
      const graph = await fetchDriveFolderGraph(activeToken);
      for (const folderId of graph.studyDescendantIds) {
        if (graph.studyRootIds.has(folderId)) continue;
        const folderObj = graph.foldersById.get(folderId);
        if (!folderObj) continue;
        const normFolder = normalizeDriveMatchName(folderObj.name);
        if (folderNameKeys.has(normFolder)) {
          idsToDelete.add(folderId);
          idToLabel.set(folderId, `Pasta: ${folderObj.name}`);
        }
      }
    } catch {
      // non-fatal if folder graph fails
    }
  }

  const deletedIds: string[] = [];
  const deletedNamesSet = new Set<string>();
  const permissionBlockedIds: string[] = [];
  let failed = false;
  let tokenExpired = false;
  let firstErrorDetail: string | undefined;

  for (const id of idsToDelete) {
    const res = await trashFileInDriveDetailed(id, activeToken);
    if (res.ok) {
      deletedIds.push(id);
      const matchedLabel = idToLabel.get(id);
      if (matchedLabel) deletedNamesSet.add(matchedLabel);
    } else {
      failed = true;
      if (res.reason === 'token-expired') tokenExpired = true;
      if (res.reason === 'picker-permission') permissionBlockedIds.push(id);
      if (!firstErrorDetail && res.detail) firstErrorDetail = res.detail;
    }
  }

  if (deletedIds.length > 0 && deletedNamesSet.size === 0) {
    (target.names || []).forEach((n) => {
      if (n?.trim()) deletedNamesSet.add(n.trim());
    });
    (target.folderNames || []).forEach((f) => {
      if (f?.trim()) deletedNamesSet.add(`Pasta: ${f.trim()}`);
    });
  }

  return {
    deletedCount: deletedIds.length,
    deletedIds,
    deletedNames: Array.from(deletedNamesSet),
    failed,
    permissionBlockedIds,
    tokenExpired,
    firstErrorDetail,
  };
}

export async function flushPendingDriveDeletes(
  scope: string,
  token?: string,
  prefetchedFiles?: DriveFileInfo[],
): Promise<{
  deletedIds: string[];
  deletedNames: string[];
  remainingCount: number;
  permissionBlockedIds: string[];
  tokenExpired: boolean;
  firstErrorDetail?: string;
}> {
  const scopeQueue = getPendingDriveDeletes(scope);
  const guestQueue = scope !== 'offline_guest' ? getPendingDriveDeletes('offline_guest') : [];
  const combined = [...scopeQueue, ...guestQueue];
  if (combined.length === 0) {
    return {
      deletedIds: [],
      deletedNames: [],
      remainingCount: 0,
      permissionBlockedIds: [],
      tokenExpired: false,
    };
  }

  const activeToken = token || (await getAccessToken());
  if (!activeToken) {
    return {
      deletedIds: [],
      deletedNames: [],
      remainingCount: combined.length,
      permissionBlockedIds: [],
      tokenExpired: true,
      firstErrorDetail: 'Sessão OAuth do Google Drive expirada ou não conectada.',
    };
  }

  let filesList = prefetchedFiles;
  if (!filesList) {
    try {
      filesList = await listAllStudyFilesInDrive(activeToken);
    } catch (err: any) {
      if (String(err?.message || '').includes('TOKEN_EXPIRED')) {
        return {
          deletedIds: [],
          deletedNames: [],
          remainingCount: combined.length,
          permissionBlockedIds: [],
          tokenExpired: true,
          firstErrorDetail: String(err?.message || ''),
        };
      }
      filesList = [];
    }
  }

  const deletedSet = new Set<string>();
  const deletedNamesSet = new Set<string>();
  const permissionBlockedSet = new Set<string>();
  const remaining: DriveDeleteTarget[] = [];
  let tokenExpired = false;
  let firstErrorDetail: string | undefined;

  for (const item of combined) {
    const res = await deleteStudyFilesFromDrive(item, activeToken, filesList);
    res.deletedIds.forEach((id) => deletedSet.add(id));
    res.deletedNames.forEach((name) => deletedNamesSet.add(name));
    res.permissionBlockedIds.forEach((id) => permissionBlockedSet.add(id));
    if (res.tokenExpired) tokenExpired = true;
    if (!firstErrorDetail && res.firstErrorDetail) firstErrorDetail = res.firstErrorDetail;
    if (res.failed) {
      remaining.push(item);
    }
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (scope !== 'offline_guest') {
        clearPendingDriveDeletes('offline_guest');
      }
      if (remaining.length > 0) {
        window.localStorage.setItem(getPendingDriveDeletesKey(scope), JSON.stringify(remaining.slice(-200)));
      } else {
        clearPendingDriveDeletes(scope);
      }
    }
  } catch {
    // ignore storage errors
  }

  return {
    deletedIds: Array.from(deletedSet),
    deletedNames: Array.from(deletedNamesSet),
    remainingCount: remaining.length,
    permissionBlockedIds: Array.from(permissionBlockedSet),
    tokenExpired,
    firstErrorDetail,
  };
}

export interface DrivePickerPickedItem {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
}

export interface DrivePickerResult {
  folders: DrivePickerPickedItem[];
  files: DrivePickerPickedItem[];
}

let pickerLoadPromise: Promise<void> | null = null;

function loadGooglePickerApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker disponível apenas no navegador.'));
  }
  const win = window as any;
  if (win.google?.picker?.PickerBuilder) {
    return Promise.resolve();
  }
  if (pickerLoadPromise) return pickerLoadPromise;

  pickerLoadPromise = new Promise<void>((resolve, reject) => {
    const initPickerLib = () => {
      try {
        win.gapi.load('picker', {
          callback: () => resolve(),
          onerror: () => {
            pickerLoadPromise = null;
            reject(new Error('Falha ao carregar biblioteca Google Picker.'));
          },
        });
      } catch (err) {
        pickerLoadPromise = null;
        reject(err);
      }
    };

    if (win.gapi?.load) {
      initPickerLib();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );
    if (existingScript) {
      existingScript.addEventListener('load', initPickerLib, { once: true });
      existingScript.addEventListener(
        'error',
        () => {
          pickerLoadPromise = null;
          reject(new Error('Falha ao carregar script do Google Picker.'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = initPickerLib;
    script.onerror = () => {
      pickerLoadPromise = null;
      reject(new Error('Falha ao carregar script https://apis.google.com/js/api.js.'));
    };
    document.head.appendChild(script);
  });

  return pickerLoadPromise;
}

/**
 * Opens Google Picker UI allowing the user to browse Google Drive and select a folder and/or files.
 * Follows the client-side Google Picker pattern (no developer key, dynamic ancestorOrigins support).
 */
export async function openDrivePicker(options?: {
  token?: string;
  parentFolderId?: string;
  mode?: 'folders-and-files' | 'files-only' | 'folders-only';
  title?: string;
}): Promise<DrivePickerResult | null> {
  const activeToken = options?.token || (await getAccessToken());
  if (!activeToken) {
    throw new Error('TOKEN_EXPIRED: Conecte sua conta Google antes de abrir o seletor do Drive.');
  }

  await loadGooglePickerApi();

  const win = window as any;
  const pickerNs = win.google?.picker;
  if (!pickerNs?.PickerBuilder) {
    throw new Error('Google Picker não pôde ser inicializado.');
  }

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  return await new Promise<DrivePickerResult | null>((resolve) => {
    const builder = new pickerNs.PickerBuilder()
      .setOAuthToken(activeToken)
      .setOrigin(pickerOrigin)
      .setLocale('pt-BR')
      .setTitle(
        options?.title ||
          (options?.mode === 'files-only'
            ? 'Selecione os arquivos dentro da pasta para autorizar'
            : options?.mode === 'folders-only'
              ? 'Selecione a pasta do Google Drive onde salvar seus dados e arquivos'
              : 'Selecione uma pasta ou arquivos no Google Drive'),
      );

    if (options?.mode !== 'folders-only') {
      builder.enableFeature(pickerNs.Feature.MULTISELECT_ENABLED);
    }

    if (options?.mode !== 'files-only') {
      const foldersView = new pickerNs.DocsView(pickerNs.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder');
      if (options?.parentFolderId && options.parentFolderId !== 'root') {
        foldersView.setParent(options.parentFolderId);
      }
      builder.addView(foldersView);
    }

    if (options?.mode !== 'folders-only') {
      const docsView = new pickerNs.DocsView(pickerNs.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(options?.mode !== 'files-only');
      if (options?.parentFolderId && options.parentFolderId !== 'root') {
        docsView.setParent(options.parentFolderId);
      }
      builder.addView(docsView);

      if (options?.parentFolderId && options.parentFolderId !== 'root') {
        const allDocsView = new pickerNs.DocsView(pickerNs.ViewId.DOCS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false);
        builder.addView(allDocsView);
      }
    }

    builder.setCallback((data: any) => {
      if (data.action === pickerNs.Action.PICKED) {
        const docs = (data.docs || []) as Array<any>;
        const folders: DrivePickerPickedItem[] = [];
        const files: DrivePickerPickedItem[] = [];
        for (const d of docs) {
          const item: DrivePickerPickedItem = {
            id: d.id,
            name: d.name || 'Sem nome',
            mimeType: d.mimeType || '',
            url: d.url,
          };
          if (item.mimeType === 'application/vnd.google-apps.folder') {
            folders.push(item);
          } else {
            files.push(item);
          }
        }
        if (folders.length > 0) {
          clearDrivePermissionBlockedFiles();
        } else if (files.length > 0) {
          clearDrivePermissionBlockedFiles(files.map((f) => f.id));
        }
        resolve({ folders, files });
      } else if (data.action === pickerNs.Action.CANCEL) {
        resolve(null);
      }
    });

    const picker = builder.build();
    picker.setVisible(true);
  });
}
