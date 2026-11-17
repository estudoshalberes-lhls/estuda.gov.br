import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react';
import { formatSequentialDeviceLabel } from '../../lib/parsers';
import { LawItem } from '../../types/study';

const VOICE_PREFS_STORAGE_KEY = 'ce-law-voice-prefs-v1';

const SPEED_OPTIONS = [0.85, 1, 1.15, 1.25, 1.5, 1.75, 2] as const;

export interface LawVoiceWordRange {
  itemId: string;
  charIndex: number;
  charLength: number;
}

interface StoredVoicePrefs {
  rate: number;
  voiceURI: string;
  autoMarkRead: boolean;
}

function loadVoicePrefs(): StoredVoicePrefs {
  try {
    const raw = localStorage.getItem(VOICE_PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredVoicePrefs>;
      return {
        rate: typeof parsed.rate === 'number' && parsed.rate >= 0.5 && parsed.rate <= 2.5 ? parsed.rate : 1.15,
        voiceURI: typeof parsed.voiceURI === 'string' ? parsed.voiceURI : '',
        autoMarkRead: Boolean(parsed.autoMarkRead),
      };
    }
  } catch {
    // ignore storage errors
  }
  return { rate: 1.15, voiceURI: '', autoMarkRead: false };
}

/**
 * Normalizes legal abbreviations for smoother pt-BR Text-to-Speech while
 * building a direct spoken string for a LawItem.
 */
export function buildSpokenTextForLawItem(item: LawItem): string {
  const displayDevice = formatSequentialDeviceLabel(item.dispositivo, item.artigo_base);
  const expandLegalAbbr = (s: string) =>
    s
      .replace(/§\s*§/g, 'Parágrafos ')
      .replace(/§\s*(\d+)[º°]?/g, 'Parágrafo $1 ')
      .replace(/\bArt\.?\s*(\d+)[º°]?/gi, 'Artigo $1 ')
      .replace(/\bn[º°]\s*/gi, 'número ')
      .replace(/\bInc\.?\s*/gi, 'Inciso ')
      .replace(/\bPar\.?\s*único\b/gi, 'Parágrafo único')
      .replace(/\s+/g, ' ')
      .trim();

  const headerSpoken = expandLegalAbbr(displayDevice);
  const bodySpoken = expandLegalAbbr(item.texto || '');
  return bodySpoken ? `${headerSpoken}. ${bodySpoken}` : headerSpoken;
}

export function useLawVoiceReader(options: {
  activeFolder: string;
  items: LawItem[];
  onPositionChange?: (articleKey: string) => void;
  onAutoMarkItemRead?: (item: LawItem) => void;
}) {
  const { activeFolder, items, onPositionChange, onAutoMarkItemRead } = options;

  const isSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const [prefs, setPrefs] = useState<StoredVoicePrefs>(() => loadVoicePrefs());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [wordRange, setWordRange] = useState<LawVoiceWordRange | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const onPosRef = useRef(onPositionChange);
  onPosRef.current = onPositionChange;
  const onMarkReadRef = useRef(onAutoMarkItemRead);
  onMarkReadRef.current = onAutoMarkItemRead;
  const playbackRunIdRef = useRef(0);
  const activeIndexRef = useRef<number | null>(null);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore storage errors
    }
  }, [prefs]);

  useEffect(() => {
    if (!isSupported) return;
    const synth = window.speechSynthesis;
    const refreshVoices = () => {
      const all = synth.getVoices();
      const ptVoices = all.filter((v) => v.lang.toLowerCase().startsWith('pt'));
      const sorted = [...(ptVoices.length > 0 ? ptVoices : all)].sort((a, b) => {
        const aPtBr = a.lang.toLowerCase() === 'pt-br' ? 1 : 0;
        const bPtBr = b.lang.toLowerCase() === 'pt-br' ? 1 : 0;
        if (aPtBr !== bPtBr) return bPtBr - aPtBr;
        const aNat = /natural|google|microsoft|neural/i.test(a.name) ? 1 : 0;
        const bNat = /natural|google|microsoft|neural/i.test(b.name) ? 1 : 0;
        return bNat - aNat;
      });
      setVoices(sorted);
    };
    refreshVoices();
    synth.addEventListener?.('voiceschanged', refreshVoices);
    return () => {
      synth.removeEventListener?.('voiceschanged', refreshVoices);
    };
  }, [isSupported]);

  const stop = useCallback(() => {
    playbackRunIdRef.current += 1;
    if (isSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore cancel errors
      }
    }
    setIsPlaying(false);
    setIsPaused(false);
    setActiveIndex(null);
    setWordRange(null);
  }, [isSupported]);

  // Stop speech cleanly when folder changes or component unmounts
  useEffect(() => {
    stop();
  }, [activeFolder, stop]);

  useEffect(() => {
    return () => {
      if (isSupported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [isSupported]);

  const speakAtIndex = useCallback(
    (index: number) => {
      if (!isSupported) return;
      const list = itemsRef.current;
      if (index < 0 || index >= list.length) {
        stop();
        return;
      }

      const item = list[index];
      const runId = ++playbackRunIdRef.current;
      const synth = window.speechSynthesis;
      try {
        synth.cancel();
      } catch {
        // ignore
      }

      const spokenText = buildSpokenTextForLawItem(item);
      if (!spokenText) {
        if (index + 1 < list.length) {
          speakAtIndex(index + 1);
        } else {
          stop();
        }
        return;
      }

      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = 'pt-BR';
      utterance.rate = prefsRef.current.rate;

      const selectedVoice =
        voicesRef.current.find((v) => v.voiceURI === prefsRef.current.voiceURI) ||
        voicesRef.current.find((v) => v.lang.toLowerCase() === 'pt-br') ||
        voicesRef.current[0];
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      const articleKey = (item.artigo_base || item.dispositivo || '').trim();
      setActiveIndex(index);
      setIsPlaying(true);
      setIsPaused(false);
      setWordRange(null);
      if (articleKey) {
        onPosRef.current?.(articleKey);
      }

      utterance.onboundary = (ev) => {
        if (playbackRunIdRef.current !== runId) return;
        if (ev.name === 'word' && typeof ev.charIndex === 'number') {
          setWordRange({
            itemId: item.id,
            charIndex: ev.charIndex,
            charLength: typeof ev.charLength === 'number' && ev.charLength > 0 ? ev.charLength : 8,
          });
        }
      };

      utterance.onend = () => {
        if (playbackRunIdRef.current !== runId) return;
        if (prefsRef.current.autoMarkRead) {
          onMarkReadRef.current?.(item);
        }
        const nextIdx = index + 1;
        if (nextIdx < itemsRef.current.length) {
          speakAtIndex(nextIdx);
        } else {
          stop();
        }
      };

      utterance.onerror = (ev) => {
        if (playbackRunIdRef.current !== runId) return;
        if (ev.error === 'interrupted' || ev.error === 'canceled') return;
        stop();
      };

      synth.speak(utterance);
    },
    [isSupported, stop],
  );

  const playFromItemId = useCallback(
    (itemId?: string) => {
      const list = itemsRef.current;
      if (!list.length) return;
      if (!itemId) {
        speakAtIndex(activeIndexRef.current !== null ? activeIndexRef.current : 0);
        return;
      }
      const idx = list.findIndex((it) => it.id === itemId);
      speakAtIndex(idx >= 0 ? idx : 0);
    },
    [speakAtIndex],
  );

  const togglePlayPause = useCallback(() => {
    if (!isSupported) return;
    const synth = window.speechSynthesis;
    if (!isPlaying) {
      speakAtIndex(activeIndexRef.current !== null ? activeIndexRef.current : 0);
      return;
    }
    if (isPaused) {
      synth.resume();
      setIsPaused(false);
    } else {
      synth.pause();
      setIsPaused(true);
    }
  }, [isPaused, isPlaying, isSupported, speakAtIndex]);

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
      speakAtIndex(targetIdx);
    },
    [speakAtIndex],
  );

  const setRate = useCallback(
    (rate: number) => {
      setPrefs((prev) => ({ ...prev, rate }));
      if (isPlaying && activeIndexRef.current !== null) {
        window.setTimeout(() => {
          if (activeIndexRef.current !== null) {
            speakAtIndex(activeIndexRef.current);
          }
        }, 20);
      }
    },
    [isPlaying, speakAtIndex],
  );

  const setVoiceURI = useCallback(
    (voiceURI: string) => {
      setPrefs((prev) => ({ ...prev, voiceURI }));
      if (isPlaying && activeIndexRef.current !== null) {
        window.setTimeout(() => {
          if (activeIndexRef.current !== null) {
            speakAtIndex(activeIndexRef.current);
          }
        }, 20);
      }
    },
    [isPlaying, speakAtIndex],
  );

  const toggleAutoMarkRead = useCallback(() => {
    setPrefs((prev) => ({ ...prev, autoMarkRead: !prev.autoMarkRead }));
  }, []);

  const currentItem = useMemo(
    () => (activeIndex !== null ? items[activeIndex] || null : null),
    [activeIndex, items],
  );

  return {
    isSupported,
    isPlaying,
    isPaused,
    activeIndex,
    currentItem,
    speakingItemId: isPlaying ? currentItem?.id || null : null,
    wordRange: isPlaying ? wordRange : null,
    voices,
    rate: prefs.rate,
    voiceURI: prefs.voiceURI,
    autoMarkRead: prefs.autoMarkRead,
    playFromItemId,
    togglePlayPause,
    stop,
    stepArticle,
    setRate,
    setVoiceURI,
    toggleAutoMarkRead,
  };
}

interface LawVoicePlayerBarProps {
  isSupported: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  activeIndex: number | null;
  totalItems: number;
  currentItem: LawItem | null;
  voices: SpeechSynthesisVoice[];
  rate: number;
  voiceURI: string;
  autoMarkRead: boolean;
  onTogglePlayPause: () => void;
  onStop: () => void;
  onStepArticle: (dir: -1 | 1) => void;
  onChangeRate: (rate: number) => void;
  onChangeVoice: (voiceURI: string) => void;
  onToggleAutoMarkRead: () => void;
}

export const LawVoicePlayerBar: React.FC<LawVoicePlayerBarProps> = ({
  isSupported,
  isPlaying,
  isPaused,
  activeIndex,
  totalItems,
  currentItem,
  voices,
  rate,
  voiceURI,
  autoMarkRead,
  onTogglePlayPause,
  onStop,
  onStepArticle,
  onChangeRate,
  onChangeVoice,
  onToggleAutoMarkRead,
}) => {
  if (!isSupported || totalItems === 0) return null;

  const currentLabel = currentItem
    ? formatSequentialDeviceLabel(currentItem.dispositivo, currentItem.artigo_base)
    : 'Pronto para ler em voz alta';

  return (
    <div className="mb-3 rounded-xl border border-[var(--accent)]/35 bg-[var(--panel)] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--text)]">
          <Volume2 className={`w-4 h-4 ${isPlaying && !isPaused ? 'text-[var(--good)] animate-pulse' : 'text-[var(--accent)]'}`} />
          Leitura em Voz:
        </span>

        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onStepArticle(-1)}
            disabled={!isPlaying}
            title="Artigo anterior"
            className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onTogglePlayPause}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap ${
              isPlaying && !isPaused
                ? 'border-[var(--warning)] bg-[var(--warning)]/15 text-[var(--warning)]'
                : 'border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
            }`}
          >
            {isPlaying && !isPaused ? (
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
            className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {isPlaying && (
            <button
              type="button"
              onClick={onStop}
              title="Parar leitura em voz"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/50"
            >
              <Square className="w-3 h-3" />
              Parar
            </button>
          )}
        </div>

        <span className="text-[11.5px] font-medium text-[var(--muted)] truncate max-w-[260px]">
          {isPlaying && activeIndex !== null
            ? `Lendo ${currentLabel} (${activeIndex + 1}/${totalItems})`
            : currentLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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

        {voices.length > 0 && (
          <select
            aria-label="Selecionar voz em português"
            value={voiceURI || voices[0]?.voiceURI || ''}
            onChange={(e) => onChangeVoice(e.target.value)}
            className="ce-select h-[30px] w-auto max-w-[190px] text-[11px] py-0.5"
          >
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={onToggleAutoMarkRead}
          title="Marcar dispositivo como lido automaticamente quando a leitura em voz terminar"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap ${
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
  );
};
