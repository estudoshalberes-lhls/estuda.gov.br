import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import {
  DEFAULT_FIXED_SUBJECTS,
  WEEKDAYS,
  formatScheduleDuration,
  goalDateIso,
  isoWeekStartDate,
  localDateBrazilian,
  localDateIso,
  normalizeSearch,
  scheduleDurationSeconds,
  uid,
  visibleName,
} from '../../lib/parsers';
import { StudyCycleConfig, StudyCycleItem, WeekdayName } from '../../types/study';

export const DynamicStudyCyclePanel: React.FC = () => {
  const {
    db,
    fixedSubjects,
    updateStudyCycle,
    completeStudyCycleBlock,
    linkTimerToScheduleTopic,
    toast,
  } = useStudy();

  const cycle: StudyCycleConfig = useMemo(
    () =>
      db.studyCycle || {
        activeIndex: 0,
        completedCycles: 0,
        items: [],
      },
    [db.studyCycle],
  );

  const [newSubject, setNewSubject] = useState<string>(fixedSubjects[0] || '');
  const [newMinutes, setNewMinutes] = useState<string>('60');
  const [newNotes, setNewNotes] = useState<string>('');
  const [newContest, setNewContest] = useState<string>('');
  const [customLogMinutes, setCustomLogMinutes] = useState<Record<string, string>>({});

  const availableSubjects = useMemo(() => {
    const base = fixedSubjects.length ? fixedSubjects : DEFAULT_FIXED_SUBJECTS;
    return base;
  }, [fixedSubjects]);

  const contestNames = useMemo(
    () =>
      (db.contests || [])
        .map((c) => c.concurso?.trim())
        .filter((name): name is string => Boolean(name)),
    [db.contests],
  );

  const safeActiveIndex =
    cycle.items.length > 0 ? Math.max(0, Math.min(cycle.activeIndex || 0, cycle.items.length - 1)) : 0;
  const activeItem = cycle.items[safeActiveIndex] || null;

  const totalCycleMinutes = useMemo(
    () => cycle.items.reduce((sum, item) => sum + (item.targetMinutes || 60), 0),
    [cycle.items],
  );
  const totalStudiedMinutes = useMemo(
    () => cycle.items.reduce((sum, item) => sum + (item.completedMinutes || 0), 0),
    [cycle.items],
  );

  const todayWeekday: WeekdayName = WEEKDAYS[(new Date().getDay() + 6) % 7];

  // Smart weekly-goal recommendation: highlight cycle subject furthest behind its weekly target
  const laggingCycleSuggestion = useMemo(() => {
    const goals = db.preferences.weekly_subject_hours || {};
    if (Object.keys(goals).length === 0 || cycle.items.length === 0) return null;
    const todayIso = localDateIso();
    const mondayIso = isoWeekStartDate(todayIso);
    const [my, mm, md] = mondayIso.split('-').map(Number);
    const sunDt = new Date(my, (mm || 1) - 1, (md || 1) + 6);
    const sundayIso = `${sunDt.getFullYear()}-${String(sunDt.getMonth() + 1).padStart(2, '0')}-${String(sunDt.getDate()).padStart(2, '0')}`;

    const realized = new Map<string, number>();
    const countedTopics = new Set<string>();
    const countedRecs = new Set<string>();
    (db.studyTimeRecords || []).forEach((rec) => {
      if (!rec.date || rec.date < mondayIso || rec.date > sundayIso) return;
      if (rec.quizId) countedRecs.add(rec.quizId);
      (rec.allocations || []).forEach((a) => {
        if (a.topicId) countedTopics.add(a.topicId);
        const k = normalizeSearch(a.subject);
        realized.set(k, (realized.get(k) || 0) + (a.seconds || 0));
      });
    });
    (db.completedGoals || []).forEach((g) => {
      const gIso = goalDateIso(g.data);
      if (!gIso || gIso < mondayIso || gIso > sundayIso) return;
      if (g.studyRecordId && countedRecs.has(g.studyRecordId)) return;
      if (g.topicId && countedTopics.has(g.topicId)) return;
      const sec = Math.max(scheduleDurationSeconds(g.tempo || ''), g.estudado_segundos || 0);
      const k = normalizeSearch(g.disciplina_fixa || g.materia);
      realized.set(k, (realized.get(k) || 0) + sec);
    });

    let best: { idx: number; subject: string; pct: number } | null = null;
    for (let idx = 0; idx < cycle.items.length; idx++) {
      const it = cycle.items[idx];
      const targetEntry = Object.entries(goals).find(
        ([k, h]) => Number(h) > 0 && normalizeSearch(k) === normalizeSearch(it.subject),
      );
      if (!targetEntry) continue;
      const targetSec = targetEntry[1] * 3600;
      const actualSec = realized.get(normalizeSearch(it.subject)) || 0;
      const pct = Math.min(100, Math.round((actualSec / targetSec) * 100));
      if (pct < 100 && (!best || pct < best.pct)) {
        best = { idx, subject: it.subject, pct };
      }
    }
    if (!best || best.idx === safeActiveIndex) return null;
    return best;
  }, [cycle.items, db.completedGoals, db.preferences.weekly_subject_hours, db.studyTimeRecords, safeActiveIndex]);

  const handleGenerateFromFixedSubjects = () => {
    const list = availableSubjects.slice(0, 12);
    if (!list.length) {
      toast('Cadastre pelo menos uma Matéria Fixa antes de gerar o ciclo.', true);
      return;
    }
    const items: StudyCycleItem[] = list.map((subj) => ({
      id: uid(10),
      subject: subj,
      targetMinutes: 60,
      completedMinutes: 0,
      completions: 0,
    }));
    updateStudyCycle((prev) => ({
      ...prev,
      activeIndex: 0,
      items,
    }));
    toast(`Ciclo dinâmico criado com ${items.length} matérias fixas (1h por bloco).`);
  };

  const handleAddBlock = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = (newSubject || availableSubjects[0] || '').trim();
    if (!subject) {
      toast('Selecione ou informe uma disciplina para o bloco do ciclo.', true);
      return;
    }
    const mins = Math.max(15, Math.min(360, Math.round(Number(newMinutes) || 60)));
    const item: StudyCycleItem = {
      id: uid(10),
      subject,
      targetMinutes: mins,
      completedMinutes: 0,
      completions: 0,
      ...(newNotes.trim() ? { notes: newNotes.trim() } : {}),
      ...(newContest.trim() ? { contest: newContest.trim() } : {}),
    };
    updateStudyCycle((prev) => ({
      ...prev,
      items: [...prev.items, item],
    }));
    setNewNotes('');
    toast(`Bloco "${visibleName(subject)}" (${mins} min) adicionado ao ciclo.`);
  };

  const handleMoveBlock = (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= cycle.items.length) return;
    updateStudyCycle((prev) => {
      const nextItems = [...prev.items];
      const [moved] = nextItems.splice(index, 1);
      nextItems.splice(targetIdx, 0, moved);
      return { ...prev, items: nextItems };
    });
  };

  const handleRemoveBlock = (id: string) => {
    updateStudyCycle((prev) => {
      const nextItems = prev.items.filter((it) => it.id !== id);
      const nextActive = nextItems.length > 0 ? Math.min(prev.activeIndex, nextItems.length - 1) : 0;
      return { ...prev, items: nextItems, activeIndex: nextActive };
    });
  };

  const handleSelectActive = (idx: number) => {
    updateStudyCycle((prev) => ({ ...prev, activeIndex: idx }));
  };

  const handleResetPointer = () => {
    updateStudyCycle((prev) => ({ ...prev, activeIndex: 0 }));
    toast('Ponteiro do ciclo reiniciado para o 1º bloco.');
  };

  const handleStartTimerForBlock = (item: StudyCycleItem) => {
    linkTimerToScheduleTopic(
      todayWeekday,
      {
        id: `cycle-block-${item.id}`,
        data: localDateBrazilian(),
        materia: item.notes ? `${item.subject} — ${item.notes}` : item.subject,
        disciplina_fixa: item.subject,
        concurso_alvo: item.contest,
        tempo: `${item.targetMinutes}min`,
        observacoes: item.notes || 'Bloco do Ciclo de Estudos Dinâmico',
      },
      true,
    );
  };

  return (
    <section className="ce-panel rounded-xl p-4 sm:p-5 mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 mb-4 border-b border-[var(--line)]">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span>Ciclo de Estudos Dinâmico · Rotação Automática</span>
          </div>
          <h3 className="m-0 mt-1 font-display text-[17px] font-extrabold text-[var(--text)]">
            Fila Contínua de Disciplinas (Sem Atraso por Dia da Semana)
          </h3>
          <p className="m-0 mt-1 text-[12px] text-[var(--muted)]">
            Ao concluir um bloco, o sistema contabiliza o tempo diretamente no Portal da Transparência e gira automaticamente para a próxima matéria do ciclo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Voltas Completas
            </span>
            <strong className="font-mono-num text-[14px] font-extrabold text-[var(--accent)]">
              {cycle.completedCycles || 0} ciclo(s)
            </strong>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Carga por Volta
            </span>
            <strong className="font-mono-num text-[14px] font-extrabold text-[var(--text)]">
              {totalCycleMinutes > 0 ? formatScheduleDuration(totalCycleMinutes * 60) : '0m'}
            </strong>
          </div>
          {cycle.items.length > 0 && (
            <button
              type="button"
              onClick={handleResetPointer}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
              title="Voltar o ponteiro ativo para o primeiro bloco"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar fila
            </button>
          )}
        </div>
      </div>

      {/* Active Block Spotlight */}
      {activeItem ? (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)]/50 p-3.5 sm:p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--accent)] text-white text-[10px] font-extrabold uppercase tracking-wider">
                Bloco Atual · #{safeActiveIndex + 1} de {cycle.items.length}
              </span>
              {activeItem.contest && (
                <span className="text-[11px] font-bold text-[var(--muted)]">
                  Edital: {activeItem.contest}
                </span>
              )}
              <span className="text-[11px] font-mono-num font-bold text-[var(--accent)]">
                Meta do bloco: {formatScheduleDuration(activeItem.targetMinutes * 60)}
              </span>
            </div>
            <h4 className="m-0 mt-1.5 font-display text-[17px] font-extrabold text-[var(--text)]">
              {visibleName(activeItem.subject)}
            </h4>
            {activeItem.notes && (
              <p className="m-0 mt-0.5 text-[12px] text-[var(--muted)]">{activeItem.notes}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleStartTimerForBlock(activeItem)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--panel)] text-[var(--accent)] text-[12px] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Cronometrar no Ponto
            </button>

            <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 h-9">
              <Clock3 className="w-3.5 h-3.5 text-[var(--muted)]" />
              <input
                type="number"
                min={5}
                max={360}
                value={customLogMinutes[activeItem.id] ?? String(activeItem.targetMinutes)}
                onChange={(e) =>
                  setCustomLogMinutes((prev) => ({ ...prev, [activeItem.id]: e.target.value }))
                }
                aria-label="Minutos estudados neste bloco"
                className="w-12 bg-transparent text-center font-mono-num text-[12px] font-bold text-[var(--text)] outline-none"
              />
              <span className="text-[11px] font-semibold text-[var(--muted)]">min</span>
            </div>

            <button
              type="button"
              onClick={() => {
                const raw = Number(customLogMinutes[activeItem.id]);
                const mins = Number.isFinite(raw) && raw >= 5 ? raw : activeItem.targetMinutes;
                completeStudyCycleBlock(activeItem.id, mins);
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[12px] font-extrabold hover:opacity-95 transition-opacity cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Concluir e Girar Ciclo
            </button>
          </div>
          {laggingCycleSuggestion && (
            <div className="w-full pt-2 mt-1 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
              <span className="text-[var(--muted)]">
                Sugestão pela meta semanal:{' '}
                <strong className="text-[var(--warning)]">
                  {visibleName(laggingCycleSuggestion.subject)}
                </strong>{' '}
                está com <span className="font-mono-num tabular-nums font-bold">{laggingCycleSuggestion.pct}%</span> da carga semanal.
              </span>
              <button
                type="button"
                onClick={() => {
                  updateStudyCycle((prev) => ({
                    ...prev,
                    activeIndex: laggingCycleSuggestion.idx,
                  }));
                  toast(`Bloco "${visibleName(laggingCycleSuggestion.subject)}" ativado agora no Ciclo.`);
                }}
                className="text-[var(--accent)] font-bold hover:underline whitespace-nowrap"
              >
                Ativar este bloco agora
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-5 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong className="block text-[13.5px] font-bold text-[var(--text)]">
              Nenhum bloco configurado no Ciclo Dinâmico ainda
            </strong>
            <span className="block text-[12px] text-[var(--muted)] mt-0.5">
              Gere automaticamente a partir das suas Matérias Fixas ou adicione blocos com o peso de minutos desejado abaixo.
            </span>
          </div>
          <button
            type="button"
            onClick={handleGenerateFromFixedSubjects}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:opacity-95 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Gerar ciclo com Matérias Fixas ({availableSubjects.length})
          </button>
        </div>
      )}

      {/* Cycle Sequence List */}
      {cycle.items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 mb-4">
          {cycle.items.map((item, idx) => {
            const isCurrent = idx === safeActiveIndex;
            const isDoneInCurrentTurn = idx < safeActiveIndex;
            return (
              <div
                key={item.id}
                className={`rounded-xl border p-3 transition-colors flex flex-col justify-between gap-2 ${
                  isCurrent
                    ? 'border-[var(--accent)] bg-[var(--panel-raised)] ring-1 ring-[var(--accent)]/40'
                    : isDoneInCurrentTurn
                    ? 'border-[var(--good)]/35 bg-[var(--good)]/5'
                    : 'border-[var(--line)] bg-[var(--panel-soft)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-md font-mono-num text-[10.5px] font-extrabold shrink-0 ${
                          isCurrent
                            ? 'bg-[var(--accent)] text-white'
                            : isDoneInCurrentTurn
                            ? 'bg-[var(--good)]/20 text-[var(--good)]'
                            : 'bg-[var(--panel)] border border-[var(--line)] text-[var(--muted)]'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectActive(idx)}
                        className="text-left text-[13px] font-bold text-[var(--text)] hover:text-[var(--accent)] truncate cursor-pointer"
                        title="Definir este bloco como o ativo agora"
                      >
                        {visibleName(item.subject)}
                      </button>
                    </div>
                    {item.notes && (
                      <p className="m-0 mt-1 text-[11px] text-[var(--muted)] line-clamp-1">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveBlock(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 cursor-pointer"
                      title="Mover para cima"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveBlock(idx, 1)}
                      disabled={idx === cycle.items.length - 1}
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 cursor-pointer"
                      title="Mover para baixo"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveBlock(item.id)}
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer"
                      title="Remover bloco do ciclo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--line)]/60 text-[11px]">
                  <span className="font-mono-num text-[var(--muted)]">
                    Bloco: <strong className="text-[var(--text)]">{item.targetMinutes}m</strong> ·{' '}
                    {item.completions || 0}x ({formatScheduleDuration((item.completedMinutes || 0) * 60)})
                  </span>
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleSelectActive(idx)}
                      className="text-[11px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Ativar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Block Form */}
      <form
        onSubmit={handleAddBlock}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.6fr_1.2fr_1fr_auto] gap-2 items-end pt-3 border-t border-[var(--line)]"
      >
        <div>
          <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
            Disciplina do Bloco
          </label>
          <select
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            className="ce-input w-full h-9 rounded-lg px-2.5 text-[12.5px]"
          >
            {availableSubjects.map((subj) => (
              <option key={subj} value={subj}>
                {visibleName(subj)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
            Duração (min)
          </label>
          <input
            type="number"
            min={15}
            max={360}
            step={5}
            value={newMinutes}
            onChange={(e) => setNewMinutes(e.target.value)}
            className="ce-input w-full h-9 rounded-lg px-2.5 text-[12.5px] font-mono-num"
            placeholder="60"
          />
        </div>

        <div>
          <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
            Foco / Subtópico (opcional)
          </label>
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="ce-input w-full h-9 rounded-lg px-2.5 text-[12.5px]"
            placeholder="Ex: Lei Seca + 20 questões"
          />
        </div>

        <div>
          <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
            Concurso Alvo (opcional)
          </label>
          <select
            value={newContest}
            onChange={(e) => setNewContest(e.target.value)}
            className="ce-input w-full h-9 rounded-lg px-2.5 text-[12.5px]"
          >
            <option value="">Geral / Todos</option>
            {contestNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:opacity-95 whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Bloco
        </button>
      </form>

      {totalStudiedMinutes > 0 && (
        <div className="mt-3 text-[11.5px] text-[var(--muted)] font-mono-num">
          Tempo total acumulado via Ciclo Dinâmico:{' '}
          <strong className="text-[var(--text)]">
            {formatScheduleDuration(totalStudiedMinutes * 60)}
          </strong>
        </div>
      )}
    </section>
  );
};
