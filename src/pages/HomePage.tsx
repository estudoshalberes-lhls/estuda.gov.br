import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Database,
  FileCheck2,
  FileDown,
  ListChecks,
  Play,
  Plus,
  Scale,
  Timer,
} from 'lucide-react';
import heroStudyDesk from '../assets/images/gov_portal_hero_1794760858327.jpg';
import { useStudy } from '../context/StudyContext';
import { useStudyTimer } from '../lib/timerTickStore';
import { getGovModuleLabel } from '../data/seedData';
import { WEEKDAYS, formatScheduleDuration, localDateIso, paymentDateValue, visibleName } from '../lib/parsers';
import { exportStudentClearanceCertificatePdf } from '../lib/pdfExport';
import { ModuleName } from '../types/study';
import { ModuleIcon } from '../components/ui/ModuleIcon';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

const QUICK_ACCESS: ReadonlyArray<{ page: ModuleName; caption: string; icon: string }> = [
  { page: 'Treino Diário', caption: 'Resolver questões do banco oficial', icon: 'target' },
  { page: 'Lei Seca', caption: 'Consultar códigos e grifos', icon: 'book' },
  { page: 'Provas', caption: 'Acervo de provas anteriores', icon: 'file' },
  { page: 'PDFs Pessoais', caption: 'Dossiê de apostilas e PDFs', icon: 'folder' },
  { page: 'Pontos Críticos', caption: 'Alertas e pegadinhas de banca', icon: 'sparkles' },
  { page: 'Utilidades', caption: 'Protocolar .txt e converter PDF', icon: 'tools' },
];

const HomeSaveTimerButton: React.FC<{ onCommit: () => void }> = React.memo(({ onCommit }) => {
  const { timerSeconds } = useStudyTimer();
  if (timerSeconds <= 0) return null;
  return (
    <button
      type="button"
      onClick={onCommit}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
    >
      <Timer className="w-3 h-3" />
      Salvar tempo
    </button>
  );
});

export const HomePage: React.FC = () => {
  const {
    db,
    setActivePage,
    openLawAt,
    openContestEdital,
    allErrorEntries,
    activeTimerTopic,
    linkTimerToScheduleTopic,
    commitTimerToSchedule,
    logQuickStudyMinutes,
    completeScheduleTopic,
    advanceErrorReview,
    startErrorNotebookQuiz,
    addLawReadDate,
    googleUser,
    toast,
  } = useStudy();

  const todayIso = localDateIso();
  const todayWeekday = WEEKDAYS[(new Date().getDay() + 6) % 7];
  const todayTopics = db.schedule[todayWeekday] || [];

  const dueReviews = useMemo(
    () =>
      allErrorEntries.filter(
        (entry) =>
          (entry.proxima_revisao && entry.proxima_revisao <= todayIso) ||
          (!entry.corrigido && !entry.correcao_prova),
      ),
    [allErrorEntries, todayIso],
  );

  const spacedLawReviews = useMemo(() => {
    const todayMs = new Date(`${todayIso}T00:00:00`).getTime();
    const list: Array<{
      folder: string;
      daysSinceRead: number;
      curveStageLabel: string;
      highIncidenceUnread: number;
      firstPriorityArticle?: string;
    }> = [];

    for (const [folder, lawData] of Object.entries(db.laws || {})) {
      const readList = [...(db.lawReadDates?.[folder] || [])].sort((a, b) =>
        b.data.localeCompare(a.data),
      );
      const readIds = new Set(db.readLawItems?.[folder] || []);
      const items = lawData?.items || [];
      const unreadPriority = items.filter(
        (it) =>
          (it.grau === 'Muito Alto' || it.grau === 'Alto') &&
          !readIds.has(it.id),
      );
      const latestReadIso = readList[0]?.data;
      let daysSinceRead = -1;
      if (latestReadIso) {
        const readMs = new Date(`${latestReadIso}T00:00:00`).getTime();
        if (Number.isFinite(readMs) && Number.isFinite(todayMs)) {
          daysSinceRead = Math.max(0, Math.round((todayMs - readMs) / 86400000));
        }
      }
      const isCurveDue =
        daysSinceRead === 1 ||
        daysSinceRead === 7 ||
        daysSinceRead === 15 ||
        daysSinceRead >= 30;
      if (isCurveDue || unreadPriority.length > 0) {
        const curveStageLabel =
          daysSinceRead >= 30
            ? `Ciclo 30+ dias (${daysSinceRead}d sem leitura)`
            : daysSinceRead === 15
              ? 'Ciclo de 15 dias (Revisão quinzenal)'
              : daysSinceRead === 7
                ? 'Ciclo de 7 dias (Revisão semanal)'
                : daysSinceRead === 1
                  ? 'Ciclo de 24h (Revisão D+1)'
                  : 'Incidência Alta pendente de leitura';
        list.push({
          folder,
          daysSinceRead,
          curveStageLabel,
          highIncidenceUnread: unreadPriority.length,
          firstPriorityArticle:
            unreadPriority[0]?.artigo_base || unreadPriority[0]?.dispositivo,
        });
      }
    }
    return list.sort((a, b) => b.daysSinceRead - a.daysSinceRead).slice(0, 6);
  }, [db.lawReadDates, db.laws, db.readLawItems, todayIso]);

  const attempted = db.history.length;
  const totalCorrect = db.history.filter((h) => h.correct).length;
  const overallAccuracy = attempted ? Math.round((totalCorrect / attempted) * 100) : 0;

  const [subjectSearch, setSubjectSearch] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const subjectStats = useMemo(() => {
    const map = new Map<string, { subject: string; attempts: number; correct: number }>();
    db.history.forEach((entry) => {
      const subject = entry.subject || 'Geral';
      const cur = map.get(subject) || { subject, attempts: 0, correct: 0 };
      cur.attempts += 1;
      if (entry.correct) cur.correct += 1;
      map.set(subject, cur);
    });
    return [...map.values()]
      .filter((item) => !subjectSearch.trim() || item.subject.toLowerCase().includes(subjectSearch.toLowerCase()))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'))
      .map((item) => ({
        ...item,
        percentage: item.attempts ? Math.round((item.correct / item.attempts) * 100) : 0,
      }));
  }, [db.history, subjectSearch]);

  const nextPendingContest = useMemo(() => {
    const pending = db.contests
      .filter((c) => c.status_pagamento === 'Não Pago')
      .map((c) => ({ ...c, ts: paymentDateValue(c.data_pagamento) }))
      .sort((a, b) => {
        if (a.ts === null && b.ts === null) return 0;
        if (a.ts === null) return 1;
        if (b.ts === null) return -1;
        return a.ts - b.ts;
      });
    return pending[0] || null;
  }, [db.contests]);

  const pendingPaymentsCount = useMemo(
    () => db.contests.filter((c) => c.status_pagamento === 'Não Pago').length,
    [db.contests],
  );

  const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const paymentIsOverdue =
    nextPendingContest &&
    nextPendingContest.ts !== null &&
    nextPendingContest.ts < todayMidnight;

  const nextExamCountdown = useMemo(() => {
    const upcoming = db.contests
      .map((c) => {
        const examTs = paymentDateValue(c.data_abertura);
        return { contest: c, examTs };
      })
      .filter((item): item is { contest: (typeof db.contests)[number]; examTs: number } =>
        item.examTs !== null && item.examTs >= todayMidnight,
      )
      .sort((a, b) => a.examTs - b.examTs);

    const first = upcoming[0];
    if (!first) return null;

    const daysLeft = Math.max(0, Math.round((first.examTs - todayMidnight) / 86400000));
    const pts = first.contest.edital_pontos || [];
    const totalTopics = pts.length;
    const remainingTopics = pts.filter((p) => !p.estudado).length;
    const topicsPerDay =
      remainingTopics > 0 ? Math.ceil(remainingTopics / Math.max(1, daysLeft)) : 0;

    return {
      contest: first.contest,
      daysLeft,
      totalTopics,
      remainingTopics,
      topicsPerDay,
    };
  }, [db.contests, todayMidnight]);

  const totalStudySeconds = useMemo(() => {
    let sum = 0;
    db.studyTimeRecords.forEach((rec) => {
      rec.allocations.forEach((alloc) => {
        sum += alloc.seconds || 0;
      });
    });
    return sum;
  }, [db.studyTimeRecords]);

  const studentRank = useMemo(() => {
    const score = attempted + db.completedSimulations.length * 10;
    if (score >= 500) {
      return {
        title: 'Ministro da Aprovação',
        nextTarget: 'Nível máximo atingido no escalão ministerial',
      };
    }
    if (score >= 250) {
      return {
        title: 'Auditor da Lei Seca',
        nextTarget: `${500 - score} pts para Ministro da Aprovação`,
      };
    }
    if (score >= 100) {
      return {
        title: 'Analista de Gabarito',
        nextTarget: `${250 - score} pts para Auditor da Lei Seca`,
      };
    }
    if (score >= 30) {
      return {
        title: 'Técnico em Café Forte',
        nextTarget: `${100 - score} pts para Analista de Gabarito`,
      };
    }
    return {
      title: 'Estagiário do Edital',
      nextTarget: `${Math.max(1, 30 - score)} pts para Técnico em Café Forte`,
    };
  }, [attempted, db.completedSimulations.length]);

  const holderName =
    googleUser?.displayName ||
    googleUser?.email ||
    'Cidadão-Estudante Federal';

  const protocolNumber = `EST-2026-${String(
    db.questions.length * 13 + attempted * 7 + db.completedSimulations.length * 31 + 1042,
  ).padStart(6, '0')}`;

  const isCadastralRegular = dueReviews.length === 0 && pendingPaymentsCount === 0;

  const handleDownloadCertificate = () => {
    try {
      exportStudentClearanceCertificatePdf({
        holderName,
        protocolNumber,
        rankTitle: studentRank.title,
        isRegular: isCadastralRegular,
        answeredQuestions: attempted,
        correctQuestions: totalCorrect,
        accuracyPercent: overallAccuracy,
        totalStudyFormatted: totalStudySeconds > 0 ? formatScheduleDuration(totalStudySeconds) : '0m',
        completedSimulations: db.completedSimulations.length,
        completedGoalsCount: db.completedGoals.length,
        pendingReviewsCount: dueReviews.length,
        pendingPaymentsCount,
        lawsCount: Object.keys(db.laws).length,
        contestsCount: db.contests.length,
        totalQuestionsBank: db.questions.length,
      });
      toast('Certidão de Regularidade Estudantil emitida em PDF!');
    } catch (err) {
      toast((err as Error).message || 'Não foi possível gerar a certidão em PDF.', true);
    }
  };

  const metrics = [
    {
      label: 'Questões no Acervo',
      value: db.questions.length,
      note: 'Disponíveis para treino oficial',
      icon: Database,
    },
    {
      label: 'Acertos Homologados',
      value: totalCorrect,
      note: attempted ? `${overallAccuracy}% de aproveitamento` : 'Nenhum treino registrado',
      icon: CheckCircle2,
    },
    {
      label: 'Ouvidoria de Erros',
      value: allErrorEntries.length,
      note: dueReviews.length ? `${dueReviews.length} pendência(s) para hoje` : 'Situação em dia',
      icon: ClipboardList,
    },
    {
      label: 'Legislações Vigentes',
      value: Object.keys(db.laws).length,
      note: 'Códigos disponíveis para leitura',
      icon: Scale,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="PORTAL DE SERVIÇOS AO ESTUDANTE"
        title="Comprovante de Situação nos Estudos"
        description="Acompanhe seu rendimento por disciplina, prazos de inscrição em editais e metas diárias do Programa Nacional de Sobrevivência Acadêmica."
      />

      {/* Ministerial Focal Hero Banner */}
      <section className="ce-panel rounded-xl overflow-hidden mb-5 grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] items-stretch">
        <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-bold text-[var(--accent)] mb-2">
              <FileCheck2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Programa Bolsa-Questão &amp; Fomento à Aprovação · Exercício 2026</span>
            </div>
            <h3 className="m-0 font-display text-[20px] sm:text-[23px] font-extrabold tracking-[-0.02em] text-[var(--text)] [text-wrap:balance]">
              {dueReviews.length > 0
                ? `Atenção, cidadão-estudante: você tem ${dueReviews.length} revisão(ões) pendente(s) no protocolo de hoje.`
                : 'Situação Cadastral Regular: todas as revisões programadas para hoje estão em dia.'}
            </h3>
            <p className="mt-2 mb-0 text-[13.5px] leading-relaxed text-[var(--muted)] max-w-[60ch]">
              {todayTopics.length > 0
                ? `Constam ${todayTopics.length} meta(s) agendada(s) para ${todayWeekday} no seu cronograma. Bata o ponto eletrônico ao lado e inicie sua bateria de questões.`
                : `Nenhuma meta cadastrada para ${todayWeekday}. Utilize o Treino Diário ou configure sua agenda semanal no Cronograma.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setActivePage('Treino Diário')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Iniciar Treino Diário</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePage('Cronograma')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] hover:border-[var(--accent)] text-[var(--text)] text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
              <span>Abrir Cronograma</span>
            </button>
          </div>
        </div>

        <div className="relative min-h-[170px] lg:min-h-full border-t lg:border-t-0 lg:border-l border-[var(--line)] bg-[var(--panel-soft)]">
          {!heroImgFailed ? (
            <img
              src={heroStudyDesk}
              alt="Mesa de estudos do Portal Único do Estudante Federal"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#071D41] to-[#1351B4] flex items-center justify-center p-6 text-white text-center">
              <span className="font-display text-[14px] font-bold">estuda.gov.br</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 py-2.5 text-white text-[11px] font-medium flex items-center justify-between gap-2">
            <span>Central de Atendimento ao Concurseiro</span>
            <span className="font-mono-num text-white/85">DF · BR</span>
          </div>
        </div>
      </section>

      {/* Central de Pendências do Protocolo */}
      <section
        aria-label="Central de Pendências do Protocolo"
        className="ce-panel rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 text-[12px] font-extrabold text-[var(--text)] uppercase tracking-[0.04em]">
          <AlertTriangle
            className={`w-4 h-4 shrink-0 ${
              dueReviews.length + pendingPaymentsCount + db.incompleteGoals.length > 0
                ? 'text-[var(--warning)]'
                : 'text-[var(--good)]'
            }`}
            aria-hidden="true"
          />
          <span>Central de Pendências do Protocolo</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[12px]">
          <button
            type="button"
            onClick={() => setActivePage('Caderno de Erros')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] hover:border-[var(--accent)] text-[var(--text)] font-semibold transition-colors cursor-pointer"
          >
            <strong className={`font-mono-num ${dueReviews.length > 0 ? 'text-[var(--warning)]' : 'text-[var(--good)]'}`}>
              {dueReviews.length}
            </strong>
            <span>Ouvidoria (Erros)</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePage('Datas & Locais')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] hover:border-[var(--accent)] text-[var(--text)] font-semibold transition-colors cursor-pointer"
          >
            <strong className={`font-mono-num ${pendingPaymentsCount > 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}>
              {pendingPaymentsCount}
            </strong>
            <span>GRU(s) em Protocolo</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePage('Metas Não Concluídas')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] hover:border-[var(--accent)] text-[var(--text)] font-semibold transition-colors cursor-pointer"
          >
            <strong className={`font-mono-num ${db.incompleteGoals.length > 0 ? 'text-[var(--warning)]' : 'text-[var(--good)]'}`}>
              {db.incompleteGoals.length}
            </strong>
            <span>Dívida Ativa</span>
          </button>
        </div>
      </section>

      {/* Fila de Revisão Espaçada Automática (Curva 1-7-15-30 dias) */}
      {(dueReviews.length > 0 || spacedLawReviews.length > 0) && (
        <Panel
          title="Fila de Revisão Espaçada de Hoje (Curva 1–7–15–30 dias)"
          subtitle="Consolidado automático de questões do Caderno de Erros vencidas hoje, legislações nos marcos da curva de esquecimento e dispositivos de alta incidência pendentes."
          className="mb-5"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {dueReviews.length > 0 && (
                <button
                  type="button"
                  onClick={() => startErrorNotebookQuiz(undefined, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Treinar {dueReviews.length} erro(s) do dia
                </button>
              )}
              <button
                type="button"
                onClick={() => setActivePage('Lei Seca')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5 text-[var(--accent)]" />
                Ir para Lei Seca
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-[var(--accent)]">
                  Caderno de Erros · Revisões Vencidas ({dueReviews.length})
                </span>
                <button
                  type="button"
                  onClick={() => setActivePage('Caderno de Erros')}
                  className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  Ver todas
                </button>
              </div>
              {dueReviews.length === 0 ? (
                <p className="m-0 text-[12px] text-[var(--muted)]">
                  Nenhuma anotação ou questão vencida no Caderno de Erros hoje.
                </p>
              ) : (
                <div className="space-y-2">
                  {dueReviews.slice(0, 4).map((err) => (
                    <div
                      key={err.id}
                      className="flex items-center justify-between gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-[var(--accent)]">
                          <span>{err.materia || 'Geral'}</span>
                          <span>·</span>
                          <span className="text-[var(--muted)]">
                            Ciclo #{(err.nivel_revisao || 0) + 1}
                          </span>
                        </div>
                        <p className="m-0 text-[12px] font-semibold text-[var(--text)] truncate">
                          {err.texto || err.questao?.enunciado || 'Erro anotado para revisão'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => advanceErrorReview(err.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--good)]/50 bg-[var(--good)]/12 text-[var(--good)] text-[11px] font-bold hover:bg-[var(--good)] hover:text-white transition-colors shrink-0"
                        title="Concluir ciclo atual e agendar próxima revisão (1/7/15/30d)"
                      >
                        <Check className="w-3 h-3" />
                        Revisado
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-[var(--accent)]">
                  Lei Seca & Matriz · Curva 1–7–15–30d ({spacedLawReviews.length})
                </span>
                <button
                  type="button"
                  onClick={() => setActivePage('Matriz de Incidência')}
                  className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  Abrir Matriz
                </button>
              </div>
              {spacedLawReviews.length === 0 ? (
                <p className="m-0 text-[12px] text-[var(--muted)]">
                  Todas as legislações estão com leitura e dispositivos de alta incidência em dia!
                </p>
              ) : (
                <div className="space-y-2">
                  {spacedLawReviews.slice(0, 4).map((item) => (
                    <div
                      key={item.folder}
                      className="flex items-center justify-between gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <strong className="block text-[12px] font-bold text-[var(--text)] truncate">
                          {visibleName(item.folder)}
                        </strong>
                        <span className="block text-[11px] text-[var(--muted)] truncate">
                          {item.curveStageLabel}
                          {item.highIncidenceUnread > 0
                            ? ` · ${item.highIncidenceUnread} art(s) Alto/Muito Alto não lido(s)`
                            : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            openLawAt(item.folder, item.firstPriorityArticle || '', {
                              tab: 'continuous',
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
                        >
                          Ler agora
                        </button>
                        <button
                          type="button"
                          onClick={() => addLawReadDate(item.folder, todayIso, 'Revisão espaçada')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--good)] hover:border-[var(--good)] text-[11px] font-bold"
                          title="Registrar leitura de hoje nesta lei"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* Contagem Regressiva Oficial para a Próxima Prova */}
      {nextExamCountdown && (
        <section
          aria-label="Contagem Regressiva Oficial para a Próxima Prova"
          className="ce-panel rounded-xl px-4 py-3.5 mb-5 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-[var(--accent)]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="px-3 py-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-center shrink-0">
              <div className="font-mono-num text-[18px] font-extrabold leading-none text-[var(--accent)]">
                {nextExamCountdown.daysLeft === 0 ? 'HOJE' : `D-${nextExamCountdown.daysLeft}`}
              </div>
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--muted)] mt-0.5">
                {nextExamCountdown.daysLeft === 0
                  ? 'Dia da prova'
                  : nextExamCountdown.daysLeft === 1
                    ? 'Falta 1 dia'
                    : `Faltam ${nextExamCountdown.daysLeft} dias`}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-[var(--accent)]">
                Contagem Regressiva Oficial · Próxima Prova ({nextExamCountdown.contest.data_abertura})
              </div>
              <strong className="block text-[14px] font-extrabold text-[var(--text)] truncate">
                {nextExamCountdown.contest.concurso}
              </strong>
              <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                {nextExamCountdown.totalTopics > 0
                  ? nextExamCountdown.remainingTopics > 0
                    ? `Restam ${nextExamCountdown.remainingTopics} de ${nextExamCountdown.totalTopics} ponto(s) no Diário de Editais · Ritmo sugerido: ${nextExamCountdown.topicsPerDay} ponto(s)/dia.`
                    : `Todos os ${nextExamCountdown.totalTopics} pontos do edital concluídos!`
                  : 'Vincule os pontos no Diário de Editais para calcular seu ritmo diário.'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openContestEdital(nextExamCountdown.contest.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              <ListChecks className="w-3.5 h-3.5 text-[var(--accent)]" />
              Abrir Diário de Editais
            </button>
            <button
              type="button"
              onClick={() => setActivePage('Datas & Locais')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              Protocolo &amp; GRUs
            </button>
          </div>
        </section>
      )}

      {/* Carteirinha Digital do Concurseiro */}
      <Panel
        title="Identidade Nacional do Concurseiro (Documento Digital)"
        subtitle={`Protocolo ${protocolNumber} · Classificação calculada pelo histórico de questões e simulados.`}
        className="mb-5"
        action={
          <button
            type="button"
            onClick={handleDownloadCertificate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Emitir Certidão (PDF)</span>
          </button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.8fr] gap-4 items-center">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className="grid place-items-center w-12 h-12 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
              <Award className="w-6 h-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.05em]">
                <span className={isCadastralRegular ? 'text-[var(--good)]' : 'text-[var(--warning)]'}>
                  {isCadastralRegular ? 'Situação Regular' : 'Pendência na Ouvidoria'}
                </span>
                <span className="text-[var(--subtle)]" aria-hidden="true">·</span>
                <span className="font-mono-num text-[var(--muted)]">{protocolNumber}</span>
              </div>
              <strong className="block text-[16px] font-extrabold text-[var(--text)] truncate mt-0.5">
                {holderName}
              </strong>
              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[12px]">
                <BadgeCheck className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <span className="font-bold text-[var(--accent)]">{studentRank.title}</span>
                <span className="text-[var(--muted)]">· {studentRank.nextTarget}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 lg:pt-0 lg:pl-4 border-t lg:border-t-0 lg:border-l border-[var(--line)]">
            <div>
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
                Ponto Registrado
              </span>
              <strong className="block font-mono-num text-[17px] font-extrabold text-[var(--text)] mt-0.5">
                {totalStudySeconds > 0 ? formatScheduleDuration(totalStudySeconds) : '0m'}
              </strong>
            </div>
            <div>
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
                Aproveitamento
              </span>
              <strong className="block font-mono-num text-[17px] font-extrabold text-[var(--text)] mt-0.5">
                {overallAccuracy}%
              </strong>
            </div>
            <div>
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
                Simulados
              </span>
              <strong className="block font-mono-num text-[17px] font-extrabold text-[var(--text)] mt-0.5">
                {db.completedSimulations.length.toLocaleString('pt-BR')}
              </strong>
            </div>
            <div>
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
                Metas Cumpridas
              </span>
              <strong className="block font-mono-num text-[17px] font-extrabold text-[var(--text)] mt-0.5">
                {db.completedGoals.length.toLocaleString('pt-BR')}
              </strong>
            </div>
          </div>
        </div>
      </Panel>

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <article
              key={m.label}
              className="ce-panel p-4 rounded-xl transition-colors duration-150 hover:border-[var(--line-strong)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] font-bold text-[var(--muted)] truncate">
                  {m.label}
                </span>
                <span className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--accent)] shrink-0">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
              <div className="font-mono-num text-[28px] sm:text-[30px] font-extrabold leading-none tracking-[-0.03em] text-[var(--text)] mt-3">
                {m.value.toLocaleString('pt-BR')}
              </div>
              <div className="text-[12px] font-medium text-[var(--subtle)] mt-2 truncate">
                {m.note}
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 mb-5">
        <Panel
          title="Desempenho por disciplina"
          subtitle="Percentual de acertos nas questões respondidas com escala de domínio."
          action={
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                placeholder="Filtrar matéria..."
                className="ce-input text-[11.5px] h-[34px] py-0.5 px-2.5 w-[145px]"
              />
              <button
                type="button"
                onClick={() => setActivePage('Monitor de Desempenho')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
              >
                Portal da Transparência
                <ArrowRight className="w-3 h-3 text-[var(--accent)]" />
              </button>
            </div>
          }
        >
          {subjectStats.length ? (
            <div className="flex flex-col gap-3">
              {subjectStats.map((entry) => {
                const barColor =
                  entry.percentage >= 70
                    ? 'bg-[var(--good)]'
                    : entry.percentage >= 50
                      ? 'bg-[var(--warning)]'
                      : 'bg-[var(--accent)]';

                return (
                  <div
                    key={entry.subject}
                    className="grid grid-cols-[minmax(120px,180px)_1fr_50px] items-center gap-3.5 p-1.5 rounded-lg hover:bg-[var(--panel-soft)] transition-colors"
                  >
                    <div className="min-w-0">
                      <span
                        className="block text-[12.5px] font-bold text-[var(--text)] truncate"
                        title={entry.subject}
                      >
                        {entry.subject}
                      </span>
                      <small className="block text-[11px] text-[var(--muted)] tabular-nums">
                        {entry.attempts.toLocaleString('pt-BR')} {entry.attempts === 1 ? 'questão' : 'questões'}
                      </small>
                    </div>
                    <div
                      className="h-2.5 rounded-full border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden"
                      role="progressbar"
                      aria-label={`Aproveitamento em ${entry.subject}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={entry.percentage}
                    >
                      <div
                        className={`h-full ${barColor} transition-all duration-300 rounded-full`}
                        style={{ width: `${entry.percentage}%` }}
                      />
                    </div>
                    <strong className="font-mono-num text-right text-[12.5px] font-bold text-[var(--text)]">
                      {entry.percentage}%
                    </strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              message="Resolva questões no Treino Diário para gerar seu boletim de aproveitamento por matéria."
              action={
                <button
                  type="button"
                  onClick={() => setActivePage('Treino Diário')}
                  className="px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  Iniciar Treino
                </button>
              }
            />
          )}
        </Panel>

        <Panel
          title="Guias de Pagamento & Editais"
          subtitle="Alertas de GRU/boletos de inscrição e agenda oficial."
        >
          <div className="text-[12px] text-[var(--muted)] mb-3 tabular-nums flex items-center justify-between pb-2.5 border-b border-[var(--line)]">
            <span>Total de questões resolvidas:</span>
            <strong className="font-mono-num text-[14px] text-[var(--text)]">
              {attempted.toLocaleString('pt-BR')}
            </strong>
          </div>

          {nextPendingContest ? (
            <div
              className={`ce-notice ${
                paymentIsOverdue ? 'ce-notice-bad' : 'ce-notice-warning'
              } flex flex-col gap-1.5 mb-4 rounded-xl`}
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{paymentIsOverdue ? 'Guia Vencida' : 'Próximo Vencimento'}</span>
                </strong>
                <button
                  type="button"
                  onClick={() => setActivePage('Datas & Locais')}
                  className="text-[11px] font-semibold underline cursor-pointer bg-transparent border-0 p-0 text-current"
                >
                  Ver calendário
                </button>
              </div>
              <span className="text-[13.5px] font-bold text-[var(--text)]">
                {nextPendingContest.concurso}
              </span>
              <small className="text-[11.5px] text-[var(--muted)]">
                {nextPendingContest.ts === null
                  ? 'Data limite não informada'
                  : `${paymentIsOverdue ? 'Vencimento' : 'Prazo de pagamento'}: ${
                      nextPendingContest.data_pagamento
                    }`}
              </small>
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() => setActivePage('Datas & Locais')}
                  className="px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Consultar concurso
                </button>
              </div>
            </div>
          ) : (
            <div className="ce-notice ce-notice-good mb-4 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--good)] shrink-0" aria-hidden="true" />
              <span>Nenhuma guia de inscrição pendente registrada.</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={() => setActivePage('Datas & Locais')}
              className="px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
            >
              Abrir Protocolo &amp; GRUs
            </button>
            <button
              type="button"
              onClick={() => setActivePage('Cronograma')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
              Abrir cronograma
            </button>
          </div>
        </Panel>
      </div>

      {/* Metas de Hoje + Revisões Espaçadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Panel
          title={`Expediente de Hoje · ${todayWeekday}`}
          subtitle="Disciplinas e cargas horárias programadas no seu cronograma."
          action={
            <button
              type="button"
              onClick={() => setActivePage('Cronograma')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              Cronograma
              <ArrowRight className="w-3 h-3 text-[var(--accent)]" />
            </button>
          }
        >
          {todayTopics.length ? (
            <div className="flex flex-col gap-2.5">
              {todayTopics.map((topic, idx) => {
                const isLinked = activeTimerTopic?.topicId === topic.id;
                return (
                  <div
                    key={topic.id || `${topic.materia}-${idx}`}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
                      isLinked
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--line)] bg-[var(--panel-soft)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[13px] font-bold text-[var(--text)] truncate">
                        {visibleName(topic.materia)}
                      </strong>
                      <span className="block text-[11.5px] text-[var(--muted)] tabular-nums">
                        Meta: {topic.tempo || 'Tempo livre'}
                        {topic.estudado_segundos
                          ? ` · Estudado: ${formatScheduleDuration(topic.estudado_segundos)}`
                          : ''}
                        {topic.observacoes ? ` · ${topic.observacoes}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => linkTimerToScheduleTopic(todayWeekday, topic, true)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                          isLinked
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                            : 'border-[var(--accent)] bg-[var(--panel)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'
                        }`}
                      >
                        {isLinked ? <Timer className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {isLinked ? 'Cronometrando' : 'Cronometrar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => logQuickStudyMinutes(todayWeekday, topic, 15)}
                        title="Registrar rapidamente +15 minutos nesta matéria"
                        className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                        <span>15m</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => logQuickStudyMinutes(todayWeekday, topic, 30)}
                        title="Registrar rapidamente +30 minutos nesta matéria"
                        className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                        <span>30m</span>
                      </button>
                      {isLinked && (
                        <HomeSaveTimerButton onCommit={commitTimerToSchedule} />
                      )}
                      <button
                        type="button"
                        onClick={() => completeScheduleTopic(todayWeekday, idx, todayTopics)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/10 text-[var(--good)] text-[11px] font-bold hover:bg-[var(--good)] hover:text-white transition-colors cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        Concluir meta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              message={`Nenhuma meta cadastrada para ${todayWeekday} no momento.`}
              action={
                <button
                  type="button"
                  onClick={() => setActivePage('Cronograma')}
                  className="px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                >
                  Configurar cronograma
                </button>
              }
            />
          )}
        </Panel>

        <Panel
          title="Ouvidoria (Erros) · Revisões para Hoje"
          subtitle="Erros pendentes e revisões espaçadas (1 / 7 / 15 / 30 dias) vencidas hoje."
          action={
            <button
              type="button"
              onClick={() => setActivePage('Caderno de Erros')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              Abrir Ouvidoria
              <ArrowRight className="w-3 h-3 text-[var(--accent)]" />
            </button>
          }
        >
          {dueReviews.length ? (
            <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto pr-1">
              {dueReviews.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 hover:border-[var(--accent)]/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setActivePage('Caderno de Erros')}
                    className="min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer group"
                    title="Abrir este apontamento na Ouvidoria (Erros)"
                  >
                    <div className="flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <strong className="text-[12.5px] font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                        {visibleName(item.materia)}
                      </strong>
                      <span className="text-[10.5px] text-[var(--muted)] shrink-0">
                        · {item.proxima_revisao ? `Nível ${item.nivel_revisao ?? 1}` : 'Pendente'}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)] truncate">
                      {item.texto}
                    </p>
                  </button>
                  {!item.correcao_prova && (
                    <button
                      type="button"
                      onClick={() => advanceErrorReview(item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/10 text-[var(--good)] text-[11px] font-bold hover:bg-[var(--good)] hover:text-white transition-colors shrink-0 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      Revisado
                    </button>
                  )}
                </div>
              ))}
              {dueReviews.length > 6 && (
                <div className="text-[11px] text-[var(--muted)] text-center pt-1">
                  +{dueReviews.length - 6} revisão(ões) na Ouvidoria (Erros)
                </div>
              )}
            </div>
          ) : (
            <div className="ce-notice ce-notice-good rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--good)] shrink-0" aria-hidden="true" />
              <span>Todas as revisões programadas para hoje estão em dia.</span>
            </div>
          )}
        </Panel>
      </div>

      {/* Progresso dos Editais */}
      {db.contests.length > 0 && (
        <Panel
          title="Execução dos Editais Cadastrados"
          subtitle="Percentual de tópicos estudados em cada concurso protocolado."
          className="mb-5"
          action={
            <button
              type="button"
              onClick={() => setActivePage('Editais')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              Abrir Editais
              <ArrowRight className="w-3 h-3 text-[var(--accent)]" />
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {db.contests.map((c) => {
              const pts = c.edital_pontos || [];
              const total = pts.length;
              const done = pts.filter((p) => p.estudado).length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col justify-between gap-2.5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-[13px] font-bold text-[var(--text)] line-clamp-1">
                        {c.concurso}
                      </strong>
                      <span className="font-mono-num text-[11.5px] font-extrabold text-[var(--accent)] shrink-0">
                        {total > 0 ? `${pct}%` : '—'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted)] mt-0.5 flex flex-wrap items-center gap-2">
                      {c.data_abertura && <span>Data: {c.data_abertura}</span>}
                      <span className="tabular-nums">
                        {total > 0 ? `${done} de ${total} pontos` : 'Edital ainda não vinculado'}
                      </span>
                    </div>
                  </div>

                  {total > 0 && (
                    <div className="h-1.5 rounded-full border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct === 100 ? 'var(--good)' : 'var(--accent)',
                        }}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => openContestEdital(c.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                  >
                    <ListChecks className="w-3.5 h-3.5 text-[var(--accent)]" />
                    {total > 0 ? 'Continuar edital' : 'Adicionar edital'}
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Carta de Serviços */}
      <div className="mb-2">
        <h3 className="m-0 mb-3 font-display text-[15px] font-extrabold text-[var(--text)]">
          Carta de Serviços ao Estudante
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_ACCESS.map((item) => (
            <button
              key={item.page}
              type="button"
              onClick={() => setActivePage(item.page)}
              className="group flex items-center gap-3.5 p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] text-left hover:border-[var(--accent)] transition-colors cursor-pointer"
            >
              <ModuleIcon name={item.icon} className="w-11 h-11 rounded-[10px] shrink-0" />
              <span className="min-w-0 flex-1">
                <strong className="block text-[13.5px] font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                  {getGovModuleLabel(item.page)}
                </strong>
                <small className="block text-[11.5px] text-[var(--muted)] mt-0.5 truncate">
                  {item.caption}
                </small>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--subtle)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
