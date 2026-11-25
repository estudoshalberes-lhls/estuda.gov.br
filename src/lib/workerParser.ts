import { parseLawTextToItems, parseUploadedQuestions } from './parsers';
import { LawItem, Question } from '../types/study';
import type { ParserWorkerRequest, ParserWorkerResponse } from '../workers/textParser.worker';

const WORKER_THRESHOLD_BYTES = 35_000;

let sharedWorker: Worker | null = null;
let workerUnavailable = false;
let reqCounter = 0;

const pendingMap = new Map<
  string,
  {
    resolve: (val: unknown) => void;
    reject: (err: Error) => void;
  }
>();

function getParserWorker(): Worker | null {
  if (workerUnavailable || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (sharedWorker) return sharedWorker;
  try {
    const worker = new Worker(new URL('../workers/textParser.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ParserWorkerResponse>) => {
      const msg = event.data;
      const entry = pendingMap.get(msg.id);
      if (!entry) return;
      pendingMap.delete(msg.id);
      if (msg.ok) {
        entry.resolve(msg.result);
      } else {
        entry.reject(new Error(msg.error));
      }
    };
    worker.onerror = (err) => {
      console.warn('[workerParser] Falling back to main thread parser:', err.message);
      workerUnavailable = true;
      sharedWorker = null;
      for (const [, entry] of pendingMap) {
        entry.reject(new Error('Worker unavailable'));
      }
      pendingMap.clear();
    };
    sharedWorker = worker;
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

type ParserWorkerPayload =
  | { type: 'parseLawTextToItems'; fileName: string; rawText: string }
  | { type: 'parseUploadedQuestions'; text: string; defaultSubject: string };

function runWorkerRequest<T>(payload: ParserWorkerPayload): Promise<T> {
  const worker = getParserWorker();
  if (!worker) {
    return Promise.reject(new Error('Worker unavailable'));
  }
  const id = `pw_${++reqCounter}_${Date.now()}`;
  const message: ParserWorkerRequest = { ...payload, id };
  return new Promise<T>((resolve, reject) => {
    pendingMap.set(id, {
      resolve: resolve as (val: unknown) => void,
      reject,
    });
    worker.postMessage(message);
  });
}

/**
 * Parses law text in a background Web Worker when large (>= 35 KB), avoiding UI freezes.
 */
export async function parseLawTextToItemsAsync(fileName: string, rawText: string): Promise<LawItem[]> {
  if (rawText.length < WORKER_THRESHOLD_BYTES) {
    return parseLawTextToItems(fileName, rawText);
  }
  try {
    return await runWorkerRequest<LawItem[]>({
      type: 'parseLawTextToItems',
      fileName,
      rawText,
    });
  } catch {
    return parseLawTextToItems(fileName, rawText);
  }
}

/**
 * Parses uploaded question bank text in a background Web Worker when large (>= 35 KB), avoiding UI freezes.
 */
export async function parseUploadedQuestionsAsync(
  text: string,
  defaultSubject = 'Geral',
): Promise<Question[]> {
  if (text.length < WORKER_THRESHOLD_BYTES) {
    return parseUploadedQuestions(text, defaultSubject);
  }
  try {
    return await runWorkerRequest<Question[]>({
      type: 'parseUploadedQuestions',
      text,
      defaultSubject,
    });
  } catch {
    return parseUploadedQuestions(text, defaultSubject);
  }
}
