import {
  downloadPiperV2Voice,
  listStoredPiperV2Voices,
  type PiperV2VoiceId,
  removePiperV2Voice,
  resetActivePiperSession,
  synthesizePiperV2WavBuffer,
} from '../lib/piperEngine';

type WorkerRequest =
  | { id: number; type: 'stored' }
  | { id: number; type: 'download'; voiceId: PiperV2VoiceId }
  | { id: number; type: 'predict'; voiceId: PiperV2VoiceId; text: string }
  | { id: number; type: 'remove'; voiceId: PiperV2VoiceId };

type WorkerResponse =
  | { id: number; type: 'stored'; voices: PiperV2VoiceId[] }
  | { id: number; type: 'downloaded'; voiceId: PiperV2VoiceId }
  | { id: number; type: 'removed'; voiceId: PiperV2VoiceId }
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

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(msg, transfer);
  } else {
    (self as unknown as Worker).postMessage(msg);
  }
}

async function handleRequest(req: WorkerRequest): Promise<void> {
  try {
    if (req.type === 'stored') {
      const voices = await listStoredPiperV2Voices().catch(() => [] as PiperV2VoiceId[]);
      post({ id: req.id, type: 'stored', voices });
      return;
    }

    if (req.type === 'remove') {
      await removePiperV2Voice(req.voiceId);
      post({ id: req.id, type: 'removed', voiceId: req.voiceId });
      return;
    }

    if (req.type === 'download') {
      await downloadPiperV2Voice(req.voiceId, (p) => {
        post({
          id: req.id,
          type: 'progress',
          stage: p.stage,
          loaded: p.loaded,
          total: p.total,
        });
      });
      post({ id: req.id, type: 'downloaded', voiceId: req.voiceId });
      return;
    }

    if (req.type === 'predict') {
      const buffer = await synthesizePiperV2WavBuffer(req.voiceId, req.text, (p) => {
        post({
          id: req.id,
          type: 'progress',
          stage: p.stage,
          loaded: p.loaded,
          total: p.total,
        });
      });
      post(
        {
          id: req.id,
          type: 'result',
          buffer,
          mimeType: 'audio/wav',
        },
        [buffer],
      );
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao executar a voz neural local (Piper WASM).';
    if (req.type === 'predict') {
      resetActivePiperSession();
    }
    post({ id: req.id, type: 'error', message });
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (!req || typeof req.id !== 'number') return;
  opQueue = opQueue.then(() => handleRequest(req));
});
