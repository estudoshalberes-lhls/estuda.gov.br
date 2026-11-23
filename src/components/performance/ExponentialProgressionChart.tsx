import React, { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { CareerLevelDefinition, LevelMilestone } from '../../lib/careerGamification';

interface ExponentialProgressionChartProps {
  levels: CareerLevelDefinition[];
  milestones: LevelMilestone[];
  currentLevel: number;
  totalXp: number;
  xpGrowthRatePct: number;
  onSelectLevel?: (level: number) => void;
}

type MetricMode = 'cumulative' | 'delta';
type ScaleMode = 'linear' | 'log';

function formatCompactXp(xp: number): string {
  if (xp >= 1000000) return `${(xp / 1000000).toFixed(1).replace('.', ',')}M`;
  if (xp >= 1000) {
    const k = xp / 1000;
    return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1)).toLocaleString('pt-BR')}k`;
  }
  return xp.toLocaleString('pt-BR');
}

export const ExponentialProgressionChart: React.FC<ExponentialProgressionChartProps> = ({
  levels,
  milestones,
  currentLevel,
  totalXp,
  xpGrowthRatePct,
  onSelectLevel,
}) => {
  const [metricMode, setMetricMode] = useState<MetricMode>('cumulative');
  const [scaleMode, setScaleMode] = useState<ScaleMode>('linear');
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);

  const milestoneByLevel = useMemo(
    () => new Map<number, LevelMilestone>(milestones.map((m) => [m.level, m])),
    [milestones],
  );

  const inspectedLevel = hoveredLevel ?? currentLevel;
  const inspectedDef = levels[Math.max(0, Math.min(levels.length - 1, inspectedLevel - 1))];
  const inspectedMilestone = milestoneByLevel.get(inspectedLevel);

  const svgW = 860;
  const svgH = 210;
  const padL = 56;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const { points, areaPath, linePath, reachedPath, yTicks, currentPoint, inspectedPoint } =
    useMemo(() => {
      const getValue = (lvl: CareerLevelDefinition) =>
        metricMode === 'cumulative' ? lvl.minXp : lvl.xpDelta;

      const maxVal = Math.max(1, ...levels.map(getValue));
      const logMax = Math.log10(maxVal + 10);

      const toX = (level: number) => padL + ((level - 1) / Math.max(1, levels.length - 1)) * plotW;
      const toY = (val: number) => {
        const norm =
          scaleMode === 'log'
            ? Math.log10(Math.max(0, val) + 10) / Math.max(1, logMax)
            : val / maxVal;
        return padT + plotH - Math.max(0, Math.min(1, norm)) * plotH;
      };

      const pts = levels.map((lvl) => {
        const val = getValue(lvl);
        return {
          level: lvl.level,
          x: toX(lvl.level),
          y: toY(val),
          val,
          isGate: lvl.isPromotionGate,
          reached: totalXp >= lvl.minXp,
        };
      });

      const line = pts
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(' ');
      const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

      const reachedPts = pts.filter((p) => p.level <= currentLevel);
      const reached =
        reachedPts.length > 1
          ? reachedPts
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
              .join(' ')
          : '';

      const ticks =
        scaleMode === 'log'
          ? [0, 1000, 10000, 100000, maxVal].filter((v, idx, arr) => v <= maxVal && arr.indexOf(v) === idx)
          : [0, Math.round(maxVal * 0.25), Math.round(maxVal * 0.5), Math.round(maxVal * 0.75), maxVal];

      const yTickItems = ticks.map((val) => ({
        val,
        y: toY(val),
        label: formatCompactXp(val),
      }));

      return {
        points: pts,
        areaPath: area,
        linePath: line,
        reachedPath: reached,
        yTicks: yTickItems,
        currentPoint: pts[Math.max(0, Math.min(pts.length - 1, currentLevel - 1))],
        inspectedPoint: pts[Math.max(0, Math.min(pts.length - 1, inspectedLevel - 1))],
      };
    }, [currentLevel, inspectedLevel, levels, metricMode, plotH, plotW, scaleMode, totalXp]);

  return (
    <div className="py-4 border-b border-[var(--line)]">
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
        <div>
          <h4 className="m-0 text-[12.5px] font-extrabold text-[var(--text)] inline-flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
            Curva Exponencial de Experiência (Nv. 1 → Nv. 100)
          </h4>
          <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
            A exigência de XP cresce <strong className="text-[var(--text)]">+{xpGrowthRatePct}% compostos</strong> a cada novo nível (de 150 XP no Nv. 2 até{' '}
            <span className="font-mono-num">
              {levels[levels.length - 1]?.xpDelta.toLocaleString('pt-BR')} XP
            </span>{' '}
            no Nv. 100). Clique em qualquer ponto para inspecionar a patente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label="Métrica da curva exponencial"
            className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setMetricMode('cumulative')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                metricMode === 'cumulative'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              XP Acumulado
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('delta')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                metricMode === 'delta'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              ΔXP por Nível
            </button>
          </div>

          <div
            role="group"
            aria-label="Escala do eixo Y"
            className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setScaleMode('linear')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                scaleMode === 'linear'
                  ? 'bg-[var(--panel)] text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Linear
            </button>
            <button
              type="button"
              onClick={() => setScaleMode('log')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                scaleMode === 'log'
                  ? 'bg-[var(--panel)] text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Logarítmica
            </button>
          </div>
        </div>
      </div>

      {/* Inspected Level Readout Strip */}
      {inspectedDef && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11.5px] mb-2 px-3 py-2 rounded-lg bg-[var(--panel-soft)] border border-[var(--line)]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className="font-mono-num font-extrabold text-[var(--accent)]">
              Nv. {inspectedDef.level}
            </span>
            <span className="text-[var(--muted)]" aria-hidden="true">·</span>
            <strong className="text-[var(--text)] truncate">{inspectedDef.title}</strong>
            <span className="text-[var(--muted)]" aria-hidden="true">·</span>
            <span className="font-mono-num text-[var(--muted)]">
              Fator {inspectedDef.difficultyMultiplier.toLocaleString('pt-BR')}×
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono-num text-[11px]">
            <span className="text-[var(--text)] font-bold">
              {inspectedDef.minXp.toLocaleString('pt-BR')} XP total
            </span>
            {inspectedDef.xpDelta > 0 && (
              <span className="text-[var(--muted)]">
                (+{inspectedDef.xpDelta.toLocaleString('pt-BR')} XP do Nv. {inspectedDef.level - 1})
              </span>
            )}
            {inspectedMilestone && (
              <span
                className={
                  inspectedMilestone.completed
                    ? 'text-[var(--good)] font-bold'
                    : 'text-[var(--accent)] font-semibold'
                }
              >
                Marco: {inspectedMilestone.requirementLabel} (+{inspectedMilestone.bonusXp.toLocaleString('pt-BR')} XP)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Interactive SVG Curve */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full min-w-[540px] h-auto block select-none"
          role="img"
          aria-label="Gráfico da curva exponencial de experiência do nível 1 ao nível 100"
          onMouseLeave={() => setHoveredLevel(null)}
        >
          <defs>
            <linearGradient id="career-exp-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.24" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal Y gridlines & labels */}
          {yTicks.map((t) => (
            <g key={`yt-${t.val}`}>
              <line
                x1={padL}
                y1={t.y}
                x2={svgW - padR}
                y2={t.y}
                stroke="var(--line)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={t.y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="var(--muted)"
                className="font-mono-num"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* X-axis Patente markers every 10 levels */}
          {[1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((lvlNum) => {
            const p = points[lvlNum - 1];
            if (!p) return null;
            return (
              <g key={`xt-${lvlNum}`}>
                <line
                  x1={p.x}
                  y1={padT}
                  x2={p.x}
                  y2={padT + plotH}
                  stroke="var(--line)"
                  strokeOpacity={lvlNum % 10 === 0 ? 0.55 : 0.35}
                  strokeWidth="1"
                />
                <text
                  x={p.x}
                  y={svgH - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={lvlNum === 100 || lvlNum === currentLevel ? '700' : '500'}
                  fill={lvlNum === currentLevel ? 'var(--accent)' : 'var(--muted)'}
                  className="font-mono-num"
                >
                  {lvlNum === 1 ? 'Nv.1' : `${lvlNum}`}
                </text>
              </g>
            );
          })}

          {/* Area fill & full curve */}
          <path d={areaPath} fill="url(#career-exp-fill)" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.45"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Reached portion highlighted */}
          {reachedPath && (
            <path
              d={reachedPath}
              fill="none"
              stroke="var(--good)"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
          )}

          {/* Promotion Gate dots (every 10 levels) */}
          {points
            .filter((p) => p.isGate)
            .map((p) => (
              <circle
                key={`gate-${p.level}`}
                cx={p.x}
                cy={p.y}
                r={p.level === inspectedLevel ? 5 : 3.3}
                fill={p.reached ? 'var(--good)' : 'var(--panel)'}
                stroke={p.reached ? 'var(--good)' : 'var(--accent)'}
                strokeWidth="1.8"
              />
            ))}

          {/* Current level marker */}
          {currentPoint && (
            <g>
              <line
                x1={currentPoint.x}
                y1={padT}
                x2={currentPoint.x}
                y2={padT + plotH}
                stroke="var(--good)"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <circle
                cx={currentPoint.x}
                cy={currentPoint.y}
                r="5.2"
                fill="var(--good)"
                stroke="var(--panel)"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Inspected hover crosshair */}
          {inspectedPoint && hoveredLevel !== null && (
            <g pointerEvents="none">
              <line
                x1={inspectedPoint.x}
                y1={padT}
                x2={inspectedPoint.x}
                y2={padT + plotH}
                stroke="var(--accent)"
                strokeWidth="1.2"
              />
              <circle
                cx={inspectedPoint.x}
                cy={inspectedPoint.y}
                r="4.8"
                fill="var(--accent)"
                stroke="var(--panel)"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Invisible hit strips for smooth scrubbing across all 100 levels */}
          {points.map((p) => (
            <rect
              key={`hit-${p.level}`}
              x={p.x - plotW / 200}
              y={padT}
              width={plotW / 99 + 1}
              height={plotH}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredLevel(p.level)}
              onClick={() => onSelectLevel?.(p.level)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
};
