import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookMarked,
  CalendarPlus,
  Check,
  Clock3,
  Flame,
  Link2,
  Play,
  RotateCw,
  Scale,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import {
  WEEKDAYS,
  formatScheduleDuration,
  localDateIso,
  scheduleDurationSeconds,
  visibleName,
} from '../../lib/parsers';
import { WeekdayName } from '../../types/study';
import { Panel } from '../ui/PageHeader';

const STAGE_LABELS = ['24h', '7d', '15d', '30d'] as const;

function daysBetweenIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

interface TodayFocusPanelProps {
  dueErrorsCount: number;
  dueLawsCount: number;
  firstDueLaw?: { folder: string; articleKey: string; label: string } | null;
  onOpenFlashcards?: () => void;
}

export const TodayFocusPanel: React.FC<TodayFocusPanelProps> = ({
  dueErrorsCount,
  dueLawsCount,
  firstDueLaw,
  onOpenFlashcards,
}) => {
  const {
    db,
    setActivePage,
    linkTimerToScheduleTopic,
    completeScheduleTopic,
    logQuickStudyMinutes,
    activeTimerTopic,
    advanceTopicReview,
    scheduleTopicReviewToDay,
    deleteTopicReview,
    openLawAt,
  } = useStudy();

  const todayIso = localDateIso();
  const todayWeekday = WEEKDAYS[(new Date().getDay() + 6) % 7] as WeekdayName;
  const todayTopics = db.schedule[todayWeekday] || [];

  const [reviewFilter, setReviewFilter] = useState<'due' | 'upcoming'>('due');
  const [quickAddSubject, setQuickAddSubject] = useState('');

  const allActiveTopicReviews = useMemo(
    () =>
      (db.topicReviews || [])
        .filter((r) => !r.done)
        .sort((a, b) => a.nextReviewIso.localeCompare(b.nextReviewIso)),
    [db.topicReviews],
  );

  const dueTopicReviews = useMemo(
    () => allActiveTopicReviews.filter((r) => r.nextReviewIso <= todayIso),
    [allActiveTopicReviews, todayIso],
  );

  const upcomingTopicReviews = useMemo(
    () => allActiveTopicReviews.filter((r) => r.nextReviewIso > todayIso),
    [allActiveTopicReviews, todayIso],
  );

  const visibleReviews = reviewFilter === 'due' ? dueTopicReviews : upcomingTopicReviews;

  // Most recent saved Lei Seca reading position
  const lastLawPositions = useMemo(() => {
    const entries = Object.entries(db.lawLastReadPosition || {}).filter(
      ([folder, artKey]) => Boolean(db.laws[folder]) && Boolean(artKey),
    );
    return entries.slice(0, 3);
  }, [db.lawLastReadPosition, db.laws]);

  const totalDueCount = dueTopicReviews.length + dueErrorsCount + dueLawsCount;

  const handleQuickCredit = (topic: (typeof todayTopics)[number], minutes: number) => {
    logQuickStudyMinutes(todayWeekday, topic, minutes);
    setQuickAddSubject(`${topic.id || topic.materia}:${minutes}`);
    window.setTimeout(() => setQuickAddSubject(''), 1400);
  };

  return (
    <Panel
      className="mb-4"
      title={`Foco de Hoje · ${todayWeekday}`}
      action={
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="text-[var(--muted)] font-mono-num tabular-nums">
            {todayTopics.length} no expediente · {totalDueCount} revisão(ões) pendente(s)
          </span>
          <button
            type="button"
            onClick={() => setActivePage('Cronograma')}
            className="text-[var(--accent)] font-bold hover:underline whitespace-nowrap"
          >
            Abrir Expediente
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Today's Execution Queue + Resume Law Reading */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[12.5px] font-extrabold text-[var(--text)] flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-[var(--accent)]" />
              Expediente de Hoje ({todayTopics.length})
            </h3>
            {todayTopics.length > 0 && (
              <span className="text-[11px] text-[var(--muted)] font-mono-num tabular-nums">
                Previsto:{' '}
                {formatScheduleDuration(
                  todayTopics.reduce((s, t) => s + scheduleDurationSeconds(t.tempo || ''), 0),
                )}
              </span>
            )}
          </div>

          {todayTopics.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[12.5px] font-bold text-[var(--text)]">
                  Nenhum tópico agendado para {todayWeekday}.
                </div>
                <p className="text-[11.5px] text-[var(--muted)] mt-0.5">
                  Envie revisões da fila ao lado, puxe um ponto do Edital ou monte seu dia no Expediente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePage('Cronograma')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Planejar hoje
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] overflow-hidden">
              {todayTopics.map((topic, idx) => {
                const subjectName = topic.disciplina_fixa || topic.materia || 'Estudo Geral';
                const isTimerActive =
                  Boolean(activeTimerTopic?.topicId) && activeTimerTopic?.topicId === topic.id;
                return (
                  <div
                    key={topic.id || `${idx}-${topic.materia}`}
                    className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                      isTimerActive ? 'bg-[var(--accent-soft)]/50' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
                        <span className="font-bold text-[var(--accent)]">
                          {visibleName(subjectName)}
                        </span>
                        {topic.tempo && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num tabular-nums">{topic.tempo}</span>
                          </>
                        )}
                        {topic.editalPointId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--good)]">
                              <Link2 className="w-3 h-3" />
                              Sincronizado c/ Edital
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-[13px] font-bold text-[var(--text)] truncate mt-0.5">
                        {visibleName(topic.materia || subjectName)}
                      </div>
                      {topic.observacoes && (
                        <div className="text-[11px] text-[var(--muted)] truncate mt-0.5">
                          {topic.observacoes}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => linkTimerToScheduleTopic(todayWeekday, topic, true)}
                        title="Iniciar cronômetro vinculado a este tópico"
                        className={`inline-flex items-center gap-1 h-[30px] px-2.5 rounded-lg border text-[11px] font-bold whitespace-nowrap transition-colors ${
                          isTimerActive
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                            : 'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--accent)] hover:border-[var(--accent)]'
                        }`}
                      >
                        <Play className="w-3 h-3" />
                        {isTimerActive ? 'Ativo' : 'Iniciar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickCredit(topic, 15)}
                        title="Registrar +15 minutos rapidamente nesta matéria"
                        className={`h-[30px] px-2 rounded-lg border text-[11px] font-mono-num tabular-nums font-bold transition-colors ${
                          quickAddSubject === `${topic.id || topic.materia}:15`
                            ? 'border-[var(--good)] bg-[var(--good)] text-white'
                            : 'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--accent)]'
                        }`}
                      >
                        +15m
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickCredit(topic, 30)}
                        title="Registrar +30 minutos rapidamente nesta matéria"
                        className={`h-[30px] px-2 rounded-lg border text-[11px] font-mono-num tabular-nums font-bold transition-colors ${
                          quickAddSubject === `${topic.id || topic.materia}:30`
                            ? 'border-[var(--good)] bg-[var(--good)] text-white'
                            : 'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--accent)]'
                        }`}
                      >
                        +30m
                      </button>

                      <button
                        type="button"
                        onClick={() => completeScheduleTopic(todayWeekday, idx, todayTopics)}
                        title="Concluir tópico (marca ponto do Edital e agenda revisão 24h)"
                        className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-lg border border-[var(--good)]/60 bg-[var(--good)]/15 text-[var(--good)] hover:bg-[var(--good)] hover:text-white text-[11px] font-bold whitespace-nowrap transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Concluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 1-Click Resume Last Lei Seca Reading */}
          {lastLawPositions.length > 0 && (
            <div className="pt-1 flex flex-wrap items-center gap-2 text-[11.5px]">
              <span className="inline-flex items-center gap-1 font-bold text-[var(--muted)]">
                <Scale className="w-3.5 h-3.5 text-[var(--accent)]" />
                Retomar Lei Seca:
              </span>
              {lastLawPositions.map(([folder, artKey]) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => openLawAt(folder, artKey)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <BookMarked className="w-3 h-3 text-[var(--accent)]" />
                  <span className="max-w-[160px] truncate">{visibleName(folder)}</span>
                  <span className="text-[var(--muted)] font-mono-num">· {artKey}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Automatic Spaced Repetition Queue (24h · 7d · 15d · 30d) */}
        <div className="lg:col-span-5 flex flex-col gap-3 lg:border-l lg:border-[var(--line)] lg:pl-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[12.5px] font-extrabold text-[var(--text)] flex items-center gap-1.5">
              <RotateCw className="w-4 h-4 text-[var(--accent)]" />
              Revisões Espaçadas (24h · 7d · 15d · 30d)
            </h3>

            <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setReviewFilter('due')}
                className={`px-2 py-0.5 rounded-md font-bold font-mono-num tabular-nums transition-colors ${
                  reviewFilter === 'due'
                    ? 'bg-[var(--panel)] text-[var(--accent)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Hoje ({dueTopicReviews.length})
              </button>
              <button
                type="button"
                onClick={() => setReviewFilter('upcoming')}
                className={`px-2 py-0.5 rounded-md font-bold font-mono-num tabular-nums transition-colors ${
                  reviewFilter === 'upcoming'
                    ? 'bg-[var(--panel)] text-[var(--accent)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Próximas ({upcomingTopicReviews.length})
              </button>
            </div>
          </div>

          {/* Quick summary strip for Errors & Laws due today */}
          {(dueErrorsCount > 0 || dueLawsCount > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] pb-2 border-b border-[var(--line)]">
              {dueErrorsCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenFlashcards ? onOpenFlashcards() : setActivePage('Caderno de Erros')
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)] font-bold hover:bg-[var(--warning)] hover:text-white transition-colors"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="font-mono-num tabular-nums">{dueErrorsCount}</span> erro(s) vencido(s)
                </button>
              )}
              {dueLawsCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    firstDueLaw
                      ? openLawAt(firstDueLaw.folder, firstDueLaw.articleKey)
                      : setActivePage('Lei Seca')
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span className="font-mono-num tabular-nums">{dueLawsCount}</span> lei(s) p/ reler
                </button>
              )}
            </div>
          )}

          {visibleReviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-3.5 text-[12px] text-[var(--muted)]">
              {reviewFilter === 'due'
                ? 'Nenhuma revisão espaçada vencida hoje. Sempre que você concluir uma meta no Expediente ou marcar um ponto do Edital, ela entra automaticamente no ciclo 24h → 7d → 15d → 30d.'
                : 'Nenhuma revisão futura programada ainda.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-0.5">
              {visibleReviews.slice(0, 8).map((rev) => {
                const stageLabel = STAGE_LABELS[Math.min(rev.stageIndex, STAGE_LABELS.length - 1)];
                const overdueDays = daysBetweenIso(rev.nextReviewIso, todayIso);
                return (
                  <div
                    key={rev.id}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2.5 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-[var(--muted)]">
                        <span className="font-extrabold text-[var(--accent)]">
                          Ciclo {stageLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[var(--text)] truncate max-w-[140px]">
                          {visibleName(rev.subject)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num tabular-nums">
                          {overdueDays > 0
                            ? `${overdueDays}d atrasada`
                            : overdueDays === 0
                              ? 'Vence hoje'
                              : `Em ${Math.abs(overdueDays)}d`}
                        </span>
                      </div>
                      <div className="text-[12px] font-bold text-[var(--text)] truncate mt-0.5">
                        {visibleName(rev.topic)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => advanceTopicReview(rev.id)}
                        title="Marcar como revisado e avançar para o próximo ciclo (7d / 15d / 30d)"
                        className="inline-flex items-center gap-1 h-[28px] px-2 rounded-md border border-[var(--good)]/50 bg-[var(--good)]/12 text-[var(--good)] hover:bg-[var(--good)] hover:text-white text-[10.5px] font-bold whitespace-nowrap transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        Revisado
                      </button>
                      <button
                        type="button"
                        onClick={() => scheduleTopicReviewToDay(rev.id, todayWeekday)}
                        title={`Enviar revisão para o Expediente de hoje (${todayWeekday})`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--accent)] hover:border-[var(--accent)]"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTopicReview(rev.id)}
                        title="Remover da fila de revisão"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--bad)]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {allActiveTopicReviews.length > 0 && (
            <div className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
              <Clock3 className="w-3 h-3 shrink-0" />
              <span>
                Total monitorado no ciclo espaçado:{' '}
                <strong className="font-mono-num tabular-nums text-[var(--text)]">
                  {allActiveTopicReviews.length}
                </strong>{' '}
                tópico(s)
              </span>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};
