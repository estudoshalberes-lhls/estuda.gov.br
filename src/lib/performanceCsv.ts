import { triggerBlobDownload } from './fileStorage';
import { formatClock, localDateIso, visibleName } from './parsers';
import { CompletedSimulation } from '../types/study';

export type CsvDelimiter = ';' | ',';

export type PerformanceCsvDataset =
  | 'complete'
  | 'subjects'
  | 'study_sessions'
  | 'daily_evolution'
  | 'simulations';

export interface PerformanceExportFilterContext {
  periodLabel: string;
  weekdayFilter: string;
  timeSubjectFilter: string;
  subjectFilter: string;
  subjectSearch: string;
}

export interface PerformanceExportDailyRow {
  iso: string;
  label: string;
  answered: number;
  correct: number;
  wrong: number;
  simulations: number;
  studySeconds: number;
}

export interface PerformanceExportSubjectRow {
  subject: string;
  answered: number;
  correct: number;
  studySeconds: number;
}

export interface PerformanceExportBankRow {
  bank: string;
  simulations: number;
  totalQuestions: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

export interface PerformanceExportDayStudyRow {
  date: string;
  day: string;
  seconds: number;
  subjects: Record<string, number>;
}

export interface PerformanceExportStudySessionRow {
  quizId: string;
  date: string;
  day: string;
  source?: string;
  seconds: number;
  allocations: Array<{ subject: string; topicLabel?: string; seconds: number }>;
}

export interface PerformanceExportPayload {
  totalAnswered: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  totalStudySeconds: number;
  completedSimulationsCount: number;
  filters: PerformanceExportFilterContext;
  filteredStudyTotalSeconds: number;
  filteredStudyActiveDays: number;
  filteredStudyAvgSeconds: number;
  filteredStudyByDate: PerformanceExportDayStudyRow[];
  filteredStudySessions: PerformanceExportStudySessionRow[];
  dailySeries: PerformanceExportDailyRow[];
  subjectRows: PerformanceExportSubjectRow[];
  bankRows: PerformanceExportBankRow[];
  completedSimulations: CompletedSimulation[];
}

function formatIsoBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function sanitizeFormulaCell(text: string): string {
  // Neutralize spreadsheet formula triggers when cell starts with =, +, -, @, tab or CR
  if (/^[=+\-@\t\r]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

function escapeCsvCell(value: unknown, delimiter: CsvDelimiter): string {
  const raw = sanitizeFormulaCell(String(value ?? ''));
  const needsQuotes =
    raw.includes(delimiter) ||
    raw.includes('"') ||
    raw.includes('\n') ||
    raw.includes('\r');
  if (!needsQuotes) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsvLines(rows: Array<Array<unknown>>, delimiter: CsvDelimiter): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter)).join('\r\n');
}

function secondsToMinutesDecimal(seconds: number): string {
  return (seconds / 60).toFixed(1).replace('.', ',');
}

function secondsToMinutesNumeric(seconds: number, delimiter: CsvDelimiter): string {
  const val = (seconds / 60).toFixed(1);
  return delimiter === ';' ? val.replace('.', ',') : val;
}

function buildSubjectsTable(rows: PerformanceExportSubjectRow[], delimiter: CsvDelimiter): Array<Array<unknown>> {
  const header = [
    'Disciplina',
    'Questoes Respondidas',
    'Acertos',
    'Erros',
    'Aproveitamento (%)',
    'Tempo Estudado (HH:MM:SS)',
    'Tempo Estudado (min)',
  ];
  const body = rows.map((row) => {
    const wrong = Math.max(0, row.answered - row.correct);
    const pct = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
    return [
      visibleName(row.subject),
      row.answered,
      row.correct,
      wrong,
      pct,
      formatClock(row.studySeconds),
      secondsToMinutesNumeric(row.studySeconds, delimiter),
    ];
  });
  return [header, ...body];
}

function buildDailyEvolutionTable(
  rows: PerformanceExportDailyRow[],
  delimiter: CsvDelimiter,
): Array<Array<unknown>> {
  const header = [
    'Data',
    'Questoes Respondidas',
    'Acertos',
    'Erros',
    'Aproveitamento (%)',
    'Simulados Concluidos',
    'Tempo Estudado (HH:MM:SS)',
    'Tempo Estudado (min)',
  ];
  const body = rows.map((day) => {
    const pct = day.answered ? Math.round((day.correct / day.answered) * 100) : 0;
    return [
      formatIsoBr(day.iso),
      day.answered,
      day.correct,
      day.wrong,
      pct,
      day.simulations,
      formatClock(day.studySeconds),
      secondsToMinutesNumeric(day.studySeconds, delimiter),
    ];
  });
  return [header, ...body];
}

function buildStudySessionsTable(
  sessions: PerformanceExportStudySessionRow[],
  delimiter: CsvDelimiter,
): Array<Array<unknown>> {
  const header = [
    'Data',
    'Dia da Semana',
    'Origem',
    'Disciplinas e Topicos',
    'Tempo Total Sessao (HH:MM:SS)',
    'Tempo Total Sessao (min)',
  ];
  const body = sessions.map((rec) => {
    const desc = rec.allocations
      .map(
        (a) =>
          `${visibleName(a.subject)}${a.topicLabel ? ` (${a.topicLabel})` : ''} [${formatClock(a.seconds)}]`,
      )
      .join(' | ');
    const sourceLabel =
      rec.source === 'schedule'
        ? 'Cronograma'
        : rec.source === 'manual'
          ? 'Cronômetro Manual'
          : 'Treino / Simulado';
    return [
      formatIsoBr(rec.date),
      rec.day,
      sourceLabel,
      desc,
      formatClock(rec.seconds),
      secondsToMinutesNumeric(rec.seconds, delimiter),
    ];
  });
  return [header, ...body];
}

function buildSimulationsTable(
  sims: CompletedSimulation[],
  delimiter: CsvDelimiter,
): Array<Array<unknown>> {
  const header = [
    'Titulo',
    'Banca',
    'Disciplina',
    'Data',
    'Acertos',
    'Erros',
    'Total Questoes',
    'Aproveitamento (%)',
    'Pontos Liquidos',
  ];
  const body = sims.map((s) => [
    s.titulo,
    s.banca?.trim() || 'Nao informada',
    visibleName(s.materia),
    s.data,
    s.acertos,
    s.erros,
    s.total,
    s.aproveitamento,
    typeof s.pontos_liquidos === 'number'
      ? delimiter === ';'
        ? String(s.pontos_liquidos).replace('.', ',')
        : s.pontos_liquidos
      : '',
  ]);
  return [header, ...body];
}

function buildBanksTable(rows: PerformanceExportBankRow[]): Array<Array<unknown>> {
  const header = [
    'Banca',
    'Simulados Concluidos',
    'Total Questoes',
    'Acertos',
    'Erros',
    'Aproveitamento (%)',
  ];
  const body = rows.map((b) => [
    b.bank,
    b.simulations,
    b.totalQuestions,
    b.correct,
    b.wrong,
    b.accuracy,
  ]);
  return [header, ...body];
}

export function exportPerformanceCsv(
  payload: PerformanceExportPayload,
  dataset: PerformanceCsvDataset = 'complete',
  delimiter: CsvDelimiter = ';',
): { filename: string; rowCount: number } {
  const todayStamp = localDateIso();
  let rows: Array<Array<unknown>> = [];
  let filename = `desempenho_${dataset}_${todayStamp}.csv`;

  if (dataset === 'subjects') {
    rows = buildSubjectsTable(payload.subjectRows, delimiter);
    filename = `desempenho_disciplinas_${todayStamp}.csv`;
  } else if (dataset === 'study_sessions') {
    rows = buildStudySessionsTable(payload.filteredStudySessions, delimiter);
    filename = `desempenho_sessoes_tempo_${todayStamp}.csv`;
  } else if (dataset === 'daily_evolution') {
    rows = buildDailyEvolutionTable(payload.dailySeries, delimiter);
    filename = `desempenho_evolucao_14_dias_${todayStamp}.csv`;
  } else if (dataset === 'simulations') {
    rows = buildSimulationsTable(payload.completedSimulations, delimiter);
    filename = `desempenho_simulados_${todayStamp}.csv`;
  } else {
    filename = `desempenho_completo_${todayStamp}.csv`;
    const avgMin = secondsToMinutesDecimal(payload.filteredStudyAvgSeconds);
    const blocks: Array<Array<unknown>> = [
      ['CENTRAL DE ESTUDOS - RELATORIO DE DESEMPENHO'],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      [
        'Filtros ativos (Tempo)',
        `Periodo: ${payload.filters.periodLabel} | Dia: ${payload.filters.weekdayFilter} | Disciplina: ${
          payload.filters.timeSubjectFilter === 'Todas'
            ? 'Todas'
            : visibleName(payload.filters.timeSubjectFilter)
        }`,
      ],
      [
        'Filtros ativos (Disciplinas)',
        `Disciplina: ${
          payload.filters.subjectFilter === 'Todas'
            ? 'Todas'
            : visibleName(payload.filters.subjectFilter)
        }${payload.filters.subjectSearch ? ` | Busca: ${payload.filters.subjectSearch}` : ''}`,
      ],
      [],
      ['RESUMO GERAL'],
      ['Metrica', 'Valor'],
      ['Questoes respondidas', payload.totalAnswered],
      ['Total de acertos', payload.totalCorrect],
      ['Total de erros', payload.totalWrong],
      ['Aproveitamento geral (%)', payload.accuracy],
      ['Simulados concluidos', payload.completedSimulationsCount],
      ['Tempo total estudado', formatClock(payload.totalStudySeconds)],
      ['Tempo estudado no filtro', formatClock(payload.filteredStudyTotalSeconds)],
      ['Dias ativos no filtro', payload.filteredStudyActiveDays],
      ['Media por dia ativo no filtro', `${formatClock(payload.filteredStudyAvgSeconds)} (${avgMin} min)`],
      [],
      ['DESEMPENHO POR DISCIPLINA'],
      ...buildSubjectsTable(payload.subjectRows, delimiter),
      [],
      ['APROVEITAMENTO POR BANCA'],
      ...buildBanksTable(payload.bankRows),
      [],
      ['EVOLUCAO DIARIA (ULTIMOS 14 DIAS)'],
      ...buildDailyEvolutionTable(payload.dailySeries, delimiter),
      [],
      ['TEMPO ESTUDADO POR DATA (FILTRADO)'],
      ['Data', 'Dia da Semana', 'Total (HH:MM:SS)', 'Total (min)', 'Detalhe por Disciplina'],
      ...payload.filteredStudyByDate.map((d) => [
        formatIsoBr(d.date),
        d.day,
        formatClock(d.seconds),
        secondsToMinutesNumeric(d.seconds, delimiter),
        Object.entries(d.subjects)
          .map(([subj, sec]) => `${visibleName(subj)}: ${formatClock(sec)}`)
          .join(' | '),
      ]),
      [],
      ['SESSOES DETALHADAS DE ESTUDO (FILTRADO)'],
      ...buildStudySessionsTable(payload.filteredStudySessions, delimiter),
      [],
      ['SIMULADOS CONCLUIDOS'],
      ...buildSimulationsTable(payload.completedSimulations, delimiter),
    ];
    rows = blocks;
  }

  const csvBody = toCsvLines(rows, delimiter);
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvBody], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);

  return { filename, rowCount: Math.max(0, rows.length - 1) };
}
