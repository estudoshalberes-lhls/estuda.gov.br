import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Target,
} from 'lucide-react';
import { Panel } from '../ui/PageHeader';
import {
  computeDistributionStats,
  intensityHeatColor,
  useContainerWidth,
} from './d3Utils';

export interface ParetoDatum {
  key: string;
  label: string;
  count: number;
  pendingCount?: number;
  ratePct?: number | null;
  rateDetail?: string;
  extraNote?: string;
}

interface EnrichedParetoRow extends ParetoDatum {
  rank: number;
  sharePct: number;
  cumulativePct: number;
  inVital80: boolean;
}

type ParetoSortKey = 'label' | 'count' | 'sharePct' | 'cumulativePct' | 'ratePct';

interface ErrorParetoD3PanelProps {
  title: string;
  subtitle: string;
  items: ParetoDatum[];
  unitLabel: string;
  selectedKey?: string | null;
  onSelectKey?: (key: string) => void;
  showRateColumn?: boolean;
  showPendingColumn?: boolean;
  headerExtra?: React.ReactNode;
  defaultExpanded?: boolean;
}

export const ErrorParetoD3Panel: React.FC<ErrorParetoD3PanelProps> = ({
  title,
  subtitle,
  items,
  unitLabel,
  selectedKey = null,
  onSelectKey,
  showRateColumn = false,
  showPendingColumn = false,
  headerExtra,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [sortKey, setSortKey] = useState<ParetoSortKey>('count');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = useContainerWidth(containerRef, 720);

  const { paretoRows, totalCount, vitalCount, stats } = useMemo(() => {
    const clean = items.filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
    const total = d3.sum(clean, (d) => d.count);
    let running = 0;
    let passed80 = false;

    const enriched: EnrichedParetoRow[] = clean.map((item, idx) => {
      const sharePct = total > 0 ? (item.count / total) * 100 : 0;
      running += sharePct;
      const inVital80 = !passed80;
      if (running >= 80) passed80 = true;
      return {
        ...item,
        rank: idx + 1,
        sharePct,
        cumulativePct: Math.min(100, running),
        inVital80,
      };
    });

    const vital = enriched.filter((r) => r.inVital80).length;
    const dist = computeDistributionStats(enriched.map((r) => r.count));

    return {
      paretoRows: enriched,
      totalCount: total,
      vitalCount: vital,
      stats: dist,
    };
  }, [items]);

  // Display top 14 categories in the chart so bars & labels stay crisp
  const chartRows = useMemo(() => paretoRows.slice(0, 14), [paretoRows]);

  const sortedTableRows = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...paretoRows].sort((a, b) => {
      if (sortKey === 'label') return a.label.localeCompare(b.label, 'pt-BR') * mult;
      if (sortKey === 'count') return (a.count - b.count) * mult;
      if (sortKey === 'sharePct') return (a.sharePct - b.sharePct) * mult;
      if (sortKey === 'cumulativePct') return (a.cumulativePct - b.cumulativePct) * mult;
      return ((a.ratePct ?? -1) - (b.ratePct ?? -1)) * mult;
    });
  }, [paretoRows, sortDir, sortKey]);

  const toggleSort = (key: ParetoSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir(key === 'label' ? 'asc' : 'desc');
    }
  };

  const renderSortIcon = (key: ParetoSortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 opacity-45" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[var(--accent)]" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[var(--accent)]" />
    );
  };

  const height = 248;
  const margin = { top: 18, right: 44, bottom: 54, left: 40 };
  const innerW = Math.max(220, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const { xScale, yCountScale, yPctScale, cumLinePath } = useMemo(() => {
    const x = d3
      .scaleBand<string>()
      .domain(chartRows.map((d) => d.key))
      .range([0, innerW])
      .padding(0.28);

    const maxC = Math.max(2, d3.max(chartRows, (d) => d.count) ?? 2);
    const yC = d3.scaleLinear().domain([0, maxC * 1.15]).nice().range([innerH, 0]);
    const yP = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

    const line = d3
      .line<EnrichedParetoRow>()
      .x((d) => (x(d.key) ?? 0) + x.bandwidth() / 2)
      .y((d) => yP(d.cumulativePct))
      .curve(d3.curveMonotoneX);

    return {
      xScale: x,
      yCountScale: yC,
      yPctScale: yP,
      cumLinePath: line(chartRows) || '',
    };
  }, [chartRows, innerH, innerW]);

  const hoveredRow = useMemo(
    () => chartRows.find((r) => r.key === hoveredKey) || null,
    [chartRows, hoveredKey],
  );
  const hoveredX = hoveredRow
    ? (xScale(hoveredRow.key) ?? 0) + xScale.bandwidth() / 2
    : 0;

  const maxRowCount = Math.max(1, paretoRows[0]?.count ?? 1);

  return (
    <Panel
      className="mb-4"
      title={title}
      subtitle={subtitle}
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          {headerExtra}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Ocultar
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Mostrar Pareto ({paretoRows.length})
              </>
            )}
          </button>
        </div>
      }
    >
      {expanded && (
        <>
          {paretoRows.length === 0 ? (
            <div className="text-[12.5px] text-[var(--muted)] py-3">
              Sem registros suficientes para montar a curva de Pareto 80/20.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Pareto 80/20 executive strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                <div className="flex flex-wrap items-center gap-4 font-mono-num">
                  <span className="inline-flex items-center gap-1.5 text-[var(--bad)] font-bold">
                    <Target className="w-3.5 h-3.5" />
                    Foco 80/20: {vitalCount} de {paretoRows.length} categoria(s) concentram ~80%
                  </span>
                  <span className="text-[var(--muted)]">
                    Total: <strong className="text-[var(--text)]">{totalCount}</strong> {unitLabel}
                  </span>
                  <span className="text-[var(--muted)]">
                    Mediana:{' '}
                    <strong className="text-[var(--text)]">{stats.median.toFixed(1)}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[10.5px] text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[var(--bad)]/80 inline-block" />
                    Foco 80%
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent)]/45 inline-block" />
                    Cauda 20%
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3.5 h-0.5 bg-[var(--warning)] inline-block" />
                    % Acumulado
                  </span>
                </div>
              </div>

              {/* D3 Pareto Chart */}
              <div ref={containerRef} className="relative w-full select-none">
                <svg
                  width={width}
                  height={height}
                  role="img"
                  aria-label="Gráfico de Pareto 80/20"
                  className="block overflow-visible"
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  <g transform={`translate(${margin.left},${margin.top})`}>
                    {/* Right Y grid lines (cumulative %) */}
                    {[0, 20, 40, 60, 80, 100].map((tick) => {
                      const y = yPctScale(tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={0}
                            x2={innerW}
                            y1={y}
                            y2={y}
                            stroke={tick === 80 ? 'var(--warning)' : 'var(--line)'}
                            strokeOpacity={tick === 80 ? 0.85 : 0.4}
                            strokeDasharray={tick === 80 ? '4 4' : undefined}
                            strokeWidth={tick === 80 ? 1.3 : 1}
                          />
                          <text
                            x={innerW + 7}
                            y={y + 3.5}
                            fontSize={10}
                            fontWeight={tick === 80 ? 700 : 400}
                            fill={tick === 80 ? 'var(--warning)' : 'var(--muted)'}
                            className="font-mono-num"
                          >
                            {tick}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Left Y ticks (counts) */}
                    {yCountScale.ticks(4).map((tick) => (
                      <text
                        key={tick}
                        x={-8}
                        y={yCountScale(tick) + 3.5}
                        textAnchor="end"
                        fontSize={10}
                        fill="var(--muted)"
                        className="font-mono-num"
                      >
                        {tick}
                      </text>
                    ))}

                    <text
                      x={4}
                      y={yPctScale(80) - 4}
                      fontSize={9.5}
                      fontWeight={700}
                      fill="var(--warning)"
                    >
                      Corte 80%
                    </text>

                    {/* Pareto bars */}
                    {chartRows.map((row) => {
                      const x = xScale(row.key) ?? 0;
                      const y = yCountScale(row.count);
                      const barH = Math.max(2, innerH - y);
                      const isSelected = selectedKey === row.key;
                      const isHover = hoveredKey === row.key;
                      const fill = row.inVital80 ? 'var(--bad)' : 'var(--accent)';
                      const truncLabel =
                        row.label.length > 13 ? `${row.label.slice(0, 12)}…` : row.label;

                      return (
                        <g
                          key={row.key}
                          className={onSelectKey ? 'cursor-pointer' : undefined}
                          onMouseEnter={() => setHoveredKey(row.key)}
                          onClick={() => onSelectKey?.(row.key)}
                        >
                          <rect
                            x={x}
                            y={y}
                            width={xScale.bandwidth()}
                            height={barH}
                            rx={3}
                            fill={fill}
                            fillOpacity={
                              isSelected || isHover ? 0.92 : row.inVital80 ? 0.72 : 0.42
                            }
                            stroke={isSelected ? 'var(--text)' : fill}
                            strokeWidth={isSelected ? 1.8 : 0.8}
                          />
                          <text
                            x={x + xScale.bandwidth() / 2}
                            y={innerH + 12}
                            textAnchor="end"
                            transform={`rotate(-26, ${x + xScale.bandwidth() / 2}, ${innerH + 12})`}
                            fontSize={9.5}
                            fontWeight={isSelected ? 800 : 600}
                            fill={isSelected ? 'var(--accent)' : 'var(--muted)'}
                          >
                            {truncLabel}
                          </text>
                        </g>
                      );
                    })}

                    {/* Cumulative % curve */}
                    {cumLinePath && (
                      <path
                        d={cumLinePath}
                        fill="none"
                        stroke="var(--warning)"
                        strokeWidth={2.2}
                        pointerEvents="none"
                      />
                    )}
                    {chartRows.map((row) => {
                      const cx = (xScale(row.key) ?? 0) + xScale.bandwidth() / 2;
                      const cy = yPctScale(row.cumulativePct);
                      const isHover = hoveredKey === row.key;
                      return (
                        <circle
                          key={`pt-${row.key}`}
                          cx={cx}
                          cy={cy}
                          r={isHover ? 4.8 : 3.2}
                          fill={row.inVital80 ? 'var(--warning)' : 'var(--panel)'}
                          stroke="var(--warning)"
                          strokeWidth={1.8}
                          pointerEvents="none"
                        />
                      );
                    })}
                  </g>
                </svg>

                {hoveredRow && (
                  <div
                    className="pointer-events-none absolute top-2 z-20 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 shadow-lg text-[11.5px] min-w-[205px]"
                    style={{
                      left:
                        hoveredX + margin.left > width * 0.56
                          ? Math.max(8, hoveredX + margin.left - 220)
                          : Math.min(width - 216, hoveredX + margin.left + 12),
                    }}
                  >
                    <div className="font-bold text-[var(--text)] truncate mb-1">
                      {hoveredRow.rank}º · {hoveredRow.label}
                    </div>
                    <div className="flex items-center justify-between gap-3 font-mono-num text-[var(--muted)]">
                      <span>Ocorrências:</span>
                      <strong className="text-[var(--text)]">
                        {hoveredRow.count} ({hoveredRow.sharePct.toFixed(1)}%)
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-3 font-mono-num text-[var(--muted)]">
                      <span>Acumulado:</span>
                      <strong className="text-[var(--warning)]">
                        {hoveredRow.cumulativePct.toFixed(1)}%
                      </strong>
                    </div>
                    {hoveredRow.ratePct !== null && hoveredRow.ratePct !== undefined && (
                      <div className="flex items-center justify-between gap-3 font-mono-num text-[var(--muted)]">
                        <span>Taxa de erro:</span>
                        <strong className="text-[var(--bad)]">
                          {hoveredRow.ratePct}% {hoveredRow.rateDetail ? `(${hoveredRow.rateDetail})` : ''}
                        </strong>
                      </div>
                    )}
                    <div className="mt-1 text-[10px] font-semibold text-[var(--accent)]">
                      {hoveredRow.inVital80 ? 'Dentro do corte prioritário 80/20' : 'Cauda longa (20%)'}
                      {onSelectKey ? ' · Clique para filtrar' : ''}
                    </div>
                  </div>
                )}
              </div>

              {/* Sortable D3 Analytical Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--line-strong)] text-[10.5px] uppercase tracking-wider text-[var(--muted)]">
                      <th className="py-2 pr-2 font-extrabold w-8">#</th>
                      <th className="py-2 pr-3 font-extrabold">
                        <button
                          type="button"
                          onClick={() => toggleSort('label')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                        >
                          Categoria {renderSortIcon('label')}
                        </button>
                      </th>
                      <th className="py-2 px-2.5 font-extrabold">
                        <button
                          type="button"
                          onClick={() => toggleSort('count')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                        >
                          Impacto ({unitLabel}) {renderSortIcon('count')}
                        </button>
                      </th>
                      <th className="py-2 px-2.5 text-right font-extrabold">
                        <button
                          type="button"
                          onClick={() => toggleSort('sharePct')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                        >
                          Fatia % {renderSortIcon('sharePct')}
                        </button>
                      </th>
                      <th className="py-2 px-2.5 text-right font-extrabold">
                        <button
                          type="button"
                          onClick={() => toggleSort('cumulativePct')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                        >
                          Acumulado {renderSortIcon('cumulativePct')}
                        </button>
                      </th>
                      {showRateColumn && (
                        <th className="py-2 px-2.5 text-right font-extrabold">
                          <button
                            type="button"
                            onClick={() => toggleSort('ratePct')}
                            className="inline-flex items-center gap-1 hover:text-[var(--text)] cursor-pointer whitespace-nowrap"
                          >
                            Taxa de erro {renderSortIcon('ratePct')}
                          </button>
                        </th>
                      )}
                      {showPendingColumn && (
                        <th className="py-2 pl-2.5 text-right font-extrabold whitespace-nowrap">
                          Pendentes
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTableRows.map((row) => {
                      const isSelected = selectedKey === row.key;
                      const barPct = Math.max(4, Math.round((row.count / maxRowCount) * 100));
                      const heat = intensityHeatColor(row.count / maxRowCount);
                      return (
                        <tr
                          key={row.key}
                          onClick={() => onSelectKey?.(row.key)}
                          className={`border-b border-[var(--line)]/60 transition-colors ${
                            onSelectKey ? 'cursor-pointer' : ''
                          } ${
                            isSelected
                              ? 'bg-[var(--accent-soft)]'
                              : 'hover:bg-[var(--panel-soft)]'
                          }`}
                        >
                          <td className="py-2 pr-2 font-mono-num text-[11px] font-bold text-[var(--muted)]">
                            {row.rank}º
                          </td>
                          <td className="py-2 pr-3 font-bold text-[var(--text)] max-w-[240px] truncate">
                            {row.label}
                          </td>
                          <td className="py-2 px-2.5 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <span className="font-mono-num font-extrabold text-[var(--text)] w-8 text-right shrink-0">
                                {row.count}
                              </span>
                              <svg width={88} height={10} aria-hidden="true" className="shrink-0">
                                <rect
                                  x={0}
                                  y={1}
                                  width={88}
                                  height={8}
                                  rx={3}
                                  fill="var(--panel-soft)"
                                />
                                <rect
                                  x={0}
                                  y={1}
                                  width={Math.max(3, (88 * barPct) / 100)}
                                  height={8}
                                  rx={3}
                                  fill={row.inVital80 ? 'var(--bad)' : 'var(--accent)'}
                                  fillOpacity={row.inVital80 ? 0.82 : 0.6}
                                />
                              </svg>
                            </div>
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono-num whitespace-nowrap">
                            <span
                              className="inline-block min-w-[50px] text-center px-1.5 py-0.5 rounded border font-bold text-[11px] text-[var(--text)]"
                              style={{
                                backgroundColor: heat.bg,
                                borderColor: heat.border,
                              }}
                            >
                              {row.sharePct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono-num whitespace-nowrap">
                            <span
                              className={
                                row.inVital80
                                  ? 'font-extrabold text-[var(--warning)]'
                                  : 'text-[var(--muted)]'
                              }
                            >
                              {row.cumulativePct.toFixed(1)}%
                            </span>
                          </td>
                          {showRateColumn && (
                            <td className="py-2 px-2.5 text-right font-mono-num whitespace-nowrap">
                              {row.ratePct !== null && row.ratePct !== undefined ? (
                                <span
                                  className={`font-bold ${
                                    row.ratePct >= 40
                                      ? 'text-[var(--bad)]'
                                      : row.ratePct >= 20
                                        ? 'text-[var(--warning)]'
                                        : 'text-[var(--good)]'
                                  }`}
                                >
                                  {row.ratePct}%
                                  {row.rateDetail ? (
                                    <span className="text-[10.5px] font-normal text-[var(--muted)] ml-1">
                                      ({row.rateDetail})
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-[var(--muted)]">—</span>
                              )}
                            </td>
                          )}
                          {showPendingColumn && (
                            <td className="py-2 pl-2.5 text-right font-mono-num font-bold text-[var(--warning)] whitespace-nowrap">
                              {row.pendingCount ?? 0}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-mono-num">
                      <td colSpan={2} className="py-2 px-2 font-extrabold text-[var(--text)]">
                        Resumo ({paretoRows.length} categorias)
                      </td>
                      <td className="py-2 px-2.5 font-bold text-[var(--text)] whitespace-nowrap">
                        Σ {totalCount} · Mediana {stats.median.toFixed(1)}
                      </td>
                      <td className="py-2 px-2.5 text-right text-[var(--muted)] whitespace-nowrap">
                        Média {stats.mean.toFixed(1)}
                      </td>
                      <td className="py-2 px-2.5 text-right text-[var(--warning)] font-bold whitespace-nowrap">
                        Q3: {stats.q3.toFixed(1)}
                      </td>
                      {showRateColumn && <td className="py-2 px-2.5" />}
                      {showPendingColumn && (
                        <td className="py-2 pl-2.5 pr-2 text-right font-bold text-[var(--warning)] whitespace-nowrap">
                          {d3.sum(paretoRows, (r) => r.pendingCount ?? 0)}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
};
