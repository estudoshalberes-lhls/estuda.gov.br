import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Flame,
  Target,
  TrendingUp,
} from 'lucide-react';
import { StudyDatabase } from '../../types/study';
import {
  formatClock,
  inferFixedSubjectFromTopic,
  localDateIso,
  visibleName,
} from '../../lib/parsers';
import { Panel } from '../ui/PageHeader';
import {
  accuracyHeatColor,
  computeDistributionStats,
  formatIsoFullBr,
  formatIsoShortBr,
  useContainerWidth,
} from './d3Utils';

// ============================================================================
// 1. D3 Combo Chart: Evolução Temporal (Volume diário + Taxa de Acerto + MM7)
// ============================================================================

type EvolutionRange = '14d' | '30d' | '90d' | 'all';

interface DailyEvolutionPoint {
  iso: string;
  date: Date;
  answered: number;
  correct: number;
  wrong: number;
  accuracyPct: number | null;
  movingAvgPct: number | null;
  studySeconds: number;
  simulations: number;
}

interface PerformanceEvolutionD3ChartProps {
  db: StudyDatabase;
  subjectFilter?: string;
  fixedSubjects: string[];
}

export const PerformanceEvolutionD3Chart: React.FC<PerformanceEvolutionD3ChartProps> = ({
  db,
  subjectFilter = 'Todas',
  fixedSubjects,
}) => {
  const [range, setRange] = useState<EvolutionRange>('30d');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = useContainerWidth(containerRef, 680);

  const series = useMemo<DailyEvolutionPoint[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const resolveSubj = (raw?: string) => {
      const clean = (raw || 'Geral').trim();
      return inferFixedSubjectFromTopic({ materia: clean }, fixedSubjects) || clean;
    };

    const filteredHistory =
      subjectFilter === 'Todas'
        ? db.history
        : db.history.filter((h) => resolveSubj(h.subject) === subjectFilter);

    // Determine date span
    let startDate = new Date(today);
    if (range === '14d') startDate.setDate(today.getDate() - 13);
    else if (range === '30d') startDate.setDate(today.getDate() - 29);
    else if (range === '90d') startDate.setDate(today.getDate() - 89);
    else {
      const allIsos: string[] = [];
      filteredHistory.forEach((h) => h.date && allIsos.push(h.date));
      db.studyTimeRecords.forEach((r) => r.date && allIsos.push(r.date));
      allIsos.sort();
      if (allIsos.length) {
        const parsed = new Date(`${allIsos[0]}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
          startDate = parsed;
        } else {
          startDate.setDate(today.getDate() - 29);
        }
      } else {
        startDate.setDate(today.getDate() - 29);
      }
      // Cap very long spans to 180 days so bars stay readable
      const minAllowed = new Date(today);
      minAllowed.setDate(today.getDate() - 179);
      if (startDate < minAllowed) startDate = minAllowed;
    }

    const histByDate = new Map<string, { answered: number; correct: number }>();
    filteredHistory.forEach((h) => {
      const cur = histByDate.get(h.date) || { answered: 0, correct: 0 };
      cur.answered += 1;
      if (h.correct) cur.correct += 1;
      histByDate.set(h.date, cur);
    });

    const studyByDate = new Map<string, number>();
    db.studyTimeRecords.forEach((rec) => {
      const sec = rec.allocations.reduce((acc, a) => {
        if (subjectFilter !== 'Todas' && resolveSubj(a.subject) !== subjectFilter) return acc;
        return acc + a.seconds;
      }, 0);
      if (sec > 0) studyByDate.set(rec.date, (studyByDate.get(rec.date) || 0) + sec);
    });

    const simsByDate = new Map<string, number>();
    db.completedSimulations.forEach((sim) => {
      const iso = sim.criado_em?.slice(0, 10);
      if (iso) simsByDate.set(iso, (simsByDate.get(iso) || 0) + 1);
    });

    const days = d3.timeDays(startDate, d3.timeDay.offset(today, 1));
    const rawPoints: DailyEvolutionPoint[] = days.map((date) => {
      const iso = localDateIso(date);
      const h = histByDate.get(iso) || { answered: 0, correct: 0 };
      const acc = h.answered > 0 ? Math.round((h.correct / h.answered) * 1000) / 10 : null;
      return {
        iso,
        date,
        answered: h.answered,
        correct: h.correct,
        wrong: h.answered - h.correct,
        accuracyPct: acc,
        movingAvgPct: null,
        studySeconds: studyByDate.get(iso) || 0,
        simulations: simsByDate.get(iso) || 0,
      };
    });

    // 7-day weighted moving average of accuracy
    for (let i = 0; i < rawPoints.length; i++) {
      let winAnswered = 0;
      let winCorrect = 0;
      for (let j = Math.max(0, i - 6); j <= i; j++) {
        winAnswered += rawPoints[j].answered;
        winCorrect += rawPoints[j].correct;
      }
      rawPoints[i].movingAvgPct =
        winAnswered > 0 ? Math.round((winCorrect / winAnswered) * 1000) / 10 : null;
    }

    return rawPoints;
  }, [db.completedSimulations, db.history, db.studyTimeRecords, fixedSubjects, range, subjectFilter]);

  const activeDaysCount = useMemo(
    () => series.filter((p) => p.answered > 0).length,
    [series],
  );

  const periodStats = useMemo(() => {
    const totalAns = d3.sum(series, (d) => d.answered);
    const totalCor = d3.sum(series, (d) => d.correct);
    const avgAcc = totalAns > 0 ? Math.round((totalCor / totalAns) * 100) : null;
    const activeAccs = series.map((d) => d.accuracyPct).filter((v): v is number => v !== null);
    const latestMa = [...series].reverse().find((d) => d.movingAvgPct !== null)?.movingAvgPct ?? null;
    return {
      totalAns,
      avgAcc,
      latestMa,
      medianDailyAcc: activeAccs.length ? Math.round(d3.median(activeAccs) ?? 0) : null,
    };
  }, [series]);

  const height = 270;
  const margin = { top: 18, right: 44, bottom: 32, left: 42 };
  const innerW = Math.max(220, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const { xScale, yVolScale, yAccScale, accLinePath, maLinePath, maAreaPath, xTickIndices } =
    useMemo(() => {
      const x = d3
        .scaleBand<number>()
        .domain(series.map((_, i) => i))
        .range([0, innerW])
        .padding(series.length > 60 ? 0.15 : 0.28);

      const maxVol = Math.max(5, d3.max(series, (d) => d.answered) ?? 5);
      const yVol = d3.scaleLinear().domain([0, maxVol * 1.15]).nice().range([innerH, 0]);
      const yAcc = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

      const cx = (i: number) => (x(i) ?? 0) + x.bandwidth() / 2;

      const accLine = d3
        .line<DailyEvolutionPoint>()
        .defined((d) => d.accuracyPct !== null)
        .x((_, i) => cx(i))
        .y((d) => yAcc(d.accuracyPct as number))
        .curve(d3.curveMonotoneX);

      const maLine = d3
        .line<DailyEvolutionPoint>()
        .defined((d) => d.movingAvgPct !== null)
        .x((_, i) => cx(i))
        .y((d) => yAcc(d.movingAvgPct as number))
        .curve(d3.curveMonotoneX);

      const maArea = d3
        .area<DailyEvolutionPoint>()
        .defined((d) => d.movingAvgPct !== null)
        .x((_, i) => cx(i))
        .y0(innerH)
        .y1((d) => yAcc(d.movingAvgPct as number))
        .curve(d3.curveMonotoneX);

      const maxTicks = Math.max(3, Math.min(8, Math.floor(innerW / 72)));
      const step = Math.max(1, Math.ceil(series.length / maxTicks));
      const ticks: number[] = [];
      for (let i = 0; i < series.length; i += step) ticks.push(i);
      if (series.length > 1 && ticks[ticks.length - 1] !== series.length - 1) {
        ticks.push(series.length - 1);
      }

      return {
        xScale: x,
        yVolScale: yVol,
        yAccScale: yAcc,
        accLinePath: accLine(series) || '',
        maLinePath: maLine(series) || '',
        maAreaPath: maArea(series) || '',
        xTickIndices: ticks,
      };
    }, [innerH, innerW, series]);

  const hovered = hoveredIdx !== null ? series[hoveredIdx] : null;
  const hoveredX =
    hoveredIdx !== null ? (xScale(hoveredIdx) ?? 0) + xScale.bandwidth() / 2 : 0;

  return (
    <Panel
      className="mb-4"
      title="Evolução Temporal & Tendência de Acerto"
      subtitle={
        subjectFilter === 'Todas'
          ? 'Volume diário de questões (barras), taxa diária de acerto e média móvel de 7 dias frente à meta de 80%.'
          : `Filtro ativo: ${visibleName(subjectFilter)} · Volume diário, precisão e média móvel de 7 dias.`
      }
      action={
        <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
          {(
            [
              { id: '14d', label: '14d' },
              { id: '30d', label: '30d' },
              { id: '90d', label: '90d' },
              { id: 'all', label: 'Tudo' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRange(opt.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                range === opt.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      }
    >
      {/* Inline compact metrics + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-[11.5px]">
        <div className="flex flex-wrap items-center gap-4 font-mono-num">
          <span className="text-[var(--muted)]">
            Questões no período:{' '}
            <strong className="text-[var(--text)]">{periodStats.totalAns.toLocaleString('pt-BR')}</strong>
          </span>
          <span className="text-[var(--muted)]">
            Aproveitamento:{' '}
            <strong
              className={
                periodStats.avgAcc !== null && periodStats.avgAcc >= 80
                  ? 'text-[var(--good)]'
                  : 'text-[var(--text)]'
              }
            >
              {periodStats.avgAcc !== null ? `${periodStats.avgAcc}%` : '—'}
            </strong>
          </span>
          <span className="text-[var(--muted)]">
            Média móvel 7d:{' '}
            <strong className="text-[var(--accent)]">
              {periodStats.latestMa !== null ? `${periodStats.latestMa.toFixed(1)}%` : '—'}
            </strong>
          </span>
          <span className="text-[var(--muted)]">
            Mediana diária:{' '}
            <strong className="text-[var(--text)]">
              {periodStats.medianDailyAcc !== null ? `${periodStats.medianDailyAcc}%` : '—'}
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent)]/35 border border-[var(--accent)]/60" />
            Questões/dia
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-[var(--good)] rounded-full" />
            Acerto diário
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-[var(--accent)] rounded-full" />
            Média móvel 7d
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t border-dashed border-[var(--warning)]" />
            Meta 80%
          </span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full select-none">
        {activeDaysCount === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-10 px-4 text-center text-[12.5px] text-[var(--muted)]">
            Responda questões no Treino Diário ou Simulado Fechado para visualizar a curva de evolução e tendência.
          </div>
        ) : (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Gráfico de evolução temporal de volume de questões e taxa de acerto"
            className="block overflow-visible"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <defs>
              <linearGradient id="ce-evo-ma-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <g transform={`translate(${margin.left},${margin.top})`}>
              {/* Horizontal accuracy grid lines */}
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = yAccScale(tick);
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
                      x={innerW + 8}
                      y={y + 3.5}
                      fontSize={10}
                      fill="var(--muted)"
                      className="font-mono-num"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              {/* Left Y axis (question volume) */}
              {yVolScale.ticks(4).map((tick) => {
                const y = yVolScale(tick);
                return (
                  <text
                    key={tick}
                    x={-8}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--muted)"
                    className="font-mono-num"
                  >
                    {tick}
                  </text>
                );
              })}
              <text
                x={-8}
                y={-6}
                textAnchor="end"
                fontSize={9.5}
                fontWeight={700}
                fill="var(--muted)"
              >
                Qtd
              </text>
              <text
                x={innerW + 8}
                y={-6}
                fontSize={9.5}
                fontWeight={700}
                fill="var(--muted)"
              >
                Acerto
              </text>

              {/* Moving average subtle area */}
              {maAreaPath && <path d={maAreaPath} fill="url(#ce-evo-ma-grad)" />}

              {/* 80% approval reference line */}
              <line
                x1={0}
                x2={innerW}
                y1={yAccScale(80)}
                y2={yAccScale(80)}
                stroke="var(--warning)"
                strokeWidth={1.25}
                strokeDasharray="4 4"
                strokeOpacity={0.85}
              />
              <text
                x={4}
                y={yAccScale(80) - 4}
                fontSize={9.5}
                fontWeight={700}
                fill="var(--warning)"
              >
                Meta 80%
              </text>

              {/* Daily volume bars */}
              {series.map((d, i) => {
                if (d.answered <= 0) return null;
                const x = xScale(i) ?? 0;
                const y = yVolScale(d.answered);
                const barH = Math.max(2, innerH - y);
                const isHover = hoveredIdx === i;
                return (
                  <rect
                    key={d.iso}
                    x={x}
                    y={y}
                    width={Math.max(2, xScale.bandwidth())}
                    height={barH}
                    rx={Math.min(3, xScale.bandwidth() / 2)}
                    fill="var(--accent)"
                    fillOpacity={isHover ? 0.55 : 0.28}
                    stroke="var(--accent)"
                    strokeOpacity={isHover ? 0.95 : 0.45}
                    strokeWidth={isHover ? 1.2 : 0.6}
                  />
                );
              })}

              {/* Daily accuracy line */}
              {accLinePath && (
                <path
                  d={accLinePath}
                  fill="none"
                  stroke="var(--good)"
                  strokeWidth={1.8}
                  strokeOpacity={0.78}
                />
              )}

              {/* 7-day moving average line */}
              {maLinePath && (
                <path
                  d={maLinePath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2.4}
                />
              )}

              {/* Dots on active days when series is compact */}
              {series.length <= 45 &&
                series.map((d, i) => {
                  if (d.accuracyPct === null) return null;
                  const cx = (xScale(i) ?? 0) + xScale.bandwidth() / 2;
                  const cy = yAccScale(d.accuracyPct);
                  return (
                    <circle
                      key={`dot-${d.iso}`}
                      cx={cx}
                      cy={cy}
                      r={hoveredIdx === i ? 4.5 : 2.6}
                      fill="var(--panel)"
                      stroke="var(--good)"
                      strokeWidth={hoveredIdx === i ? 2.2 : 1.6}
                    />
                  );
                })}

              {/* Hover crosshair */}
              {hovered && hoveredIdx !== null && (
                <g pointerEvents="none">
                  <line
                    x1={hoveredX}
                    x2={hoveredX}
                    y1={0}
                    y2={innerH}
                    stroke="var(--text)"
                    strokeOpacity={0.28}
                    strokeDasharray="3 3"
                  />
                  {hovered.movingAvgPct !== null && (
                    <circle
                      cx={hoveredX}
                      cy={yAccScale(hovered.movingAvgPct)}
                      r={4.5}
                      fill="var(--accent)"
                      stroke="var(--panel)"
                      strokeWidth={1.8}
                    />
                  )}
                </g>
              )}

              {/* X axis labels */}
              {xTickIndices.map((idx) => {
                const d = series[idx];
                if (!d) return null;
                const cx = (xScale(idx) ?? 0) + xScale.bandwidth() / 2;
                return (
                  <text
                    key={`xt-${d.iso}`}
                    x={cx}
                    y={innerH + 18}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--muted)"
                    className="font-mono-num"
                  >
                    {formatIsoShortBr(d.iso)}
                  </text>
                );
              })}

              {/* Invisible hover columns for crisp interaction */}
              {series.map((d, i) => {
                const x = xScale(i) ?? 0;
                const step = xScale.step();
                const offset = (step - xScale.bandwidth()) / 2;
                return (
                  <rect
                    key={`hit-${d.iso}`}
                    x={Math.max(0, x - offset)}
                    y={0}
                    width={step}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIdx(i)}
                  />
                );
              })}
            </g>
          </svg>
        )}

        {/* Floating tooltip */}
        {hovered && hoveredIdx !== null && (
          <div
            className="pointer-events-none absolute top-2 z-20 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 shadow-lg text-[11.5px] min-w-[188px]"
            style={{
              left:
                hoveredX + margin.left > width * 0.58
                  ? Math.max(8, hoveredX + margin.left - 208)
                  : Math.min(width - 200, hoveredX + margin.left + 12),
            }}
          >
            <div className="font-mono-num font-extrabold text-[var(--text)] mb-1">
              {formatIsoFullBr(hovered.iso)}
            </div>
            <div className="flex items-center justify-between gap-3 text-[var(--muted)] font-mono-num">
              <span>Questões:</span>
              <strong className="text-[var(--text)]">
                {hovered.answered} ({hovered.correct}✓ / {hovered.wrong}✕)
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3 text-[var(--muted)] font-mono-num">
              <span>Acerto do dia:</span>
              <strong
                className={
                  hovered.accuracyPct !== null && hovered.accuracyPct >= 80
                    ? 'text-[var(--good)]'
                    : 'text-[var(--text)]'
                }
              >
                {hovered.accuracyPct !== null ? `${hovered.accuracyPct.toFixed(1)}%` : '—'}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3 text-[var(--muted)] font-mono-num">
              <span>Média móvel 7d:</span>
              <strong className="text-[var(--accent)]">
                {hovered.movingAvgPct !== null ? `${hovered.movingAvgPct.toFixed(1)}%` : '—'}
              </strong>
            </div>
            {hovered.studySeconds > 0 && (
              <div className="flex items-center justify-between gap-3 text-[var(--muted)] font-mono-num">
                <span>Tempo:</span>
                <strong className="text-[var(--text)]">{formatClock(hovered.studySeconds)}</strong>
              </div>
            )}
            {hovered.simulations > 0 && (
              <div className="flex items-center justify-between gap-3 text-[var(--muted)] font-mono-num">
                <span>Simulados:</span>
                <strong className="text-[var(--accent)]">{hovered.simulations}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
};

// ============================================================================
// 2. D3 Calendar Heatmap: Constância Diária (Questões + Tempo + Lei Seca)
// ============================================================================

interface CalendarDayCell {
  iso: string;
  date: Date;
  weekIdx: number;
  weekday: number; // 0 = Sun ... 6 = Sat
  questions: number;
  correct: number;
  studySeconds: number;
  lawReads: number;
  score: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface ConsistencyCalendarHeatmapProps {
  db: StudyDatabase;
}

const HEATMAP_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const ConsistencyCalendarHeatmap: React.FC<ConsistencyCalendarHeatmapProps> = ({ db }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = useContainerWidth(containerRef, 560);
  const [hoveredCell, setHoveredCell] = useState<CalendarDayCell | null>(null);

  const { cells, weekCount, monthLabels, stats } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 20 weeks back aligned to Sunday
    const rawStart = d3.timeDay.offset(today, -139);
    const startSunday = d3.timeSunday.floor(rawStart);
    const allDates = d3.timeDays(startSunday, d3.timeDay.offset(today, 1));

    const qMap = new Map<string, { total: number; correct: number }>();
    db.history.forEach((h) => {
      const cur = qMap.get(h.date) || { total: 0, correct: 0 };
      cur.total += 1;
      if (h.correct) cur.correct += 1;
      qMap.set(h.date, cur);
    });

    const secMap = new Map<string, number>();
    db.studyTimeRecords.forEach((rec) => {
      const sec = rec.allocations.reduce((s, a) => s + a.seconds, 0);
      if (sec > 0) secMap.set(rec.date, (secMap.get(rec.date) || 0) + sec);
    });

    const lawMap = new Map<string, number>();
    Object.values(db.lawReadDates || {}).forEach((entries) => {
      (entries || []).forEach((e) => {
        if (e.data) lawMap.set(e.data, (lawMap.get(e.data) || 0) + 1);
      });
    });
    Object.values(db.laws || {}).forEach((folder) => {
      (folder.items || []).forEach((it) => {
        (it.leituras || []).forEach((r) => {
          if (r.data) lawMap.set(r.data, (lawMap.get(r.data) || 0) + 1);
        });
      });
    });

    const rawCells = allDates.map((date) => {
      const iso = localDateIso(date);
      const q = qMap.get(iso) || { total: 0, correct: 0 };
      const studySeconds = secMap.get(iso) || 0;
      const lawReads = lawMap.get(iso) || 0;
      const studyMinutes = Math.round(studySeconds / 60);
      const score = q.total + studyMinutes * 0.5 + lawReads * 6;
      const weekIdx = d3.timeSunday.count(startSunday, date);
      return {
        iso,
        date,
        weekIdx,
        weekday: date.getDay(),
        questions: q.total,
        correct: q.correct,
        studySeconds,
        lawReads,
        score,
        level: 0 as 0 | 1 | 2 | 3 | 4,
      };
    });

    const positiveScores = rawCells.map((c) => c.score).filter((s) => s > 0).sort(d3.ascending);
    const q25 = d3.quantile(positiveScores, 0.25) ?? 5;
    const q50 = d3.quantile(positiveScores, 0.5) ?? 15;
    const q75 = d3.quantile(positiveScores, 0.75) ?? 35;

    const finalCells: CalendarDayCell[] = rawCells.map((c) => {
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (c.score > 0) {
        if (c.score <= q25) level = 1;
        else if (c.score <= q50) level = 2;
        else if (c.score <= q75) level = 3;
        else level = 4;
      }
      return { ...c, level };
    });

    // Streaks & totals
    let activeDays = 0;
    let bestStreak = 0;
    let runningStreak = 0;
    finalCells.forEach((c) => {
      if (c.score > 0) {
        activeDays += 1;
        runningStreak += 1;
        if (runningStreak > bestStreak) bestStreak = runningStreak;
      } else {
        runningStreak = 0;
      }
    });

    // Current streak up to today (allow today to be empty if yesterday was active)
    let currentStreak = 0;
    for (let i = finalCells.length - 1; i >= 0; i--) {
      const c = finalCells[i];
      if (c.score > 0) {
        currentStreak += 1;
      } else if (i === finalCells.length - 1) {
        continue;
      } else {
        break;
      }
    }

    const totalWeeks = (d3.max(finalCells, (c) => c.weekIdx) ?? 0) + 1;

    // Month labels at first week where month changes
    const months: Array<{ weekIdx: number; label: string }> = [];
    let lastMonth = -1;
    finalCells.forEach((c) => {
      const m = c.date.getMonth();
      if (m !== lastMonth && c.weekday <= 2) {
        months.push({ weekIdx: c.weekIdx, label: MONTH_LABELS_PT[m] });
        lastMonth = m;
      }
    });

    return {
      cells: finalCells,
      weekCount: totalWeeks,
      monthLabels: months,
      stats: {
        activeDays,
        totalDays: finalCells.length,
        currentStreak,
        bestStreak,
      },
    };
  }, [db.history, db.lawReadDates, db.laws, db.studyTimeRecords]);

  const leftPad = 30;
  const topPad = 20;
  const gap = 3;
  const cellSize = Math.max(
    10,
    Math.min(18, Math.floor((Math.max(240, width) - leftPad - 8) / Math.max(1, weekCount) - gap)),
  );
  const svgW = leftPad + weekCount * (cellSize + gap) + 4;
  const svgH = topPad + 7 * (cellSize + gap) + 6;

  const levelFill = (level: 0 | 1 | 2 | 3 | 4) => {
    if (level === 0) return 'var(--panel-soft)';
    if (level === 1) return 'color-mix(in srgb, var(--good) 28%, var(--panel-soft))';
    if (level === 2) return 'color-mix(in srgb, var(--good) 52%, var(--panel-soft))';
    if (level === 3) return 'color-mix(in srgb, var(--good) 76%, var(--panel-soft))';
    return 'var(--good)';
  };

  return (
    <Panel
      title="Mapa de Constância Diária (Últimas 20 semanas)"
      subtitle="Combina questões resolvidas, minutos cronometrados e leituras de Lei Seca por dia."
      action={
        <div className="flex items-center gap-3 font-mono-num text-[11.5px]">
          <span className="inline-flex items-center gap-1 text-[var(--good)] font-bold">
            <Flame className="w-3.5 h-3.5" />
            {stats.currentStreak}d seguidos
          </span>
          <span className="text-[var(--muted)]">
            Recorde: <strong className="text-[var(--text)]">{stats.bestStreak}d</strong>
          </span>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-[11.5px] text-[var(--muted)]">
        <span className="font-mono-num">
          <strong className="text-[var(--text)]">{stats.activeDays}</strong> de {stats.totalDays}{' '}
          dias com atividade ({Math.round((stats.activeDays / Math.max(1, stats.totalDays)) * 100)}%)
        </span>
        <div className="flex items-center gap-1.5 text-[10.5px]">
          <span>Menos</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span
              key={lvl}
              className="w-3 h-3 rounded-[3px] border border-[var(--line)] inline-block"
              style={{ backgroundColor: levelFill(lvl) }}
            />
          ))}
          <span>Mais</span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full overflow-x-auto pb-1 select-none">
        <svg
          width={svgW}
          height={svgH}
          role="img"
          aria-label="Calendário heatmap de constância de estudos"
          className="block"
          onMouseLeave={() => setHoveredCell(null)}
        >
          {/* Month labels */}
          {monthLabels.map((m) => (
            <text
              key={`${m.weekIdx}-${m.label}`}
              x={leftPad + m.weekIdx * (cellSize + gap)}
              y={12}
              fontSize={10}
              fontWeight={700}
              fill="var(--muted)"
            >
              {m.label}
            </text>
          ))}

          {/* Weekday labels (Seg, Qua, Sex) */}
          {[1, 3, 5].map((wd) => (
            <text
              key={wd}
              x={0}
              y={topPad + wd * (cellSize + gap) + cellSize * 0.78}
              fontSize={9.5}
              fill="var(--muted)"
            >
              {HEATMAP_WEEKDAYS[wd]}
            </text>
          ))}

          {/* Day cells */}
          {cells.map((cell) => {
            const x = leftPad + cell.weekIdx * (cellSize + gap);
            const y = topPad + cell.weekday * (cellSize + gap);
            const isHover = hoveredCell?.iso === cell.iso;
            return (
              <rect
                key={cell.iso}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                rx={3}
                fill={levelFill(cell.level)}
                stroke={isHover ? 'var(--text)' : 'var(--line)'}
                strokeWidth={isHover ? 1.5 : 0.75}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHoveredCell(cell)}
              />
            );
          })}
        </svg>

        {hoveredCell && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] px-3 py-1.5 text-[11.5px] font-mono-num">
            <strong className="text-[var(--text)]">
              {formatIsoFullBr(hoveredCell.iso)} ({HEATMAP_WEEKDAYS[hoveredCell.weekday]})
            </strong>
            <div className="flex flex-wrap items-center gap-3 text-[var(--muted)]">
              <span>
                Questões:{' '}
                <strong className="text-[var(--text)]">
                  {hoveredCell.questions}
                  {hoveredCell.questions > 0
                    ? ` (${Math.round((hoveredCell.correct / hoveredCell.questions) * 100)}%)`
                    : ''}
                </strong>
              </span>
              <span>
                Tempo:{' '}
                <strong className="text-[var(--accent)]">
                  {hoveredCell.studySeconds ? formatClock(hoveredCell.studySeconds) : '00:00:00'}
                </strong>
              </span>
              <span>
                Lei Seca:{' '}
                <strong className="text-[var(--good)]">{hoveredCell.lawReads} leitura(s)</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

// ============================================================================
// 3. D3 Scatter / Bubble Plot: Quadrante de Prioridade (Volume × Acerto %)
// ============================================================================

export interface SubjectAnalyticsDatum {
  subject: string;
  answered: number;
  correct: number;
  wrong: number;
  accuracyPct: number | null;
  studySeconds: number;
  sparkline: Array<{ iso: string; accuracyPct: number; answered: number }>;
  trendDelta: number | null;
}

interface PriorityQuadrantD3ChartProps {
  rows: SubjectAnalyticsDatum[];
  selectedSubject: string;
  onSelectSubject: (subject: string) => void;
}

export const PriorityQuadrantD3Chart: React.FC<PriorityQuadrantD3ChartProps> = ({
  rows,
  selectedSubject,
  onSelectSubject,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = useContainerWidth(containerRef, 560);
  const [hovered, setHovered] = useState<SubjectAnalyticsDatum | null>(null);

  const plotRows = useMemo(
    () => rows.filter((r) => r.answered > 0 && r.accuracyPct !== null),
    [rows],
  );

  const height = 278;
  const margin = { top: 20, right: 20, bottom: 38, left: 44 };
  const innerW = Math.max(200, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const { xScale, yScale, rScale, medianVol, priorityCount } = useMemo(() => {
    const maxAns = Math.max(10, d3.max(plotRows, (d) => d.answered) ?? 10);
    const maxSec = Math.max(60, d3.max(plotRows, (d) => d.studySeconds) ?? 60);
    const med = d3.median(plotRows, (d) => d.answered) ?? Math.round(maxAns / 2);

    const x = d3.scaleLinear().domain([0, maxAns * 1.12]).nice().range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);
    const r = d3.scaleSqrt().domain([0, maxSec]).range([6.5, 19]);

    const critical = plotRows.filter(
      (d) => (d.accuracyPct ?? 100) < 80 && d.answered >= med,
    ).length;

    return { xScale: x, yScale: y, rScale: r, medianVol: med, priorityCount: critical };
  }, [innerH, innerW, plotRows]);

  const y80 = yScale(80);
  const xMed = xScale(medianVol);

  return (
    <Panel
      title="Quadrante de Prioridade · Volume × Acerto"
      subtitle="Tamanho da bolha = tempo estudado. Clique em uma disciplina para filtrar."
      action={
        priorityCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--bad)] font-mono-num">
            <Target className="w-3.5 h-3.5" />
            {priorityCount} em prioridade máxima
          </span>
        ) : undefined
      }
    >
      <div ref={containerRef} className="relative w-full select-none">
        {plotRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-10 px-4 text-center text-[12.5px] text-[var(--muted)]">
            Responda questões em ao menos uma disciplina para plotar o quadrante de prioridade.
          </div>
        ) : (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Gráfico de dispersão de volume de questões versus taxa de acerto por disciplina"
            className="block overflow-visible"
            onMouseLeave={() => setHovered(null)}
          >
            <g transform={`translate(${margin.left},${margin.top})`}>
              {/* Critical quadrant highlight (high volume, < 80% accuracy) */}
              <rect
                x={xMed}
                y={y80}
                width={Math.max(0, innerW - xMed)}
                height={Math.max(0, innerH - y80)}
                fill="var(--bad)"
                fillOpacity={0.07}
              />
              {/* Mastered quadrant highlight (high volume, >= 80% accuracy) */}
              <rect
                x={xMed}
                y={0}
                width={Math.max(0, innerW - xMed)}
                height={Math.max(0, y80)}
                fill="var(--good)"
                fillOpacity={0.06}
              />

              {/* Grid lines */}
              {[0, 25, 50, 75, 100].map((t) => (
                <g key={t}>
                  <line
                    x1={0}
                    x2={innerW}
                    y1={yScale(t)}
                    y2={yScale(t)}
                    stroke="var(--line)"
                    strokeOpacity={0.45}
                  />
                  <text
                    x={-8}
                    y={yScale(t) + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--muted)"
                    className="font-mono-num"
                  >
                    {t}%
                  </text>
                </g>
              ))}

              {xScale.ticks(5).map((t) => (
                <g key={t}>
                  <line
                    x1={xScale(t)}
                    x2={xScale(t)}
                    y1={0}
                    y2={innerH}
                    stroke="var(--line)"
                    strokeOpacity={0.35}
                  />
                  <text
                    x={xScale(t)}
                    y={innerH + 16}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--muted)"
                    className="font-mono-num"
                  >
                    {t}
                  </text>
                </g>
              ))}

              {/* Quadrant reference lines */}
              <line
                x1={0}
                x2={innerW}
                y1={y80}
                y2={y80}
                stroke="var(--warning)"
                strokeWidth={1.25}
                strokeDasharray="4 4"
              />
              <line
                x1={xMed}
                x2={xMed}
                y1={0}
                y2={innerH}
                stroke="var(--muted)"
                strokeWidth={1}
                strokeDasharray="4 4"
                strokeOpacity={0.7}
              />

              {/* Quadrant corner labels */}
              <text x={innerW - 6} y={13} textAnchor="end" fontSize={9.5} fontWeight={700} fill="var(--good)">
                Dominada (≥80%)
              </text>
              <text x={6} y={13} fontSize={9.5} fontWeight={700} fill="var(--muted)">
                Amostra pequena
              </text>
              <text
                x={innerW - 6}
                y={innerH - 6}
                textAnchor="end"
                fontSize={9.5}
                fontWeight={700}
                fill="var(--bad)"
              >
                Prioridade máxima
              </text>
              <text x={6} y={innerH - 6} fontSize={9.5} fontWeight={700} fill="var(--warning)">
                Reforçar base
              </text>

              {/* Axis captions */}
              <text
                x={innerW / 2}
                y={innerH + 32}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="var(--muted)"
              >
                Questões respondidas (mediana: {Math.round(medianVol)})
              </text>

              {/* Bubbles */}
              {plotRows.map((row) => {
                const cx = xScale(row.answered);
                const cy = yScale(row.accuracyPct ?? 0);
                const rad = rScale(row.studySeconds);
                const isSelected = selectedSubject === row.subject;
                const isHover = hovered?.subject === row.subject;
                const pct = row.accuracyPct ?? 0;
                const fill =
                  pct >= 80
                    ? 'var(--good)'
                    : row.answered >= medianVol
                      ? 'var(--bad)'
                      : 'var(--warning)';

                return (
                  <g
                    key={row.subject}
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered(row)}
                    onClick={() =>
                      onSelectSubject(selectedSubject === row.subject ? 'Todas' : row.subject)
                    }
                  >
                    {isSelected && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={rad + 4}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={2}
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHover ? rad + 1.5 : rad}
                      fill={fill}
                      fillOpacity={isHover || isSelected ? 0.88 : 0.62}
                      stroke="var(--panel)"
                      strokeWidth={1.6}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute top-2 z-20 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 shadow-lg text-[11.5px] max-w-[230px]"
            style={{
              left:
                xScale(hovered.answered) + margin.left > width * 0.55
                  ? Math.max(8, xScale(hovered.answered) + margin.left - 236)
                  : Math.min(width - 230, xScale(hovered.answered) + margin.left + 14),
            }}
          >
            <div className="font-bold text-[var(--text)] truncate mb-1">
              {visibleName(hovered.subject)}
            </div>
            <div className="flex items-center justify-between gap-3 font-mono-num text-[var(--muted)]">
              <span>Acerto:</span>
              <strong
                className={
                  (hovered.accuracyPct ?? 0) >= 80
                    ? 'text-[var(--good)]'
                    : (hovered.accuracyPct ?? 0) >= 60
                      ? 'text-[var(--warning)]'
                      : 'text-[var(--bad)]'
                }
              >
                {hovered.accuracyPct}% ({hovered.correct}/{hovered.answered})
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3 font-mono-num text-[var(--muted)]">
              <span>Tempo:</span>
              <strong className="text-[var(--text)]">{formatClock(hovered.studySeconds)}</strong>
            </div>
            <div className="mt-1 text-[10px] text-[var(--accent)] font-semibold">
              Clique na bolha para filtrar
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

// ============================================================================
// 4. Tabela Analítica com D3: Sparklines + Bullet Charts + Escala de Calor + Quartis
// ============================================================================

type SubjectSortKey = 'subject' | 'answered' | 'accuracyPct' | 'trendDelta' | 'studySeconds';

interface AnalyticalSubjectsD3TableProps {
  rows: SubjectAnalyticsDatum[];
  selectedSubject: string;
  onSelectSubject: (subject: string) => void;
}

const InlineSparkline: React.FC<{
  points: Array<{ iso: string; accuracyPct: number; answered: number }>;
  trendDelta: number | null;
}> = ({ points, trendDelta }) => {
  const w = 96;
  const h = 24;
  const { path, areaPath, lastPoint } = useMemo(() => {
    if (points.length < 2) {
      return { path: '', areaPath: '', lastPoint: null };
    }
    const x = d3.scaleLinear().domain([0, points.length - 1]).range([3, w - 4]);
    const y = d3.scaleLinear().domain([0, 100]).range([h - 3, 3]);
    const lineGen = d3
      .line<{ iso: string; accuracyPct: number }>()
      .x((_, i) => x(i))
      .y((d) => y(d.accuracyPct))
      .curve(d3.curveMonotoneX);
    const areaGen = d3
      .area<{ iso: string; accuracyPct: number }>()
      .x((_, i) => x(i))
      .y0(h - 2)
      .y1((d) => y(d.accuracyPct))
      .curve(d3.curveMonotoneX);
    const last = points[points.length - 1];
    return {
      path: lineGen(points) || '',
      areaPath: areaGen(points) || '',
      lastPoint: { cx: x(points.length - 1), cy: y(last.accuracyPct) },
    };
  }, [points]);

  if (points.length < 2) {
    return <span className="text-[11px] text-[var(--muted)] font-mono-num">—</span>;
  }

  const strokeColor =
    trendDelta !== null && trendDelta > 0
      ? 'var(--good)'
      : trendDelta !== null && trendDelta < 0
        ? 'var(--bad)'
        : 'var(--accent)';

  return (
    <div className="inline-flex items-center gap-2">
      <svg width={w} height={h} aria-hidden="true" className="shrink-0 overflow-visible">
        <line
          x1={2}
          x2={w - 2}
          y1={3 + (h - 6) * 0.2}
          y2={3 + (h - 6) * 0.2}
          stroke="var(--warning)"
          strokeOpacity={0.45}
          strokeDasharray="2 2"
        />
        {areaPath && <path d={areaPath} fill={strokeColor} fillOpacity={0.12} />}
        {path && <path d={path} fill="none" stroke={strokeColor} strokeWidth={1.6} />}
        {lastPoint && (
          <circle
            cx={lastPoint.cx}
            cy={lastPoint.cy}
            r={2.5}
            fill={strokeColor}
            stroke="var(--panel)"
            strokeWidth={1}
          />
        )}
      </svg>
      {trendDelta !== null && (
        <span
          className={`font-mono-num text-[10.5px] font-bold whitespace-nowrap ${
            trendDelta > 0
              ? 'text-[var(--good)]'
              : trendDelta < 0
                ? 'text-[var(--bad)]'
                : 'text-[var(--muted)]'
          }`}
        >
          {trendDelta > 0 ? `+${trendDelta}` : trendDelta}pp
        </span>
      )}
    </div>
  );
};

const InlineBulletChart: React.FC<{ pct: number | null; target?: number }> = ({
  pct,
  target = 80,
}) => {
  const w = 112;
  const h = 16;
  const x = d3.scaleLinear().domain([0, 100]).range([0, w]);

  if (pct === null) {
    return <span className="text-[11px] text-[var(--muted)] font-mono-num">Sem questões</span>;
  }

  const fill =
    pct >= target ? 'var(--good)' : pct >= 60 ? 'var(--warning)' : 'var(--bad)';

  return (
    <svg width={w} height={h} role="img" aria-label={`${pct}% frente à meta de ${target}%`} className="block">
      {/* Qualitative ranges: 0-60, 60-80, 80-100 */}
      <rect x={0} y={3} width={x(60)} height={10} rx={2} fill="var(--bad)" fillOpacity={0.14} />
      <rect x={x(60)} y={3} width={x(20)} height={10} fill="var(--warning)" fillOpacity={0.14} />
      <rect x={x(80)} y={3} width={x(20)} height={10} rx={2} fill="var(--good)" fillOpacity={0.14} />
      {/* Actual bar */}
      <rect x={0} y={5.5} width={Math.max(2, x(pct))} height={5} rx={2} fill={fill} />
      {/* 80% Target tick */}
      <line
        x1={x(target)}
        x2={x(target)}
        y1={1}
        y2={h - 1}
        stroke="var(--text)"
        strokeWidth={1.8}
      />
    </svg>
  );
};

export const AnalyticalSubjectsD3Table: React.FC<AnalyticalSubjectsD3TableProps> = ({
  rows,
  selectedSubject,
  onSelectSubject,
}) => {
  const [sortKey, setSortKey] = useState<SubjectSortKey>('answered');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SubjectSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'subject' ? 'asc' : 'desc');
    }
  };

  const sortedRows = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'subject') {
        return visibleName(a.subject).localeCompare(visibleName(b.subject), 'pt-BR') * mult;
      }
      if (sortKey === 'answered') return (a.answered - b.answered) * mult;
      if (sortKey === 'studySeconds') return (a.studySeconds - b.studySeconds) * mult;
      if (sortKey === 'accuracyPct') {
        return ((a.accuracyPct ?? -1) - (b.accuracyPct ?? -1)) * mult;
      }
      return ((a.trendDelta ?? -999) - (b.trendDelta ?? -999)) * mult;
    });
  }, [rows, sortDir, sortKey]);

  const footerStats = useMemo(() => {
    const accs = rows.map((r) => r.accuracyPct).filter((v): v is number => v !== null);
    const accDist = computeDistributionStats(accs);
    const totalAnswered = d3.sum(rows, (r) => r.answered);
    const totalCorrect = d3.sum(rows, (r) => r.correct);
    const totalSeconds = d3.sum(rows, (r) => r.studySeconds);
    return {
      totalAnswered,
      totalCorrect,
      totalSeconds,
      accDist,
    };
  }, [rows]);

  const renderSortIcon = (key: SubjectSortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 opacity-45" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[var(--accent)]" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[var(--accent)]" />
    );
  };

  return (
    <Panel
      className="mb-4"
      title="Tabela Analítica de Disciplinas (Sparklines · Bullet · Quartis)"
      subtitle="Ordenação multi-coluna com tendência recente, meta de 80% e estatísticas consolidadas no rodapé. Clique em uma linha para filtrar."
      action={
        selectedSubject !== 'Todas' ? (
          <button
            type="button"
            onClick={() => onSelectSubject('Todas')}
            className="text-[11.5px] font-bold text-[var(--accent)] hover:underline whitespace-nowrap"
          >
            Limpar filtro ({visibleName(selectedSubject)})
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono-num text-[var(--muted)]">
            <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" />
            {rows.length} disciplina(s)
          </span>
        )
      }
    >
      {rows.length === 0 ? (
        <div className="text-[12.5px] text-[var(--muted)] py-4 text-center">
          Nenhuma disciplina registrada ainda para análise tabular.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--line-strong)] text-[10.5px] uppercase tracking-wider text-[var(--muted)]">
                <th className="py-2 pr-3 font-extrabold">
                  <button
                    type="button"
                    onClick={() => toggleSort('subject')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                  >
                    Disciplina {renderSortIcon('subject')}
                  </button>
                </th>
                <th className="py-2 px-2.5 text-right font-extrabold">
                  <button
                    type="button"
                    onClick={() => toggleSort('answered')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                  >
                    Questões {renderSortIcon('answered')}
                  </button>
                </th>
                <th className="py-2 px-2.5 text-right font-extrabold">
                  <button
                    type="button"
                    onClick={() => toggleSort('accuracyPct')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                  >
                    Acerto % {renderSortIcon('accuracyPct')}
                  </button>
                </th>
                <th className="py-2 px-2.5 font-extrabold whitespace-nowrap">Meta 80%</th>
                <th className="py-2 px-2.5 font-extrabold">
                  <button
                    type="button"
                    onClick={() => toggleSort('trendDelta')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                  >
                    Tendência {renderSortIcon('trendDelta')}
                  </button>
                </th>
                <th className="py-2 pl-2.5 text-right font-extrabold">
                  <button
                    type="button"
                    onClick={() => toggleSort('studySeconds')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                  >
                    Tempo {renderSortIcon('studySeconds')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const isSelected = selectedSubject === row.subject;
                const heat = accuracyHeatColor(row.accuracyPct);
                return (
                  <tr
                    key={row.subject}
                    onClick={() =>
                      onSelectSubject(selectedSubject === row.subject ? 'Todas' : row.subject)
                    }
                    className={`border-b border-[var(--line)]/60 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent-soft)]'
                        : 'hover:bg-[var(--panel-soft)]'
                    }`}
                  >
                    <td className="py-2.5 pr-3 font-bold text-[var(--text)] max-w-[230px] truncate">
                      {visibleName(row.subject)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono-num whitespace-nowrap">
                      <strong className="text-[var(--text)]">{row.answered}</strong>
                      {row.answered > 0 && (
                        <span className="text-[10.5px] text-[var(--muted)] ml-1">
                          ({row.correct}✓/{row.wrong}✕)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono-num whitespace-nowrap">
                      <span
                        className="inline-block min-w-[48px] text-center px-2 py-0.5 rounded-md border font-extrabold text-[11.5px]"
                        style={{
                          backgroundColor: heat.bg,
                          borderColor: heat.border,
                          color: heat.text,
                        }}
                      >
                        {row.accuracyPct !== null ? `${row.accuracyPct}%` : '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5">
                      <InlineBulletChart pct={row.accuracyPct} target={80} />
                    </td>
                    <td className="py-2.5 px-2.5">
                      <InlineSparkline points={row.sparkline} trendDelta={row.trendDelta} />
                    </td>
                    <td className="py-2.5 pl-2.5 text-right font-mono-num font-bold text-[var(--accent)] whitespace-nowrap">
                      {formatClock(row.studySeconds)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-mono-num">
                <td className="py-2.5 px-2 font-extrabold text-[var(--text)]">
                  Resumo estatístico ({rows.length})
                </td>
                <td className="py-2.5 px-2.5 text-right font-bold text-[var(--text)] whitespace-nowrap">
                  Σ {footerStats.totalAnswered.toLocaleString('pt-BR')}
                </td>
                <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                  <span className="text-[var(--muted)]">Mediana </span>
                  <strong className="text-[var(--text)]">
                    {footerStats.accDist.count ? `${Math.round(footerStats.accDist.median)}%` : '—'}
                  </strong>
                </td>
                <td className="py-2.5 px-2.5 text-[var(--muted)] whitespace-nowrap" colSpan={2}>
                  {footerStats.accDist.count > 0 ? (
                    <>
                      Média <strong className="text-[var(--text)]">{footerStats.accDist.mean.toFixed(1)}%</strong>
                      {' · '}
                      Q1–Q3:{' '}
                      <strong className="text-[var(--text)]">
                        {Math.round(footerStats.accDist.q1)}%–{Math.round(footerStats.accDist.q3)}%
                      </strong>
                    </>
                  ) : (
                    'Sem distribuição de acerto'
                  )}
                </td>
                <td className="py-2.5 pl-2.5 pr-2 text-right font-extrabold text-[var(--accent)] whitespace-nowrap">
                  {formatClock(footerStats.totalSeconds)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
};
