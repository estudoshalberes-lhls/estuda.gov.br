import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Pencil, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  WEEKDAYS,
  dateInputToBrazilian,
  goalDateIso,
  isoWeekInputValue,
  isoWeekStartDate,
  localDateIso,
} from '../lib/parsers';
import { CompletedGoal } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateIso(d);
}

export const CompletedGoalsPage: React.FC = () => {
  const {
    db,
    deleteCompletedGoal,
    updateCompletedGoal,
    reopenCompletedGoal,
    saveWeeklyGoalNote,
    toast,
  } = useStudy();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [weekValue, setWeekValue] = useState(() => isoWeekInputValue(localDateIso()));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMateria, setEditMateria] = useState('');
  const [editDateIso, setEditDateIso] = useState('');
  const [editWeekday, setEditWeekday] = useState('');
  const [editTempo, setEditTempo] = useState('');
  const [editObservacoes, setEditObservacoes] = useState('');

  const weekMondayIso = useMemo(
    () => isoWeekStartDate(weekValue) || isoWeekStartDate(isoWeekInputValue(localDateIso())),
    [weekValue],
  );
  const weekSundayIso = useMemo(() => addDaysIso(weekMondayIso, 6), [weekMondayIso]);

  const [weeklyNoteDraft, setWeeklyNoteDraft] = useState(
    () => db.weeklyGoalNotes[weekMondayIso] || '',
  );
  const draftStateRef = useRef({
    weekMondayIso,
    draft: db.weeklyGoalNotes[weekMondayIso] || '',
    saved: db.weeklyGoalNotes[weekMondayIso] || '',
  });
  draftStateRef.current = {
    weekMondayIso,
    draft: weeklyNoteDraft,
    saved: db.weeklyGoalNotes[weekMondayIso] || '',
  };

  useEffect(() => {
    setWeeklyNoteDraft(db.weeklyGoalNotes[weekMondayIso] || '');
  }, [db.weeklyGoalNotes, weekMondayIso]);

  const flushWeeklyDraft = useCallback(() => {
    const { weekMondayIso: wIso, draft, saved } = draftStateRef.current;
    if (draft.trim() !== saved.trim()) {
      saveWeeklyGoalNote(wIso, draft, true);
    }
  }, [saveWeeklyGoalNote]);

  useEffect(() => {
    const saved = db.weeklyGoalNotes[weekMondayIso] || '';
    if (weeklyNoteDraft.trim() === saved.trim()) return;
    const timer = window.setTimeout(() => {
      saveWeeklyGoalNote(weekMondayIso, weeklyNoteDraft, true);
    }, 450);
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
        description="Filtre por período, revise metas arquivadas por data e registre balanços oficiais de rendimento semanal."
      />

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
          title="Observações semanais"
          subtitle={`${dateInputToBrazilian(weekMondayIso)} a ${dateInputToBrazilian(weekSundayIso)}`}
        >
          <div className="flex flex-col gap-2.5">
            <input
              type="week"
              aria-label="Selecionar semana ISO"
              value={weekValue}
              onChange={(e) => {
                flushWeeklyDraft();
                setWeekValue(e.target.value);
              }}
              className="ce-input font-mono-num"
            />
            <textarea
              value={weeklyNoteDraft}
              onChange={(e) => setWeeklyNoteDraft(e.target.value)}
              onBlur={() => flushWeeklyDraft()}
              rows={2}
              placeholder="Balanço semanal, pontos fortes e ajustes para a semana seguinte..."
              className="ce-textarea min-h-[68px]"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--muted)]">
                {weeklyNoteDraft.trim() !== (db.weeklyGoalNotes[weekMondayIso] || '').trim()
                  ? 'Salvando automaticamente…'
                  : 'Nota semanal sincronizada'}
              </span>
              <button
                type="button"
                onClick={() => saveWeeklyGoalNote(weekMondayIso, weeklyNoteDraft)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar nota semanal
              </button>
            </div>
          </div>
        </Panel>
      </div>

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
    </div>
  );
};
