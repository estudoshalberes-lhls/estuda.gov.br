import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignJustify,
  BookOpen,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Eye,
  Flame,
  Maximize2,
  Minimize2,
  Sparkles,
  Type,
} from 'lucide-react';
import { localDateIso, normalizeSearch } from '../../lib/parsers';
import { LawItem } from '../../types/study';

export type LawFontSizeKey = 'sm' | 'md' | 'lg' | 'xl';
export type LawLineHeightKey = 'normal' | 'relaxed' | 'loose';

export interface LawReadingPrefs {
  fontSize: LawFontSizeKey;
  lineHeight: LawLineHeightKey;
  comfortableWidth: boolean;
  highlightExamWords: boolean;
  cleanMode: boolean;
}

const STORAGE_KEY = 'ce-law-reading-prefs-v1';

const DEFAULT_PREFS: LawReadingPrefs = {
  fontSize: 'md',
  lineHeight: 'relaxed',
  comfortableWidth: false,
  highlightExamWords: true,
  cleanMode: false,
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

  const toggleComfortableWidth = () =>
    setPrefs((prev) => ({ ...prev, comfortableWidth: !prev.comfortableWidth }));

  const toggleHighlightExamWords = () =>
    setPrefs((prev) => ({ ...prev, highlightExamWords: !prev.highlightExamWords }));

  const toggleCleanMode = () =>
    setPrefs((prev) => ({ ...prev, cleanMode: !prev.cleanMode }));

  return {
    prefs,
    setPrefs,
    stepFontSize,
    cycleLineHeight,
    toggleComfortableWidth,
    toggleHighlightExamWords,
    toggleCleanMode,
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

interface LawReadingToolbarProps {
  prefs: LawReadingPrefs;
  onStepFontSize: (dir: -1 | 1) => void;
  onCycleLineHeight: () => void;
  onToggleComfortableWidth: () => void;
  onToggleHighlightExamWords: () => void;
  showCleanModeToggle?: boolean;
  onToggleCleanMode?: () => void;
  lastReadPosition?: string;
  onResumeLastPosition?: (posKey: string) => void;
}

export const LawReadingToolbar: React.FC<LawReadingToolbarProps> = ({
  prefs,
  onStepFontSize,
  onCycleLineHeight,
  onToggleComfortableWidth,
  onToggleHighlightExamWords,
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
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
        >
          <AlignJustify className="w-3 h-3 text-[var(--accent)]" />
          Entrelinha: {lineHeightLabel}
        </button>

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
    const map = new Map<
      string,
      {
        key: string;
        total: number;
        read: number;
        highIncidence: boolean;
        staleDays: number | null;
      }
    >();
    const todayIso = localDateIso();
    const todayMs = new Date(`${todayIso}T00:00:00`).getTime();

    for (const item of items) {
      const key = (item.artigo_base || item.dispositivo || 'Outros').trim();
      if (!key) continue;
      const existing = map.get(key) || {
        key,
        total: 0,
        read: 0,
        highIncidence: false,
        staleDays: null,
      };
      existing.total += 1;
      const hasReadDate = (item.leituras?.length || 0) > 0;
      if (readSet.has(item.id) || hasReadDate) {
        existing.read += 1;
      }
      if (item.grau === 'Muito Alto' || item.grau === 'Alto') {
        existing.highIncidence = true;
      }
      const latestDate = [...(item.leituras || [])].sort((a, b) =>
        b.data.localeCompare(a.data),
      )[0]?.data;
      if (latestDate) {
        const diff = Math.round(
          (todayMs - new Date(`${latestDate}T00:00:00`).getTime()) / 86400000,
        );
        if (Number.isFinite(diff)) {
          existing.staleDays =
            existing.staleDays === null ? diff : Math.min(existing.staleDays, diff);
        }
      }
      map.set(key, existing);
    }
    return Array.from(map.values());
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
          const isLastPos =
            lastReadPosition &&
            normalizeSearch(lastReadPosition) === normalizeSearch(art.key);
          const isActive =
            activeArticleKey &&
            normalizeSearch(activeArticleKey) === normalizeSearch(art.key);

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
              key={art.key}
              type="button"
              onClick={() => onSelectArticle(art.key)}
              title={`${art.key} · ${art.read}/${art.total} lidos${
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
