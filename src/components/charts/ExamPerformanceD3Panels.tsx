import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { BarChart3, PieChart, Target } from 'lucide-react';
import { Panel } from '../ui/PageHeader';
import { visibleName } from '../../lib/parsers';
import { useContainerWidth } from './d3Utils';

export interface ExamSubjectBreakdownRow {
  subject: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  accuracyPct: number | null;
  pending?: number;
  corrected?: number;
}

export interface ExamBlockPacingPoint {
  label: string;
  rangeLabel: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  accuracyPct: number;
}

export interface ExamErrorTypeBreakdownRow {
  type: string;
  count: number;
  pending: number;
  corrected: number;
}

// ============================================================================
// 1. D3 Chart: Desempenho por Matéria na Prova Selecionada
// ============================================================================

interface ExamSubjectBreakdownD3ChartProps {
  examTitle: string;
  mode: 'simulado' | 'prova_biblioteca';
  rows: ExamSubjectBreakdownRow[];
  selectedSubject: string;
  onSelectSubject?: (subject: string) => void;
}

export const ExamSubjectBreakdownD3Chart: React.FC<ExamSubjectBreakdownD3ChartProps> = React.memo(
  ({ examTitle, mode, rows, selectedSubject, onSelectSubject }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const width = useContainerWidth(containerRef, 680);
    const [hoveredSubject, setHoveredSubject] = useState<string | null>(null);

    const orderedRows = useMemo(() => {
      return [...rows]
        .sort((a, b) => {
          if (mode === 'simulado') {
            return (a.accuracyPct ?? 101) - (b.accuracyPct ?? 101) || b.total - a.total;
          }
          return b.total - a.total || (b.pending ?? 0) - (a.pending ?? 0);
        })
        .slice(0, 14);
    }, [rows, mode]);

    const rowHeight = 32;
    const margin = { top: 20, right: 108, bottom: 26, left: Math.min(210, Math.max(120, Math.round(width * 0.3))) };
    const innerW = Math.max(180, width - margin.left - margin.right);
    const innerH = Math.max(96, orderedRows.length * rowHeight);
    const height = innerH + margin.top + margin.bottom;

    const maxCount = useMemo(
      () => Math.max(1, d3.max(orderedRows, (r) => r.total) ?? 1),
      [orderedRows],
    );

    const xScale = useMemo(() => {
      if (mode === 'simulado') {
        return d3.scaleLinear().domain([0, 100]).range([0, innerW]);
      }
      return d3.scaleLinear().domain([0, maxCount]).nice().range([0, innerW]);
    }, [mode, innerW, maxCount]);

    const yScale = useMemo(
      () =>
        d3
          .scaleBand<string>()
          .domain(orderedRows.map((r) => r.subject))
          .range([0, innerH])
          .padding(0.28),
      [orderedRows, innerH],
    );

    const ticks = useMemo(() => {
      if (mode === 'simulado') return [0, 20, 40, 60, 80, 100];
      return xScale.ticks(Math.min(6, maxCount)).filter((t) => Number.isInteger(t));
    }, [mode, xScale, maxCount]);

    const hoveredRow = useMemo(
      () => orderedRows.find((r) => r.subject === hoveredSubject) ?? null,
      [orderedRows, hoveredSubject],
    );

    const truncateLabel = (text: string, maxChars: number) =>
      text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;

    const maxLabelChars = Math.max(15, Math.floor((margin.left - 16) / 6.3));

    return (
      <Panel
        title={
          mode === 'simulado'
            ? `Desempenho por Matéria na Prova · ${visibleName(examTitle)}`
            : `Distribuição de Erros e Revisões por Matéria · ${visibleName(examTitle)}`
        }
        subtitle={
          mode === 'simulado'
            ? 'Proporção de acertos, erros e questões em branco por disciplina na prova selecionada frente à meta de 80%.'
            : 'Volume de questões registradas por matéria nesta prova, separadas entre corrigidas e pendentes.'
        }
        className="mb-4"
        action={
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[var(--muted)]">
            {mode === 'simulado' ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[var(--good)]" />
                  Acertos
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[var(--bad)]" />
                  Erros
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[var(--warning)]" />
                  Em branco
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[var(--good)]" />
                  Corrigidas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[var(--warning)]" />
                  Pendentes
                </span>
              </>
            )}
          </div>
        }
      >
        <div ref={containerRef} className="relative w-full select-none">
          {orderedRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-10 px-4 text-center text-[12.5px] text-[var(--muted)]">
              Esta prova ainda não possui questões agrupadas por matéria para exibição gráfica.
            </div>
          ) : (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Gráfico de desempenho por matéria da prova ${visibleName(examTitle)}`}
              className="block overflow-visible"
              onMouseLeave={() => setHoveredSubject(null)}
            >
              <g transform={`translate(${margin.left},${margin.top})`}>
                {/* Vertical grid lines */}
                {ticks.map((t) => (
                  <g key={t}>
                    <line
                      x1={xScale(t)}
                      x2={xScale(t)}
                      y1={0}
                      y2={innerH}
                      stroke="var(--line)"
                      strokeOpacity={0.55}
                    />
                    <text
                      x={xScale(t)}
                      y={innerH + 16}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--muted)"
                      className="font-mono-num"
                    >
                      {mode === 'simulado' ? `${t}%` : t}
                    </text>
                  </g>
                ))}

                {/* 80% institutional target line in simulado mode */}
                {mode === 'simulado' && (
                  <g>
                    <line
                      x1={xScale(80)}
                      x2={xScale(80)}
                      y1={-6}
                      y2={innerH}
                      stroke="var(--accent)"
                      strokeWidth={1.35}
                      strokeDasharray="4 3"
                    />
                    <text
                      x={xScale(80)}
                      y={-9}
                      textAnchor="middle"
                      fontSize={9.5}
                      fontWeight={700}
                      fill="var(--accent)"
                      className="font-bold font-mono-num"
                    >
                      Meta 80%
                    </text>
                  </g>
                )}

                {/* Stacked bars per subject */}
                {orderedRows.map((row) => {
                  const yPos = yScale(row.subject) ?? 0;
                  const bh = yScale.bandwidth();
                  const isSelected = selectedSubject === row.subject;
                  const isHovered = hoveredSubject === row.subject;
                  const cleanLabel = visibleName(row.subject);

                  if (mode === 'simulado') {
                    const totalSafe = Math.max(1, row.total);
                    const accPct = (row.correct / totalSafe) * 100;
                    const errPct = (row.wrong / totalSafe) * 100;
                    const blankPct = (row.blank / totalSafe) * 100;

                    const wGood = Math.max(0, xScale(accPct));
                    const wBad = Math.max(0, xScale(accPct + errPct) - wGood);
                    const wBlank = Math.max(0, xScale(Math.min(100, accPct + errPct + blankPct)) - wGood - wBad);

                    const pctDisplay = row.accuracyPct ?? 0;
                    const pctColor =
                      pctDisplay >= 80 ? 'var(--good)' : pctDisplay >= 60 ? 'var(--accent)' : 'var(--bad)';

                    return (
                      <g
                        key={row.subject}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredSubject(row.subject)}
                        onClick={() =>
                          onSelectSubject?.(selectedSubject === row.subject ? 'Todas' : row.subject)
                        }
                      >
                        {(isSelected || isHovered) && (
                          <rect
                            x={-margin.left + 4}
                            y={yPos - 3}
                            width={width - 8}
                            height={bh + 6}
                            rx={6}
                            fill="var(--accent-soft)"
                            fillOpacity={isSelected ? 0.85 : 0.45}
                          />
                        )}
                        <text
                          x={-10}
                          y={yPos + bh / 2 + 3.5}
                          textAnchor="end"
                          fontSize={11}
                          fontWeight={isSelected ? 700 : 600}
                          fill={isSelected ? 'var(--accent)' : 'var(--text)'}
                          className={isSelected ? 'font-bold' : 'font-semibold'}
                        >
                          {truncateLabel(cleanLabel, maxLabelChars)}
                        </text>

                        {/* Bar track */}
                        <rect
                          x={0}
                          y={yPos}
                          width={innerW}
                          height={bh}
                          rx={4}
                          fill="var(--panel-soft)"
                          stroke="var(--line)"
                          strokeWidth={0.75}
                        />

                        {wGood > 0 && (
                          <rect x={0} y={yPos} width={wGood} height={bh} rx={3} fill="var(--good)" fillOpacity={0.9} />
                        )}
                        {wBad > 0 && (
                          <rect x={wGood} y={yPos} width={wBad} height={bh} fill="var(--bad)" fillOpacity={0.82} />
                        )}
                        {wBlank > 0 && (
                          <rect
                            x={wGood + wBad}
                            y={yPos}
                            width={wBlank}
                            height={bh}
                            fill="var(--warning)"
                            fillOpacity={0.78}
                          />
                        )}

                        <text
                          x={innerW + 8}
                          y={yPos + bh / 2 + 3.5}
                          textAnchor="start"
                          fontSize={10.5}
                          fontWeight={700}
                          fill={pctColor}
                          className="font-mono-num font-bold"
                        >
                          {pctDisplay}% ({row.correct}/{row.total})
                        </text>
                      </g>
                    );
                  }

                  // Proof library mode (Corrigidas vs Pendentes)
                  const corrected = row.corrected ?? 0;
                  const pending = row.pending ?? Math.max(0, row.total - corrected);
                  const wCorr = Math.max(0, xScale(corrected));
                  const wPend = Math.max(0, xScale(corrected + pending) - wCorr);

                  return (
                    <g
                      key={row.subject}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredSubject(row.subject)}
                      onClick={() =>
                        onSelectSubject?.(selectedSubject === row.subject ? 'Todas' : row.subject)
                      }
                    >
                      {(isSelected || isHovered) && (
                        <rect
                          x={-margin.left + 4}
                          y={yPos - 3}
                          width={width - 8}
                          height={bh + 6}
                          rx={6}
                          fill="var(--accent-soft)"
                          fillOpacity={isSelected ? 0.85 : 0.45}
                        />
                      )}
                      <text
                        x={-10}
                        y={yPos + bh / 2 + 3.5}
                        textAnchor="end"
                        fontSize={11}
                        fontWeight={isSelected ? 700 : 600}
                        fill={isSelected ? 'var(--accent)' : 'var(--text)'}
                        className={isSelected ? 'font-bold' : 'font-semibold'}
                      >
                        {truncateLabel(cleanLabel, maxLabelChars)}
                      </text>
                      <rect
                        x={0}
                        y={yPos}
                        width={innerW}
                        height={bh}
                        rx={4}
                        fill="var(--panel-soft)"
                        stroke="var(--line)"
                        strokeWidth={0.75}
                      />
                      {wCorr > 0 && (
                        <rect x={0} y={yPos} width={wCorr} height={bh} rx={3} fill="var(--good)" fillOpacity={0.88} />
                      )}
                      {wPend > 0 && (
                        <rect x={wCorr} y={yPos} width={wPend} height={bh} fill="var(--warning)" fillOpacity={0.85} />
                      )}
                      <text
                        x={innerW + 8}
                        y={yPos + bh / 2 + 3.5}
                        textAnchor="start"
                        fontSize={10.5}
                        fontWeight={700}
                        fill="var(--text)"
                        className="font-mono-num font-bold"
                      >
                        {row.total} reg. ({corrected} corr.)
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {hoveredRow && (
            <div className="mt-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] px-3 py-1.5 text-[11.5px] flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[var(--text)]">{visibleName(hoveredRow.subject)}</strong>
              {mode === 'simulado' ? (
                <span className="font-mono-num text-[var(--muted)]">
                  {hoveredRow.correct} acerto(s) · {hoveredRow.wrong} erro(s)
                  {hoveredRow.blank > 0 ? ` · ${hoveredRow.blank} em branco` : ''} ({hoveredRow.accuracyPct ?? 0}%)
                </span>
              ) : (
                <span className="font-mono-num text-[var(--muted)]">
                  {hoveredRow.total} registro(s) · {hoveredRow.corrected ?? 0} corrigido(s) ·{' '}
                  {hoveredRow.pending ?? 0} pendente(s)
                </span>
              )}
            </div>
          )}
        </div>
      </Panel>
    );
  },
);

// ============================================================================
// 2. D3 Chart: Composição do Resultado & Ritmo por Bloco de Questões
// ============================================================================

interface ExamOutcomeAndPacingD3ChartProps {
  examTitle: string;
  mode: 'simulado' | 'prova_biblioteca';
  correct: number;
  wrong: number;
  blank: number;
  accuracyPct: number;
  blockPacing: ExamBlockPacingPoint[];
  errorTypeBreakdown?: ExamErrorTypeBreakdownRow[];
}

export const ExamOutcomeAndPacingD3Chart: React.FC<ExamOutcomeAndPacingD3ChartProps> = React.memo(
  ({ examTitle, mode, correct, wrong, blank, accuracyPct, blockPacing, errorTypeBreakdown = [] }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const width = useContainerWidth(containerRef, 600);

    const isCompact = width < 520;
    const height = isCompact ? 360 : 278;

    const donutData = useMemo(() => {
      if (mode === 'simulado') {
        return [
          { key: 'correct', label: 'Acertos', value: correct, color: 'var(--good)' },
          { key: 'wrong', label: 'Erros', value: wrong, color: 'var(--bad)' },
          { key: 'blank', label: 'Em branco', value: blank, color: 'var(--warning)' },
        ].filter((d) => d.value > 0);
      }
      return [
        { key: 'corrected', label: 'Corrigidos', value: correct, color: 'var(--good)' },
        { key: 'pending', label: 'Pendentes', value: wrong, color: 'var(--warning)' },
      ].filter((d) => d.value > 0);
    }, [mode, correct, wrong, blank]);

    const totalItems = Math.max(1, correct + wrong + blank);

    const pieArcs = useMemo(() => {
      const pie = d3
        .pie<(typeof donutData)[number]>()
        .value((d) => d.value)
        .sort(null)
        .padAngle(0.03);
      return pie(donutData);
    }, [donutData]);

    const donutRadius = isCompact ? 62 : 70;
    const donutInner = isCompact ? 41 : 46;
    const donutCx = isCompact ? width / 2 : Math.min(130, width * 0.24);
    const donutCy = isCompact ? 86 : 112;

    const arcGenerator = useMemo(
      () =>
        d3
          .arc<d3.PieArcDatum<(typeof donutData)[number]>>()
          .innerRadius(donutInner)
          .outerRadius(donutRadius)
          .cornerRadius(4),
      [donutInner, donutRadius],
    );

    // Right panel area (pacing curve for simulado OR error-type bars for proof library)
    const rightX = isCompact ? 42 : donutCx + donutRadius + 56;
    const rightY = isCompact ? 202 : 28;
    const rightW = Math.max(160, width - rightX - 20);
    const rightH = isCompact ? 118 : 190;

    const blockXScale = useMemo(
      () =>
        d3
          .scaleBand<number>()
          .domain(blockPacing.map((_, i) => i))
          .range([0, rightW])
          .padding(0.26),
      [blockPacing, rightW],
    );

    const blockYScale = useMemo(
      () => d3.scaleLinear().domain([0, 100]).range([rightH, 0]),
      [rightH],
    );

    const pacingLinePath = useMemo(() => {
      if (blockPacing.length < 2) return '';
      const gen = d3
        .line<ExamBlockPacingPoint>()
        .x((_, i) => (blockXScale(i) ?? 0) + blockXScale.bandwidth() / 2)
        .y((d) => blockYScale(d.accuracyPct))
        .curve(d3.curveMonotoneX);
      return gen(blockPacing) || '';
    }, [blockPacing, blockXScale, blockYScale]);

    const topErrorTypes = useMemo(() => errorTypeBreakdown.slice(0, 6), [errorTypeBreakdown]);
    const maxErrTypeCount = Math.max(1, d3.max(topErrorTypes, (d) => d.count) ?? 1);

    return (
      <Panel
        title={
          mode === 'simulado'
            ? 'Balanço de Questões & Ritmo por Blocos'
            : 'Progresso de Correção & Tipos de Anotação'
        }
        subtitle={
          mode === 'simulado'
            ? `Distribuição de acertos/erros e evolução da taxa de acerto ao longo da prova ${visibleName(examTitle)}.`
            : `Taxa de conclusão da revisão e perfil dos erros registrados em ${visibleName(examTitle)}.`
        }
        action={
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] font-mono-num">
            {mode === 'simulado' ? <PieChart className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
            {accuracyPct}% {mode === 'simulado' ? 'aproveitamento' : 'corrigido'}
          </span>
        }
      >
        <div ref={containerRef} className="relative w-full select-none">
          {donutData.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-10 px-4 text-center text-[12.5px] text-[var(--muted)]">
              Sem dados suficientes para renderizar o balanço visual desta prova.
            </div>
          ) : (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Balanço e ritmo de desempenho da prova ${visibleName(examTitle)}`}
              className="block overflow-visible"
            >
              {/* Left: Donut Chart */}
              <g transform={`translate(${donutCx},${donutCy})`}>
                {pieArcs.map((arcDatum) => (
                  <path
                    key={arcDatum.data.key}
                    d={arcGenerator(arcDatum) || ''}
                    fill={arcDatum.data.color}
                    fillOpacity={0.9}
                  />
                ))}
                <text
                  x={0}
                  y={-2}
                  textAnchor="middle"
                  fontSize={20}
                  fontWeight={800}
                  fill="var(--text)"
                  className="font-mono-num font-extrabold"
                >
                  {accuracyPct}%
                </text>
                <text
                  x={0}
                  y={15}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fill="var(--muted)"
                  className="font-semibold"
                >
                  {mode === 'simulado' ? 'aproveitamento' : 'corrigidos'}
                </text>
              </g>

              {/* Legend beneath donut */}
              <g
                transform={`translate(${isCompact ? Math.max(12, width / 2 - 115) : Math.max(8, donutCx - 82)},${
                  donutCy + donutRadius + 18
                })`}
              >
                {donutData.map((item, idx) => {
                  const pct = Math.round((item.value / totalItems) * 100);
                  const rowY = isCompact ? 0 : idx * 17;
                  const rowX = isCompact ? idx * 84 : 0;
                  return (
                    <g key={item.key} transform={`translate(${rowX},${rowY})`}>
                      <rect x={0} y={-8} width={9} height={9} rx={2} fill={item.color} />
                      <text x={13} y={0} fontSize={10} fontWeight={600} fill="var(--text)" className="font-semibold">
                        {item.label}:
                      </text>
                      <text
                        x={isCompact ? 13 : 82}
                        y={isCompact ? 11 : 0}
                        fontSize={10}
                        fontWeight={700}
                        fill="var(--muted)"
                        className="font-mono-num font-bold"
                      >
                        {item.value} ({pct}%)
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Right: Pacing by Question Blocks (Simulado) OR Error Types (Library Proof) */}
              <g transform={`translate(${rightX},${rightY})`}>
                <text
                  x={0}
                  y={-10}
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--muted)"
                  className="font-bold"
                >
                  {mode === 'simulado'
                    ? 'ACERTO POR BLOCO SEQUENCIAL DE QUESTÕES'
                    : 'CLASSIFICAÇÃO DAS ANOTAÇÕES NA PROVA'}
                </text>

                {mode === 'simulado' && blockPacing.length > 0 ? (
                  <>
                    {[0, 25, 50, 75, 100].map((t) => (
                      <g key={t}>
                        <line
                          x1={0}
                          x2={rightW}
                          y1={blockYScale(t)}
                          y2={blockYScale(t)}
                          stroke="var(--line)"
                          strokeOpacity={0.5}
                        />
                        <text
                          x={-6}
                          y={blockYScale(t) + 3}
                          textAnchor="end"
                          fontSize={9.5}
                          fill="var(--muted)"
                          className="font-mono-num"
                        >
                          {t}%
                        </text>
                      </g>
                    ))}

                    {/* 80% target line */}
                    <line
                      x1={0}
                      x2={rightW}
                      y1={blockYScale(80)}
                      y2={blockYScale(80)}
                      stroke="var(--accent)"
                      strokeWidth={1.2}
                      strokeDasharray="4 3"
                    />

                    {/* Block bars */}
                    {blockPacing.map((pt, idx) => {
                      const bx = blockXScale(idx) ?? 0;
                      const bw = blockXScale.bandwidth();
                      const by = blockYScale(pt.accuracyPct);
                      const bh = Math.max(2, rightH - by);
                      const fillColor =
                        pt.accuracyPct >= 80
                          ? 'var(--good)'
                          : pt.accuracyPct >= 60
                            ? 'var(--accent)'
                            : 'var(--bad)';
                      return (
                        <g key={pt.label}>
                          <rect
                            x={bx}
                            y={by}
                            width={bw}
                            height={bh}
                            rx={4}
                            fill={fillColor}
                            fillOpacity={0.28}
                            stroke={fillColor}
                            strokeWidth={1.2}
                          />
                          <text
                            x={bx + bw / 2}
                            y={Math.max(10, by - 5)}
                            textAnchor="middle"
                            fontSize={9.5}
                            fontWeight={700}
                            fill={fillColor}
                            className="font-mono-num font-bold"
                          >
                            {pt.accuracyPct}%
                          </text>
                          <text
                            x={bx + bw / 2}
                            y={rightH + 15}
                            textAnchor="middle"
                            fontSize={9.5}
                            fontWeight={600}
                            fill="var(--muted)"
                            className="font-mono-num font-semibold"
                          >
                            {pt.label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Trend curve */}
                    {pacingLinePath && (
                      <path
                        d={pacingLinePath}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={2}
                      />
                    )}
                    {blockPacing.map((pt, idx) => (
                      <circle
                        key={`dot-${pt.label}`}
                        cx={(blockXScale(idx) ?? 0) + blockXScale.bandwidth() / 2}
                        cy={blockYScale(pt.accuracyPct)}
                        r={3.5}
                        fill="var(--panel)"
                        stroke="var(--accent)"
                        strokeWidth={2}
                      />
                    ))}
                  </>
                ) : mode === 'prova_biblioteca' && topErrorTypes.length > 0 ? (
                  <>
                    {topErrorTypes.map((item, idx) => {
                      const rowH = Math.min(28, Math.floor(rightH / Math.max(1, topErrorTypes.length)));
                      const ry = idx * rowH + 6;
                      const barW = Math.max(8, ((rightW - 110) * item.count) / maxErrTypeCount);
                      return (
                        <g key={item.type}>
                          <text
                            x={0}
                            y={ry + 11}
                            fontSize={10}
                            fontWeight={600}
                            fill="var(--text)"
                            className="font-semibold"
                          >
                            {item.type.length > 18 ? `${item.type.slice(0, 17)}…` : item.type}
                          </text>
                          <rect
                            x={98}
                            y={ry + 1}
                            width={barW}
                            height={14}
                            rx={3}
                            fill="var(--accent)"
                            fillOpacity={0.85}
                          />
                          <text
                            x={98 + barW + 6}
                            y={ry + 11}
                            fontSize={9.5}
                            fontWeight={700}
                            fill="var(--muted)"
                            className="font-mono-num font-bold"
                          >
                            {item.count}
                          </text>
                        </g>
                      );
                    })}
                  </>
                ) : (
                  <g>
                    <rect
                      x={0}
                      y={12}
                      width={rightW}
                      height={rightH - 20}
                      rx={8}
                      fill="var(--panel-soft)"
                      stroke="var(--line)"
                      strokeDasharray="4 3"
                    />
                    <text
                      x={rightW / 2}
                      y={rightH / 2}
                      textAnchor="middle"
                      fontSize={10.5}
                      fill="var(--muted)"
                    >
                      Sem detalhamento por blocos nesta prova
                    </text>
                  </g>
                )}
              </g>
            </svg>
          )}
        </div>
      </Panel>
    );
  },
);

// Helper icon export check
export const ExamAnalyticsBadgeIcon = Target;
