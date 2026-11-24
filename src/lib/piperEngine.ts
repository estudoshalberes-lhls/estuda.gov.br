export type PiperV2VoiceId = 'pt_BR-faber-medium' | 'pt_BR-cadu-medium' | 'pt_BR-jeff-medium';

/**
 * Official Piper v2 voice repository on HuggingFace.
 * All three pt-BR models below are verified 256-symbol (num_symbols: 256, 22050 Hz)
 * binaries that support Portuguese nasalized phonemes (e.g. combining tilde idx=141),
 * avoiding the outdated 130-symbol mirrors that caused ONNX Gather out-of-bounds crashes.
 */
export const HF_PIPER_V2_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

export const PIPER_V2_MODEL_PATHS: Record<PiperV2VoiceId, string> = {
  'pt_BR-faber-medium': 'pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx',
  'pt_BR-cadu-medium': 'pt/pt_BR/cadu/medium/pt_BR-cadu-medium.onnx',
  'pt_BR-jeff-medium': 'pt/pt_BR/jeff/medium/pt_BR-jeff-medium.onnx',
};

const ONNX_WASM_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
const PIPER_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const PIPER_JS_URL = `${PIPER_WASM_BASE}.js`;
const PIPER_WASM_URL = `${PIPER_WASM_BASE}.wasm`;
const PIPER_DATA_URL = `${PIPER_WASM_BASE}.data`;

// Fresh OPFS directory isolates v2 256-symbol models from legacy 130-symbol files in "piper"
const OPFS_DIR_NAME = 'piper-v2';
const LEGACY_OPFS_DIR_NAME = 'piper';
const MIN_VALID_ONNX_BYTES = 1024 * 1024; // Reject truncated downloads (< 1 MB)
const MAX_CHUNK_CHARS = 380;

export interface PiperEngineProgress {
  stage: 'download' | 'inference';
  loaded: number;
  total: number;
}

interface PiperModelConfig {
  audio: {
    sample_rate: number;
  };
  espeak: {
    voice: string;
  };
  inference: {
    noise_scale: number;
    length_scale: number;
    noise_w: number;
  };
  num_symbols?: number;
  phoneme_id_map?: Record<string, number[]>;
  speaker_id_map?: Record<string, number>;
}

interface PiperPhonemizeOutput {
  phonemes?: string[];
  phoneme_ids?: number[];
}

interface PiperEmscriptenModule {
  callMain: (args: string[]) => void;
}

type CreatePiperPhonemizeFn = (moduleArg?: {
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  locateFile?: (url: string) => string;
}) => Promise<PiperEmscriptenModule>;

type OrtNamespace = typeof import('onnxruntime-web/wasm');
type OrtInferenceSession = import('onnxruntime-web/wasm').InferenceSession;

interface ActiveVoiceRuntime {
  voiceId: PiperV2VoiceId;
  config: PiperModelConfig;
  session: OrtInferenceSession;
  ort: OrtNamespace;
}

let cachedPhonemizeFactory: Promise<CreatePiperPhonemizeFn> | null = null;
let cachedOrtNamespace: Promise<OrtNamespace> | null = null;
let activeRuntime: ActiveVoiceRuntime | null = null;
let legacyCleanupAttempted = false;

// In-memory fallback cache when OPFS is unavailable (e.g. private browsing)
const memoryBlobCache = new Map<string, Blob>();

function isValidVoiceId(id: string): id is PiperV2VoiceId {
  return id in PIPER_V2_MODEL_PATHS;
}

function getFileNameFromUrl(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] || 'model.bin';
}

function getModelUrls(voiceId: PiperV2VoiceId): { onnxUrl: string; configUrl: string } {
  const relPath = PIPER_V2_MODEL_PATHS[voiceId];
  return {
    onnxUrl: `${HF_PIPER_V2_BASE}/${relPath}`,
    configUrl: `${HF_PIPER_V2_BASE}/${relPath}.json`,
  };
}

async function cleanupLegacyOpfsDirOnce(): Promise<void> {
  if (legacyCleanupAttempted) return;
  legacyCleanupAttempted = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return;
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(LEGACY_OPFS_DIR_NAME, { recursive: true });
  } catch {
    // Legacy directory may not exist or OPFS may be restricted — ignore safely
  }
}

async function getOpfsDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
  } catch {
    return null;
  }
}

async function readStoredBlob(url: string): Promise<Blob | null> {
  const fileName = getFileNameFromUrl(url);
  const mem = memoryBlobCache.get(fileName);
  if (mem) return mem;

  const dir = await getOpfsDir();
  if (!dir) return null;

  try {
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    if (fileName.endsWith('.onnx') && file.size < MIN_VALID_ONNX_BYTES) {
      // Truncated/corrupted file from an interrupted download — remove and re-fetch
      await dir.removeEntry(fileName).catch(() => {});
      return null;
    }
    if (file.size === 0) return null;
    return file;
  } catch {
    return null;
  }
}

async function writeStoredBlob(url: string, blob: Blob): Promise<void> {
  const fileName = getFileNameFromUrl(url);
  memoryBlobCache.set(fileName, blob);

  const dir = await getOpfsDir();
  if (!dir) return;

  try {
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch {
    // Keep in-memory copy even if OPFS quota is full or restricted
  }
}

async function deleteStoredBlob(url: string): Promise<void> {
  const fileName = getFileNameFromUrl(url);
  memoryBlobCache.delete(fileName);

  const dir = await getOpfsDir();
  if (!dir) return;

  try {
    await dir.removeEntry(fileName);
  } catch {
    // Already absent
  }
}

async function fetchBlobWithProgress(
  url: string,
  onProgress?: (p: PiperEngineProgress) => void,
): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) {
    throw new Error(`Falha ao baixar modelo de voz (HTTP ${res.status}).`);
  }

  const contentLengthHeader = res.headers.get('content-length');
  const total = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) || 0 : 0;

  if (!res.body || !onProgress) {
    const blob = await res.blob();
    if (onProgress) {
      onProgress({ stage: 'download', loaded: blob.size, total: total || blob.size });
    }
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress({ stage: 'download', loaded, total: total || loaded });
    }
  }

  return new Blob(chunks as BlobPart[], {
    type: res.headers.get('content-type') || 'application/octet-stream',
  });
}

async function getOrFetchBlob(
  url: string,
  onProgress?: (p: PiperEngineProgress) => void,
): Promise<Blob> {
  const cached = await readStoredBlob(url);
  if (cached) return cached;

  const fresh = await fetchBlobWithProgress(url, onProgress);
  if (url.endsWith('.onnx') && fresh.size < MIN_VALID_ONNX_BYTES) {
    throw new Error('Download do modelo neural incompleto. Tente novamente.');
  }
  await writeStoredBlob(url, fresh);
  return fresh;
}

async function loadPhonemizeFactory(): Promise<CreatePiperPhonemizeFn> {
  if (!cachedPhonemizeFactory) {
    cachedPhonemizeFactory = (async () => {
      const res = await fetch(PIPER_JS_URL, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) {
        throw new Error(`Não foi possível carregar o fonemizador local (HTTP ${res.status}).`);
      }
      const scriptText = await res.text();
      const esmSource = `${scriptText}\nexport default createPiperPhonemize;\n`;
      const blob = new Blob([esmSource], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        const mod = (await import(/* @vite-ignore */ blobUrl)) as {
          default?: CreatePiperPhonemizeFn;
        };
        if (typeof mod.default !== 'function') {
          throw new Error('Módulo piper_phonemize inválido.');
        }
        return mod.default;
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    })().catch((err) => {
      cachedPhonemizeFactory = null;
      throw err;
    });
  }
  return cachedPhonemizeFactory;
}

async function loadOrtNamespace(): Promise<OrtNamespace> {
  if (!cachedOrtNamespace) {
    cachedOrtNamespace = (async () => {
      const ortModule = await import('onnxruntime-web/wasm');
      const ort = ((ortModule as unknown as { default?: OrtNamespace }).default ||
        ortModule) as OrtNamespace;

      if (ort.env) {
        ort.env.logLevel = 'error';
        if (ort.env.wasm) {
          // Only enable multi-threaded WASM when SharedArrayBuffer is available (crossOriginIsolated)
          const isolated =
            typeof self !== 'undefined' &&
            Boolean((self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated);
          const cores =
            typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1;
          ort.env.wasm.numThreads = isolated ? Math.min(4, cores) : 1;
          ort.env.wasm.wasmPaths = ONNX_WASM_CDN;
        }
      }
      return ort;
    })().catch((err) => {
      cachedOrtNamespace = null;
      throw err;
    });
  }
  return cachedOrtNamespace;
}

export async function listStoredPiperV2Voices(): Promise<PiperV2VoiceId[]> {
  await cleanupLegacyOpfsDirOnce();
  const found = new Set<PiperV2VoiceId>();

  // Check memory cache
  for (const voiceId of Object.keys(PIPER_V2_MODEL_PATHS) as PiperV2VoiceId[]) {
    const fileName = getFileNameFromUrl(getModelUrls(voiceId).onnxUrl);
    const blob = memoryBlobCache.get(fileName);
    if (blob && blob.size >= MIN_VALID_ONNX_BYTES) {
      found.add(voiceId);
    }
  }

  // Check OPFS
  const dir = await getOpfsDir();
  if (dir) {
    try {
      const iterableDir = dir as FileSystemDirectoryHandle & {
        keys: () => AsyncIterableIterator<string>;
      };
      for await (const name of iterableDir.keys()) {
        if (!name.endsWith('.onnx')) continue;
        const candidate = name.slice(0, -'.onnx'.length);
        if (!isValidVoiceId(candidate)) continue;
        try {
          const handle = await dir.getFileHandle(name);
          const file = await handle.getFile();
          if (file.size >= MIN_VALID_ONNX_BYTES) {
            found.add(candidate);
          }
        } catch {
          // ignore unreadable entry
        }
      }
    } catch {
      // OPFS iteration unsupported
    }
  }

  return Array.from(found);
}

export async function downloadPiperV2Voice(
  voiceId: PiperV2VoiceId,
  onProgress?: (p: PiperEngineProgress) => void,
): Promise<void> {
  await cleanupLegacyOpfsDirOnce();
  const { onnxUrl, configUrl } = getModelUrls(voiceId);
  const [configBlob, onnxBlob] = await Promise.all([
    fetchBlobWithProgress(configUrl),
    fetchBlobWithProgress(onnxUrl, onProgress),
  ]);
  if (onnxBlob.size < MIN_VALID_ONNX_BYTES) {
    throw new Error('Arquivo do modelo neural incompleto após download.');
  }
  await Promise.all([writeStoredBlob(configUrl, configBlob), writeStoredBlob(onnxUrl, onnxBlob)]);
}

export async function removePiperV2Voice(voiceId: PiperV2VoiceId): Promise<void> {
  if (activeRuntime?.voiceId === voiceId) {
    try {
      await activeRuntime.session.release();
    } catch {
      // ignore release failure
    }
    activeRuntime = null;
  }
  const { onnxUrl, configUrl } = getModelUrls(voiceId);
  await Promise.all([deleteStoredBlob(onnxUrl), deleteStoredBlob(configUrl)]);
}

export function resetActivePiperSession(): void {
  if (activeRuntime) {
    void activeRuntime.session.release().catch(() => {});
    activeRuntime = null;
  }
}

async function ensureVoiceRuntime(
  voiceId: PiperV2VoiceId,
  onProgress?: (p: PiperEngineProgress) => void,
): Promise<ActiveVoiceRuntime> {
  if (activeRuntime && activeRuntime.voiceId === voiceId) {
    return activeRuntime;
  }

  await cleanupLegacyOpfsDirOnce();

  if (activeRuntime) {
    try {
      await activeRuntime.session.release();
    } catch {
      // ignore release error
    }
    activeRuntime = null;
  }

  const { onnxUrl, configUrl } = getModelUrls(voiceId);
  const [ort, , configBlob, modelBlob] = await Promise.all([
    loadOrtNamespace(),
    loadPhonemizeFactory(),
    getOrFetchBlob(configUrl),
    getOrFetchBlob(onnxUrl, onProgress),
  ]);

  const config = JSON.parse(await configBlob.text()) as PiperModelConfig;
  const modelBytes = new Uint8Array(await modelBlob.arrayBuffer());
  const session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm'],
  });

  activeRuntime = {
    voiceId,
    config,
    session,
    ort,
  };
  return activeRuntime;
}

function splitTextIntoChunks(text: string, maxLength = MAX_CHUNK_CHARS): string[] {
  const normalized = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const sentences = normalized.match(/[^.!?…;]+[.!?…;]*\s*/g) ?? [normalized];
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
  };

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength) {
      flush();
    }
    if (sentence.length > maxLength) {
      let piece = '';
      for (const word of sentence.split(/\s+/)) {
        const candidate = piece ? `${piece} ${word}` : word;
        if (candidate.length > maxLength) {
          if (piece.trim()) chunks.push(piece.trim());
          piece = word;
        } else {
          piece = candidate;
        }
      }
      current = piece;
    } else {
      current += sentence;
    }
  }
  flush();
  return chunks;
}

/**
 * Converts piper_phonemize output into model-validated phoneme IDs.
 * Prefers mapping IPA `phonemes` directly through the loaded model's own `phoneme_id_map`,
 * and strictly guards every ID against [0, num_symbols - 1] so ONNX Gather can never crash.
 */
function buildSafePhonemeIds(
  outputs: PiperPhonemizeOutput[],
  config: PiperModelConfig,
): number[] {
  const maxSymbols =
    typeof config.num_symbols === 'number' && config.num_symbols > 0 ? config.num_symbols : 256;
  const idMap = config.phoneme_id_map;

  const allPhonemes: string[] = [];
  const rawIds: number[] = [];

  for (const out of outputs) {
    if (Array.isArray(out.phonemes) && out.phonemes.length > 0) {
      allPhonemes.push(...out.phonemes);
    }
    if (Array.isArray(out.phoneme_ids) && out.phoneme_ids.length > 0) {
      rawIds.push(...out.phoneme_ids);
    }
  }

  let candidateIds: number[];

  if (allPhonemes.length > 0 && idMap && Object.keys(idMap).length > 0) {
    const bos = idMap['^'] ?? [1];
    const eos = idMap['$'] ?? [2];
    const pad = idMap['_'] ?? [0];

    candidateIds = [...bos, ...pad];
    for (const ph of allPhonemes) {
      const mapped = idMap[ph];
      if (mapped && mapped.length > 0) {
        candidateIds.push(...mapped, ...pad);
      }
    }
    candidateIds.push(...eos);
  } else {
    candidateIds = rawIds;
  }

  // Strictly bound every index inside [0, maxSymbols - 1]
  return candidateIds.filter(
    (id): id is number => Number.isInteger(id) && id >= 0 && id < maxSymbols,
  );
}

async function phonemizeChunk(text: string, config: PiperModelConfig): Promise<number[]> {
  const createPiperPhonemize = await loadPhonemizeFactory();
  const cleanLine = text.replace(/[\r\n]+/g, ' ').trim();
  if (!cleanLine) return [];

  const inputJson = JSON.stringify([{ text: cleanLine }]);
  const printedLines: string[] = [];
  const stderrLines: string[] = [];

  const mod = await createPiperPhonemize({
    print: (line: string) => {
      if (line && line.trim()) printedLines.push(line.trim());
    },
    printErr: (msg: string) => {
      if (msg && msg.trim()) stderrLines.push(msg.trim());
    },
    locateFile: (url: string) => {
      if (url.endsWith('.wasm')) return PIPER_WASM_URL;
      if (url.endsWith('.data')) return PIPER_DATA_URL;
      return url;
    },
  });

  mod.callMain([
    '-l',
    config.espeak?.voice || 'pt-br',
    '--input',
    inputJson,
    '--espeak_data',
    '/espeak-ng-data',
  ]);

  const parsedOutputs: PiperPhonemizeOutput[] = [];
  for (const line of printedLines) {
    try {
      const obj = JSON.parse(line) as PiperPhonemizeOutput;
      if (obj && (Array.isArray(obj.phonemes) || Array.isArray(obj.phoneme_ids))) {
        parsedOutputs.push(obj);
      }
    } catch {
      // Ignore non-JSON diagnostic lines
    }
  }

  const safeIds = buildSafePhonemeIds(parsedOutputs, config);
  if (safeIds.length === 0 && stderrLines.length > 0) {
    throw new Error(stderrLines.join(' '));
  }
  return safeIds;
}

async function runChunkInference(
  runtime: ActiveVoiceRuntime,
  chunkText: string,
): Promise<Float32Array> {
  const phonemeIds = await phonemizeChunk(chunkText, runtime.config);
  if (phonemeIds.length === 0) {
    return new Float32Array(0);
  }

  const { ort, config, session } = runtime;
  const bigIds = BigInt64Array.from(phonemeIds.map((n) => BigInt(n)));
  const bigLengths = BigInt64Array.from([BigInt(phonemeIds.length)]);

  const noiseScale = config.inference?.noise_scale ?? 0.667;
  const lengthScale = config.inference?.length_scale ?? 1.0;
  const noiseW = config.inference?.noise_w ?? 0.8;

  const feeds: Record<string, import('onnxruntime-web/wasm').Tensor> = {
    input: new ort.Tensor('int64', bigIds, [1, bigIds.length]),
    input_lengths: new ort.Tensor('int64', bigLengths, [1]),
    scales: new ort.Tensor('float32', new Float32Array([noiseScale, lengthScale, noiseW]), [3]),
  };

  if (config.speaker_id_map && Object.keys(config.speaker_id_map).length > 0) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
  }

  const results = await session.run(feeds);
  const outputTensor = results.output ?? Object.values(results)[0];
  if (!outputTensor) {
    throw new Error('Modelo neural não retornou tensor de áudio.');
  }
  return outputTensor.data as Float32Array;
}

function encodePcmToWav(samples: Float32Array, numChannels: number, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

export async function synthesizePiperV2WavBuffer(
  voiceId: PiperV2VoiceId,
  text: string,
  onProgress?: (p: PiperEngineProgress) => void,
): Promise<ArrayBuffer> {
  const runtime = await ensureVoiceRuntime(voiceId, onProgress);
  const sampleRate = runtime.config.audio?.sample_rate || 22050;
  const chunks = splitTextIntoChunks(text);

  if (chunks.length === 0) {
    throw new Error('Texto vazio para síntese de voz.');
  }

  const pcms: Float32Array[] = [];
  const gapSamples = Math.round(sampleRate * 0.12); // Subtle 120ms breath pause between chunks

  for (let i = 0; i < chunks.length; i++) {
    if (chunks.length > 1) {
      onProgress?.({ stage: 'inference', loaded: i, total: chunks.length });
    }
    const pcm = await runChunkInference(runtime, chunks[i]);
    if (pcm.length > 0) {
      pcms.push(pcm);
    }
  }

  if (chunks.length > 1) {
    onProgress?.({ stage: 'inference', loaded: chunks.length, total: chunks.length });
  }

  if (pcms.length === 0) {
    throw new Error('Não foi possível gerar áudio para este trecho.');
  }

  const totalSamples =
    pcms.reduce((sum, arr) => sum + arr.length, 0) + Math.max(0, pcms.length - 1) * gapSamples;
  const merged = new Float32Array(totalSamples);
  let cursor = 0;
  for (let i = 0; i < pcms.length; i++) {
    merged.set(pcms[i], cursor);
    cursor += pcms[i].length;
    if (i < pcms.length - 1) {
      cursor += gapSamples;
    }
  }

  return encodePcmToWav(merged, 1, sampleRate);
}
