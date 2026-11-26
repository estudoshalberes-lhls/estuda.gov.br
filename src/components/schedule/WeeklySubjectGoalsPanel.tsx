import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import {
  WEEKDAYS,
  formatScheduleDuration,
  goalDateIso,
  isoWeekStartDate,
  localDateIso,
  normalizeSearch,
  scheduleDurationSeconds,
  visibleName,
} from '../../lib/parsers';
import { WeekdayName } from '../../types/study';
import { Panel } from '../ui/PageHeader';

function addDaysToIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export const WeeklySubjectGoalsPanel: React.FC = () => {
  const {
    db,
    fixedSubjects,
    setWeeklySubjectHourGoal,
    addTopicToDay,
    updateStudyCycle,
    toast,
  } = useStudy();

  const [expanded, setExpanded] = useState(true);
  const [subjectInput, setSubjectInput] = useState(fixedSubjects[0] || '');
  const [hoursInput, setHoursInput] = useState('3');

  const todayIso = localDateIso();
  const todayWeekday = WEEKDAYS[(new Date().getDay() + 6) % 7] as WeekdayName;
  const weekMondayIso = isoWeekStartDate(todayIso);
  const weekSundayIso = addDaysToIso(weekMondayIso, 6);

  const weeklyGoalsMap = db.preferences.weekly_subject_hours || {};

  // Compute realized study seconds in current ISO week per subject (without double counting)
  const realizedBySubject = useMemo(() => {
    const map = new Map<string, number>();
    const countedTopicIds = new Set<string>();
    const countedRecordIds = new Set<string>();

    const addSec = (subj: string, sec: number) => {
      if (!subj || sec <= 0) return;
      const key = normalizeSearch(subj);
      map.set(key, (map.get(key) || 0) + sec);
    };

    (db.studyTimeRecords || []).forEach((rec) => {
      if (!rec.date || rec.date < weekMondayIso || rec.date > weekSundayIso) return;
      if (rec.quizId) countedRecordIds.add(rec.quizId);
      (rec.allocations || []).forEach((alloc) => {
        if (alloc.topicId) countedTopicIds.add(alloc.topicId);
        addSec(alloc.subject, alloc.seconds || 0);
      });
    });

    (db.completedGoals || []).forEach((g) => {
      const gIso = goalDateIso(g.data);
      if (!gIso || gIso < weekMondayIso || gIso > weekSundayIso) return;
      if (g.studyRecordId && countedRecordIds.has(g.studyRecordId)) return;
      if (g.topicId && countedTopicIds.has(g.topicId)) return;
      const sec = Math.max(scheduleDurationSeconds(g.tempo || ''), g.estudado_segundos || 0);
      addSec(g.disciplina_fixa || g.materia, sec);
    });

    return map;
  }, [db.completedGoals, db.studyTimeRecords, weekMondayIso, weekSundayIso]);

  const rows = useMemo(() => {
    return Object.entries(weeklyGoalsMap)
      .filter(([, h]) => Number(h) > 0)
      .map(([subject, targetHours]) => {
        const targetSec = Math.round(targetHours * 3600);
        const actualSec = realizedBySubject.get(normalizeSearch(subject)) || 0;
        const pct = targetSec > 0 ? Math.min(100, Math.round((actualSec / targetSec) * 100)) : 0;
        const remainingSec = Math.max(0, targetSec - actualSec);
        return {
          subject,
          targetHours,
          targetSec,
          actualSec,
          pct,
          remainingSec,
          status:
            pct >= 100 ? ('done' as const) : pct >= 50 ? ('ontrack' as const) : ('behind' as const),
        };
      })
      .sort((a, b) => a.pct - b.pct || b.remainingSec - a.remainingSec);
  }, [realizedBySubject, weeklyGoalsMap]);

  const mostBehind = useMemo(() => rows.find((r) => r.pct < 100) || null, [rows]);

  const totalTargetSec = rows.reduce((s, r) => s + r.targetSec, 0);
  const totalActualSec = rows.reduce((s, r) => s + r.actualSec, 0);
  const totalPct =
    totalTargetSec > 0 ? Math.min(100, Math.round((totalActualSec / totalTargetSec) * 100)) : 0;

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const subj = subjectInput.trim();
    const hrs = Number.parseFloat(hoursInput.replace(',', '.'));
    if (!subj) {
      toast('Selecione ou informe o nome da matéria.', true);
      return;
    }
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 60) {
      toast('Informe uma carga horária semanal válida (ex.: 2.5 ou 4).', true);
      return;
    }
    setWeeklySubjectHourGoal(subj, hrs);
  };

  const handlePrioritizeInCycle = (subject: string) => {
    const cycle = db.studyCycle;
    const normSubj = normalizeSearch(subject);
    if (cycle && cycle.items.length > 0) {
      const idx = cycle.items.findIndex((it) => normalizeSearch(it.subject) === normSubj);
      if (idx >= 0) {
        updateStudyCycle((prev) => ({ ...prev, activeIndex: idx }));
        toast(`"${visibleName(subject)}" ativada como próximo bloco do Ciclo Dinâmico!`);
        return;
      }
      updateStudyCycle((prev) => {
        const nextItems = [
          ...prev.items,
          {
            id: `cyc-${Math.random().toString(36).slice(2, 9)}`,
            subject,
            targetMinutes: 60,
            completedMinutes: 0,
            completions: 0,
          },
        ];
        return { ...prev, items: nextItems, activeIndex: nextItems.length - 1 };
      });
      toast(`"${visibleName(subject)}" adicionada e priorizada no Ciclo Dinâmico!`);
      return;
    }
    updateStudyCycle(() => ({
      activeIndex: 0,
      completedCycles: 0,
      items: [
        {
          id: `cyc-${Math.random().toString(36).slice(2, 9)}`,
          subject,
          targetMinutes: 60,
          completedMinutes: 0,
          completions: 0,
        },
      ],
    }));
    toast(`Ciclo Dinâmico iniciado com "${visibleName(subject)}".`);
  };

  const handleScheduleToday = (subject: string) => {
    addTopicToDay(todayWeekday, {
      disciplina_fixa: subject,
      materia: `Reforço semanal · ${visibleName(subject)}`,
      tempo: '',
      observacoes: 'Priorizado pela meta de carga horária semanal',
    });
    toast(`"${visibleName(subject)}" adicionado ao Expediente de hoje (${todayWeekday}).`);
  };

  return (
    <Panel className="mb-3 p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[var(--panel-soft)] border-b border-[var(--line)]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left min-w-0"
        >
          <BarChart3 className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span className="text-[12.5px] font-extrabold text-[var(--text)]">
            Metas Semanais por Matéria (Planejado × Realizado)
          </span>
          {rows.length > 0 && (
            <span className="text-[11.5px] font-mono-num tabular-nums text-[var(--muted)]">
              · {formatScheduleDuration(totalActualSec)} / {formatScheduleDuration(totalTargetSec)} ({totalPct}%)
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {mostBehind && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-[var(--warning)] font-bold inline-flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Mais atrasada: {visibleName(mostBehind.subject)} ({mostBehind.pct}%)
            </span>
            <button
              type="button"
              onClick={() => handleScheduleToday(mostBehind.subject)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--accent)]/60 bg-[var(--accent-soft)] text-[var(--accent)] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              <CalendarPlus className="w-3 h-3" />
              Agendar hoje
            </button>
            <button
              type="button"
              onClick={() => handlePrioritizeInCycle(mostBehind.subject)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] font-bold hover:border-[var(--accent)] transition-colors"
            >
              <RefreshCw className="w-3 h-3 text-[var(--accent)]" />
              Priorizar no Ciclo
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="p-4 flex flex-col gap-3.5">
          {/* Add / Update Goal Form */}
          <form onSubmit={handleSaveGoal} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Matéria fixa
              </label>
              <select
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                className="ce-select h-[34px] text-[12px]"
              >
                {fixedSubjects.map((s) => (
                  <option key={s} value={s}>
                    {visibleName(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-[130px]">
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Meta (horas/sem)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="60"
                value={hoursInput}
                onChange={(e) => setHoursInput(e.target.value)}
                className="ce-input h-[34px] text-[12px] font-mono-num"
                placeholder="Ex.: 4"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Definir meta
            </button>
          </form>

          {rows.length === 0 ? (
            <p className="text-[12px] text-[var(--muted)]">
              Defina quantas horas por semana deseja estudar em cada disciplina (ex.: Direito Penal: 4h, Português: 3h) para acompanhar o equilíbrio real da sua semana e detectar matérias negligenciadas.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {rows.map((r) => (
                <div
                  key={r.subject}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-[var(--text)] truncate">
                        {visibleName(r.subject)}
                      </div>
                      <div className="text-[11px] font-mono-num tabular-nums text-[var(--muted)] mt-0.5">
                        {formatScheduleDuration(r.actualSec)} / {r.targetHours}h ·{' '}
                        <span
                          className={
                            r.status === 'done'
                              ? 'text-[var(--good)] font-bold'
                              : r.status === 'behind'
                                ? 'text-[var(--warning)] font-bold'
                                : 'text-[var(--accent)] font-bold'
                          }
                        >
                          {r.status === 'done'
                            ? 'Cumprida'
                            : r.status === 'ontrack'
                              ? 'Em dia'
                              : 'Atrasada'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === 'done' ? (
                        <CheckCircle2 className="w-4 h-4 text-[var(--good)]" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleScheduleToday(r.subject)}
                          title={`Agendar 1h de ${visibleName(r.subject)} hoje`}
                          className="p-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--accent)] hover:border-[var(--accent)]"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setWeeklySubjectHourGoal(r.subject, 0)}
                        title="Remover meta semanal"
                        className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--bad)]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Crisp Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-[var(--line)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${r.pct}%`,
                        backgroundColor:
                          r.status === 'done'
                            ? 'var(--good)'
                            : r.status === 'behind'
                              ? 'var(--warning)'
                              : 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};
