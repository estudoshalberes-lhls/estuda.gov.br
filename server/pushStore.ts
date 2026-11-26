import fs from 'node:fs';
import path from 'node:path';

export interface StoredPushSubscription {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  userAgent?: string;
  reminderHours?: number[];
  createdAt: string;
  updatedAt: string;
}

interface PersistedPushStoreFile {
  version: 1;
  updatedAt: string;
  subscriptions: StoredPushSubscription[];
}

const MAX_SUBSCRIPTIONS = 500;
const BASE_DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.resolve(BASE_DATA_DIR, 'push-subscriptions.json');

function assertConfinedPath(targetPath: string): void {
  const normalizedBase = BASE_DATA_DIR.endsWith(path.sep)
    ? BASE_DATA_DIR
    : `${BASE_DATA_DIR}${path.sep}`;
  if (!targetPath.startsWith(normalizedBase)) {
    throw new Error('Caminho de persistência fora do diretório permitido.');
  }
}

function isValidPushEndpoint(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return endpoint.length <= 2048;
  } catch {
    return false;
  }
}

export class PersistentPushStore {
  private readonly subscriptions = new Map<string, StoredPushSubscription>();
  private lastSavedAt: string | null = null;
  private loadedFromDisk = false;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      assertConfinedPath(STORE_FILE);
      if (!fs.existsSync(STORE_FILE)) {
        this.loadedFromDisk = true;
        return;
      }
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedPushStoreFile>;
      if (Array.isArray(parsed.subscriptions)) {
        for (const item of parsed.subscriptions) {
          if (item && typeof item.endpoint === 'string' && isValidPushEndpoint(item.endpoint)) {
            this.subscriptions.set(item.endpoint, {
              endpoint: item.endpoint,
              keys: item.keys,
              userAgent: typeof item.userAgent === 'string' ? item.userAgent.slice(0, 240) : undefined,
              reminderHours: Array.isArray(item.reminderHours)
                ? item.reminderHours.filter((h) => typeof h === 'number' && h >= 0 && h <= 23)
                : undefined,
              createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
              updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
            });
          }
        }
      }
      this.lastSavedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
      this.loadedFromDisk = true;
    } catch (err) {
      console.warn('[PushStore] Não foi possível carregar inscrições salvas:', (err as Error)?.message);
      this.loadedFromDisk = false;
    }
  }

  private persistToDisk(): void {
    try {
      assertConfinedPath(STORE_FILE);
      fs.mkdirSync(BASE_DATA_DIR, { recursive: true });
      const nowIso = new Date().toISOString();
      const payload: PersistedPushStoreFile = {
        version: 1,
        updatedAt: nowIso,
        subscriptions: Array.from(this.subscriptions.values()),
      };
      const tmpFile = path.resolve(BASE_DATA_DIR, `push-subscriptions.${process.pid}.${Date.now()}.tmp`);
      assertConfinedPath(tmpFile);
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpFile, STORE_FILE);
      this.lastSavedAt = nowIso;
    } catch (err) {
      console.error('[PushStore] Falha ao persistir inscrições Push:', (err as Error)?.message);
    }
  }

  upsert(input: {
    endpoint: string;
    keys?: Record<string, unknown>;
    userAgent?: string;
    reminderHours?: unknown;
  }): { ok: true; subscription: StoredPushSubscription } | { ok: false; error: string } {
    const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
    if (!endpoint || !isValidPushEndpoint(endpoint)) {
      return { ok: false, error: 'Inscrição Push inválida (endpoint ausente ou não permitido).' };
    }

    const existing = this.subscriptions.get(endpoint);
    if (!existing && this.subscriptions.size >= MAX_SUBSCRIPTIONS) {
      // Evict oldest subscription to avoid unbounded disk growth
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.subscriptions.entries()) {
        const ts = Date.parse(v.updatedAt) || 0;
        if (ts < oldestTime) {
          oldestTime = ts;
          oldestKey = k;
        }
      }
      if (oldestKey) this.subscriptions.delete(oldestKey);
    }

    const sanitizedKeys =
      input.keys && typeof input.keys === 'object'
        ? {
            ...(typeof input.keys.p256dh === 'string' ? { p256dh: input.keys.p256dh.slice(0, 256) } : {}),
            ...(typeof input.keys.auth === 'string' ? { auth: input.keys.auth.slice(0, 128) } : {}),
          }
        : undefined;

    const reminderHours = Array.isArray(input.reminderHours)
      ? input.reminderHours
          .map((h) => Number(h))
          .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
          .slice(0, 12)
      : existing?.reminderHours;

    const nowIso = new Date().toISOString();
    const record: StoredPushSubscription = {
      endpoint,
      keys: sanitizedKeys && Object.keys(sanitizedKeys).length > 0 ? sanitizedKeys : existing?.keys,
      userAgent: typeof input.userAgent === 'string' ? input.userAgent.slice(0, 240) : existing?.userAgent,
      reminderHours,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    this.subscriptions.set(endpoint, record);
    this.persistToDisk();
    return { ok: true, subscription: record };
  }

  remove(endpoint: string): boolean {
    const clean = typeof endpoint === 'string' ? endpoint.trim() : '';
    if (!clean) return false;
    const deleted = this.subscriptions.delete(clean);
    if (deleted) {
      this.persistToDisk();
    }
    return deleted;
  }

  getStats(): {
    activeSubscriptions: number;
    persisted: boolean;
    lastSavedAt: string | null;
  } {
    return {
      activeSubscriptions: this.subscriptions.size,
      persisted: this.loadedFromDisk || this.lastSavedAt !== null,
      lastSavedAt: this.lastSavedAt,
    };
  }
}
