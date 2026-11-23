import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckSquare,
  Cpu,
  Download,
  Filter,
  HardDrive,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react';
import {
  downloadLocalPiperVoice,
  getStoredLocalPiperVoices,
  isLocalPiperSupported,
  LOCAL_PIPER_VOICES,
  LocalPiperVoiceId,
  synthesizeLocalPiperWav,
  VALID_LOCAL_PIPER_IDS,
} from '../../lib/localPiperTts';
import { formatSequentialDeviceLabel } from '../../lib/parsers';
import { LawItem } from '../../types/study';

export { LOCAL_PIPER_VOICES };
export type { LocalPiperVoiceId };

const VOICE_PREFS_STORAGE_KEY = 'ce-law-voice-prefs-v3';

const SPEED_OPTIONS = [0.85, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2] as const;

export type VoiceEngineMode = 'local' | 'browser';

export interface LawVoiceWordRange {
  itemId: string;
  charIndex: number;
  charLength: number;
}

export interface LocalVoiceDownloadState {
  voiceId: LocalPiperVoiceId;
  percent: number;
  loadedMb: number;
  totalMb: number;
}

interface StoredVoicePrefs {
  engine: VoiceEngineMode;
  localVoice: LocalPiperVoiceId;
  rate: number;
  voiceURI: string;
  autoMarkRead: boolean;
  skipLegislativeNotes: boolean;
}

function loadVoicePrefs(): StoredVoicePrefs {
  const defaultEngine: VoiceEngineMode = isLocalPiperSupported() ? 'local' : 'browser';
  try {
    const rawV3 = localStorage.getItem(VOICE_PREFS_STORAGE_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as Partial<StoredVoicePrefs>;
      const engine: VoiceEngineMode =
        parsed.engine === 'local' || parsed.engine === 'browser' ? parsed.engine : defaultEngine;
      return {
        engine,
        localVoice:
          typeof parsed.localVoice === 'string' && VALID_LOCAL_PIPER_IDS.has(parsed.localVoice)
            ? (parsed.localVoice as LocalPiperVoiceId)
            : 'pt_BR-faber-medium',
        rate:
          typeof parsed.rate === 'number' && parsed.rate >= 0.5 && parsed.rate <= 2.5
            ? parsed.rate
            : 1.1,
        voiceURI: typeof parsed.voiceURI === 'string' ? parsed.voiceURI : '',
        autoMarkRead: Boolean(parsed.autoMarkRead),
        skipLegislativeNotes:
          typeof parsed.skipLegislativeNotes === 'boolean' ? parsed.skipLegislativeNotes : true,
      };
    }

    const rawLegacy =
      localStorage.getItem('ce-law-voice-prefs-v2') ||
      localStorage.getItem('ce-law-voice-prefs-v1');
    if (rawLegacy) {
      const parsed = JSON.parse(rawLegacy) as Partial<StoredVoicePrefs>;
      return {
        engine: defaultEngine,
        localVoice: 'pt_BR-faber-medium',
        rate:
          typeof parsed.rate === 'number' && parsed.rate >= 0.5 && parsed.rate <= 2.5
            ? parsed.rate
            : 1.1,
        voiceURI: typeof parsed.voiceURI === 'string' ? parsed.voiceURI : '',
        autoMarkRead: Boolean(parsed.autoMarkRead),
        skipLegislativeNotes:
          typeof parsed.skipLegislativeNotes === 'boolean' ? parsed.skipLegislativeNotes : true,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    engine: defaultEngine,
    localVoice: 'pt_BR-faber-medium',
    rate: 1.1,
    voiceURI: '',
    autoMarkRead: false,
    skipLegislativeNotes: true,
  };
}

// ============================================================================
// Legal Prosody Normalization & Smart Chunking (pt-BR)
// ============================================================================

const ORDINAL_1_TO_9: Record<number, string> = {
  1: 'primeiro',
  2: 'segundo',
  3: 'terceiro',
  4: 'quarto',
  5: 'quinto',
  6: 'sexto',
  7: 'sétimo',
  8: 'oitavo',
  9: 'nono',
  10: 'décimo',
};

function formatBrazilianLegalNumber(numStr: string, ordinalUpTo9 = true): string {
  const n = Number.parseInt(numStr, 10);
  if (!Number.isFinite(n)) return numStr;
  if (ordinalUpTo9 && n >= 1 && n <= 9) {
    return ORDINAL_1_TO_9[n];
  }
  return String(n);
}

function romanToNumber(roman: string): number | null {
  const clean = roman.trim().toUpperCase();
  if (!/^[IVXLCDM]+$/.test(clean)) return null;
  const map: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  let total = 0;
  for (let i = 0; i < clean.length; i++) {
    const cur = map[clean[i]];
    const next = map[clean[i + 1]] || 0;
    if (cur < next) total -= cur;
    else total += cur;
  }
  return total > 0 && total <= 500 ? total : null;
}

function formatIncisoNumber(roman: string): string {
  const n = romanToNumber(roman);
  if (!n) return roman;
  if (n >= 1 && n <= 10) return ORDINAL_1_TO_9[n];
  return String(n);
}

const LEGISLATIVE_NOTE_REGEX =
  /\(\s*(?:Incluíd[oa]|Redação dada|Alterad[oa]|Acrescid[oa]|Revogad[oa]|Suprimid[oa]|Vide|Vigência|Regulamento|Produção de efeito|Vetad[oa]|VETADO|Renumerad[oa]|Restabelecid[oa]|Mantid[oa]|Suspens[oa]|Declarad[oa])[^)]*\)/gi;

/**
 * Normalizes Brazilian legal text for smooth, natural pt-BR speech synthesis:
 * - Pronounces Art. 1º–9º and § 1º–9º as ordinals ("primeiro".."nono") and 10+ as cardinals
 * - Converts inciso Roman numerals ("I -", "IV -", "Inciso IX") into natural spoken Portuguese
 * - Optionally strips noisy legislative update annotations like "(Incluído pela Lei nº ...)"
 * - Avoids duplicating the device header when the text body already opens with it
 */
export function buildSpokenTextForLawItem(
  item: LawItem,
  options?: { skipLegislativeNotes?: boolean },
): string {
  const skipNotes = options?.skipLegislativeNotes ?? true;
  const displayDevice = formatSequentialDeviceLabel(item.dispositivo, item.artigo_base).trim();

  const expandLegalText = (raw: string): string => {
    let s = raw || '';
    if (skipNotes) {
      const stripped = s.replace(LEGISLATIVE_NOTE_REGEX, ' ').replace(/\s+/g, ' ').trim();
      if (stripped.length >= 6) {
        s = stripped;
      }
    }

    return (
      s
        // Normalize line breaks & typographic dashes into natural pauses
        .replace(/[\r\n]+/g, '. ')
        .replace(/\s*[–—]\s*/g, ', ')
        // Articles: Art. 1º-A -> Artigo primeiro A / Art. 121 -> Artigo 121
        .replace(/\bArts\.?\s*/gi, 'Artigos ')
        .replace(/\bArt\.?\s*(\d+)[º°o]?(-[A-Z])?/gi, (_m, num: string, suffix?: string) => {
          const spokenNum = formatBrazilianLegalNumber(num, true);
          return `Artigo ${spokenNum}${suffix ? ` ${suffix.slice(1)}` : ''}`;
        })
        // Paragraphs: §§, § 1º-A, Parágrafo único
        .replace(/§\s*§/g, 'Parágrafos ')
        .replace(/§\s*(\d+)[º°o]?(-[A-Z])?/g, (_m, num: string, suffix?: string) => {
          const spokenNum = formatBrazilianLegalNumber(num, true);
          return `Parágrafo ${spokenNum}${suffix ? ` ${suffix.slice(1)}` : ''}`;
        })
        .replace(/\bPar\.?\s*[úu]nico\b/gi, 'Parágrafo único')
        // Explicit "Inciso IV" or "Inc. IV"
        .replace(/\bInc(?:iso|\.)?\s+([IVXLCDM]{1,7})\b/gi, (_m, rom: string) => {
          return `Inciso ${formatIncisoNumber(rom)}`;
        })
        // Leading Roman numeral inciso prefix: "IV - " or "IV, "
        .replace(/^\s*([IVXLCDM]{1,7})\s*(?:[-–—.,:])\s+/i, (_m, rom: string) => {
          return `Inciso ${formatIncisoNumber(rom)}, `;
        })
        // Leading alínea prefix: "a) "
        .replace(/^\s*([a-z])\)\s+/i, (_m, letter: string) => {
          return `Alínea ${letter.toLowerCase()}, `;
        })
        // Common Brazilian legal abbreviations
        .replace(/\bn[º°]\s*/gi, 'número ')
        .replace(/\bCF\/88\b/g, 'Constituição Federal de oitenta e oito')
        .replace(/\bp\.\s*ex\.?/gi, 'por exemplo')
        .replace(/\bal\.?\s+([a-z])\b/gi, 'alínea $1')
        .replace(/(\d+)\s*%/g, '$1 por cento')
        // Clean redundant punctuation so prosody stays smooth
        .replace(/;\s*$/g, '.')
        .replace(/\.\s*,/g, '.')
        .replace(/,\s*,+/g, ',')
        .replace(/\.\s*\.+/g, '.')
        .replace(/\s+/g, ' ')
        .trim()
    );
  };

  const headerSpoken = expandLegalText(displayDevice);
  const bodySpoken = expandLegalText(item.texto || '');

  if (!bodySpoken) return headerSpoken;
  if (!headerSpoken) return bodySpoken;

  // Avoid repeating "Artigo primeiro. Artigo primeiro ..." if the body already begins with the same label
  const norm = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const normHeader = norm(headerSpoken);
  const normBody = norm(bodySpoken);
  if (normHeader && (normBody.startsWith(normHeader) || normHeader === normBody)) {
    return bodySpoken;
  }

  return `${headerSpoken}. ${bodySpoken}`;
}

/**
 * Splits spoken text into natural sentence/clause segments so:
 * - Browser SpeechSynthesis never hits Chrome's ~15s long-utterance cutoff bug
 * - Neural TTS stays responsive even on very long articles while keeping organic cadence
 */
export function splitIntoNaturalChunks(text: string, maxLen: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const sentences = clean.split(/(?<=[.!?;:])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  const pushPiece = (piece: string) => {
    const p = piece.trim();
    if (!p) return;
    if (!current) {
      current = p;
      return;
    }
    if (current.length + 1 + p.length <= maxLen) {
      current = `${current} ${p}`;
    } else {
      chunks.push(current);
      current = p;
    }
  };

  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      pushPiece(sentence);
    } else {
      // Split long sentence smoothly at commas first
      const clauses = sentence.split(/(?<=,)\s+/).filter(Boolean);
      for (const clause of clauses) {
        if (clause.length <= maxLen) {
          pushPiece(clause);
        } else {
          // Last-resort word boundary split
          const words = clause.split(/\s+/);
          let buf = '';
          for (const w of words) {
            if (!buf) {
              buf = w;
            } else if (buf.length + 1 + w.length <= maxLen) {
              buf = `${buf} ${w}`;
            } else {
              pushPiece(buf);
              buf = w;
            }
          }
          if (buf) pushPiece(buf);
        }
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// ============================================================================
// Neural Audio Cache (LRU ObjectURLs + In-Flight Deduplication)
// ============================================================================

const MAX_NEURAL_CACHE_ENTRIES = 45;
const PERSISTENT_TTS_CACHE_NAME = 'ce-neural-tts-audio-v1';

function hashTtsKey(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}-${(h1 >>> 0).toString(36)}-${input.length.toString(36)}`;
}

async function readPersistentTtsBlob(cacheKey: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await window.caches.open(PERSISTENT_TTS_CACHE_NAME);
    const url = `${window.location.origin}/__tts_cache__/${hashTtsKey(cacheKey)}`;
    const match = await cache.match(url);
    if (!match) return null;
    const blob = await match.blob();
    return blob && blob.size >= 64 ? blob : null;
  } catch {
    return null;
  }
}

async function writePersistentTtsBlob(cacheKey: string, blob: Blob): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await window.caches.open(PERSISTENT_TTS_CACHE_NAME);
    const url = `${window.location.origin}/__tts_cache__/${hashTtsKey(cacheKey)}`;
    await cache.put(
      url,
      new Response(blob, {
        headers: { 'Content-Type': blob.type || 'audio/wav' },
      }),
    );
  } catch {
    // ignore storage quota errors
  }
}

export function useLawVoiceReader(options: {
  activeFolder: string;
  items: LawItem[];
  onPositionChange?: (articleKey: string) => void;
  onAutoMarkItemRead?: (item: LawItem) => void;
}) {
  const { activeFolder, items, onPositionChange, onAutoMarkItemRead } = options;

  const isBrowserSpeechSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const isAudioSupported = typeof window !== 'undefined' && typeof Audio !== 'undefined';
  const isLocalSupported = isAudioSupported && isLocalPiperSupported();
  const isSupported = isAudioSupported || isBrowserSpeechSupported;

  const [prefs, setPrefs] = useState<StoredVoicePrefs>(() => loadVoicePrefs());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [storedLocalVoices, setStoredLocalVoices] = useState<LocalPiperVoiceId[]>([]);
  const [localDownloadProgress, setLocalDownloadProgress] =
    useState<LocalVoiceDownloadState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [wordRange, setWordRange] = useState<LawVoiceWordRange | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const storedLocalVoicesRef = useRef(storedLocalVoices);
  storedLocalVoicesRef.current = storedLocalVoices;
  const onPosRef = useRef(onPositionChange);
  onPosRef.current = onPositionChange;
  const onMarkReadRef = useRef(onAutoMarkItemRead);
  onMarkReadRef.current = onAutoMarkItemRead;

  const playbackRunIdRef = useRef(0);
  const activeIndexRef = useRef<number | null>(null);
  activeIndexRef.current = activeIndex;
  const activeChunkIdxRef = useRef(0);

  // Audio element + LRU cache + abort controllers (shared by Local Piper & Gemini Cloud)
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const neuralCacheRef = useRef<Map<string, string>>(new Map());
  const inflightRef = useRef<Map<string, Promise<string>>>(new Map());
  const activeAbortRef = useRef<AbortController | null>(null);
  const nextTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore storage errors
    }
  }, [prefs]);

  useEffect(() => {
    if (!isLocalSupported) return;
    let cancelled = false;
    void getStoredLocalPiperVoices().then((list) => {
      if (!cancelled) {
        setStoredLocalVoices(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLocalSupported]);

  useEffect(() => {
    if (!isBrowserSpeechSupported) return;
    const synth = window.speechSynthesis;
    const refreshVoices = () => {
      const all = synth.getVoices();
      const ptVoices = all.filter((v) => v.lang.toLowerCase().startsWith('pt'));
      const scoreVoice = (v: SpeechSynthesisVoice): number => {
        let s = 0;
        if (v.lang.toLowerCase() === 'pt-br') s += 40;
        if (/natural|neural|online/i.test(v.name)) s += 30;
        if (/google|microsoft/i.test(v.name)) s += 20;
        if (/francisca|antonio|thalita|luciana|felipe/i.test(v.name)) s += 10;
        if (!v.localService) s += 5;
        return s;
      };
      const sorted = [...(ptVoices.length > 0 ? ptVoices : all)].sort(
        (a, b) => scoreVoice(b) - scoreVoice(a),
      );
      setVoices(sorted);
    };
    refreshVoices();
    synth.addEventListener?.('voiceschanged', refreshVoices);
    return () => {
      synth.removeEventListener?.('voiceschanged', refreshVoices);
    };
  }, [isBrowserSpeechSupported]);

  const clearPendingNextTimer = useCallback(() => {
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
  }, []);

  const stopAudioElement = useCallback(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    const audio = audioElRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // ignore
      }
      audioElRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    playbackRunIdRef.current += 1;
    clearPendingNextTimer();
    stopAudioElement();
    if (isBrowserSpeechSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    setIsPlaying(false);
    setIsPaused(false);
    setIsBuffering(false);
    setErrorMessage(null);
    setActiveIndex(null);
    setWordRange(null);
    activeChunkIdxRef.current = 0;
  }, [clearPendingNextTimer, isBrowserSpeechSupported, stopAudioElement]);

  // Stop cleanly on folder change
  useEffect(() => {
    stop();
  }, [activeFolder, stop]);

  // Cleanup everything + revoke cached Blob URLs on unmount
  useEffect(() => {
    return () => {
      playbackRunIdRef.current += 1;
      clearPendingNextTimer();
      stopAudioElement();
      if (isBrowserSpeechSupported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
      neuralCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      neuralCacheRef.current.clear();
      inflightRef.current.clear();
    };
  }, [clearPendingNextTimer, isBrowserSpeechSupported, stopAudioElement]);

  const putCachedAudioBlob = useCallback((cacheKey: string, blob: Blob): string => {
    void writePersistentTtsBlob(cacheKey, blob);
    const objectUrl = URL.createObjectURL(blob);
    if (neuralCacheRef.current.size >= MAX_NEURAL_CACHE_ENTRIES) {
      const oldestKey = neuralCacheRef.current.keys().next().value;
      if (oldestKey) {
        const oldestUrl = neuralCacheRef.current.get(oldestKey);
        if (oldestUrl) URL.revokeObjectURL(oldestUrl);
        neuralCacheRef.current.delete(oldestKey);
      }
    }
    neuralCacheRef.current.set(cacheKey, objectUrl);
    return objectUrl;
  }, []);

  const fetchLocalPiperAudioUrl = useCallback(
    async (
      text: string,
      voiceId: LocalPiperVoiceId,
      signal?: AbortSignal,
      silent = false,
    ): Promise<string> => {
      const cacheKey = `local::${voiceId}::${text}`;
      const cached = neuralCacheRef.current.get(cacheKey);
      if (cached) {
        neuralCacheRef.current.delete(cacheKey);
        neuralCacheRef.current.set(cacheKey, cached);
        return cached;
      }

      const existingPromise = inflightRef.current.get(cacheKey);
      if (existingPromise) {
        return existingPromise;
      }

      const promise = (async () => {
        const persistedBlob = await readPersistentTtsBlob(cacheKey);
        if (persistedBlob) {
          const persistedUrl = URL.createObjectURL(persistedBlob);
          if (neuralCacheRef.current.size >= MAX_NEURAL_CACHE_ENTRIES) {
            const oldestKey = neuralCacheRef.current.keys().next().value;
            if (oldestKey) {
              const oldestUrl = neuralCacheRef.current.get(oldestKey);
              if (oldestUrl) URL.revokeObjectURL(oldestUrl);
              neuralCacheRef.current.delete(oldestKey);
            }
          }
          neuralCacheRef.current.set(cacheKey, persistedUrl);
          return persistedUrl;
        }

        const blob = await synthesizeLocalPiperWav(
          text,
          voiceId,
          (progress) => {
            if (!silent && progress.stage === 'download' && progress.total > 0) {
              setLocalDownloadProgress({
                voiceId,
                percent: progress.percent,
                loadedMb: progress.loaded / (1024 * 1024),
                totalMb: progress.total / (1024 * 1024),
              });
            }
          },
          signal,
        );

        if (!silent) {
          setLocalDownloadProgress(null);
        }
        setStoredLocalVoices((prev) => (prev.includes(voiceId) ? prev : [...prev, voiceId]));

        if (!blob || blob.size < 64) {
          throw new Error('Áudio local vazio gerado pelo motor Piper.');
        }

        return putCachedAudioBlob(cacheKey, blob);
      })();

      inflightRef.current.set(cacheKey, promise);
      try {
        return await promise;
      } catch (err) {
        if (!silent) {
          setLocalDownloadProgress(null);
        }
        throw err;
      } finally {
        inflightRef.current.delete(cacheKey);
      }
    },
    [putCachedAudioBlob],
  );

  const preloadLocalVoice = useCallback(
    async (targetVoice?: LocalPiperVoiceId) => {
      if (!isLocalSupported) return;
      const voiceId = targetVoice || prefsRef.current.localVoice;
      if (storedLocalVoicesRef.current.includes(voiceId)) return;
      setErrorMessage(null);
      setLocalDownloadProgress({
        voiceId,
        percent: 0,
        loadedMb: 0,
        totalMb: 60,
      });
      try {
        await downloadLocalPiperVoice(voiceId, (progress) => {
          if (progress.total > 0) {
            setLocalDownloadProgress({
              voiceId,
              percent: progress.percent,
              loadedMb: progress.loaded / (1024 * 1024),
              totalMb: progress.total / (1024 * 1024),
            });
          }
        });
        setStoredLocalVoices((prev) => (prev.includes(voiceId) ? prev : [...prev, voiceId]));
        setLocalDownloadProgress(null);
      } catch (err) {
        setLocalDownloadProgress(null);
        setErrorMessage(
          err instanceof Error
            ? `Não foi possível baixar a voz neural local (${err.message}).`
            : 'Não foi possível baixar a voz neural local agora.',
        );
      }
    },
    [isLocalSupported],
  );

  const prefetchNextLocalItem = useCallback(
    (itemIdx: number, voiceId: LocalPiperVoiceId) => {
      // Only prefetch locally once the model is already cached in OPFS (0 quota, 0 extra downloads)
      if (!storedLocalVoicesRef.current.includes(voiceId)) return;
      const list = itemsRef.current;
      if (itemIdx < 0 || itemIdx >= list.length) return;
      const spoken = buildSpokenTextForLawItem(list[itemIdx], {
        skipLegislativeNotes: prefsRef.current.skipLegislativeNotes,
      });
      if (!spoken) return;
      const nextChunks = splitIntoNaturalChunks(spoken, 650);
      if (nextChunks[0]) {
        void fetchLocalPiperAudioUrl(nextChunks[0], voiceId, undefined, true).catch(() => {});
      }
    },
    [fetchLocalPiperAudioUrl],
  );

  const speakAtIndex = useCallback(
    (index: number, startChunkIdx = 0) => {
      if (!isSupported) return;
      const list = itemsRef.current;
      if (index < 0 || index >= list.length) {
        stop();
        return;
      }

      const item = list[index];
      const runId = ++playbackRunIdRef.current;
      clearPendingNextTimer();
      stopAudioElement();
      if (isBrowserSpeechSupported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }

      const spokenText = buildSpokenTextForLawItem(item, {
        skipLegislativeNotes: prefsRef.current.skipLegislativeNotes,
      });
      if (!spokenText) {
        if (index + 1 < list.length) {
          speakAtIndex(index + 1, 0);
        } else {
          stop();
        }
        return;
      }

      const articleKey = (item.artigo_base || item.dispositivo || '').trim();
      setActiveIndex(index);
      setIsPlaying(true);
      setIsPaused(false);
      if (prefsRef.current.engine === 'local') {
        setErrorMessage(null);
      }
      setWordRange(null);
      if (articleKey) {
        onPosRef.current?.(articleKey);
      }

      const mode: VoiceEngineMode =
        prefsRef.current.engine === 'local' && isLocalSupported ? 'local' : 'browser';

      if (mode === 'local') {
        // Local WebAssembly Piper TTS: 100% offline, 0 quota, gapless local lookahead
        const chunks = splitIntoNaturalChunks(spokenText, 650);
        const voiceId = prefsRef.current.localVoice;

        const playLocalChunk = async (chunkIdx: number) => {
          if (playbackRunIdRef.current !== runId) return;
          const chunkText = chunks[chunkIdx];
          if (!chunkText) {
            if (prefsRef.current.autoMarkRead) {
              onMarkReadRef.current?.(item);
            }
            const nextIdx = index + 1;
            if (nextIdx < itemsRef.current.length) {
              nextTimerRef.current = window.setTimeout(() => {
                if (playbackRunIdRef.current === runId) {
                  speakAtIndex(nextIdx, 0);
                }
              }, 120);
            } else {
              stop();
            }
            return;
          }

          activeChunkIdxRef.current = chunkIdx;
          const cacheKey = `local::${voiceId}::${chunkText}`;
          if (!neuralCacheRef.current.has(cacheKey)) {
            setIsBuffering(true);
          }

          const controller = new AbortController();
          activeAbortRef.current = controller;

          try {
            const url = await fetchLocalPiperAudioUrl(chunkText, voiceId, controller.signal);
            if (playbackRunIdRef.current !== runId) return;
            setIsBuffering(false);

            // Gapless background synthesis of next chunk / article (100% local, zero quota!)
            if (chunkIdx + 1 < chunks.length) {
              void fetchLocalPiperAudioUrl(chunks[chunkIdx + 1], voiceId, undefined, true).catch(
                () => {},
              );
            } else {
              prefetchNextLocalItem(index + 1, voiceId);
            }

            const audio = new Audio(url);
            audio.playbackRate = prefsRef.current.rate;
            (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
            audioElRef.current = audio;

            audio.onended = () => {
              if (playbackRunIdRef.current !== runId) return;
              void playLocalChunk(chunkIdx + 1);
            };

            audio.onerror = () => {
              if (playbackRunIdRef.current !== runId) return;
              setIsBuffering(false);
              setIsPlaying(false);
              setErrorMessage(
                'Falha ao reproduzir o áudio local. Tente novamente ou alterne para Voz do Navegador.',
              );
            };

            await audio.play();
          } catch (err: any) {
            if (playbackRunIdRef.current !== runId || err?.name === 'AbortError') return;
            setIsBuffering(false);
            setLocalDownloadProgress(null);

            const detail =
              typeof err?.message === 'string' && err.message.trim()
                ? err.message.trim()
                : 'erro ao inicializar o motor local';

            if (isBrowserSpeechSupported) {
              prefsRef.current = { ...prefsRef.current, engine: 'browser' };
              setPrefs((prev) => ({ ...prev, engine: 'browser' }));
              setErrorMessage(
                `Voz Neural Local indisponível agora (${detail}). Leitura continuada automaticamente com a Voz Fluida do Navegador.`,
              );
              window.setTimeout(() => {
                speakAtIndex(index, 0);
              }, 20);
              return;
            }

            setIsPlaying(false);
            setErrorMessage(`Não foi possível iniciar a Voz Neural Local (${detail}).`);
          }
        };

        void playLocalChunk(Math.min(startChunkIdx, Math.max(0, chunks.length - 1)));
        return;
      }

      // ======================================================================
      // Upgraded Browser SpeechSynthesis Engine (chunked, zero 15s cutoff)
      // ======================================================================
      if (!isBrowserSpeechSupported) {
        setIsPlaying(false);
        setErrorMessage('Leitura de voz do navegador indisponível neste dispositivo.');
        return;
      }

      const synth = window.speechSynthesis;
      const chunks = splitIntoNaturalChunks(spokenText, 210);
      const selectedVoice =
        voicesRef.current.find((v) => v.voiceURI === prefsRef.current.voiceURI) ||
        voicesRef.current.find((v) => v.lang.toLowerCase() === 'pt-br') ||
        voicesRef.current[0];

      const playBrowserChunk = (chunkIdx: number) => {
        if (playbackRunIdRef.current !== runId) return;
        const chunkText = chunks[chunkIdx];
        if (!chunkText) {
          if (prefsRef.current.autoMarkRead) {
            onMarkReadRef.current?.(item);
          }
          const nextIdx = index + 1;
          if (nextIdx < itemsRef.current.length) {
            nextTimerRef.current = window.setTimeout(() => {
              if (playbackRunIdRef.current === runId) {
                speakAtIndex(nextIdx, 0);
              }
            }, 120);
          } else {
            stop();
          }
          return;
        }

        activeChunkIdxRef.current = chunkIdx;
        const utterance = new SpeechSynthesisUtterance(chunkText);
        utterance.lang = 'pt-BR';
        utterance.rate = prefsRef.current.rate;
        utterance.pitch = 1.0;
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }

        utterance.onboundary = (ev) => {
          if (playbackRunIdRef.current !== runId) return;
          if (ev.name === 'word' && typeof ev.charIndex === 'number') {
            setWordRange({
              itemId: item.id,
              charIndex: ev.charIndex,
              charLength:
                typeof ev.charLength === 'number' && ev.charLength > 0 ? ev.charLength : 8,
            });
          }
        };

        utterance.onend = () => {
          if (playbackRunIdRef.current !== runId) return;
          playBrowserChunk(chunkIdx + 1);
        };

        utterance.onerror = (ev) => {
          if (playbackRunIdRef.current !== runId) return;
          if (ev.error === 'interrupted' || ev.error === 'canceled') return;
          stop();
        };

        synth.speak(utterance);
      };

      playBrowserChunk(Math.min(startChunkIdx, Math.max(0, chunks.length - 1)));
    },
    [
      clearPendingNextTimer,
      fetchLocalPiperAudioUrl,
      isBrowserSpeechSupported,
      isLocalSupported,
      isSupported,
      prefetchNextLocalItem,
      stop,
      stopAudioElement,
    ],
  );

  const playFromItemId = useCallback(
    (itemId?: string) => {
      const list = itemsRef.current;
      if (!list.length) return;
      if (!itemId) {
        speakAtIndex(activeIndexRef.current !== null ? activeIndexRef.current : 0, 0);
        return;
      }
      const idx = list.findIndex((it) => it.id === itemId);
      speakAtIndex(idx >= 0 ? idx : 0, 0);
    },
    [speakAtIndex],
  );

  const togglePlayPause = useCallback(() => {
    if (!isSupported) return;
    if (!isPlaying) {
      speakAtIndex(activeIndexRef.current !== null ? activeIndexRef.current : 0, 0);
      return;
    }

    if (prefsRef.current.engine === 'local' && audioElRef.current) {
      if (isPaused) {
        void audioElRef.current.play().catch(() => {});
        setIsPaused(false);
      } else {
        audioElRef.current.pause();
        setIsPaused(true);
      }
      return;
    }

    if (isBrowserSpeechSupported) {
      const synth = window.speechSynthesis;
      if (isPaused) {
        synth.resume();
        setIsPaused(false);
      } else {
        synth.pause();
        setIsPaused(true);
      }
    }
  }, [isBrowserSpeechSupported, isPaused, isPlaying, isSupported, speakAtIndex]);

  const stepArticle = useCallback(
    (dir: -1 | 1) => {
      const list = itemsRef.current;
      if (!list.length) return;
      const curIdx = activeIndexRef.current ?? 0;
      const curArt = (list[curIdx]?.artigo_base || list[curIdx]?.dispositivo || '').trim();
      let targetIdx = curIdx + dir;
      if (dir === 1) {
        while (
          targetIdx < list.length &&
          (list[targetIdx].artigo_base || list[targetIdx].dispositivo || '').trim() === curArt
        ) {
          targetIdx += 1;
        }
      } else {
        while (
          targetIdx > 0 &&
          (list[targetIdx].artigo_base || list[targetIdx].dispositivo || '').trim() === curArt
        ) {
          targetIdx -= 1;
        }
      }
      targetIdx = Math.max(0, Math.min(list.length - 1, targetIdx));
      speakAtIndex(targetIdx, 0);
    },
    [speakAtIndex],
  );

  const setRate = useCallback(
    (rate: number) => {
      setPrefs((prev) => ({ ...prev, rate }));
      // In local Piper mode, update playbackRate live with zero interruption!
      if (prefsRef.current.engine === 'local' && audioElRef.current) {
        audioElRef.current.playbackRate = rate;
        return;
      }
      if (isPlaying && activeIndexRef.current !== null) {
        const curChunk = activeChunkIdxRef.current;
        window.setTimeout(() => {
          if (activeIndexRef.current !== null) {
            speakAtIndex(activeIndexRef.current, curChunk);
          }
        }, 20);
      }
    },
    [isPlaying, speakAtIndex],
  );

  const setVoiceURI = useCallback(
    (voiceURI: string) => {
      setPrefs((prev) => ({ ...prev, voiceURI }));
      if (prefsRef.current.engine === 'browser' && isPlaying && activeIndexRef.current !== null) {
        const curChunk = activeChunkIdxRef.current;
        window.setTimeout(() => {
          if (activeIndexRef.current !== null) {
            speakAtIndex(activeIndexRef.current, curChunk);
          }
        }, 20);
      }
    },
    [isPlaying, speakAtIndex],
  );

  const setEngine = useCallback(
    (engine: VoiceEngineMode) => {
      setErrorMessage(null);
      prefsRef.current = { ...prefsRef.current, engine };
      setPrefs((prev) => ({ ...prev, engine }));
      if ((isPlaying || errorMessage) && activeIndexRef.current !== null) {
        const idx = activeIndexRef.current;
        window.setTimeout(() => {
          speakAtIndex(idx, 0);
        }, 20);
      }
    },
    [errorMessage, isPlaying, speakAtIndex],
  );

  const setLocalVoice = useCallback(
    (localVoice: LocalPiperVoiceId) => {
      prefsRef.current = { ...prefsRef.current, localVoice };
      setPrefs((prev) => ({ ...prev, localVoice }));
      if (prefsRef.current.engine === 'local' && isPlaying && activeIndexRef.current !== null) {
        const idx = activeIndexRef.current;
        const curChunk = activeChunkIdxRef.current;
        window.setTimeout(() => {
          speakAtIndex(idx, curChunk);
        }, 20);
      }
    },
    [isPlaying, speakAtIndex],
  );

  const toggleAutoMarkRead = useCallback(() => {
    setPrefs((prev) => ({ ...prev, autoMarkRead: !prev.autoMarkRead }));
  }, []);

  const toggleSkipLegislativeNotes = useCallback(() => {
    setPrefs((prev) => ({ ...prev, skipLegislativeNotes: !prev.skipLegislativeNotes }));
  }, []);

  const currentItem = useMemo(
    () => (activeIndex !== null ? items[activeIndex] || null : null),
    [activeIndex, items],
  );

  return {
    isSupported,
    isLocalSupported,
    isPlaying,
    isPaused,
    isBuffering,
    errorMessage,
    activeIndex,
    currentItem,
    speakingItemId: isPlaying ? currentItem?.id || null : null,
    wordRange: isPlaying ? wordRange : null,
    engine: prefs.engine,
    localVoice: prefs.localVoice,
    storedLocalVoices,
    localDownloadProgress,
    voices,
    rate: prefs.rate,
    voiceURI: prefs.voiceURI,
    autoMarkRead: prefs.autoMarkRead,
    skipLegislativeNotes: prefs.skipLegislativeNotes,
    playFromItemId,
    togglePlayPause,
    stop,
    stepArticle,
    setRate,
    setVoiceURI,
    setEngine,
    setLocalVoice,
    preloadLocalVoice,
    toggleAutoMarkRead,
    toggleSkipLegislativeNotes,
  };
}

interface LawVoicePlayerBarProps {
  isSupported: boolean;
  isLocalSupported?: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isBuffering?: boolean;
  errorMessage?: string | null;
  activeIndex: number | null;
  totalItems: number;
  currentItem: LawItem | null;
  engine?: VoiceEngineMode;
  localVoice?: LocalPiperVoiceId;
  storedLocalVoices?: LocalPiperVoiceId[];
  localDownloadProgress?: LocalVoiceDownloadState | null;
  voices: SpeechSynthesisVoice[];
  rate: number;
  voiceURI: string;
  autoMarkRead: boolean;
  skipLegislativeNotes?: boolean;
  onTogglePlayPause: () => void;
  onStop: () => void;
  onStepArticle: (dir: -1 | 1) => void;
  onChangeRate: (rate: number) => void;
  onChangeVoice: (voiceURI: string) => void;
  onChangeEngine?: (engine: VoiceEngineMode) => void;
  onChangeLocalVoice?: (voice: LocalPiperVoiceId) => void;
  onPreloadLocalVoice?: (voice?: LocalPiperVoiceId) => void;
  onToggleAutoMarkRead: () => void;
  onToggleSkipLegislativeNotes?: () => void;
}

export const LawVoicePlayerBar: React.FC<LawVoicePlayerBarProps> = ({
  isSupported,
  isLocalSupported = true,
  isPlaying,
  isPaused,
  isBuffering = false,
  errorMessage = null,
  activeIndex,
  totalItems,
  currentItem,
  engine = 'local',
  localVoice = 'pt_BR-faber-medium',
  storedLocalVoices = [],
  localDownloadProgress = null,
  voices,
  rate,
  voiceURI,
  autoMarkRead,
  skipLegislativeNotes = true,
  onTogglePlayPause,
  onStop,
  onStepArticle,
  onChangeRate,
  onChangeVoice,
  onChangeEngine,
  onChangeLocalVoice,
  onPreloadLocalVoice,
  onToggleAutoMarkRead,
  onToggleSkipLegislativeNotes,
}) => {
  if (!isSupported || totalItems === 0) return null;

  const currentLabel = currentItem
    ? formatSequentialDeviceLabel(currentItem.dispositivo, currentItem.artigo_base)
    : 'Pronto para leitura fluida em voz alta';

  const isSelectedLocalCached = storedLocalVoices.includes(localVoice);
  const activeLocalSpec =
    LOCAL_PIPER_VOICES.find((v) => v.id === (localDownloadProgress?.voiceId || localVoice)) ||
    LOCAL_PIPER_VOICES[0];

  return (
    <div className="mb-3 rounded-xl border border-[var(--accent)]/35 bg-[var(--panel)] px-3 py-2.5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--text)]">
            {isBuffering || localDownloadProgress ? (
              <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
            ) : (
              <Volume2
                className={`w-4 h-4 ${
                  isPlaying && !isPaused ? 'text-[var(--good)]' : 'text-[var(--accent)]'
                }`}
              />
            )}
            Leitura em Voz:
          </span>

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onStepArticle(-1)}
              disabled={!isPlaying}
              title="Artigo anterior"
              className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40 cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onTogglePlayPause}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                isPlaying && !isPaused
                  ? 'border-[var(--warning)] bg-[var(--warning)]/15 text-[var(--warning)]'
                  : 'border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
              }`}
            >
              {localDownloadProgress ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Baixando {localDownloadProgress.percent}%…
                </>
              ) : isBuffering ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Preparando áudio...
                </>
              ) : isPlaying && !isPaused ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Pausar voz
                </>
              ) : isPlaying && isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Continuar voz
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Ouvir lei simultaneamente
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onStepArticle(1)}
              disabled={!isPlaying}
              title="Próximo artigo"
              className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40 cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {isPlaying && (
              <button
                type="button"
                onClick={onStop}
                title="Parar leitura em voz"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/50 cursor-pointer"
              >
                <Square className="w-3 h-3" />
                Parar
              </button>
            )}
          </div>

          <span className="text-[11.5px] font-medium text-[var(--muted)] truncate max-w-[260px] font-mono-num tabular-nums">
            {isPlaying && activeIndex !== null
              ? isBuffering
                ? `Sintetizando ${currentLabel} (${activeIndex + 1}/${totalItems})…`
                : `Lendo ${currentLabel} (${activeIndex + 1}/${totalItems})`
              : currentLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onChangeEngine && (
            <div
              role="group"
              aria-label="Motor de voz"
              className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5"
            >
              {isLocalSupported && (
                <button
                  type="button"
                  onClick={() => onChangeEngine('local')}
                  title="Voz Neural 100% local no navegador (Piper pt-BR · offline e sem limite de cotas)"
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    engine === 'local'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Cpu className="w-3 h-3" />
                  Neural Local
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeEngine('browser')}
                title="Voz nativa do navegador (instantânea, offline e sem limite de cotas)"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                  engine === 'browser'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Navegador
              </button>
            </div>
          )}

          {engine === 'local' && onChangeLocalVoice ? (
            <>
              <select
                aria-label="Selecionar voz neural local em português"
                value={localVoice}
                onChange={(e) => onChangeLocalVoice(e.target.value as LocalPiperVoiceId)}
                className="ce-select h-[30px] w-auto max-w-[205px] text-[11px] py-0.5"
              >
                {LOCAL_PIPER_VOICES.map((v) => {
                  const cached = storedLocalVoices.includes(v.id);
                  return (
                    <option key={v.id} value={v.id}>
                      {v.label}
                      {cached ? ' · Offline' : ''}
                    </option>
                  );
                })}
              </select>

              {isSelectedLocalCached ? (
                <span
                  title="Modelo salvo no navegador — funciona offline e sem limite de cotas"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--good)] whitespace-nowrap px-1"
                >
                  <HardDrive className="w-3 h-3" />
                  Offline · Sem cota
                </span>
              ) : (
                onPreloadLocalVoice &&
                !localDownloadProgress && (
                  <button
                    type="button"
                    onClick={() => onPreloadLocalVoice(localVoice)}
                    title="Baixar modelo de voz neural uma única vez (~60 MB) para uso offline e ilimitado"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    Baixar 1x (~{activeLocalSpec.sizeMb} MB)
                  </button>
                )
              )}
            </>
          ) : (
            voices.length > 0 && (
              <select
                aria-label="Selecionar voz em português"
                value={voiceURI || voices[0]?.voiceURI || ''}
                onChange={(e) => onChangeVoice(e.target.value)}
                className="ce-select h-[30px] w-auto max-w-[185px] text-[11px] py-0.5"
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            )
          )}

          <select
            aria-label="Velocidade da leitura em voz"
            value={rate}
            onChange={(e) => onChangeRate(Number(e.target.value))}
            className="ce-select h-[30px] w-auto text-[11px] py-0.5 font-mono-num"
          >
            {SPEED_OPTIONS.map((spd) => (
              <option key={spd} value={spd}>
                {spd}x
              </option>
            ))}
          </select>

          {onToggleSkipLegislativeNotes && (
            <button
              type="button"
              onClick={onToggleSkipLegislativeNotes}
              title="Pular anotações legislativas entre parênteses como '(Incluído pela Lei nº ...)' e '(Redação dada...)' para leitura contínua"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                skipLegislativeNotes
                  ? 'border-[var(--accent)]/55 bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <Filter className="w-3 h-3" />
              Pular notas {skipLegislativeNotes ? '(Sim)' : '(Não)'}
            </button>
          )}

          <button
            type="button"
            onClick={onToggleAutoMarkRead}
            title="Marcar dispositivo como lido automaticamente quando a leitura em voz terminar"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
              autoMarkRead
                ? 'border-[var(--good)]/60 bg-[var(--good)]/12 text-[var(--good)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <CheckSquare className="w-3 h-3" />
            Auto-lido {autoMarkRead ? '(Sim)' : '(Não)'}
          </button>
        </div>
      </div>

      {localDownloadProgress && (
        <div className="pt-2 border-t border-[var(--line)] flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
            <span className="font-semibold text-[var(--text)]">
              Baixando modelo neural local ({activeLocalSpec.shortName} · pt-BR) — salvo uma única
              vez no navegador para uso offline e sem cotas
            </span>
            <span className="font-mono-num tabular-nums text-[var(--accent)] font-bold">
              {localDownloadProgress.percent}% ({localDownloadProgress.loadedMb.toFixed(1)} /{' '}
              {localDownloadProgress.totalMb.toFixed(1)} MB)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--panel-soft)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-200"
              style={{ width: `${Math.max(3, localDownloadProgress.percent)}%` }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--line)] text-[11.5px] text-[var(--warning)]">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </span>
          {onChangeEngine && (
            <button
              type="button"
              onClick={() =>
                onChangeEngine(
                  engine === 'local'
                    ? 'browser'
                    : isLocalSupported
                      ? 'local'
                      : 'browser',
                )
              }
              className="px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              {engine === 'local' ? 'Usar Voz do Navegador' : 'Usar Voz Neural Local'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
