import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CalendarClock, Scale, Target } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { WEEKDAYS, localDateIso, visibleName } from '../../lib/parsers';
import { Panel } from '../ui/PageHeader';

type QueueCategory = 'all' | 'law' | 'errors' | 'schedule';

interface SmartReviewItem {
  id: string;
  category: Exclude<QueueCategory, 'all'>;
  priority: number;
  urgencyLabel: 'Urgente' | 'Revisar' | 'Hoje';
  title: string;
  detail: string;
  meta: string;
  actionLabel: string;
  onAction: () => void;
}

function diffDaysIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export const SmartReviewQueuePanel: React.FC = React.memo(() => {
  const { db, allErrorEntries, setActivePage, openLawAt, startErrorNotebookQuiz } = useStudy();
  const [filter, setFilter] = useState<QueueCategory>('all');

  const todayIso = localDateIso();
  const todayWeekday = WEEKDAYS[(new Date().getDay() + 6) % 7];

  const queue = useMemo<SmartReviewItem[]>(() => {
    const items: SmartReviewItem[] = [];

    // 1. Leis sem leitura há > 7 dias ou ainda não lidas (usando histórico cumulativo + lawReadDates)
    for (const [folder, lawData] of Object.entries(db.laws || {})) {
      const dates = new Set<string>();
      for (const entry of db.lawReadDates?.[folder] || []) {
        if (entry?.data) dates.add(entry.data);
      }
      for (const it of lawData?.items || []) {
        for (const r of it.leituras || []) {
          if (r?.data) dates.add(r.data);
        }
      }
      const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));
      const latestIso = sortedDates[0] || null;
      const daysAgo = latestIso ? diffDaysIso(latestIso, todayIso) : null;
      const totalItems = lawData?.items?.length || 0;

      if (daysAgo === null && totalItems > 0) {
        items.push({
          id: `law-unread-${folder}`,
          category: 'law',
          priority: 82,
          urgencyLabel: 'Revisar',
          title: visibleName(folder),
          detail: 'Legislação ainda não iniciada no histórico de leitura.',
          meta: `Lei Seca · ${totalItems} dispositivos · 0 dias lidos`,
          actionLabel: 'Iniciar leitura',
          onAction: () => openLawAt(folder),
        });
      } else if (daysAgo !== null && daysAgo >= 7) {
        items.push({
          id: `law-stale-${folder}`,
          category: 'law',
          priority: daysAgo >= 15 ? 96 : 88,
          urgencyLabel: daysAgo >= 15 ? 'Urgente' : 'Revisar',
          title: visibleName(folder),
          detail: `Última leitura há ${daysAgo} dia(s). Retome para evitar esquecimento da letra de lei.`,
          meta: `Lei Seca · ${sortedDates.length} dia(s) lido(s) · último em ${latestIso?.split('-').reverse().join('/')}`,
          actionLabel: 'Revisar lei',
          onAction: () => openLawAt(folder),
        });
      }
    }

    // 2. Matérias com maior taxa de erro e caderno de erros pendente
    const subjectStats = new Map<string, { attempts: number; errors: number; pendingNotes: number }>();
    for (const h of db.history || []) {
      const subj = visibleName(h.subject || 'Geral');
      const cur = subjectStats.get(subj) || { attempts: 0, errors: 0, pendingNotes: 0 };
      cur.attempts += 1;
      if (!h.correct) cur.errors += 1;
      subjectStats.set(subj, cur);
    }
    for (const err of allErrorEntries) {
      const isDue =
        (!err.corrigido && !err.correcao_prova) ||
        Boolean(err.proxima_revisao && err.proxima_revisao <= todayIso);
      if (!isDue) continue;
      const subj = visibleName(err.materia || 'Geral');
      const cur = subjectStats.get(subj) || { attempts: 0, errors: 0, pendingNotes: 0 };
      cur.pendingNotes += 1;
      subjectStats.set(subj, cur);
    }

    const weakSubjects = [...subjectStats.entries()]
      .filter(([, s]) => s.pendingNotes > 0 || (s.attempts >= 5 && s.errors / s.attempts >= 0.3))
      .map(([subj, s]) => {
        const errRate = s.attempts > 0 ? Math.round((s.errors / s.attempts) * 100) : 0;
        return { subj, ...s, errRate };
      })
      .sort((a, b) => b.errRate - a.errRate || b.pendingNotes - a.pendingNotes)
      .slice(0, 4);

    for (const ws of weakSubjects) {
      items.push({
        id: `err-subj-${ws.subj}`,
        category: 'errors',
        priority: ws.errRate >= 45 || ws.pendingNotes >= 5 ? 98 : 86,
        urgencyLabel: ws.errRate >= 45 || ws.pendingNotes >= 5 ? 'Urgente' : 'Revisar',
        title: ws.subj,
        detail:
          ws.pendingNotes > 0
            ? `${ws.pendingNotes} item(ns) pendente(s) no Caderno de Erros${ws.attempts > 0 ? ` com taxa de erro de ${ws.errRate}%` : ''}.`
            : `Taxa de erro acumulada de ${ws.errRate}% em ${ws.attempts} questões resolvidas.`,
        meta: `Erros · ${ws.errors} erro(s) / ${ws.attempts} questão(ões)`,
        actionLabel: ws.pendingNotes > 0 ? 'Treinar erros' : 'Abrir Erros',
        onAction: () => {
          if (ws.pendingNotes > 0) {
            startErrorNotebookQuiz(ws.subj, true);
            return;
          }
          setActivePage('Caderno de Erros');
        },
      });
    }

    // 3. Metas pendentes do cronograma de hoje
    const todayTopics = db.schedule?.[todayWeekday] || [];
    for (const topic of todayTopics.slice(0, 4)) {
      const subj = visibleName(topic.disciplina_fixa || topic.materia || 'Estudo do dia');
      const topicTitle = visibleName(topic.materia || subj);
      items.push({
        id: `sched-${topic.id || topicTitle}`,
        category: 'schedule',
        priority: 80,
        urgencyLabel: 'Hoje',
        title: topicTitle,
        detail: `Meta agendada para ${todayWeekday} no seu cronograma semanal.`,
        meta: `Cronograma · ${subj}${topic.tempo ? ` · ${topic.tempo}` : ''}`,
        actionLabel: 'Abrir Cronograma',
        onAction: () => setActivePage('Cronograma'),
      });
    }

    return items.sort((a, b) => b.priority - a.priority);
  }, [
    allErrorEntries,
    db.history,
    db.lawReadDates,
    db.laws,
    db.schedule,
    openLawAt,
    setActivePage,
    startErrorNotebookQuiz,
    todayIso,
    todayWeekday,
  ]);

  const counts = useMemo(
    () => ({
      all: queue.length,
      law: queue.filter((i) => i.category === 'law').length,
      errors: queue.filter((i) => i.category === 'errors').length,
      schedule: queue.filter((i) => i.category === 'schedule').length,
    }),
    [queue],
  );

  const visibleItems = useMemo(
    () => (filter === 'all' ? queue : queue.filter((i) => i.category === filter)).slice(0, 8),
    [filter, queue],
  );

  return (
    <Panel
      className="mb-5"
      title="O que revisar hoje"
      subtitle="Fila inteligente que cruza leis sem leitura há mais de 7 dias, matérias com maior índice de erro e metas pendentes do dia."
      action={
        <div className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-0.5">
          {(
            [
              { id: 'all', label: `Tudo (${counts.all})` },
              { id: 'law', label: `Lei Seca (${counts.law})` },
              { id: 'errors', label: `Erros (${counts.errors})` },
              { id: 'schedule', label: `Hoje (${counts.schedule})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                filter === tab.id
                  ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    >
      {visibleItems.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-[var(--muted)]">
          Nenhuma pendência prioritária nesta categoria hoje. Continue seu ritmo no Treino Diário ou avance na Lei Seca.
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {visibleItems.map((item) => {
            const Icon =
              item.category === 'law'
                ? Scale
                : item.category === 'errors'
                  ? Target
                  : CalendarClock;
            const urgencyColor =
              item.urgencyLabel === 'Urgente'
                ? 'var(--bad)'
                : item.urgencyLabel === 'Revisar'
                  ? 'var(--warning)'
                  : 'var(--accent)';

            return (
              <div
                key={item.id}
                className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0 flex items-start gap-2.5">
                  <Icon
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{ color: urgencyColor }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <strong className="text-[13px] font-bold text-[var(--text)] truncate">
                        {item.title}
                      </strong>
                      <span aria-hidden="true" className="text-[var(--subtle)]">·</span>
                      <span
                        className="text-[11.5px] font-bold whitespace-nowrap"
                        style={{ color: urgencyColor }}
                      >
                        {item.urgencyLabel}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 text-[12px] text-[var(--muted)] leading-snug">
                      {item.detail}
                    </p>
                    <div className="mt-0.5 text-[11px] text-[var(--subtle)] font-mono-num">
                      {item.meta}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={item.onAction}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0 hidden sm:inline" aria-hidden="true" />
                  <span>{item.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
});
