import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { StudyDatabase } from '../../types/study';
import {
  formatClock,
  inferFixedSubjectFromTopic,
  localDateIso,
  visibleName,
} from '../../lib/parsers';
import { Panel } from '../ui/PageHeader';
import { useContainerWidth } from './d3Utils';

// Clean gov.br-inspired high-contrast categorical palette (legible on light & dark panels)
const GOV_SUBJECT_PALETTE = [
  '#2563eb', // Cobalt blue
  '#16a34a', // Institutional green
  '#d97706', // Amber gold
  '#0d9488', // Teal
  '#dc2626', // Crimson
  '#7c3aed', // Indigo violet
  '#0284c7', // Sky blue
  '#db2777', // Magenta
];

function parseIsoLocalDate(iso?: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatWeekLabel(monday: Date): string {
  const dd = String(monday.getDate()).padStart(2, '0');
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function formatWeekRangeLabel(monday: Date): string {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return `${formatWeekLabel(monday)} a ${formatWeekLabel(sunday)}`;
}

// ============================================================================
// 1. D3 Multi-Series Chart: Evolução da Taxa de Acertos por Matéria (Semanal)
// ============================================================================

type SubjectWeeksWindow = 6 | 12 | 24;

interface SubjectWeekStat {
  weekIso: string;
  weekLabel: string;
  weekRange: string;
  answered: number;
  correct: number;
  accuracyPct: number | null;
}

interface SubjectSeries {
  subject: string;
  displayName: string;
  color: string;
  totalAnswered: number;
  totalCorrect: number;
  overallPct: number;
  deltaPp: number | null;
  points: SubjectWeekStat[];
}

interface SubjectAccuracyEvolutionD3ChartProps {
  db: StudyDatabase;
  fixedSubjects: string[];
  selectedSubject: string;
  onSelectSubject?: (subject: string) => void;
}

export const SubjectAccuracyEvolutionD3Chart: React.FC<SubjectAccuracyEvolutionD3ChartProps> =
  React.memo(({ db, fixedSubjects, selectedSubject, onSelectSubject }) => {
    const [weeksCount, setWeeksCount] = useState<SubjectWeeksWindow>(12);
    const [hiddenSubjects, setHiddenSubjects] = useState<string[]>([]);
    const [focusedSubject, setFocusedSubject] = useState<string | null>(null);
    const [hoveredWeekIdx, setHoveredWeekIdx] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const width = useContainerWidth(containerRef, 600);

    const { weeks, allSubjectSeries } = useMemo(() => {
      const currentMonday = getMondayOfWeek(new Date());
      const weekBuckets: Array<{ iso: string; monday: Date; label: string; range: string }> = [];
      const weekIndexByIso = new Map<string, number>();

      for (let i = weeksCount - 1; i >= 0; i--) {
        const m = new Date(
          currentMonday.getFullYear(),
          currentMonday.getMonth(),
          currentMonday.getDate() - i * 7,
        );
        const iso = localDateIso(m);
        weekIndexByIso.set(iso, weekBuckets.length);
        weekBuckets.push({
          iso,
          monday: m,
          label: formatWeekLabel(m),
          range: formatWeekRangeLabel(m),
        });
      }

      const subjectAgg = new Map<
        string,
        {
          totalAnswered: number;
          totalCorrect: number;
          perWeek: Array<{ answered: number; correct: number }>;
        }
      >();

      const resolveSubj = (raw?: string) => {
        const clean = (raw || 'Geral').trim();
        return inferFixedSubjectFromTopic({ materia: clean }, fixedSubjects) || clean;
      };

      for (const h of db.history) {
        const d = parseIsoLocalDate(h.date);
        if (!d) continue;
        const wkIso = localDateIso(getMondayOfWeek(d));
        const wkIdx = weekIndexByIso.get(wkIso);
        if (wkIdx === undefined) continue;

        const subj = resolveSubj(h.subject);
        let entry = subjectAgg.get(subj);
        if (!entry) {
          entry = {
            totalAnswered: 0,
            totalCorrect: 0,
            perWeek: weekBuckets.map(() => ({ answered: 0, correct: 0 })),
          };
          subjectAgg.set(subj, entry);
        }
        entry.totalAnswered += 1;
        if (h.correct) entry.totalCorrect += 1;
        entry.perWeek[wkIdx].answered += 1;
        if (h.correct) entry.perWeek[wkIdx].correct += 1;
      }

      const sortedSubjects = [...subjectAgg.entries()]
        .filter(([, data]) => data.totalAnswered > 0)
        .sort((a, b) => b[1].totalAnswered - a[1].totalAnswered)
        .slice(0, 8);

      const series: SubjectSeries[] = sortedSubjects.map(([subject, data], idx) => {
        const points: SubjectWeekStat[] = weekBuckets.map((wk, wIdx) => {
          const cell = data.perWeek[wIdx];
          return {
            weekIso: wk.iso,
            weekLabel: wk.label,
            weekRange: wk.range,
            answered: cell.answered,
            correct: cell.correct,
            accuracyPct:
              cell.answered > 0 ? Math.round((cell.correct / cell.answered) * 1000) / 10 : null,
          };
        });

        const activePts = points.filter((p) => p.accuracyPct !== null);
        let deltaPp: number | null = null;
        if (activePts.length >= 2) {
          const split = Math.max(1, Math.floor(activePts.length / 2));
          const firstHalf = activePts.slice(0, split);
          const secondHalf = activePts.slice(split);
          const firstAns = d3.sum(firstHalf, (p) => p.answered);
          const firstCor = d3.sum(firstHalf, (p) => p.correct);
          const secondAns = d3.sum(secondHalf, (p) => p.answered);
          const secondCor = d3.sum(secondHalf, (p) => p.correct);
          if (firstAns > 0 && secondAns > 0) {
            deltaPp = Math.round((secondCor / secondAns - firstCor / firstAns) * 100);
          }
        }

        return {
          subject,
          displayName: visibleName(subject),
          color: GOV_SUBJECT_PALETTE[idx % GOV_SUBJECT_PALETTE.length],
          totalAnswered: data.totalAnswered,
          totalCorrect: data.totalCorrect,
          overallPct: Math.round((data.totalCorrect / data.totalAnswered) * 100),
          deltaPp,
          points,
        };
      });

      return { weeks: weekBuckets, allSubjectSeries: series };
    }, [db.history, fixedSubjects, weeksCount]);

    const visibleSeries = useMemo(() => {
      if (selectedSubject && selectedSubject !== 'Todas') {
        const match = allSubjectSeries.filter((s) => s.subject === selectedSubject);
        if (match.length > 0) return match;
      }
      if (focusedSubject) {
        const match = allSubjectSeries.filter((s) => s.subject === focusedSubject);
        if (match.length > 0) return match;
      }
      const hiddenSet = new Set(hiddenSubjects);
      return allSubjectSeries.filter((s) => !hiddenSet.has(s.subject));
    }, [allSubjectSeries, focusedSubject, hiddenSubjects, selectedSubject]);

    const summaryStats = useMemo(() => {
      const topImprover =
        [...visibleSeries]
          .filter((s) => s.deltaPp !== null)
          .sort((a, b) => (b.deltaPp ?? -999) - (a.deltaPp ?? -999))[0] ?? null;
      const leader =
        [...visibleSeries].sort((a, b) => b.overallPct - a.overallPct)[0] ?? null;
      const totalAns = d3.sum(visibleSeries, (s) => s.totalAnswered);
      const totalCor = d3.sum(visibleSeries, (s) => s.totalCorrect);
      return {
        topImprover,
        leader,
        avgPct: totalAns > 0 ? Math.round((totalCor / totalAns) * 100) : null,
      };
    }, [visibleSeries]);

    const height = 258;
    const margin = { top: 16, right: 20, bottom: 32, left: 42 };
    const innerW = Math.max(220, width - margin.left - margin.right);
    const innerH = height - margin.top - margin.bottom;

    const { xScale, yScale, seriesPaths, xTickIndices } = useMemo(() => {
      const x = d3
        .scalePoint<number>()
        .domain(weeks.map((_, i) => i))
        .range([0, innerW])
        .padding(0.35);

      const y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

      const lineGen = d3
        .line<{ idx: number; val: number }>()
        .x((d) => x(d.idx) ?? 0)
        .y((d) => y(d.val))
        .curve(d3.curveMonotoneX);

      const paths = visibleSeries.map((s) => {
        const activePoints = s.points
          .map((pt, idx) =>
            pt.accuracyPct !== null ? { idx, val: pt.accuracyPct, pt } : null,
          )
          .filter((item): item is { idx: number; val: number; pt: SubjectWeekStat } => item !== null);
        return {
          subject: s.subject,
          color: s.color,
          pathD: activePoints.length >= 2 ? lineGen(activePoints) || '' : '',
          activePoints,
        };
      });

      const maxTicks = Math.max(4, Math.min(8, Math.floor(innerW / 68)));
      const step = Math.max(1, Math.ceil(weeks.length / maxTicks));
      const ticks: number[] = [];
      for (let i = 0; i < weeks.length; i += step) ticks.push(i);
      if (weeks.length > 1 && ticks[ticks.length - 1] !== weeks.length - 1) {
        ticks.push(weeks.length - 1);
      }

      return { xScale: x, yScale: y, seriesPaths: paths, xTickIndices: ticks };
    }, [innerH, innerW, visibleSeries, weeks]);

    const hoveredWeek = hoveredWeekIdx !== null ? weeks[hoveredWeekIdx] : null;
    const hoveredWeekX = hoveredWeekIdx !== null ? xScale(hoveredWeekIdx) ?? 0 : 0;
    const hoveredBreakdown = useMemo(() => {
      if (hoveredWeekIdx === null) return [];
      return visibleSeries
        .map((s) => ({
          subject: s.subject,
          displayName: s.displayName,
          color: s.color,
          stat: s.points[hoveredWeekIdx],
        }))
        .filter((row) => row.stat && row.stat.answered > 0)
        .sort((a, b) => (b.stat.accuracyPct ?? 0) - (a.stat.accuracyPct ?? 0));
    }, [hoveredWeekIdx, visibleSeries]);

    const toggleSubjectVisibility = (subj: string) => {
      if (selectedSubject !== 'Todas' && onSelectSubject) {
        onSelectSubject('Todas');
        setFocusedSubject(subj);
        return;
      }
      if (focusedSubject === subj) {
        setFocusedSubject(null);
        return;
      }
      setHiddenSubjects((prev) =>
        prev.includes(subj) ? prev.filter((item) => item !== subj) : [...prev, subj],
      );
    };

    return (
      <Panel
        className="mb-0"
        title="Evolução da Taxa de Acertos por Matéria"
        subtitle="Curva comparativa semanal de aproveitamento (%) por disciplina frente à meta de 80%."
        action={
          <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
            {([6, 12, 24] as const).map((wk) => (
              <button
                key={wk}
                type="button"
                onClick={() => setWeeksCount(wk)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  weeksCount === wk
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {wk} sem
              </button>
            ))}
          </div>
        }
      >
        {/* Clean gov-style summary metrics */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5 text-[11.5px]">
          <div className="flex flex-wrap items-center gap-3.5 font-mono-num">
            <span className="text-[var(--muted)] inline-flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" />
              Média selecionada:{' '}
              <strong className="text-[var(--text)]">
                {summaryStats.avgPct !== null ? `${summaryStats.avgPct}%` : '—'}
              </strong>
            </span>
            {summaryStats.leader && (
              <span className="text-[var(--muted)]">
                Maior taxa:{' '}
                <strong className="text-[var(--good)]">
                  {summaryStats.leader.displayName} ({summaryStats.leader.overallPct}%)
                </strong>
              </span>
            )}
            {summaryStats.topImprover && summaryStats.topImprover.deltaPp !== null && (
              <span className="text-[var(--muted)]">
                Tendência:{' '}
                <strong
                  className={
                    summaryStats.topImprover.deltaPp >= 0
                      ? 'text-[var(--good)]'
                      : 'text-[var(--bad)]'
                  }
                >
                  {summaryStats.topImprover.displayName}{' '}
                  {summaryStats.topImprover.deltaPp >= 0
                    ? `+${summaryStats.topImprover.deltaPp}`
                    : summaryStats.topImprover.deltaPp}
                  pp
                </strong>
              </span>
            )}
          </div>
        </div>

        {/* Interactive subject legend pills */}
        {allSubjectSeries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {allSubjectSeries.map((s) => {
              const isVisible = visibleSeries.some((v) => v.subject === s.subject);
              return (
                <button
                  key={s.subject}
                  type="button"
                  onClick={() => toggleSubjectVisibility(s.subject)}
                  onDoubleClick={() =>
                    setFocusedSubject((prev) => (prev === s.subject ? null : s.subject))
                  }
                  title="Clique para ocultar/exibir esta matéria (duplo clique isola)"
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold transition-all cursor-pointer ${
                    isVisible
                      ? 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)]'
                      : 'border-[var(--line)] bg-transparent text-[var(--muted)] opacity-55'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate max-w-[140px]">{s.displayName}</span>
                  <span className="font-mono-num text-[10px] text-[var(--muted)]">
                    {s.overallPct}%
                  </span>
                </button>
              );
            })}
            {(hiddenSubjects.length > 0 || focusedSubject) && (
              <button
                type="button"
                onClick={() => {
                  setHiddenSubjects([]);
                  setFocusedSubject(null);
                }}
                className="text-[11px] font-bold text-[var(--accent)] hover:underline px-1.5"
              >
                Restaurar todas
              </button>
            )}
          </div>
        )}

        <div ref={containerRef} className="relative w-full select-none">
          {allSubjectSeries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-10 px-4 text-center text-[12.5px] text-[var(--muted)]">
              Responda questões nas últimas semanas para acompanhar a evolução comparativa por matéria.
            </div>
          ) : (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label="Gráfico dinâmico de evolução semanal da taxa de acertos por matéria"
              className="block overflow-visible"
              onMouseLeave={() => setHoveredWeekIdx(null)}
            >
              <g transform={`translate(${margin.left},${margin.top})`}>
                {/* Horizontal gridlines */}
                {[0, 25, 50, 75, 100].map((tick) => {
                  const y = yScale(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={0}
                        x2={innerW}
                        y1={y}
                        y2={y}
                        stroke="var(--line)"
                        strokeOpacity={tick === 0 ? 0.9 : 0.45}
                      />
                      <text
                        x={-8}
                        y={y + 3.5}
                        textAnchor="end"
                        fontSize={10}
                        fill="var(--muted)"
                        className="font-mono-num"
                      >
                        {tick}%
                      </text>
                    </g>
                  );
                })}

                {/* 80% institutional target line */}
                <line
                  x1={0}
                  x2={innerW}
                  y1={yScale(80)}
                  y2={yScale(80)}
                  stroke="var(--warning)"
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                />
                <text
                  x={innerW - 4}
                  y={yScale(80) - 5}
                  textAnchor="end"
                  fontSize={9.5}
                  fontWeight={700}
                  fill="var(--warning)"
                  className="font-mono-num"
                >
                  Meta 80%
                </text>

                {/* Crosshair guide */}
                {hoveredWeekIdx !== null && (
                  <line
                    x1={hoveredWeekX}
                    x2={hoveredWeekX}
                    y1={0}
                    y2={innerH}
                    stroke="var(--line-strong)"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Subject lines & data points */}
                {seriesPaths.map((sp) => (
                  <g key={sp.subject}>
                    {sp.pathD && (
                      <path
                        d={sp.pathD}
                        fill="none"
                        stroke={sp.color}
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity={0.92}
                      />
                    )}
                    {sp.activePoints.map((pt) => {
                      const cx = xScale(pt.idx) ?? 0;
                      const cy = yScale(pt.val);
                      const isHovered = hoveredWeekIdx === pt.idx;
                      return (
                        <circle
                          key={`${sp.subject}-${pt.idx}`}
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 4.8 : 3.2}
                          fill={pt.pt.answered >= 3 ? sp.color : 'var(--panel)'}
                          stroke={sp.color}
                          strokeWidth={pt.pt.answered >= 3 ? 1.5 : 2}
                        />
                      );
                    })}
                  </g>
                ))}

                {/* X axis week labels */}
                {xTickIndices.map((idx) => {
                  const wk = weeks[idx];
                  if (!wk) return null;
                  const x = xScale(idx) ?? 0;
                  return (
                    <text
                      key={wk.iso}
                      x={x}
                      y={innerH + 18}
                      textAnchor="middle"
                      fontSize={10}
                      fill={hoveredWeekIdx === idx ? 'var(--text)' : 'var(--muted)'}
                      fontWeight={hoveredWeekIdx === idx ? 700 : 500}
                      className="font-mono-num"
                    >
                      {wk.label}
                    </text>
                  );
                })}

                {/* Transparent hover bands per week */}
                {weeks.map((wk, idx) => {
                  const xCenter = xScale(idx) ?? 0;
                  const bandW = weeks.length > 1 ? innerW / weeks.length : innerW;
                  return (
                    <rect
                      key={`hover-${wk.iso}`}
                      x={Math.max(0, xCenter - bandW / 2)}
                      y={0}
                      width={bandW}
                      height={innerH}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoveredWeekIdx(idx)}
                    />
                  );
                })}
              </g>
            </svg>
          )}

          {/* Clean floating tooltip */}
          {hoveredWeek && (
            <div
              className="pointer-events-none absolute top-2 z-20 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)]/95 px-3 py-2 text-[11px] shadow-lg min-w-[205px]"
              style={{
                left:
                  hoveredWeekX + margin.left > width * 0.58
                    ? Math.max(8, hoveredWeekX + margin.left - 220)
                    : Math.min(width - 215, hoveredWeekX + margin.left + 12),
              }}
            >
              <div className="font-bold text-[var(--text)] mb-1 font-mono-num">
                Semana {hoveredWeek.range}
              </div>
              {hoveredBreakdown.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {hoveredBreakdown.map((item) => (
                    <div
                      key={item.subject}
                      className="flex items-center justify-between gap-3 font-mono-num"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[var(--muted)] truncate max-w-[125px] font-sans">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.displayName}
                      </span>
                      <span className="font-bold text-[var(--text)]">
                        {item.stat.accuracyPct}%{' '}
                        <span className="text-[10px] font-normal text-[var(--muted)]">
                          ({item.stat.correct}/{item.stat.answered})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[var(--muted)]">Sem questões resolvidas nesta semana</div>
              )}
            </div>
          )}
        </div>
      </Panel>
    );
  });

// ============================================================================
// 2. D3 Bar / Stacked Chart: Tempo de Estudo Semanal (Horas Líquidas)
// ============================================================================

type WeeklyHoursWindow = 8 | 12 | 16;
type WeeklyChartMode = 'total' | 'stacked';

interface WeeklyStudyBucket {
  iso: string;
  label: string;
  range: string;
  totalSeconds: number;
  sessions: number;
  activeDays: number;
  bySubject: Record<string, number>;
  topSubjects: Array<{ subject: string; seconds: number }>;
  isCurrentWeek: boolean;
}

interface WeeklyStudyHoursD3ChartProps {
  db: StudyDatabase;
  fixedSubjects: string[];
  subjectFilter?: string;
}

export const WeeklyStudyHoursD3Chart: React.FC<WeeklyStudyHoursD3ChartProps> = React.memo(
  ({ db, fixedSubjects, subjectFilter = 'Todas' }) => {
    const [weeksCount, setWeeksCount] = useState<WeeklyHoursWindow>(12);
    const [mode, setMode] = useState<WeeklyChartMode>('stacked');
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const width = useContainerWidth(containerRef, 600);

    const { buckets, stackedSubjects, summary } = useMemo(() => {
      const currentMonday = getMondayOfWeek(new Date());
      const currentMondayIso = localDateIso(currentMonday);
      const list: WeeklyStudyBucket[] = [];
      const indexByIso = new Map<string, number>();
      const activeDaySets: Array<Set<string>> = [];

      for (let i = weeksCount - 1; i >= 0; i--) {
        const m = new Date(
          currentMonday.getFullYear(),
          currentMonday.getMonth(),
          currentMonday.getDate() - i * 7,
        );
        const iso = localDateIso(m);
        indexByIso.set(iso, list.length);
        activeDaySets.push(new Set<string>());
        list.push({
          iso,
          label: formatWeekLabel(m),
          range: formatWeekRangeLabel(m),
          totalSeconds: 0,
          sessions: 0,
          activeDays: 0,
          bySubject: {},
          topSubjects: [],
          isCurrentWeek: iso === currentMondayIso,
        });
      }

      const resolveSubj = (raw?: string) => {
        const clean = (raw || 'Geral').trim();
        return inferFixedSubjectFromTopic({ materia: clean }, fixedSubjects) || clean;
      };

      const totalBySubjectOverall = new Map<string, number>();

      for (const rec of db.studyTimeRecords) {
        const d = parseIsoLocalDate(rec.date);
        if (!d) continue;
        const wkIso = localDateIso(getMondayOfWeek(d));
        const idx = indexByIso.get(wkIso);
        if (idx === undefined) continue;

        let recSeconds = 0;
        const bucket = list[idx];
        for (const a of rec.allocations) {
          const subj = resolveSubj(a.subject);
          if (subjectFilter !== 'Todas' && subj !== subjectFilter) continue;
          const sec = a.seconds || 0;
          if (sec <= 0) continue;
          recSeconds += sec;
          bucket.bySubject[subj] = (bucket.bySubject[subj] || 0) + sec;
          totalBySubjectOverall.set(subj, (totalBySubjectOverall.get(subj) || 0) + sec);
        }

        if (recSeconds > 0) {
          bucket.totalSeconds += recSeconds;
          bucket.sessions += 1;
          activeDaySets[idx].add(rec.date);
        }
      }

      list.forEach((b, idx) => {
        b.activeDays = activeDaySets[idx].size;
        b.topSubjects = Object.entries(b.bySubject)
          .map(([subject, seconds]) => ({ subject, seconds }))
          .sort((a, b) => b.seconds - a.seconds);
      });

      const topStackList = [...totalBySubjectOverall.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([subject], i) => ({
          subject,
          displayName: visibleName(subject),
          color: GOV_SUBJECT_PALETTE[i % GOV_SUBJECT_PALETTE.length],
        }));

      const nonZeroWeeks = list.filter((b) => b.totalSeconds > 0);
      const currentWeekSec = list[list.length - 1]?.totalSeconds ?? 0;
      const prevWeekSec = list.length >= 2 ? list[list.length - 2].totalSeconds : 0;
      const avgSec = nonZeroWeeks.length
        ? Math.round(d3.sum(nonZeroWeeks, (b) => b.totalSeconds) / nonZeroWeeks.length)
        : 0;
      const bestWeekSec = d3.max(list, (b) => b.totalSeconds) ?? 0;
      const wowPct =
        prevWeekSec > 0 ? Math.round(((currentWeekSec - prevWeekSec) / prevWeekSec) * 100) : null;

      return {
        buckets: list,
        stackedSubjects: topStackList,
        summary: {
          currentWeekSec,
          avgSec,
          bestWeekSec,
          wowPct,
          hasData: nonZeroWeeks.length > 0,
        },
      };
    }, [db.studyTimeRecords, fixedSubjects, subjectFilter, weeksCount]);

    const height = 258;
    const margin = { top: 18, right: 16, bottom: 32, left: 46 };
    const innerW = Math.max(220, width - margin.left - margin.right);
    const innerH = height - margin.top - margin.bottom;

    const { xScale, yScale, maxHours, stackedSegments } = useMemo(() => {
      const x = d3
        .scaleBand<number>()
        .domain(buckets.map((_, i) => i))
        .range([0, innerW])
        .padding(0.28);

      const rawMaxH = Math.max(2, (d3.max(buckets, (b) => b.totalSeconds) ?? 0) / 3600);
      const y = d3.scaleLinear().domain([0, rawMaxH * 1.15]).nice().range([innerH, 0]);
      const topSubjectsSet = new Set(stackedSubjects.map((s) => s.subject));

      const segmentsByWeek = buckets.map((b) => {
        let accHours = 0;
        const segs: Array<{
          key: string;
          label: string;
          color: string;
          y0: number;
          y1: number;
          seconds: number;
        }> = [];

        for (const st of stackedSubjects) {
          const sec = b.bySubject[st.subject] || 0;
          if (sec <= 0) continue;
          const hrs = sec / 3600;
          segs.push({
            key: st.subject,
            label: st.displayName,
            color: st.color,
            y0: accHours,
            y1: accHours + hrs,
            seconds: sec,
          });
          accHours += hrs;
        }

        const otherSec = Object.entries(b.bySubject).reduce(
          (sum, [subj, sec]) => (topSubjectsSet.has(subj) ? sum : sum + sec),
          0,
        );
        if (otherSec > 0) {
          const hrs = otherSec / 3600;
          segs.push({
            key: '__other__',
            label: 'Outras matérias',
            color: '#64748b',
            y0: accHours,
            y1: accHours + hrs,
            seconds: otherSec,
          });
        }
        return segs;
      });

      return {
        xScale: x,
        yScale: y,
        maxHours: rawMaxH,
        stackedSegments: segmentsByWeek,
      };
    }, [buckets, innerH, innerW, stackedSubjects]);

    const avgHours = summary.avgSec / 3600;
    const hovered = hoveredIdx !== null ? buckets[hoveredIdx] : null;
    const hoveredCenter =
      hoveredIdx !== null ? (xScale(hoveredIdx) ?? 0) + xScale.bandwidth() / 2 : 0;

    return (
      <Panel
        className="mb-0"
        title="Tempo de Estudo Semanal (Horas Líquidas)"
        subtitle={
          subjectFilter === 'Todas'
            ? 'Carga horária consolidada por semana (segunda a domingo) com média do período.'
            : `Filtro ativo: ${visibleName(subjectFilter)} · Carga horária semanal acumulada.`
        }
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {stackedSubjects.length > 1 && (
              <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('stacked')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                    mode === 'stacked'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Por matéria
                </button>
                <button
                  type="button"
                  onClick={() => setMode('total')}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                    mode === 'total'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Total
                </button>
              </div>
            )}
            <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
              {([8, 12, 16] as const).map((wk) => (
                <button
                  key={wk}
                  type="button"
                  onClick={() => setWeeksCount(wk)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                    weeksCount === wk
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {wk} sem
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5 text-[11.5px]">
          <div className="flex flex-wrap items-center gap-3.5 font-mono-num">
            <span className="text-[var(--muted)] inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
              Esta semana:{' '}
              <strong className="text-[var(--text)]">{formatClock(summary.currentWeekSec)}</strong>
              {summary.wowPct !== null && (
                <span
                  className={`ml-1 font-bold ${
                    summary.wowPct >= 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'
                  }`}
                >
                  ({summary.wowPct >= 0 ? `+${summary.wowPct}%` : `${summary.wowPct}%`} vs ant.)
                </span>
              )}
            </span>
            <span className="text-[var(--muted)]">
              Média/sem:{' '}
              <strong className="text-[var(--accent)]">{formatClock(summary.avgSec)}</strong>
            </span>
            <span className="text-[var(--muted)] inline-flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-[var(--good)]" />
              Recorde:{' '}
              <strong className="text-[var(--good)]">{formatClock(summary.bestWeekSec)}</strong>
            </span>
          </div>
        </div>

        {/* Stacked legend */}
        {mode === 'stacked' && stackedSubjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 mb-3 text-[11px] text-[var(--muted)]">
            {stackedSubjects.map((st) => (
              <span key={st.subject} className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: st.color }}
                />
                <span className="truncate max-w-[130px]">{st.displayName}</span>
              </span>
            ))}
          </div>
        )}

        <div ref={containerRef} className="relative w-full select-none">
          {!summary.hasData ? (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-10 px-4 text-center text-[12.5px] text-[var(--muted)]">
              Registre blocos de tempo no Cronômetro ou Cronograma para visualizar a carga horária semanal.
            </div>
          ) : (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label="Gráfico de barras de tempo de estudo semanal em horas"
              className="block overflow-visible"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <g transform={`translate(${margin.left},${margin.top})`}>
                {/* Horizontal grid */}
                {yScale.ticks(5).map((tick) => {
                  const y = yScale(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={0}
                        x2={innerW}
                        y1={y}
                        y2={y}
                        stroke="var(--line)"
                        strokeOpacity={tick === 0 ? 0.9 : 0.45}
                      />
                      <text
                        x={-8}
                        y={y + 3.5}
                        textAnchor="end"
                        fontSize={10}
                        fill="var(--muted)"
                        className="font-mono-num"
                      >
                        {Number.isInteger(tick) ? `${tick}h` : `${tick.toFixed(1)}h`}
                      </text>
                    </g>
                  );
                })}

                {/* Weekly average dashed line */}
                {avgHours > 0 && avgHours <= maxHours * 1.15 && (
                  <g>
                    <line
                      x1={0}
                      x2={innerW}
                      y1={yScale(avgHours)}
                      y2={yScale(avgHours)}
                      stroke="var(--accent)"
                      strokeWidth={1.25}
                      strokeDasharray="4 4"
                    />
                    <text
                      x={innerW - 4}
                      y={yScale(avgHours) - 5}
                      textAnchor="end"
                      fontSize={9.5}
                      fontWeight={700}
                      fill="var(--accent)"
                      className="font-mono-num"
                    >
                      Média {avgHours.toFixed(1)}h/sem
                    </text>
                  </g>
                )}

                {/* Bars */}
                {buckets.map((b, idx) => {
                  const x = xScale(idx) ?? 0;
                  const bw = xScale.bandwidth();
                  const totalHrs = b.totalSeconds / 3600;
                  const barTop = yScale(totalHrs);
                  const barH = Math.max(0, innerH - barTop);
                  const isHovered = hoveredIdx === idx;
                  const segs = stackedSegments[idx] || [];

                  return (
                    <g
                      key={b.iso}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIdx(idx)}
                    >
                      {isHovered && (
                        <rect
                          x={x - 3}
                          y={0}
                          width={bw + 6}
                          height={innerH}
                          rx={4}
                          fill="var(--accent)"
                          fillOpacity={0.07}
                        />
                      )}

                      {mode === 'stacked' && segs.length > 0 ? (
                        segs.map((seg) => {
                          const yTop = yScale(seg.y1);
                          const yBottom = yScale(seg.y0);
                          const segH = Math.max(0, yBottom - yTop);
                          return (
                            <rect
                              key={seg.key}
                              x={x}
                              y={yTop}
                              width={bw}
                              height={segH}
                              fill={seg.color}
                              fillOpacity={isHovered ? 0.95 : 0.82}
                              stroke="var(--panel)"
                              strokeWidth={0.8}
                            />
                          );
                        })
                      ) : (
                        <rect
                          x={x}
                          y={barTop}
                          width={bw}
                          height={barH}
                          rx={3}
                          fill={b.isCurrentWeek ? 'var(--good)' : 'var(--accent)'}
                          fillOpacity={isHovered ? 0.95 : b.isCurrentWeek ? 0.85 : 0.72}
                        />
                      )}

                      {/* Top hours label for active weeks */}
                      {b.totalSeconds > 0 && (bw >= 24 || isHovered) && (
                        <text
                          x={x + bw / 2}
                          y={Math.max(10, barTop - 5)}
                          textAnchor="middle"
                          fontSize={9.5}
                          fontWeight={700}
                          fill={b.isCurrentWeek ? 'var(--good)' : 'var(--text)'}
                          className="font-mono-num"
                        >
                          {totalHrs >= 1
                            ? `${totalHrs.toFixed(1)}h`
                            : `${Math.round(b.totalSeconds / 60)}m`}
                        </text>
                      )}

                      {/* X tick label */}
                      {(buckets.length <= 12 || idx % 2 === 0 || b.isCurrentWeek) && (
                        <text
                          x={x + bw / 2}
                          y={innerH + 18}
                          textAnchor="middle"
                          fontSize={9.5}
                          fontWeight={b.isCurrentWeek || isHovered ? 700 : 500}
                          fill={
                            b.isCurrentWeek
                              ? 'var(--accent)'
                              : isHovered
                                ? 'var(--text)'
                                : 'var(--muted)'
                          }
                          className="font-mono-num"
                        >
                          {b.isCurrentWeek ? 'Atual' : b.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Tooltip */}
          {hovered && (
            <div
              className="pointer-events-none absolute top-2 z-20 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)]/95 px-3 py-2 text-[11px] shadow-lg min-w-[205px]"
              style={{
                left:
                  hoveredCenter + margin.left > width * 0.58
                    ? Math.max(8, hoveredCenter + margin.left - 220)
                    : Math.min(width - 215, hoveredCenter + margin.left + 12),
              }}
            >
              <div className="font-bold text-[var(--text)] mb-1 font-mono-num">
                {hovered.isCurrentWeek ? 'Semana Atual · ' : 'Semana '}
                {hovered.range}
              </div>
              <div className="flex items-center justify-between gap-3 font-mono-num mb-1">
                <span className="text-[var(--muted)] font-sans">Total estudado:</span>
                <strong className="text-[var(--accent)]">{formatClock(hovered.totalSeconds)}</strong>
              </div>
              <div className="text-[10.5px] text-[var(--muted)] font-mono-num mb-1.5">
                {hovered.sessions} sessão(ões) · {hovered.activeDays} dia(s) ativo(s)
              </div>
              {hovered.topSubjects.length > 0 && (
                <div className="pt-1 border-t border-[var(--line)] flex flex-col gap-0.5">
                  {hovered.topSubjects.slice(0, 4).map((item) => (
                    <div
                      key={item.subject}
                      className="flex items-center justify-between gap-2 font-mono-num text-[10.5px]"
                    >
                      <span className="text-[var(--muted)] truncate max-w-[125px] font-sans">
                        {visibleName(item.subject)}
                      </span>
                      <span className="font-semibold text-[var(--text)]">
                        {formatClock(item.seconds)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>
    );
  },
);
