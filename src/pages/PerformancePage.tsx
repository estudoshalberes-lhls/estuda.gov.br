import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps, useDynamicRowHeight } from 'react-window';
import {
  Award,
  Bookmark,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  Search,
  Timer,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  WEEKDAYS,
  formatClock,
  formatScheduleDuration,
  inferFixedSubjectFromTopic,
  localDateIso,
  normalizeSearch,
  scheduleDurationSeconds,
  visibleName,
} from '../lib/parsers';
import { captureD3ChartsFromContainer } from '../lib/d3SvgCapture';
import {
  PerformancePdfExamContext,
  PerformancePdfExamQuestionRow,
  exportPerformanceReportPdf,
} from '../lib/pdfExport';
import {
  CsvDelimiter,
  PerformanceCsvDataset,
  exportPerformanceCsv,
} from '../lib/performanceCsv';
import { exportWeeklyCycleReportPdf } from '../lib/weeklyReportPdf';
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
import {
  SubjectAccuracyEvolutionD3Chart,
  WeeklyStudyHoursD3Chart,
} from '../components/charts/PerformanceWeeklyAndSubjectD3Panels';
import { WeeklyGoalProgressD3Dashboard } from '../components/charts/WeeklyGoalProgressD3Dashboard';
import { StudyScheduleTimelineD3Dashboard } from '../components/charts/StudyScheduleTimelineD3Dashboard';
import {
  ExamBlockPacingPoint,
  ExamErrorTypeBreakdownRow,
  ExamOutcomeAndPacingD3Chart,
  ExamSubjectBreakdownD3Chart,
  ExamSubjectBreakdownRow,
} from '../components/charts/ExamPerformanceD3Panels';
import { computeCareerSummary } from '../lib/careerGamification';

type TimeRangePreset = 'today' | '7d' | '14d' | '30d' | 'all' | 'custom';

function formatIsoToBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

interface StudyDateRowItem {
  date: string;
  day: string;
  seconds: number;
  subjects: Record<string, number>;
}

interface StudyDateListRowProps {
  rows: StudyDateRowItem[];
  maxDaySec: number;
}

const StudyDateListRow = React.memo(
  ({ index, style, ariaAttributes, rows, maxDaySec }: RowComponentProps<StudyDateListRowProps>) => {
    const dayRow = rows[index];
    if (!dayRow) return null;
    const widthPct = Math.max(6, Math.round((dayRow.seconds / maxDaySec) * 100));
    return (
      <div style={style} {...ariaAttributes} className="pb-2 pr-1">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5">
          <div className="flex items-center justify-between text-[12px] mb-1">
            <strong className="text-[var(--text)] font-mono-num">
              {formatIsoToBr(dayRow.date)} ·{' '}
              <span className="font-sans font-semibold text-[var(--muted)]">{dayRow.day}</span>
            </strong>
            <span className="font-mono-num font-extrabold text-[var(--accent)]">
              {formatClock(dayRow.seconds)}
            </span>
          </div>
          <div className="h-2 rounded-full border border-[var(--line)] bg-[var(--panel)] overflow-hidden mb-1.5">
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${widthPct}%` }} />
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
      </div>
    );
  },
) as (props: RowComponentProps<StudyDateListRowProps>) => React.ReactElement | null;

interface StudySessionRecordItem {
  quizId: string;
  date: string;
  day: string;
  source?: string;
  seconds: number;
  allocations: StudyTimeAllocation[];
}

interface StudySessionListRowProps {
  records: StudySessionRecordItem[];
  onDelete: (quizId: string) => void;
}

const StudySessionListRow = React.memo(
  ({ index, style, ariaAttributes, records, onDelete }: RowComponentProps<StudySessionListRowProps>) => {
    const rec = records[index];
    if (!rec) return null;
    return (
      <div style={style} {...ariaAttributes} className="pb-2 pr-1">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5 text-[12px]">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="font-mono-num font-bold text-[var(--text)]">
                {formatIsoToBr(rec.date)}
              </span>
              <span className="text-[11px] text-[var(--muted)]">({rec.day})</span>
              <span
                className={`px-1.5 py-0.2 rounded border text-[10px] font-bold ${
                  rec.source === 'schedule' || rec.source === 'manual'
                    ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]'
                }`}
              >
                {rec.source === 'schedule'
                  ? 'Cronograma'
                  : rec.source === 'manual'
                    ? 'Manual'
                    : 'Treino / Simulado'}
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
              onClick={() => onDelete(rec.quizId)}
              title="Remover registro de tempo"
              aria-label="Remover registro de tempo"
              className="grid place-items-center w-7 h-7 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)] transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  },
) as (props: RowComponentProps<StudySessionListRowProps>) => React.ReactElement | null;

interface SubjectRowItem {
  subject: string;
  answered: number;
  correct: number;
  studySeconds: number;
}

interface SubjectPerformanceListRowProps {
  rows: SubjectRowItem[];
  totalStudySeconds: number;
}

const SubjectPerformanceListRow = React.memo(
  ({ index, style, ariaAttributes, rows, totalStudySeconds }: RowComponentProps<SubjectPerformanceListRowProps>) => {
    const row = rows[index];
    if (!row) return null;
    const pct = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
    return (
      <div style={style} {...ariaAttributes} className="pb-2.5 pr-1">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
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
              style={{
                width: `${row.answered ? pct : Math.min(100, Math.round((row.studySeconds / Math.max(1, totalStudySeconds)) * 100))}%`,
              }}
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
      </div>
    );
  },
) as (props: RowComponentProps<SubjectPerformanceListRowProps>) => React.ReactElement | null;

export const PerformancePage: React.FC = () => {
  const {
    db,
    fixedSubjects,
    setActivePage,
    deleteStudyTimeRecord,
    addManualStudySessionInterval,
    deleteStudySessionInterval,
    activeTimerTopic,
    syncUncountedCompletedGoals,
    requestConfirm,
    updatePreferences,
    googleUser,
    toast,
  } = useStudy();

  const uncountedCompletedSummary = useMemo(() => {
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

  const careerSummary = useMemo(() => computeCareerSummary(db), [db]);

  const [selectedExamKey, setSelectedExamKey] = useState<string>('ALL');
  const [subjectFilter, setSubjectFilter] = useState('Todas');
  const [historySearch, setHistorySearch] = useState('');
  const [isExportingWeeklyPdf, setIsExportingWeeklyPdf] = useState(false);

  const handleExportWeeklyPdf = useCallback(async () => {
    if (isExportingWeeklyPdf) return;
    setIsExportingWeeklyPdf(true);
    try {
      const res = await exportWeeklyCycleReportPdf(db, {
        studentName: googleUser?.displayName || googleUser?.email || undefined,
      });
      toast(`Boletim semanal exportado (${res.filename}).`);
    } catch (err) {
      toast((err as Error).message || 'Falha ao gerar o Boletim Semanal em PDF.', true);
    } finally {
      setIsExportingWeeklyPdf(false);
    }
  }, [db, googleUser?.displayName, googleUser?.email, isExportingWeeklyPdf, toast]);

  // Unified list of available exams (Simulados Fechados + Provas da Biblioteca com correções)
  const examSelectorGroups = useMemo(() => {
    const simItems = [...db.completedSimulations]
      .sort((a, b) => (b.criado_em || b.data || '').localeCompare(a.criado_em || a.data || ''))
      .map((sim) => ({
        key: `sim:${sim.id}`,
        kind: 'simulado' as const,
        id: sim.id,
        title: visibleName(sim.titulo || sim.arquivo || 'Simulado Fechado'),
        banca: sim.banca?.trim() || '',
        data: sim.data || (sim.criado_em ? formatIsoToBr(sim.criado_em.slice(0, 10)) : ''),
        aproveitamento: sim.aproveitamento,
        acertos: sim.acertos,
        total: sim.total || sim.questoes.length || sim.acertos + sim.erros,
      }));

    const proofMap = new Map<
      string,
      {
        key: string;
        kind: 'prova_biblioteca';
        title: string;
        banca: string;
        count: number;
      }
    >();

    (db.proofFiles || []).forEach((pf) => {
      const count = (pf.correcoes || []).length;
      if (count <= 0) return;
      const cleanTitle = visibleName(pf.name || 'Prova');
      const normKey = normalizeSearch(cleanTitle);
      if (!normKey) return;
      proofMap.set(normKey, {
        key: `proof:${normKey}`,
        kind: 'prova_biblioteca',
        title: cleanTitle,
        banca: pf.bank?.trim() || '',
        count,
      });
    });

    (db.annotations || []).forEach((ann) => {
      if (!ann.correcao_prova || !ann.arquivo_prova?.trim()) return;
      const cleanTitle = visibleName(ann.arquivo_prova);
      const normKey = normalizeSearch(cleanTitle);
      if (!normKey) return;
      const existing = proofMap.get(normKey);
      if (existing) {
        if (!existing.banca && ann.banca?.trim()) existing.banca = ann.banca.trim();
      } else {
        proofMap.set(normKey, {
          key: `proof:${normKey}`,
          kind: 'prova_biblioteca',
          title: cleanTitle,
          banca: ann.banca?.trim() || '',
          count: 1,
        });
      }
    });

    const proofItems = [...proofMap.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

    return { simItems, proofItems };
  }, [db.completedSimulations, db.proofFiles, db.annotations]);

  // Reset exam filter if selected exam no longer exists
  useEffect(() => {
    if (selectedExamKey === 'ALL') return;
    const exists =
      examSelectorGroups.simItems.some((i) => i.key === selectedExamKey) ||
      examSelectorGroups.proofItems.some((i) => i.key === selectedExamKey);
    if (!exists) setSelectedExamKey('ALL');
  }, [selectedExamKey, examSelectorGroups]);

  // Detailed exam-scoped analytics when a specific exam is selected
  const selectedExamAnalysis = useMemo(() => {
    if (selectedExamKey === 'ALL') return null;

    const resolveExamSubject = (rawSubject: string | undefined, examTitle: string): string => {
      const cleaned = visibleName(rawSubject || '').trim();
      if (!cleaned) return 'Sem matéria associada';
      const normClean = normalizeSearch(cleaned);
      const normExam = normalizeSearch(visibleName(examTitle));
      if (
        normClean === 'geral' ||
        normClean === 'sem materia' ||
        normClean === 'sem materia associada' ||
        normClean === 'simulado fechado' ||
        (normExam && normClean === normExam)
      ) {
        return 'Sem matéria associada';
      }
      const inferred = inferFixedSubjectFromTopic({ materia: cleaned }, fixedSubjects);
      return inferred || cleaned;
    };

    if (selectedExamKey.startsWith('sim:')) {
      const simId = selectedExamKey.slice(4);
      const sim = db.completedSimulations.find((s) => s.id === simId);
      if (!sim) return null;

      const examTitle = visibleName(sim.titulo || sim.arquivo || 'Simulado Fechado');

      // Cross-reference error notebook entries for this simulation so subject overrides are always reflected
      const overrideByNum = new Map<number, string>();
      const overrideByEnunciado = new Map<string, string>();
      (db.annotations || []).forEach((ann) => {
        const matchesSim =
          ann.simulado_id === sim.id ||
          ann.id.startsWith(`sim-err-${sim.id}-`) ||
          (ann.simulado_titulo &&
            normalizeSearch(visibleName(ann.simulado_titulo)) === normalizeSearch(examTitle));
        if (!matchesSim || !ann.materia?.trim()) return;
        if (typeof ann.simulado_questao_numero === 'number') {
          overrideByNum.set(ann.simulado_questao_numero, ann.materia);
        }
        const enunKey = normalizeSearch(ann.questao?.enunciado || '').slice(0, 80);
        if (enunKey.length >= 20) {
          overrideByEnunciado.set(enunKey, ann.materia);
        }
      });

      const subjMap = new Map<
        string,
        { subject: string; total: number; correct: number; wrong: number; blank: number; timeSec: number }
      >();
      const missedQuestions: PerformancePdfExamQuestionRow[] = [];

      const questions = sim.questoes || [];
      questions.forEach((q, idx) => {
        const num = q.numero ?? idx + 1;
        const enunKey = normalizeSearch(q.enunciado || '').slice(0, 80);
        const rawSubj =
          overrideByNum.get(num) ||
          (enunKey.length >= 20 ? overrideByEnunciado.get(enunKey) : undefined) ||
          q.materia;
        const subject = resolveExamSubject(rawSubj, examTitle);

        const cur = subjMap.get(subject) || {
          subject,
          total: 0,
          correct: 0,
          wrong: 0,
          blank: 0,
          timeSec: 0,
        };
        cur.total += 1;
        cur.timeSec += q.tempo_segundos || 0;

        const isBlank = !q.resposta || !q.resposta.trim();
        if (q.correta) {
          cur.correct += 1;
        } else if (isBlank) {
          cur.blank += 1;
          missedQuestions.push({
            numero: num,
            subject,
            resposta: 'Em branco',
            gabarito: q.gabarito || '-',
            status: 'Em branco',
            resumo: q.enunciado,
          });
        } else {
          cur.wrong += 1;
          missedQuestions.push({
            numero: num,
            subject,
            resposta: q.resposta,
            gabarito: q.gabarito || '-',
            status: 'Erro',
            resumo: q.enunciado,
          });
        }
        subjMap.set(subject, cur);
      });

      // Fallback if simulation had no detailed questoes array
      if (questions.length === 0) {
        const fallbackSubj = resolveExamSubject(sim.materia, examTitle);
        const total = sim.total || sim.acertos + sim.erros + (sim.em_branco || 0);
        subjMap.set(fallbackSubj, {
          subject: fallbackSubj,
          total,
          correct: sim.acertos,
          wrong: sim.erros,
          blank: sim.em_branco || 0,
          timeSec: sim.tempo_segundos || 0,
        });
      }

      const subjectBreakdown: ExamSubjectBreakdownRow[] = [...subjMap.values()]
        .map((item) => ({
          subject: item.subject,
          total: item.total,
          correct: item.correct,
          wrong: item.wrong,
          blank: item.blank,
          accuracyPct: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total || (a.accuracyPct ?? 0) - (b.accuracyPct ?? 0));

      const filteredSubjectBreakdown =
        subjectFilter === 'Todas'
          ? subjectBreakdown
          : subjectBreakdown.filter((r) => r.subject === subjectFilter);

      const effectiveBreakdown =
        filteredSubjectBreakdown.length > 0 ? filteredSubjectBreakdown : subjectBreakdown;

      const subjectAnalytics: SubjectAnalyticsDatum[] = [...subjMap.values()].map((item) => ({
        subject: item.subject,
        answered: item.total,
        correct: item.correct,
        wrong: item.wrong + item.blank,
        accuracyPct: item.total > 0 ? Math.round((item.correct / item.total) * 100) : null,
        studySeconds: item.timeSec,
        sparkline: [],
        trendDelta: null,
      }));

      // Partition questions into sequential blocks (4 to 8 blocks) for pacing chart
      const blockPacing: ExamBlockPacingPoint[] = [];
      if (questions.length >= 4) {
        const targetBlocks = Math.min(8, Math.max(4, Math.ceil(questions.length / 10)));
        const blockSize = Math.ceil(questions.length / targetBlocks);
        for (let start = 0; start < questions.length; start += blockSize) {
          const slice = questions.slice(start, start + blockSize);
          if (!slice.length) continue;
          const firstNum = slice[0].numero ?? start + 1;
          const lastNum = slice[slice.length - 1].numero ?? start + slice.length;
          const cor = slice.filter((q) => q.correta).length;
          const blk = slice.filter((q) => !q.correta && (!q.resposta || !q.resposta.trim())).length;
          const wrg = slice.length - cor - blk;
          blockPacing.push({
            label: `Q${firstNum}-${lastNum}`,
            rangeLabel: `Questões ${firstNum} a ${lastNum}`,
            total: slice.length,
            correct: cor,
            wrong: wrg,
            blank: blk,
            accuracyPct: Math.round((cor / slice.length) * 100),
          });
        }
      }

      const totalQ = sim.total || questions.length || sim.acertos + sim.erros + (sim.em_branco || 0);
      const blankCount =
        typeof sim.em_branco === 'number'
          ? sim.em_branco
          : questions.filter((q) => !q.correta && (!q.resposta || !q.resposta.trim())).length;
      const wrongCount = Math.max(0, totalQ - sim.acertos - blankCount);
      const avgSecPerQ =
        sim.tempo_segundos > 0 && totalQ > 0 ? Math.round(sim.tempo_segundos / totalQ) : 0;
      const avgTimeFormatted =
        avgSecPerQ > 0
          ? avgSecPerQ >= 60
            ? `${Math.floor(avgSecPerQ / 60)}m ${String(avgSecPerQ % 60).padStart(2, '0')}s`
            : `${avgSecPerQ}s`
          : undefined;
      const examDateStr = sim.data || (sim.criado_em ? formatIsoToBr(sim.criado_em.slice(0, 10)) : '');

      const examContext: PerformancePdfExamContext = {
        title: examTitle,
        kind: 'simulado',
        banca: sim.banca?.trim() || 'Geral / Não informada',
        data: examDateStr,
        tempoFormatted: sim.tempo_segundos > 0 ? formatClock(sim.tempo_segundos) : undefined,
        avgTimePerQuestionFormatted: avgTimeFormatted,
        pontosLiquidos: sim.pontos_liquidos,
        emBranco: blankCount,
        subjectDetailRows: effectiveBreakdown,
        missedQuestions:
          subjectFilter === 'Todas'
            ? missedQuestions
            : missedQuestions.filter((q) => q.subject === subjectFilter),
      };

      return {
        key: selectedExamKey,
        kind: 'simulado' as const,
        title: examTitle,
        banca: sim.banca?.trim() || 'Geral / Não informada',
        data: examDateStr,
        total: totalQ,
        correct: sim.acertos,
        wrong: wrongCount,
        blank: blankCount,
        accuracyPct: sim.aproveitamento,
        tempoSegundos: sim.tempo_segundos || 0,
        avgTimeFormatted,
        pontosLiquidos: sim.pontos_liquidos,
        subjectBreakdown: effectiveBreakdown,
        allExamSubjectBreakdown: subjectBreakdown,
        subjectAnalytics,
        blockPacing,
        errorTypeBreakdown: [] as ExamErrorTypeBreakdownRow[],
        examContext,
      };
    }

    if (selectedExamKey.startsWith('proof:')) {
      const normProofKey = selectedExamKey.slice(6);
      const matchingProof = (db.proofFiles || []).find(
        (pf) => normalizeSearch(visibleName(pf.name || '')) === normProofKey,
      );

      const itemMap = new Map<
        string,
        {
          id: string;
          subject: string;
          type: string;
          corrected: boolean;
          questionLabel: string;
          summary: string;
        }
      >();

      const examTitle = matchingProof
        ? visibleName(matchingProof.name)
        : visibleName(
            (db.annotations || []).find(
              (a) => a.correcao_prova && normalizeSearch(visibleName(a.arquivo_prova || '')) === normProofKey,
            )?.arquivo_prova || 'Prova da Biblioteca',
          );
      let banca = matchingProof?.bank?.trim() || '';

      (matchingProof?.correcoes || []).forEach((c) => {
        const subject = resolveExamSubject(c.materia, examTitle);
        itemMap.set(c.id, {
          id: c.id,
          subject,
          type: c.tipo?.trim() || 'Erro de Prova',
          corrected: Boolean(c.corrigido),
          questionLabel: c.questao || '',
          summary: (c.texto || c.observacoes || '').trim(),
        });
      });

      (db.annotations || []).forEach((ann) => {
        if (!ann.correcao_prova || !ann.arquivo_prova) return;
        if (normalizeSearch(visibleName(ann.arquivo_prova)) !== normProofKey) return;
        if (!banca && ann.banca?.trim()) banca = ann.banca.trim();
        const dedupeKey = ann.correcao_id || ann.id;
        const subject = resolveExamSubject(ann.materia, examTitle);
        itemMap.set(dedupeKey, {
          id: dedupeKey,
          subject,
          type: ann.tipo?.trim() || 'Erro de Prova',
          corrected: Boolean(ann.corrigido),
          questionLabel: ann.questao?.enunciado?.slice(0, 60) || '',
          summary: (ann.texto || ann.questao?.enunciado || '').trim(),
        });
      });

      const items = [...itemMap.values()];
      if (items.length === 0) return null;

      const subjMap = new Map<
        string,
        { subject: string; total: number; corrected: number; pending: number }
      >();
      const typeMap = new Map<
        string,
        { type: string; count: number; pending: number; corrected: number }
      >();
      const missedQuestions: PerformancePdfExamQuestionRow[] = [];

      items.forEach((it) => {
        const s = subjMap.get(it.subject) || {
          subject: it.subject,
          total: 0,
          corrected: 0,
          pending: 0,
        };
        s.total += 1;
        if (it.corrected) s.corrected += 1;
        else s.pending += 1;
        subjMap.set(it.subject, s);

        const t = typeMap.get(it.type) || { type: it.type, count: 0, pending: 0, corrected: 0 };
        t.count += 1;
        if (it.corrected) t.corrected += 1;
        else t.pending += 1;
        typeMap.set(it.type, t);

        const numMatch = it.questionLabel.match(/\d+/);
        missedQuestions.push({
          numero: numMatch ? Number(numMatch[0]) : undefined,
          subject: it.subject,
          status: it.corrected ? 'Corrigido' : 'Pendente',
          resumo: it.summary || it.questionLabel,
        });
      });

      const total = items.length;
      const correctedCount = items.filter((i) => i.corrected).length;
      const pendingCount = total - correctedCount;
      const progressPct = total > 0 ? Math.round((correctedCount / total) * 100) : 0;

      const subjectBreakdown: ExamSubjectBreakdownRow[] = [...subjMap.values()]
        .map((s) => ({
          subject: s.subject,
          total: s.total,
          correct: s.corrected,
          wrong: s.pending,
          blank: 0,
          accuracyPct: s.total > 0 ? Math.round((s.corrected / s.total) * 100) : 0,
          corrected: s.corrected,
          pending: s.pending,
        }))
        .sort((a, b) => b.total - a.total);

      const filteredSubjectBreakdown =
        subjectFilter === 'Todas'
          ? subjectBreakdown
          : subjectBreakdown.filter((r) => r.subject === subjectFilter);
      const effectiveBreakdown =
        filteredSubjectBreakdown.length > 0 ? filteredSubjectBreakdown : subjectBreakdown;

      const subjectAnalytics: SubjectAnalyticsDatum[] = subjectBreakdown.map((s) => ({
        subject: s.subject,
        answered: s.total,
        correct: s.corrected ?? 0,
        wrong: s.pending ?? 0,
        accuracyPct: s.accuracyPct,
        studySeconds: 0,
        sparkline: [],
        trendDelta: null,
      }));

      const errorTypeBreakdown: ExamErrorTypeBreakdownRow[] = [...typeMap.values()].sort(
        (a, b) => b.count - a.count,
      );

      const examDateStr = matchingProof?.createdAt
        ? formatIsoToBr(matchingProof.createdAt.slice(0, 10))
        : '';

      const examContext: PerformancePdfExamContext = {
        title: examTitle,
        kind: 'prova_biblioteca',
        banca: banca || 'Geral / Não informada',
        data: examDateStr,
        pendingCorrections: pendingCount,
        correctedCount,
        subjectDetailRows: effectiveBreakdown,
        missedQuestions:
          subjectFilter === 'Todas'
            ? missedQuestions
            : missedQuestions.filter((q) => q.subject === subjectFilter),
      };

      return {
        key: selectedExamKey,
        kind: 'prova_biblioteca' as const,
        title: examTitle,
        banca: banca || 'Geral / Não informada',
        data: examDateStr,
        total,
        correct: correctedCount,
        wrong: pendingCount,
        blank: 0,
        accuracyPct: progressPct,
        tempoSegundos: 0,
        avgTimeFormatted: undefined,
        pontosLiquidos: undefined,
        subjectBreakdown: effectiveBreakdown,
        allExamSubjectBreakdown: subjectBreakdown,
        subjectAnalytics,
        blockPacing: [] as ExamBlockPacingPoint[],
        errorTypeBreakdown,
        examContext,
      };
    }

    return null;
  }, [selectedExamKey, db.completedSimulations, db.annotations, db.proofFiles, fixedSubjects, subjectFilter]);

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

  // Export CSV & Official D3 PDF state
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>(';');
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const d3ChartsContainerRef = useRef<HTMLDivElement | null>(null);

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

  // 14-day history with correct vs wrong and completed simulations (O(N) single-pass index)
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
    const byIso = new Map<string, (typeof days)[number]>();
    const brToIso = new Map<string, string>();
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = localDateIso(d);
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(
        2,
        '0',
      )}`;
      const entry = {
        iso,
        label,
        answered: 0,
        correct: 0,
        wrong: 0,
        simulations: 0,
        studySeconds: 0,
      };
      days.push(entry);
      byIso.set(iso, entry);
      brToIso.set(`${label}/${d.getFullYear()}`, iso);
    }

    for (const h of db.history) {
      const bucket = byIso.get(h.date);
      if (!bucket) continue;
      bucket.answered += 1;
      if (h.correct) bucket.correct += 1;
      else bucket.wrong += 1;
    }

    for (const s of db.completedSimulations) {
      const isoKey =
        (s.criado_em && byIso.has(s.criado_em.slice(0, 10)) ? s.criado_em.slice(0, 10) : null) ||
        (s.data ? brToIso.get(s.data.slice(0, 10)) || null : null);
      if (!isoKey) continue;
      const bucket = byIso.get(isoKey);
      if (bucket) bucket.simulations += 1;
    }

    for (const rec of db.studyTimeRecords) {
      const bucket = byIso.get(rec.date);
      if (!bucket) continue;
      for (const a of rec.allocations) {
        bucket.studySeconds += a.seconds;
      }
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

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const capturedCharts = await captureD3ChartsFromContainer(d3ChartsContainerRef.current);

      if (selectedExamAnalysis) {
        const examFilterParts = [
          `Prova selecionada: ${selectedExamAnalysis.title}`,
          `Banca: ${selectedExamAnalysis.banca}`,
        ];
        if (selectedExamAnalysis.data) {
          examFilterParts.push(`Data: ${selectedExamAnalysis.data}`);
        }
        if (subjectFilter !== 'Todas') {
          examFilterParts.push(`Matéria filtrada: ${visibleName(subjectFilter)}`);
        }

        const fileName = exportPerformanceReportPdf({
          totalAnswered: selectedExamAnalysis.total,
          totalCorrect: selectedExamAnalysis.correct,
          totalWrong: selectedExamAnalysis.wrong,
          accuracy: selectedExamAnalysis.accuracyPct,
          totalStudyFormatted: selectedExamAnalysis.tempoSegundos
            ? formatClock(selectedExamAnalysis.tempoSegundos)
            : '—',
          completedSimulationsCount: 1,
          subjectRows: selectedExamAnalysis.subjectBreakdown.map((s) => ({
            subject: s.subject,
            answered: s.total,
            correct: s.correct,
            studySeconds: 0,
          })),
          bankRows: [],
          recentSimulations: [],
          formatDuration: formatClock,
          filterDescription: examFilterParts.join(' · '),
          holderName: googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal',
          charts: capturedCharts,
          examContext: selectedExamAnalysis.examContext,
        });
        toast(
          capturedCharts.length > 0
            ? `PDF oficial da prova gerado (${capturedCharts.length} gráfico(s)): ${fileName}`
            : `PDF oficial da prova gerado: ${fileName}`,
        );
      } else {
        const filterDescParts = [
          `Escopo: Todas as provas e histórico geral`,
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

        const fileName = exportPerformanceReportPdf({
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
          holderName: googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal',
          charts: capturedCharts,
          filteredStudySummary: {
            totalFormatted: formatClock(filteredStudyStats.totalSec),
            avgFormatted: formatClock(filteredStudyStats.avgSec),
            activeDays: filteredStudyStats.activeDays,
            sessionsCount: filteredStudyStats.sessionsCount,
          },
          filteredStudyByDate: filteredStudyStats.byDate,
          dailySeries,
        });
        toast(
          capturedCharts.length > 0
            ? `Relatório oficial em PDF gerado com ${capturedCharts.length} gráfico(s): ${fileName}`
            : `Relatório oficial de desempenho em PDF gerado: ${fileName}`,
        );
      }
    } catch (err) {
      toast((err as Error).message || 'Falha ao gerar o relatório oficial em PDF.', true);
    } finally {
      setIsExportingPdf(false);
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

  const handleDeleteRecord = useCallback(
    async (quizId: string) => {
      const ok = await requestConfirm({
        title: 'Excluir registro de tempo?',
        description: 'Este bloco de tempo estudado será removido das estatísticas e do tópico vinculado no cronograma.',
        confirmLabel: 'Remover registro',
        danger: true,
      });
      if (!ok) return;
      deleteStudyTimeRecord(quizId);
    },
    [deleteStudyTimeRecord, requestConfirm],
  );

  const studyDateDynamicHeight = useDynamicRowHeight({
    defaultRowHeight: 96,
    key: `perf-dates-${filteredStudyStats.byDate.length}-${timePreset}-${weekdayFilter}-${timeSubjectFilter}-${timeContestFilter}`,
  });
  const studySessionDynamicHeight = useDynamicRowHeight({
    defaultRowHeight: 82,
    key: `perf-sessions-${filteredStudyRecords.length}-${timePreset}-${weekdayFilter}-${timeSubjectFilter}-${timeContestFilter}`,
  });
  const subjectDynamicHeight = useDynamicRowHeight({
    defaultRowHeight: 98,
    key: `perf-subj-${subjectRows.length}-${subjectFilter}-${historySearch}`,
  });

  const studyDateRowProps = useMemo<StudyDateListRowProps>(
    () => ({ rows: filteredStudyStats.byDate, maxDaySec: filteredStudyStats.maxDaySec }),
    [filteredStudyStats.byDate, filteredStudyStats.maxDaySec],
  );
  const studySessionRowProps = useMemo<StudySessionListRowProps>(
    () => ({
      records: filteredStudyRecords,
      onDelete: (quizId: string) => void handleDeleteRecord(quizId),
    }),
    [filteredStudyRecords, handleDeleteRecord],
  );
  const subjectPerformanceRowProps = useMemo<SubjectPerformanceListRowProps>(
    () => ({ rows: subjectRows, totalStudySeconds }),
    [subjectRows, totalStudySeconds],
  );

  const studyDateRowKey = useCallback(
    (index: number, data: StudyDateListRowProps) => data.rows[index]?.date ?? index,
    [],
  );
  const studySessionRowKey = useCallback(
    (index: number, data: StudySessionListRowProps) => data.records[index]?.quizId ?? index,
    [],
  );
  const subjectRowKey = useCallback(
    (index: number, data: SubjectPerformanceListRowProps) => data.rows[index]?.subject ?? index,
    [],
  );

  return (
    <>
    <div data-print-hide="true" className="print:hidden">
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
              onClick={() => void handleExportWeeklyPdf()}
              disabled={isExportingWeeklyPdf}
              title="Gerar Boletim de Fechamento Semanal em PDF (horas vs. meta, questões, simulados e Lei Seca da semana)"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60 whitespace-nowrap transition-colors cursor-pointer"
            >
              {isExportingWeeklyPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
              ) : (
                <CalendarDays className="w-3.5 h-3.5 text-[var(--accent)]" />
              )}
              {isExportingWeeklyPdf ? 'Gerando Boletim…' : 'Boletim Semanal (PDF)'}
            </button>

            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isExportingPdf}
              title={
                selectedExamAnalysis
                  ? `Gerar PDF oficial com os gráficos filtrados da prova "${selectedExamAnalysis.title}"`
                  : 'Gerar relatório governamental oficial em PDF incluindo os gráficos D3 atuais'
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#071D41] bg-[#071D41] text-white text-[12px] font-bold hover:bg-[#0c2d64] disabled:opacity-60 whitespace-nowrap shadow-xs transition-colors cursor-pointer"
            >
              {isExportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFCD07]" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-[#FFCD07]" />
              )}
              {isExportingPdf
                ? 'Gerando Relatório…'
                : selectedExamAnalysis
                  ? 'Exportar PDF da Prova'
                  : 'Exportar PDF Oficial'}
            </button>
          </div>
        }
      />

      {/* Barra de Filtro por Prova / Simulado para Gráficos e Exportação Oficial em PDF */}
      <section
        aria-label="Filtro de prova do Monitor de Desempenho"
        className="ce-panel rounded-xl px-4 py-3.5 mb-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg border border-[var(--accent)]/35 bg-[var(--accent-soft)] grid place-items-center shrink-0">
              <ClipboardCheck className="w-4.5 h-4.5 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <div className="min-w-[200px] flex-1 max-w-[460px]">
              <label
                htmlFor="perf-exam-selector"
                className="block text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-[var(--muted)] mb-1"
              >
                Filtrar Gráficos e PDF Oficial por Prova / Simulado
              </label>
              <select
                id="perf-exam-selector"
                value={selectedExamKey}
                onChange={(e) => {
                  setSelectedExamKey(e.target.value);
                  setSubjectFilter('Todas');
                }}
                className="ce-select w-full text-[12.5px] font-bold h-[36px] py-1"
              >
                <option value="ALL">Todas as Provas e Histórico Geral</option>
                {examSelectorGroups.simItems.length > 0 && (
                  <optgroup label={`Simulados Fechados Realizados (${examSelectorGroups.simItems.length})`}>
                    {examSelectorGroups.simItems.map((sim) => (
                      <option key={sim.key} value={sim.key}>
                        {sim.title}
                        {sim.banca ? ` · ${sim.banca}` : ''}
                        {sim.data ? ` (${sim.data})` : ''} — {sim.aproveitamento}% ({sim.acertos}/{sim.total})
                      </option>
                    ))}
                  </optgroup>
                )}
                {examSelectorGroups.proofItems.length > 0 && (
                  <optgroup label={`Provas da Biblioteca com Correções (${examSelectorGroups.proofItems.length})`}>
                    {examSelectorGroups.proofItems.map((pf) => (
                      <option key={pf.key} value={pf.key}>
                        {pf.title}
                        {pf.banca ? ` · ${pf.banca}` : ''} — {pf.count} registro(s)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {selectedExamAnalysis && (
              <>
                {subjectFilter !== 'Todas' && (
                  <button
                    type="button"
                    onClick={() => setSubjectFilter('Todas')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] text-[11.5px] font-bold hover:opacity-90 cursor-pointer"
                  >
                    <span>Matéria: {visibleName(subjectFilter)}</span>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExamKey('ALL');
                    setSubjectFilter('Todas');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[11.5px] font-bold hover:border-[var(--accent)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Histórico Geral
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={isExportingPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#071D41] bg-[#071D41] text-white text-[11.5px] font-bold hover:bg-[#0c2d64] disabled:opacity-60 cursor-pointer"
                >
                  {isExportingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFCD07]" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-[#FFCD07]" />
                  )}
                  Exportar PDF desta Prova
                </button>
              </>
            )}
          </div>
        </div>

        {selectedExamAnalysis && (
          <div className="mt-3 pt-2.5 border-t border-[var(--line)] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--muted)]">
            <span>
              <strong className="text-[var(--text)]">Prova ativa:</strong> {selectedExamAnalysis.title}
            </span>
            <span>
              <strong className="text-[var(--text)]">Banca:</strong> {selectedExamAnalysis.banca}
            </span>
            {selectedExamAnalysis.data && (
              <span>
                <strong className="text-[var(--text)]">Data:</strong> {selectedExamAnalysis.data}
              </span>
            )}
            <span>
              <strong className="text-[var(--text)]">Matérias:</strong>{' '}
              {selectedExamAnalysis.allExamSubjectBreakdown.length}
            </span>
            {typeof selectedExamAnalysis.pontosLiquidos === 'number' && (
              <span className="font-mono-num font-bold text-[var(--accent)]">
                Pontos líquidos: {selectedExamAnalysis.pontosLiquidos}
              </span>
            )}
          </div>
        )}
      </section>

      {uncountedCompletedSummary.count > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-extrabold text-[var(--text)]">
              {uncountedCompletedSummary.count} meta(s) concluída(s) no Cronograma ainda não foram somadas aqui (+
              {formatScheduleDuration(uncountedCompletedSummary.totalSeconds)})
            </div>
            <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
              A partir de agora toda meta finalizada no Cronograma soma automaticamente. Clique ao lado para importar também as metas concluídas anteriormente sem duplicar horas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => syncUncountedCompletedGoals()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            Contabilizar metas anteriores (+{formatScheduleDuration(uncountedCompletedSummary.totalSeconds)})
          </button>
        </div>
      )}

      {/* Resumo compacto com acesso direto à aba dedicada Carreira & Medalhas */}
      <section
        aria-label="Resumo da Carreira do Concurseiro"
        className="ce-panel rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] grid place-items-center shrink-0">
            <Award className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
              <span className="font-mono-num font-extrabold text-[var(--accent)]">
                Nível {careerSummary.currentLevel.level}/{careerSummary.allLevels.length}
              </span>
              <span className="text-[var(--muted)]" aria-hidden="true">·</span>
              <strong className="text-[var(--text)] truncate">
                {careerSummary.currentLevel.title}
              </strong>
              <span className="text-[var(--muted)]" aria-hidden="true">·</span>
              <span className="font-mono-num font-bold text-[var(--text)]">
                {careerSummary.totalXp.toLocaleString('pt-BR')} XP
              </span>
              <span className="text-[var(--muted)]" aria-hidden="true">·</span>
              <span className="font-mono-num text-[var(--muted)]">
                {careerSummary.unlockedMedalsCount}/{careerSummary.medals.length} medalhas
              </span>
            </div>
            <div className="mt-1.5 max-w-[420px] flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[var(--panel-soft)] border border-[var(--line)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${Math.max(3, careerSummary.levelProgressPct)}%` }}
                />
              </div>
              <span className="font-mono-num text-[10.5px] font-bold text-[var(--muted)] shrink-0">
                {careerSummary.nextLevel
                  ? `faltam ${careerSummary.xpRemaining.toLocaleString('pt-BR')} XP p/ Nv. ${careerSummary.nextLevel.level}`
                  : 'Nível 100 alcançado'}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActivePage('Carreira & Mérito')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-bold whitespace-nowrap transition-colors cursor-pointer"
        >
          <Award className="w-3.5 h-3.5" />
          Abrir Carreira &amp; Medalhas
        </button>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
        {selectedExamAnalysis ? (
          selectedExamAnalysis.kind === 'simulado' ? (
            <>
              <article className="ce-panel p-4">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Questões na prova</div>
                <div className="font-mono-num text-[27px] font-extrabold text-[var(--text)] mt-1">
                  {selectedExamAnalysis.total.toLocaleString('pt-BR')}
                </div>
                <div className="text-[11.5px] text-[var(--subtle)] mt-1 tabular-nums">
                  {selectedExamAnalysis.correct} acertos · {selectedExamAnalysis.wrong} erros
                  {selectedExamAnalysis.blank > 0 ? ` · ${selectedExamAnalysis.blank} em branco` : ''}
                </div>
              </article>

              <article className="ce-panel p-4">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Aproveitamento da prova</div>
                <div
                  className={`font-mono-num text-[27px] font-extrabold mt-1 ${
                    selectedExamAnalysis.accuracyPct >= 80
                      ? 'text-[var(--good)]'
                      : selectedExamAnalysis.accuracyPct >= 60
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--bad)]'
                  }`}
                >
                  {selectedExamAnalysis.accuracyPct}%
                </div>
                <div className="text-[11.5px] text-[var(--subtle)] mt-1">
                  {typeof selectedExamAnalysis.pontosLiquidos === 'number'
                    ? `Pontos líquidos: ${selectedExamAnalysis.pontosLiquidos}`
                    : selectedExamAnalysis.accuracyPct >= 80
                      ? 'Acima da meta de 80%'
                      : 'Meta institucional: 80%'}
                </div>
              </article>

              <article className="ce-panel p-4">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Tempo da prova</div>
                <div className="font-mono-num text-[27px] font-extrabold text-[var(--accent)] mt-1">
                  {selectedExamAnalysis.tempoSegundos > 0
                    ? formatClock(selectedExamAnalysis.tempoSegundos)
                    : '—'}
                </div>
                <div className="text-[11.5px] text-[var(--subtle)] mt-1 tabular-nums">
                  {selectedExamAnalysis.avgTimeFormatted
                    ? `Média de ${selectedExamAnalysis.avgTimeFormatted} por questão`
                    : 'Duração registrada no simulado'}
                </div>
              </article>

              <article className="ce-panel p-4">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Matérias avaliadas</div>
                <div className="font-mono-num text-[27px] font-extrabold text-[var(--text)] mt-1">
                  {selectedExamAnalysis.allExamSubjectBreakdown.length}
                </div>
                <div className="text-[11.5px] text-[var(--subtle)] mt-1 truncate">
                  Banca: {selectedExamAnalysis.banca}
                </div>
              </article>
            </>
          ) : (
            <>
              <article className="ce-panel p-4">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Registros na prova</div>
                <div className="font-mono-num text-[27px] font-extrabold text-[var(--text)] mt-1">
                  {selectedExamAnalysis.total.toLocaleString('pt-BR')}
                </div>
                <div className="text-[11.5px] text-[var(--subtle)] mt-1 tabular-nums">
                  Questões e anotações vinculadas
                </div>
              </article>

              <article className="ce-panel p-4">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Progresso de correção</div>
                <div className="font-mono-num text-[27px] font-extrabold text-[var(--good)] mt-1">
                  {selectedExamAnalysis.accuracyPct}%
                </div>
                <div className="text-[11.5px] text-[var(--subtle)] mt-1 tabular-nums">
                  {selectedExamAnalysis.correct} corrigida(s)
                </div>
              </article>

              <article className="ce-panel p-4">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Pendentes de revisão</div>
                <div
                  className={`font-mono-num text-[27px] font-extrabold mt-1 ${
                    selectedExamAnalysis.wrong > 0 ? 'text-[var(--warning)]' : 'text-[var(--good)]'
                  }`}
                >
                  {selectedExamAnalysis.wrong}
                </div>
                <div className="text-[11.5px] text-[var(--subtle)] mt-1">
                  <button
                    type="button"
                    onClick={() => setActivePage('Caderno de Erros')}
                    className="text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    Abrir Caderno de Erros →
                  </button>
                </div>
              </article>

              <article className="ce-panel p-4">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Matérias associadas</div>
                <div className="font-mono-num text-[27px] font-extrabold text-[var(--text)] mt-1">
                  {selectedExamAnalysis.allExamSubjectBreakdown.length}
                </div>
                <div className="text-[11.5px] text-[var(--subtle)] mt-1 truncate">
                  Banca: {selectedExamAnalysis.banca}
                </div>
              </article>
            </>
          )
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Painel Analítico Interativo com D3.js (Global ou Filtrado pela Prova Selecionada) */}
      <div ref={d3ChartsContainerRef}>
        {selectedExamAnalysis ? (
          <>
            <div
              data-d3-chart-card=""
              data-d3-chart-title={
                selectedExamAnalysis.kind === 'simulado'
                  ? `Desempenho por Matéria na Prova · ${selectedExamAnalysis.title}`
                  : `Distribuição de Erros e Revisões por Matéria · ${selectedExamAnalysis.title}`
              }
              data-d3-chart-subtitle={
                selectedExamAnalysis.kind === 'simulado'
                  ? `Acertos, erros e questões em branco por matéria frente à meta de 80% (${selectedExamAnalysis.banca}).`
                  : `Progresso de correções e pendências por matéria nesta prova (${selectedExamAnalysis.banca}).`
              }
            >
              <ExamSubjectBreakdownD3Chart
                examTitle={selectedExamAnalysis.title}
                mode={selectedExamAnalysis.kind}
                rows={selectedExamAnalysis.subjectBreakdown}
                selectedSubject={subjectFilter}
                onSelectSubject={setSubjectFilter}
              />
            </div>

            <div
              className={`grid grid-cols-1 ${
                selectedExamAnalysis.kind === 'simulado' ? 'xl:grid-cols-2' : ''
              } gap-3.5 mb-4`}
            >
              <div
                data-d3-chart-card=""
                data-d3-chart-title={
                  selectedExamAnalysis.kind === 'simulado'
                    ? `Balanço de Questões & Ritmo por Blocos · ${selectedExamAnalysis.title}`
                    : `Progresso de Correção & Tipos de Anotação · ${selectedExamAnalysis.title}`
                }
                data-d3-chart-subtitle={
                  selectedExamAnalysis.kind === 'simulado'
                    ? 'Composição geral (acertos, erros, em branco) e estabilidade da taxa de acerto ao longo da prova.'
                    : 'Percentual revisado e classificação dos pontos registrados nesta prova.'
                }
              >
                <ExamOutcomeAndPacingD3Chart
                  examTitle={selectedExamAnalysis.title}
                  mode={selectedExamAnalysis.kind}
                  correct={selectedExamAnalysis.correct}
                  wrong={selectedExamAnalysis.wrong}
                  blank={selectedExamAnalysis.blank}
                  accuracyPct={selectedExamAnalysis.accuracyPct}
                  blockPacing={selectedExamAnalysis.blockPacing}
                  errorTypeBreakdown={selectedExamAnalysis.errorTypeBreakdown}
                />
              </div>

              {selectedExamAnalysis.kind === 'simulado' && (
                <div
                  data-d3-chart-card=""
                  data-d3-chart-title={`Quadrante de Prioridade da Prova · ${selectedExamAnalysis.title}`}
                  data-d3-chart-subtitle="Posicionamento estratégico entre volume de questões e taxa de acerto por matéria nesta prova."
                >
                  <PriorityQuadrantD3Chart
                    rows={selectedExamAnalysis.subjectAnalytics}
                    selectedSubject={subjectFilter}
                    onSelectSubject={setSubjectFilter}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              data-d3-chart-card=""
              data-d3-chart-title="Progresso Semanal · Horas Líquidas × Meta Estabelecida"
              data-d3-chart-subtitle="Comparativo semanal em D3 das horas líquidas estudadas frente à meta semanal configurada e ritmo diário da semana atual."
            >
              <WeeklyGoalProgressD3Dashboard
                db={db}
                fixedSubjects={fixedSubjects}
                subjectFilter={subjectFilter}
                onSaveWeeklyGoal={(hours) => {
                  updatePreferences({ weekly_hours_goal: hours });
                  toast(`Meta semanal de estudo atualizada para ${hours.toLocaleString('pt-BR')}h.`);
                }}
                onNavigate={(page) => setActivePage(page)}
              />
            </div>

            <div
              data-d3-chart-card=""
              data-d3-chart-title="Registro de Horários de Estudo · Linha do Tempo & Turnos"
              data-d3-chart-subtitle="Faixas horárias exatas de início e pausa do cronômetro ao longo do dia (00h–24h), mapa de turnos e extrato de ponto."
            >
              <StudyScheduleTimelineD3Dashboard
                db={db}
                fixedSubjects={fixedSubjects}
                subjectFilter={subjectFilter}
                activeTimerSubject={
                  activeTimerTopic?.disciplinaFixa || activeTimerTopic?.materia
                }
                activeTimerTopicLabel={activeTimerTopic?.materia}
                onAddManualInterval={addManualStudySessionInterval}
                onDeleteInterval={(id) => {
                  void requestConfirm({
                    title: 'Remover registro de horário',
                    description:
                      'Deseja remover este intervalo de horário do extrato no Portal da Transparência?',
                    confirmLabel: 'Remover',
                    danger: true,
                  }).then((ok) => {
                    if (ok) deleteStudySessionInterval(id);
                  });
                }}
              />
            </div>

            <div
              data-d3-chart-card=""
              data-d3-chart-title="Evolução Temporal & Tendência de Acerto"
              data-d3-chart-subtitle="Volume diário de questões, taxa de acerto e média móvel de 7 dias frente à meta de 80%."
            >
              <PerformanceEvolutionD3Chart
                db={db}
                subjectFilter={subjectFilter}
                fixedSubjects={fixedSubjects}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 mb-4">
              <div
                data-d3-chart-card=""
                data-d3-chart-title="Evolução da Taxa de Acertos por Matéria (Semanal)"
                data-d3-chart-subtitle="Comparativo semanal de aproveitamento percentual nas principais disciplinas ativas."
              >
                <SubjectAccuracyEvolutionD3Chart
                  db={db}
                  fixedSubjects={fixedSubjects}
                  selectedSubject={subjectFilter}
                  onSelectSubject={setSubjectFilter}
                />
              </div>
              <div
                data-d3-chart-card=""
                data-d3-chart-title="Tempo de Estudo Semanal (Horas Líquidas)"
                data-d3-chart-subtitle="Distribuição semanal de horas líquidas registradas no Ponto Eletrônico."
              >
                <WeeklyStudyHoursD3Chart
                  db={db}
                  fixedSubjects={fixedSubjects}
                  subjectFilter={subjectFilter}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 mb-4">
              <div
                data-d3-chart-card=""
                data-d3-chart-title="Mapa de Consistência Anual"
                data-d3-chart-subtitle="Frequência diária e regularidade de estudos ao longo das últimas 52 semanas."
              >
                <ConsistencyCalendarHeatmap db={db} />
              </div>
              <div
                data-d3-chart-card=""
                data-d3-chart-title="Matriz de Esforço × Desempenho por Disciplina"
                data-d3-chart-subtitle="Posicionamento estratégico entre volume resolvido e taxa de acerto por matéria."
              >
                <PriorityQuadrantD3Chart
                  rows={subjectAnalyticsRows}
                  selectedSubject={subjectFilter}
                  onSelectSubject={setSubjectFilter}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <AnalyticalSubjectsD3Table
        rows={selectedExamAnalysis ? selectedExamAnalysis.subjectAnalytics : subjectAnalyticsRows}
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
            {/* Agrupamento por Dia/Data (virtualizado via react-window) */}
            <div>
              <h4 className="m-0 mb-2.5 text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-[var(--accent)]" />
                Total estudado por data
              </h4>
              <List
                rowComponent={StudyDateListRow}
                rowCount={filteredStudyStats.byDate.length}
                rowHeight={studyDateDynamicHeight}
                rowKey={studyDateRowKey}
                rowProps={studyDateRowProps}
                overscanCount={4}
                style={{
                  height: Math.min(320, Math.max(96, filteredStudyStats.byDate.length * 100)),
                  width: '100%',
                }}
              />
            </div>

            {/* Sessões detalhadas (virtualizado via react-window) */}
            <div>
              <h4 className="m-0 mb-2.5 text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                Sessões detalhadas ({filteredStudyRecords.length})
              </h4>
              <List
                rowComponent={StudySessionListRow}
                rowCount={filteredStudyRecords.length}
                rowHeight={studySessionDynamicHeight}
                rowKey={studySessionRowKey}
                rowProps={studySessionRowProps}
                overscanCount={5}
                style={{
                  height: Math.min(320, Math.max(84, filteredStudyRecords.length * 88)),
                  width: '100%',
                }}
              />
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
            <List
              rowComponent={SubjectPerformanceListRow}
              rowCount={subjectRows.length}
              rowHeight={subjectDynamicHeight}
              rowKey={subjectRowKey}
              rowProps={subjectPerformanceRowProps}
              overscanCount={4}
              style={{
                height: Math.min(520, Math.max(100, subjectRows.length * 100)),
                width: '100%',
              }}
            />
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
    </>
  );
};


