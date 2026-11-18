const DB_NAME = 'central_estudos_blobs_v1';
const DB_VERSION = 2;
const STORE_NAME = 'files';
const STATE_STORE_NAME = 'app_state';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STATE_STORE_NAME)) {
        db.createObjectStore(STATE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir armazenamento local de arquivos.'));
  });
}

export interface StoredDatabaseSnapshot {
  raw: string;
  updatedAt: string;
  byteLength: number;
}

export async function ensurePersistentBrowserStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return false;
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    if (typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
    return false;
  } catch {
    return false;
  }
}

export async function saveScopedDatabaseJson(
  scope: string,
  jsonString: string,
  updatedAt = new Date().toISOString(),
): Promise<void> {
  if (!jsonString) return;
  try {
    const db = await openDatabase();
    const key = scope && scope.trim() ? scope.trim() : 'offline_guest';
    const redundantKey = `redundant_backup::${key}`;
    const record: StoredDatabaseSnapshot = {
      raw: jsonString,
      updatedAt,
      byteLength: jsonString.length,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATE_STORE_NAME);
      store.put(record, key);
      store.put(record, redundantKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Não foi possível gravar o banco no IndexedDB.'));
    });
  } catch {
    // Ignore when IndexedDB is unavailable (private mode / quota)
  }
}

function isValidStoredDatabaseSnapshot(res: StoredDatabaseSnapshot | undefined): res is StoredDatabaseSnapshot {
  if (!res || typeof res.raw !== 'string' || !res.raw.trim()) return false;
  try {
    const parsed = JSON.parse(res.raw);
    return Boolean(parsed && typeof parsed === 'object');
  } catch {
    return false;
  }
}

export async function loadScopedDatabaseJson(scope: string): Promise<StoredDatabaseSnapshot | null> {
  try {
    const db = await openDatabase();
    const key = scope && scope.trim() ? scope.trim() : 'offline_guest';
    const redundantKey = `redundant_backup::${key}`;
    return await new Promise<StoredDatabaseSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readonly');
      const store = tx.objectStore(STATE_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const res = req.result as StoredDatabaseSnapshot | undefined;
        if (isValidStoredDatabaseSnapshot(res)) {
          resolve(res);
          return;
        }
        const backupReq = store.get(redundantKey);
        backupReq.onsuccess = () => {
          const backupRes = backupReq.result as StoredDatabaseSnapshot | undefined;
          resolve(isValidStoredDatabaseSnapshot(backupRes) ? backupRes : null);
        };
        backupReq.onerror = () => resolve(null);
      };
      req.onerror = () => reject(req.error || new Error('Falha ao ler banco do IndexedDB.'));
    });
  } catch {
    return null;
  }
}

export async function saveScopedSyncMeta(scope: string, meta: unknown): Promise<void> {
  if (!meta || typeof meta !== 'object') return;
  try {
    const db = await openDatabase();
    const cleanScope = scope && scope.trim() ? scope.trim() : 'offline_guest';
    const key = `sync_meta::${cleanScope}`;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      tx.objectStore(STATE_STORE_NAME).put(meta, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Não foi possível gravar metadados de sincronização.'));
    });
  } catch {
    // Ignore when IndexedDB is unavailable
  }
}

export async function loadScopedSyncMeta<T = Record<string, unknown>>(scope: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    const cleanScope = scope && scope.trim() ? scope.trim() : 'offline_guest';
    const key = `sync_meta::${cleanScope}`;
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readonly');
      const req = tx.objectStore(STATE_STORE_NAME).get(key);
      req.onsuccess = () => {
        const res = req.result as T | undefined;
        resolve(res && typeof res === 'object' ? res : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export interface CachedDriveJsonRecord {
  fileId: string;
  versionStamp: string;
  payload: unknown;
  cachedAt: string;
}

export async function saveDriveJsonCacheEntry(
  fileId: string,
  versionStamp: string,
  payload: unknown,
  customScope?: string,
): Promise<void> {
  if (!fileId || !versionStamp) return;
  try {
    const db = await openDatabase();
    const scope = customScope && customScope.trim() ? customScope.trim() : currentStorageScope;
    const key = `drive_json_cache::${scope}::${fileId}`;
    const record: CachedDriveJsonRecord = {
      fileId,
      versionStamp,
      payload,
      cachedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      tx.objectStore(STATE_STORE_NAME).put(record, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore cache write errors
  }
}

export async function loadDriveJsonCacheEntry(
  fileId: string,
  versionStamp: string,
  customScope?: string,
): Promise<unknown | null> {
  if (!fileId || !versionStamp) return null;
  try {
    const db = await openDatabase();
    const scope = customScope && customScope.trim() ? customScope.trim() : currentStorageScope;
    const key = `drive_json_cache::${scope}::${fileId}`;
    return await new Promise<unknown | null>((resolve) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readonly');
      const req = tx.objectStore(STATE_STORE_NAME).get(key);
      req.onsuccess = () => {
        const rec = req.result as CachedDriveJsonRecord | undefined;
        if (rec && rec.versionStamp === versionStamp && rec.payload !== undefined) {
          resolve(rec.payload);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearDriveJsonCacheForScope(customScope?: string): Promise<void> {
  try {
    const db = await openDatabase();
    const scope = customScope && customScope.trim() ? customScope.trim() : currentStorageScope;
    const prefix = `drive_json_cache::${scope}::`;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATE_STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          if (String(cursor.key).startsWith(prefix)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore cleanup errors
  }
}

let currentStorageScope = 'offline_guest';

export function setStorageUserScope(scope: string | null | undefined): void {
  currentStorageScope = scope && scope.trim() ? scope.trim() : 'offline_guest';
}

export function getStorageUserScope(): string {
  return currentStorageScope;
}

function makeScopedKey(key: string, customScope?: string): string {
  const scope = customScope && customScope.trim() ? customScope.trim() : currentStorageScope;
  if (key.includes('::')) return key;
  return `${scope}::${key}`;
}

function stripScope(fullKey: string): string {
  const idx = fullKey.indexOf('::');
  return idx >= 0 ? fullKey.slice(idx + 2) : fullKey;
}

export async function saveFileBlob(key: string, blob: Blob, customScope?: string): Promise<void> {
  const db = await openDatabase();
  const scopedKey = makeScopedKey(key, customScope);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, scopedKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Não foi possível salvar o arquivo.'));
  });
}

export async function getFileBlob(key: string, customScope?: string): Promise<Blob | null> {
  if (!key) return null;
  try {
    const db = await openDatabase();
    const scopedKey = makeScopedKey(key, customScope);
    const scopedResult = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(scopedKey);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error || new Error('Falha ao ler arquivo local.'));
    });

    if (scopedResult) return scopedResult;

    // Backward-compatibility: if not found with scope prefix and key doesn't have '::',
    // check legacy unscoped key and migrate it to current user scope.
    if (!key.includes('::')) {
      const legacyResult = await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve((req.result as Blob) || null);
        req.onerror = () => reject(req.error || new Error('Falha ao ler arquivo local.'));
      });

      if (legacyResult) {
        try {
          await saveFileBlob(key, legacyResult, customScope);
        } catch {
          // ignore migration error
        }
        return legacyResult;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function getAllFileBlobs(customScope?: string): Promise<Array<{ key: string; blob: Blob }>> {
  try {
    const db = await openDatabase();
    const activeScope = customScope && customScope.trim() ? customScope.trim() : currentStorageScope;
    const prefix = `${activeScope}::`;

    return await new Promise<Array<{ key: string; blob: Blob }>>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const results: Array<{ key: string; blob: Blob }> = [];
      const seenRawKeys = new Set<string>();

      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const strKey = String(cursor.key);
          if (strKey.startsWith(prefix)) {
            const rawKey = stripScope(strKey);
            seenRawKeys.add(rawKey);
            results.push({ key: rawKey, blob: cursor.value as Blob });
          } else if (!strKey.includes('::') && activeScope === 'offline_guest') {
            if (!seenRawKeys.has(strKey)) {
              seenRawKeys.add(strKey);
              results.push({ key: strKey, blob: cursor.value as Blob });
            }
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error || new Error('Falha ao listar arquivos locais.'));
    });
  } catch {
    return [];
  }
}

export async function deleteFileBlob(key: string, customScope?: string): Promise<void> {
  if (!key) return;
  try {
    const db = await openDatabase();
    const scopedKey = makeScopedKey(key, customScope);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(scopedKey);
      if (!key.includes('::')) {
        store.delete(key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Falha ao excluir arquivo local.'));
    });
  } catch {
    // Ignore storage cleanup errors when blob store is unavailable.
  }
}

export async function clearAllFileBlobs(scopeOnly = true): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      if (!scopeOnly) {
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        return;
      }

      const prefix = `${currentStorageScope}::`;
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const strKey = String(cursor.key);
          if (strKey.startsWith(prefix) || (!strKey.includes('::') && currentStorageScope === 'offline_guest')) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ============================================================================
// 1. SHA-256 Content Hash Deduplication for Local & Drive Blobs
// ============================================================================

export interface BlobSha256IndexRecord {
  hashToKey: Record<string, string>;
  keyToHash: Record<string, string>;
  updatedAt: string;
}

function getScopedBlobHashIndexKey(scope = currentStorageScope): string {
  return `blob_sha256_index::${scope || 'offline_guest'}`;
}

export async function computeBlobSha256(blob: Blob): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buffer = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    }
  } catch {
    // fallback below
  }
  const text = await blob.text().catch(() => `${blob.size}:${blob.type}`);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${blob.size}_${(h >>> 0).toString(16)}`;
}

export async function loadBlobSha256Index(
  scope = currentStorageScope,
): Promise<BlobSha256IndexRecord> {
  try {
    const db = await openDatabase();
    const res = await new Promise<BlobSha256IndexRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readonly');
      const store = tx.objectStore(STATE_STORE_NAME);
      const req = store.get(getScopedBlobHashIndexKey(scope));
      req.onsuccess = () => resolve(req.result as BlobSha256IndexRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    if (res && res.hashToKey && res.keyToHash) {
      return res;
    }
  } catch {
    // ignore
  }
  return { hashToKey: {}, keyToHash: {}, updatedAt: '' };
}

export async function saveFileBlobWithDedup(
  key: string,
  blob: Blob,
  scope = currentStorageScope,
): Promise<{ key: string; sha256: string; deduplicatedFromKey: string | null }> {
  const [sha256, index] = await Promise.all([
    computeBlobSha256(blob),
    loadBlobSha256Index(scope),
  ]);
  const existingKey = index.hashToKey[sha256] || null;
  await saveFileBlob(key, blob, scope);
  try {
    index.hashToKey[sha256] = existingKey || key;
    index.keyToHash[key] = sha256;
    index.updatedAt = new Date().toISOString();
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATE_STORE_NAME);
      store.put(index, getScopedBlobHashIndexKey(scope));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore index update failure
  }
  return {
    key,
    sha256,
    deduplicatedFromKey: existingKey && existingKey !== key ? existingKey : null,
  };
}

// ============================================================================
// 2. Persistent IndexedDB Outbox Queue for Google Drive File Uploads
// ============================================================================

export interface DriveUploadOutboxItem {
  id: string;
  blobKey: string;
  filename: string;
  subfolder?: string;
  moduleTag?: string;
  sourceAction?: string;
  existingFileId?: string;
  sha256?: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

function getScopedDriveOutboxKey(scope = currentStorageScope): string {
  return `drive_upload_outbox::${scope || 'offline_guest'}`;
}

export async function getDriveUploadOutbox(
  scope = currentStorageScope,
): Promise<DriveUploadOutboxItem[]> {
  try {
    const db = await openDatabase();
    const res = await new Promise<DriveUploadOutboxItem[] | undefined>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readonly');
      const store = tx.objectStore(STATE_STORE_NAME);
      const req = store.get(getScopedDriveOutboxKey(scope));
      req.onsuccess = () => resolve(req.result as DriveUploadOutboxItem[] | undefined);
      req.onerror = () => reject(req.error);
    });
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

export async function enqueueDriveUploadOutbox(
  item: Omit<DriveUploadOutboxItem, 'id' | 'queuedAt' | 'attempts'> & {
    id?: string;
    queuedAt?: string;
    attempts?: number;
  },
  scope = currentStorageScope,
): Promise<DriveUploadOutboxItem[]> {
  try {
    const existing = await getDriveUploadOutbox(scope);
    const dedupIdx = existing.findIndex(
      (e) =>
        e.blobKey === item.blobKey ||
        (item.sha256 && e.sha256 === item.sha256 && e.subfolder === item.subfolder) ||
        (e.filename === item.filename && e.subfolder === item.subfolder),
    );
    const entry: DriveUploadOutboxItem = {
      id: item.id || `${item.blobKey || item.filename}::${item.subfolder || 'root'}`,
      blobKey: item.blobKey,
      filename: item.filename,
      subfolder: item.subfolder,
      moduleTag: item.moduleTag,
      sourceAction: item.sourceAction,
      existingFileId: item.existingFileId,
      sha256: item.sha256,
      queuedAt: item.queuedAt || new Date().toISOString(),
      attempts: item.attempts ?? (dedupIdx >= 0 ? existing[dedupIdx].attempts : 0),
      lastError: item.lastError,
    };
    const next = [...existing];
    if (dedupIdx >= 0) {
      next[dedupIdx] = entry;
    } else {
      next.push(entry);
    }
    const trimmed = next.slice(-150);
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATE_STORE_NAME);
      store.put(trimmed, getScopedDriveOutboxKey(scope));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return trimmed;
  } catch {
    return [];
  }
}

export async function removeDriveUploadOutboxItem(
  idOrBlobKey: string,
  scope = currentStorageScope,
): Promise<DriveUploadOutboxItem[]> {
  try {
    const existing = await getDriveUploadOutbox(scope);
    const next = existing.filter((e) => e.id !== idOrBlobKey && e.blobKey !== idOrBlobKey);
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATE_STORE_NAME);
      store.put(next, getScopedDriveOutboxKey(scope));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return next;
  } catch {
    return [];
  }
}

export async function clearDriveUploadOutbox(scope = currentStorageScope): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATE_STORE_NAME);
      store.delete(getScopedDriveOutboxKey(scope));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

// ============================================================================
// 3. Automatic Local Restore Points (Version History Before Cloud Merges)
// ============================================================================

export interface LocalRestorePointMeta {
  id: string;
  createdAt: string;
  label: string;
  reason: 'auto-pre-restore' | 'auto-pre-merge' | 'manual';
  contentHash: string;
  byteLength: number;
  stats: {
    questions: number;
    laws: number;
    contests: number;
    errors: number;
  };
}

interface StoredLocalRestorePoint extends LocalRestorePointMeta {
  rawJson: string;
}

const MAX_LOCAL_RESTORE_POINTS = 5;

function getScopedRestorePointsKey(scope = currentStorageScope): string {
  return `restore_points::${scope || 'offline_guest'}`;
}

async function readStoredRestorePoints(
  scope = currentStorageScope,
): Promise<StoredLocalRestorePoint[]> {
  try {
    const db = await openDatabase();
    const res = await new Promise<StoredLocalRestorePoint[] | undefined>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readonly');
      const store = tx.objectStore(STATE_STORE_NAME);
      const req = store.get(getScopedRestorePointsKey(scope));
      req.onsuccess = () => resolve(req.result as StoredLocalRestorePoint[] | undefined);
      req.onerror = () => reject(req.error);
    });
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

export async function listLocalRestorePoints(
  scope = currentStorageScope,
): Promise<LocalRestorePointMeta[]> {
  const list = await readStoredRestorePoints(scope);
  return list.map(({ rawJson: _raw, ...meta }) => meta);
}

export async function createLocalRestorePoint(
  scope: string,
  rawJson: string,
  options: {
    label: string;
    reason: LocalRestorePointMeta['reason'];
    contentHash: string;
    stats: LocalRestorePointMeta['stats'];
  },
): Promise<LocalRestorePointMeta[]> {
  if (!rawJson) return listLocalRestorePoints(scope);
  try {
    const current = await readStoredRestorePoints(scope);
    if (
      options.reason !== 'manual' &&
      current.length > 0 &&
      current[0].contentHash === options.contentHash
    ) {
      return current.map(({ rawJson: _raw, ...meta }) => meta);
    }
    const entry: StoredLocalRestorePoint = {
      id: `rp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      label: options.label,
      reason: options.reason,
      contentHash: options.contentHash,
      byteLength: rawJson.length,
      stats: options.stats,
      rawJson,
    };
    const next = [
      entry,
      ...current.filter((item) => item.contentHash !== options.contentHash || options.reason === 'manual'),
    ].slice(0, MAX_LOCAL_RESTORE_POINTS);
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATE_STORE_NAME);
      store.put(next, getScopedRestorePointsKey(scope));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return next.map(({ rawJson: _raw, ...meta }) => meta);
  } catch {
    return [];
  }
}

export async function loadLocalRestorePointJson(
  scope: string,
  restorePointId: string,
): Promise<string | null> {
  const list = await readStoredRestorePoints(scope);
  const found = list.find((item) => item.id === restorePointId);
  return found?.rawJson || null;
}

export async function deleteLocalRestorePoint(
  scope: string,
  restorePointId: string,
): Promise<LocalRestorePointMeta[]> {
  try {
    const current = await readStoredRestorePoints(scope);
    const next = current.filter((item) => item.id !== restorePointId);
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STATE_STORE_NAME);
      store.put(next, getScopedRestorePointsKey(scope));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return next.map(({ rawJson: _raw, ...meta }) => meta);
  } catch {
    return [];
  }
}

