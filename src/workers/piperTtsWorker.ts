import {
  download,
  INFERENCE_PROGRESS_URL,
  remove,
  stored,
  TtsSession,
  WASM_BASE,
  type Progress,
  type VoiceId,
} from '@mintplex-labs/piper-tts-web';

const ONNX_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';

const WASM_PATHS = {
  onnxWasm: ONNX_WASM_CDN,
  piperData: `${WASM_BASE}.data`,
  piperWasm: `${WASM_BASE}.wasm`,
};

type WorkerRequest =
  | { id: number; type: 'stored' }
  | { id: number; type: 'download'; voiceId: VoiceId }
  | { id: number; type: 'predict'; voiceId: VoiceId; text: string }
  | { id: number; type: 'remove'; voiceId: VoiceId };

type WorkerResponse =
  | { id: number; type: 'stored'; voices: VoiceId[] }
  | { id: number; type: 'downloaded'; voiceId: VoiceId }
  | { id: number; type: 'removed'; voiceId: VoiceId }
  | {
      id: number;
      type: 'progress';
      stage: 'download' | 'inference';
      loaded: number;
      total: number;
    }
  | { id: number; type: 'result'; buffer: ArrayBuffer; mimeType: string }
  | { id: number; type: 'error'; message: string };

// ONNX Runtime WASM cannot execute overlapping session.run() calls safely;
// serialize all model operations in a FIFO promise chain inside the worker.
let opQueue: Promise<void> = Promise.resolve();
let activeSessionVoice: VoiceId | null = null;
let activeSession: TtsSession | null = null;

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(msg, transfer);
  } else {
    (self as unknown as Worker).postMessage(msg);
  }
}

async function getSessionForVoice(
  voiceId: VoiceId,
  onProgress: (p: Progress) => void,
): Promise<TtsSession> {
  if (activeSession && activeSessionVoice === voiceId) {
    // Re-attach latest progress callback on existing singleton session
    const reused = new TtsSession({
      voiceId,
      progress: onProgress,
      wasmPaths: WASM_PATHS,
    });
    await reused.waitReady;
    return reused;
  }

  // Force clean reload when switching voices (TtsSession caches a static singleton)
  TtsSession._instance = null;
  activeSession = null;
  activeSessionVoice = null;

  const session = await TtsSession.create({
    voiceId,
    progress: onProgress,
    wasmPaths: WASM_PATHS,
  });
  activeSession = session;
  activeSessionVoice = voiceId;
  return session;
}

async function handleRequest(req: WorkerRequest): Promise<void> {
  try {
    if (req.type === 'stored') {
      let voices: VoiceId[] = [];
      try {
        voices = await stored();
      } catch {
        voices = [];
      }
      post({ id: req.id, type: 'stored', voices });
      return;
    }

    if (req.type === 'remove') {
      if (activeSessionVoice === req.voiceId) {
        TtsSession._instance = null;
        activeSession = null;
        activeSessionVoice = null;
      }
      await remove(req.voiceId);
      post({ id: req.id, type: 'removed', voiceId: req.voiceId });
      return;
    }

    if (req.type === 'download') {
      await download(req.voiceId, (p) => {
        post({
          id: req.id,
          type: 'progress',
          stage: 'download',
          loaded: p.loaded,
          total: p.total,
        });
      });
      post({ id: req.id, type: 'downloaded', voiceId: req.voiceId });
      return;
    }

    if (req.type === 'predict') {
      const session = await getSessionForVoice(req.voiceId, (p) => {
        post({
          id: req.id,
          type: 'progress',
          stage: p.url === INFERENCE_PROGRESS_URL ? 'inference' : 'download',
          loaded: p.loaded,
          total: p.total,
        });
      });
      const wavBlob = await session.predict(req.text);
      const buffer = await wavBlob.arrayBuffer();
      post(
        {
          id: req.id,
          type: 'result',
          buffer,
          mimeType: wavBlob.type || 'audio/wav',
        },
        [buffer],
      );
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao executar a voz neural local (Piper WASM).';
    // Reset broken session so the next attempt can recover cleanly
    if (req.type === 'predict') {
      TtsSession._instance = null;
      activeSession = null;
      activeSessionVoice = null;
    }
    post({ id: req.id, type: 'error', message });
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (!req || typeof req.id !== 'number') return;
  opQueue = opQueue.then(() => handleRequest(req));
});
