export type LocalPiperVoiceId = 'pt_BR-faber-medium' | 'pt_BR-edresson-low';

export interface LocalPiperVoiceSpec {
  id: LocalPiperVoiceId;
  label: string;
  shortName: string;
  sizeMb: number;
}

export const LOCAL_PIPER_VOICES: ReadonlyArray<LocalPiperVoiceSpec> = [
  {
    id: 'pt_BR-faber-medium',
    label: 'Faber · Neural pt-BR (Alta clareza)',
    shortName: 'Faber',
    sizeMb: 60,
  },
  {
    id: 'pt_BR-edresson-low',
    label: 'Edresson · Neural pt-BR (Rápida)',
    shortName: 'Edresson',
    sizeMb: 60,
  },
];

export const VALID_LOCAL_PIPER_IDS = new Set<string>(LOCAL_PIPER_VOICES.map((v) => v.id));

export interface LocalPiperProgress {
  stage: 'download' | 'inference';
  loaded: number;
  total: number;
  percent: number;
}

type WorkerResponse =
  | { id: number; type: 'stored'; voices: string[] }
  | { id: number; type: 'downloaded'; voiceId: string }
  | { id: number; type: 'removed'; voiceId: string }
  | {
      id: number;
      type: 'progress';
      stage: 'download' | 'inference';
      loaded: number;
      total: number;
    }
  | { id: number; type: 'result'; buffer: ArrayBuffer; mimeType: string }
  | { id: number; type: 'error'; message: string };

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  onProgress?: (p: LocalPiperProgress) => void;
}

let workerInstance: Worker | null = null;
let workerFailed = false;
let nextRequestId = 1;
const pendingCalls = new Map<number, PendingCall>();

export function isLocalPiperSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly === 'object';
}

function getOrCreateWorker(): Worker | null {
  if (workerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (workerInstance) return workerInstance;

  try {
    const worker = new Worker(new URL('../workers/piperTtsWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (!msg || typeof msg.id !== 'number') return;
      const call = pendingCalls.get(msg.id);
      if (!call) return;

      if (msg.type === 'progress') {
        const pct =
          msg.total > 0 ? Math.min(100, Math.max(0, Math.round((msg.loaded / msg.total) * 100))) : 0;
        call.onProgress?.({
          stage: msg.stage,
          loaded: msg.loaded,
          total: msg.total,
          percent: pct,
        });
        return;
      }

      pendingCalls.delete(msg.id);
      if (msg.type === 'error') {
        call.reject(new Error(msg.message));
      } else if (msg.type === 'stored') {
        call.resolve(msg.voices);
      } else if (msg.type === 'downloaded' || msg.type === 'removed') {
        call.resolve(undefined);
      } else if (msg.type === 'result') {
        call.resolve(new Blob([msg.buffer], { type: msg.mimeType || 'audio/wav' }));
      }
    });

    worker.addEventListener('error', (err) => {
      workerFailed = true;
      workerInstance = null;
      const failure = new Error(err.message || 'Falha no Web Worker da voz neural local.');
      pendingCalls.forEach((call) => call.reject(failure));
      pendingCalls.clear();
    });

    workerInstance = worker;
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function callWorker<T>(
  payload: Record<string, unknown>,
  onProgress?: (p: LocalPiperProgress) => void,
  signal?: AbortSignal,
): Promise<T> {
  const worker = getOrCreateWorker();
  if (!worker) {
    return Promise.reject(new Error('WORKER_UNAVAILABLE'));
  }

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      const abortErr = new Error('Síntese cancelada.');
      abortErr.name = 'AbortError';
      reject(abortErr);
      return;
    }

    const id = nextRequestId++;
    const onAbort = () => {
      if (pendingCalls.has(id)) {
        pendingCalls.delete(id);
        const abortErr = new Error('Síntese cancelada.');
        abortErr.name = 'AbortError';
        reject(abortErr);
      }
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    pendingCalls.set(id, {
      resolve: (val) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(val as T);
      },
      reject: (err) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      },
      onProgress,
    });

    worker.postMessage({ id, ...payload });
  });
}

// Main-thread fallback (only if Web Workers are blocked in a restricted context)
const ONNX_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';

async function loadMainThreadPiper() {
  return import('@mintplex-labs/piper-tts-web');
}

export async function getStoredLocalPiperVoices(): Promise<LocalPiperVoiceId[]> {
  if (!isLocalPiperSupported()) return [];
  try {
    const raw = await callWorker<string[]>({ type: 'stored' });
    return raw.filter((v): v is LocalPiperVoiceId => VALID_LOCAL_PIPER_IDS.has(v));
  } catch {
    try {
      const mod = await loadMainThreadPiper();
      const raw = await mod.stored();
      return raw.filter((v): v is LocalPiperVoiceId => VALID_LOCAL_PIPER_IDS.has(v));
    } catch {
      return [];
    }
  }
}

export async function downloadLocalPiperVoice(
  voiceId: LocalPiperVoiceId,
  onProgress?: (p: LocalPiperProgress) => void,
): Promise<void> {
  if (!isLocalPiperSupported()) {
    throw new Error('Este navegador não suporta WebAssembly para voz neural local.');
  }
  try {
    await callWorker<void>({ type: 'download', voiceId }, onProgress);
  } catch (err) {
    if (err instanceof Error && err.message !== 'WORKER_UNAVAILABLE') {
      throw err;
    }
    const mod = await loadMainThreadPiper();
    await mod.download(voiceId, (p) => {
      const pct =
        p.total > 0 ? Math.min(100, Math.max(0, Math.round((p.loaded / p.total) * 100))) : 0;
      onProgress?.({
        stage: 'download',
        loaded: p.loaded,
        total: p.total,
        percent: pct,
      });
    });
  }
}

export async function synthesizeLocalPiperWav(
  text: string,
  voiceId: LocalPiperVoiceId,
  onProgress?: (p: LocalPiperProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!isLocalPiperSupported()) {
    throw new Error('Este navegador não suporta WebAssembly para voz neural local.');
  }

  try {
    return await callWorker<Blob>({ type: 'predict', voiceId, text }, onProgress, signal);
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.message !== 'WORKER_UNAVAILABLE')) {
      throw err;
    }
    if (signal?.aborted) {
      const abortErr = new Error('Síntese cancelada.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const mod = await loadMainThreadPiper();
    if (mod.TtsSession._instance && mod.TtsSession._instance.voiceId !== voiceId) {
      mod.TtsSession._instance = null;
    }
    const session = await mod.TtsSession.create({
      voiceId,
      wasmPaths: {
        onnxWasm: ONNX_WASM_CDN,
        piperData: `${mod.WASM_BASE}.data`,
        piperWasm: `${mod.WASM_BASE}.wasm`,
      },
      progress: (p) => {
        const pct =
          p.total > 0 ? Math.min(100, Math.max(0, Math.round((p.loaded / p.total) * 100))) : 0;
        onProgress?.({
          stage: p.url === mod.INFERENCE_PROGRESS_URL ? 'inference' : 'download',
          loaded: p.loaded,
          total: p.total,
          percent: pct,
        });
      },
    });
    return session.predict(text);
  }
}

export async function removeLocalPiperVoice(voiceId: LocalPiperVoiceId): Promise<void> {
  if (!isLocalPiperSupported()) return;
  try {
    await callWorker<void>({ type: 'remove', voiceId });
  } catch {
    try {
      const mod = await loadMainThreadPiper();
      if (mod.TtsSession._instance && mod.TtsSession._instance.voiceId === voiceId) {
        mod.TtsSession._instance = null;
      }
      await mod.remove(voiceId);
    } catch {
      // ignore cleanup error
    }
  }
}
