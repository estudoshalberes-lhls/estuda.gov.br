import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignJustify,
  BookOpen,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Flame,
  Maximize2,
  Minimize2,
  Sparkles,
  Type,
} from 'lucide-react';
import {
  buildSequentialLawIndex,
  localDateIso,
  resolveCanonicalArticleKeyFromQuery,
} from '../../lib/parsers';
import { tokenizeLawCloze } from '../../lib/studyTools';
import { LawItem } from '../../types/study';

export type LawFontSizeKey = 'sm' | 'md' | 'lg' | 'xl';
export type LawLineHeightKey = 'normal' | 'relaxed' | 'loose';
export type LawFontFamilyKey = 'sans' | 'serif';

export interface LawReadingPrefs {
  fontSize: LawFontSizeKey;
  lineHeight: LawLineHeightKey;
  fontFamily: LawFontFamilyKey;
  comfortableWidth: boolean;
  highlightExamWords: boolean;
  cleanMode: boolean;
  clozeMode?: boolean;
}

const STORAGE_KEY = 'ce-law-reading-prefs-v1';

const DEFAULT_PREFS: LawReadingPrefs = {
  fontSize: 'md',
  lineHeight: 'relaxed',
  fontFamily: 'sans',
  comfortableWidth: false,
  highlightExamWords: true,
  cleanMode: false,
  clozeMode: false,
};

export const FONT_SIZE_PX: Record<LawFontSizeKey, string> = {
  sm: '12.5px',
  md: '14px',
  lg: '15.5px',
  xl: '17.5px',
};

export const LINE_HEIGHT_VAL: Record<LawLineHeightKey, string> = {
  normal: '1.6',
  relaxed: '1.85',
  loose: '2.1',
};

export const FONT_FAMILY_CSS: Record<LawFontFamilyKey, string> = {
  sans: 'inherit',
  serif: '"Source Serif 4", Georgia, Cambria, "Times New Roman", serif',
};

const FONT_ORDER: LawFontSizeKey[] = ['sm', 'md', 'lg', 'xl'];

export function useLawReadingPrefs() {
  const [prefs, setPrefs] = useState<LawReadingPrefs>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_PREFS;
      return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<LawReadingPrefs>) };
    } catch {
      return DEFAULT_PREFS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage quota errors
    }
  }, [prefs]);

  const stepFontSize = (dir: -1 | 1) => {
    setPrefs((prev) => {
      const idx = FONT_ORDER.indexOf(prev.fontSize);
      const nextIdx = Math.max(0, Math.min(FONT_ORDER.length - 1, idx + dir));
      return { ...prev, fontSize: FONT_ORDER[nextIdx] };
    });
  };

  const cycleLineHeight = () => {
    setPrefs((prev) => {
      const next: LawLineHeightKey =
        prev.lineHeight === 'normal'
          ? 'relaxed'
          : prev.lineHeight === 'relaxed'
          ? 'loose'
          : 'normal';
      return { ...prev, lineHeight: next };
    });
  };

  const toggleFontFamily = () =>
    setPrefs((prev) => ({
      ...prev,
      fontFamily: prev.fontFamily === 'serif' ? 'sans' : 'serif',
    }));

  const toggleComfortableWidth = () =>
    setPrefs((prev) => ({ ...prev, comfortableWidth: !prev.comfortableWidth }));

  const toggleHighlightExamWords = () =>
    setPrefs((prev) => ({ ...prev, highlightExamWords: !prev.highlightExamWords }));

  const toggleCleanMode = () =>
    setPrefs((prev) => ({ ...prev, cleanMode: !prev.cleanMode }));

  const toggleClozeMode = () =>
    setPrefs((prev) => ({ ...prev, clozeMode: !prev.clozeMode }));

  return {
    prefs,
    setPrefs,
    stepFontSize,
    cycleLineHeight,
    toggleFontFamily,
    toggleComfortableWidth,
    toggleHighlightExamWords,
    toggleCleanMode,
    toggleClozeMode,
  };
}

const EXAM_TRIGGER_REGEX =
  /(\b(?:salvo|exceto|excepcionalmente|vedad[oa]s?|proibid[oa]s?|defeso|exclusivamente|privativamente|obrigatoriamente|independentemente|imprescrit[íi]ve(?:l|is)|inafian[çc][áa]ve(?:l|is)|insuscet[íi]ve(?:l|is)|nul[oa]s?|n[ãa]o\s+se\s+aplica(?:m)?|sem\s+preju[íi]zo|dever[áa](?:o)?|poder[áa](?:o)?|\d+\s*(?:dias?|meses|anos?|horas?))\b)/gi;

export function renderLawTextWithExamHighlights(
  text: string,
  enabled: boolean,
): React.ReactNode {
  if (!enabled || !text) return text;
  const parts = text.split(EXAM_TRIGGER_REGEX);
  if (parts.length <= 1) return text;

  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      const lower = part.toLowerCase();
      const isDeadline = /^\d/.test(lower);
      const isProhibitionOrException =
        /^(?:salvo|exceto|excepcionalmente|vedad|proibid|defeso|nul|n[ãa]o\s+se|imprescrit|inafian|insuscet)/i.test(
          lower,
        );
      if (isDeadline) {
        return (
          <span
            key={idx}
            title="Prazo legal (muito cobrado em provas)"
            className="px-1 py-0.2 rounded bg-[var(--accent)]/15 text-[var(--accent)] font-bold underline decoration-[var(--accent)]/60 underline-offset-2"
          >
            {part}
          </span>
        );
      }
      if (isProhibitionOrException) {
        return (
          <span
            key={idx}
            title="Exceção / Vedação legal (atenção para pegadinhas de banca)"
            className="px-1 py-0.2 rounded bg-[var(--warning)]/15 text-[var(--warning)] font-bold underline decoration-[var(--warning)]/70 underline-offset-2"
          >
            {part}
          </span>
        );
      }
      return (
        <span
          key={idx}
          title="Expressão-chave de prova (competência / obrigatoriedade / faculdade)"
          className="font-bold underline decoration-[var(--accent)]/60 decoration-2 underline-offset-2"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

interface LawClozeTextProps {
  text: string;
  scopeKey: string;
  revealAllSignal: number;
  hideAllSignal: number;
}

export const LawClozeText: React.FC<LawClozeTextProps> = ({
  text,
  scopeKey,
  revealAllSignal,
  hideAllSignal,
}) => {
  const { tokens } = useMemo(() => tokenizeLawCloze(text), [text]);
  const [revealedMap, setRevealedMap] = useState<Record<number, boolean>>({});
  const [allRevealed, setAllRevealed] = useState(false);

  useEffect(() => {
    if (revealAllSignal > 0) {
      setAllRevealed(true);
      setRevealedMap({});
    }
  }, [revealAllSignal]);

  useEffect(() => {
    if (hideAllSignal > 0) {
      setAllRevealed(false);
      setRevealedMap({});
    }
  }, [hideAllSignal]);

  if (!text) return null;

  return (
    <>
      {tokens.map((tk, idx) => {
        if (tk.type === 'text') {
          return <React.Fragment key={`${scopeKey}-t-${idx}`}>{tk.text}</React.Fragment>;
        }
        const tokenIdx = tk.tokenIndex ?? idx;
        const isShown = allRevealed || Boolean(revealedMap[tokenIdx]);
        const badgeColor =
          tk.category === 'deadline'
            ? 'border-[var(--accent)]/60 bg-[var(--accent)]/12 text-[var(--accent)]'
            : tk.category === 'quorum'
            ? 'border-purple-500/50 bg-purple-500/12 text-purple-400'
            : tk.category === 'exception'
            ? 'border-[var(--warning)]/60 bg-[var(--warning)]/14 text-[var(--warning)]'
            : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)]';

        return (
          <button
            key={`${scopeKey}-c-${idx}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (allRevealed) {
                setAllRevealed(false);
                setRevealedMap({});
                return;
              }
              setRevealedMap((prev) => ({ ...prev, [tokenIdx]: !prev[tokenIdx] }));
            }}
            title={
              isShown
                ? `Clique para ocultar novamente (${tk.hint || 'Termo-chave'})`
                : `Clique para revelar: ${tk.hint || 'Termo-chave'}`
            }
            className={`inline-flex items-center mx-0.5 px-1.5 py-0 rounded border font-bold text-[0.92em] align-baseline transition-colors cursor-pointer ${
              isShown
                ? `${badgeColor}`
                : 'border-dashed border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'
            }`}
          >
            {isShown ? tk.text : ` ${tk.hint || '•••'} `}
          </button>
        );
      })}
    </>
  );
};

interface LawReadingToolbarProps {
  prefs: LawReadingPrefs;
  onStepFontSize: (dir: -1 | 1) => void;
  onCycleLineHeight: () => void;
  onToggleFontFamily?: () => void;
  onToggleComfortableWidth: () => void;
  onToggleHighlightExamWords: () => void;
  showClozeModeToggle?: boolean;
  onToggleClozeMode?: () => void;
  onClozeRevealAll?: () => void;
  onClozeHideAll?: () => void;
  showCleanModeToggle?: boolean;
  onToggleCleanMode?: () => void;
  lastReadPosition?: string;
  onResumeLastPosition?: (posKey: string) => void;
}

export const LawReadingToolbar: React.FC<LawReadingToolbarProps> = ({
  prefs,
  onStepFontSize,
  onCycleLineHeight,
  onToggleFontFamily,
  onToggleComfortableWidth,
  onToggleHighlightExamWords,
  showClozeModeToggle,
  onToggleClozeMode,
  onClozeRevealAll,
  onClozeHideAll,
  showCleanModeToggle,
  onToggleCleanMode,
  lastReadPosition,
  onResumeLastPosition,
}) => {
  const lineHeightLabel =
    prefs.lineHeight === 'normal'
      ? 'Normal'
      : prefs.lineHeight === 'relaxed'
      ? 'Confortável'
      : 'Amplo';

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--muted)] mr-1">
          <Type className="w-3.5 h-3.5 text-[var(--accent)]" />
          Conforto de Leitura:
        </span>

        <div className="inline-flex items-center rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
          <button
            type="button"
            onClick={() => onStepFontSize(-1)}
            disabled={prefs.fontSize === 'sm'}
            title="Diminuir tamanho da fonte"
            className="px-2 py-0.5 rounded text-[11px] font-bold text-[var(--text)] hover:bg-[var(--panel-raised)] disabled:opacity-40"
          >
            A-
          </button>
          <span className="px-1.5 font-mono-num text-[10.5px] font-bold text-[var(--muted)]">
            {FONT_SIZE_PX[prefs.fontSize]}
          </span>
          <button
            type="button"
            onClick={() => onStepFontSize(1)}
            disabled={prefs.fontSize === 'xl'}
            title="Aumentar tamanho da fonte"
            className="px-2 py-0.5 rounded text-[11px] font-bold text-[var(--text)] hover:bg-[var(--panel-raised)] disabled:opacity-40"
          >
            A+
          </button>
        </div>

        <button
          type="button"
          onClick={onCycleLineHeight}
          title="Alternar espaçamento entre linhas"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
        >
          <AlignJustify className="w-3 h-3 text-[var(--accent)]" />
          Entrelinha: {lineHeightLabel}
        </button>

        {onToggleFontFamily && (
          <button
            type="button"
            onClick={onToggleFontFamily}
            title="Alternar entre fonte editorial com serifa (ideal para leitura longa) e sem serifa"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap ${
              prefs.fontFamily === 'serif'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            <span className={prefs.fontFamily === 'serif' ? 'font-serif' : ''}>Aa</span>
            {prefs.fontFamily === 'serif' ? 'Serifa' : 'Sem Serifa'}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleComfortableWidth}
          title="Alternar entre coluna centralizada de leitura (foco) e largura total"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
            prefs.comfortableWidth
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
              : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
          }`}
        >
          {prefs.comfortableWidth ? (
            <Maximize2 className="w-3 h-3" />
          ) : (
            <Minimize2 className="w-3 h-3 text-[var(--accent)]" />
          )}
          {prefs.comfortableWidth ? 'Coluna Foco (Ativa)' : 'Largura Foco'}
        </button>

        <button
          type="button"
          onClick={onToggleHighlightExamWords}
          title="Destacar automaticamente exceções (salvo, exceto, vedado), competências e prazos no texto legal"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
            prefs.highlightExamWords
              ? 'border-[var(--warning)]/60 bg-[var(--warning)]/12 text-[var(--warning)]'
              : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          Palavras de Prova {prefs.highlightExamWords ? '(Ligado)' : '(Desligado)'}
        </button>

        {showClozeModeToggle && onToggleClozeMode && (
          <>
            <button
              type="button"
              onClick={onToggleClozeMode}
              title="Ocultar prazos, quóruns, porcentagens e exceções (salvo, exceto, vedado) para memorização ativa — clique nas lacunas para revelar"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                prefs.clozeMode
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
              }`}
            >
              <EyeOff className="w-3 h-3" />
              {prefs.clozeMode ? 'Leitura Ativa Cloze (Ativo)' : 'Ocultar Prazos / Exceções'}
            </button>

            {prefs.clozeMode && onClozeRevealAll && onClozeHideAll && (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={onClozeRevealAll}
                  className="px-2 py-1 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/10 text-[var(--good)] text-[10.5px] font-bold hover:bg-[var(--good)] hover:text-white transition-colors cursor-pointer"
                >
                  Revelar tudo
                </button>
                <button
                  type="button"
                  onClick={onClozeHideAll}
                  className="px-2 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)] text-[10.5px] font-bold hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  Ocultar tudo
                </button>
              </div>
            )}
          </>
        )}

        {showCleanModeToggle && onToggleCleanMode && (
          <button
            type="button"
            onClick={onToggleCleanMode}
            title="Ocultar caixas de edição inferiores para ler a lei e as dicas sem poluição visual"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
              prefs.cleanMode
                ? 'border-[var(--good)]/60 bg-[var(--good)]/12 text-[var(--good)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            <Eye className="w-3 h-3" />
            {prefs.cleanMode ? 'Modo Leitura Limpa (Ativo)' : 'Modo Leitura Limpa'}
          </button>
        )}
      </div>

      {lastReadPosition && onResumeLastPosition && (
        <button
          type="button"
          onClick={() => onResumeLastPosition(lastReadPosition)}
          title={`Ir direto para o último artigo lido/acessado nesta lei (${lastReadPosition})`}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors whitespace-nowrap"
        >
          <BookmarkCheck className="w-3.5 h-3.5" />
          Continuar de onde parei: {lastReadPosition}
        </button>
      )}
    </div>
  );
};

interface ArticleJumpBarProps {
  items: LawItem[];
  readSet: Set<string>;
  lastReadPosition?: string;
  activeArticleKey?: string;
  onSelectArticle: (articleKey: string) => void;
}

export const ArticleJumpBar: React.FC<ArticleJumpBarProps> = ({
  items,
  readSet,
  lastReadPosition,
  activeArticleKey,
  onSelectArticle,
}) => {
  const [expanded, setExpanded] = useState(false);

  const articles = useMemo(() => {
    const seqIndex = buildSequentialLawIndex(items);
    const todayIso = localDateIso();
    const todayMs = new Date(`${todayIso}T00:00:00`).getTime();

    return seqIndex.articleGroups.map((group) => {
      let read = 0;
      let highIncidence = false;
      let staleDays: number | null = null;

      for (const item of group.items) {
        const hasReadDate = (item.leituras?.length || 0) > 0;
        if (readSet.has(item.id) || hasReadDate) {
          read += 1;
        }
        if (item.grau === 'Muito Alto' || item.grau === 'Alto') {
          highIncidence = true;
        }
        const latestDate = [...(item.leituras || [])].sort((a, b) =>
          b.data.localeCompare(a.data),
        )[0]?.data;
        if (latestDate) {
          const diff = Math.round(
            (todayMs - new Date(`${latestDate}T00:00:00`).getTime()) / 86400000,
          );
          if (Number.isFinite(diff)) {
            staleDays = staleDays === null ? diff : Math.min(staleDays, diff);
          }
        }
      }

      return {
        canonicalKey: group.canonicalKey,
        key: group.canonicalLabel,
        seqIndex: group.articleSeqIndex,
        total: group.items.length,
        read,
        highIncidence,
        staleDays,
      };
    });
  }, [items, readSet]);

  if (articles.length <= 1) return null;

  const visibleArticles = expanded ? articles : articles.slice(0, 18);

  return (
    <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[var(--muted)]">
          <span className="inline-flex items-center gap-1 text-[var(--text)]">
            <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
            Índice Rápido de Artigos ({articles.length}):
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--good)]" /> Lido
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--warning)]" /> Revisão (+15d)
          </span>
          <span className="inline-flex items-center gap-1">
            <Flame className="w-3 h-3 text-[var(--accent)]" /> Alta Incidência
          </span>
        </div>

        {articles.length > 18 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline"
          >
            {expanded ? (
              <>
                Recolher índice <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Ver todos os {articles.length} artigos <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 max-h-[165px] overflow-y-auto pr-1">
        {visibleArticles.map((art) => {
          const allRead = art.read >= art.total && art.total > 0;
          const isStale = art.staleDays !== null && art.staleDays >= 15;
          const lastPosCanonical = lastReadPosition
            ? resolveCanonicalArticleKeyFromQuery(lastReadPosition)
            : '';
          const activeCanonical = activeArticleKey
            ? resolveCanonicalArticleKeyFromQuery(activeArticleKey)
            : '';
          const isLastPos = Boolean(lastPosCanonical && lastPosCanonical === art.canonicalKey);
          const isActive = Boolean(activeCanonical && activeCanonical === art.canonicalKey);

          let borderAndBg =
            'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--accent)]';
          if (isActive || isLastPos) {
            borderAndBg =
              'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]';
          } else if (isStale) {
            borderAndBg =
              'border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)] hover:border-[var(--warning)]';
          } else if (allRead) {
            borderAndBg =
              'border-[var(--good)]/50 bg-[var(--good)]/10 text-[var(--good)] hover:border-[var(--good)]';
          }

          return (
            <button
              key={art.canonicalKey}
              type="button"
              onClick={() => onSelectArticle(art.key)}
              title={`${art.seqIndex > 0 ? `#${art.seqIndex} · ` : ''}${art.key} · ${art.read}/${art.total} lidos${
                art.highIncidence ? ' · Alta Incidência' : ''
              }${isStale ? ` · Sem revisão há ${art.staleDays}d` : ''}`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold transition-colors ${borderAndBg}`}
            >
              {art.highIncidence && (
                <Flame className="w-2.5 h-2.5 text-[var(--accent)] shrink-0" />
              )}
              <span>{art.key}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export function buildArticleAnchorId(prefix: string, articleKey: string): string {
  const safe = String(articleKey || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-${safe || 'item'}`;
}
