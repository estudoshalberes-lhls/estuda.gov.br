import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps, useDynamicRowHeight } from 'react-window';
import {
  CalendarPlus,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileDown,
  Layers,
  ListFilter,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  WEEKDAYS,
  buildScheduleWeekMetadata,
  dateInputToBrazilian,
  formatScheduleDuration,
  getCurrentWeekDates,
  goalDateIso,
  isoWeekInputValue,
  isoWeekStartDate,
  localDateIso,
  scheduleDurationSeconds,
  visibleName,
} from '../lib/parsers';
import { exportWeeklyCompletedReportPdf } from '../lib/pdfExport';
import { clearFieldDraft, readFieldDraft, writeFieldDraft } from '../lib/draftStorage';
import { CompletedGoal, IncompleteGoal, WeekdayName } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateIso(d);
}

export const CompletedGoalsPage: React.FC = () => {
  const {
    db,
    googleUser,
    setActivePage,
    deleteCompletedGoal,
    updateCompletedGoal,
    reopenCompletedGoal,
    restoreIncompleteGoalToSchedule,
    syncUncountedCompletedGoals,
    saveWeeklyGoalNote,
    toast,
  } = useStudy();

  const uncountedSummary = useMemo(() => {
    const existingRecordIds = new Set(db.studyTimeRecords.map((r) => r.quizId));
    const existingTopicIds = new Set<string>();
    db.studyTimeRecords.forEach((rec) => {
      rec.allocations.forEach((a) => {
        if (a.topicId) existingTopicIds.add(a.topicId);
      });
    });
    let count = 0;
    let totalSeconds = 0;
    db.completedGoals.forEach((g) => {
      const sec = scheduleDurationSeconds(g.tempo || '');
      if (sec <= 0) return;
      if (g.studyRecordId && existingRecordIds.has(g.studyRecordId)) return;
      if (g.topicId && existingTopicIds.has(g.topicId)) return;
      count += 1;
      totalSeconds += sec;
    });
    return { count, totalSeconds };
  }, [db.completedGoals, db.studyTimeRecords]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [weekValue, setWeekValue] = useState(() => isoWeekInputValue(localDateIso()));
  const [pendingTargetDays, setPendingTargetDays] = useState<Record<string, WeekdayName>>({});
  const [pendingSearch, setPendingSearch] = useState('');
  const [historyViewMode, setHistoryViewMode] = useState<'grouped' | 'virtual'>(() =>
    db.completedGoals.length > 40 ? 'virtual' : 'grouped',
  );
  const virtualRowHeight = useDynamicRowHeight({
    defaultRowHeight: 92,
    key: `completed-goals-${db.completedGoals.length}-${dateFrom}-${dateTo}`,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMateria, setEditMateria] = useState('');
  const [editDateIso, setEditDateIso] = useState('');
  const [editWeekday, setEditWeekday] = useState('');
  const [editTempo, setEditTempo] = useState('');
  const [editObservacoes, setEditObservacoes] = useState('');

  const effectiveWeekValue = weekValue || isoWeekInputValue(localDateIso());
  const weekMondayIso = useMemo(
    () => isoWeekStartDate(effectiveWeekValue) || isoWeekStartDate(isoWeekInputValue(localDateIso())),
    [effectiveWeekValue],
  );
  const weekSundayIso = useMemo(() => addDaysIso(weekMondayIso, 6), [weekMondayIso]);
  const selectedWeekMeta = useMemo(
    () => buildScheduleWeekMetadata(effectiveWeekValue),
    [effectiveWeekValue],
  );

  const currentWeekDates = useMemo(
    () => ({ ...getCurrentWeekDates(), ...(db.scheduleDayDates || {}) }),
    [db.scheduleDayDates],
  );
  const todayWeekday = useMemo<WeekdayName>(
    () => WEEKDAYS[(new Date().getDay() + 6) % 7] || 'Segunda-feira',
    [],
  );

  const [weeklyNoteDraft, setWeeklyNoteDraft] = useState(
    () =>
      readFieldDraft<string>(`weekly_note_${weekMondayIso}`) ??
      db.weeklyGoalNotes[weekMondayIso] ??
      '',
  );
  const draftStateRef = useRef({
    weekMondayIso,
    draft: weeklyNoteDraft,
    saved: db.weeklyGoalNotes[weekMondayIso] || '',
  });
  draftStateRef.current = {
    weekMondayIso,
    draft: weeklyNoteDraft,
    saved: db.weeklyGoalNotes[weekMondayIso] || '',
  };

  useEffect(() => {
    const savedDraft = readFieldDraft<string>(`weekly_note_${weekMondayIso}`);
    setWeeklyNoteDraft(savedDraft ?? db.weeklyGoalNotes[weekMondayIso] ?? '');
  }, [db.weeklyGoalNotes, weekMondayIso]);

  const flushWeeklyDraft = useCallback(() => {
    const { weekMondayIso: wIso, draft, saved } = draftStateRef.current;
    if (draft.trim() !== saved.trim()) {
      saveWeeklyGoalNote(wIso, draft, true);
    }
    clearFieldDraft(`weekly_note_${wIso}`);
  }, [saveWeeklyGoalNote]);

  useEffect(() => {
    const saved = db.weeklyGoalNotes[weekMondayIso] || '';
    if (weeklyNoteDraft.trim() === saved.trim()) {
      clearFieldDraft(`weekly_note_${weekMondayIso}`);
      return;
    }
    writeFieldDraft(`weekly_note_${weekMondayIso}`, weeklyNoteDraft);
    const timer = window.setTimeout(() => {
      saveWeeklyGoalNote(weekMondayIso, weeklyNoteDraft, true);
      clearFieldDraft(`weekly_note_${weekMondayIso}`);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [db.weeklyGoalNotes, saveWeeklyGoalNote, weekMondayIso, weeklyNoteDraft]);

  useEffect(() => {
    const handleFlush = () => flushWeeklyDraft();
    window.addEventListener('central-estudos:flush-drafts', handleFlush);
    window.addEventListener('beforeunload', handleFlush);
    window.addEventListener('pagehide', handleFlush);
    return () => {
      window.removeEventListener('central-estudos:flush-drafts', handleFlush);
      window.removeEventListener('beforeunload', handleFlush);
      window.removeEventListener('pagehide', handleFlush);
      handleFlush();
    };
  }, [flushWeeklyDraft]);

  const weekCompletedItems = useMemo(() => {
    return db.completedGoals.filter((g) => {
      const iso = goalDateIso(g.data);
      return Boolean(iso && iso >= weekMondayIso && iso <= weekSundayIso);
    });
  }, [db.completedGoals, weekMondayIso, weekSundayIso]);

  const weekCompletedSeconds = useMemo(
    () =>
      weekCompletedItems.reduce(
        (sum, g) => sum + Math.max(scheduleDurationSeconds(g.tempo || ''), g.estudado_segundos || 0),
        0,
      ),
    [weekCompletedItems],
  );

  const filteredIncompleteGoals = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase();
    if (!q) return db.incompleteGoals;
    return db.incompleteGoals.filter((g) =>
      [g.materia, g.disciplina_fixa || '', g.dia_semana || '', g.data || '', g.observacoes || '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [db.incompleteGoals, pendingSearch]);

  const resolvePendingTargetDay = useCallback(
    (goal: IncompleteGoal): WeekdayName => {
      if (pendingTargetDays[goal.id]) return pendingTargetDays[goal.id];
      const original = goal.dia_semana?.trim() as WeekdayName;
      if (WEEKDAYS.includes(original)) return original;
      return todayWeekday;
    },
    [pendingTargetDays, todayWeekday],
  );

  const handleRestoreIncomplete = (goal: IncompleteGoal) => {
    const targetDay = resolvePendingTargetDay(goal);
    restoreIncompleteGoalToSchedule(goal.id, targetDay);
    setPendingTargetDays((prev) => {
      if (!(goal.id in prev)) return prev;
      const next = { ...prev };
      delete next[goal.id];
      return next;
    });
  };

  const handleDownloadWeeklyPdf = () => {
    flushWeeklyDraft();
    const periodLabel = `${dateInputToBrazilian(weekMondayIso)} a ${dateInputToBrazilian(weekSundayIso)}`;
    exportWeeklyCompletedReportPdf({
      weekKey: selectedWeekMeta.weekKey,
      weekLabel: selectedWeekMeta.label,
      periodLabel,
      weeklyNote: weeklyNoteDraft,
      completedItems: weekCompletedItems,
      studentName: googleUser?.displayName || googleUser?.email || 'Estudante',
    });
    toast(`PDF semanal baixado (${selectedWeekMeta.label}).`);
  };

  const filtered = useMemo(() => {
    return db.completedGoals.filter((g) => {
      const iso = goalDateIso(g.data);
      if (dateFrom && (!iso || iso < dateFrom)) return false;
      if (dateTo && (!iso || iso > dateTo)) return false;
      return true;
    });
  }, [dateFrom, dateTo, db.completedGoals]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, { label: string; sortKey: string; items: CompletedGoal[] }>();
    filtered.forEach((g) => {
      const label = g.data || 'Sem data';
      const sortKey = goalDateIso(g.data) || '0000-00-00';
      const existing = groups.get(label) || { label, sortKey, items: [] };
      existing.items.push(g);
      groups.set(label, existing);
    });
    return [...groups.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [filtered]);

  const startEditing = (item: CompletedGoal) => {
    setEditingId(item.id);
    setEditMateria(item.materia || '');
    setEditDateIso(goalDateIso(item.data));
    setEditWeekday(item.dia_semana || '');
    setEditTempo(item.tempo || '');
    setEditObservacoes(item.observacoes || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSaveEdit = (e: React.FormEvent, item: CompletedGoal) => {
    e.preventDefault();
    if (!editMateria.trim()) {
      toast('Informe o nome ou matéria da meta.', true);
      return;
    }
    const nextDateBr = editDateIso ? dateInputToBrazilian(editDateIso) : item.data;
    updateCompletedGoal(item.id, {
      materia: editMateria.trim(),
      data: nextDateBr,
      dia_semana: editWeekday.trim(),
      tempo: editTempo.trim(),
      observacoes: editObservacoes.trim(),
    });
    setEditingId(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="ATESTADO DE CUMPRIMENTO · METAS"
        title="Histórico de metas concluídas e notas semanais"
        description="Filtre por período, revise metas concluídas, devolva metas não concluídas ao Expediente vigente e baixe o relatório semanal em PDF."
        actions={
          <button
            type="button"
            onClick={handleDownloadWeeklyPdf}
            className="inline-flex items-center gap-1.5 h-[36px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            Baixar PDF da semana
          </button>
        }
      />

      {uncountedSummary.count > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-extrabold text-[var(--text)]">
              {uncountedSummary.count} meta(s) concluída(s) com tempo manual (+
              {formatScheduleDuration(uncountedSummary.totalSeconds)}) ainda não lançadas no Portal da Transparência
            </div>
            <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
              Clique ao lado para somar essas horas nas respectivas matérias sem duplicidade.
            </p>
          </div>
          <button
            type="button"
            onClick={() => syncUncountedCompletedGoals()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
          >
            <Clock3 className="w-3.5 h-3.5" />
            Contabilizar no Desempenho (+{formatScheduleDuration(uncountedSummary.totalSeconds)})
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-4 items-start">
        <Panel title="Filtrar por período">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5 items-end">
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">De</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="ce-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">Até</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="ce-input font-mono-num"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              Limpar filtro
            </button>
          </div>
        </Panel>

        <Panel
          title="Notas e observações semanais"
          subtitle={`${dateInputToBrazilian(weekMondayIso)} a ${dateInputToBrazilian(weekSundayIso)}`}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="week"
                aria-label="Selecionar semana ISO"
                value={weekValue}
                onChange={(e) => {
                  flushWeeklyDraft();
                  setWeekValue(e.target.value);
                }}
                className="ce-input font-mono-num flex-1 min-w-[170px]"
              />
              <span className="text-[11.5px] text-[var(--muted)] font-mono-num tabular-nums whitespace-nowrap">
                <strong className="text-[var(--text)]">{weekCompletedItems.length}</strong>{' '}
                {weekCompletedItems.length === 1 ? 'meta' : 'metas'}
                {weekCompletedSeconds > 0
                  ? ` · ${formatScheduleDuration(weekCompletedSeconds)}`
                  : ''}
              </span>
            </div>
            <textarea
              value={weeklyNoteDraft}
              onChange={(e) => setWeeklyNoteDraft(e.target.value)}
              onBlur={() => flushWeeklyDraft()}
              rows={2}
              placeholder="Balanço semanal, pontos fortes e ajustes para a semana seguinte..."
              className="ce-textarea min-h-[68px]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--muted)]">
                {weeklyNoteDraft.trim() !== (db.weeklyGoalNotes[weekMondayIso] || '').trim()
                  ? 'Salvando automaticamente…'
                  : 'Nota semanal sincronizada'}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadWeeklyPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)]/55 bg-[var(--accent-soft)] text-[var(--accent)] text-[12px] font-bold hover:bg-[var(--accent)] hover:text-white whitespace-nowrap cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Baixar PDF da semana
                </button>
                <button
                  type="button"
                  onClick={() => saveWeeklyGoalNote(weekMondayIso, weeklyNoteDraft)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar nota semanal
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Return Incomplete Goals to Current Week's Expediente */}
      <details
        open={db.incompleteGoals.length > 0 && db.incompleteGoals.length <= 6}
        className="ce-panel overflow-hidden group mb-4"
      >
        <summary className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-[var(--panel-soft)] transition-colors">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <CalendarPlus className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <strong className="text-[13.5px] font-extrabold text-[var(--text)]">
              Metas não concluídas — retornar ao Expediente (Semana vigente)
            </strong>
            <span className="text-[12px] text-[var(--muted)] font-mono-num tabular-nums">
              · {db.incompleteGoals.length}{' '}
              {db.incompleteGoals.length === 1 ? 'pendência' : 'pendências'}
              {currentWeekDates['Segunda-feira'] && currentWeekDates['Domingo']
                ? ` · Vigente: ${currentWeekDates['Segunda-feira']} a ${currentWeekDates['Domingo']}`
                : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActivePage('Cronograma');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              <ExternalLink className="w-3 h-3 text-[var(--accent)]" />
              Abrir Expediente
            </button>
            <ChevronDown className="w-4 h-4 text-[var(--muted)] group-open:rotate-180 transition-transform" />
          </div>
        </summary>

        <div className="px-4 pb-4 pt-3 border-t border-[var(--line)] flex flex-col gap-2.5">
          {db.incompleteGoals.length === 0 ? (
            <p className="m-0 text-[12.5px] text-[var(--muted)]">
              Nenhuma meta não concluída arquivada no momento. Quando houver metas pendentes, você
              poderá escolher o dia da semana vigente e adicioná-las de volta ao Expediente por aqui.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-[12px] text-[var(--muted)]">
                  Selecione o dia desejado da semana vigente para recolocar a meta no Expediente
                  (Cronograma).
                </p>
                {db.incompleteGoals.length > 4 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={pendingSearch}
                      onChange={(e) => setPendingSearch(e.target.value)}
                      placeholder="Filtrar pendência..."
                      className="ce-input pl-8 h-[32px] w-[200px] text-[12px]"
                    />
                  </div>
                )}
              </div>

              {filteredIncompleteGoals.length === 0 ? (
                <p className="m-0 text-[12.5px] text-[var(--muted)]">
                  Nenhuma pendência encontrada para o filtro informado.
                </p>
              ) : (
                filteredIncompleteGoals.map((goal) => {
                  const chosenDay = resolvePendingTargetDay(goal);
                  return (
                    <div
                      key={goal.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <strong className="text-[13.5px] font-bold text-[var(--text)]">
                            {visibleName(goal.materia)}
                          </strong>
                          {(goal.dia_semana || goal.data) && (
                            <span className="text-[11.5px] text-[var(--muted)] font-mono-num">
                              · {[goal.dia_semana, goal.data].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          {goal.tempo && (
                            <span className="font-mono-num text-[11.5px] font-semibold text-[var(--warning)]">
                              · {goal.tempo}
                            </span>
                          )}
                        </div>
                        {goal.observacoes && (
                          <p className="mt-1 mb-0 text-[12px] text-[var(--muted)] leading-relaxed">
                            {goal.observacoes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          aria-label={`Dia da semana vigente para ${goal.materia}`}
                          value={chosenDay}
                          onChange={(e) =>
                            setPendingTargetDays((prev) => ({
                              ...prev,
                              [goal.id]: e.target.value as WeekdayName,
                            }))
                          }
                          className="ce-input h-[34px] py-0 text-[12px] font-mono-num w-auto min-w-[195px]"
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
                          onClick={() => handleRestoreIncomplete(goal)}
                          className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          Adicionar ao Expediente
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </details>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="text-[12px] text-[var(--muted)] tabular-nums">
            Exibindo <strong className="text-[var(--text)]">{filtered.length}</strong>{' '}
            {filtered.length === 1 ? 'meta concluída' : 'metas concluídas'}
          </span>
          <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]">
            <button
              type="button"
              onClick={() => setHistoryViewMode('grouped')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                historyViewMode === 'grouped'
                  ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Agrupado por data
            </button>
            <button
              type="button"
              onClick={() => setHistoryViewMode('virtual')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                historyViewMode === 'virtual'
                  ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              Lista virtualizada
            </button>
          </div>
        </div>
      )}

      {historyViewMode === 'virtual' && filtered.length > 0 ? (
        <Panel className="p-3 overflow-hidden">
          <List
            rowCount={filtered.length}
            rowHeight={virtualRowHeight}
            overscanCount={6}
            style={{ height: Math.min(640, Math.max(240, filtered.length * 92)) }}
            rowProps={{
              items: filtered,
              onEdit: (item: CompletedGoal) => {
                setHistoryViewMode('grouped');
                startEditing(item);
              },
              onReopen: reopenCompletedGoal,
              onDelete: deleteCompletedGoal,
            }}
            rowComponent={({
              index,
              style,
              items,
              onEdit,
              onReopen,
              onDelete,
            }: RowComponentProps<{
              items: CompletedGoal[];
              onEdit: (item: CompletedGoal) => void;
              onReopen: (id: string) => void;
              onDelete: (id: string) => void;
            }>) => {
              const item = items[index];
              if (!item) return null;
              return (
                <div style={style} className="pb-2 pr-1">
                  <div className="flex flex-wrap items-start justify-between gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-[13.5px] font-bold text-[var(--text)]">
                          {item.materia}
                        </strong>
                        {item.data && (
                          <span className="font-mono-num text-[11.5px] text-[var(--muted)]">
                            · {item.data}
                          </span>
                        )}
                        {item.dia_semana && (
                          <span className="text-[11.5px] text-[var(--muted)]">
                            · {item.dia_semana}
                          </span>
                        )}
                        {item.tempo && (
                          <span className="font-mono-num text-[11.5px] font-semibold text-[var(--accent)]">
                            · {item.tempo}
                          </span>
                        )}
                      </div>
                      {item.observacoes && (
                        <p className="mt-1 mb-0 text-[12px] text-[var(--muted)] truncate">
                          {item.observacoes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        aria-label={`Editar ${item.materia}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                      >
                        <Pencil className="w-3 h-3 text-[var(--accent)]" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onReopen(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reabrir
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(item.id)}
                        aria-label={`Excluir ${item.materia}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </Panel>
      ) : (
      <div className="flex flex-col gap-3">
        {groupedByDate.length ? (
          groupedByDate.map((group, idx) => (
            <details key={group.label} open={idx === 0} className="ce-panel overflow-hidden group">
              <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-[var(--panel-soft)] transition-colors">
                <div className="flex items-center gap-2.5">
                  <strong className="font-mono-num text-[14px] font-bold text-[var(--text)]">
                    {group.label}
                  </strong>
                  <span className="text-[12px] text-[var(--muted)] tabular-nums">
                    {group.items.length} {group.items.length === 1 ? 'meta concluída' : 'metas concluídas'}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-[var(--muted)] group-open:rotate-180 transition-transform" />
              </summary>

              <div className="px-4 pb-4 pt-2 border-t border-[var(--line)] flex flex-col gap-2">
                {group.items.map((item) => {
                  const isEditing = editingId === item.id;
                  const weekdayInList = WEEKDAYS.includes(editWeekday as any);

                  if (isEditing) {
                    return (
                      <form
                        key={item.id}
                        onSubmit={(e) => handleSaveEdit(e, item)}
                        className="rounded-xl border border-[var(--accent)]/60 bg-[var(--panel-soft)] p-3.5 flex flex-col gap-3"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          <div className="md:col-span-2 lg:col-span-1">
                            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                              Matéria / Tópico
                            </label>
                            <input
                              type="text"
                              value={editMateria}
                              onChange={(e) => setEditMateria(e.target.value)}
                              placeholder="Ex.: Direito Administrativo"
                              className="ce-input"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                              Data de conclusão
                            </label>
                            <input
                              type="date"
                              value={editDateIso}
                              onChange={(e) => setEditDateIso(e.target.value)}
                              className="ce-input font-mono-num"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                              Dia da semana
                            </label>
                            <select
                              value={editWeekday}
                              onChange={(e) => setEditWeekday(e.target.value)}
                              className="ce-input"
                            >
                              <option value="">Não informado</option>
                              {!weekdayInList && editWeekday && (
                                <option value={editWeekday}>{editWeekday}</option>
                              )}
                              {WEEKDAYS.map((day) => (
                                <option key={day} value={day}>
                                  {day}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                              Tempo / Duração
                            </label>
                            <input
                              type="text"
                              value={editTempo}
                              onChange={(e) => setEditTempo(e.target.value)}
                              placeholder="Ex.: 01:30 ou 45 min"
                              className="ce-input font-mono-num"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                            Observações
                          </label>
                          <textarea
                            value={editObservacoes}
                            onChange={(e) => setEditObservacoes(e.target.value)}
                            rows={2}
                            placeholder="Detalhes ou anotações sobre a conclusão desta meta..."
                            className="ce-textarea min-h-[60px]"
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Salvar alterações
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-start justify-between gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-[13.5px] font-bold text-[var(--text)]">
                            {item.materia}
                          </strong>
                          {item.dia_semana && (
                            <span className="text-[11.5px] text-[var(--muted)]">
                              · {item.dia_semana}
                            </span>
                          )}
                          {item.tempo && (
                            <span className="font-mono-num text-[11.5px] font-semibold text-[var(--accent)]">
                              · {item.tempo}
                            </span>
                          )}
                        </div>
                        {item.observacoes && (
                          <p className="mt-1 mb-0 text-[12.5px] text-[var(--muted)]">
                            {item.observacoes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditing(item)}
                          aria-label={`Editar ${item.materia}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                        >
                          <Pencil className="w-3 h-3 text-[var(--accent)]" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => reopenCompletedGoal(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reabrir meta
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCompletedGoal(item.id)}
                          aria-label={`Excluir ${item.materia}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                        >
                          <Trash2 className="w-3 h-3" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))
        ) : (
          <EmptyState message="Nenhuma meta concluída registrada para este filtro." />
        )}
      </div>
      )}
    </div>
  );
};
