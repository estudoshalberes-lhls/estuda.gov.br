import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Clock, Plus, Trash2, X } from 'lucide-react';
import { StudyDatabase, StudySessionInterval, StudySessionIntervalSource } from '../../types/study';
import {
  formatClock,
  inferFixedSubjectFromTopic,
  localDateIso,
  visibleName,
} from '../../lib/parsers';
import { useStudyTimer } from '../../lib/timerTickStore';
import { Panel } from '../ui/PageHeader';
import { formatIsoFullBr, formatIsoShortBr, useContainerWidth } from './d3Utils';

type TimelineViewMode = 'timeline' | 'heatmap' | 'log';
type TimelineWindowDays = 7 | 14 | 30;

const SHORT_WEEKDAYS_SUN_FIRST = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
const WEEKDAYS_MON_FIRST = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
const FULL_WEEKDAYS_MON_FIRST = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
] as const;

const SUBJECT_PALETTE = [
  '#2563eb', // Blue
  '#0d9488', // Teal
  '#d97706', // Amber
  '#7c3aed', // Violet
  '#db2777', // Pink
  '#059669', // Emerald
  '#ea580c', // Orange
  '#0284c7', // Sky
] as const;

const SOURCE_LABELS: Record<StudySessionIntervalSource | 'live', string> = {
  timer: 'Cronômetro',
  pomodoro: 'Pomodoro',
  quiz: 'Treino Diário',
  simulation: 'Simulado',
  manual: 'Lançamento Manual',
  live: 'Ao vivo agora',
};

const SHIFTS = [
  { key: 'madrugada', label: 'Madrugada', range: '00h–06h', startHour: 0, endHour: 6 },
  { key: 'manha', label: 'Manhã', range: '06h–12h', startHour: 6, endHour: 12 },
  { key: 'tarde', label: 'Tarde', range: '12h–18h', startHour: 12, endHour: 18 },
  { key: 'noite', label: 'Noite', range: '18h–24h', startHour: 18, endHour: 24 },
] as const;

interface ParsedIntervalBlock {
  id: string;
  date: string;
  startMs: number;
  endMs: number;
  startHour: number; // 0..24 decimal
  endHour: number; // 0..24 decimal
  startClock: string; // HH:MM
  endClock: string; // HH:MM
  durationSeconds: number;
  subject: string;
  topicLabel?: string;
  source: StudySessionIntervalSource | 'live';
  isLive?: boolean;
}

interface StudyScheduleTimelineD3DashboardProps {
  db: StudyDatabase;
  fixedSubjects: string[];
  subjectFilter?: string;
  activeTimerSubject?: string;
  activeTimerTopicLabel?: string;
  onAddManualInterval: (payload: {
    date: string;
    startTime: string;
    endTime: string;
    subject?: string;
    topicLabel?: string;
  }) => boolean;
  onDeleteInterval: (intervalId: string) => void;
}

function formatHm(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDurationCompact(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}min`;
  return `${s}s`;
}

function hourDecimalInLocalDay(ms: number, dayStartMs: number): number {
  const raw = (ms - dayStartMs) / 3_600_000;
  return Math.max(0, Math.min(24, raw));
}

function parseLocalDayStartMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function getMondayBasedWeekdayIdx(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7; // 0=Mon..6=Sun
}

function getSubjectColor(subject: string, orderedSubjects: string[]): string {
  const idx = orderedSubjects.indexOf(subject);
  if (idx >= 0) return SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = (hash * 31 + subject.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length];
}

export const StudyScheduleTimelineD3Dashboard: React.FC<StudyScheduleTimelineD3DashboardProps> =
  React.memo(
    ({
      db,
      fixedSubjects,
      subjectFilter = 'Todas',
      activeTimerSubject,
      activeTimerTopicLabel,
      onAddManualInterval,
      onDeleteInterval,
    }) => {
      const { timerRunning, timerStartedAt, nowTick, pomodoroMode, pomodoroPhase } =
        useStudyTimer();

      const [viewMode, setViewMode] = useState<TimelineViewMode>('timeline');
      const [windowDays, setWindowDays] = useState<TimelineWindowDays>(7);
      const [hoveredBlock, setHoveredBlock] = useState<ParsedIntervalBlock | null>(null);
      const [hoveredHeatCell, setHoveredHeatCell] = useState<{
        dayIdx: number;
        hour: number;
        seconds: number;
        sessions: number;
      } | null>(null);

      // Manual entry form state
      const [showManualForm, setShowManualForm] = useState(false);
      const [manualDate, setManualDate] = useState(() => localDateIso());
      const [manualStart, setManualStart] = useState('10:00');
      const [manualEnd, setManualEnd] = useState('11:00');
      const [manualSubject, setManualSubject] = useState(
        () => activeTimerSubject || fixedSubjects[0] || 'Estudo Geral',
      );
      const [manualTopicLabel, setManualTopicLabel] = useState('');

      const chartContainerRef = useRef<HTMLDivElement | null>(null);
      const containerWidth = useContainerWidth(chartContainerRef, 720);

      const resolveSubject = useMemo(
        () => (raw?: string) => {
          const clean = (raw || 'Estudo Geral').trim();
          return inferFixedSubjectFromTopic({ materia: clean }, fixedSubjects) || clean;
        },
        [fixedSubjects],
      );

      // Normalize all stored intervals + active live timer span (if running in focus/continuous mode)
      const { allBlocks, orderedSubjects } = useMemo(() => {
        const stored: StudySessionInterval[] = db.studySessionIntervals || [];
        const parsed: ParsedIntervalBlock[] = [];
        const subjectSeconds = new Map<string, number>();

        for (const item of stored) {
          if (item.pomodoroPhase === 'break') continue;
          const startMs = Date.parse(item.startedAt);
          const endMs = Date.parse(item.endedAt);
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
          const subj = resolveSubject(item.subject);
          if (subjectFilter !== 'Todas' && subj !== subjectFilter) continue;

          const startDateObj = new Date(startMs);
          const endDateObj = new Date(endMs);
          const dateIso =
            item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
              ? item.date
              : localDateIso(startDateObj);
          const dayStartMs = parseLocalDayStartMs(dateIso);
          const startHour = hourDecimalInLocalDay(startMs, dayStartMs);
          const endHourRaw = hourDecimalInLocalDay(endMs, dayStartMs);
          const endHour = endHourRaw > startHour ? endHourRaw : Math.min(24, startHour + 0.05);
          const dur = Math.max(1, Number(item.durationSeconds) || Math.round((endMs - startMs) / 1000));

          subjectSeconds.set(subj, (subjectSeconds.get(subj) || 0) + dur);
          parsed.push({
            id: item.id,
            date: dateIso,
            startMs,
            endMs,
            startHour,
            endHour,
            startClock: formatHm(startDateObj),
            endClock: endHour >= 23.99 && endDateObj.getHours() === 0 && endDateObj.getMinutes() === 0
              ? '24:00'
              : formatHm(endDateObj),
            durationSeconds: dur,
            subject: subj,
            topicLabel: item.topicLabel,
            source: item.source || 'timer',
          });
        }

        // Add live running timer block on today's row so user sees real-time tracking immediately
        const isLiveFocus =
          timerRunning &&
          timerStartedAt > 0 &&
          (pomodoroMode === 'continuous' || pomodoroPhase === 'focus');
        if (isLiveFocus) {
          const liveNow = Math.max(nowTick, timerStartedAt + 1000);
          const liveDateObj = new Date(timerStartedAt);
          const liveDateIso = localDateIso(liveDateObj);
          const dayStartMs = parseLocalDayStartMs(liveDateIso);
          const liveSubject = resolveSubject(activeTimerSubject || 'Estudo Geral');
          if (subjectFilter === 'Todas' || liveSubject === subjectFilter) {
            const dur = Math.max(1, Math.round((liveNow - timerStartedAt) / 1000));
            subjectSeconds.set(liveSubject, (subjectSeconds.get(liveSubject) || 0) + dur);
            parsed.push({
              id: '__live-timer__',
              date: liveDateIso,
              startMs: timerStartedAt,
              endMs: liveNow,
              startHour: hourDecimalInLocalDay(timerStartedAt, dayStartMs),
              endHour: hourDecimalInLocalDay(liveNow, dayStartMs),
              startClock: formatHm(liveDateObj),
              endClock: formatHm(new Date(liveNow)),
              durationSeconds: dur,
              subject: liveSubject,
              topicLabel: activeTimerTopicLabel,
              source: 'live',
              isLive: true,
            });
          }
        }

        parsed.sort((a, b) => b.startMs - a.startMs);
        const orderedSubjs = Array.from(subjectSeconds.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([s]) => s);

        return { allBlocks: parsed, orderedSubjects: orderedSubjs };
      }, [
        activeTimerSubject,
        activeTimerTopicLabel,
        db.studySessionIntervals,
        nowTick,
        pomodoroMode,
        pomodoroPhase,
        resolveSubject,
        subjectFilter,
        timerRunning,
        timerStartedAt,
      ]);

      // Build day rows for Timeline view + aggregate stats for selected window
      const {
        timelineDays,
        windowBlocks,
        shiftSummary,
        heatmapGrid,
        maxHeatCellSeconds,
        kpis,
      } = useMemo(() => {
        const now = new Date();
        const todayIso = localDateIso(now);
        const dayRows: Array<{
          iso: string;
          label: string;
          weekdayShort: string;
          isToday: boolean;
          totalSeconds: number;
          blocks: ParsedIntervalBlock[];
        }> = [];
        const dayMap = new Map<string, (typeof dayRows)[number]>();

        for (let i = 0; i < windowDays; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
          const iso = localDateIso(d);
          const wd = SHORT_WEEKDAYS_SUN_FIRST[d.getDay()];
          const row = {
            iso,
            label: `${wd} ${formatIsoShortBr(iso)}`,
            weekdayShort: wd,
            isToday: iso === todayIso,
            totalSeconds: 0,
            blocks: [] as ParsedIntervalBlock[],
          };
          dayRows.push(row);
          dayMap.set(iso, row);
        }

        const cutoffDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - (windowDays - 1),
        );
        const cutoffIso = localDateIso(cutoffDate);

        const inWindow = allBlocks.filter((b) => b.date >= cutoffIso);
        for (const block of inWindow) {
          const row = dayMap.get(block.date);
          if (row) {
            row.blocks.push(block);
            row.totalSeconds += block.durationSeconds;
          }
        }

        // Shift breakdown + 7x24 heatmap across inWindow blocks
        const shiftTotals = [0, 0, 0, 0];
        const hourTotals = new Array<number>(24).fill(0);
        const heatCells: Array<{
          dayIdx: number;
          hour: number;
          seconds: number;
          sessions: number;
        }> = [];
        for (let dIdx = 0; dIdx < 7; dIdx++) {
          for (let h = 0; h < 24; h++) {
            heatCells.push({ dayIdx: dIdx, hour: h, seconds: 0, sessions: 0 });
          }
        }

        for (const block of inWindow) {
          const monIdx = getMondayBasedWeekdayIdx(block.date);
          const startH = Math.floor(block.startHour);
          const endH = Math.min(23, Math.floor(Math.max(block.startHour, block.endHour - 0.0001)));

          for (let h = startH; h <= endH; h++) {
            const overlapStart = Math.max(block.startHour, h);
            const overlapEnd = Math.min(block.endHour, h + 1);
            const secInHour = Math.max(0, Math.round((overlapEnd - overlapStart) * 3600));
            if (secInHour <= 0) continue;

            hourTotals[h] += secInHour;
            const cell = heatCells[monIdx * 24 + h];
            if (cell) {
              cell.seconds += secInHour;
              cell.sessions += 1;
            }

            const shiftIdx = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3;
            shiftTotals[shiftIdx] += secInHour;
          }
        }

        const totalWindowSec = d3.sum(inWindow, (b) => b.durationSeconds);
        const shiftData = SHIFTS.map((s, idx) => ({
          ...s,
          seconds: shiftTotals[idx],
          pct: totalWindowSec > 0 ? Math.round((shiftTotals[idx] / totalWindowSec) * 100) : 0,
        }));

        // Peak 1h / 2h window
        let bestHour = 0;
        let bestHourSec = 0;
        for (let h = 0; h < 24; h++) {
          if (hourTotals[h] > bestHourSec) {
            bestHourSec = hourTotals[h];
            bestHour = h;
          }
        }

        const dominantShift = [...shiftData].sort((a, b) => b.seconds - a.seconds)[0];
        const todayBlocks = inWindow.filter((b) => b.date === todayIso);
        const todaySec = d3.sum(todayBlocks, (b) => b.durationSeconds);
        const completedCount = inWindow.filter((b) => !b.isLive).length;
        const avgSessionSec =
          completedCount > 0
            ? Math.round(
                d3.sum(
                  inWindow.filter((b) => !b.isLive),
                  (b) => b.durationSeconds,
                ) / completedCount,
              )
            : 0;

        const maxCellSec = d3.max(heatCells, (c) => c.seconds) || 0;

        return {
          timelineDays: dayRows,
          windowBlocks: inWindow,
          shiftSummary: shiftData,
          heatmapGrid: heatCells,
          maxHeatCellSeconds: maxCellSec,
          kpis: {
            totalWindowSec,
            totalSessions: inWindow.length,
            avgSessionSec,
            bestHourLabel:
              bestHourSec > 0
                ? `${String(bestHour).padStart(2, '0')}h–${String((bestHour + 1) % 24).padStart(2, '0')}h`
                : '—',
            bestHourSec,
            dominantShiftLabel:
              dominantShift && dominantShift.seconds > 0
                ? `${dominantShift.label} (${dominantShift.pct}%)`
                : '—',
            dominantShiftRange:
              dominantShift && dominantShift.seconds > 0 ? dominantShift.range : 'Sem registros',
            todaySec,
            todayCount: todayBlocks.length,
          },
        };
      }, [allBlocks, windowDays]);

      // D3 Scales for Timeline View
      const timelineLayout = useMemo(() => {
        const margin = {
          top: 24,
          right: containerWidth < 520 ? 18 : 66,
          bottom: 28,
          left: containerWidth < 520 ? 64 : 84,
        };
        const rowHeight = windowDays <= 7 ? 36 : windowDays <= 14 ? 28 : 22;
        const innerW = Math.max(240, containerWidth - margin.left - margin.right);
        const innerH = Math.max(180, timelineDays.length * rowHeight);
        const svgH = innerH + margin.top + margin.bottom;

        const xScale = d3.scaleLinear().domain([0, 24]).range([0, innerW]);
        const yScale = d3
          .scaleBand<string>()
          .domain(timelineDays.map((d) => d.iso))
          .range([0, innerH])
          .paddingInner(0.28)
          .paddingOuter(0.14);

        const hourTicks = containerWidth < 520 ? [0, 6, 12, 18, 24] : [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

        return { margin, innerW, innerH, svgH, xScale, yScale, hourTicks };
      }, [containerWidth, timelineDays, windowDays]);

      // D3 Scales for Heatmap View (7 weekdays x 24 hours)
      const heatmapLayout = useMemo(() => {
        const margin = { top: 24, right: 16, bottom: 26, left: 42 };
        const innerW = Math.max(260, containerWidth - margin.left - margin.right);
        const cellH = 26;
        const innerH = 7 * cellH;
        const svgH = innerH + margin.top + margin.bottom;

        const xScale = d3
          .scaleBand<number>()
          .domain(d3.range(24))
          .range([0, innerW])
          .padding(0.08);
        const yScale = d3
          .scaleBand<number>()
          .domain(d3.range(7))
          .range([0, innerH])
          .padding(0.12);

        return { margin, innerW, innerH, svgH, xScale, yScale };
      }, [containerWidth]);

      const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const ok = onAddManualInterval({
          date: manualDate,
          startTime: manualStart,
          endTime: manualEnd,
          subject: manualSubject,
          topicLabel: manualTopicLabel,
        });
        if (ok) {
          setManualTopicLabel('');
          setShowManualForm(false);
        }
      };

      const subjectSelectOptions = useMemo(() => {
        const set = new Set<string>([...fixedSubjects, ...orderedSubjects, 'Estudo Geral']);
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      }, [fixedSubjects, orderedSubjects]);

      return (
        <Panel
          className="mb-4"
          title="Registro de Horários de Estudo · Linha do Tempo & Turnos"
          subtitle="Identificação automática das faixas horárias em que você iniciou e pausou o cronômetro (ex.: 10:00–11:00, 14:00–16:00)."
          stackHeader
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-0.5">
                {(
                  [
                    ['timeline', 'Linha do Tempo (00h–24h)'],
                    ['heatmap', 'Mapa por Hora'],
                    ['log', `Extrato (${windowBlocks.length})`],
                  ] as Array<[TimelineViewMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      viewMode === mode
                        ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-0.5">
                {([7, 14, 30] as TimelineWindowDays[]).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setWindowDays(days)}
                    className={`px-2 py-1 rounded-md text-[11.5px] font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      windowDays === days
                        ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowManualForm((v) => !v)}
                className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {showManualForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />}
                {showManualForm ? 'Fechar' : 'Lançar horário'}
              </button>
            </div>
          }
        >
          {/* Manual retroactive entry form */}
          {showManualForm && (
            <form
              onSubmit={handleManualSubmit}
              className="mb-4 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end"
            >
              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  Data
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="ce-input h-[34px] text-[12px]"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  Início
                </label>
                <input
                  type="time"
                  value={manualStart}
                  onChange={(e) => setManualStart(e.target.value)}
                  className="ce-input h-[34px] text-[12px] font-mono-num"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  Término
                </label>
                <input
                  type="time"
                  value={manualEnd}
                  onChange={(e) => setManualEnd(e.target.value)}
                  className="ce-input h-[34px] text-[12px] font-mono-num"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  Matéria
                </label>
                <select
                  value={manualSubject}
                  onChange={(e) => setManualSubject(e.target.value)}
                  className="ce-select h-[34px] text-[12px]"
                >
                  {subjectSelectOptions.map((s) => (
                    <option key={s} value={s}>
                      {visibleName(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  Assunto (opcional)
                </label>
                <input
                  type="text"
                  value={manualTopicLabel}
                  onChange={(e) => setManualTopicLabel(e.target.value)}
                  placeholder="Ex.: Controle Concentrado"
                  className="ce-input h-[34px] text-[12px]"
                />
              </div>
              <button
                type="submit"
                className="h-[34px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
              >
                Registrar faixa
              </button>
            </form>
          )}

          {/* 4-Column Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                Estudo Hoje (Horários)
              </div>
              <div className="font-mono-num text-[17px] font-extrabold text-[var(--text)] tabular-nums mt-0.5">
                {formatClock(kpis.todaySec)}
              </div>
              <div className="text-[11px] text-[var(--muted)] tabular-nums mt-0.5">
                {timerRunning && timerStartedAt > 0
                  ? `Ao vivo desde ${formatHm(new Date(timerStartedAt))}`
                  : `${kpis.todayCount} ${kpis.todayCount === 1 ? 'bloco hoje' : 'blocos hoje'}`}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                Horário de Pico ({windowDays}d)
              </div>
              <div className="font-mono-num text-[17px] font-extrabold text-[var(--accent)] tabular-nums mt-0.5">
                {kpis.bestHourLabel}
              </div>
              <div className="text-[11px] text-[var(--muted)] tabular-nums mt-0.5">
                {kpis.bestHourSec > 0
                  ? `${formatDurationCompact(kpis.bestHourSec)} acumulados nessa hora`
                  : 'Inicie o cronômetro para mapear'}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                Turno Predominante
              </div>
              <div className="text-[16px] font-extrabold text-[var(--text)] tabular-nums mt-0.5 truncate">
                {kpis.dominantShiftLabel}
              </div>
              <div className="text-[11px] text-[var(--muted)] tabular-nums mt-0.5">
                {kpis.dominantShiftRange}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2.5">
              <div className="text-[11px] font-semibold text-[var(--muted)]">
                Sessões no Período ({windowDays}d)
              </div>
              <div className="font-mono-num text-[17px] font-extrabold text-[var(--text)] tabular-nums mt-0.5">
                {kpis.totalSessions}
              </div>
              <div className="text-[11px] text-[var(--muted)] tabular-nums mt-0.5">
                {kpis.avgSessionSec > 0
                  ? `Duração média: ${formatDurationCompact(kpis.avgSessionSec)}`
                  : 'Nenhuma sessão concluída'}
              </div>
            </div>
          </div>

          {/* VIEW 1: D3 Timeline (00h–24h Gantt) */}
          {viewMode === 'timeline' && (
            <div ref={chartContainerRef} className="relative w-full">
              {windowBlocks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-10 px-4 text-center">
                  <Clock className="w-8 h-8 text-[var(--muted)]/70 mx-auto mb-2" />
                  <div className="text-[13.5px] font-bold text-[var(--text)]">
                    Nenhum horário registrado nos últimos {windowDays} dias
                  </div>
                  <p className="text-[12px] text-[var(--muted)] max-w-md mx-auto mt-1 mb-3">
                    Clique em <strong className="text-[var(--text)]">Iniciar</strong> no cronômetro
                    da barra superior quando começar a estudar e em{' '}
                    <strong className="text-[var(--text)]">Pausar</strong> ao terminar — cada
                    faixa horária (ex.: 10:00–11:00) aparecerá automaticamente aqui.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowManualForm(true)}
                    className="inline-flex items-center gap-1.5 h-[32px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Registrar horário manual
                  </button>
                </div>
              ) : (
                <>
                  <svg
                    width={containerWidth}
                    height={timelineLayout.svgH}
                    role="img"
                    aria-label="Linha do tempo dos horários de estudo de 00h às 24h"
                    className="block overflow-visible select-none"
                  >
                    <g
                      transform={`translate(${timelineLayout.margin.left},${timelineLayout.margin.top})`}
                    >
                      {/* Subtle Shift Bands (Madrugada, Manhã, Tarde, Noite) */}
                      {SHIFTS.map((shift, idx) => {
                        const x1 = timelineLayout.xScale(shift.startHour);
                        const x2 = timelineLayout.xScale(shift.endHour);
                        return (
                          <g key={shift.key}>
                            <rect
                              x={x1}
                              y={0}
                              width={Math.max(0, x2 - x1)}
                              height={timelineLayout.innerH}
                              fill={idx % 2 === 1 ? 'var(--panel-soft)' : 'transparent'}
                              opacity={0.55}
                            />
                            {containerWidth >= 520 && (
                              <text
                                x={(x1 + x2) / 2}
                                y={-10}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight={600}
                                fill="var(--muted)"
                              >
                                {shift.label}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Vertical Hour Gridlines + Bottom Axis */}
                      {timelineLayout.hourTicks.map((hour) => {
                        const x = timelineLayout.xScale(hour);
                        return (
                          <g key={hour}>
                            <line
                              x1={x}
                              x2={x}
                              y1={0}
                              y2={timelineLayout.innerH}
                              stroke="var(--line)"
                              strokeDasharray={hour % 6 === 0 ? undefined : '2,3'}
                              strokeOpacity={hour % 6 === 0 ? 0.9 : 0.5}
                            />
                            <text
                              x={x}
                              y={timelineLayout.innerH + 16}
                              textAnchor="middle"
                              fontSize={10.5}
                              fontFamily="var(--font-mono, monospace)"
                              fill="var(--muted)"
                            >
                              {String(hour).padStart(2, '0')}h
                            </text>
                          </g>
                        );
                      })}

                      {/* Day Rows + Time Interval Bars */}
                      {timelineDays.map((day) => {
                        const y = timelineLayout.yScale(day.iso) ?? 0;
                        const bandH = timelineLayout.yScale.bandwidth();
                        return (
                          <g key={day.iso}>
                            {/* Subtle row track */}
                            <rect
                              x={0}
                              y={y}
                              width={timelineLayout.innerW}
                              height={bandH}
                              rx={4}
                              fill="var(--panel-soft)"
                              fillOpacity={day.isToday ? 0.85 : 0.45}
                              stroke={day.isToday ? 'var(--accent)' : 'var(--line)'}
                              strokeOpacity={day.isToday ? 0.35 : 0.45}
                              strokeWidth={1}
                            />

                            {/* Y-axis day label */}
                            <text
                              x={-10}
                              y={y + bandH / 2}
                              dy="0.35em"
                              textAnchor="end"
                              fontSize={windowDays > 14 ? 10 : 11}
                              fontWeight={day.isToday ? 700 : 500}
                              fontFamily="var(--font-mono, monospace)"
                              fill={day.isToday ? 'var(--accent)' : 'var(--muted)'}
                            >
                              {day.label}
                            </text>

                            {/* Recorded intervals */}
                            {day.blocks.map((block) => {
                              const xStart = timelineLayout.xScale(block.startHour);
                              const xEnd = timelineLayout.xScale(block.endHour);
                              const barWidth = Math.max(4, xEnd - xStart);
                              const barColor = getSubjectColor(block.subject, orderedSubjects);
                              const isHovered = hoveredBlock?.id === block.id;
                              const showInlineText = barWidth >= 68 && bandH >= 18;

                              return (
                                <g
                                  key={block.id}
                                  onMouseEnter={() => setHoveredBlock(block)}
                                  onMouseLeave={() => setHoveredBlock(null)}
                                  className="cursor-pointer"
                                >
                                  <rect
                                    x={xStart}
                                    y={y + 2}
                                    width={barWidth}
                                    height={Math.max(8, bandH - 4)}
                                    rx={4}
                                    fill={barColor}
                                    fillOpacity={block.isLive ? 0.78 : isHovered ? 1 : 0.88}
                                    stroke={isHovered || block.isLive ? 'var(--text)' : barColor}
                                    strokeWidth={isHovered || block.isLive ? 1.5 : 0.5}
                                    strokeDasharray={block.isLive ? '4,2' : undefined}
                                  />
                                  {showInlineText && (
                                    <text
                                      x={xStart + 6}
                                      y={y + bandH / 2}
                                      dy="0.35em"
                                      fontSize={10}
                                      fontWeight={700}
                                      fill="#ffffff"
                                      style={{ pointerEvents: 'none' }}
                                    >
                                      {block.startClock}–{block.endClock}
                                    </text>
                                  )}
                                </g>
                              );
                            })}

                            {/* Right-aligned daily total */}
                            {timelineLayout.margin.right >= 50 && (
                              <text
                                x={timelineLayout.innerW + 8}
                                y={y + bandH / 2}
                                dy="0.35em"
                                textAnchor="start"
                                fontSize={10.5}
                                fontFamily="var(--font-mono, monospace)"
                                fontWeight={day.totalSeconds > 0 ? 700 : 400}
                                fill={day.totalSeconds > 0 ? 'var(--text)' : 'var(--muted)'}
                              >
                                {day.totalSeconds > 0 ? formatDurationCompact(day.totalSeconds) : '—'}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  </svg>

                  {/* Hover detail strip (no layout shift) */}
                  <div className="mt-2.5 min-h-[34px] rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                    {hoveredBlock ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{
                              backgroundColor: getSubjectColor(hoveredBlock.subject, orderedSubjects),
                            }}
                          />
                          <strong className="text-[var(--text)]">
                            {formatIsoFullBr(hoveredBlock.date)}
                          </strong>
                          <span className="font-mono-num font-bold text-[var(--accent)] tabular-nums">
                            {hoveredBlock.startClock} → {hoveredBlock.endClock}
                          </span>
                          <span className="text-[var(--muted)] tabular-nums">
                            ({formatDurationCompact(hoveredBlock.durationSeconds)})
                          </span>
                          <span aria-hidden="true" className="text-[var(--muted)]">
                            ·
                          </span>
                          <span className="font-semibold text-[var(--text)] truncate">
                            {visibleName(hoveredBlock.subject)}
                          </span>
                          {hoveredBlock.topicLabel && (
                            <span className="text-[var(--muted)] truncate">
                              ({hoveredBlock.topicLabel})
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--muted)] shrink-0">
                          {SOURCE_LABELS[hoveredBlock.source]}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--muted)]">
                        Passe o mouse sobre qualquer bloco colorido para ver o horário exato de
                        início, término, duração e matéria estudada.
                      </span>
                    )}
                  </div>

                  {/* Subject Legend */}
                  {orderedSubjects.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--muted)]">
                      {orderedSubjects.slice(0, 8).map((subj) => (
                        <span key={subj} className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: getSubjectColor(subj, orderedSubjects) }}
                          />
                          <span className="text-[var(--text)] font-medium">
                            {visibleName(subj)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* VIEW 2: D3 Weekday × Hour Heatmap + Shift Breakdown */}
          {viewMode === 'heatmap' && (
            <div ref={chartContainerRef} className="flex flex-col gap-3">
              <svg
                width={containerWidth}
                height={heatmapLayout.svgH}
                role="img"
                aria-label="Mapa de calor de horários de estudo por dia da semana e hora"
                className="block overflow-visible select-none"
              >
                <g transform={`translate(${heatmapLayout.margin.left},${heatmapLayout.margin.top})`}>
                  {/* Hour headers */}
                  {d3.range(24).map((h) => {
                    const showLabel = containerWidth >= 600 || h % 2 === 0;
                    if (!showLabel) return null;
                    const x = (heatmapLayout.xScale(h) ?? 0) + heatmapLayout.xScale.bandwidth() / 2;
                    return (
                      <text
                        key={h}
                        x={x}
                        y={-8}
                        textAnchor="middle"
                        fontSize={10}
                        fontFamily="var(--font-mono, monospace)"
                        fill="var(--muted)"
                      >
                        {String(h).padStart(2, '0')}
                      </text>
                    );
                  })}

                  {/* Weekday labels */}
                  {WEEKDAYS_MON_FIRST.map((wd, dIdx) => {
                    const y =
                      (heatmapLayout.yScale(dIdx) ?? 0) + heatmapLayout.yScale.bandwidth() / 2;
                    return (
                      <text
                        key={wd}
                        x={-8}
                        y={y}
                        dy="0.35em"
                        textAnchor="end"
                        fontSize={11}
                        fontWeight={600}
                        fill="var(--muted)"
                      >
                        {wd}
                      </text>
                    );
                  })}

                  {/* 7x24 Heat cells */}
                  {heatmapGrid.map((cell) => {
                    const x = heatmapLayout.xScale(cell.hour) ?? 0;
                    const y = heatmapLayout.yScale(cell.dayIdx) ?? 0;
                    const w = heatmapLayout.xScale.bandwidth();
                    const h = heatmapLayout.yScale.bandwidth();
                    const ratio =
                      maxHeatCellSeconds > 0 ? cell.seconds / maxHeatCellSeconds : 0;
                    const isHovered =
                      hoveredHeatCell?.dayIdx === cell.dayIdx &&
                      hoveredHeatCell?.hour === cell.hour;

                    return (
                      <rect
                        key={`${cell.dayIdx}-${cell.hour}`}
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        rx={3}
                        fill={cell.seconds > 0 ? 'var(--accent)' : 'var(--panel-soft)'}
                        fillOpacity={cell.seconds > 0 ? 0.18 + ratio * 0.82 : 0.85}
                        stroke={isHovered ? 'var(--text)' : 'var(--line)'}
                        strokeWidth={isHovered ? 1.5 : 0.6}
                        onMouseEnter={() => setHoveredHeatCell(cell)}
                        onMouseLeave={() => setHoveredHeatCell(null)}
                        className="cursor-pointer"
                      />
                    );
                  })}
                </g>
              </svg>

              {/* Hover status line */}
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 text-[12px] flex items-center justify-between gap-2">
                {hoveredHeatCell ? (
                  <span className="text-[var(--text)] tabular-nums">
                    <strong>{FULL_WEEKDAYS_MON_FIRST[hoveredHeatCell.dayIdx]}</strong> ·{' '}
                    <span className="font-mono-num text-[var(--accent)] font-bold">
                      {String(hoveredHeatCell.hour).padStart(2, '0')}h00–
                      {String((hoveredHeatCell.hour + 1) % 24).padStart(2, '0')}h00
                    </span>{' '}
                    ·{' '}
                    {hoveredHeatCell.seconds > 0
                      ? `${formatDurationCompact(hoveredHeatCell.seconds)} acumulados (${hoveredHeatCell.sessions} ${
                          hoveredHeatCell.sessions === 1 ? 'sessão' : 'sessões'
                        })`
                      : 'Sem estudo registrado nessa faixa'}
                  </span>
                ) : (
                  <span className="text-[var(--muted)]">
                    Passe o cursor sobre qualquer célula (Dia × Hora) para ver o total acumulado naquela faixa horária.
                  </span>
                )}
              </div>

              {/* 4-Shift Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {shiftSummary.map((shift) => (
                  <div
                    key={shift.key}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2.5"
                  >
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="font-bold text-[var(--text)]">{shift.label}</span>
                      <span className="font-mono-num text-[var(--muted)] tabular-nums">
                        {shift.range}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="font-mono-num text-[14px] font-extrabold text-[var(--accent)] tabular-nums">
                        {shift.seconds > 0 ? formatDurationCompact(shift.seconds) : '0min'}
                      </span>
                      <span className="font-mono-num text-[11.5px] font-semibold text-[var(--muted)] tabular-nums">
                        {shift.pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--panel)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${Math.min(100, shift.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 3: Chronological Time-Log Table ("Extrato de Ponto") */}
          {viewMode === 'log' && (
            <div className="overflow-x-auto">
              {windowBlocks.length === 0 ? (
                <div className="py-8 text-center text-[12.5px] text-[var(--muted)]">
                  Nenhum intervalo de horário registrado nos últimos {windowDays} dias.
                </div>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[11px] font-semibold text-[var(--muted)]">
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 px-3 whitespace-nowrap">Horário</th>
                      <th className="py-2 px-3 whitespace-nowrap">Duração</th>
                      <th className="py-2 px-3">Matéria / Assunto</th>
                      <th className="py-2 px-3 hidden sm:table-cell">Origem</th>
                      <th className="py-2 pl-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] text-[12.5px]">
                    {windowBlocks.slice(0, 80).map((block) => (
                      <tr key={block.id} className="hover:bg-[var(--panel-soft)] transition-colors">
                        <td className="py-2 pr-3 font-mono-num tabular-nums text-[var(--text)] whitespace-nowrap">
                          {formatIsoFullBr(block.date)}
                        </td>
                        <td className="py-2 px-3 font-mono-num font-bold tabular-nums text-[var(--accent)] whitespace-nowrap">
                          {block.startClock} → {block.endClock}
                        </td>
                        <td className="py-2 px-3 font-mono-num tabular-nums text-[var(--text)] whitespace-nowrap">
                          {formatClock(block.durationSeconds)}
                        </td>
                        <td className="py-2 px-3 max-w-[280px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{
                                backgroundColor: getSubjectColor(block.subject, orderedSubjects),
                              }}
                            />
                            <span className="font-semibold text-[var(--text)] truncate">
                              {visibleName(block.subject)}
                            </span>
                            {block.topicLabel && (
                              <span className="text-[11.5px] text-[var(--muted)] truncate">
                                · {block.topicLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 hidden sm:table-cell text-[11.5px] text-[var(--muted)] whitespace-nowrap">
                          {SOURCE_LABELS[block.source]}
                        </td>
                        <td className="py-2 pl-3 text-right whitespace-nowrap">
                          {block.isLive ? (
                            <span className="text-[11px] font-bold text-[var(--accent)]">
                              Em curso
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDeleteInterval(block.id)}
                              title="Remover registro de horário"
                              className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Panel>
      );
    },
  );
