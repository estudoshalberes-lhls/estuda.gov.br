import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Check, SlidersHorizontal, Target } from 'lucide-react';
import { StudyDatabase } from '../../types/study';
import {
  WEEKDAYS,
  formatClock,
  inferFixedSubjectFromTopic,
  localDateIso,
  visibleName,
} from '../../lib/parsers';
import { Panel } from '../ui/PageHeader';
import { useContainerWidth } from './d3Utils';

type WeeksWindow = 6 | 12 | 16;
type DashboardView = 'weeks' | 'current-week';

const SHORT_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
const GOAL_PRESETS = [14, 21, 28, 35, 42] as const;

function parseIsoLocalDate(iso?: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return `${formatDayMonth(monday)} a ${formatDayMonth(sunday)}`;
}

function formatHoursDecimal(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded.toLocaleString('pt-BR', { minimumFractionDigits: rounded % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })}h`;
}

interface WeekBucket {
  iso: string;
  label: string;
  range: string;
  netSeconds: number;
  netHours: number;
  pctOfGoal: number;
  deltaHours: number;
  metGoal: boolean;
  activeDays: number;
  sessions: number;
  isCurrentWeek: boolean;
  topSubjects: Array<{ subject: string; seconds: number }>;
  rollingAvgHours: number;
}

interface CurrentWeekDayPoint {
  idx: number;
  shortLabel: string;
  fullLabel: string;
  iso: string;
  dateLabel: string;
  daySeconds: number;
  dayHours: number;
  cumHours: number;
  idealCumHours: number;
  isToday: boolean;
  isFuture: boolean;
}

interface WeeklyGoalProgressD3DashboardProps {
  db: StudyDatabase;
  fixedSubjects: string[];
  subjectFilter?: string;
  onSaveWeeklyGoal: (hours: number) => void;
  onNavigate?: (page: 'Cronograma' | 'Treino Diário') => void;
}

export const WeeklyGoalProgressD3Dashboard: React.FC<WeeklyGoalProgressD3DashboardProps> = React.memo(
  ({ db, fixedSubjects, subjectFilter = 'Todas', onSaveWeeklyGoal, onNavigate }) => {
    const [weeksCount, setWeeksCount] = useState<WeeksWindow>(12);
    const [viewMode, setViewMode] = useState<DashboardView>('weeks');
    const [hoveredWeekIdx, setHoveredWeekIdx] = useState<number | null>(null);
    const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
    const [editingGoal, setEditingGoal] = useState(false);

    const resolvedGoalMeta = useMemo(() => {
      const explicitWeekly = Number(db.preferences?.weekly_hours_goal);
      if (Number.isFinite(explicitWeekly) && explicitWeekly > 0) {
        return { hours: explicitWeekly, sourceLabel: 'Meta semanal personalizada' };
      }
      const subjectGoals = db.preferences?.weekly_subject_hours || {};
      const subjectSum = Object.values(subjectGoals).reduce(
        (acc, val) => acc + (Number.isFinite(Number(val)) && Number(val) > 0 ? Number(val) : 0),
        0,
      );
      if (subjectSum > 0) {
        return { hours: Math.round(subjectSum * 10) / 10, sourceLabel: 'Soma das metas por matéria' };
      }
      const daily = Number(db.preferences?.daily_hours_goal);
      const effectiveDaily = Number.isFinite(daily) && daily > 0 ? daily : 3;
      return {
        hours: Math.round(effectiveDaily * 7 * 10) / 10,
        sourceLabel: `Baseada na meta diária (${formatHoursDecimal(effectiveDaily)}/dia × 7)`,
      };
    }, [
      db.preferences?.daily_hours_goal,
      db.preferences?.weekly_hours_goal,
      db.preferences?.weekly_subject_hours,
    ]);

    const weeklyGoalHours = resolvedGoalMeta.hours;
    const [goalDraft, setGoalDraft] = useState<string>(String(weeklyGoalHours));

    const openGoalEditor = () => {
      setGoalDraft(String(weeklyGoalHours));
      setEditingGoal((prev) => !prev);
    };

    const handleGoalSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const parsed = Number(goalDraft.replace(',', '.'));
      const clamped = Math.max(1, Math.min(112, Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 21));
      onSaveWeeklyGoal(clamped);
      setEditingGoal(false);
    };

    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    const containerWidth = useContainerWidth(chartContainerRef, 680);

    const { weeks, currentWeekDays, currentWeekSubjects, kpis, hasAnyStudyData } = useMemo(() => {
      const now = new Date();
      const todayIso = localDateIso(now);
      const currentMonday = getMondayOfWeek(now);
      const currentMondayIso = localDateIso(currentMonday);

      const list: Array<{
        iso: string;
        monday: Date;
        label: string;
        range: string;
        netSeconds: number;
        sessions: number;
        activeDaySet: Set<string>;
        bySubject: Record<string, number>;
        isCurrentWeek: boolean;
      }> = [];
      const weekIndexByIso = new Map<string, number>();

      for (let i = weeksCount - 1; i >= 0; i--) {
        const monday = new Date(
          currentMonday.getFullYear(),
          currentMonday.getMonth(),
          currentMonday.getDate() - i * 7,
        );
        const iso = localDateIso(monday);
        weekIndexByIso.set(iso, list.length);
        list.push({
          iso,
          monday,
          label: formatDayMonth(monday),
          range: formatWeekRange(monday),
          netSeconds: 0,
          sessions: 0,
          activeDaySet: new Set<string>(),
          bySubject: {},
          isCurrentWeek: iso === currentMondayIso,
        });
      }

      const daySecondsByIso = new Map<string, number>();
      const currentWeekDayList: Array<{ iso: string; date: Date; idx: number }> = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(
          currentMonday.getFullYear(),
          currentMonday.getMonth(),
          currentMonday.getDate() + i,
        );
        const iso = localDateIso(d);
        daySecondsByIso.set(iso, 0);
        currentWeekDayList.push({ iso, date: d, idx: i });
      }

      const resolveSubj = (raw?: string) => {
        const clean = (raw || 'Geral').trim();
        return inferFixedSubjectFromTopic({ materia: clean }, fixedSubjects) || clean;
      };

      for (const rec of db.studyTimeRecords) {
        const d = parseIsoLocalDate(rec.date);
        if (!d) continue;
        const wkIso = localDateIso(getMondayOfWeek(d));
        const wkIdx = weekIndexByIso.get(wkIso);

        let recSec = 0;
        const recBySubj: Record<string, number> = {};
        for (const a of rec.allocations || []) {
          const subj = resolveSubj(a.subject);
          if (subjectFilter !== 'Todas' && subj !== subjectFilter) continue;
          const sec = Number(a.seconds) || 0;
          if (sec <= 0) continue;
          recSec += sec;
          recBySubj[subj] = (recBySubj[subj] || 0) + sec;
        }

        if (recSec <= 0) continue;

        if (wkIdx !== undefined) {
          const bucket = list[wkIdx];
          bucket.netSeconds += recSec;
          bucket.sessions += 1;
          bucket.activeDaySet.add(rec.date);
          for (const [s, sec] of Object.entries(recBySubj)) {
            bucket.bySubject[s] = (bucket.bySubject[s] || 0) + sec;
          }
        }

        if (daySecondsByIso.has(rec.date)) {
          daySecondsByIso.set(rec.date, (daySecondsByIso.get(rec.date) || 0) + recSec);
        }
      }

      const buckets: WeekBucket[] = list.map((b, idx) => {
        const netHours = b.netSeconds / 3600;
        const pctOfGoal = weeklyGoalHours > 0 ? Math.round((netHours / weeklyGoalHours) * 100) : 0;
        const winStart = Math.max(0, idx - 3);
        const slice = list.slice(winStart, idx + 1);
        const rollingAvgHours =
          slice.length > 0 ? d3.sum(slice, (s) => s.netSeconds / 3600) / slice.length : 0;

        return {
          iso: b.iso,
          label: b.label,
          range: b.range,
          netSeconds: b.netSeconds,
          netHours,
          pctOfGoal,
          deltaHours: netHours - weeklyGoalHours,
          metGoal: netHours >= weeklyGoalHours && weeklyGoalHours > 0,
          activeDays: b.activeDaySet.size,
          sessions: b.sessions,
          isCurrentWeek: b.isCurrentWeek,
          topSubjects: Object.entries(b.bySubject)
            .map(([subject, seconds]) => ({ subject, seconds }))
            .sort((a, b2) => b2.seconds - a.seconds),
          rollingAvgHours,
        };
      });

      let runningCum = 0;
      const dayPoints: CurrentWeekDayPoint[] = currentWeekDayList.map((dInfo) => {
        const sec = daySecondsByIso.get(dInfo.iso) || 0;
        const hrs = sec / 3600;
        const isFuture = dInfo.iso > todayIso;
        if (!isFuture) {
          runningCum += hrs;
        }
        return {
          idx: dInfo.idx,
          shortLabel: SHORT_WEEKDAYS[dInfo.idx],
          fullLabel: WEEKDAYS[dInfo.idx] || SHORT_WEEKDAYS[dInfo.idx],
          iso: dInfo.iso,
          dateLabel: formatDayMonth(dInfo.date),
          daySeconds: sec,
          dayHours: hrs,
          cumHours: isFuture ? runningCum : runningCum,
          idealCumHours: (weeklyGoalHours * (dInfo.idx + 1)) / 7,
          isToday: dInfo.iso === todayIso,
          isFuture,
        };
      });

      const currentBucket = buckets[buckets.length - 1];
      const currentHours = currentBucket?.netHours ?? 0;
      const currentSeconds = currentBucket?.netSeconds ?? 0;
      const currentPct = currentBucket?.pctOfGoal ?? 0;
      const remainingHours = Math.max(0, weeklyGoalHours - currentHours);
      const surplusHours = Math.max(0, currentHours - weeklyGoalHours);

      const todayIndex = Math.max(0, dayPoints.findIndex((p) => p.isToday));
      const daysElapsedInclusive = Math.max(1, todayIndex + 1);
      const daysRemainingInclusive = Math.max(1, 7 - todayIndex);
      const neededDailyPace = remainingHours / daysRemainingInclusive;
      const projectedWeekHours = (currentHours / daysElapsedInclusive) * 7;

      const metGoalCount = buckets.filter((b) => b.metGoal).length;
      const activeWeeks = buckets.filter((b) => b.netSeconds > 0);
      const avgActiveHours =
        activeWeeks.length > 0 ? d3.sum(activeWeeks, (b) => b.netHours) / activeWeeks.length : 0;

      // Consecutive weeks hitting goal ending at current or previous completed week
      let goalStreak = 0;
      const startCheck = currentBucket?.metGoal ? buckets.length - 1 : buckets.length - 2;
      for (let i = startCheck; i >= 0; i--) {
        if (buckets[i].metGoal) goalStreak += 1;
        else break;
      }

      const subjectTargets = db.preferences?.weekly_subject_hours || {};
      const weekSubjRows = (currentBucket?.topSubjects || []).slice(0, 5).map((item) => {
        const target = Number(subjectTargets[item.subject]) || 0;
        const hrs = item.seconds / 3600;
        return {
          subject: item.subject,
          displayName: visibleName(item.subject),
          seconds: item.seconds,
          hours: hrs,
          targetHours: target,
          sharePct: currentSeconds > 0 ? Math.round((item.seconds / currentSeconds) * 100) : 0,
        };
      });

      return {
        weeks: buckets,
        currentWeekDays: dayPoints,
        currentWeekSubjects: weekSubjRows,
        hasAnyStudyData: activeWeeks.length > 0,
        kpis: {
          currentSeconds,
          currentHours,
          currentPct,
          remainingHours,
          surplusHours,
          neededDailyPace,
          projectedWeekHours,
          metGoalCount,
          totalWeeks: buckets.length,
          avgActiveHours,
          goalStreak,
          activeDaysThisWeek: currentBucket?.activeDays ?? 0,
        },
      };
    }, [
      db.preferences?.weekly_subject_hours,
      db.studyTimeRecords,
      fixedSubjects,
      subjectFilter,
      weeklyGoalHours,
      weeksCount,
    ]);

    // D3 Geometry — Weekly Bar + Goal + Rolling Trend
    const chartHeight = 278;
    const margin = { top: 24, right: 20, bottom: 34, left: 48 };
    const innerW = Math.max(260, containerWidth - margin.left - margin.right);
    const innerH = chartHeight - margin.top - margin.bottom;

    const weeklyD3 = useMemo(() => {
      const xScale = d3
        .scaleBand<number>()
        .domain(weeks.map((_, i) => i))
        .range([0, innerW])
        .padding(0.28);

      const maxActual = d3.max(weeks, (w) => w.netHours) ?? 0;
      const yMax = Math.max(weeklyGoalHours * 1.22, maxActual * 1.18, 4);
      const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([innerH, 0]);

      const trendGenerator = d3
        .line<WeekBucket>()
        .x((_, i) => (xScale(i) ?? 0) + xScale.bandwidth() / 2)
        .y((d) => yScale(d.rollingAvgHours))
        .curve(d3.curveMonotoneX);

      return {
        xScale,
        yScale,
        yTicks: yScale.ticks(5),
        goalY: yScale(weeklyGoalHours),
        trendPath: trendGenerator(weeks) || '',
      };
    }, [innerH, innerW, weeklyGoalHours, weeks]);

    // D3 Geometry — Current Week Daily Bars + Cumulative Actual vs Ideal Pace
    const currentWeekD3 = useMemo(() => {
      const xScale = d3
        .scaleBand<number>()
        .domain(currentWeekDays.map((d) => d.idx))
        .range([0, innerW])
        .padding(0.32);

      const maxCum = Math.max(
        weeklyGoalHours * 1.12,
        d3.max(currentWeekDays, (d) => d.cumHours) ?? 0,
        4,
      );
      const yScale = d3.scaleLinear().domain([0, maxCum]).nice().range([innerH, 0]);

      const elapsedPoints = currentWeekDays.filter((d) => !d.isFuture);
      const actualLineGen = d3
        .line<CurrentWeekDayPoint>()
        .x((d) => (xScale(d.idx) ?? 0) + xScale.bandwidth() / 2)
        .y((d) => yScale(d.cumHours))
        .curve(d3.curveMonotoneX);

      const actualAreaGen = d3
        .area<CurrentWeekDayPoint>()
        .x((d) => (xScale(d.idx) ?? 0) + xScale.bandwidth() / 2)
        .y0(innerH)
        .y1((d) => yScale(d.cumHours))
        .curve(d3.curveMonotoneX);

      const idealLineGen = d3
        .line<CurrentWeekDayPoint>()
        .x((d) => (xScale(d.idx) ?? 0) + xScale.bandwidth() / 2)
        .y((d) => yScale(d.idealCumHours));

      return {
        xScale,
        yScale,
        yTicks: yScale.ticks(5),
        goalY: yScale(weeklyGoalHours),
        elapsedPoints,
        actualLinePath: actualLineGen(elapsedPoints) || '',
        actualAreaPath: actualAreaGen(elapsedPoints) || '',
        idealLinePath: idealLineGen(currentWeekDays) || '',
      };
    }, [currentWeekDays, innerH, innerW, weeklyGoalHours]);

    const statusInfo =
      kpis.currentPct >= 100
        ? { label: 'Meta semanal atingida', color: 'var(--good)' }
        : kpis.projectedWeekHours >= weeklyGoalHours * 0.92
          ? { label: 'No ritmo da meta', color: 'var(--accent)' }
          : { label: 'Abaixo do ritmo ideal', color: 'var(--warning)' };

    const hoveredWeek = hoveredWeekIdx !== null ? weeks[hoveredWeekIdx] : null;
    const hoveredWeekX =
      hoveredWeekIdx !== null
        ? (weeklyD3.xScale(hoveredWeekIdx) ?? 0) + weeklyD3.xScale.bandwidth() / 2
        : 0;

    const hoveredDay = hoveredDayIdx !== null ? currentWeekDays[hoveredDayIdx] : null;
    const hoveredDayX =
      hoveredDayIdx !== null
        ? (currentWeekD3.xScale(hoveredDayIdx) ?? 0) + currentWeekD3.xScale.bandwidth() / 2
        : 0;

    return (
      <Panel
        className="mb-4"
        title="Progresso Semanal · Horas Líquidas × Meta Estabelecida"
        subtitle={
          subjectFilter !== 'Todas'
            ? `Comparativo em D3 das horas líquidas de ${visibleName(subjectFilter)} frente à meta semanal de ${formatHoursDecimal(weeklyGoalHours)}.`
            : `Comparativo interativo em D3 das suas horas líquidas semanais frente à meta de ${formatHoursDecimal(weeklyGoalHours)} (${resolvedGoalMeta.sourceLabel}).`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher */}
            <div className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('weeks')}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'weeks'
                    ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Semanas × Meta
              </button>
              <button
                type="button"
                onClick={() => setViewMode('current-week')}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'current-week'
                    ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Semana Atual (Seg–Dom)
              </button>
            </div>

            {viewMode === 'weeks' && (
              <div className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-0.5">
                {([6, 12, 16] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWeeksCount(n)}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono-num font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      weeksCount === n
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {n}s
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={openGoalEditor}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>{editingGoal ? 'Fechar meta' : `Meta: ${formatHoursDecimal(weeklyGoalHours)}`}</span>
            </button>
          </div>
        }
      >
        {/* Inline Weekly Goal Editor */}
        {editingGoal && (
          <form
            onSubmit={handleGoalSubmit}
            className="mb-4 pb-4 border-b border-[var(--line)] flex flex-wrap items-end justify-between gap-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor="weekly-hours-goal-input"
                  className="block text-[11.5px] font-semibold text-[var(--muted)] mb-1"
                >
                  Meta semanal de horas líquidas (h)
                </label>
                <input
                  id="weekly-hours-goal-input"
                  type="number"
                  step="0.5"
                  min="1"
                  max="112"
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  className="w-32 h-9 px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] font-mono-num text-[13px] font-bold"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[var(--muted)] mr-1">Atalhos:</span>
                {GOAL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGoalDraft(String(preset))}
                    className={`h-8 px-2.5 rounded-md border text-[11.5px] font-mono-num font-semibold transition-colors cursor-pointer ${
                      Number(goalDraft) === preset
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {preset}h
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-bold border-0 cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                Salvar meta semanal
              </button>
            </div>
          </form>
        )}

        {/* Single-elevation 4-column KPI strip with subtle hairline dividers (zero pill clutter) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-4 mb-4 border-b border-[var(--line)]">
          <div className="min-w-0">
            <div className="text-[11.5px] font-medium text-[var(--muted)]">
              Horas líquidas · Semana atual
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <strong className="font-mono-num text-[22px] font-extrabold text-[var(--text)] leading-none">
                {formatHoursDecimal(kpis.currentHours)}
              </strong>
              <span className="font-mono-num text-[12px] text-[var(--muted)]">
                {formatClock(kpis.currentSeconds)}
              </span>
            </div>
            <div className="mt-1 text-[11.5px] text-[var(--muted)] tabular-nums">
              {kpis.activeDaysThisWeek} de 7 dias ativos
            </div>
          </div>

          <div className="min-w-0 lg:border-l lg:border-[var(--line)] lg:pl-4">
            <div className="text-[11.5px] font-medium text-[var(--muted)]">
              Cumprimento da meta ({formatHoursDecimal(weeklyGoalHours)})
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <strong
                className="font-mono-num text-[22px] font-extrabold leading-none"
                style={{ color: statusInfo.color }}
              >
                {kpis.currentPct}%
              </strong>
              <span className="text-[11.5px] font-semibold" style={{ color: statusInfo.color }}>
                {statusInfo.label}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--panel-raised)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, kpis.currentPct)}%`,
                  backgroundColor: statusInfo.color,
                }}
              />
            </div>
          </div>

          <div className="min-w-0 lg:border-l lg:border-[var(--line)] lg:pl-4">
            <div className="text-[11.5px] font-medium text-[var(--muted)]">
              {kpis.surplusHours > 0 ? 'Saldo acima da meta' : 'Faltante & ritmo necessário'}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <strong className="font-mono-num text-[22px] font-extrabold text-[var(--text)] leading-none">
                {kpis.surplusHours > 0
                  ? `+${formatHoursDecimal(kpis.surplusHours)}`
                  : formatHoursDecimal(kpis.remainingHours)}
              </strong>
              <span className="text-[11.5px] text-[var(--muted)] font-mono-num">
                {kpis.surplusHours > 0
                  ? 'bônus semanal'
                  : `~${formatHoursDecimal(kpis.neededDailyPace)}/dia`}
              </span>
            </div>
            <div className="mt-1 text-[11.5px] text-[var(--muted)] tabular-nums">
              Projeção atual: <strong className="font-mono-num text-[var(--text)]">{formatHoursDecimal(kpis.projectedWeekHours)}</strong>
            </div>
          </div>

          <div className="min-w-0 lg:border-l lg:border-[var(--line)] lg:pl-4">
            <div className="text-[11.5px] font-medium text-[var(--muted)]">
              Consistência ({kpis.totalWeeks} semanas)
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <strong className="font-mono-num text-[22px] font-extrabold text-[var(--text)] leading-none">
                {kpis.metGoalCount}/{kpis.totalWeeks}
              </strong>
              <span className="text-[11.5px] text-[var(--muted)]">
                na meta
              </span>
            </div>
            <div className="mt-1 text-[11.5px] text-[var(--muted)] tabular-nums">
              Média ativa: <strong className="font-mono-num text-[var(--text)]">{formatHoursDecimal(kpis.avgActiveHours)}</strong>
              {kpis.goalStreak > 0 ? ` · ${kpis.goalStreak} sem. seguidas` : ''}
            </div>
          </div>
        </div>

        {/* Chart Area */}
        <div ref={chartContainerRef} className="relative w-full">
          {!hasAnyStudyData ? (
            <div className="py-10 px-4 text-center border border-dashed border-[var(--line-strong)] rounded-lg bg-[var(--panel-soft)]">
              <Target className="w-7 h-7 text-[var(--accent)] mx-auto mb-2" aria-hidden="true" />
              <div className="text-[13.5px] font-bold text-[var(--text)]">
                Ainda não há horas líquidas registradas no período
              </div>
              <p className="text-[12px] text-[var(--muted)] mt-1 max-w-md mx-auto">
                Inicie o Ponto Eletrônico durante seus estudos ou conclua metas no Cronograma para acompanhar suas horas líquidas frente à meta semanal de{' '}
                <strong className="font-mono-num text-[var(--text)]">{formatHoursDecimal(weeklyGoalHours)}</strong>.
              </p>
              {onNavigate && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('Cronograma')}
                    className="px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white text-[12px] font-bold border-0 cursor-pointer hover:bg-[var(--accent-hover)]"
                  >
                    Abrir Cronograma
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('Treino Diário')}
                    className="px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[12px] font-semibold cursor-pointer hover:border-[var(--accent)]"
                  >
                    Iniciar Treino Diário
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'weeks' ? (
            <>
              {/* Quiet Legend */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)] mb-2">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[2px] bg-[#16a34a]" />
                    Meta atingida (≥100%)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[2px] bg-[#2563eb]" />
                    70%–99% da meta
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[2px] bg-[#d97706]" />
                    &lt;70% da meta
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t-2 border-dashed border-[var(--accent)]" />
                    Meta semanal ({formatHoursDecimal(weeklyGoalHours)})
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-[var(--text)] opacity-75" />
                    Média móvel (4 sem.)
                  </span>
                </div>
                <span className="font-mono-num">Passe o cursor sobre a semana para detalhar</span>
              </div>

              <svg
                width={containerWidth}
                height={chartHeight}
                role="img"
                aria-label="Gráfico D3 de progresso semanal comparando horas líquidas de estudo com a meta semanal estabelecida"
                className="block overflow-visible select-none"
                onMouseLeave={() => setHoveredWeekIdx(null)}
              >
                <g transform={`translate(${margin.left},${margin.top})`}>
                  {/* Horizontal Gridlines & Y Axis */}
                  {weeklyD3.yTicks.map((tick) => {
                    const yPos = weeklyD3.yScale(tick);
                    return (
                      <g key={tick}>
                        <line
                          x1={0}
                          x2={innerW}
                          y1={yPos}
                          y2={yPos}
                          stroke="var(--line)"
                          strokeOpacity={0.75}
                          strokeDasharray={tick === 0 ? undefined : '2,3'}
                        />
                        <text
                          x={-8}
                          y={yPos}
                          dy="0.35em"
                          textAnchor="end"
                          fill="var(--muted)"
                          fontSize={10.5}
                          className="font-mono-num"
                        >
                          {tick}h
                        </text>
                      </g>
                    );
                  })}

                  {/* Bars */}
                  {weeks.map((wk, idx) => {
                    const xPos = weeklyD3.xScale(idx) ?? 0;
                    const bw = weeklyD3.xScale.bandwidth();
                    const barTop = weeklyD3.yScale(wk.netHours);
                    const barH = Math.max(0, innerH - barTop);
                    const isHovered = hoveredWeekIdx === idx;

                    const fill =
                      wk.netHours === 0
                        ? 'var(--line-strong)'
                        : wk.metGoal
                          ? '#16a34a'
                          : wk.pctOfGoal >= 70
                            ? '#2563eb'
                            : '#d97706';

                    return (
                      <g
                        key={wk.iso}
                        onMouseEnter={() => setHoveredWeekIdx(idx)}
                        className="cursor-pointer"
                      >
                        {/* Invisible full-column hover target */}
                        <rect
                          x={xPos - 4}
                          y={0}
                          width={bw + 8}
                          height={innerH}
                          fill={isHovered ? 'var(--accent-soft)' : 'transparent'}
                          rx={4}
                        />

                        {/* Target ghost outline behind each bar up to goal height */}
                        <rect
                          x={xPos}
                          y={weeklyD3.goalY}
                          width={bw}
                          height={Math.max(0, innerH - weeklyD3.goalY)}
                          fill="var(--panel-soft)"
                          stroke="var(--line)"
                          strokeOpacity={0.6}
                          rx={3}
                        />

                        {/* Actual Net Study Hours Bar */}
                        {barH > 0 && (
                          <rect
                            x={xPos}
                            y={barTop}
                            width={bw}
                            height={barH}
                            fill={fill}
                            fillOpacity={isHovered ? 1 : wk.isCurrentWeek ? 0.96 : 0.85}
                            stroke={wk.isCurrentWeek ? 'var(--text)' : 'none'}
                            strokeWidth={wk.isCurrentWeek ? 1.5 : 0}
                            rx={3}
                          />
                        )}

                        {/* Compact hour value label above bar when space permits */}
                        {wk.netHours > 0 && bw >= 24 && (
                          <text
                            x={xPos + bw / 2}
                            y={Math.max(10, barTop - 5)}
                            textAnchor="middle"
                            fill={wk.metGoal ? '#16a34a' : 'var(--muted)'}
                            fontSize={9.5}
                            fontWeight={wk.isCurrentWeek || wk.metGoal ? 700 : 500}
                            className="font-mono-num"
                          >
                            {formatHoursDecimal(wk.netHours)}
                          </text>
                        )}

                        {/* X-axis label */}
                        <text
                          x={xPos + bw / 2}
                          y={innerH + 16}
                          textAnchor="middle"
                          fill={wk.isCurrentWeek ? 'var(--accent)' : 'var(--muted)'}
                          fontSize={10}
                          fontWeight={wk.isCurrentWeek ? 700 : 500}
                          className="font-mono-num"
                        >
                          {wk.isCurrentWeek ? 'Atual' : wk.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* 4-Week Rolling Average Trend Line */}
                  {weeklyD3.trendPath && (
                    <path
                      d={weeklyD3.trendPath}
                      fill="none"
                      stroke="var(--text)"
                      strokeWidth={1.75}
                      strokeOpacity={0.72}
                      pointerEvents="none"
                    />
                  )}

                  {/* Dashed Weekly Goal Reference Line */}
                  <g pointerEvents="none">
                    <line
                      x1={0}
                      x2={innerW}
                      y1={weeklyD3.goalY}
                      y2={weeklyD3.goalY}
                      stroke="var(--accent)"
                      strokeWidth={1.8}
                      strokeDasharray="6,4"
                    />
                    <rect
                      x={innerW - 96}
                      y={Math.max(0, weeklyD3.goalY - 19)}
                      width={96}
                      height={16}
                      rx={3}
                      fill="var(--accent)"
                    />
                    <text
                      x={innerW - 48}
                      y={Math.max(0, weeklyD3.goalY - 19) + 11.5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={9.5}
                      fontWeight={700}
                      className="font-mono-num"
                    >
                      Meta {formatHoursDecimal(weeklyGoalHours)}
                    </text>
                  </g>
                </g>
              </svg>

              {/* Floating Hover Tooltip (Weekly) */}
              {hoveredWeek && (
                <div
                  className="pointer-events-none absolute top-7 z-20 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2.5 text-[11.5px] shadow-md min-w-[220px]"
                  style={{
                    left:
                      hoveredWeekX + margin.left > containerWidth * 0.56
                        ? Math.max(8, hoveredWeekX + margin.left - 236)
                        : Math.min(containerWidth - 230, hoveredWeekX + margin.left + 14),
                  }}
                >
                  <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-[var(--line)]">
                    <strong className="font-mono-num text-[var(--text)]">
                      {hoveredWeek.isCurrentWeek ? 'Semana Atual · ' : 'Semana '}
                      {hoveredWeek.range}
                    </strong>
                  </div>
                  <div className="space-y-1 font-mono-num">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-sans text-[var(--muted)]">Horas líquidas</span>
                      <strong className="text-[var(--text)]">
                        {formatClock(hoveredWeek.netSeconds)} ({formatHoursDecimal(hoveredWeek.netHours)})
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-sans text-[var(--muted)]">Meta semanal</span>
                      <span className="text-[var(--text)]">
                        {formatHoursDecimal(weeklyGoalHours)} · <strong>{hoveredWeek.pctOfGoal}%</strong>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-sans text-[var(--muted)]">Saldo vs. meta</span>
                      <strong
                        style={{
                          color: hoveredWeek.deltaHours >= 0 ? 'var(--good)' : 'var(--warning)',
                        }}
                      >
                        {hoveredWeek.deltaHours >= 0 ? '+' : ''}
                        {formatHoursDecimal(hoveredWeek.deltaHours)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[10.5px] text-[var(--muted)] pt-0.5">
                      <span className="font-sans">Atividade</span>
                      <span>
                        {hoveredWeek.activeDays} dia(s) · {hoveredWeek.sessions} sessão(ões)
                      </span>
                    </div>
                  </div>
                  {hoveredWeek.topSubjects.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-[var(--line)] space-y-0.5 text-[10.5px]">
                      {hoveredWeek.topSubjects.slice(0, 3).map((s) => (
                        <div key={s.subject} className="flex items-center justify-between gap-2">
                          <span className="truncate text-[var(--muted)] max-w-[140px]">
                            {visibleName(s.subject)}
                          </span>
                          <span className="font-mono-num font-semibold text-[var(--text)]">
                            {formatClock(s.seconds)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Quiet Legend for Current Week Daily Pace */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)] mb-2">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[2px] bg-[var(--accent)] opacity-35" />
                    Horas líquidas do dia
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-[#16a34a]" />
                    Acumulado real da semana
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t-2 border-dashed border-[var(--muted)]" />
                    Ritmo ideal até domingo ({formatHoursDecimal(weeklyGoalHours)})
                  </span>
                </div>
                <span className="font-mono-num">
                  Ritmo diário ideal: {formatHoursDecimal(weeklyGoalHours / 7)}/dia
                </span>
              </div>

              <svg
                width={containerWidth}
                height={chartHeight}
                role="img"
                aria-label="Gráfico D3 do ritmo diário da semana atual comparando acumulado real com a meta semanal"
                className="block overflow-visible select-none"
                onMouseLeave={() => setHoveredDayIdx(null)}
              >
                <defs>
                  <linearGradient id="weeklyGoalCumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <g transform={`translate(${margin.left},${margin.top})`}>
                  {currentWeekD3.yTicks.map((tick) => {
                    const yPos = currentWeekD3.yScale(tick);
                    return (
                      <g key={tick}>
                        <line
                          x1={0}
                          x2={innerW}
                          y1={yPos}
                          y2={yPos}
                          stroke="var(--line)"
                          strokeOpacity={0.75}
                          strokeDasharray={tick === 0 ? undefined : '2,3'}
                        />
                        <text
                          x={-8}
                          y={yPos}
                          dy="0.35em"
                          textAnchor="end"
                          fill="var(--muted)"
                          fontSize={10.5}
                          className="font-mono-num"
                        >
                          {tick}h
                        </text>
                      </g>
                    );
                  })}

                  {/* Cumulative Actual Area */}
                  {currentWeekD3.actualAreaPath && (
                    <path
                      d={currentWeekD3.actualAreaPath}
                      fill="url(#weeklyGoalCumFill)"
                      pointerEvents="none"
                    />
                  )}

                  {/* Daily Net Hours Columns */}
                  {currentWeekDays.map((pt) => {
                    const xPos = currentWeekD3.xScale(pt.idx) ?? 0;
                    const bw = currentWeekD3.xScale.bandwidth();
                    const dayTop = currentWeekD3.yScale(pt.dayHours);
                    const dayH = Math.max(0, innerH - dayTop);
                    const isHovered = hoveredDayIdx === pt.idx;

                    return (
                      <g
                        key={pt.iso}
                        onMouseEnter={() => setHoveredDayIdx(pt.idx)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={xPos - 6}
                          y={0}
                          width={bw + 12}
                          height={innerH}
                          fill={isHovered ? 'var(--accent-soft)' : 'transparent'}
                          rx={4}
                        />
                        {dayH > 0 && (
                          <rect
                            x={xPos}
                            y={dayTop}
                            width={bw}
                            height={dayH}
                            fill="var(--accent)"
                            fillOpacity={isHovered ? 0.52 : 0.28}
                            rx={3}
                          />
                        )}
                        <text
                          x={xPos + bw / 2}
                          y={innerH + 14}
                          textAnchor="middle"
                          fill={pt.isToday ? 'var(--accent)' : 'var(--muted)'}
                          fontSize={10.5}
                          fontWeight={pt.isToday ? 700 : 500}
                        >
                          {pt.shortLabel}
                        </text>
                        <text
                          x={xPos + bw / 2}
                          y={innerH + 26}
                          textAnchor="middle"
                          fill="var(--subtle)"
                          fontSize={9}
                          className="font-mono-num"
                        >
                          {pt.dateLabel}
                        </text>
                      </g>
                    );
                  })}

                  {/* Ideal Linear Pace Line */}
                  {currentWeekD3.idealLinePath && (
                    <path
                      d={currentWeekD3.idealLinePath}
                      fill="none"
                      stroke="var(--muted)"
                      strokeWidth={1.6}
                      strokeDasharray="5,4"
                      pointerEvents="none"
                    />
                  )}

                  {/* Goal Horizontal Reference Line */}
                  <line
                    x1={0}
                    x2={innerW}
                    y1={currentWeekD3.goalY}
                    y2={currentWeekD3.goalY}
                    stroke="var(--accent)"
                    strokeWidth={1.4}
                    strokeDasharray="3,3"
                    pointerEvents="none"
                  />

                  {/* Actual Cumulative Line & Points */}
                  {currentWeekD3.actualLinePath && (
                    <path
                      d={currentWeekD3.actualLinePath}
                      fill="none"
                      stroke="#16a34a"
                      strokeWidth={2.4}
                      pointerEvents="none"
                    />
                  )}
                  {currentWeekD3.elapsedPoints.map((pt) => {
                    const cx =
                      (currentWeekD3.xScale(pt.idx) ?? 0) + currentWeekD3.xScale.bandwidth() / 2;
                    const cy = currentWeekD3.yScale(pt.cumHours);
                    return (
                      <circle
                        key={`pt-${pt.iso}`}
                        cx={cx}
                        cy={cy}
                        r={pt.isToday || hoveredDayIdx === pt.idx ? 5 : 3.5}
                        fill="#16a34a"
                        stroke="var(--panel)"
                        strokeWidth={1.8}
                        pointerEvents="none"
                      />
                    );
                  })}
                </g>
              </svg>

              {/* Floating Hover Tooltip (Current Week Day) */}
              {hoveredDay && (
                <div
                  className="pointer-events-none absolute top-7 z-20 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 text-[11.5px] shadow-md min-w-[205px]"
                  style={{
                    left:
                      hoveredDayX + margin.left > containerWidth * 0.56
                        ? Math.max(8, hoveredDayX + margin.left - 220)
                        : Math.min(containerWidth - 215, hoveredDayX + margin.left + 14),
                  }}
                >
                  <div className="font-bold text-[var(--text)] pb-1 mb-1 border-b border-[var(--line)]">
                    {hoveredDay.fullLabel} · <span className="font-mono-num">{hoveredDay.dateLabel}</span>
                    {hoveredDay.isToday ? ' (Hoje)' : ''}
                  </div>
                  <div className="space-y-1 font-mono-num">
                    <div className="flex justify-between gap-3">
                      <span className="font-sans text-[var(--muted)]">Estudo no dia</span>
                      <strong className="text-[var(--text)]">{formatClock(hoveredDay.daySeconds)}</strong>
                    </div>
                    {!hoveredDay.isFuture && (
                      <div className="flex justify-between gap-3">
                        <span className="font-sans text-[var(--muted)]">Acumulado real</span>
                        <strong className="text-[#16a34a]">{formatHoursDecimal(hoveredDay.cumHours)}</strong>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <span className="font-sans text-[var(--muted)]">Ritmo ideal</span>
                      <span className="text-[var(--muted)]">{formatHoursDecimal(hoveredDay.idealCumHours)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Current Week Top Subjects Breakdown (clean hairline list, no nested cards) */}
        {currentWeekSubjects.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-[var(--line)]">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-[var(--muted)] mb-2.5">
              <span>Distribuição das horas líquidas nesta semana por matéria</span>
              <span className="font-mono-num">{formatClock(kpis.currentSeconds)} total</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
              {currentWeekSubjects.map((row) => {
                const barPct =
                  row.targetHours > 0
                    ? Math.min(100, Math.round((row.hours / row.targetHours) * 100))
                    : row.sharePct;
                return (
                  <div key={row.subject} className="min-w-0">
                    <div className="flex items-center justify-between gap-2 text-[11.5px] mb-1">
                      <span className="truncate font-semibold text-[var(--text)]">
                        {row.displayName}
                      </span>
                      <span className="font-mono-num text-[var(--muted)] shrink-0">
                        <strong className="text-[var(--text)]">{formatHoursDecimal(row.hours)}</strong>
                        {row.targetHours > 0
                          ? ` / ${formatHoursDecimal(row.targetHours)}`
                          : ` · ${row.sharePct}%`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--panel-raised)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(4, barPct)}%`,
                          backgroundColor:
                            row.targetHours > 0 && row.hours >= row.targetHours
                              ? 'var(--good)'
                              : 'var(--accent)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>
    );
  },
);
