import React, { useMemo } from 'react';
import { Check, ChevronDown, Trash2 } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { IncompleteGoal } from '../types/study';
import { EmptyState, PageHeader } from '../components/ui/PageHeader';

export const IncompleteGoalsPage: React.FC = () => {
  const { db, requestConfirm, completeIncompleteGoal, deleteIncompleteGoal } = useStudy();

  const grouped = useMemo(() => {
    const map = new Map<string, IncompleteGoal[]>();
    db.incompleteGoals.forEach((goal) => {
      const key = goal.arquivado_em || 'Arquivamento anterior';
      const list = map.get(key) || [];
      list.push(goal);
      map.set(key, list);
    });
    return [...map.entries()];
  }, [db.incompleteGoals]);

  const handleComplete = async (goal: IncompleteGoal) => {
    const ok = await requestConfirm({
      title: 'Concluir meta pendente',
      description: `Mover "${goal.materia}" (${goal.tempo || 'tempo não informado'}) para Metas Concluídas?`,
      confirmLabel: 'Concluir meta',
    });
    if (!ok) return;
    completeIncompleteGoal(goal.id);
  };

  return (
    <div>
      <PageHeader
        eyebrow="DÍVIDA ATIVA DE ESTUDOS · PENDENTES"
        title="Pendências arquivadas do cronograma"
        description="Regularize metas que ficaram para depois e dê baixa para Metas Concluídas assim que finalizar."
      />

      <div className="flex flex-col gap-3">
        {grouped.length ? (
          grouped.map(([archivedAt, items], idx) => (
            <details key={archivedAt} open={idx === 0} className="ce-panel overflow-hidden group">
              <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-[var(--panel-soft)] transition-colors">
                <div className="flex flex-wrap items-center gap-2.5">
                  <strong className="font-mono-num text-[13.5px] font-bold text-[var(--text)]">
                    Arquivado em {archivedAt}
                  </strong>
                  <span className="text-[12px] text-[var(--muted)] tabular-nums">
                    {items.length} {items.length === 1 ? 'pendência' : 'pendências'}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-[var(--muted)] group-open:rotate-180 transition-transform" />
              </summary>

              <div className="px-4 pb-4 pt-2 border-t border-[var(--line)] flex flex-col gap-2">
                {items.map((goal) => (
                  <div
                    key={goal.id}
                    className="flex flex-wrap items-start justify-between gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-[13.5px] font-bold text-[var(--text)]">
                          {goal.materia}
                        </strong>
                        {goal.dia_semana && (
                          <span className="text-[11.5px] text-[var(--muted)]">
                            · {goal.dia_semana} ({goal.data})
                          </span>
                        )}
                        {goal.tempo && (
                          <span className="font-mono-num text-[11.5px] font-semibold text-[var(--warning)]">
                            · {goal.tempo}
                          </span>
                        )}
                      </div>
                      {goal.observacoes && (
                        <p className="mt-1 mb-0 text-[12.5px] text-[var(--muted)]">
                          {goal.observacoes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleComplete(goal)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/15 text-[11.5px] font-bold text-[var(--good)] hover:bg-[var(--good)] hover:text-white whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Concluir meta
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteIncompleteGoal(goal.id)}
                        aria-label={`Excluir ${goal.materia}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))
        ) : (
          <EmptyState message="Nenhuma pendência arquivada no momento." />
        )}
      </div>
    </div>
  );
};
