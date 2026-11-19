import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Play,
  Target,
  X,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import {
  WEEKDAYS,
  formatScheduleDuration,
  getCurrentWeekDates,
  localDateBrazilian,
  visibleName,
} from '../../lib/parsers';
import { WeekdayName } from '../../types/study';

const SHORT_WEEKDAY: Record<WeekdayName, string> = {
  'Segunda-feira': 'Seg',
  'Terça-feira': 'Ter',
  'Quarta-feira': 'Qua',
  'Quinta-feira': 'Qui',
  'Sexta-feira': 'Sex',
  Sábado: 'Sáb',
  Domingo: 'Dom',
};

export const DailyGoalWidget: React.FC = () => {
  const {
    db,
    completeScheduleTopic,
    linkTimerToScheduleTopic,
    activeTimerTopic,
    timerSeconds,
    setActivePage,
  } = useStudy();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const todayWeekday: WeekdayName = WEEKDAYS[(new Date().getDay() + 6) % 7];
  const todayBr = localDateBrazilian();
  const expectedDayDate =
    db.scheduleDayDates?.[todayWeekday] || getCurrentWeekDates()[todayWeekday] || todayBr;

  const pendingToday = db.schedule[todayWeekday] || [];
  const currentGoal = pendingToday[0] || null;
  const upcomingGoals = pendingToday.slice(1);

  const completedTodayCount = useMemo(() => {
    return (db.completedGoals || []).filter((g) => {
      const sameDate = g.data === expectedDayDate || g.data === todayBr;
      if (!sameDate) return false;
      return !g.dia_semana || g.dia_semana === todayWeekday;
    }).length;
  }, [db.completedGoals, expectedDayDate, todayBr, todayWeekday]);

  const totalToday = pendingToday.length + completedTodayCount;
  const currentStep = completedTodayCount + 1;

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const handleCompleteCurrent = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentGoal) return;
    completeScheduleTopic(todayWeekday, 0, pendingToday);
  };

  const currentGoalTitle = currentGoal
    ? visibleName(currentGoal.materia || currentGoal.disciplina_fixa || 'Meta sem título')
    : '';
  const currentGoalSubject = currentGoal?.disciplina_fixa
    ? visibleName(currentGoal.disciplina_fixa)
    : '';
  const isCurrentGoalLinked = Boolean(
    currentGoal && activeTimerTopic?.topicId === currentGoal.id,
  );

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center">
      {currentGoal ? (
        <div className="w-full h-9 sm:h-10 flex items-center gap-1.5 pl-2.5 pr-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] hover:border-[var(--accent)]/70 transition-colors">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={`${currentGoalTitle}${currentGoal.tempo ? ` · ${currentGoal.tempo}` : ''}${currentGoal.observacoes ? `\n${currentGoal.observacoes}` : ''}`}
            aria-expanded={open}
            className="flex-1 min-w-0 h-full flex items-center gap-2 text-left cursor-pointer focus-visible:outline-none"
          >
            <Target className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <div className="min-w-0 flex-1 flex flex-col justify-center leading-none">
              <div className="flex items-center gap-1.5 text-[9px] font-extrabold tracking-[0.06em] uppercase text-[var(--accent)] leading-none mb-1 whitespace-nowrap">
                <span className="tabular-nums">
                  Meta {currentStep}/{totalToday}
                </span>
                <span className="text-[var(--subtle)]" aria-hidden="true">
                  ·
                </span>
                <span className="text-[var(--muted)]">{SHORT_WEEKDAY[todayWeekday]}</span>
                {currentGoal.tempo && (
                  <>
                    <span className="text-[var(--subtle)]" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[var(--muted)] font-mono-num tabular-nums">
                      {currentGoal.tempo}
                    </span>
                  </>
                )}
              </div>
              <span className="text-[12px] font-bold text-[var(--text)] truncate leading-none">
                {currentGoalTitle}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleCompleteCurrent}
            title="Finalizar meta atual e avançar para a próxima"
            aria-label={`Finalizar meta ${currentGoalTitle}`}
            className="grid place-items-center w-7 h-7 rounded-md border border-[var(--good)]/50 bg-[var(--good)]/12 text-[var(--good)] hover:bg-[var(--good)] hover:text-white transition-colors shrink-0 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setActivePage('Cronograma')}
          title={
            completedTodayCount > 0
              ? `Todas as ${completedTodayCount} meta(s) de ${todayWeekday} foram concluídas. Clique para abrir o Cronograma.`
              : `Nenhuma meta planejada para ${todayWeekday}. Clique para adicionar no Cronograma.`
          }
          className="w-full h-9 sm:h-10 flex items-center gap-2 px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] hover:border-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          {completedTodayCount > 0 ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--good)] shrink-0" />
          ) : (
            <Calendar className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
          )}
          <div className="min-w-0 flex-1 flex flex-col justify-center leading-none">
            <span className="text-[9px] font-extrabold tracking-[0.06em] uppercase text-[var(--muted)] leading-none mb-1 whitespace-nowrap">
              Expediente · {SHORT_WEEKDAY[todayWeekday]}
            </span>
            <span className="text-[12px] font-semibold text-[var(--text)] truncate leading-none">
              {completedTodayCount > 0
                ? `Concluído (${completedTodayCount}/${completedTodayCount})`
                : 'Sem metas para hoje'}
            </span>
          </div>
        </button>
      )}

      {open && currentGoal && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[340px] max-w-[92vw] rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] p-3.5 shadow-xl">
          <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--line)]">
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent)] leading-none mb-1 tabular-nums">
                Meta {currentStep} de {totalToday} · {todayWeekday}
              </div>
              <strong className="block text-[13px] font-extrabold text-[var(--text)] leading-snug break-words">
                {currentGoalTitle}
              </strong>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar detalhes da meta"
              className="grid place-items-center w-6 h-6 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--muted)] mb-2.5">
            {currentGoalSubject && (
              <span>
                Matéria: <strong className="text-[var(--text)]">{currentGoalSubject}</strong>
              </span>
            )}
            {currentGoal.tempo && (
              <>
                {currentGoalSubject && <span aria-hidden="true">·</span>}
                <span className="inline-flex items-center gap-1 font-mono-num tabular-nums">
                  <Clock className="w-3 h-3" />
                  {currentGoal.tempo}
                </span>
              </>
            )}
            {currentGoal.estudado_segundos ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num tabular-nums text-[var(--good)] font-semibold">
                  Estudado: {formatScheduleDuration(currentGoal.estudado_segundos)}
                </span>
              </>
            ) : null}
          </div>

          {currentGoal.observacoes?.trim() && (
            <p className="m-0 mb-3 text-[11.5px] leading-relaxed text-[var(--muted)] bg-[var(--panel-soft)] border border-[var(--line)] rounded-lg px-2.5 py-2 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
              {currentGoal.observacoes}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                completeScheduleTopic(todayWeekday, 0, pendingToday);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-95 transition-opacity whitespace-nowrap cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              {upcomingGoals.length > 0 ? 'Concluir e ir p/ próxima' : 'Concluir última meta'}
            </button>

            <button
              type="button"
              onClick={() => {
                linkTimerToScheduleTopic(todayWeekday, currentGoal, timerSeconds === 0);
                setOpen(false);
              }}
              className={`inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                isCurrentGoalLinked
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
              }`}
            >
              <Play className="w-3 h-3 shrink-0" />
              {isCurrentGoalLinked ? 'No timer' : 'Cronometrar'}
            </button>
          </div>

          {upcomingGoals.length > 0 && (
            <div className="pt-2.5 border-t border-[var(--line)]">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--muted)] mb-1.5">
                Na sequência ({upcomingGoals.length})
              </div>
              <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                {upcomingGoals.map((goal, idx) => (
                  <div
                    key={goal.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-[var(--panel-soft)] border border-[var(--line)] text-[11px]"
                  >
                    <span className="min-w-0 truncate text-[var(--text)]">
                      <span className="text-[var(--muted)] font-mono-num tabular-nums mr-1.5">
                        {currentStep + idx + 1}.
                      </span>
                      {visibleName(goal.materia || goal.disciplina_fixa || 'Tópico')}
                    </span>
                    {goal.tempo && (
                      <span className="text-[10px] text-[var(--muted)] font-mono-num tabular-nums shrink-0">
                        {goal.tempo}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2.5 mt-2.5 border-t border-[var(--line)] flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setActivePage('Cronograma');
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
            >
              Abrir Cronograma completo
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
