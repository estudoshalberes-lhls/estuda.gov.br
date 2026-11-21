import React, { useMemo, useState } from 'react';
import { BarChart3, Clock, FileCheck2, RotateCcw, TrendingUp, X } from 'lucide-react';
import {
  computeDiscursiveAnalytics,
  DiscursiveEvolutionPoint,
} from '../../lib/discursiveHelpers';
import { EssayRecord } from '../../types/study';
import { Panel } from '../ui/PageHeader';

interface DiscursiveAnalyticsPanelProps {
  essays: EssayRecord[];
  activeErrorTag: string;
  onToggleErrorTag: (tag: string) => void;
}

function formatTotalMinutesLabel(seconds: number): string {
  if (seconds <= 0) return '0 min';
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  return `${m} min`;
}

export const DiscursiveAnalyticsPanel: React.FC<DiscursiveAnalyticsPanelProps> = ({
  essays,
  activeErrorTag,
  onToggleErrorTag,
}) => {
  const analytics = useMemo(() => computeDiscursiveAnalytics(essays), [essays]);
  const [hoveredPoint, setHoveredPoint] = useState<DiscursiveEvolutionPoint | null>(null);

  if (analytics.total === 0) return null;

  const topErrors = analytics.errorTagCounts.slice(0, 8);
  const maxTagCount = topErrors.length > 0 ? topErrors[0].count : 1;

  // SVG chart geometry
  const chartW = 520;
  const chartH = 165;
  const padL = 34;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const evo = analytics.evolution;
  const xFor = (idx: number) =>
    evo.length <= 1 ? padL + plotW / 2 : padL + (idx / (evo.length - 1)) * plotW;
  const yFor = (pct: number) => padT + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH;

  const linePath = evo
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(idx).toFixed(1)} ${yFor(pt.pct).toFixed(1)}`)
    .join(' ');

  return (
    <div className="mb-4 flex flex-col gap-3 print:hidden">
      {/* 4 KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            <span>Protocoladas</span>
            <FileCheck2 className="w-3.5 h-3.5 text-[var(--accent)]" />
          </div>
          <div className="mt-1.5 font-mono-num tabular-nums text-[22px] font-extrabold leading-none text-[var(--text)]">
            {analytics.total}
          </div>
          <div className="mt-1.5 text-[11.5px] text-[var(--muted)] tabular-nums">
            <span className="text-[var(--good)] font-semibold">{analytics.correctedCount} corrigidas</span>
            {' · '}
            <span>{analytics.pendingCount} pendentes</span>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            <span>Aproveitamento Médio</span>
            <TrendingUp className="w-3.5 h-3.5 text-[var(--good)]" />
          </div>
          <div className="mt-1.5 font-mono-num tabular-nums text-[22px] font-extrabold leading-none text-[var(--text)]">
            {analytics.avgPct !== null ? `${analytics.avgPct}%` : '—'}
          </div>
          <div className="mt-1.5 text-[11.5px] text-[var(--muted)] tabular-nums">
            {analytics.bestPct !== null
              ? `Melhor nota: ${analytics.bestPct}% · ${analytics.gradedCount} com nota`
              : 'Registre notas no espelho'}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            <span>Reescritas & Tempo</span>
            <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
          </div>
          <div className="mt-1.5 font-mono-num tabular-nums text-[22px] font-extrabold leading-none text-[var(--text)]">
            {analytics.rewrittenCount}
            <span className="ml-1.5 text-[12px] font-semibold text-[var(--muted)]">V2</span>
          </div>
          <div className="mt-1.5 text-[11.5px] text-[var(--muted)] tabular-nums">
            {analytics.totalTimedSeconds > 0
              ? `Cronometrado: ${formatTotalMinutesLabel(analytics.totalTimedSeconds)}`
              : 'Use o cronômetro discursivo'}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            <span>
              {analytics.avgCebraspeErrorRate !== null ? 'Índice NE/TL' : 'Falhas Mapeadas'}
            </span>
            <BarChart3 className="w-3.5 h-3.5 text-[var(--warning)]" />
          </div>
          <div className="mt-1.5 font-mono-num tabular-nums text-[22px] font-extrabold leading-none text-[var(--text)]">
            {analytics.avgCebraspeErrorRate !== null
              ? analytics.avgCebraspeErrorRate.toFixed(2)
              : analytics.errorTagCounts.length}
          </div>
          <div className="mt-1.5 text-[11.5px] text-[var(--muted)] tabular-nums">
            {analytics.avgCebraspeErrorRate !== null
              ? 'erros gramaticais/linha (Cebraspe)'
              : topErrors.length > 0
                ? `Principal: ${topErrors[0].tag}`
                : 'Marque falhas no espelho'}
          </div>
        </div>
      </div>

      {/* Evolution chart + Error tags ranking */}
      {(evo.length > 0 || topErrors.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3">
          <Panel
            title="Evolução das notas (%)"
            action={
              <span className="text-[11px] text-[var(--muted)] tabular-nums">
                Linha de corte: 70% {evo.some((p) => p.rewritePct !== undefined) ? '· Verde: V2' : ''}
              </span>
            }
          >
            {evo.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[var(--muted)]">
                Preencha o Espelho de Correção com a pontuação de suas redações para acompanhar sua curva de evolução.
              </div>
            ) : (
              <div>
                <div className="min-h-[20px] mb-1 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                  {hoveredPoint ? (
                    <span className="text-[var(--text)] font-semibold truncate">
                      {hoveredPoint.label} ·{' '}
                      <span className="font-mono-num tabular-nums text-[var(--accent)]">
                        {hoveredPoint.score.toFixed(2)}/{hoveredPoint.max} ({hoveredPoint.pct}%)
                      </span>
                      {hoveredPoint.rewritePct !== undefined && (
                        <span className="ml-2 font-mono-num tabular-nums text-[var(--good)]">
                          V2: {hoveredPoint.rewritePct}%
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">
                      Passe o cursor sobre um ponto para ver nota e comparação V2.
                    </span>
                  )}
                </div>

                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full h-auto overflow-visible select-none"
                  role="img"
                  aria-label="Gráfico de evolução percentual das notas discursivas"
                >
                  {/* Grid lines */}
                  {[0, 50, 70, 100].map((tick) => {
                    const y = yFor(tick);
                    const isCutoff = tick === 70;
                    return (
                      <g key={tick}>
                        <line
                          x1={padL}
                          x2={chartW - padR}
                          y1={y}
                          y2={y}
                          stroke={isCutoff ? 'var(--good)' : 'var(--line)'}
                          strokeWidth={isCutoff ? 1.2 : 1}
                          strokeDasharray={isCutoff ? '4 3' : undefined}
                          opacity={isCutoff ? 0.7 : 0.85}
                        />
                        <text
                          x={padL - 6}
                          y={y + 3.5}
                          textAnchor="end"
                          fontSize="9.5"
                          fill={isCutoff ? 'var(--good)' : 'var(--muted)'}
                          fontWeight={isCutoff ? '700' : '500'}
                        >
                          {tick}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Main evolution polyline */}
                  {evo.length > 1 && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Data points & V2 connectors */}
                  {evo.map((pt, idx) => {
                    const cx = xFor(idx);
                    const cy = yFor(pt.pct);
                    const isHovered = hoveredPoint?.id === pt.id;
                    const rwY = pt.rewritePct !== undefined ? yFor(pt.rewritePct) : null;
                    return (
                      <g
                        key={pt.id}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        {rwY !== null && (
                          <>
                            <line
                              x1={cx}
                              x2={cx}
                              y1={cy}
                              y2={rwY}
                              stroke="var(--good)"
                              strokeWidth="1.5"
                              strokeDasharray="2 2"
                            />
                            <circle
                              cx={cx}
                              cy={rwY}
                              r={isHovered ? 5 : 4}
                              fill="var(--good)"
                              stroke="var(--panel)"
                              strokeWidth="1.5"
                            />
                          </>
                        )}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 5.5 : 4.2}
                          fill="var(--accent)"
                          stroke="var(--panel)"
                          strokeWidth="1.8"
                        />
                        <text
                          x={cx}
                          y={chartH - 7}
                          textAnchor="middle"
                          fontSize="9"
                          fill="var(--muted)"
                        >
                          {pt.dateShort}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </Panel>

          <Panel
            title="Erros recorrentes"
            action={
              activeErrorTag ? (
                <button
                  type="button"
                  onClick={() => onToggleErrorTag(activeErrorTag)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  <X className="w-3 h-3" />
                  Limpar filtro
                </button>
              ) : (
                <span className="text-[11px] text-[var(--muted)]">Clique para filtrar</span>
              )
            }
          >
            {topErrors.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[var(--muted)]">
                Marque etiquetas de falhas (crase, regência, coesão, fundamentação...) no Espelho de Correção para identificar seus padrões.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {topErrors.map(({ tag, count }) => {
                  const pct = Math.max(10, Math.round((count / maxTagCount) * 100));
                  const isActive = activeErrorTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onToggleErrorTag(tag)}
                      className={`w-full text-left rounded-lg px-2.5 py-1.5 border transition-colors ${
                        isActive
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-transparent hover:border-[var(--line-strong)] hover:bg-[var(--panel-soft)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="font-semibold text-[var(--text)] truncate">{tag}</span>
                        <span className="font-mono-num tabular-nums text-[11.5px] font-bold text-[var(--muted)] shrink-0">
                          {count}×
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--panel-raised)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
                {activeErrorTag && (
                  <button
                    type="button"
                    onClick={() => onToggleErrorTag('')}
                    className="mt-1 inline-flex items-center justify-center gap-1 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Exibir todas as redações
                  </button>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
};
