import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Flame,
  Layers,
  RotateCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import {
  FlashcardRating,
  FlashcardSource,
  buildFlashcardDeck,
} from '../../lib/studyTools';
import { formatIsoDateBr } from '../../lib/parsers';
import { StructuredLegalText } from '../ui/StructuredLegalText';

interface FlashcardsReviewModalProps {
  open: boolean;
  onClose: () => void;
  initialSources?: FlashcardSource[];
  initialSubject?: string;
}

const SOURCE_OPTIONS: Array<{ id: FlashcardSource; label: string }> = [
  { id: 'errors', label: 'Caderno de Erros' },
  { id: 'caselaw', label: 'Súmulas & Juris' },
  { id: 'critical', label: 'Pontos Críticos' },
  { id: 'laws', label: 'Lei Seca (Alta Incid.)' },
];

export const FlashcardsReviewModal: React.FC<FlashcardsReviewModalProps> = ({
  open,
  onClose,
  initialSources = ['errors', 'caselaw', 'critical', 'laws'],
  initialSubject = 'Todas',
}) => {
  const { db, rateFlashcardSrs } = useStudy();

  const [selectedSources, setSelectedSources] = useState<FlashcardSource[]>(initialSources);
  const [subjectFilter, setSubjectFilter] = useState<string>(initialSubject);
  const [onlyDue, setOnlyDue] = useState<boolean>(true);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [sessionStats, setSessionStats] = useState({ hard: 0, medium: 0, easy: 0 });

  useEffect(() => {
    if (open) {
      setSelectedSources(initialSources);
      setSubjectFilter(initialSubject);
      setRevealed(false);
      setReviewedIds(new Set());
      setSessionStats({ hard: 0, medium: 0, easy: 0 });
    }
  }, [open, initialSources, initialSubject]);

  const allCardsUnfilteredByDue = useMemo(
    () => buildFlashcardDeck(db, selectedSources, 'Todas', false),
    [db, selectedSources],
  );

  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    allCardsUnfilteredByDue.forEach((c) => {
      if (c.subject) set.add(c.subject);
    });
    return ['Todas', ...[...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [allCardsUnfilteredByDue]);

  const deck = useMemo(() => {
    const raw = buildFlashcardDeck(db, selectedSources, subjectFilter, onlyDue);
    return raw.filter((c) => !reviewedIds.has(c.id));
  }, [db, selectedSources, subjectFilter, onlyDue, reviewedIds]);

  const activeCard = deck[0] || null;
  const totalReviewed = sessionStats.hard + sessionStats.medium + sessionStats.easy;

  const handleToggleSource = (src: FlashcardSource) => {
    setSelectedSources((prev) => {
      if (prev.includes(src)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== src);
      }
      return [...prev, src];
    });
    setRevealed(false);
  };

  const handleRate = (rating: FlashcardRating) => {
    if (!activeCard) return;
    rateFlashcardSrs(
      {
        id: activeCard.id,
        errorEntryId: activeCard.errorEntryId,
        srsLevel: activeCard.srsLevel,
      },
      rating,
    );
    setReviewedIds((prev) => {
      const next = new Set(prev);
      next.add(activeCard.id);
      return next;
    });
    setSessionStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    setRevealed(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!activeCard) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        if (!revealed) {
          e.preventDefault();
          setRevealed(true);
        }
      } else if (revealed && e.key === '1') {
        e.preventDefault();
        handleRate('hard');
      } else if (revealed && e.key === '2') {
        e.preventDefault();
        handleRate('medium');
      } else if (revealed && e.key === '3') {
        e.preventDefault();
        handleRate('easy');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Modo Flashcards e Revisão Ativa SRS"
    >
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--line)] flex items-center justify-between gap-3 bg-[var(--panel-soft)]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Revisão Ativa · Repetição Espaçada (SRS)</span>
            </div>
            <h3 className="m-0 mt-0.5 font-display text-[17px] font-extrabold text-[var(--text)]">
              Flashcards Integrados do Acervo
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar flashcards"
            className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters bar */}
        <div className="px-4 sm:px-5 py-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2.5 bg-[var(--panel)]">
          <div className="flex flex-wrap items-center gap-1.5">
            {SOURCE_OPTIONS.map((opt) => {
              const active = selectedSources.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleToggleSource(opt.id)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setRevealed(false);
              }}
              className="ce-input h-8 rounded-lg px-2 text-[11.5px] max-w-[190px]"
            >
              {availableSubjects.map((s) => (
                <option key={s} value={s}>
                  {s === 'Todas' ? 'Todas as matérias' : s}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyDue}
                onChange={(e) => {
                  setOnlyDue(e.target.checked);
                  setRevealed(false);
                }}
                className="accent-[var(--accent)]"
              />
              Somente pendentes hoje
            </label>
          </div>
        </div>

        {/* Card Stage */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--muted)]">
            <span className="font-mono-num">
              Na fila: <strong className="text-[var(--text)]">{deck.length}</strong> cartão(ões) ·
              Revisados nesta sessão:{' '}
              <strong className="text-[var(--good)]">{totalReviewed}</strong>
            </span>
            <span className="hidden sm:inline text-[11px]">
              Atalhos: <kbd className="px-1.5 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel-soft)] font-mono-num">Espaço</kbd> virar ·{' '}
              <kbd className="px-1.5 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel-soft)] font-mono-num">1</kbd> Difícil ·{' '}
              <kbd className="px-1.5 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel-soft)] font-mono-num">2</kbd> Médio ·{' '}
              <kbd className="px-1.5 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel-soft)] font-mono-num">3</kbd> Fácil
            </span>
          </div>

          {activeCard ? (
            <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-5 sm:p-6 flex flex-col gap-4 shadow-sm">
              {/* Card Metadata */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--line)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-[var(--accent)] text-white text-[10px] font-extrabold uppercase tracking-wider">
                    {activeCard.sourceLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)]">
                    {activeCard.subject}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--muted)]">
                    {activeCard.title}
                  </span>
                </div>
                <div className="text-[11px] font-mono-num text-[var(--muted)]">
                  Nível SRS {activeCard.srsLevel}
                  {activeCard.nextReviewIso
                    ? ` · Prev.: ${formatIsoDateBr(activeCard.nextReviewIso)}`
                    : ' · Novo'}
                </div>
              </div>

              {/* Front */}
              <div>
                <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-1.5">
                  Frente (Estímulo / Recordação Ativa)
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-[13.5px] leading-relaxed text-[var(--text)]">
                  <StructuredLegalText text={activeCard.front} />
                </div>
                {activeCard.frontMeta && (
                  <p className="m-0 mt-1.5 text-[11.5px] text-[var(--muted)]">
                    {activeCard.frontMeta}
                  </p>
                )}
              </div>

              {/* Back (Revealed) */}
              {revealed ? (
                <div className="pt-3 border-t border-dashed border-[var(--line-strong)]">
                  <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--good)] mb-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Verso (Resposta / Gabarito / Texto Integral)</span>
                  </div>
                  <div className="rounded-xl border border-[var(--good)]/35 bg-[var(--good)]/5 p-4 text-[13.5px] leading-relaxed text-[var(--text)]">
                    <StructuredLegalText text={activeCard.back} />
                    {activeCard.backExtra && (
                      <div className="mt-3 pt-2.5 border-t border-[var(--good)]/20 text-[12px] text-[var(--muted)]">
                        <StructuredLegalText text={activeCard.backExtra} compact />
                      </div>
                    )}
                  </div>

                  {/* Rating Controls */}
                  <div className="mt-4">
                    <div className="text-[11.5px] font-bold text-[var(--muted)] mb-2 text-center">
                      Como foi sua recordação? O intervalo de repetição espaçada será ajustado automaticamente:
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleRate('hard')}
                        className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border border-[var(--bad)]/40 bg-[var(--bad)]/10 text-[var(--bad)] hover:bg-[var(--bad)] hover:text-white transition-colors cursor-pointer"
                      >
                        <strong className="text-[13px] font-extrabold">1 · Difícil</strong>
                        <span className="text-[10.5px] opacity-85">Rever amanhã (+1d)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRate('medium')}
                        className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)] hover:bg-[var(--warning)] hover:text-white transition-colors cursor-pointer"
                      >
                        <strong className="text-[13px] font-extrabold">2 · Médio</strong>
                        <span className="text-[10.5px] opacity-85">Avançar nível SRS</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRate('easy')}
                        className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border border-[var(--good)]/40 bg-[var(--good)]/10 text-[var(--good)] hover:bg-[var(--good)] hover:text-white transition-colors cursor-pointer"
                      >
                        <strong className="text-[13px] font-extrabold">3 · Fácil</strong>
                        <span className="text-[10.5px] opacity-85">Espaçar mais (+2 níveis)</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="inline-flex items-center gap-2 h-11 px-6 rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-white text-[13.5px] font-extrabold shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    Mostrar Resposta (Espaço)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-8 text-center flex flex-col items-center gap-3">
              <CheckCircle2 className="w-10 h-10 text-[var(--good)]" />
              <h4 className="m-0 font-display text-[17px] font-extrabold text-[var(--text)]">
                {totalReviewed > 0
                  ? 'Sessão de Flashcards concluída!'
                  : 'Nenhum cartão pendente para os filtros selecionados'}
              </h4>
              <p className="m-0 text-[12.5px] text-[var(--muted)] max-w-md">
                {totalReviewed > 0
                  ? `Você revisou ${totalReviewed} cartão(ões) (${sessionStats.easy} fáceis, ${sessionStats.medium} médios, ${sessionStats.hard} difíceis). Todos os prazos SRS foram salvos.`
                  : 'Desmarque "Somente pendentes hoje" ou habilite mais fontes acima para praticar livremente.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                {onlyDue && (
                  <button
                    type="button"
                    onClick={() => {
                      setOnlyDue(false);
                      setReviewedIds(new Set());
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[12px] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    Estudar todos os cartões (modo livre)
                  </button>
                )}
                {totalReviewed > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewedIds(new Set());
                      setRevealed(false);
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Recarregar fila
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
