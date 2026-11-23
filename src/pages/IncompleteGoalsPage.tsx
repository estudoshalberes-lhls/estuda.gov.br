import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock3,
  FileDown,
  Search,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  WEEKDAYS,
  buildScheduleWeekMetadata,
  formatScheduleDuration,
  getCurrentWeekDates,
  goalDateIso,
  isoWeekInputValue,
  scheduleDurationSeconds,
  visibleName,
} from '../lib/parsers';
import { exportIncompleteGoalsWeekPdf } from '../lib/pdfExport';
import { IncompleteGoal, WeekdayName } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

interface WeekPendingGroup {
  weekKey: string;
  label: string;
  shortLabel: string;
  dayDates: Partial<Record<WeekdayName, string>>;
  items: IncompleteGoal[];
  totalSeconds: number;
}

function resolveGoalDateIso(goal: IncompleteGoal): string {
  const fromGoalDate = goalDateIso(goal.data || '');
  if (fromGoalDate) return fromGoalDate;

  // Fallback to archived date portion (e.g. "21/11/2026 14:30" or "21/11/2026")
  const archivedDatePart = String(goal.arquivado_em || '')
    .trim()
    .split(/\s+/)[0];
  return goalDateIso(archivedDatePart);
}

export const IncompleteGoalsPage: React.FC = () => {
  const {
    db,
    googleUser,
    requestConfirm,
    completeIncompleteGoal,
    restoreIncompleteGoalToSchedule,
    deleteIncompleteGoal,
    toast,
  } = useStudy();

  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('__ALL__');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetDays, setTargetDays] = useState<Record<string, WeekdayName>>({});

  const currentWeekDates = useMemo(
    () => ({ ...getCurrentWeekDates(), ...(db.scheduleDayDates || {}) }),
    [db.scheduleDayDates],
  );
  const todayWeekday = useMemo<WeekdayName>(
    () => WEEKDAYS[(new Date().getDay() + 6) % 7] || 'Segunda-feira',
    [],
  );

  const resolveTargetDay = (goal: IncompleteGoal): WeekdayName => {
    if (targetDays[goal.id]) return targetDays[goal.id];
    const orig = goal.dia_semana?.trim() as WeekdayName;
    if (WEEKDAYS.includes(orig)) return orig;
    return todayWeekday;
  };

  const handleRestoreToExpediente = (goal: IncompleteGoal) => {
    const chosenDay = resolveTargetDay(goal);
    restoreIncompleteGoalToSchedule(goal.id, chosenDay);
    setTargetDays((prev) => {
      if (!(goal.id in prev)) return prev;
      const next = { ...prev };
      delete next[goal.id];
      return next;
    });
  };

  const weekGroups = useMemo<WeekPendingGroup[]>(() => {
    const map = new Map<string, WeekPendingGroup>();

    db.incompleteGoals.forEach((goal) => {
      const iso = resolveGoalDateIso(goal);
      let weekKey = '0000-W00';
      let label = 'Sem semana definida';
      let shortLabel = 'Sem semana';
      let dayDates: Partial<Record<WeekdayName, string>> = {};

      if (iso) {
        weekKey = isoWeekInputValue(iso);
        const meta = buildScheduleWeekMetadata(weekKey);
        label = meta.label;
        const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
        shortLabel = m ? `Semana ${m[2]}/${m[1]}` : meta.label;
        dayDates = meta.dayDates;
      }

      const existing = map.get(weekKey) || {
        weekKey,
        label,
        shortLabel,
        dayDates,
        items: [],
        totalSeconds: 0,
      };
      existing.items.push(goal);
      existing.totalSeconds += scheduleDurationSeconds(goal.tempo || '');
      map.set(weekKey, existing);
    });

    return [...map.values()].sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  }, [db.incompleteGoals]);

  const activeWeekKey =
    selectedWeekKey === '__ALL__' || weekGroups.some((g) => g.weekKey === selectedWeekKey)
      ? selectedWeekKey
      : '__ALL__';

  const visibleGroups = useMemo<WeekPendingGroup[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    return weekGroups
      .filter((g) => activeWeekKey === '__ALL__' || g.weekKey === activeWeekKey)
      .map((g) => {
        if (!q) return g;
        const matched = g.items.filter((goal) =>
          [
            goal.materia,
            goal.disciplina_fixa || '',
            goal.concurso_alvo || '',
            goal.dia_semana || '',
            goal.data || '',
            goal.observacoes || '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(q),
        );
        return {
          ...g,
          items: matched,
          totalSeconds: matched.reduce((s, item) => s + scheduleDurationSeconds(item.tempo || ''), 0),
        };
      })
      .filter((g) => g.items.length > 0);
  }, [weekGroups, activeWeekKey, searchQuery]);

  const totalPendingSeconds = useMemo(
    () => visibleGroups.reduce((s, g) => s + g.totalSeconds, 0),
    [visibleGroups],
  );
  const totalPendingCount = useMemo(
    () => visibleGroups.reduce((s, g) => s + g.items.length, 0),
    [visibleGroups],
  );

  const studentName = googleUser?.displayName || googleUser?.email || 'Estudante';

  const handleEmitWeekPdf = (group: WeekPendingGroup) => {
    exportIncompleteGoalsWeekPdf({
      groups: [{ weekKey: group.weekKey, label: group.label, items: group.items }],
      studentName,
    });
    toast(`PDF emitido para ${group.label}.`);
  };

  const handleEmitVisiblePdf = () => {
    if (visibleGroups.length === 0) {
      toast('Não há pendências visíveis para emitir em PDF.', true);
      return;
    }
    exportIncompleteGoalsWeekPdf({
      groups: visibleGroups.map((g) => ({
        weekKey: g.weekKey,
        label: g.label,
        items: g.items,
      })),
      studentName,
    });
    toast(
      visibleGroups.length === 1
        ? `PDF emitido para ${visibleGroups[0].label}.`
        : `PDF consolidado emitido (${visibleGroups.length} semanas, ${totalPendingCount} pendências).`,
    );
  };

  const handleComplete = async (goal: IncompleteGoal) => {
    const ok = await requestConfirm({
      title: 'Concluir meta pendente',
      description: `Mover "${goal.materia}" (${goal.tempo || 'tempo não informado'}) para Metas Concluídas?`,
      confirmLabel: 'Concluir meta',
    });
    if (!ok) return;
    completeIncompleteGoal(goal.id);
  };

  const handleDelete = async (goal: IncompleteGoal) => {
    const ok = await requestConfirm({
      title: 'Excluir pendência arquivada?',
      description: `Remover "${goal.materia}" permanentemente da lista de pendências?`,
      confirmLabel: 'Excluir pendência',
      danger: true,
    });
    if (!ok) return;
    deleteIncompleteGoal(goal.id);
  };

  const selectedGroupObj =
    activeWeekKey !== '__ALL__'
      ? weekGroups.find((g) => g.weekKey === activeWeekKey) || null
      : null;

  return (
    <div>
      <PageHeader
        eyebrow="DÍVIDA ATIVA DE ESTUDOS · PENDENTES POR SEMANA"
        title="Pendências arquivadas do cronograma"
        description="Metas não concluídas organizadas pelas mesmas semanas do cronograma. Regularize suas pendências ou emita o PDF da semana."
        actions={
          db.incompleteGoals.length > 0 ? (
            <button
              type="button"
              disabled={visibleGroups.length === 0}
              onClick={handleEmitVisiblePdf}
              className="inline-flex items-center gap-1.5 h-[36px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-55 whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              {selectedGroupObj
                ? `Emitir PDF · ${selectedGroupObj.shortLabel}`
                : 'Emitir PDF de Todas as Semanas'}
            </button>
          ) : undefined
        }
      />

      {/* Week Selector & Filter Toolbar */}
      {weekGroups.length > 0 && (
        <Panel className="mb-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedWeekKey('__ALL__')}
                  className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors ${
                    activeWeekKey === '__ALL__'
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                  }`}
                >
                  Todas as semanas ({db.incompleteGoals.length})
                </button>

                {weekGroups.map((group) => {
                  const active = activeWeekKey === group.weekKey;
                  return (
                    <button
                      key={group.weekKey}
                      type="button"
                      onClick={() => setSelectedWeekKey(group.weekKey)}
                      className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--line-strong)]'
                      }`}
                    >
                      {group.shortLabel}{' '}
                      <span className="font-mono-num tabular-nums opacity-75">
                        ({group.items.length})
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar matéria ou obs..."
                  className="ce-input pl-8 h-[34px] w-[210px] text-[12px]"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--muted)] font-mono-num tabular-nums">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  <strong className="text-[var(--text)]">{visibleGroups.length}</strong>{' '}
                  {visibleGroups.length === 1 ? 'semana exibida' : 'semanas exibidas'}
                </span>
                <span>·</span>
                <span>
                  <strong className="text-[var(--warning)]">{totalPendingCount}</strong>{' '}
                  {totalPendingCount === 1 ? 'pendência' : 'pendências'}
                </span>
                {totalPendingSeconds > 0 && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Carga pendente:{' '}
                      <strong className="text-[var(--text)]">
                        {formatScheduleDuration(totalPendingSeconds)}
                      </strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Weekly Grouped Pending List */}
      <div className="flex flex-col gap-3">
        {visibleGroups.length > 0 ? (
          visibleGroups.map((group, idx) => {
            // Organize items inside the week by weekday order (matching Cronograma)
            const dayBuckets = new Map<string, IncompleteGoal[]>();
            WEEKDAYS.forEach((d) => dayBuckets.set(d, []));
            const otherItems: IncompleteGoal[] = [];

            group.items.forEach((goal) => {
              const dayKey = goal.dia_semana?.trim();
              if (dayKey && dayBuckets.has(dayKey)) {
                dayBuckets.get(dayKey)!.push(goal);
              } else {
                otherItems.push(goal);
              }
            });

            const orderedDays: Array<[string, IncompleteGoal[]]> = [
              ...WEEKDAYS.map((d) => [d, dayBuckets.get(d) || []] as [string, IncompleteGoal[]]),
              ...(otherItems.length > 0
                ? [['Sem dia definido', otherItems] as [string, IncompleteGoal[]]]
                : []),
            ].filter(([, list]) => list.length > 0);

            return (
              <details
                key={group.weekKey}
                open={idx === 0 || activeWeekKey !== '__ALL__'}
                className="ce-panel overflow-hidden group"
              >
                <summary className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-[var(--panel-soft)] transition-colors">
                  <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                    <Calendar className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <strong className="font-mono-num text-[13.5px] font-bold text-[var(--text)]">
                      {group.label}
                    </strong>
                    <span className="text-[12px] text-[var(--muted)] tabular-nums">
                      · {group.items.length}{' '}
                      {group.items.length === 1 ? 'pendência' : 'pendências'}
                      {group.totalSeconds > 0
                        ? ` · ${formatScheduleDuration(group.totalSeconds)}`
                        : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEmitWeekPdf(group);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Emitir PDF da semana
                    </button>
                    <ChevronDown className="w-4 h-4 text-[var(--muted)] group-open:rotate-180 transition-transform" />
                  </div>
                </summary>

                <div className="px-4 pb-4 pt-3 border-t border-[var(--line)] flex flex-col gap-3.5">
                  {orderedDays.map(([dayName, dayItems]) => {
                    const weekdayDate =
                      dayItems.find((i) => i.data?.trim())?.data?.trim() ||
                      group.dayDates[dayName as WeekdayName] ||
                      '';

                    return (
                      <div key={dayName} className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between gap-2 pb-1 border-b border-[var(--line)]">
                          <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                            {dayName}
                            {weekdayDate ? ` · ${weekdayDate}` : ''}
                          </span>
                          <span className="text-[11px] font-mono-num tabular-nums text-[var(--muted)]">
                            {dayItems.length} {dayItems.length === 1 ? 'item' : 'itens'}
                          </span>
                        </div>

                        {dayItems.map((goal) => (
                          <div
                            key={goal.id}
                            className="flex flex-wrap items-start justify-between gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <strong className="text-[13.5px] font-bold text-[var(--text)]">
                                  {visibleName(goal.materia)}
                                </strong>
                                {goal.disciplina_fixa &&
                                  visibleName(goal.disciplina_fixa) !== visibleName(goal.materia) && (
                                    <span className="text-[11.5px] text-[var(--muted)]">
                                      · {visibleName(goal.disciplina_fixa)}
                                    </span>
                                  )}
                                {goal.concurso_alvo && (
                                  <span className="text-[11.5px] text-[var(--muted)]">
                                    · {visibleName(goal.concurso_alvo)}
                                  </span>
                                )}
                                {goal.tempo && (
                                  <span className="font-mono-num text-[11.5px] font-semibold text-[var(--warning)]">
                                    · {goal.tempo}
                                  </span>
                                )}
                              </div>
                              {goal.observacoes && (
                                <p className="mt-1 mb-0 text-[12.5px] text-[var(--muted)] leading-relaxed">
                                  {goal.observacoes}
                                </p>
                              )}
                              {goal.arquivado_em && (
                                <div className="mt-1 text-[11px] text-[var(--muted)]/80 font-mono-num">
                                  Arquivado em {goal.arquivado_em}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <select
                                aria-label={`Dia da semana vigente para ${goal.materia}`}
                                value={resolveTargetDay(goal)}
                                onChange={(e) =>
                                  setTargetDays((prev) => ({
                                    ...prev,
                                    [goal.id]: e.target.value as WeekdayName,
                                  }))
                                }
                                className="ce-input h-[31px] py-0 text-[11.5px] font-mono-num w-auto min-w-[175px]"
                              >
                                {WEEKDAYS.map((day) => (
                                  <option key={day} value={day}>
                                    {day}
                                    {currentWeekDates[day] ? ` (${currentWeekDates[day]})` : ''}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRestoreToExpediente(goal)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap cursor-pointer"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                Voltar ao Expediente
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleComplete(goal)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/15 text-[11.5px] font-bold text-[var(--good)] hover:bg-[var(--good)] hover:text-white whitespace-nowrap cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Concluir meta
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(goal)}
                                aria-label={`Excluir ${goal.materia}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })
        ) : db.incompleteGoals.length > 0 ? (
          <EmptyState message="Nenhuma pendência encontrada para o filtro informado." />
        ) : (
          <EmptyState message="Nenhuma pendência arquivada no momento." />
        )}
      </div>
    </div>
  );
};
