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

function isLocalOfflineServerRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}

export async function mirrorReadableFileToLocalServer(
  blob: Blob,
  fileName: string,
  subfolders: string[],
): Promise<boolean> {
  if (!isLocalOfflineServerRuntime()) return false;
  try {
    const res = await fetch('/api/local-disk/readable-file', {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'x-file-name': encodeURIComponent(fileName || 'arquivo.pdf'),
        'x-subfolders': encodeURIComponent(subfolders.filter(Boolean).join('/')),
      },
      body: blob,
    });
    return res.ok;
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
  const key = scope && scope.trim() ? scope.trim() : 'offline_guest';

  if (isLocalOfflineServerRuntime()) {
    void fetch('/api/local-disk/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: key, raw: jsonString, updatedAt }),
    }).catch(() => {
      // Ignore if local server is unreachable
    });
  }

  try {
    const db = await openDatabase();
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
  const key = scope && scope.trim() ? scope.trim() : 'offline_guest';
  let idbSnapshot: StoredDatabaseSnapshot | null = null;

  try {
    const db = await openDatabase();
    const redundantKey = `redundant_backup::${key}`;
    idbSnapshot = await new Promise<StoredDatabaseSnapshot | null>((resolve, reject) => {
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
    idbSnapshot = null;
  }

  if (isLocalOfflineServerRuntime()) {
    try {
      const res = await fetch(`/api/local-disk/db?scope=${encodeURIComponent(key)}`);
      if (res.ok) {
        const data = (await res.json()) as { found?: boolean; snapshot?: StoredDatabaseSnapshot };
        if (data?.found && isValidStoredDatabaseSnapshot(data.snapshot)) {
          if (!idbSnapshot || (data.snapshot.updatedAt || '') >= (idbSnapshot.updatedAt || '')) {
            return data.snapshot;
          }
        }
      }
    } catch {
      // Ignore network error
    }
  }

  return idbSnapshot;
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
  const scopedKey = makeScopedKey(key, customScope);

  if (isLocalOfflineServerRuntime()) {
    void fetch(`/api/local-disk/blob?key=${encodeURIComponent(scopedKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'x-blob-key': scopedKey,
      },
      body: blob,
    }).catch(() => {
      // Ignore if local server is unreachable
    });
  }

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, scopedKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Não foi possível salvar o arquivo.'));
  });
}

export async function getFileBlob(key: string, customScope?: string): Promise<Blob | null> {
  if (!key) return null;
  const scopedKey = makeScopedKey(key, customScope);
  try {
    const db = await openDatabase();
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
  } catch {
    // Fall through to local disk fallback if available
  }

  if (isLocalOfflineServerRuntime()) {
    try {
      const res = await fetch(`/api/local-disk/blob?key=${encodeURIComponent(scopedKey)}`);
      if (res.ok) {
        const diskBlob = await res.blob();
        if (diskBlob && diskBlob.size > 0) {
          try {
            const db = await openDatabase();
            await new Promise<void>((resolve) => {
              const tx = db.transaction(STORE_NAME, 'readwrite');
              tx.objectStore(STORE_NAME).put(diskBlob, scopedKey);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            });
          } catch {
            // ignore cache restore error
          }
          return diskBlob;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
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
  const scopedKey = makeScopedKey(key, customScope);
  if (isLocalOfflineServerRuntime()) {
    void fetch(`/api/local-disk/blob?key=${encodeURIComponent(scopedKey)}`, {
      method: 'DELETE',
    }).catch(() => {
      // ignore
    });
  }
  try {
    const db = await openDatabase();
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

const LOCAL_DIR_HANDLE_IDB_KEY = 'local_directory_handle_v1';

export async function saveLocalDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  if (!handle) return;
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      tx.objectStore(STATE_STORE_NAME).put(handle, LOCAL_DIR_HANDLE_IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Não foi possível salvar referência da pasta local.'));
    });
  } catch {
    // Ignore when browser does not allow cloning FileSystemDirectoryHandle
  }
}

export async function loadLocalDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDatabase();
    return await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readonly');
      const req = tx.objectStore(STATE_STORE_NAME).get(LOCAL_DIR_HANDLE_IDB_KEY);
      req.onsuccess = () => {
        const res = req.result as FileSystemDirectoryHandle | undefined;
        resolve(res && typeof res === 'object' && 'kind' in res && res.kind === 'directory' ? res : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearLocalDirectoryHandle(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STATE_STORE_NAME, 'readwrite');
      tx.objectStore(STATE_STORE_NAME).delete(LOCAL_DIR_HANDLE_IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

