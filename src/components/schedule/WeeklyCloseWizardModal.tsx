import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Download,
  FileText,
  X,
} from 'lucide-react';
import {
  WEEKDAYS,
  formatScheduleDuration,
  goalDateIso,
  isoWeekInputValue,
  isoWeekStartDate,
  localDateIso,
  scheduleDurationSeconds,
  visibleName,
} from '../../lib/parsers';
import { exportWeeklyCompletedReportPdf } from '../../lib/pdfExport';
import { CompletedGoal, ScheduleMap, ScheduleTopic, WeekdayName } from '../../types/study';

interface PendingItemEntry {
  key: string;
  day: WeekdayName;
  topic: ScheduleTopic;
}

interface WeeklyCloseWizardModalProps {
  weekKey: string;
  weekLabel: string;
  weekMondayIso: string;
  periodLabel: string;
  currentSchedule: ScheduleMap;
  completedGoals: CompletedGoal[];
  initialWeeklyNote: string;
  studentName?: string;
  onClose: () => void;
  onConfirmClose: (params: {
    weekMondayIso: string;
    weeklyNote: string;
    rolloverItems: Array<{ topic: ScheduleTopic; targetDay: WeekdayName }>;
    archiveItems: Array<{ day: WeekdayName; topic: ScheduleTopic }>;
    nextWeekKey: string;
  }) => void;
}

function addDaysIsoStr(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export const WeeklyCloseWizardModal: React.FC<WeeklyCloseWizardModalProps> = ({
  weekKey,
  weekLabel,
  weekMondayIso,
  periodLabel,
  currentSchedule,
  completedGoals,
  initialWeeklyNote,
  studentName,
  onClose,
  onConfirmClose,
}) => {
  const weekSundayIso = useMemo(() => addDaysIsoStr(weekMondayIso, 6), [weekMondayIso]);
  const nextWeekKey = useMemo(
    () => isoWeekInputValue(addDaysIsoStr(weekMondayIso, 7)),
    [weekMondayIso],
  );

  // Completed goals inside this exact week
  const weekCompleted = useMemo(() => {
    return completedGoals.filter((g) => {
      const gIso = goalDateIso(g.data);
      return Boolean(gIso && gIso >= weekMondayIso && gIso <= weekSundayIso);
    });
  }, [completedGoals, weekMondayIso, weekSundayIso]);

  const totalCompletedSeconds = useMemo(
    () =>
      weekCompleted.reduce(
        (sum, g) => sum + Math.max(scheduleDurationSeconds(g.tempo || ''), g.estudado_segundos || 0),
        0,
      ),
    [weekCompleted],
  );

  // Remaining unfinished topics in current week's draft schedule
  const pendingItems = useMemo<PendingItemEntry[]>(() => {
    const out: PendingItemEntry[] = [];
    WEEKDAYS.forEach((day) => {
      (currentSchedule[day] || []).forEach((topic, idx) => {
        if (topic.materia?.trim() || topic.observacoes?.trim()) {
          out.push({
            key: topic.id || `${day}-${idx}`,
            day,
            topic,
          });
        }
      });
    });
    return out;
  }, [currentSchedule]);

  // Decision per pending item: 'rollover' | 'archive'
  const [decisions, setDecisions] = useState<
    Record<string, { action: 'rollover' | 'archive'; targetDay: WeekdayName }>
  >(() => {
    const init: Record<string, { action: 'rollover' | 'archive'; targetDay: WeekdayName }> = {};
    pendingItems.forEach((p) => {
      init[p.key] = { action: 'rollover', targetDay: p.day };
    });
    return init;
  });

  const [weeklyNote, setWeeklyNote] = useState<string>(initialWeeklyNote);

  const setAllAction = (action: 'rollover' | 'archive') => {
    setDecisions((prev) => {
      const next = { ...prev };
      pendingItems.forEach((p) => {
        next[p.key] = { action, targetDay: prev[p.key]?.targetDay || p.day };
      });
      return next;
    });
  };

  const rolloverCount = pendingItems.filter((p) => decisions[p.key]?.action === 'rollover').length;
  const archiveCount = pendingItems.length - rolloverCount;

  const handleDownloadPdf = () => {
    exportWeeklyCompletedReportPdf({
      weekKey,
      weekLabel,
      periodLabel,
      weeklyNote,
      completedItems: weekCompleted,
      studentName,
    });
  };

  const handleExecuteClose = () => {
    const rolloverItems: Array<{ topic: ScheduleTopic; targetDay: WeekdayName }> = [];
    const archiveItems: Array<{ day: WeekdayName; topic: ScheduleTopic }> = [];

    pendingItems.forEach((p) => {
      const dec = decisions[p.key] || { action: 'archive', targetDay: p.day };
      if (dec.action === 'rollover') {
        rolloverItems.push({ topic: p.topic, targetDay: dec.targetDay });
      } else {
        archiveItems.push({ day: p.day, topic: p.topic });
      }
    });

    onConfirmClose({
      weekMondayIso: weekMondayIso || isoWeekStartDate(localDateIso()),
      weeklyNote,
      rolloverItems,
      archiveItems,
      nextWeekKey,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Assistente de Fechamento Semanal"
    >
      <div className="w-full max-w-[760px] max-h-[90vh] rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--line)] bg-[var(--panel-soft)] flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
              Rotina de Fechamento Semanal · Assistente Guiado
            </div>
            <h2 className="text-[16px] font-extrabold text-[var(--text)] mt-0.5">
              Fechar {weekLabel}
            </h2>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              Revise seu saldo da semana, decida o destino das pendências e abra a próxima semana ({nextWeekKey}) em 1 clique.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar assistente"
            className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-5">
          {/* STEP 1: Weekly Summary */}
          <section>
            <h3 className="text-[12.5px] font-extrabold text-[var(--text)] mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--good)]" />
              1. Resumo da semana ({periodLabel})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                <div className="text-[11px] text-[var(--muted)]">Metas concluídas</div>
                <div className="text-[20px] font-extrabold font-mono-num tabular-nums text-[var(--good)]">
                  {weekCompleted.length}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                <div className="text-[11px] text-[var(--muted)]">Carga horária concluída</div>
                <div className="text-[20px] font-extrabold font-mono-num tabular-nums text-[var(--accent)]">
                  {formatScheduleDuration(totalCompletedSeconds)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                <div className="text-[11px] text-[var(--muted)]">Tópicos ainda em aberto</div>
                <div className="text-[20px] font-extrabold font-mono-num tabular-nums text-[var(--warning)]">
                  {pendingItems.length}
                </div>
              </div>
            </div>
          </section>

          {/* STEP 2: Decide on Unfinished Topics */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-[12.5px] font-extrabold text-[var(--text)] flex items-center gap-1.5">
                <CalendarPlus className="w-4 h-4 text-[var(--accent)]" />
                2. Destino das metas não concluídas ({pendingItems.length})
              </h3>
              {pendingItems.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAllAction('rollover')}
                    className="px-2.5 py-1 rounded-md border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)] font-bold hover:bg-[var(--accent)] hover:text-white"
                  >
                    Reprogramar todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllAction('archive')}
                    className="px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)] font-bold hover:text-[var(--text)]"
                  >
                    Arquivar todas em Pendências
                  </button>
                </div>
              )}
            </div>

            {pendingItems.length === 0 ? (
              <div className="rounded-xl border border-[var(--good)]/40 bg-[var(--good)]/8 p-3 text-[12px] text-[var(--good)] font-semibold">
                Parabéns! Nenhum tópico ficou pendente na grade desta semana.
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] max-h-[240px] overflow-y-auto">
                {pendingItems.map((item) => {
                  const dec = decisions[item.key] || { action: 'rollover', targetDay: item.day };
                  return (
                    <div
                      key={item.key}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-[var(--muted)]">
                          <span className="font-bold text-[var(--text)]">{item.day}</span>
                          {item.topic.disciplina_fixa && (
                            <> · {visibleName(item.topic.disciplina_fixa)}</>
                          )}
                          {item.topic.tempo && <> · {item.topic.tempo}</>}
                        </div>
                        <div className="text-[12.5px] font-bold text-[var(--text)] truncate">
                          {visibleName(item.topic.materia || item.topic.observacoes)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] p-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() =>
                              setDecisions((prev) => ({
                                ...prev,
                                [item.key]: { ...dec, action: 'rollover' },
                              }))
                            }
                            className={`px-2 py-1 rounded-md font-bold transition-colors ${
                              dec.action === 'rollover'
                                ? 'bg-[var(--accent)] text-white'
                                : 'text-[var(--muted)] hover:text-[var(--text)]'
                            }`}
                          >
                            Próx. semana
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDecisions((prev) => ({
                                ...prev,
                                [item.key]: { ...dec, action: 'archive' },
                              }))
                            }
                            className={`px-2 py-1 rounded-md font-bold transition-colors ${
                              dec.action === 'archive'
                                ? 'bg-[var(--warning)] text-white'
                                : 'text-[var(--muted)] hover:text-[var(--text)]'
                            }`}
                          >
                            Arquivar
                          </button>
                        </div>

                        {dec.action === 'rollover' && (
                          <select
                            aria-label={`Dia da próxima semana para ${item.topic.materia}`}
                            value={dec.targetDay}
                            onChange={(e) =>
                              setDecisions((prev) => ({
                                ...prev,
                                [item.key]: {
                                  ...dec,
                                  targetDay: e.target.value as WeekdayName,
                                },
                              }))
                            }
                            className="ce-select h-[30px] w-auto text-[11px] py-0.5"
                          >
                            {WEEKDAYS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* STEP 3: Weekly Note + PDF Export */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="weekly-close-note"
                className="text-[12.5px] font-extrabold text-[var(--text)] flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-[var(--accent)]" />
                3. Observações e balanço da semana (salvo no Atestado de Cumprimento)
              </label>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                Baixar PDF da semana
              </button>
            </div>
            <textarea
              id="weekly-close-note"
              rows={3}
              value={weeklyNote}
              onChange={(e) => setWeeklyNote(e.target.value)}
              placeholder="O que funcionou bem nesta semana? Qual matéria precisa de reforço na próxima?"
              className="ce-input text-[12.5px] py-2"
            />
          </section>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[var(--line)] bg-[var(--panel-soft)] flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11.5px] text-[var(--muted)] font-mono-num tabular-nums">
            <strong className="text-[var(--accent)]">{rolloverCount}</strong> reprogramada(s) ·{' '}
            <strong className="text-[var(--warning)]">{archiveCount}</strong> arquivada(s) em Pendências
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[36px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleExecuteClose}
              className="inline-flex items-center gap-1.5 h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Archive className="w-3.5 h-3.5" />
              Fechar semana e abrir {nextWeekKey}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
