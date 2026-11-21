import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Flame,
  SlidersHorizontal,
  Target,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { formatScheduleDuration } from '../../lib/parsers';
import { computeDailyGoalAndExamPace } from '../../lib/studyTools';

export const DailyGoalPacePanel: React.FC = () => {
  const { db, updatePreferences, toast } = useStudy();
  const [editing, setEditing] = useState(false);

  const summary = useMemo(() => computeDailyGoalAndExamPace(db), [db]);

  const [hoursInput, setHoursInput] = useState<string>(String(summary.dailyHoursGoal));
  const [questionsInput, setQuestionsInput] = useState<string>(String(summary.dailyQuestionsGoal));
  const [marginInput, setMarginInput] = useState<string>(String(summary.marginDays));
  const [contestInput, setContestInput] = useState<string>(
    db.preferences?.target_exam_contest_id || summary.trackedContest?.id || '',
  );

  const openEditor = () => {
    setHoursInput(String(summary.dailyHoursGoal));
    setQuestionsInput(String(summary.dailyQuestionsGoal));
    setMarginInput(String(summary.marginDays));
    setContestInput(db.preferences?.target_exam_contest_id || summary.trackedContest?.id || '');
    setEditing((v) => !v);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const h = Math.max(0.5, Math.min(16, Number(hoursInput.replace(',', '.')) || 3));
    const q = Math.max(5, Math.min(500, Math.round(Number(questionsInput) || 30)));
    const m = Math.max(0, Math.min(45, Math.round(Number(marginInput) || 14)));
    updatePreferences({
      daily_hours_goal: h,
      daily_questions_goal: q,
      final_review_margin_days: m,
      target_exam_contest_id: contestInput || undefined,
    });
    setEditing(false);
    toast('Metas diárias e parâmetros de ritmo até a prova atualizados.');
  };

  const paceStyles =
    summary.paceStatus === 'final-sprint'
      ? 'border-[var(--bad)]/40 bg-[var(--bad)]/8 text-[var(--bad)]'
      : summary.paceStatus === 'attention'
      ? 'border-[var(--warning)]/45 bg-[var(--warning)]/10 text-[var(--warning)]'
      : summary.paceStatus === 'on-track'
      ? 'border-[var(--good)]/40 bg-[var(--good)]/8 text-[var(--good)]'
      : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)]';

  return (
    <section className="ce-panel rounded-xl p-4 sm:p-5 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[var(--line)]">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
            <Target className="w-3.5 h-3.5 shrink-0" />
            <span>Metas Diárias &amp; Alerta de Ritmo até a Prova</span>
          </div>
          <h3 className="m-0 mt-0.5 font-display text-[16.5px] font-extrabold text-[var(--text)]">
            Controle Diário de Execução e Projeção do Edital
          </h3>
        </div>

        <button
          type="button"
          onClick={openEditor}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" />
          {editing ? 'Fechar ajustes' : 'Ajustar metas'}
        </button>
      </div>

      {editing && (
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-[var(--accent)]/35 bg-[var(--panel-soft)] p-3.5 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[0.8fr_0.8fr_0.8fr_1.4fr_auto] gap-2.5 items-end"
        >
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
              Meta Horas/Dia
            </label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="16"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              className="ce-input w-full h-9 rounded-lg px-2.5 text-[12.5px] font-mono-num"
            />
          </div>
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
              Meta Questões/Dia
            </label>
            <input
              type="number"
              step="5"
              min="5"
              max="500"
              value={questionsInput}
              onChange={(e) => setQuestionsInput(e.target.value)}
              className="ce-input w-full h-9 rounded-lg px-2.5 text-[12.5px] font-mono-num"
            />
          </div>
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
              Margem Revisão (d)
            </label>
            <input
              type="number"
              min="0"
              max="45"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              className="ce-input w-full h-9 rounded-lg px-2.5 text-[12.5px] font-mono-num"
            />
          </div>
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
              Prova Alvo (Datas &amp; Locais)
            </label>
            <select
              value={contestInput}
              onChange={(e) => setContestInput(e.target.value)}
              className="ce-input w-full h-9 rounded-lg px-2.5 text-[12.5px]"
            >
              <option value="">Próxima prova automática</option>
              {summary.upcomingContests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.examDateBr} · {c.daysLeft}d)
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-9 px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:opacity-95 cursor-pointer"
          >
            Salvar
          </button>
        </form>
      )}

      {/* Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[12px] font-bold text-[var(--text)]">
              Horas Estudadas Hoje
            </span>
            <span className="font-mono-num text-[12.5px] font-extrabold text-[var(--accent)]">
              {formatScheduleDuration(summary.todaySeconds)} / {summary.dailyHoursGoal}h ({summary.hoursPct}%)
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--panel)] border border-[var(--line)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                summary.hoursPct >= 100 ? 'bg-[var(--good)]' : 'bg-[var(--accent)]'
              }`}
              style={{ width: `${summary.hoursPct}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] text-[var(--muted)] font-mono-num">
            Média últimos 7 dias: <strong className="text-[var(--text)]">{summary.avg7dHours}h/dia</strong>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[12px] font-bold text-[var(--text)]">
              Questões Resolvidas Hoje
            </span>
            <span className="font-mono-num text-[12.5px] font-extrabold text-[var(--accent)]">
              {summary.todayQuestions} / {summary.dailyQuestionsGoal} ({summary.questionsPct}%)
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--panel)] border border-[var(--line)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                summary.questionsPct >= 100 ? 'bg-[var(--good)]' : 'bg-[var(--accent)]'
              }`}
              style={{ width: `${summary.questionsPct}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] text-[var(--muted)] font-mono-num">
            Média últimos 7 dias:{' '}
            <strong className="text-[var(--text)]">{summary.avg7dQuestions} questões/dia</strong>
          </div>
        </div>
      </div>

      {/* Exam Countdown & Pace Alert */}
      <div className={`rounded-xl border p-3.5 flex flex-wrap items-start justify-between gap-3 ${paceStyles}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-extrabold">
            {summary.paceStatus === 'final-sprint' ? (
              <Flame className="w-4 h-4 shrink-0" />
            ) : summary.paceStatus === 'attention' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : summary.paceStatus === 'on-track' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <CalendarClock className="w-4 h-4 shrink-0" />
            )}
            <span>{summary.paceHeadline}</span>
          </div>
          <p className="m-0 mt-1 text-[12px] text-[var(--text)] leading-relaxed">
            {summary.paceDetail}
          </p>
        </div>

        {summary.trackedContest && summary.daysUntilExam !== null && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="rounded-lg border border-current/25 bg-[var(--panel)] px-3 py-1.5 text-center">
              <span className="block text-[9.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                {summary.trackedContest.concurso.slice(0, 22)}
              </span>
              <strong className="font-mono-num text-[15px] font-extrabold text-[var(--text)]">
                D-{summary.daysUntilExam}
              </strong>
            </div>
            {summary.totalEditalTopics > 0 && (
              <div className="rounded-lg border border-current/25 bg-[var(--panel)] px-3 py-1.5 text-center">
                <span className="block text-[9.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  Edital Restante
                </span>
                <strong className="font-mono-num text-[15px] font-extrabold text-[var(--text)]">
                  {summary.remainingEditalTopics}/{summary.totalEditalTopics}
                </strong>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
