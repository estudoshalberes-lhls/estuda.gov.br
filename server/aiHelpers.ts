import crypto from 'node:crypto';
import type { Response } from 'express';

export interface ValidationSuccess<T> {
  ok: true;
  data: T;
}

export interface ValidationFailure {
  ok: false;
  error: string;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function cleanString(value: unknown, maxLen: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

export interface ValidatedEditalPayload {
  text: string;
  defaultSubject: string;
  contestName: string;
}

export function validateEditalPayload(body: unknown): ValidationResult<ValidatedEditalPayload> {
  const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const text = cleanString(obj.text, 60_000);
  if (text.length < 10) {
    return { ok: false, error: 'Cole o conteúdo programático do edital para analisar (mínimo de 10 caracteres).' };
  }
  return {
    ok: true,
    data: {
      text,
      defaultSubject: cleanString(obj.defaultSubject, 140) || 'Geral',
      contestName: cleanString(obj.contestName, 160),
    },
  };
}

export interface ValidatedEssayPayload {
  title: string;
  essayText: string;
  banca: string;
}

export function validateEssayPayload(body: unknown): ValidationResult<ValidatedEssayPayload> {
  const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const essayText = cleanString(obj.essayText, 40_000);
  if (essayText.length < 30) {
    return { ok: false, error: 'Texto da dissertação/peça insuficiente para correção (mínimo de 30 caracteres).' };
  }
  return {
    ok: true,
    data: {
      title: cleanString(obj.title, 200) || 'Não informado',
      essayText,
      banca: cleanString(obj.banca, 120),
    },
  };
}

export interface ValidatedQuestionsPayload {
  subject: string;
  topic: string;
  count: number;
  banca: string;
}

export function validateQuestionsPayload(body: unknown): ValidationResult<ValidatedQuestionsPayload> {
  const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const topic = cleanString(obj.topic, 300);
  if (topic.length < 2) {
    return { ok: false, error: 'Informe o tópico jurídico para gerar questões.' };
  }
  const rawCount = Number(obj.count);
  const count = Number.isFinite(rawCount) ? Math.min(10, Math.max(1, Math.round(rawCount))) : 5;
  return {
    ok: true,
    data: {
      subject: cleanString(obj.subject, 140) || 'Direito',
      topic,
      count,
      banca: cleanString(obj.banca, 120),
    },
  };
}

export type ValidSummaryMode = 'summary' | 'questions' | 'flashcards' | 'mindmap';

export interface ValidatedSummaryPayload {
  mode: ValidSummaryMode;
  subject: string;
  title: string;
  sourceText: string;
  count: number;
  banca: string;
}

const VALID_SUMMARY_MODES = new Set<ValidSummaryMode>(['summary', 'questions', 'flashcards', 'mindmap']);

export function validateSummaryPayload(body: unknown): ValidationResult<ValidatedSummaryPayload> {
  const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const sourceText = cleanString(obj.sourceText, 32_000);
  if (sourceText.length < 20) {
    return {
      ok: false,
      error: 'Conteúdo muito curto para análise com IA (mínimo de 20 caracteres).',
    };
  }
  const rawMode = cleanString(obj.mode, 32) as ValidSummaryMode;
  const mode: ValidSummaryMode = VALID_SUMMARY_MODES.has(rawMode) ? rawMode : 'summary';
  const rawCount = Number(obj.count);
  const maxCount = mode === 'flashcards' ? 12 : 8;
  const defaultCount = mode === 'flashcards' ? 6 : 5;
  const count = Number.isFinite(rawCount)
    ? Math.min(maxCount, Math.max(2, Math.round(rawCount)))
    : defaultCount;

  return {
    ok: true,
    data: {
      mode,
      subject: cleanString(obj.subject, 140) || 'Geral',
      title: cleanString(obj.title, 200) || 'Material de Estudo',
      sourceText,
      count,
      banca: cleanString(obj.banca, 120),
    },
  };
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class AiResponseCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(maxEntries = 80, ttlMs = 15 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  buildKey(route: string, payload: unknown): string {
    return crypto
      .createHash('sha256')
      .update(`${route}:${JSON.stringify(payload)}`)
      .digest('hex');
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }
    // Refresh LRU order
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  getStats(): { entries: number; maxEntries: number; hits: number; misses: number } {
    return {
      entries: this.store.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

function isRetryableError(err: unknown): boolean {
  const status = Number((err as { status?: number; code?: number })?.status || (err as { code?: number })?.code || 0);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = String((err as Error)?.message || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded')
  );
}

export async function withTimeoutAndRetry<T>(
  operation: () => Promise<T>,
  options: { timeoutMs?: number; maxRetries?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxRetries = options.maxRetries ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race<T>([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Tempo limite excedido (${Math.round(timeoutMs / 1000)}s) ao aguardar resposta da IA.`));
          }, timeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastError = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        const delayMs = 650 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export function initSseResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

export function writeSseEvent(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
