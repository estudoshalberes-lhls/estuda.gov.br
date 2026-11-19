import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Bookmark,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileSpreadsheet,
  FileText,
  Filter,
  Search,
  Timer,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  WEEKDAYS,
  formatClock,
  inferFixedSubjectFromTopic,
  localDateIso,
  visibleName,
} from '../lib/parsers';
import { exportPerformanceReportPdf } from '../lib/pdfExport';
import {
  CsvDelimiter,
  PerformanceCsvDataset,
  exportPerformanceCsv,
} from '../lib/performanceCsv';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { ScheduleTopic, StudyTimeAllocation } from '../types/study';
import { ReceiptText } from 'lucide-react';
import {
  AnalyticalSubjectsD3Table,
  ConsistencyCalendarHeatmap,
  PerformanceEvolutionD3Chart,
  PriorityQuadrantD3Chart,
  SubjectAnalyticsDatum,
} from '../components/charts/PerformanceD3Panels';

type TimeRangePreset = 'today' | '7d' | '14d' | '30d' | 'all' | 'custom';

function formatIsoToBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export const PerformancePage: React.FC = () => {
  const { db, fixedSubjects, setActivePage, deleteStudyTimeRecord, requestConfirm, toast } =
    useStudy();

  const [subjectFilter, setSubjectFilter] = useState('Todas');
  const [historySearch, setHistorySearch] = useState('');

  // Filters for Study Time tracking by days, fixed subjects, and target contest
  const todayIso = localDateIso();
  const [timePreset, setTimePreset] = useState<TimeRangePreset>('14d');
  const [customStartDate, setCustomStartDate] = useState<string>(todayIso);
  const [customEndDate, setCustomEndDate] = useState<string>(todayIso);
  const [weekdayFilter, setWeekdayFilter] = useState<string>('Todos');
  const [timeSubjectFilter, setTimeSubjectFilter] = useState<string>('Todas');
  const [timeContestFilter, setTimeContestFilter] = useState<string>('Todos');

  // Lookup map of schedule topics by id to enrich legacy time allocations with fixed subject & contest
  const scheduleTopicById = useMemo(() => {
    const map = new Map<string, ScheduleTopic>();
    Object.values(db.weeklySchedules || {}).forEach((wk) => {
      WEEKDAYS.forEach((d) => {
        (wk.schedule?.[d] || []).forEach((t) => {
          if (t?.id) map.set(t.id, t);
        });
      });
    });
    WEEKDAYS.forEach((d) => {
      (db.schedule?.[d] || []).forEach((t) => {
        if (t?.id) map.set(t.id, t);
      });
    });
    return map;
  }, [db.schedule, db.weeklySchedules]);

  const resolveFixedSubjectForAllocation = useMemo(() => {
    return (alloc: StudyTimeAllocation): string => {
      const linked = alloc.topicId ? scheduleTopicById.get(alloc.topicId) : undefined;
      if (linked?.disciplina_fixa?.trim()) {
        return linked.disciplina_fixa.trim();
      }
      const rawSubj = (alloc.subject || linked?.materia || 'Geral').trim();
      const inferred = inferFixedSubjectFromTopic(
        {
          materia: rawSubj,
          disciplina_fixa: linked?.disciplina_fixa,
        },
        fixedSubjects,
      );
      return (inferred || rawSubj || 'Geral').trim();
    };
  }, [scheduleTopicById, fixedSubjects]);

  const resolveContestForAllocation = useMemo(() => {
    return (alloc: StudyTimeAllocation): string => {
      if (alloc.concursoAlvo?.trim()) return alloc.concursoAlvo.trim();
      const linked = alloc.topicId ? scheduleTopicById.get(alloc.topicId) : undefined;
      return (linked?.concurso_alvo || '').trim();
    };
  }, [scheduleTopicById]);

  // Export CSV popover state
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>(';');
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [exportMenuOpen]);

  const totalAnswered = db.history.length;
  const totalCorrect = db.history.filter((h) => h.correct).length;
  const totalWrong = totalAnswered - totalCorrect;
  const accuracy = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const completedSimulationsCount = db.completedSimulations.length;

  const totalStudySeconds = useMemo(() => {
    return db.studyTimeRecords.reduce(
      (sum, rec) => sum + rec.allocations.reduce((s, a) => s + a.seconds, 0),
      0,
    );
  }, [db.studyTimeRecords]);

  // 14-day history with correct vs wrong and completed simulations
  const dailySeries = useMemo(() => {
    const days: Array<{
      iso: string;
      label: string;
      answered: number;
      correct: number;
      wrong: number;
      simulations: number;
      studySeconds: number;
    }> = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = localDateIso(d);
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(
        2,
        '0',
      )}`;
      const fullBrDate = `${label}/${d.getFullYear()}`;
      const hist = db.history.filter((h) => h.date === iso);
      const correct = hist.filter((h) => h.correct).length;
      const wrong = hist.length - correct;
      const sims = db.completedSimulations.filter(
        (s) => s.criado_em?.slice(0, 10) === iso || (s.data || '').startsWith(fullBrDate),
      ).length;
      const sec = db.studyTimeRecords
        .filter((r) => r.date === iso)
        .reduce((sum, r) => sum + r.allocations.reduce((s, a) => s + a.seconds, 0), 0);
      days.push({
        iso,
        label,
        answered: hist.length,
        correct,
        wrong,
        simulations: sims,
        studySeconds: sec,
      });
    }
    return days;
  }, [db.history, db.completedSimulations, db.studyTimeRecords]);

  const maxDailyAnswered = Math.max(1, ...dailySeries.map((d) => d.answered));

  const allSubjects = useMemo(() => {
    const set = new Set<string>(fixedSubjects);
    db.history.forEach((h) => {
      if (h.subject) {
        const fixed = inferFixedSubjectFromTopic({ materia: h.subject }, fixedSubjects) || h.subject;
        set.add(fixed);
      }
    });
    db.studyTimeRecords.forEach((rec) => {
      rec.allocations.forEach((a) => {
        const fixed = resolveFixedSubjectForAllocation(a);
        if (fixed) set.add(fixed);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [db.history, db.studyTimeRecords, fixedSubjects, resolveFixedSubjectForAllocation]);

  const allContests = useMemo(() => {
    const set = new Set<string>();
    (db.contests || []).forEach((c) => {
      if (c.concurso?.trim()) set.add(c.concurso.trim());
    });
    WEEKDAYS.forEach((d) => {
      (db.schedule?.[d] || []).forEach((t) => {
        if (t.concurso_alvo?.trim()) set.add(t.concurso_alvo.trim());
      });
    });
    db.studyTimeRecords.forEach((rec) => {
      rec.allocations.forEach((a) => {
        const contest = resolveContestForAllocation(a);
        if (contest) set.add(contest);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [db.contests, db.schedule, db.studyTimeRecords, resolveContestForAllocation]);

  const subjectRows = useMemo(() => {
    const map = new Map<
      string,
      { subject: string; answered: number; correct: number; studySeconds: number }
    >();
    db.history.forEach((h) => {
      const rawKey = h.subject || 'Geral';
      const key = inferFixedSubjectFromTopic({ materia: rawKey }, fixedSubjects) || rawKey;
      const cur = map.get(key) || { subject: key, answered: 0, correct: 0, studySeconds: 0 };
      cur.answered += 1;
      if (h.correct) cur.correct += 1;
      map.set(key, cur);
    });
    db.studyTimeRecords.forEach((rec) => {
      rec.allocations.forEach((a) => {
        const key = resolveFixedSubjectForAllocation(a);
        const cur = map.get(key) || { subject: key, answered: 0, correct: 0, studySeconds: 0 };
        cur.studySeconds += a.seconds;
        map.set(key, cur);
      });
    });
    return [...map.values()]
      .filter((row) => subjectFilter === 'Todas' || row.subject === subjectFilter)
      .filter((row) => !historySearch.trim() || row.subject.toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => b.studySeconds - a.studySeconds || b.answered - a.answered);
  }, [
    db.history,
    db.studyTimeRecords,
    subjectFilter,
    historySearch,
    fixedSubjects,
    resolveFixedSubjectForAllocation,
  ]);

  const subjectAnalyticsRows = useMemo<SubjectAnalyticsDatum[]>(() => {
    const map = new Map<
      string,
      {
        subject: string;
        answered: number;
        correct: number;
        studySeconds: number;
        byDate: Map<string, { answered: number; correct: number }>;
      }
    >();

    const ensure = (key: string) => {
      const existing = map.get(key);
      if (existing) return existing;
      const created = {
        subject: key,
        answered: 0,
        correct: 0,
        studySeconds: 0,
        byDate: new Map<string, { answered: number; correct: number }>(),
      };
      map.set(key, created);
      return created;
    };

    db.history.forEach((h) => {
      const rawKey = h.subject || 'Geral';
      const key = inferFixedSubjectFromTopic({ materia: rawKey }, fixedSubjects) || rawKey;
      const cur = ensure(key);
      cur.answered += 1;
      if (h.correct) cur.correct += 1;
      if (h.date) {
        const day = cur.byDate.get(h.date) || { answered: 0, correct: 0 };
        day.answered += 1;
        if (h.correct) day.correct += 1;
        cur.byDate.set(h.date, day);
      }
    });

    db.studyTimeRecords.forEach((rec) => {
      rec.allocations.forEach((a) => {
        const key = resolveFixedSubjectForAllocation(a);
        const cur = ensure(key);
        cur.studySeconds += a.seconds;
      });
    });

    return [...map.values()].map((item) => {
      const orderedDays = [...item.byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([iso, vals]) => ({
          iso,
          answered: vals.answered,
          accuracyPct: Math.round((vals.correct / Math.max(1, vals.answered)) * 100),
        }));

      let trendDelta: number | null = null;
      if (orderedDays.length >= 2) {
        const split = Math.max(1, Math.floor(orderedDays.length / 2));
        const firstHalf = orderedDays.slice(0, split);
        const secondHalf = orderedDays.slice(split);
        const firstAvg =
          firstHalf.reduce((s, d) => s + d.accuracyPct, 0) / firstHalf.length;
        const secondAvg =
          secondHalf.reduce((s, d) => s + d.accuracyPct, 0) / secondHalf.length;
        trendDelta = Math.round(secondAvg - firstAvg);
      }

      return {
        subject: item.subject,
        answered: item.answered,
        correct: item.correct,
        wrong: item.answered - item.correct,
        accuracyPct:
          item.answered > 0 ? Math.round((item.correct / item.answered) * 100) : null,
        studySeconds: item.studySeconds,
        sparkline: orderedDays,
        trendDelta,
      };
    });
  }, [db.history, db.studyTimeRecords, fixedSubjects, resolveFixedSubjectForAllocation]);

  // Compute effective date bounds for Study Time filter
  const { rangeStartIso, rangeEndIso } = useMemo(() => {
    if (timePreset === 'all') return { rangeStartIso: '', rangeEndIso: '' };
    if (timePreset === 'custom') {
      return { rangeStartIso: customStartDate, rangeEndIso: customEndDate };
    }
    const end = new Date();
    const start = new Date();
    const daysBack =
      timePreset === 'today' ? 0 : timePreset === '7d' ? 6 : timePreset === '14d' ? 13 : 29;
    start.setDate(end.getDate() - daysBack);
    return { rangeStartIso: localDateIso(start), rangeEndIso: localDateIso(end) };
  }, [timePreset, customStartDate, customEndDate]);

  const filteredStudyRecords = useMemo(() => {
    return db.studyTimeRecords
      .filter((rec) => {
        if (rangeStartIso && rec.date < rangeStartIso) return false;
        if (rangeEndIso && rec.date > rangeEndIso) return false;
        if (weekdayFilter !== 'Todos' && rec.day !== weekdayFilter) return false;
        return true;
      })
      .map((rec) => {
        const enrichedAllocs = rec.allocations.map((a) => {
          const fixedSubject = resolveFixedSubjectForAllocation(a);
          const contest = resolveContestForAllocation(a);
          const specificTopic =
            a.topicLabel ||
            (a.subject && a.subject.toLowerCase() !== fixedSubject.toLowerCase()
              ? a.subject
              : '');
          return {
            ...a,
            subject: fixedSubject,
            topicLabel: specificTopic || a.topicLabel,
            concursoAlvo: contest || a.concursoAlvo,
          };
        });

        const scopedAllocs = enrichedAllocs.filter((a) => {
          if (timeSubjectFilter !== 'Todas' && a.subject !== timeSubjectFilter) return false;
          if (
            timeContestFilter !== 'Todos' &&
            (a.concursoAlvo || '').toUpperCase() !== timeContestFilter.toUpperCase()
          ) {
            return false;
          }
          return true;
        });

        const seconds = scopedAllocs.reduce((sum, a) => sum + a.seconds, 0);
        return { ...rec, allocations: scopedAllocs, seconds };
      })
      .filter((rec) => rec.seconds > 0)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.recordedAt || '').localeCompare(a.recordedAt || ''));
  }, [
    db.studyTimeRecords,
    rangeStartIso,
    rangeEndIso,
    weekdayFilter,
    timeSubjectFilter,
    timeContestFilter,
    resolveFixedSubjectForAllocation,
    resolveContestForAllocation,
  ]);

  const filteredStudyStats = useMemo(() => {
    const totalSec = filteredStudyRecords.reduce((s, r) => s + r.seconds, 0);
    const byDateMap = new Map<
      string,
      {
        date: string;
        day: string;
        seconds: number;
        subjects: Record<string, number>;
      }
    >();
    const bySubjectMap = new Map<
      string,
      {
        subject: string;
        seconds: number;
        sessions: number;
        topics: Set<string>;
        contests: Set<string>;
      }
    >();

    filteredStudyRecords.forEach((rec) => {
      const cur = byDateMap.get(rec.date) || {
        date: rec.date,
        day: rec.day,
        seconds: 0,
        subjects: {},
      };
      cur.seconds += rec.seconds;
      rec.allocations.forEach((a) => {
        cur.subjects[a.subject] = (cur.subjects[a.subject] || 0) + a.seconds;

        const subjEntry = bySubjectMap.get(a.subject) || {
          subject: a.subject,
          seconds: 0,
          sessions: 0,
          topics: new Set<string>(),
          contests: new Set<string>(),
        };
        subjEntry.seconds += a.seconds;
        subjEntry.sessions += 1;
        if (a.topicLabel?.trim()) subjEntry.topics.add(a.topicLabel.trim());
        if (a.concursoAlvo?.trim()) subjEntry.contests.add(a.concursoAlvo.trim());
        bySubjectMap.set(a.subject, subjEntry);
      });
      byDateMap.set(rec.date, cur);
    });

    const byDate = [...byDateMap.values()].sort((a, b) => b.date.localeCompare(a.date));
    const bySubject = [...bySubjectMap.values()]
      .map((item) => ({
        subject: item.subject,
        seconds: item.seconds,
        sessions: item.sessions,
        topics: Array.from(item.topics),
        contests: Array.from(item.contests),
        sharePct: totalSec > 0 ? Math.round((item.seconds / totalSec) * 100) : 0,
      }))
      .sort((a, b) => b.seconds - a.seconds);

    const maxDaySec = Math.max(1, ...byDate.map((d) => d.seconds));
    const maxSubjectSec = Math.max(1, ...bySubject.map((s) => s.seconds));
    const activeDays = byDate.length;
    const avgSec = activeDays ? Math.round(totalSec / activeDays) : 0;
    return {
      totalSec,
      activeDays,
      avgSec,
      sessionsCount: filteredStudyRecords.length,
      byDate,
      bySubject,
      maxDaySec,
      maxSubjectSec,
    };
  }, [filteredStudyRecords]);

  const bankRows = useMemo(() => {
    const map = new Map<
      string,
      { bank: string; simulations: number; totalQuestions: number; correct: number; wrong: number }
    >();
    db.completedSimulations.forEach((sim) => {
      const bank = sim.banca?.trim() || 'Geral / Não informada';
      const cur = map.get(bank) || {
        bank,
        simulations: 0,
        totalQuestions: 0,
        correct: 0,
        wrong: 0,
      };
      cur.simulations += 1;
      cur.totalQuestions += sim.total || sim.acertos + sim.erros;
      cur.correct += sim.acertos;
      cur.wrong += sim.erros;
      map.set(bank, cur);
    });
    return [...map.values()]
      .map((item) => ({
        ...item,
        accuracy: item.totalQuestions
          ? Math.round((item.correct / item.totalQuestions) * 100)
          : 0,
      }))
      .sort((a, b) => b.simulations - a.simulations);
  }, [db.completedSimulations]);

  const currentYear = String(new Date().getFullYear());

  const irpfSummary = useMemo(() => {
    let yearSeconds = 0;
    const yearDaysSet = new Set<string>();
    const subjectSecondsMap = new Map<string, number>();

    db.studyTimeRecords.forEach((rec) => {
      const isYear = rec.date.startsWith(currentYear);
      if (isYear) yearDaysSet.add(rec.date);
      rec.allocations.forEach((alloc) => {
        const sec = alloc.seconds || 0;
        if (isYear) yearSeconds += sec;
        const fixed = visibleName(resolveFixedSubjectForAllocation(alloc));
        subjectSecondsMap.set(fixed, (subjectSecondsMap.get(fixed) || 0) + sec);
      });
    });

    const topSubjectEntry = [...subjectSecondsMap.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const netHitsBalance = totalCorrect - totalWrong;
    const malhaFina = accuracy > 0 && accuracy < 60;

    return {
      yearSeconds,
      yearActiveDays: yearDaysSet.size,
      topSubject: topSubjectEntry ? topSubjectEntry[0] : 'Nenhuma registrada',
      topSubjectSeconds: topSubjectEntry ? topSubjectEntry[1] : 0,
      netHitsBalance,
      malhaFina,
      avgMinutesPerYearDay: yearDaysSet.size ? Math.round(yearSeconds / 60 / yearDaysSet.size) : 0,
    };
  }, [db.studyTimeRecords, currentYear, resolveFixedSubjectForAllocation, accuracy]);

  const periodLabel = useMemo(() => {
    if (timePreset === 'today') return 'Hoje';
    if (timePreset === '7d') return 'Últimos 7 dias';
    if (timePreset === '14d') return 'Últimos 14 dias';
    if (timePreset === '30d') return 'Últimos 30 dias';
    if (timePreset === 'all') return 'Todo o histórico';
    return `${formatIsoToBr(customStartDate)} a ${formatIsoToBr(customEndDate)}`;
  }, [timePreset, customStartDate, customEndDate]);

  const handleExportPdf = () => {
    try {
      const filterDescParts = [
        `Período tempo: ${periodLabel}`,
        `Dia: ${weekdayFilter}`,
        `Matéria Fixa: ${timeSubjectFilter === 'Todas' ? 'Todas' : visibleName(timeSubjectFilter)}`,
      ];
      if (timeContestFilter !== 'Todos') {
        filterDescParts.push(`Concurso: ${timeContestFilter}`);
      }
      if (subjectFilter !== 'Todas') {
        filterDescParts.push(`Disciplina desempenho: ${visibleName(subjectFilter)}`);
      }
      if (historySearch.trim()) {
        filterDescParts.push(`Busca: "${historySearch.trim()}"`);
      }

      exportPerformanceReportPdf({
        totalAnswered,
        totalCorrect,
        totalWrong,
        accuracy,
        totalStudyFormatted: formatClock(totalStudySeconds),
        completedSimulationsCount,
        subjectRows,
        bankRows,
        recentSimulations: db.completedSimulations,
        formatDuration: formatClock,
        filterDescription: filterDescParts.join(' · '),
        filteredStudySummary: {
          totalFormatted: formatClock(filteredStudyStats.totalSec),
          avgFormatted: formatClock(filteredStudyStats.avgSec),
          activeDays: filteredStudyStats.activeDays,
          sessionsCount: filteredStudyStats.sessionsCount,
        },
        filteredStudyByDate: filteredStudyStats.byDate,
        dailySeries,
      });
      toast('Relatório de desempenho em PDF gerado.');
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const handleExportCsv = (dataset: PerformanceCsvDataset) => {
    try {
      const result = exportPerformanceCsv(
        {
          totalAnswered,
          totalCorrect,
          totalWrong,
          accuracy,
          totalStudySeconds,
          completedSimulationsCount,
          filters: {
            periodLabel,
            weekdayFilter,
            timeSubjectFilter,
            subjectFilter,
            subjectSearch: historySearch.trim(),
          },
          filteredStudyTotalSeconds: filteredStudyStats.totalSec,
          filteredStudyActiveDays: filteredStudyStats.activeDays,
          filteredStudyAvgSeconds: filteredStudyStats.avgSec,
          filteredStudyByDate: filteredStudyStats.byDate,
          filteredStudySessions: filteredStudyRecords,
          dailySeries,
          subjectRows,
          bankRows,
          completedSimulations: db.completedSimulations,
        },
        dataset,
        csvDelimiter,
      );
      setExportMenuOpen(false);
      toast(`Arquivo CSV exportado: ${result.filename}`);
    } catch (err) {
      toast((err as Error).message || 'Falha ao exportar arquivo CSV.', true);
    }
  };

  const handleDeleteRecord = async (quizId: string) => {
    const ok = await requestConfirm({
      title: 'Excluir registro de tempo?',
      description: 'Este bloco de tempo estudado será removido das estatísticas e do tópico vinculado no cronograma.',
      confirmLabel: 'Remover registro',
      danger: true,
    });
    if (!ok) return;
    deleteStudyTimeRecord(quizId);
  };

  return (
    <div>
      <PageHeader
        eyebrow="PORTAL DA TRANSPARÊNCIA · DESEMPENHO"
        title="Evolução e horas de estudo por Matéria Fixa"
        description="Preste contas do tempo registrado no Ponto Eletrônico nas Matérias Fixadas do Cronograma, filtre por Edital/Concurso alvo e monitore sua precisão por disciplina e banca."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setExportMenuOpen((prev) => !prev)}
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] whitespace-nowrap transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--good)]" />
                Exportar CSV
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${
                    exportMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {exportMenuOpen && (
                <div
                  role="menu"
                  aria-label="Opções de exportação CSV"
                  className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 z-30 w-72 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-2 shadow-xl"
                >
                  <div className="px-2 py-1.5 border-b border-[var(--line)] mb-1.5">
                    <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                      Separador do CSV
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]">
                      <button
                        type="button"
                        onClick={() => setCsvDelimiter(';')}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${
                          csvDelimiter === ';'
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        Excel BR (;)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCsvDelimiter(',')}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${
                          csvDelimiter === ','
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        Sheets / BI (,)
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {(
                      [
                        {
                          id: 'complete',
                          title: 'Relatório completo (.csv)',
                          desc: 'Resumo, disciplinas, bancas, 14 dias e sessões',
                        },
                        {
                          id: 'subjects',
                          title: 'Desempenho por disciplina (.csv)',
                          desc: `${subjectRows.length} matéria(s) conforme filtro atual`,
                        },
                        {
                          id: 'study_sessions',
                          title: 'Sessões de tempo filtradas (.csv)',
                          desc: `${filteredStudyRecords.length} sessão(ões) do período`,
                        },
                        {
                          id: 'daily_evolution',
                          title: 'Evolução últimos 14 dias (.csv)',
                          desc: 'Acertos, erros, simulados e horas por dia',
                        },
                        {
                          id: 'simulations',
                          title: 'Simulados concluídos (.csv)',
                          desc: `${db.completedSimulations.length} simulado(s) e notas por banca`,
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleExportCsv(opt.id)}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--panel-soft)] transition-colors"
                      >
                        <div className="text-[12px] font-bold text-[var(--text)]">{opt.title}</div>
                        <div className="text-[10.5px] text-[var(--muted)]">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap shadow-xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Exportar PDF
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Questões respondidas</div>
          <div className="font-mono-num text-[27px] font-extrabold text-[var(--text)] mt-1">
            {totalAnswered.toLocaleString('pt-BR')}
          </div>
          <div className="text-[11.5px] text-[var(--subtle)] mt-1 tabular-nums">
            {totalCorrect} acertos · {totalWrong} erros
          </div>
        </article>

        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Aproveitamento geral</div>
          <div className="font-mono-num text-[27px] font-extrabold text-[var(--good)] mt-1">
            {accuracy}%
          </div>
          <div className="text-[11.5px] text-[var(--subtle)] mt-1">Média ponderada do histórico</div>
        </article>

        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Simulados concluídos</div>
          <div className="font-mono-num text-[27px] font-extrabold text-[var(--accent)] mt-1">
            {completedSimulationsCount}
          </div>
          <div className="text-[11.5px] text-[var(--subtle)] mt-1">
            <button
              type="button"
              onClick={() => setActivePage('Simulados Realizados')}
              className="text-[var(--accent)] hover:underline cursor-pointer"
            >
              Ver Boletim de Ocorrências →
            </button>
          </div>
        </article>

        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Tempo total estudado</div>
          <div className="font-mono-num text-[27px] font-extrabold text-[var(--text)] mt-1">
            {formatClock(totalStudySeconds)}
          </div>
          <div className="text-[11.5px] text-[var(--subtle)] mt-1">
            Consolidado por Matérias Fixas
          </div>
        </article>
      </div>

      {/* Painel Analítico Interativo com D3.js */}
      <PerformanceEvolutionD3Chart
        db={db}
        subjectFilter={subjectFilter}
        fixedSubjects={fixedSubjects}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 mb-4">
        <ConsistencyCalendarHeatmap db={db} />
        <PriorityQuadrantD3Chart
          rows={subjectAnalyticsRows}
          selectedSubject={subjectFilter}
          onSelectSubject={setSubjectFilter}
        />
      </div>

      <AnalyticalSubjectsD3Table
        rows={subjectAnalyticsRows}
        selectedSubject={subjectFilter}
        onSelectSubject={setSubjectFilter}
      />

      {/* Extrato Anual IRPF do Concurseiro */}
      <Panel
        title={`Declaração Anual de Horas Liquidamente Estudadas (IRPF ${currentYear} do Concurseiro)`}
        subtitle="Demonstrativo consolidado de horas tributáveis no Ponto Eletrônico, matéria campeã e saldo líquido de questões."
        className="mb-4"
        action={
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ${
              irpfSummary.malhaFina
                ? 'border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]'
                : 'border-[var(--good)]/40 bg-[var(--good)]/10 text-[var(--good)]'
            }`}
          >
            <ReceiptText className="w-3.5 h-3.5" aria-hidden="true" />
            {irpfSummary.malhaFina
              ? 'Malha Fina · Reforçar Ouvidoria'
              : 'Regular · Apto à Restituição em Posse'}
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              Base Tributável ({currentYear})
            </div>
            <div className="font-mono-num text-[20px] font-extrabold text-[var(--text)] mt-1">
              {formatClock(irpfSummary.yearSeconds)}
            </div>
            <div className="text-[11px] text-[var(--subtle)] mt-0.5 tabular-nums">
              {irpfSummary.yearActiveDays} dia(s) ativo(s) · média {irpfSummary.avgMinutesPerYearDay} min/dia
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              Maior Investimento (Matéria)
            </div>
            <div className="text-[15px] font-extrabold text-[var(--accent)] truncate mt-1" title={irpfSummary.topSubject}>
              {irpfSummary.topSubject}
            </div>
            <div className="text-[11px] text-[var(--subtle)] mt-0.5 font-mono-num">
              {irpfSummary.topSubjectSeconds > 0
                ? `${formatClock(irpfSummary.topSubjectSeconds)} acumulados`
                : 'Sem horas registradas'}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              Saldo Líquido (Acertos - Erros)
            </div>
            <div
              className={`font-mono-num text-[20px] font-extrabold mt-1 ${
                irpfSummary.netHitsBalance >= 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'
              }`}
            >
              {irpfSummary.netHitsBalance >= 0 ? `+${irpfSummary.netHitsBalance}` : irpfSummary.netHitsBalance} pts
            </div>
            <div className="text-[11px] text-[var(--subtle)] mt-0.5 tabular-nums">
              {totalCorrect} acertos contra {totalWrong} erros
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
              Bens &amp; Metas Declarados
            </div>
            <div className="font-mono-num text-[20px] font-extrabold text-[var(--text)] mt-1">
              {db.completedGoals.length} metas
            </div>
            <div className="text-[11px] text-[var(--subtle)] mt-0.5 tabular-nums">
              {completedSimulationsCount} simulado(s) no Boletim de Ocorrências
            </div>
          </div>
        </div>
      </Panel>

      {/* Painel completo de Tempo Estudado por Matéria Fixa, Concurso e Datas */}
      <Panel
        title="Tempo Estudado por Matérias Fixas, Edital/Concurso e Datas"
        subtitle="Verifique exatamente quanto tempo foi lançado em cada Matéria Fixa (ex.: Direito Constitucional) e para qual Concurso/Edital."
        className="mb-4"
        action={
          <button
            type="button"
            onClick={() => setActivePage('Cronograma')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
          >
            <Timer className="w-3.5 h-3.5 text-[var(--accent)]" />
            Abrir Cronograma
          </button>
        }
      >
        <div className="flex flex-wrap items-end gap-2.5 mb-4 pb-3 border-b border-[var(--line)]">
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--muted)] mb-1">
              Período rápido
            </label>
            <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
              {(
                [
                  { id: 'today', label: 'Hoje' },
                  { id: '7d', label: '7 dias' },
                  { id: '14d', label: '14 dias' },
                  { id: '30d', label: '30 dias' },
                  { id: 'all', label: 'Tudo' },
                  { id: 'custom', label: 'Datas' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTimePreset(item.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-colors ${
                    timePreset === item.id
                      ? 'bg-[var(--accent)] text-white shadow-xs'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {timePreset === 'custom' && (
            <>
              <div>
                <label className="block text-[10.5px] font-bold text-[var(--muted)] mb-1">
                  Data inicial
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="ce-input font-mono-num text-[12px] h-[36px] py-1"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold text-[var(--muted)] mb-1">
                  Data final
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="ce-input font-mono-num text-[12px] h-[36px] py-1"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[10.5px] font-bold text-[var(--muted)] mb-1">
              Dia da semana
            </label>
            <select
              aria-label="Filtrar tempo por dia da semana"
              value={weekdayFilter}
              onChange={(e) => setWeekdayFilter(e.target.value)}
              className="ce-select w-auto text-[12px] h-[36px] py-1"
            >
              <option value="Todos">Todos os dias</option>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10.5px] font-bold text-[var(--muted)] mb-1">
              Matéria Fixa
            </label>
            <select
              aria-label="Filtrar tempo por Matéria Fixa"
              value={timeSubjectFilter}
              onChange={(e) => setTimeSubjectFilter(e.target.value)}
              className="ce-select w-auto text-[12px] h-[36px] py-1 font-bold"
            >
              <option value="Todas">Todas as Matérias Fixas</option>
              {allSubjects.map((s) => (
                <option key={s} value={s}>
                  MATÉRIA: {visibleName(s).toUpperCase()}.
                </option>
              ))}
            </select>
          </div>

          {allContests.length > 0 && (
            <div>
              <label className="block text-[10.5px] font-bold text-[var(--muted)] mb-1">
                Edital / Concurso Alvo
              </label>
              <select
                aria-label="Filtrar tempo por Concurso ou Edital"
                value={timeContestFilter}
                onChange={(e) => setTimeContestFilter(e.target.value)}
                className="ce-select w-auto text-[12px] h-[36px] py-1 font-bold"
              >
                <option value="Todos">Todos os Editais / Concursos</option>
                {allContests.map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Resumo do período filtrado */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
              TOTAL NO FILTRO
            </span>
            <strong className="block mt-1 font-mono-num text-[20px] font-extrabold text-[var(--text)]">
              {formatClock(filteredStudyStats.totalSec)}
            </strong>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              MÉDIA / DIA ATIVO
            </span>
            <strong className="block mt-1 font-mono-num text-[20px] font-extrabold text-[var(--text)]">
              {formatClock(filteredStudyStats.avgSec)}
            </strong>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              MATÉRIAS COM TEMPO
            </span>
            <strong className="block mt-1 font-mono-num text-[20px] font-extrabold text-[var(--text)]">
              {filteredStudyStats.bySubject.length}
            </strong>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              SESSÕES CONTABILIZADAS
            </span>
            <strong className="block mt-1 font-mono-num text-[20px] font-extrabold text-[var(--text)]">
              {filteredStudyStats.sessionsCount}
            </strong>
          </div>
        </div>

        {/* Painel consolidado de Tempo por Matéria Fixa */}
        {filteredStudyStats.bySubject.length > 0 && (
          <div className="mb-4 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <h4 className="m-0 text-[12px] font-extrabold uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-[var(--accent)]" />
                Tempo consolidado por Matéria Fixa ({filteredStudyStats.bySubject.length})
              </h4>
              {timeSubjectFilter !== 'Todas' && (
                <button
                  type="button"
                  onClick={() => setTimeSubjectFilter('Todas')}
                  className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  Mostrar todas as matérias
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredStudyStats.bySubject.map((item) => {
                const isSelected = timeSubjectFilter === item.subject;
                const barPct = Math.max(
                  6,
                  Math.round((item.seconds / filteredStudyStats.maxSubjectSec) * 100),
                );
                return (
                  <button
                    key={item.subject}
                    type="button"
                    onClick={() =>
                      setTimeSubjectFilter((prev) => (prev === item.subject ? 'Todas' : item.subject))
                    }
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] text-[10.5px] font-bold text-[var(--text)] truncate">
                        MATÉRIA: {visibleName(item.subject).toUpperCase().replace(/\.+$/, '')}.
                      </span>
                      <strong className="font-mono-num text-[13.5px] font-extrabold text-[var(--good)] shrink-0">
                        {formatClock(item.seconds)}
                      </strong>
                    </div>

                    <div className="h-2 rounded-full border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden my-1.5">
                      <div
                        className="h-full bg-[var(--accent)] transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10.5px] text-[var(--muted)]">
                      <span>
                        {item.sessions} {item.sessions === 1 ? 'sessão' : 'sessões'} ({item.sharePct}%)
                      </span>
                      {item.contests.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded border border-[var(--good)]/40 bg-[var(--good)]/10 text-[10px] font-extrabold text-[var(--good)]">
                          <Briefcase className="w-2.5 h-2.5" />
                          {item.contests.join(' · ').toUpperCase()}
                        </span>
                      )}
                    </div>

                    {item.topics.length > 0 && (
                      <div className="mt-1.5 text-[10.5px] text-[var(--muted)] truncate">
                        Assuntos: <span className="text-[var(--text)] font-semibold">{item.topics.join(' · ')}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filteredStudyStats.byDate.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Agrupamento por Dia/Data */}
            <div>
              <h4 className="m-0 mb-2.5 text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-[var(--accent)]" />
                Total estudado por data
              </h4>
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {filteredStudyStats.byDate.map((dayRow) => {
                  const widthPct = Math.max(
                    6,
                    Math.round((dayRow.seconds / filteredStudyStats.maxDaySec) * 100),
                  );
                  return (
                    <div
                      key={dayRow.date}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5"
                    >
                      <div className="flex items-center justify-between text-[12px] mb-1">
                        <strong className="text-[var(--text)] font-mono-num">
                          {formatIsoToBr(dayRow.date)} ·{' '}
                          <span className="font-sans font-semibold text-[var(--muted)]">
                            {dayRow.day}
                          </span>
                        </strong>
                        <span className="font-mono-num font-extrabold text-[var(--accent)]">
                          {formatClock(dayRow.seconds)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full border border-[var(--line)] bg-[var(--panel)] overflow-hidden mb-1.5">
                        <div
                          className="h-full bg-[var(--accent)] transition-all"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(dayRow.subjects).map(([subj, sec]) => (
                          <span
                            key={subj}
                            className="px-2 py-0.5 rounded border border-[var(--line)] bg-[var(--panel)] text-[10.5px] font-semibold text-[var(--text)]"
                          >
                            MATÉRIA: {visibleName(subj).toUpperCase()}.{' '}
                            <span className="font-mono-num text-[var(--accent)] font-bold">{formatClock(sec)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sessões detalhadas */}
            <div>
              <h4 className="m-0 mb-2.5 text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                Sessões detalhadas ({filteredStudyRecords.length})
              </h4>
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {filteredStudyRecords.map((rec) => (
                  <div
                    key={rec.quizId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5 text-[12px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="font-mono-num font-bold text-[var(--text)]">
                          {formatIsoToBr(rec.date)}
                        </span>
                        <span className="text-[11px] text-[var(--muted)]">({rec.day})</span>
                        <span
                          className={`px-1.5 py-0.2 rounded border text-[10px] font-bold ${
                            rec.source === 'schedule'
                              ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
                              : 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]'
                          }`}
                        >
                          {rec.source === 'schedule' ? 'Cronograma' : 'Treino / Simulado'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        {rec.allocations.map((a, i) => (
                          <div key={`${rec.quizId}-${i}`} className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded border border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[10px] font-extrabold text-[var(--accent)]">
                              MATÉRIA: {visibleName(a.subject).toUpperCase().replace(/\.+$/, '')}.
                            </span>
                            {a.concursoAlvo && (
                              <span className="px-2 py-0.5 rounded border border-[var(--good)]/45 bg-[var(--good)]/12 text-[10px] font-extrabold text-[var(--good)]">
                                {a.concursoAlvo.toUpperCase()}
                              </span>
                            )}
                            {a.topicLabel && (
                              <span className="text-[11.5px] font-semibold text-[var(--text)] truncate">
                                Assunto: {visibleName(a.topicLabel)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <strong className="font-mono-num text-[13px] font-extrabold text-[var(--good)]">
                        {formatClock(rec.seconds)}
                      </strong>
                      <button
                        type="button"
                        onClick={() => void handleDeleteRecord(rec.quizId)}
                        title="Remover registro de tempo"
                        aria-label="Remover registro de tempo"
                        className="grid place-items-center w-7 h-7 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)] transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState message="Nenhum tempo estudado registrado para o filtro selecionado. Inicie o cronômetro ou vincule um tópico com Matéria Fixa no Cronograma." />
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-4">
        {/* 14-day history with correct vs wrong comparison and simulations count */}
        <Panel
          title="Histórico de 14 dias: Acertos vs. Erros"
          subtitle="Distribuição diária de acertos (verde) e erros (vermelho), simulados e horas."
        >
          <div className="flex flex-col gap-2.5">
            {dailySeries.map((day) => {
              const total = Math.max(1, day.answered);
              const correctPct = Math.round((day.correct / total) * 100);
              const wrongPct = 100 - correctPct;
              const barWidthPct = Math.max(8, Math.round((day.answered / maxDailyAnswered) * 100));

              return (
                <div
                  key={day.iso}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between text-[11.5px] mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-bold text-[var(--text)]">{day.label}</span>
                      {day.simulations > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">
                          <Award className="w-2.5 h-2.5" />
                          {day.simulations} simulado(s)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 font-mono-num text-[11px]">
                      <span className="text-[var(--good)] flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> {day.correct}
                      </span>
                      <span className="text-[var(--bad)] flex items-center gap-0.5">
                        <XCircle className="w-3 h-3" /> {day.wrong}
                      </span>
                      <span className="text-[var(--muted)] flex items-center gap-0.5 ml-1">
                        <Clock className="w-3 h-3" /> {day.studySeconds ? formatClock(day.studySeconds) : '00:00:00'}
                      </span>
                    </div>
                  </div>

                  {day.answered > 0 ? (
                    <div className="w-full flex items-center gap-2">
                      <div
                        className="h-2 rounded-full overflow-hidden flex border border-[var(--line)] bg-[var(--panel)]"
                        style={{ width: `${barWidthPct}%` }}
                      >
                        <div
                          className="bg-[var(--good)] h-full transition-all"
                          style={{ width: `${correctPct}%` }}
                          title={`${day.correct} acerto(s)`}
                        />
                        <div
                          className="bg-[var(--bad)] h-full transition-all"
                          style={{ width: `${wrongPct}%` }}
                          title={`${day.wrong} erro(s)`}
                        />
                      </div>
                      <span className="text-[10px] font-mono-num text-[var(--muted)]">
                        {Math.round((day.correct / day.answered) * 100)}%
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[var(--subtle)] italic">
                      {day.studySeconds > 0
                        ? `Estudou ${formatClock(day.studySeconds)} neste dia`
                        : 'Sem questões resolvidas neste dia'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Desempenho por disciplina with search and filter */}
        <Panel
          title="Desempenho e Tempo por Matéria"
          subtitle="Taxa de precisão em questões e tempo total alocado por Matéria Fixa."
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Filtrar matéria..."
                className="ce-input pl-8 text-[12px] h-[34px]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[var(--muted)]" />
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="ce-select w-auto text-[12px] h-[34px] py-1"
                aria-label="Filtrar por matéria"
              >
                <option value="Todas">Todas as matérias</option>
                {allSubjects.map((s) => (
                  <option key={s} value={s}>
                    {visibleName(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {subjectRows.length ? (
            <div className="flex flex-col gap-2.5 max-h-[520px] overflow-y-auto pr-1">
              {subjectRows.map((row) => {
                const pct = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
                return (
                  <div key={row.subject} className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                    <div className="flex items-center justify-between gap-2 text-[12.5px] mb-1.5">
                      <strong className="text-[var(--text)] truncate">
                        MATÉRIA: {visibleName(row.subject).toUpperCase().replace(/\.+$/, '')}.
                      </strong>
                      <span className="font-mono-num text-[var(--text)] font-bold shrink-0">
                        {row.answered ? `${pct}%` : formatClock(row.studySeconds)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full border border-[var(--line)] bg-[var(--panel)] overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-[var(--good)]"
                        style={{ width: `${row.answered ? pct : Math.min(100, Math.round((row.studySeconds / Math.max(1, totalStudySeconds)) * 100))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--muted)] tabular-nums">
                      <span>
                        {row.correct} acertos / {row.answered - row.correct} erros ({row.answered} total)
                      </span>
                      <span className="font-mono-num font-bold text-[var(--accent)]">
                        Tempo na matéria: {formatClock(row.studySeconds)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="Nenhuma disciplina encontrada para os filtros aplicados." />
          )}
        </Panel>
      </div>

      <Panel
        title="Aproveitamento por Banca Examinadora"
        subtitle="Desempenho consolidado nos simulados fechados separados pela banca selecionada."
      >
        {bankRows.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bankRows.map((b) => (
              <div
                key={b.bank}
                className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <strong className="text-[13px] font-bold text-[var(--text)] truncate">
                    {b.bank}
                  </strong>
                  <span className="font-mono-num text-[14px] font-extrabold text-[var(--accent)]">
                    {b.accuracy}%
                  </span>
                </div>
                <div className="h-2 rounded-full border border-[var(--line)] bg-[var(--panel)] overflow-hidden mb-2">
                  <div
                    className="h-full bg-[var(--accent)] transition-all"
                    style={{ width: `${b.accuracy}%` }}
                  />
                </div>
                <div className="text-[11px] text-[var(--muted)] tabular-nums">
                  {b.simulations} simulado(s) · {b.correct} acertos / {b.wrong} erros ({b.totalQuestions} questões)
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="Conclua simulados fechados indicando a banca para visualizar a comparação de desempenho por banca." />
        )}
      </Panel>
    </div>
  );
};


